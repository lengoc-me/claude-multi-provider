import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { loadConfig, redactConfigForClient, saveConfig } from "./config-store.mjs";
import { callProviderModel, fetchProviderCatalog } from "./protocol-adapter.mjs";
import { buildSessionCookie, generateSessionToken, verifyLoopbackAuth } from "./security.mjs";
import { getTelemetryLogs, recordTelemetry } from "./gateway-server.mjs";
import { installClaudeDesktopMcpConfig, syncClaudeCliSettings } from "./cli-sync.mjs";
import { renderDashboardHtml } from "../ui/dashboard-html.mjs";

function readJsonBody(req, maxBytes = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (c) => {
      total += c.length;
      if (total > maxBytes) {
        req.destroy(new Error("Payload too large"));
        return reject(new Error("Payload too large"));
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Malformed JSON request body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const buf = Buffer.from(JSON.stringify(payload), "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Length": String(buf.length),
    ...extraHeaders
  });
  res.end(buf);
}

/**
 * Safely opens a local loopback URL in the OS default browser without shell interpolation.
 */
export function openUrlInBrowser(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (process.platform === "win32") {
      execFile("rundll32.exe", ["url.dll,FileProtocolHandler", parsed.toString()], { windowsHide: true }, () => {});
    } else if (process.platform === "darwin") {
      execFile("open", [parsed.toString()], () => {});
    } else {
      execFile("xdg-open", [parsed.toString()], () => {});
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetches `/v1/models` (+ `/v1beta/models`) across one or all enabled providers and updates config cache.
 */
export async function refreshCatalogAndPersist(cfg, targetProviderId = "", configPath = undefined) {
  const providers = (cfg.providers || []).filter(
    p => p && p.baseUrl && (targetProviderId ? p.id === targetProviderId : p.enabled !== false)
  );
  if (providers.length === 0) {
    throw new Error("No enabled providers with a valid Base URL to fetch from.");
  }

  let retainedCatalog = (cfg.cachedCatalogModels || []).filter(
    m => !providers.some(p => p.id === m.providerId)
  );

  let fetchedCount = 0;
  const freshLookup = new Map();
  const errors = [];

  for (const prov of providers) {
    try {
      const { models } = await fetchProviderCatalog(prov);
      fetchedCount += models.length;
      retainedCatalog = retainedCatalog.concat(models);
      for (const m of models) {
        freshLookup.set(`${prov.id}::${m.id.toLowerCase()}`, m);
      }
    } catch (err) {
      errors.push(err.message);
    }
  }

  if (fetchedCount === 0 && errors.length > 0) {
    throw new Error(errors.join("; "));
  }

  // Update contextWindow / autoCompactLimit on customModels when upstream authoritative values changed
  const updatedCustomModels = (cfg.customModels || []).map(cm => {
    const fresh = freshLookup.get(`${cm.providerId}::${cm.id.toLowerCase()}`);
    if (!fresh) return cm;
    const prevCtx = Number(cm.contextWindow) || 0;
    const prevCompact = Number(cm.autoCompactLimit) || 0;
    const wasDefaultRatio = prevCompact === Math.round(prevCtx * 0.9);
    const nextCtx = fresh.contextWindow || prevCtx;
    return {
      ...cm,
      contextWindow: nextCtx,
      autoCompactLimit: wasDefaultRatio ? Math.round(nextCtx * 0.9) : prevCompact,
      maxOutputTokens: fresh.maxOutputTokens || cm.maxOutputTokens
    };
  });

  const saved = saveConfig(
    {
      ...cfg,
      customModels: updatedCustomModels,
      cachedCatalogModels: retainedCatalog
    },
    configPath
  );

  return {
    saved,
    fetchedCount,
    warnings: errors
  };
}

/**
 * Starts the authenticated Settings Web Dashboard + Streamable HTTP `/mcp` server.
 */
export async function startDashboardServer({
  host = "127.0.0.1",
  port = undefined,
  sessionToken = generateSessionToken(),
  configPath = undefined,
  settingsPath = undefined,
  desktopConfigPath = undefined,
  mcpDispatcher = null,
  getGatewayInfo = () => ({ running: false, url: "" })
} = {}) {
  const bootTime = Date.now();
  const initialCfg = loadConfig(configPath);
  const targetPort = port !== undefined ? Number(port) : Number(initialCfg.dashboardPort || 18320);

  const buildClientState = () => {
    const cfg = loadConfig(configPath);
    const gw = getGatewayInfo();
    return {
      ok: true,
      config: redactConfigForClient(cfg),
      gatewayRunning: Boolean(gw?.running),
      gatewayUrl: gw?.url || `http://127.0.0.1:${cfg.gatewayPort || 18329}`,
      logs: getTelemetryLogs()
    };
  };

  const server = http.createServer(async (req, res) => {
    const actualPort = server.address()?.port || targetPort;
    try {
      const reqUrl = req.url || "/";
      const pathname = reqUrl.split("?")[0];

      // Public non-sensitive health endpoint
      if (pathname === "/health" && req.method === "GET") {
        const cfg = loadConfig(configPath);
        return sendJson(res, 200, {
          ok: true,
          service: "claude-multi-provider-dashboard",
          version: "1.0.0",
          uptimeSec: Math.round((Date.now() - bootTime) / 1000),
          rssMb: Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10,
          providersConfigured: cfg.providers.length,
          enabledModels: cfg.customModels.filter(m => m.enabled !== false).length
        });
      }

      // Serve paper-sketch brand SVG & PNG favicons so browsers report 0 network 404s
      if (pathname === "/favicon.svg" && req.method === "GET") {
        const svgPath = path.resolve(import.meta.dirname, "..", "..", "assets", "icon.svg");
        if (fs.existsSync(svgPath)) {
          const svgBuf = fs.readFileSync(svgPath);
          res.writeHead(200, {
            "Content-Type": "image/svg+xml; charset=utf-8",
            "Cache-Control": "public, max-age=86400",
            "Content-Length": String(svgBuf.length)
          });
          return res.end(svgBuf);
        }
      }

      if ((pathname === "/favicon.ico" || pathname === "/favicon.png") && req.method === "GET") {
        const iconPath = path.resolve(import.meta.dirname, "..", "..", ".claude-plugin", "icon.png");
        if (fs.existsSync(iconPath)) {
          const iconBuf = fs.readFileSync(iconPath);
          res.writeHead(200, {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=86400",
            "Content-Length": String(iconBuf.length)
          });
          return res.end(iconBuf);
        }
        res.writeHead(204);
        return res.end();
      }

      // Main HTML Dashboard UI (accepts ?token=... or session cookie)
      if ((pathname === "/" || pathname === "/admin") && req.method === "GET") {
        const auth = verifyLoopbackAuth(req, sessionToken, { port: actualPort, allowQueryToken: true });
        if (!auth.ok) {
          return sendJson(res, auth.status, { ok: false, error: auth.reason });
        }
        const cfg = loadConfig(configPath);
        const html = renderDashboardHtml({
          csrfToken: sessionToken,
          gatewayPort: cfg.gatewayPort || 18329
        });
        const buf = Buffer.from(html, "utf8");
        const headers = {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Frame-Options": "DENY",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
          "Content-Length": String(buf.length)
        };
        if (auth.usedQueryToken) {
          headers["Set-Cookie"] = buildSessionCookie(sessionToken);
        }
        res.writeHead(200, headers);
        return res.end(buf);
      }

      // Streamable HTTP MCP Endpoint (`/mcp` JSON-RPC + SSE)
      if (pathname === "/mcp") {
        const auth = verifyLoopbackAuth(req, sessionToken, { port: actualPort, allowQueryToken: false });
        if (!auth.ok) {
          return sendJson(res, auth.status, {
            jsonrpc: "2.0",
            id: null,
            error: { code: -32001, message: auth.reason }
          });
        }
        if (!mcpDispatcher) {
          return sendJson(res, 503, {
            jsonrpc: "2.0",
            id: null,
            error: { code: -32603, message: "MCP dispatcher not attached" }
          });
        }
        if (req.method === "GET") {
          res.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            Connection: "keep-alive"
          });
          res.write(`event: endpoint\ndata: /mcp\n\n`);
          req.on("close", () => res.end());
          return;
        }
        if (req.method === "POST") {
          const rpcReq = await readJsonBody(req);
          const acceptSse = String(req.headers.accept || "").includes("text/event-stream");
          const rpcRes = await mcpDispatcher.handleMessage(rpcReq);
          if (rpcRes === null) {
            res.writeHead(202);
            return res.end();
          }
          if (acceptSse) {
            res.writeHead(200, {
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-cache"
            });
            res.write(`event: message\ndata: ${JSON.stringify(rpcRes)}\n\n`);
            return res.end();
          }
          return sendJson(res, 200, rpcRes);
        }
        return sendJson(res, 405, { ok: false, error: "Method not allowed" });
      }

      // All `/api/*` endpoints strictly require loopback token/cookie auth
      if (pathname.startsWith("/api/")) {
        const auth = verifyLoopbackAuth(req, sessionToken, { port: actualPort, allowQueryToken: false });
        if (!auth.ok) {
          return sendJson(res, auth.status, { ok: false, error: auth.reason });
        }

        if (pathname === "/api/state" && req.method === "GET") {
          return sendJson(res, 200, buildClientState());
        }

        if (pathname === "/api/save" && req.method === "POST") {
          const body = await readJsonBody(req);
          if (body.providers !== undefined && !Array.isArray(body.providers)) {
            return sendJson(res, 400, { ok: false, error: "`providers` must be an array" });
          }
          if (Array.isArray(body.providers)) {
            for (const p of body.providers) {
              if (!p || !String(p.baseUrl || "").trim()) {
                return sendJson(res, 400, { ok: false, error: "Each provider must have a non-empty Base URL" });
              }
              try {
                const u = new URL(String(p.baseUrl).trim());
                if (u.protocol !== "http:" && u.protocol !== "https:") {
                  return sendJson(res, 400, { ok: false, error: "Provider Base URL must use http:// or https://" });
                }
              } catch {
                return sendJson(res, 400, { ok: false, error: `Invalid Provider Base URL: ${p.baseUrl}` });
              }
            }
          }
          saveConfig(body, configPath);
          return sendJson(res, 200, buildClientState());
        }

        if (pathname === "/api/fetch-models" && req.method === "POST") {
          const body = await readJsonBody(req);
          const cfg = loadConfig(configPath);
          const out = await refreshCatalogAndPersist(cfg, String(body?.providerId || ""), configPath);
          return sendJson(res, 200, {
            ...buildClientState(),
            fetchedCount: out.fetchedCount,
            warnings: out.warnings
          });
        }

        if (pathname === "/api/test-model" && req.method === "POST") {
          const body = await readJsonBody(req);
          const model = String(body?.model || "").trim();
          if (!model) {
            return sendJson(res, 400, { ok: false, error: "`model` is required" });
          }
          const cfg = loadConfig(configPath);
          const resCall = await callProviderModel(cfg, {
            model,
            providerId: String(body?.providerId || ""),
            prompt: "Reply in one short sentence confirming you are online.",
            maxTokens: 96,
            timeoutMs: 25000
          });
          recordTelemetry({
            model: resCall.model,
            provider: resCall.providerName,
            protocol: resCall.protocol,
            surface: "dashboard-test",
            status: resCall.status,
            latencyMs: resCall.latencyMs
          });
          if (!resCall.ok) {
            return sendJson(res, 502, { ok: false, error: resCall.error, latencyMs: resCall.latencyMs });
          }
          return sendJson(res, 200, {
            ok: true,
            model: resCall.model,
            providerName: resCall.providerName,
            latencyMs: resCall.latencyMs,
            reply: resCall.text || "(200 OK)"
          });
        }

        if (pathname === "/api/sync-cli" && req.method === "POST") {
          const cfg = loadConfig(configPath);
          const syncOut = syncClaudeCliSettings(cfg, settingsPath);
          return sendJson(res, 200, syncOut);
        }

        if (pathname === "/api/install-desktop" && req.method === "POST") {
          const instOut = installClaudeDesktopMcpConfig({ explicitConfigPath: desktopConfigPath });
          return sendJson(res, 200, instOut);
        }

        return sendJson(res, 404, { ok: false, error: `Unknown API route: ${pathname}` });
      }

      return sendJson(res, 404, { ok: false, error: "Not found" });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message || String(err) });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(targetPort, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const boundPort = server.address().port;
  const baseUrl = `http://${host}:${boundPort}`;
  return {
    server,
    host,
    port: boundPort,
    sessionToken,
    baseUrl,
    authenticatedUrl: `${baseUrl}/?token=${sessionToken}`,
    close: () => new Promise((resolve) => server.close(() => resolve()))
  };
}
