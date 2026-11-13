import { loadConfig, redactConfigForClient, saveConfig } from "./config-store.mjs";
import { callProviderModel } from "./protocol-adapter.mjs";
import { openUrlInBrowser, refreshCatalogAndPersist } from "./dashboard-server.mjs";
import { recordTelemetry } from "./gateway-server.mjs";
import { syncClaudeCliSettings } from "./cli-sync.mjs";

export const MCP_SERVER_INFO = {
  name: "claude-multi-provider",
  version: "1.0.0"
};

export const MCP_TOOLS = [
  {
    name: "mp_list_models",
    description: "List configured external LLM providers and enabled/cached models with context windows, auto-compact thresholds, and reasoning capabilities.",
    inputSchema: {
      type: "object",
      properties: {
        include_cached_catalog: {
          type: "boolean",
          description: "Include all discovered catalog models in addition to enabled custom models (default: false)."
        },
        provider_id: {
          type: "string",
          description: "Optional provider ID filter."
        }
      }
    }
  },
  {
    name: "mp_chat",
    description: "Send a prompt or multi-turn conversation to an external LLM model configured in claude-multi-provider (e.g. CLIProxyAPI/CPA, OpenRouter, OpenAI, Gemini, DeepSeek, Groq, Ollama).",
    inputSchema: {
      type: "object",
      properties: {
        model: {
          type: "string",
          description: "Target model ID (omit to use configured defaultModel or first enabled model)."
        },
        prompt: {
          type: "string",
          description: "User prompt to send when `messages` is not provided."
        },
        messages: {
          type: "array",
          description: "Optional multi-turn messages array ([{ role: 'user'|'assistant', content: '...' }]).",
          items: {
            type: "object",
            properties: {
              role: { type: "string", enum: ["user", "assistant"] },
              content: { type: "string" }
            },
            required: ["role", "content"]
          }
        },
        system: {
          type: "string",
          description: "Optional system instruction."
        },
        effort: {
          type: "string",
          enum: ["low", "medium", "high", "xhigh", "max"],
          description: "Optional reasoning effort level."
        },
        max_tokens: {
          type: "integer",
          description: "Maximum output tokens (default: 4096)."
        },
        temperature: {
          type: "number",
          description: "Optional sampling temperature (0.0 to 2.0)."
        },
        provider_id: {
          type: "string",
          description: "Optional provider ID override."
        }
      }
    }
  },
  {
    name: "mp_compare_models",
    description: "Query 2 to 5 external models in parallel on the same prompt or review task and return side-by-side outputs, token usage, and latency.",
    inputSchema: {
      type: "object",
      properties: {
        models: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 5,
          description: "List of 2 to 5 external model IDs to query in parallel."
        },
        prompt: {
          type: "string",
          description: "Prompt or code review question sent to all models."
        },
        system: {
          type: "string",
          description: "Optional shared system prompt."
        },
        effort: {
          type: "string",
          enum: ["low", "medium", "high", "xhigh", "max"]
        },
        max_tokens: {
          type: "integer"
        }
      },
      required: ["models", "prompt"]
    }
  },
  {
    name: "mp_fetch_catalog",
    description: "Fetch /v1/models and /v1beta/models from configured LLM providers and refresh context window and 90% auto-compact metadata.",
    inputSchema: {
      type: "object",
      properties: {
        provider_id: {
          type: "string",
          description: "Optional specific provider ID to fetch (fetches all enabled providers when omitted)."
        }
      }
    }
  },
  {
    name: "mp_configure_provider",
    description: "Add or update an external LLM provider or enable/disable models in the catalog. Note: API keys are stored locally with 0600 permissions and redacted in all responses.",
    inputSchema: {
      type: "object",
      properties: {
        provider_id: {
          type: "string",
          description: "Unique slug for the provider (e.g. 'cpa-main', 'openrouter', 'ollama')."
        },
        name: {
          type: "string",
          description: "Display name for the provider."
        },
        base_url: {
          type: "string",
          description: "Provider Base URL (http:// or https://)."
        },
        api_key: {
          type: "string",
          description: "Optional API key (omit to keep any existing stored key)."
        },
        protocol: {
          type: "string",
          enum: ["auto", "openai", "anthropic"],
          description: "Wire protocol (default: 'auto')."
        },
        enable_models: {
          type: "array",
          items: { type: "string" },
          description: "Optional list of model IDs to enable for this provider."
        },
        default_model: {
          type: "string",
          description: "Optional default model ID to set."
        }
      }
    }
  },
  {
    name: "mp_open_settings",
    description: "Ensure the local Settings & Model Catalog Web Dashboard (LLM Providers + Model Catalog UI) is running on 127.0.0.1 and optionally open it in the user's browser.",
    inputSchema: {
      type: "object",
      properties: {
        open_browser: {
          type: "boolean",
          description: "Open the dashboard URL in the default OS browser (default: true)."
        }
      }
    }
  },
  {
    name: "mp_gateway_status",
    description: "Start or inspect the local Anthropic-compatible HTTP/SSE Gateway (127.0.0.1:18329) and optionally sync enabled custom models into ~/.claude/settings.json for Claude Code CLI.",
    inputSchema: {
      type: "object",
      properties: {
        ensure_running: {
          type: "boolean",
          description: "Start the local gateway if not already running (default: true)."
        },
        sync_cli_settings: {
          type: "boolean",
          description: "Opt-in: write enabled custom models to ~/.claude/settings.json modelPicker (default: false)."
        }
      }
    }
  }
];

function formatToolResult(payload, isError = false) {
  return {
    content: [
      {
        type: "text",
        text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2)
      }
    ],
    ...(isError ? { isError: true } : {})
  };
}

export class McpDispatcher {
  constructor({
    configPath = undefined,
    settingsPath = undefined,
    ensureDashboard = async () => null,
    ensureGateway = async () => null,
    getGatewayStatus = () => ({ running: false, url: "" })
  } = {}) {
    this.configPath = configPath;
    this.settingsPath = settingsPath;
    this.ensureDashboard = ensureDashboard;
    this.ensureGateway = ensureGateway;
    this.getGatewayStatus = getGatewayStatus;
  }

  async callTool(name, args = {}) {
    try {
      if (name === "mp_list_models") {
        const cfg = loadConfig(this.configPath);
        const safe = redactConfigForClient(cfg);
        const provFilter = String(args.provider_id || "").trim();
        const enabledModels = safe.customModels.filter(
          m => m.enabled !== false && (!provFilter || m.providerId === provFilter)
        );
        const out = {
          defaultModel: safe.defaultModel || enabledModels[0]?.id || "",
          providers: safe.providers.filter(p => !provFilter || p.id === provFilter),
          enabledModels,
          cachedCatalogCount: safe.cachedCatalogModels.length
        };
        if (args.include_cached_catalog) {
          out.cachedCatalogModels = safe.cachedCatalogModels
            .filter(m => !provFilter || m.providerId === provFilter)
            .slice(0, 200);
        }
        return formatToolResult(out);
      }

      if (name === "mp_chat") {
        const hasPrompt = typeof args.prompt === "string" && args.prompt.trim().length > 0;
        const hasMsgs = Array.isArray(args.messages) && args.messages.length > 0;
        if (!hasPrompt && !hasMsgs) {
          return formatToolResult({ ok: false, error: "Provide either a non-empty `prompt` or `messages` array." }, true);
        }
        const cfg = loadConfig(this.configPath);
        const res = await callProviderModel(cfg, {
          model: args.model,
          providerId: args.provider_id,
          prompt: args.prompt,
          messages: args.messages,
          system: args.system,
          effort: args.effort,
          maxTokens: args.max_tokens,
          temperature: args.temperature
        });
        recordTelemetry({
          model: res.model,
          provider: res.providerName,
          protocol: res.protocol,
          surface: "mcp:mp_chat",
          status: res.status,
          latencyMs: res.latencyMs
        });
        if (!res.ok) {
          return formatToolResult({
            ok: false,
            model: res.model,
            provider: res.providerName,
            status: res.status,
            error: res.error
          }, true);
        }
        const header = `[Model: ${res.model} | Provider: ${res.providerName} (${res.protocol}) | ${res.latencyMs}ms | in:${res.usage.input_tokens} out:${res.usage.output_tokens}]`;
        const body = res.thinking
          ? `<thinking>\n${res.thinking}\n</thinking>\n\n${res.text}`
          : res.text;
        return formatToolResult(`${header}\n\n${body}`);
      }

      if (name === "mp_compare_models") {
        const models = Array.isArray(args.models) ? args.models.map(m => String(m).trim()).filter(Boolean) : [];
        const prompt = String(args.prompt || "").trim();
        if (models.length < 2 || models.length > 5) {
          return formatToolResult({ ok: false, error: "`models` must contain between 2 and 5 model IDs." }, true);
        }
        if (!prompt) {
          return formatToolResult({ ok: false, error: "`prompt` is required." }, true);
        }
        const cfg = loadConfig(this.configPath);
        const settled = await Promise.all(
          models.map(async (m) => {
            try {
              const r = await callProviderModel(cfg, {
                model: m,
                prompt,
                system: args.system,
                effort: args.effort,
                maxTokens: args.max_tokens || 2048
              });
              recordTelemetry({
                model: r.model,
                provider: r.providerName,
                protocol: r.protocol,
                surface: "mcp:mp_compare_models",
                status: r.status,
                latencyMs: r.latencyMs
              });
              return r;
            } catch (err) {
              return { ok: false, model: m, error: err.message };
            }
          })
        );
        return formatToolResult({
          ok: settled.some(s => s.ok),
          comparedCount: settled.length,
          results: settled.map(s => ({
            model: s.model,
            provider: s.providerName || "",
            ok: s.ok,
            latencyMs: s.latencyMs || 0,
            usage: s.usage || null,
            output: s.ok ? s.text : undefined,
            error: s.ok ? undefined : s.error
          }))
        });
      }

      if (name === "mp_fetch_catalog") {
        const cfg = loadConfig(this.configPath);
        const out = await refreshCatalogAndPersist(cfg, String(args.provider_id || ""), this.configPath);
        return formatToolResult({
          ok: true,
          fetchedCount: out.fetchedCount,
          totalCached: out.saved.cachedCatalogModels.length,
          warnings: out.warnings,
          sampleModels: out.saved.cachedCatalogModels.slice(0, 25).map(m => ({
            id: m.id,
            provider: m.providerName,
            contextWindow: m.contextWindow,
            autoCompactLimit: m.autoCompactLimit
          }))
        });
      }

      if (name === "mp_configure_provider") {
        const cfg = loadConfig(this.configPath);
        const providers = [...cfg.providers];
        const provId = String(args.provider_id || "").trim();

        if (provId || args.base_url) {
          const resolvedId = provId || `provider-${providers.length + 1}`;
          const existingIdx = providers.findIndex(p => p.id === resolvedId);
          const baseUrl = String(args.base_url || (existingIdx >= 0 ? providers[existingIdx].baseUrl : "")).trim();
          if (!baseUrl) {
            return formatToolResult({ ok: false, error: "`base_url` is required when adding a new provider." }, true);
          }
          try {
            const parsed = new URL(baseUrl);
            if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
              return formatToolResult({ ok: false, error: "`base_url` must start with http:// or https://" }, true);
            }
          } catch {
            return formatToolResult({ ok: false, error: `Invalid URL: ${baseUrl}` }, true);
          }

          const updatedProv = {
            id: resolvedId,
            name: String(args.name || (existingIdx >= 0 ? providers[existingIdx].name : resolvedId)).trim(),
            baseUrl,
            protocol: args.protocol || (existingIdx >= 0 ? providers[existingIdx].protocol : "auto"),
            enabled: true,
            apiKey: typeof args.api_key === "string" && args.api_key.trim() ? args.api_key.trim() : ""
          };
          if (existingIdx >= 0) providers[existingIdx] = updatedProv;
          else providers.push(updatedProv);
        }

        const customModels = [...cfg.customModels];
        const targetProv = providers.find(p => p.id === provId) || providers[0];
        if (Array.isArray(args.enable_models) && targetProv) {
          for (const rawId of args.enable_models) {
            const mid = String(rawId || "").trim();
            if (!mid) continue;
            const existingModel = customModels.find(
              m => m.id.toLowerCase() === mid.toLowerCase() && m.providerId === targetProv.id
            );
            if (existingModel) {
              existingModel.enabled = true;
            } else {
              customModels.push({
                id: mid,
                name: mid,
                providerId: targetProv.id,
                providerName: targetProv.name,
                enabled: true
              });
            }
          }
        }

        const saved = saveConfig(
          {
            ...cfg,
            providers,
            customModels,
            defaultModel: args.default_model ? String(args.default_model).trim() : cfg.defaultModel
          },
          this.configPath
        );
        return formatToolResult({
          ok: true,
          config: redactConfigForClient(saved)
        });
      }

      if (name === "mp_open_settings") {
        const dash = await this.ensureDashboard();
        if (!dash) {
          return formatToolResult({ ok: false, error: "Could not start local Settings Dashboard." }, true);
        }
        const shouldOpen = args.open_browser !== false && process.env.CMP_NO_BROWSER !== "1";
        const opened = shouldOpen ? openUrlInBrowser(dash.authenticatedUrl) : false;
        return formatToolResult({
          ok: true,
          dashboardUrl: dash.authenticatedUrl,
          browserOpened: opened,
          note: "Open dashboardUrl in your local browser to manage LLM Providers and the Model Catalog."
        });
      }

      if (name === "mp_gateway_status") {
        let gw = this.getGatewayStatus();
        if (args.ensure_running !== false && !gw?.running) {
          gw = await this.ensureGateway();
        }
        let cliSync = null;
        if (args.sync_cli_settings === true) {
          const cfg = loadConfig(this.configPath);
          cliSync = syncClaudeCliSettings(cfg, this.settingsPath);
        }
        return formatToolResult({
          ok: true,
          gatewayRunning: Boolean(gw?.running),
          gatewayUrl: gw?.url || "",
          cliSync
        });
      }

      return formatToolResult({ ok: false, error: `Unknown tool: ${name}` }, true);
    } catch (err) {
      return formatToolResult({ ok: false, error: err.message || String(err) }, true);
    }
  }

  async handleMessage(msg) {
    if (!msg || typeof msg !== "object") {
      return {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: "Invalid JSON-RPC request" }
      };
    }

    const { id, method, params } = msg;

    // JSON-RPC notifications have no `id` and expect no response
    if (id === undefined) {
      return null;
    }

    if (method === "initialize") {
      const requestedVersion = String(params?.protocolVersion || "2024-11-05");
      const supported = ["2024-11-05", "2025-03-26"];
      const negotiated = supported.includes(requestedVersion) ? requestedVersion : "2024-11-05";
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: negotiated,
          capabilities: {
            tools: { listChanged: false },
            resources: { listChanged: false },
            prompts: { listChanged: false }
          },
          serverInfo: MCP_SERVER_INFO
        }
      };
    }

    if (method === "ping") {
      return { jsonrpc: "2.0", id, result: {} };
    }

    if (method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id,
        result: { tools: MCP_TOOLS }
      };
    }

    if (method === "resources/list") {
      return {
        jsonrpc: "2.0",
        id,
        result: { resources: [] }
      };
    }

    if (method === "prompts/list") {
      return {
        jsonrpc: "2.0",
        id,
        result: { prompts: [] }
      };
    }

    if (method === "tools/call") {
      const toolName = String(params?.name || "");
      const toolArgs = params?.arguments && typeof params.arguments === "object" ? params.arguments : {};
      if (!MCP_TOOLS.some(t => t.name === toolName)) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: `Unknown tool: ${toolName}` }
        };
      }
      const result = await this.callTool(toolName, toolArgs);
      return {
        jsonrpc: "2.0",
        id,
        result
      };
    }

    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not found: ${method}` }
    };
  }
}
