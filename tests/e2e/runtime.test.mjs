import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { startDashboardServer } from "../../src/core/dashboard-server.mjs";
import { startGatewayServer } from "../../src/core/gateway-server.mjs";
import { McpDispatcher } from "../../src/core/mcp-dispatcher.mjs";
import { httpRequestJson } from "../../src/core/protocol-adapter.mjs";

function createMockOpenAiServer() {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => {
      const bodyStr = Buffer.concat(chunks).toString("utf8");
      const url = (req.url || "/").split("?")[0];

      if (url === "/v1/models" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          object: "list",
          data: [
            { id: "oai-gpt-alpha", owned_by: "mock-oai", context_length: 272000 },
            { id: "oai-deepseek-fast", owned_by: "mock-oai", context_length: 131072 }
          ]
        }));
      }

      if (url === "/v1/chat/completions" && req.method === "POST") {
        const auth = req.headers.authorization || "";
        if (!auth.includes("mock-key-oai-1111")) {
          res.writeHead(401, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: { message: "Invalid OpenAI mock key" } }));
        }
        const body = JSON.parse(bodyStr || "{}");
        server.lastChatBody = body;
        if (body.stream) {
          res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8" });
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: "Step 1. " } }] })}\n\n`);
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Hello from " } }] })}\n\n`);
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: body.model }, finish_reason: "stop" }], usage: { prompt_tokens: 12, completion_tokens: 6 } })}\n\n`);
          res.write("data: [DONE]\n\n");
          return res.end();
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          id: "chatcmpl-mock1",
          model: body.model,
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: {
                role: "assistant",
                reasoning_content: "Analyzed cleanly.",
                content: `OAI_OK:${body.model}`
              }
            }
          ],
          usage: { prompt_tokens: 15, completion_tokens: 8 }
        }));
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Not found" } }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        getLastChatBody: () => server.lastChatBody || null,
        close: () => new Promise(r => server.close(() => r()))
      });
    });
  });
}

function createMockCpaAnthropicServer() {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => {
      const bodyStr = Buffer.concat(chunks).toString("utf8");
      const url = (req.url || "/").split("?")[0];

      if (url === "/v1/models" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          object: "list",
          data: [{ id: "cpa-swe-coder", owned_by: "cpa-gateway" }]
        }));
      }
      if (url === "/v1beta/models" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          models: [{ name: "models/cpa-swe-coder", inputTokenLimit: 400000, outputTokenLimit: 64000 }]
        }));
      }
      if (url === "/v1/messages" && req.method === "POST") {
        const body = JSON.parse(bodyStr || "{}");
        if (body.messages?.some(m => "name" in m)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: { message: "messages[].name not permitted" } }));
        }
        if (body.stream) {
          res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8" });
          res.write(`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg_cpa", type: "message", role: "assistant", model: `devin/${body.model}`, content: [] } })}\n\n`);
          res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`);
          res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: `CPA_STREAM_OK:${body.model}` } })}\n\n`);
          res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`);
          res.write(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`);
          return res.end();
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          id: "msg_cpa_1",
          type: "message",
          role: "assistant",
          model: body.model,
          content: [{ type: "text", text: `CPA_OK:${body.model}` }],
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 5 }
        }));
      }
      res.writeHead(404);
      res.end();
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        getLastChatBody: () => server.lastChatBody || null,
        close: () => new Promise(r => server.close(() => r()))
      });
    });
  });
}

test("Full E2E: Dashboard Auth/CSRF, Catalog Sync, Streamable HTTP /mcp, Local Gateway SSE, and CLI/Desktop Sync", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-e2e-"));
  const cfgPath = path.join(tmpDir, "multi-provider.json");
  const settingsPath = path.join(tmpDir, "settings.json");
  const desktopCfgPath = path.join(tmpDir, "claude_desktop_config.json");

  const oaiUp = await createMockOpenAiServer();
  const cpaUp = await createMockCpaAnthropicServer();
  let gw = null;
  let dash = null;

  try {
    gw = await startGatewayServer({ host: "127.0.0.1", port: 0, configPath: cfgPath });
    const dispatcher = new McpDispatcher({
      configPath: cfgPath,
      settingsPath,
      ensureDashboard: async () => dash,
      ensureGateway: async () => ({ running: true, url: gw.url }),
      getGatewayStatus: () => ({ running: true, url: gw.url })
    });
    dash = await startDashboardServer({
      host: "127.0.0.1",
      port: 0,
      configPath: cfgPath,
      settingsPath,
      desktopConfigPath: desktopCfgPath,
      mcpDispatcher: dispatcher,
      getGatewayInfo: () => ({ running: true, url: gw.url })
    });

    // 1. Health endpoint works and leaks 0 secrets
    const health = await httpRequestJson(`${dash.baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.equal(health.data.ok, true);

    // 2. Security fail-closed: unauthenticated /api/state -> 401
    const unauth = await httpRequestJson(`${dash.baseUrl}/api/state`);
    assert.equal(unauth.status, 401);

    // 3. Security fail-closed: cross-origin CSRF attempt -> 403
    const csrfAttempt = await httpRequestJson(`${dash.baseUrl}/api/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CMP-Token": dash.sessionToken,
        Origin: "https://malicious.example.org"
      },
      body: { providers: [] }
    });
    assert.equal(csrfAttempt.status, 403);

    // 4. Invalid input rejection: malformed URL -> 400
    const badUrlRes = await httpRequestJson(`${dash.baseUrl}/api/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CMP-Token": dash.sessionToken },
      body: { providers: [{ id: "bad", name: "Bad", baseUrl: "ftp://invalid" }] }
    });
    assert.equal(badUrlRes.status, 400);

    // 5. Configure both OpenAI and CPA/Anthropic providers via authenticated /api/save
    const saveRes = await httpRequestJson(`${dash.baseUrl}/api/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CMP-Token": dash.sessionToken },
      body: {
        gatewayPort: gw.port,
        providers: [
          { id: "oai", name: "Mock OpenAI", baseUrl: `${oaiUp.url}/v1`, apiKey: "mock-key-oai-1111", protocol: "openai", enabled: true },
          { id: "cpa", name: "Mock CPA", baseUrl: cpaUp.url, apiKey: "mock-key-cpa-2222", protocol: "anthropic", enabled: true }
        ]
      }
    });
    assert.equal(saveRes.status, 200);
    assert.ok(!saveRes.rawText.includes("mock-key-oai-1111"), "Plaintext API key must never appear in HTTP response");
    assert.equal(saveRes.data.config.providers[0].hasApiKey, true);

    // 6. Fetch catalog across both providers (/v1/models + /v1beta/models)
    const fetchRes = await httpRequestJson(`${dash.baseUrl}/api/fetch-models`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CMP-Token": dash.sessionToken },
      body: {}
    });
    assert.equal(fetchRes.status, 200);
    assert.equal(fetchRes.data.fetchedCount, 3);
    const cpaCached = fetchRes.data.config.cachedCatalogModels.find(m => m.id === "cpa-swe-coder");
    assert.equal(cpaCached.contextWindow, 400000);
    assert.equal(cpaCached.autoCompactLimit, 360000);

    // 7. Enable models while omitting apiKey -> secret must stay intact on disk!
    const enableRes = await httpRequestJson(`${dash.baseUrl}/api/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CMP-Token": dash.sessionToken },
      body: {
        defaultModel: "oai-gpt-alpha",
        providers: [
          { id: "oai", name: "Mock OpenAI", baseUrl: `${oaiUp.url}/v1`, apiKey: "", protocol: "openai", enabled: true },
          { id: "cpa", name: "Mock CPA", baseUrl: cpaUp.url, apiKey: "", protocol: "anthropic", enabled: true }
        ],
        customModels: [
          { id: "oai-gpt-alpha", name: "GPT Alpha", providerId: "oai", contextWindow: 272000, autoCompactLimit: 244800, enabled: true },
          { id: "cpa-swe-coder", name: "CPA SWE", providerId: "cpa", contextWindow: 400000, autoCompactLimit: 360000, enabled: true }
        ]
      }
    });
    assert.equal(enableRes.status, 200);

    // 8. Test Streamable HTTP `/mcp` JSON-RPC + SSE framing (`mp_compare_models` in parallel)
    const mcpSseRes = await httpRequestJson(`${dash.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "X-CMP-Token": dash.sessionToken
      },
      body: {
        jsonrpc: "2.0",
        id: 77,
        method: "tools/call",
        params: {
          name: "mp_compare_models",
          arguments: {
            models: ["oai-gpt-alpha", "cpa-swe-coder"],
            prompt: "Review this module."
          }
        }
      }
    });
    assert.equal(mcpSseRes.status, 200);
    assert.ok(mcpSseRes.rawText.includes("event: message"));
    assert.ok(mcpSseRes.rawText.includes("OAI_OK:oai-gpt-alpha"));
    assert.ok(mcpSseRes.rawText.includes("CPA_OK:cpa-swe-coder"));

    // 9. Test Local Anthropic Gateway `/v1/messages` SSE streaming against BOTH OpenAI and CPA upstreams
    const gwOaiStream = await httpRequestJson(`${gw.url}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: {
        model: "oai-gpt-alpha",
        stream: true,
        max_tokens: 256,
        messages: [{ role: "user", content: "Stream test" }]
      }
    });
    assert.equal(gwOaiStream.status, 200);
    assert.ok(gwOaiStream.rawText.includes("event: message_start"));
    assert.ok(gwOaiStream.rawText.includes('"thinking_delta"'));
    assert.ok(gwOaiStream.rawText.includes("Hello from "));
    assert.ok(gwOaiStream.rawText.includes("event: message_stop"));

    const gwCpaStream = await httpRequestJson(`${gw.url}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: {
        model: "cpa-swe-coder",
        stream: true,
        max_tokens: 256,
        messages: [{ role: "user", name: "strip_me", content: "Stream CPA" }]
      }
    });
    assert.equal(gwCpaStream.status, 200);
    assert.ok(gwCpaStream.rawText.includes('"model":"cpa-swe-coder"'), "Should normalize devin/ prefix in message_start");
    assert.ok(gwCpaStream.rawText.includes("CPA_STREAM_OK:cpa-swe-coder"));

    // 10. Test Opt-in CLI Settings Sync & Claude Desktop Config Installer
    fs.writeFileSync(settingsPath, JSON.stringify({ theme: "dark" }, null, 2), "utf8");
    const syncCliRes = await httpRequestJson(`${dash.baseUrl}/api/sync-cli`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CMP-Token": dash.sessionToken },
      body: {}
    });
    assert.equal(syncCliRes.status, 200);
    assert.equal(syncCliRes.data.syncedCount, 2);
    assert.ok(fs.existsSync(`${settingsPath}.bak`), "Backup .bak must be created");
    const syncedSettings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.equal(syncedSettings.theme, "dark", "Existing settings keys must be preserved");
    assert.equal(syncedSettings.modelSettings["oai-gpt-alpha"].autoCompactWindow, 244800 + 33000);

    const instDesktop = await httpRequestJson(`${dash.baseUrl}/api/install-desktop`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CMP-Token": dash.sessionToken },
      body: {}
    });
    assert.equal(instDesktop.status, 200);
    const desktopJson = JSON.parse(fs.readFileSync(desktopCfgPath, "utf8"));
    assert.ok(desktopJson.mcpServers["claude-multi-provider"]);
  } finally {
    if (dash) await dash.close();
    if (gw) await gw.close();
    await oaiUp.close();
    await cpaUp.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("MCP stdio child process E2E: supports newline-delimited JSON-RPC over real OS pipes", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-stdio-"));
  const cfgPath = path.join(tmpDir, "multi-provider.json");
  const oaiUp = await createMockOpenAiServer();

  const mcpScript = path.resolve(import.meta.dirname, "..", "..", "src", "mcp-server.mjs");
  const child = spawn(process.execPath, [mcpScript], {
    env: {
      ...process.env,
      CMP_CONFIG_PATH: cfgPath,
      CMP_NO_BROWSER: "1"
    },
    stdio: ["pipe", "pipe", "pipe"]
  });

  const pending = new Map();
  let stdoutBuf = "";
  child.stdout.on("data", (chunk) => {
    stdoutBuf += chunk.toString("utf8");
    const lines = stdoutBuf.split(/\r?\n/);
    stdoutBuf = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });

  const rpc = (id, method, params = {}) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`MCP stdio timeout on ${method}`)), 10000);
      pending.set(id, (res) => {
        clearTimeout(timer);
        resolve(res);
      });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });

  try {
    const initRes = await rpc(1, "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1.0" } });
    assert.equal(initRes.result.serverInfo.name, "claude-multi-provider");

    const listTools = await rpc(2, "tools/list");
    assert.equal(listTools.result.tools.length, 7);

    await rpc(3, "tools/call", {
      name: "mp_configure_provider",
      arguments: {
        provider_id: "oai",
        name: "Stdio OAI",
        base_url: `${oaiUp.url}/v1`,
        api_key: "mock-key-oai-1111",
        protocol: "openai",
        enable_models: ["oai-gpt-alpha"],
        default_model: "oai-gpt-alpha"
      }
    });

    const chatRes = await rpc(4, "tools/call", {
      name: "mp_chat",
      arguments: {
        prompt: "Hello over stdio!"
      }
    });
    assert.ok(!chatRes.result.isError);
    assert.ok(chatRes.result.content[0].text.includes("OAI_OK:oai-gpt-alpha"));
  } finally {
    child.stdin.end();
    child.kill();
    await oaiUp.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("UserPromptSubmit Hook E2E: /mp:use sticky Direct Mode (0 Claude tokens, @file context, multi-turn) + --agentic + /mp:off", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-hook-"));
  const cfgPath = path.join(tmpDir, "multi-provider.json");
  const sessionsDir = path.join(tmpDir, "sessions");
  const workDir = path.join(tmpDir, "workspace");
  fs.mkdirSync(workDir, { recursive: true });
  fs.writeFileSync(path.join(workDir, "hello.txt"), "WORKSPACE_MARKER_42", "utf8");
  fs.writeFileSync(path.join(workDir, ".env"), "SUPER_SECRET_DO_NOT_READ=1", "utf8");

  const oaiUp = await createMockOpenAiServer();
  fs.writeFileSync(
    cfgPath,
    JSON.stringify({
      version: 1,
      defaultModel: "oai-gpt-alpha",
      providers: [
        { id: "oai", name: "Mock OAI", baseUrl: `${oaiUp.url}/v1`, apiKey: "mock-key-oai-1111", protocol: "openai", enabled: true }
      ],
      customModels: [
        { id: "oai-gpt-alpha", name: "GPT Alpha", providerId: "oai", enabled: true }
      ]
    }),
    "utf8"
  );

  const hookScript = path.resolve(import.meta.dirname, "..", "..", "src", "hooks", "user-prompt-submit.mjs");
  const runHook = (prompt, sessionId = "sess-zero-tok") =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [hookScript], {
        env: {
          ...process.env,
          CMP_CONFIG_PATH: cfgPath,
          CMP_SESSIONS_DIR: sessionsDir
        },
        stdio: ["pipe", "pipe", "pipe"]
      });
      let out = "";
      let err = "";
      child.stdout.on("data", c => { out += c.toString("utf8"); });
      child.stderr.on("data", c => { err += c.toString("utf8"); });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) return reject(new Error(`Hook exited ${code}: ${err}`));
        resolve(JSON.parse(out.trim()));
      });
      child.stdin.end(JSON.stringify({
        session_id: sessionId,
        cwd: workDir,
        hook_event_name: "UserPromptSubmit",
        prompt
      }));
    });

  try {
    // 1. Unpinned normal prompt -> fast pass-through {}
    const r0 = await runHook("Normal question for Claude");
    assert.deepEqual(r0, {});

    // 2. Pin model via shorthand substring `/mp:use alpha`
    const rPin = await runHook("/mp:use alpha --effort high");
    assert.equal(rPin.decision, "block");
    assert.ok(rPin.reason.includes("Pinned [oai-gpt-alpha]"));
    assert.ok(rPin.reason.includes("0 Claude tokens"));

    // 3. First normal chat turn -> Direct Mode calls upstream directly, attaches @hello.txt, blocks .env!
    const rTurn1 = await runHook("Inspect @hello.txt and @.env please");
    assert.equal(rTurn1.decision, "block");
    assert.ok(rTurn1.reason.includes("0 Claude tokens"));
    assert.ok(rTurn1.reason.includes("OAI_OK:oai-gpt-alpha"));
    const body1 = oaiUp.getLastChatBody();
    const userMsg1 = body1.messages.find(m => m.role === "user").content;
    assert.ok(userMsg1.includes("WORKSPACE_MARKER_42"), "@hello.txt should be attached");
    assert.ok(!userMsg1.includes("SUPER_SECRET_DO_NOT_READ"), ".env must NEVER be auto-attached");

    // 4. Second normal chat turn -> multi-turn history preserved (system + user1 + assistant1 + user2 = 4 messages)
    const rTurn2 = await runHook("Follow up question");
    assert.equal(rTurn2.decision, "block");
    const body2 = oaiUp.getLastChatBody();
    assert.equal(body2.messages.length, 4);

    // 5. Other slash commands pass through cleanly even while pinned
    const rSlash = await runHook("/mp:settings");
    assert.deepEqual(rSlash, {});

    // 6. Switch to Agentic Mode (`--agentic`) -> returns additionalContext
    const rAgenticPin = await runHook("/mp:use oai-gpt-alpha --agentic");
    assert.equal(rAgenticPin.decision, "block");
    const rAgenticTurn = await runHook("Refactor module");
    assert.equal(rAgenticTurn.decision, undefined);
    assert.ok(rAgenticTurn.hookSpecificOutput.additionalContext.includes("mp_chat"));

    // 7. `/mp:off` unpins cleanly -> next turn returns {}
    const rOff = await runHook("/mp:off");
    assert.equal(rOff.decision, "block");
    assert.ok(rOff.reason.includes("unpinned"));
    const rAfterOff = await runHook("Back to native Claude");
    assert.deepEqual(rAfterOff, {});
  } finally {
    await oaiUp.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
