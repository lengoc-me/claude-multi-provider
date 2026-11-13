import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildUpstreamUrl,
  inferContextAndCompactSpec,
  mergeFetchedModels
} from "../../src/core/catalog-spec.mjs";
import {
  generateSessionToken,
  maskApiKey,
  verifyLoopbackAuth
} from "../../src/core/security.mjs";
import {
  loadConfig,
  redactConfigForClient,
  saveConfig
} from "../../src/core/config-store.mjs";
import {
  anthropicToOpenAiPayload,
  openAiToAnthropicResponse
} from "../../src/core/protocol-adapter.mjs";

test("buildUpstreamUrl avoids duplicate /v1 segments across diverse provider URLs", () => {
  assert.equal(buildUpstreamUrl("http://localhost:8317", "/v1/models"), "http://localhost:8317/v1/models");
  assert.equal(buildUpstreamUrl("http://localhost:8317/", "/v1beta/models"), "http://localhost:8317/v1beta/models");
  assert.equal(buildUpstreamUrl("https://api.openai.com/v1", "/v1/models"), "https://api.openai.com/v1/models");
  assert.equal(buildUpstreamUrl("https://openrouter.ai/api/v1/", "/v1/chat/completions"), "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(
    buildUpstreamUrl("https://generativelanguage.googleapis.com/v1beta/openai", "/v1/chat/completions"),
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
  );
  assert.equal(buildUpstreamUrl("http://localhost:8317/v1", "/v1beta/models"), "http://localhost:8317/v1beta/models");
});

test("mergeFetchedModels combines /v1/models and /v1beta/models with 90% autoCompactLimit", () => {
  const v1 = {
    data: [
      { id: "alpha-coder", owned_by: "gateway" },
      { id: "beta-fast", context_length: 128000 }
    ]
  };
  const v1Beta = {
    models: [
      { name: "models/alpha-coder", inputTokenLimit: 500000, outputTokenLimit: 65536 }
    ]
  };
  const merged = mergeFetchedModels(v1, v1Beta, { id: "cpa", name: "CPA" });
  assert.equal(merged.length, 2);
  assert.equal(merged[0].contextWindow, 500000);
  assert.equal(merged[0].autoCompactLimit, 450000);
  assert.equal(merged[0].maxOutputTokens, 65536);
  assert.equal(merged[1].contextWindow, 128000);
  assert.equal(merged[1].autoCompactLimit, 115200);
});

test("inferContextAndCompactSpec computes 90% threshold when autoCompactLimit is omitted", () => {
  const geminiSpec = inferContextAndCompactSpec("gemini-2.5-pro");
  assert.equal(geminiSpec.contextWindow, 1048576);
  assert.equal(geminiSpec.autoCompactLimit, Math.round(1048576 * 0.9));
});

test("maskApiKey and saveConfig never expose plaintext keys and preserve stored secrets on blank updates", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-unit-"));
  const cfgPath = path.join(tmpDir, "multi-provider.json");

  try {
    const secret = "mock-key-secret-value-9876";
    const masked = maskApiKey(secret);
    assert.ok(!masked.includes("secret-value"));
    assert.ok(masked.includes("••••9876"));

    saveConfig({
      providers: [
        { id: "p1", name: "Test Prov", baseUrl: "http://localhost:8317", apiKey: secret, protocol: "auto", enabled: true }
      ]
    }, cfgPath);

    const clientSafe = redactConfigForClient(loadConfig(cfgPath));
    assert.equal(clientSafe.providers[0].apiKey, undefined);
    assert.equal(clientSafe.providers[0].hasApiKey, true);
    assert.equal(clientSafe.providers[0].apiKeyMasked, masked);

    // Updating provider name with empty apiKey must preserve stored secret on disk
    saveConfig({
      providers: [
        { id: "p1", name: "Renamed Prov", baseUrl: "http://localhost:8317", apiKey: "", protocol: "openai", enabled: true }
      ]
    }, cfgPath);

    const reloaded = loadConfig(cfgPath);
    assert.equal(reloaded.providers[0].name, "Renamed Prov");
    assert.equal(reloaded.providers[0].apiKey, secret);

    // Explicit clearApiKey removes secret
    saveConfig({
      providers: [
        { id: "p1", name: "Renamed Prov", baseUrl: "http://localhost:8317", clearApiKey: true }
      ]
    }, cfgPath);
    assert.equal(loadConfig(cfgPath).providers[0].apiKey, "");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("verifyLoopbackAuth enforces token, Host, and Origin anti-CSRF guards", () => {
  const tok = generateSessionToken();

  // Missing token -> 401
  const noAuth = verifyLoopbackAuth({ headers: { host: "127.0.0.1:18320" }, url: "/api/state" }, tok, { port: 18320 });
  assert.equal(noAuth.ok, false);
  assert.equal(noAuth.status, 401);

  // Cross-origin CSRF attempt even with token -> 403
  const badOrigin = verifyLoopbackAuth({
    headers: { host: "127.0.0.1:18320", origin: "https://evil.example.com", "x-cmp-token": tok },
    url: "/api/save"
  }, tok, { port: 18320 });
  assert.equal(badOrigin.ok, false);
  assert.equal(badOrigin.status, 403);

  // DNS rebinding non-loopback Host -> 403
  const badHost = verifyLoopbackAuth({
    headers: { host: "rebind.attacker.example:18320", "x-cmp-token": tok },
    url: "/api/state"
  }, tok, { port: 18320 });
  assert.equal(badHost.ok, false);
  assert.equal(badHost.status, 403);

  // Valid loopback X-CMP-Token -> 200
  const good = verifyLoopbackAuth({
    headers: { host: "127.0.0.1:18320", origin: "http://127.0.0.1:18320", "x-cmp-token": tok },
    url: "/api/state"
  }, tok, { port: 18320 });
  assert.equal(good.ok, true);
});

test("anthropicToOpenAiPayload and openAiToAnthropicResponse translate tools, tool_results, and thinking", () => {
  const anthReq = {
    model: "ext-model",
    system: [{ type: "text", text: "Be concise." }],
    max_tokens: 1024,
    output_config: { effort: "high" },
    tools: [
      {
        name: "get_weather",
        description: "Get city weather",
        input_schema: { type: "object", properties: { city: { type: "string" } }, required: ["city"] }
      }
    ],
    messages: [
      { role: "user", content: "Weather in Tokyo?" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Checking weather..." },
          { type: "tool_use", id: "toolu_1", name: "get_weather", input: { city: "Tokyo" } }
        ]
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "toolu_1", content: "22C sunny" }
        ]
      }
    ]
  };

  const oaiPayload = anthropicToOpenAiPayload(anthReq, "ext-model");
  assert.equal(oaiPayload.messages[0].role, "system");
  assert.equal(oaiPayload.messages[2].tool_calls[0].function.name, "get_weather");
  assert.equal(oaiPayload.messages[3].role, "tool");
  assert.equal(oaiPayload.messages[3].tool_call_id, "toolu_1");
  assert.equal(oaiPayload.reasoning_effort, "high");

  const oaiRes = {
    id: "chatcmpl-123",
    choices: [
      {
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          reasoning_content: "Need another check",
          content: "Calling tool",
          tool_calls: [
            { id: "call_abc", type: "function", function: { name: "get_weather", arguments: '{"city":"Osaka"}' } }
          ]
        }
      }
    ],
    usage: { prompt_tokens: 42, completion_tokens: 19 }
  };

  const backToAnth = openAiToAnthropicResponse(oaiRes, "ext-model");
  assert.equal(backToAnth.stop_reason, "tool_use");
  assert.equal(backToAnth.content[0].type, "thinking");
  assert.equal(backToAnth.content[1].type, "text");
  assert.equal(backToAnth.content[2].type, "tool_use");
  assert.deepEqual(backToAnth.content[2].input, { city: "Osaka" });
  assert.equal(backToAnth.usage.input_tokens, 42);
});
