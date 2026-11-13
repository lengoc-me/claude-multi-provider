#!/usr/bin/env node
/**
 * Official MCP stdio server for `claude-multi-provider`.
 * Supports both newline-delimited JSON-RPC (MCP 2024-11-05 / 2025-03-26) and Content-Length framing.
 */
import { loadConfig } from "./core/config-store.mjs";
import { startDashboardServer } from "./core/dashboard-server.mjs";
import { startGatewayServer } from "./core/gateway-server.mjs";
import { McpDispatcher } from "./core/mcp-dispatcher.mjs";

let activeDashboard = null;
let activeGateway = null;
let dispatcher = null;

async function ensureDashboard() {
  if (activeDashboard) return activeDashboard;
  const cfg = loadConfig();
  const preferredPort = Number(cfg.dashboardPort) || 18320;
  const startWithPort = (p) =>
    startDashboardServer({
      host: "127.0.0.1",
      port: p,
      mcpDispatcher: dispatcher,
      getGatewayInfo: () => ({
        running: Boolean(activeGateway),
        url: activeGateway ? activeGateway.url : ""
      })
    });
  try {
    activeDashboard = await startWithPort(preferredPort);
  } catch (err) {
    if (err && err.code === "EADDRINUSE") {
      activeDashboard = await startWithPort(0);
    } else {
      throw err;
    }
  }
  return activeDashboard;
}

async function ensureGateway() {
  if (activeGateway) return activeGateway;
  const cfg = loadConfig();
  const preferredPort = Number(cfg.gatewayPort) || 18329;
  try {
    activeGateway = await startGatewayServer({ host: "127.0.0.1", port: preferredPort });
  } catch (err) {
    if (err && err.code === "EADDRINUSE") {
      return {
        running: true,
        url: `http://127.0.0.1:${preferredPort}`,
        shared: true
      };
    }
    throw err;
  }
  return {
    running: true,
    url: activeGateway.url
  };
}

dispatcher = new McpDispatcher({
  ensureDashboard,
  ensureGateway,
  getGatewayStatus: () => ({
    running: Boolean(activeGateway),
    url: activeGateway ? activeGateway.url : ""
  })
});

let rawBuffer = Buffer.alloc(0);
let useContentLengthFraming = false;

function sendStdioResponse(obj) {
  if (!obj) return;
  const json = JSON.stringify(obj);
  if (useContentLengthFraming) {
    const byteLen = Buffer.byteLength(json, "utf8");
    process.stdout.write(`Content-Length: ${byteLen}\r\n\r\n${json}`);
  } else {
    process.stdout.write(`${json}\n`);
  }
}

async function dispatchJsonString(lineStr) {
  const trimmed = lineStr.trim();
  if (!trimmed) return;
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    sendStdioResponse({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" }
    });
    return;
  }

  if (Array.isArray(parsed)) {
    const responses = [];
    for (const item of parsed) {
      const r = await dispatcher.handleMessage(item);
      if (r !== null) responses.push(r);
    }
    if (responses.length > 0) {
      sendStdioResponse(responses);
    }
  } else {
    const res = await dispatcher.handleMessage(parsed);
    if (res !== null) {
      sendStdioResponse(res);
    }
  }
}

async function drainBuffer() {
  while (rawBuffer.length > 0) {
    const preview = rawBuffer.subarray(0, Math.min(rawBuffer.length, 64)).toString("utf8");
    if (/^Content-Length:/i.test(preview)) {
      useContentLengthFraming = true;
      const sepIdx = rawBuffer.indexOf("\r\n\r\n");
      const lfSepIdx = sepIdx < 0 ? rawBuffer.indexOf("\n\n") : -1;
      const headerEnd = sepIdx >= 0 ? sepIdx : lfSepIdx;
      const sepLen = sepIdx >= 0 ? 4 : 2;
      if (headerEnd < 0) return;

      const headerStr = rawBuffer.subarray(0, headerEnd).toString("utf8");
      const m = headerStr.match(/Content-Length:\s*(\d+)/i);
      if (!m) {
        rawBuffer = rawBuffer.subarray(headerEnd + sepLen);
        continue;
      }
      const bodyLen = Number(m[1]);
      const totalNeeded = headerEnd + sepLen + bodyLen;
      if (rawBuffer.length < totalNeeded) return;

      const bodyStr = rawBuffer.subarray(headerEnd + sepLen, totalNeeded).toString("utf8");
      rawBuffer = rawBuffer.subarray(totalNeeded);
      await dispatchJsonString(bodyStr);
    } else {
      const nlIdx = rawBuffer.indexOf(0x0a); // '\n'
      if (nlIdx < 0) return;
      const lineStr = rawBuffer.subarray(0, nlIdx).toString("utf8");
      rawBuffer = rawBuffer.subarray(nlIdx + 1);
      await dispatchJsonString(lineStr);
    }
  }
}

let processingQueue = Promise.resolve();
process.stdin.on("data", (chunk) => {
  rawBuffer = Buffer.concat([rawBuffer, chunk]);
  processingQueue = processingQueue.then(() => drainBuffer()).catch(() => {});
});

process.stdin.on("end", () => {
  process.exit(0);
});
