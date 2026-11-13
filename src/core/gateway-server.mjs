import http from "node:http";
import https from "node:https";
import { buildUpstreamUrl } from "./catalog-spec.mjs";
import { loadConfig, resolveModelTarget } from "./config-store.mjs";
import {
  anthropicToOpenAiPayload,
  cacheDetectedProtocol,
  openAiToAnthropicResponse,
  pipeOpenAiSseToAnthropicSse,
  prepareAnthropicUpstreamPayload,
  selectInitialProtocol
} from "./protocol-adapter.mjs";

const MAX_TELEMETRY_ENTRIES = 100;
const telemetryLogs = [];

export function recordTelemetry(entry) {
  telemetryLogs.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    time: new Date().toISOString(),
    model: String(entry.model || "unknown"),
    provider: String(entry.provider || "unknown"),
    protocol: String(entry.protocol || "auto"),
    surface: String(entry.surface || "gateway"),
    status: Number(entry.status) || 200,
    latencyMs: Number(entry.latencyMs) || 0
  });
  if (telemetryLogs.length > MAX_TELEMETRY_ENTRIES) {
    telemetryLogs.length = MAX_TELEMETRY_ENTRIES;
  }
}

export function getTelemetryLogs() {
  return telemetryLogs.slice();
}

function readRawBody(req, maxBytes = 32 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy(new Error("Request payload too large"));
        return reject(new Error("Request payload too large"));
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res, status, obj) {
  const buf = Buffer.from(JSON.stringify(obj), "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(buf.length)
  });
  res.end(buf);
}

function forwardRawHttp(targetUrl, method, headers, bodyBuf, clientRes, normalizeModelId = "", intercept404 = false) {
  return new Promise((resolve) => {
    let u;
    try {
      u = new URL(targetUrl);
    } catch (err) {
      if (!clientRes.headersSent) {
        sendJson(clientRes, 502, { type: "error", error: { type: "api_error", message: err.message } });
      }
      return resolve({ status: 502 });
    }

    const mod = u.protocol === "https:" ? https : http;
    const outHeaders = { ...headers, host: u.host };
    delete outHeaders["content-length"];
    if (bodyBuf && bodyBuf.length > 0) {
      outHeaders["content-length"] = String(bodyBuf.length);
    }

    const upReq = mod.request(u, { method, headers: outHeaders }, (upRes) => {
      const status = upRes.statusCode || 200;
      if (intercept404 && (status === 404 || status === 405 || status === 501)) {
        upRes.resume();
        return resolve({ status, interceptedFallback: true });
      }
      const resHeaders = { ...upRes.headers };
      const isSse = String(upRes.headers["content-type"] || "").includes("text/event-stream");

      if (isSse && normalizeModelId) {
        delete resHeaders["content-length"];
        clientRes.writeHead(status, resHeaders);
        upRes.on("data", (chunk) => {
          try {
            const text = chunk.toString("utf8");
            if (text.includes('"message_start"')) {
              const normalized = text.replace(/"model"\s*:\s*"([^"]+)"/g, (m, p1) => {
                if (p1 === `devin/${normalizeModelId}` || p1.endsWith(`/${normalizeModelId}`)) {
                  return `"model":"${normalizeModelId}"`;
                }
                return m;
              });
              clientRes.write(Buffer.from(normalized, "utf8"));
              return;
            }
          } catch {
            // Write chunk as-is
          }
          clientRes.write(chunk);
        });
        upRes.on("end", () => {
          clientRes.end();
          resolve({ status });
        });
      } else {
        clientRes.writeHead(status, resHeaders);
        upRes.pipe(clientRes);
        upRes.on("end", () => resolve({ status }));
      }
    });

    upReq.on("error", (err) => {
      if (!clientRes.headersSent) {
        sendJson(clientRes, 502, {
          type: "error",
          error: { type: "api_error", message: `Upstream gateway error: ${err.message}` }
        });
      } else {
        clientRes.end();
      }
      resolve({ status: 502 });
    });

    if (bodyBuf && bodyBuf.length > 0) {
      upReq.write(bodyBuf);
    }
    upReq.end();
  });
}

function executeOpenAiGatewayCall(provider, anthBody, targetModel, modelMeta, clientRes) {
  return new Promise((resolve) => {
    const urlStr = buildUpstreamUrl(provider.baseUrl, "/v1/chat/completions");
    let u;
    try {
      u = new URL(urlStr);
    } catch (err) {
      sendJson(clientRes, 502, { type: "error", error: { type: "api_error", message: err.message } });
      return resolve({ status: 502 });
    }

    const isStream = Boolean(anthBody?.stream);
    const oaiPayload = anthropicToOpenAiPayload(anthBody, targetModel, modelMeta, { includeReasoningEffort: true });
    const bodyBuf = Buffer.from(JSON.stringify(oaiPayload), "utf8");
    const mod = u.protocol === "https:" ? https : http;

    const headers = {
      "Content-Type": "application/json",
      Accept: isStream ? "text/event-stream" : "application/json",
      "Content-Length": String(bodyBuf.length)
    };
    if (provider.apiKey) {
      headers.Authorization = `Bearer ${provider.apiKey}`;
      headers["x-api-key"] = provider.apiKey;
    }

    const upReq = mod.request(u, { method: "POST", headers }, async (upRes) => {
      const status = upRes.statusCode || 200;
      if (isStream && status >= 200 && status < 300) {
        await pipeOpenAiSseToAnthropicSse(upRes, clientRes, targetModel);
        return resolve({ status: 200 });
      }

      const chunks = [];
      upRes.on("data", c => chunks.push(c));
      upRes.on("end", () => {
        const rawText = Buffer.concat(chunks).toString("utf8");
        let parsed = null;
        try {
          parsed = JSON.parse(rawText);
        } catch {
          parsed = null;
        }
        if (status >= 200 && status < 300 && parsed) {
          const anthMsg = openAiToAnthropicResponse(parsed, targetModel);
          sendJson(clientRes, 200, anthMsg);
          return resolve({ status: 200 });
        }
        const errMessage = parsed?.error?.message || rawText.slice(0, 400) || `Upstream returned HTTP ${status}`;
        sendJson(clientRes, status || 502, {
          type: "error",
          error: { type: "api_error", message: errMessage }
        });
        resolve({ status: status || 502 });
      });
    });

    upReq.on("error", (err) => {
      if (!clientRes.headersSent) {
        sendJson(clientRes, 502, {
          type: "error",
          error: { type: "api_error", message: `OpenAI upstream connection failed: ${err.message}` }
        });
      } else {
        clientRes.end();
      }
      resolve({ status: 502 });
    });

    upReq.write(bodyBuf);
    upReq.end();
  });
}

/**
 * Starts the loopback Anthropic-compatible Multi-Provider Gateway server.
 */
export async function startGatewayServer({
  host = "127.0.0.1",
  port = undefined,
  configPath = undefined
} = {}) {
  const bootTime = Date.now();
  const initialCfg = loadConfig(configPath);
  const targetPort = port !== undefined ? Number(port) : Number(initialCfg.gatewayPort || 18329);

  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = req.url || "/";
      const pathname = reqUrl.split("?")[0];

      if (pathname === "/health" && req.method === "GET") {
        const cfg = loadConfig(configPath);
        return sendJson(res, 200, {
          ok: true,
          service: "claude-multi-provider-gateway",
          host,
          port: server.address()?.port || targetPort,
          uptimeSec: Math.round((Date.now() - bootTime) / 1000),
          rssMb: Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10,
          providersCount: cfg.providers.filter(p => p.enabled !== false).length,
          enabledModelsCount: cfg.customModels.filter(m => m.enabled !== false).length
        });
      }

      if (pathname === "/v1/models" && req.method === "GET") {
        const cfg = loadConfig(configPath);
        const activeModels = cfg.customModels.filter(m => m.enabled !== false);
        const listSource = activeModels.length > 0 ? activeModels : cfg.cachedCatalogModels;
        return sendJson(res, 200, {
          object: "list",
          data: listSource.map(m => ({
            id: m.id,
            object: "model",
            created: 1735689600,
            owned_by: m.providerName || "custom-provider",
            display_name: m.name || m.id,
            context_window: m.contextWindow,
            auto_compact_limit: m.autoCompactLimit
          }))
        });
      }

      const bodyBuf = (req.method === "POST" || req.method === "PUT" || req.method === "PATCH")
        ? await readRawBody(req)
        : null;

      if (pathname === "/v1/messages" && req.method === "POST" && bodyBuf) {
        let bodyObj;
        try {
          bodyObj = JSON.parse(bodyBuf.toString("utf8"));
        } catch {
          return sendJson(res, 400, {
            type: "error",
            error: { type: "invalid_request_error", message: "Invalid JSON body in /v1/messages" }
          });
        }

        const cfg = loadConfig(configPath);
        const requestedModel = String(bodyObj?.model || "").replace(/\[(1|2)m\]$/i, "").trim();
        const isNativeClaude = /^claude-(opus|sonnet|haiku|3|4|5)/i.test(requestedModel);
        const explicitCustom = cfg.customModels.find(
          m => m.enabled !== false && m.id.toLowerCase() === requestedModel.toLowerCase()
        );

        // Route to external provider if explicitly in customModels or if not a built-in Anthropic model
        if (explicitCustom || !isNativeClaude) {
          let resolved;
          try {
            resolved = resolveModelTarget(cfg, requestedModel);
          } catch (err) {
            return sendJson(res, 400, {
              type: "error",
              error: { type: "invalid_request_error", message: err.message }
            });
          }

          const { modelId, provider, modelMeta } = resolved;
          let proto = selectInitialProtocol(provider);
          const t0 = Date.now();
          let resultStatus = 200;

          if (proto === "openai") {
            const out = await executeOpenAiGatewayCall(provider, bodyObj, modelId, modelMeta, res);
            resultStatus = out.status;
          } else {
            const anthUpstreamUrl = buildUpstreamUrl(provider.baseUrl, "/v1/messages");
            const prepared = prepareAnthropicUpstreamPayload(bodyObj, modelId, modelMeta);
            const outBuf = Buffer.from(JSON.stringify(prepared), "utf8");
            const upHeaders = {
              "content-type": "application/json",
              accept: req.headers.accept || (bodyObj?.stream ? "text/event-stream" : "application/json"),
              "anthropic-version": req.headers["anthropic-version"] || "2023-06-01"
            };
            if (req.headers["anthropic-beta"]) {
              upHeaders["anthropic-beta"] = req.headers["anthropic-beta"];
            }
            if (provider.apiKey) {
              upHeaders.authorization = `Bearer ${provider.apiKey}`;
              upHeaders["x-api-key"] = provider.apiKey;
            }
            const canAutoFallback = provider.protocol === "auto";
            const out = await forwardRawHttp(anthUpstreamUrl, "POST", upHeaders, outBuf, res, modelId, canAutoFallback);
            if (out.interceptedFallback) {
              proto = "openai";
              cacheDetectedProtocol(provider.baseUrl, "openai");
              const fb = await executeOpenAiGatewayCall(provider, bodyObj, modelId, modelMeta, res);
              resultStatus = fb.status;
            } else {
              if (canAutoFallback && out.status >= 200 && out.status < 300) {
                cacheDetectedProtocol(provider.baseUrl, "anthropic");
              }
              resultStatus = out.status;
            }
          }

          recordTelemetry({
            model: modelId,
            provider: provider.name,
            protocol: proto,
            surface: "gateway",
            status: resultStatus,
            latencyMs: Date.now() - t0
          });
          return;
        }

        // Built-in Anthropic passthrough
        const t0 = Date.now();
        const anthBase = process.env.CMP_ANTHROPIC_PASSTHROUGH_URL || "https://api.anthropic.com";
        const out = await forwardRawHttp(`${anthBase.replace(/\/+$/, "")}${reqUrl}`, "POST", req.headers, bodyBuf, res);
        recordTelemetry({
          model: requestedModel || "claude",
          provider: "Anthropic Official",
          protocol: "anthropic",
          surface: "passthrough",
          status: out.status,
          latencyMs: Date.now() - t0
        });
        return;
      }

      return sendJson(res, 404, {
        type: "error",
        error: { type: "not_found_error", message: `Unknown gateway route: ${req.method} ${pathname}` }
      });
    } catch (err) {
      if (!res.headersSent) {
        sendJson(res, 500, {
          type: "error",
          error: { type: "api_error", message: err.message }
        });
      } else {
        res.end();
      }
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(targetPort, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const actualPort = server.address().port;
  return {
    server,
    host,
    port: actualPort,
    url: `http://${host}:${actualPort}`,
    close: () => new Promise((resolve) => server.close(() => resolve()))
  };
}
