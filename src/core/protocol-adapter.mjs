import http from "node:http";
import https from "node:https";
import crypto from "node:crypto";
import { buildUpstreamUrl, mergeFetchedModels } from "./catalog-spec.mjs";
import { resolveModelTarget } from "./config-store.mjs";

// In-memory cache of auto-detected protocol per provider baseUrl ("openai" | "anthropic")
const detectedProtocolCache = new Map();

export function cacheDetectedProtocol(baseUrl, protocol) {
  if (!baseUrl) return;
  if (protocol === "openai" || protocol === "anthropic") {
    detectedProtocolCache.set(String(baseUrl).toLowerCase(), protocol);
  }
}

/**
 * Low-level HTTP/HTTPS JSON request helper using Node built-in modules.
 */
export function httpRequestJson(targetUrl, { method = "GET", headers = {}, body = null, timeoutMs = 45000 } = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(targetUrl);
    } catch (err) {
      return reject(new Error(`Invalid upstream URL "${targetUrl}": ${err.message}`));
    }
    const mod = u.protocol === "https:" ? https : http;
    const bodyBuf = body == null
      ? null
      : (Buffer.isBuffer(body) ? body : Buffer.from(typeof body === "string" ? body : JSON.stringify(body), "utf8"));

    const reqHeaders = { ...headers };
    if (bodyBuf && !reqHeaders["Content-Length"] && !reqHeaders["content-length"]) {
      reqHeaders["Content-Length"] = String(bodyBuf.length);
    }

    const req = mod.request(
      u,
      {
        method,
        headers: reqHeaders,
        timeout: timeoutMs
      },
      (res) => {
        const chunks = [];
        res.on("data", c => chunks.push(c));
        res.on("end", () => {
          const rawText = Buffer.concat(chunks).toString("utf8");
          let data = null;
          try {
            data = rawText ? JSON.parse(rawText) : null;
          } catch {
            data = null;
          }
          resolve({
            status: res.statusCode || 200,
            headers: res.headers,
            data,
            rawText
          });
        });
      }
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });

    if (bodyBuf && bodyBuf.length > 0) {
      req.write(bodyBuf);
    }
    req.end();
  });
}

function buildAuthHeaders(provider, extra = {}) {
  const headers = {
    Accept: "application/json",
    ...extra
  };
  const key = String(provider?.apiKey || "").trim();
  if (key) {
    headers.Authorization = `Bearer ${key}`;
    headers["x-api-key"] = key;
  }
  return headers;
}

function extractTextBlocks(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map(block => {
      if (typeof block === "string") return block;
      if (block?.type === "text" && typeof block.text === "string") return block.text;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Converts an Anthropic `/v1/messages` request payload into an OpenAI `/v1/chat/completions` payload.
 */
export function anthropicToOpenAiPayload(anthBody, targetModel, modelMeta = null, { includeReasoningEffort = true } = {}) {
  const outMessages = [];

  if (anthBody?.system) {
    const sysText = extractTextBlocks(anthBody.system).trim();
    if (sysText) {
      outMessages.push({ role: "system", content: sysText });
    }
  }

  const rawMsgs = Array.isArray(anthBody?.messages) ? anthBody.messages : [];
  for (const msg of rawMsgs) {
    if (!msg || !msg.role) continue;

    if (typeof msg.content === "string") {
      outMessages.push({ role: msg.role, content: msg.content });
      continue;
    }

    if (!Array.isArray(msg.content)) continue;

    if (msg.role === "assistant") {
      const textParts = [];
      const toolCalls = [];
      for (const block of msg.content) {
        if (!block) continue;
        if (block.type === "text" && typeof block.text === "string") {
          textParts.push(block.text);
        } else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id || `call_${crypto.randomBytes(6).toString("hex")}`,
            type: "function",
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input || {})
            }
          });
        }
      }
      const assistantMsg = {
        role: "assistant",
        content: textParts.length > 0 ? textParts.join("\n") : (toolCalls.length > 0 ? null : "")
      };
      if (toolCalls.length > 0) {
        assistantMsg.tool_calls = toolCalls;
      }
      outMessages.push(assistantMsg);
    } else {
      // User role: separate `tool_result` blocks into OpenAI `role: "tool"` messages, keep text/image in user content
      const userParts = [];
      for (const block of msg.content) {
        if (!block) continue;
        if (block.type === "tool_result") {
          const resultStr = typeof block.content === "string"
            ? block.content
            : extractTextBlocks(block.content) || JSON.stringify(block.content ?? "");
          outMessages.push({
            role: "tool",
            tool_call_id: block.tool_use_id || "call_unknown",
            content: resultStr
          });
        } else if (block.type === "text" && typeof block.text === "string") {
          userParts.push({ type: "text", text: block.text });
        } else if (block.type === "image" && block.source) {
          if (block.source.type === "base64" && block.source.data) {
            const mime = block.source.media_type || "image/png";
            userParts.push({
              type: "image_url",
              image_url: { url: `data:${mime};base64,${block.source.data}` }
            });
          } else if (block.source.type === "url" && block.source.url) {
            userParts.push({
              type: "image_url",
              image_url: { url: block.source.url }
            });
          }
        }
      }
      if (userParts.length === 1 && userParts[0].type === "text") {
        outMessages.push({ role: "user", content: userParts[0].text });
      } else if (userParts.length > 0) {
        outMessages.push({ role: "user", content: userParts });
      }
    }
  }

  const payload = {
    model: targetModel,
    messages: outMessages,
    stream: Boolean(anthBody?.stream)
  };

  if (payload.stream) {
    payload.stream_options = { include_usage: true };
  }

  if (Number(anthBody?.max_tokens) > 0) {
    payload.max_tokens = Number(anthBody.max_tokens);
  }
  if (typeof anthBody?.temperature === "number") {
    payload.temperature = anthBody.temperature;
  }
  if (typeof anthBody?.top_p === "number") {
    payload.top_p = anthBody.top_p;
  }
  if (Array.isArray(anthBody?.stop_sequences) && anthBody.stop_sequences.length > 0) {
    payload.stop = anthBody.stop_sequences;
  }

  // Map Anthropic effort / thinking to OpenAI reasoning_effort when explicitly requested
  if (includeReasoningEffort && modelMeta?.reasoningType !== "none") {
    const requestedEffort =
      anthBody?.output_config?.effort ||
      anthBody?.reasoning_effort ||
      (anthBody?.thinking?.type === "enabled" ? "high" : "");
    if (requestedEffort) {
      const mapEffort = { low: "low", medium: "medium", high: "high", xhigh: "high", max: "high" };
      if (mapEffort[requestedEffort]) {
        payload.reasoning_effort = mapEffort[requestedEffort];
      }
    }
  }

  if (Array.isArray(anthBody?.tools) && anthBody.tools.length > 0) {
    payload.tools = anthBody.tools.map(t => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description || "",
        parameters: t.input_schema || { type: "object", properties: {} }
      }
    }));
    if (anthBody.tool_choice) {
      if (anthBody.tool_choice.type === "any") payload.tool_choice = "required";
      else if (anthBody.tool_choice.type === "auto") payload.tool_choice = "auto";
      else if (anthBody.tool_choice.type === "none") payload.tool_choice = "none";
      else if (anthBody.tool_choice.type === "tool" && anthBody.tool_choice.name) {
        payload.tool_choice = { type: "function", function: { name: anthBody.tool_choice.name } };
      }
    }
  }

  return payload;
}

/**
 * Converts a non-streaming OpenAI Chat Completion JSON response into an Anthropic `/v1/messages` response.
 */
export function openAiToAnthropicResponse(openAiData, requestedModel) {
  const choice = Array.isArray(openAiData?.choices) ? openAiData.choices[0] : null;
  const msg = choice?.message || {};
  const contentBlocks = [];

  const reasoningText = msg.reasoning_content || msg.reasoning || "";
  if (typeof reasoningText === "string" && reasoningText.trim()) {
    contentBlocks.push({
      type: "thinking",
      thinking: reasoningText
    });
  }

  if (typeof msg.content === "string" && msg.content.length > 0) {
    contentBlocks.push({
      type: "text",
      text: msg.content
    });
  } else if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      if (part?.type === "text" && typeof part.text === "string") {
        contentBlocks.push({ type: "text", text: part.text });
      }
    }
  }

  const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
  for (const tc of toolCalls) {
    if (!tc?.function?.name) continue;
    let parsedInput = {};
    try {
      parsedInput = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
    } catch {
      parsedInput = { raw: String(tc.function.arguments || "") };
    }
    contentBlocks.push({
      type: "tool_use",
      id: tc.id || `toolu_${crypto.randomBytes(8).toString("hex")}`,
      name: tc.function.name,
      input: parsedInput
    });
  }

  if (contentBlocks.length === 0) {
    contentBlocks.push({ type: "text", text: "" });
  }

  let stopReason = "end_turn";
  if (choice?.finish_reason === "tool_calls" || toolCalls.length > 0) {
    stopReason = "tool_use";
  } else if (choice?.finish_reason === "length") {
    stopReason = "max_tokens";
  }

  return {
    id: openAiData?.id ? String(openAiData.id).replace(/^chatcmpl-/, "msg_") : `msg_${crypto.randomBytes(10).toString("hex")}`,
    type: "message",
    role: "assistant",
    model: requestedModel || openAiData?.model || "custom-model",
    content: contentBlocks,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: Number(openAiData?.usage?.prompt_tokens) || 0,
      output_tokens: Number(openAiData?.usage?.completion_tokens) || 0
    }
  };
}

/**
 * Sanitizes an Anthropic `/v1/messages` request for Anthropic-compatible proxy upstreams (e.g. CLIProxyAPI / LiteLLM).
 */
export function prepareAnthropicUpstreamPayload(bodyObj, targetModel, modelMeta = null) {
  if (!bodyObj || typeof bodyObj !== "object") return bodyObj;
  const payload = JSON.parse(JSON.stringify(bodyObj));
  payload.model = targetModel;

  if (modelMeta && Array.isArray(modelMeta.effortLevels)) {
    if (modelMeta.reasoningType === "none" || modelMeta.effortLevels.length === 0) {
      delete payload.thinking;
      if (payload.output_config) delete payload.output_config.effort;
    } else if (payload.output_config?.effort && !modelMeta.effortLevels.includes(payload.output_config.effort)) {
      payload.output_config.effort = modelMeta.effortLevels[modelMeta.effortLevels.length - 1] || "high";
    }
  }

  if (Array.isArray(payload.messages)) {
    for (const m of payload.messages) {
      if (m && typeof m === "object" && "name" in m) {
        delete m.name;
      }
    }
  }

  if (String(targetModel).toLowerCase().startsWith("devin/") && payload.system) {
    const sysText = extractTextBlocks(payload.system).trim();
    if (sysText && Array.isArray(payload.messages) && payload.messages.length > 0) {
      const sysBlock = { type: "text", text: `<system-instructions>\n${sysText}\n</system-instructions>` };
      const first = payload.messages[0];
      if (typeof first.content === "string") {
        first.content = [sysBlock, { type: "text", text: first.content }];
      } else if (Array.isArray(first.content)) {
        first.content = [sysBlock, ...first.content];
      }
      payload.system = "You are a helpful software engineering assistant. Follow all instructions inside <system-instructions>.";
    }
  }

  return payload;
}

/**
 * Determines effective upstream protocol ("openai" | "anthropic") for a provider.
 */
export function selectInitialProtocol(provider) {
  const configured = String(provider?.protocol || "auto").toLowerCase();
  if (configured === "openai" || configured === "anthropic") return configured;

  const base = String(provider?.baseUrl || "").toLowerCase();
  if (detectedProtocolCache.has(base)) {
    return detectedProtocolCache.get(base);
  }
  if (
    base.includes("openrouter.ai") ||
    base.includes("api.openai.com") ||
    base.includes("generativelanguage.googleapis.com") ||
    base.includes("api.deepseek.com") ||
    base.includes("api.groq.com") ||
    base.includes(":11434") ||
    base.includes(":1234") ||
    base.endsWith("/openai")
  ) {
    return "openai";
  }
  return "anthropic";
}

/**
 * Fetches `/v1/models` and optional `/v1beta/models` from a provider and returns normalized catalog items.
 */
export async function fetchProviderCatalog(provider, timeoutMs = 20000) {
  const headers = buildAuthHeaders(provider);
  const v1Url = buildUpstreamUrl(provider.baseUrl, "/v1/models");
  const betaUrl = buildUpstreamUrl(provider.baseUrl, "/v1beta/models");

  const [v1Res, betaRes] = await Promise.all([
    httpRequestJson(v1Url, { method: "GET", headers, timeoutMs }).catch(err => ({
      status: 0,
      data: null,
      error: err.message
    })),
    httpRequestJson(betaUrl, { method: "GET", headers, timeoutMs: 8000 }).catch(() => ({
      status: 0,
      data: null
    }))
  ]);

  if ((v1Res.status < 200 || v1Res.status >= 300) && (betaRes.status < 200 || betaRes.status >= 300)) {
    const errDetail = v1Res.data?.error?.message || v1Res.error || v1Res.rawText?.slice(0, 200) || `HTTP ${v1Res.status}`;
    throw new Error(`Failed to fetch models from ${provider.name || provider.baseUrl}: ${errDetail}`);
  }

  const models = mergeFetchedModels(v1Res.data, betaRes.data, provider);
  return {
    status: v1Res.status || betaRes.status || 200,
    models
  };
}

/**
 * Invokes an external model (non-streaming) for MCP tools (`mp_chat`, `mp_compare_models`, `testModel`).
 */
export async function callProviderModel(cfg, {
  model,
  providerId = "",
  messages = null,
  prompt = "",
  system = "",
  effort = "",
  maxTokens = 4096,
  temperature = undefined,
  timeoutMs = 90000
} = {}) {
  const { modelId, provider, modelMeta } = resolveModelTarget(cfg, model, providerId);
  const anthReq = {
    model: modelId,
    max_tokens: Number(maxTokens) > 0 ? Number(maxTokens) : 4096,
    messages: Array.isArray(messages) && messages.length > 0
      ? messages
      : [{ role: "user", content: String(prompt || "") }]
  };
  if (system) anthReq.system = String(system);
  if (typeof temperature === "number") anthReq.temperature = temperature;
  if (effort) anthReq.output_config = { effort: String(effort).toLowerCase() };

  const initialProto = selectInitialProtocol(provider);
  const t0 = Date.now();

  const tryOpenAi = async (includeEffort = true) => {
    const url = buildUpstreamUrl(provider.baseUrl, "/v1/chat/completions");
    const oaiPayload = anthropicToOpenAiPayload(anthReq, modelId, modelMeta, { includeReasoningEffort: includeEffort });
    const res = await httpRequestJson(url, {
      method: "POST",
      headers: buildAuthHeaders(provider, { "Content-Type": "application/json" }),
      body: oaiPayload,
      timeoutMs
    });
    if (res.status === 400 && includeEffort && oaiPayload.reasoning_effort) {
      return tryOpenAi(false);
    }
    return { res, protocolUsed: "openai" };
  };

  const tryAnthropic = async () => {
    const url = buildUpstreamUrl(provider.baseUrl, "/v1/messages");
    const anthPayload = prepareAnthropicUpstreamPayload(anthReq, modelId, modelMeta);
    const res = await httpRequestJson(url, {
      method: "POST",
      headers: buildAuthHeaders(provider, {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01"
      }),
      body: anthPayload,
      timeoutMs
    });
    return { res, protocolUsed: "anthropic" };
  };

  let outcome;
  if (initialProto === "openai") {
    outcome = await tryOpenAi(true);
    if ((outcome.res.status === 404 || outcome.res.status === 405) && provider.protocol === "auto") {
      outcome = await tryAnthropic();
    }
  } else {
    outcome = await tryAnthropic();
    if ((outcome.res.status === 404 || outcome.res.status === 405 || outcome.res.status === 501) && provider.protocol === "auto") {
      outcome = await tryOpenAi(true);
    }
  }

  const latencyMs = Date.now() - t0;
  const { res, protocolUsed } = outcome;

  if (res.status >= 200 && res.status < 300 && res.data) {
    if (provider.protocol === "auto") {
      detectedProtocolCache.set(provider.baseUrl.toLowerCase(), protocolUsed);
    }
    const normalized = protocolUsed === "openai"
      ? openAiToAnthropicResponse(res.data, modelId)
      : res.data;

    const textParts = [];
    const thinkingParts = [];
    for (const block of normalized.content || []) {
      if (block?.type === "text" && block.text) textParts.push(block.text);
      else if (block?.type === "thinking" && block.thinking) thinkingParts.push(block.thinking);
    }

    return {
      ok: true,
      status: res.status,
      model: modelId,
      providerId: provider.id,
      providerName: provider.name,
      protocol: protocolUsed,
      latencyMs,
      text: textParts.join("\n").trim(),
      thinking: thinkingParts.join("\n").trim(),
      usage: normalized.usage || { input_tokens: 0, output_tokens: 0 },
      message: normalized
    };
  }

  const errMsg =
    res.data?.error?.message ||
    (typeof res.data?.error === "string" ? res.data.error : "") ||
    res.rawText?.slice(0, 400) ||
    `Upstream returned HTTP ${res.status}`;

  return {
    ok: false,
    status: res.status || 502,
    model: modelId,
    providerId: provider.id,
    providerName: provider.name,
    protocol: protocolUsed,
    latencyMs,
    error: errMsg
  };
}

/**
 * Streams an OpenAI `/v1/chat/completions` SSE response into a spec-compliant Anthropic `/v1/messages` SSE response.
 */
export function pipeOpenAiSseToAnthropicSse(upstreamRes, clientRes, requestedModel) {
  return new Promise((resolve) => {
    const msgId = `msg_${crypto.randomBytes(10).toString("hex")}`;
    clientRes.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    });

    const writeSse = (event, dataObj) => {
      clientRes.write(`event: ${event}\ndata: ${JSON.stringify(dataObj)}\n\n`);
    };

    writeSse("message_start", {
      type: "message_start",
      message: {
        id: msgId,
        type: "message",
        role: "assistant",
        model: requestedModel,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 }
      }
    });

    let buffer = "";
    let activeBlockType = null; // "thinking" | "text" | "tool_use"
    let blockIndex = -1;
    let finishReason = "end_turn";
    let inputTokens = 0;
    let outputTokens = 0;
    const openToolIndices = new Map(); // oaiToolIdx -> anthropicBlockIdx
    let closed = false;

    const closeActiveBlock = () => {
      if (activeBlockType !== null && blockIndex >= 0) {
        writeSse("content_block_stop", { type: "content_block_stop", index: blockIndex });
        activeBlockType = null;
      }
    };

    const finalizeStream = () => {
      if (closed) return;
      closed = true;
      closeActiveBlock();
      for (const [, tIdx] of openToolIndices) {
        writeSse("content_block_stop", { type: "content_block_stop", index: tIdx });
      }
      openToolIndices.clear();
      if (blockIndex < 0) {
        blockIndex = 0;
        writeSse("content_block_start", {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" }
        });
        writeSse("content_block_stop", { type: "content_block_stop", index: 0 });
      }
      writeSse("message_delta", {
        type: "message_delta",
        delta: { stop_reason: finishReason, stop_sequence: null },
        usage: { output_tokens: outputTokens }
      });
      writeSse("message_stop", { type: "message_stop" });
      clientRes.end();
      resolve({ ok: true, inputTokens, outputTokens });
    };

    const handlePayloadLine = (jsonStr) => {
      if (jsonStr === "[DONE]") {
        finalizeStream();
        return;
      }
      let chunk;
      try {
        chunk = JSON.parse(jsonStr);
      } catch {
        return;
      }

      if (chunk.usage) {
        if (Number(chunk.usage.prompt_tokens) > 0) inputTokens = Number(chunk.usage.prompt_tokens);
        if (Number(chunk.usage.completion_tokens) > 0) outputTokens = Number(chunk.usage.completion_tokens);
      }

      const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : null;
      if (!choice) return;

      if (choice.finish_reason === "tool_calls") finishReason = "tool_use";
      else if (choice.finish_reason === "length") finishReason = "max_tokens";
      else if (choice.finish_reason === "stop") finishReason = "end_turn";

      const delta = choice.delta || {};
      const reasoningChunk = delta.reasoning_content || delta.reasoning || "";
      if (reasoningChunk) {
        if (activeBlockType !== "thinking") {
          closeActiveBlock();
          blockIndex += 1;
          activeBlockType = "thinking";
          writeSse("content_block_start", {
            type: "content_block_start",
            index: blockIndex,
            content_block: { type: "thinking", thinking: "" }
          });
        }
        writeSse("content_block_delta", {
          type: "content_block_delta",
          index: blockIndex,
          delta: { type: "thinking_delta", thinking: reasoningChunk }
        });
      }

      if (typeof delta.content === "string" && delta.content.length > 0) {
        if (activeBlockType !== "text") {
          closeActiveBlock();
          blockIndex += 1;
          activeBlockType = "text";
          writeSse("content_block_start", {
            type: "content_block_start",
            index: blockIndex,
            content_block: { type: "text", text: "" }
          });
        }
        outputTokens += 1;
        writeSse("content_block_delta", {
          type: "content_block_delta",
          index: blockIndex,
          delta: { type: "text_delta", text: delta.content }
        });
      }

      if (Array.isArray(delta.tool_calls)) {
        closeActiveBlock();
        finishReason = "tool_use";
        for (const tc of delta.tool_calls) {
          const tcIdx = tc.index ?? 0;
          let anthIdx = openToolIndices.get(tcIdx);
          if (anthIdx === undefined) {
            blockIndex += 1;
            anthIdx = blockIndex;
            openToolIndices.set(tcIdx, anthIdx);
            writeSse("content_block_start", {
              type: "content_block_start",
              index: anthIdx,
              content_block: {
                type: "tool_use",
                id: tc.id || `toolu_${crypto.randomBytes(6).toString("hex")}`,
                name: tc.function?.name || "tool",
                input: {}
              }
            });
          }
          if (tc.function?.arguments) {
            writeSse("content_block_delta", {
              type: "content_block_delta",
              index: anthIdx,
              delta: { type: "input_json_delta", partial_json: tc.function.arguments }
            });
          }
        }
      }
    };

    upstreamRes.on("data", (buf) => {
      buffer += buf.toString("utf8");
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data:")) {
          handlePayloadLine(trimmed.slice(5).trim());
        }
      }
    });

    upstreamRes.on("end", () => {
      if (buffer.trim().startsWith("data:")) {
        handlePayloadLine(buffer.trim().slice(5).trim());
      }
      finalizeStream();
    });

    upstreamRes.on("error", () => {
      finalizeStream();
    });
  });
}
