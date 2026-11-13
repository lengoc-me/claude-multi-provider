/**
 * Catalog Specification, Provider Presets, URL Normalization & Context/Compact Inference.
 */

export const PROVIDER_PRESETS = [
  {
    id: "cliproxyapi",
    label: "CLIProxyAPI (CPA)",
    defaultName: "CLIProxyAPI Gateway",
    baseUrl: "http://localhost:8317",
    protocol: "auto",
    hint: "Supports both /v1/messages, /v1/chat/completions, /v1/models, and /v1beta/models"
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    defaultName: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    protocol: "openai",
    hint: "Unified OpenAI-compatible API across 200+ frontier & open-weight models"
  },
  {
    id: "openai",
    label: "OpenAI",
    defaultName: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    protocol: "openai",
    hint: "Official OpenAI Chat Completions & Models endpoint"
  },
  {
    id: "gemini",
    label: "Google Gemini",
    defaultName: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    protocol: "openai",
    hint: "Official Gemini OpenAI-compatible endpoint"
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    defaultName: "DeepSeek API",
    baseUrl: "https://api.deepseek.com/v1",
    protocol: "openai",
    hint: "Official DeepSeek API"
  },
  {
    id: "groq",
    label: "Groq",
    defaultName: "Groq Cloud",
    baseUrl: "https://api.groq.com/openai/v1",
    protocol: "openai",
    hint: "Ultra-low-latency OpenAI-compatible inference"
  },
  {
    id: "litellm",
    label: "LiteLLM Proxy",
    defaultName: "LiteLLM",
    baseUrl: "http://localhost:4000",
    protocol: "auto",
    hint: "Self-hosted LiteLLM proxy supporting OpenAI and Anthropic routes"
  },
  {
    id: "ollama",
    label: "Ollama (Local)",
    defaultName: "Ollama Local",
    baseUrl: "http://localhost:11434/v1",
    protocol: "openai",
    hint: "Local Ollama models on port 11434 (API key optional)"
  },
  {
    id: "lmstudio",
    label: "LM Studio (Local)",
    defaultName: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    protocol: "openai",
    hint: "Local LM Studio server on port 1234"
  },
  {
    id: "custom",
    label: "Custom Endpoint",
    defaultName: "Custom Provider",
    baseUrl: "https://api.example.com/v1",
    protocol: "auto",
    hint: "Any OpenAI-compatible (/v1/chat/completions) or Anthropic-compatible (/v1/messages) API"
  }
];

export const ALL_EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"];

export const BEHAVES_AS_MODELS = [
  { id: "claude-opus-4-6", label: "Claude Opus (High Capability)" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet (Balanced)" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku (Fast)" }
];

/**
 * Joins a provider baseUrl and an API endpoint path without duplicating `/v1` or `/v1beta`.
 * Examples:
 * - buildUpstreamUrl("https://api.openai.com/v1", "/v1/models") -> "https://api.openai.com/v1/models"
 * - buildUpstreamUrl("http://localhost:8317", "/v1/models") -> "http://localhost:8317/v1/models"
 * - buildUpstreamUrl("https://generativelanguage.googleapis.com/v1beta/openai", "/v1/chat/completions")
 *   -> "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
 */
export function buildUpstreamUrl(baseUrl, endpointPath) {
  const cleanBase = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!cleanBase) throw new Error("Provider baseUrl is empty");
  const cleanPath = "/" + String(endpointPath || "").trim().replace(/^\/+/, "");

  // Avoid /v1/v1/* when baseUrl already ends with /v1 or /v1beta/openai or /api/v1
  if (/\/(v1|openai)$/i.test(cleanBase) && cleanPath.startsWith("/v1/")) {
    return cleanBase + cleanPath.slice(3);
  }
  if (/\/v1beta$/i.test(cleanBase) && cleanPath.startsWith("/v1beta/")) {
    return cleanBase + cleanPath.slice(7);
  }
  // If baseUrl ends with /v1 and caller probes /v1beta/models, step up one segment cleanly
  if (/\/v1$/i.test(cleanBase) && cleanPath.startsWith("/v1beta/")) {
    return cleanBase.replace(/\/v1$/i, "") + cleanPath;
  }
  return cleanBase + cleanPath;
}

/**
 * Infers reasoning capability and effort levels from provider metadata or model ID.
 */
export function inferReasoningSpec(rawModelObj) {
  const m = typeof rawModelObj === "string" ? { id: rawModelObj } : (rawModelObj || {});
  if (m.reasoning === false || m.supports_reasoning === false || m.reasoning_type === "none" || m.reasoningType === "none") {
    return {
      reasoningType: "none",
      effortLevels: [],
      defaultEffort: "medium"
    };
  }
  const explicit =
    m.effortLevels ||
    m.effort_levels ||
    m.reasoning_efforts ||
    m.supported_effort_levels ||
    m.capabilities?.effort_levels;
  if (Array.isArray(explicit) && explicit.length > 0) {
    const clean = explicit.map(x => String(x).toLowerCase().trim()).filter(Boolean);
    return {
      reasoningType: "effort",
      effortLevels: clean,
      defaultEffort: m.defaultEffort || m.default_effort || (clean.includes("medium") ? "medium" : clean[0])
    };
  }
  return {
    reasoningType: "effort",
    effortLevels: [...ALL_EFFORT_LEVELS],
    defaultEffort: m.defaultEffort || "medium"
  };
}

/**
 * Infers authoritative context window and 90% auto-compact token threshold.
 */
export function inferContextAndCompactSpec(rawModelObj) {
  const m = typeof rawModelObj === "string" ? { id: rawModelObj } : (rawModelObj || {});
  const id = String(m.id || "").trim().toLowerCase();

  const explicitCtx = Number(
    m.inputTokenLimit ||
    m.contextWindow ||
    m.context_window ||
    m.context_length ||
    m.max_context_length ||
    m.max_input_tokens ||
    m.top_provider?.context_length ||
    m.runtime?.max_input_tokens ||
    0
  );

  const explicitCompact = Number(
    m.autoCompactLimit ||
    m.auto_compact_token_limit ||
    m.runtime?.auto_compact_token_limit ||
    0
  );

  const explicitOut = Number(
    m.outputTokenLimit ||
    m.maxOutputTokens ||
    m.max_completion_tokens ||
    m.max_output_tokens ||
    m.top_provider?.max_completion_tokens ||
    0
  );

  let ctx = explicitCtx > 0 ? explicitCtx : 0;
  if (ctx <= 0) {
    if (id.includes("gemini-") || id.includes("1m") || id.includes("qwen3") && id.includes("max")) {
      ctx = 1048576;
    } else if (id.includes("claude-opus") || id.includes("claude-sonnet")) {
      ctx = 200000;
    } else if (id.includes("gpt-5") || id.includes("gpt-6") || id.includes("o3") || id.includes("o4")) {
      ctx = 272000;
    } else if (id.includes("swe-2") || id.includes("kimi") || id.includes("minimax")) {
      ctx = 262144;
    } else if (id.includes("deepseek") || id.includes("llama") || id.includes("mistral") || id.includes("qwen")) {
      ctx = 131072;
    } else {
      ctx = 200000;
    }
  }

  const compact = explicitCompact > 0 ? Math.min(ctx, explicitCompact) : Math.round(ctx * 0.9);
  const maxOut = explicitOut > 0 ? explicitOut : 64000;

  return {
    contextWindow: ctx,
    autoCompactLimit: compact,
    maxOutputTokens: maxOut
  };
}

/**
 * Merges /v1/models and optional /v1beta/models payloads into normalized Catalog Model entries.
 */
export function mergeFetchedModels(v1Payload, v1BetaPayload, provider) {
  const betaMap = new Map();
  const betaList = Array.isArray(v1BetaPayload?.models) ? v1BetaPayload.models : [];
  for (const bm of betaList) {
    if (!bm || !bm.name) continue;
    const cleanId = String(bm.name).replace(/^models\//i, "").trim();
    if (cleanId) {
      betaMap.set(cleanId, bm);
      betaMap.set(cleanId.toLowerCase(), bm);
    }
  }

  let rawList = [];
  if (Array.isArray(v1Payload?.data)) {
    rawList = v1Payload.data;
  } else if (Array.isArray(v1Payload?.models)) {
    rawList = v1Payload.models.map(m => ({
      ...m,
      id: m.id || String(m.name || "").replace(/^models\//i, "")
    }));
  } else if (Array.isArray(v1Payload)) {
    rawList = v1Payload;
  }

  const seen = new Set();
  const results = [];

  for (const item of rawList) {
    if (!item) continue;
    const idStr = String(item.id || item.name || "").replace(/^models\//i, "").trim();
    if (!idStr || seen.has(idStr.toLowerCase())) continue;
    seen.add(idStr.toLowerCase());

    const bm = betaMap.get(idStr) || betaMap.get(idStr.toLowerCase()) || null;
    const mergedRaw = {
      ...item,
      id: idStr,
      inputTokenLimit: bm?.inputTokenLimit || item.inputTokenLimit,
      outputTokenLimit: bm?.outputTokenLimit || item.outputTokenLimit
    };

    const ctxSpec = inferContextAndCompactSpec(mergedRaw);
    const reasonSpec = inferReasoningSpec(mergedRaw);

    results.push({
      id: idStr,
      name: String(item.display_name || bm?.displayName || idStr).trim(),
      ownedBy: String(item.owned_by || (idStr.includes("/") ? idStr.split("/")[0] : provider.name || provider.id)),
      providerId: provider.id,
      providerName: provider.name || provider.id,
      contextWindow: ctxSpec.contextWindow,
      autoCompactLimit: ctxSpec.autoCompactLimit,
      maxOutputTokens: ctxSpec.maxOutputTokens,
      reasoningType: reasonSpec.reasoningType,
      effortLevels: reasonSpec.effortLevels,
      defaultEffort: reasonSpec.defaultEffort
    });
  }

  // If a Gemini-only endpoint only returned /v1beta/models and nothing on /v1/models, include beta models too
  if (results.length === 0 && betaList.length > 0) {
    for (const bm of betaList) {
      const idStr = String(bm?.name || "").replace(/^models\//i, "").trim();
      if (!idStr || seen.has(idStr.toLowerCase())) continue;
      seen.add(idStr.toLowerCase());
      const ctxSpec = inferContextAndCompactSpec({ ...bm, id: idStr });
      const reasonSpec = inferReasoningSpec({ ...bm, id: idStr });
      results.push({
        id: idStr,
        name: String(bm.displayName || idStr).trim(),
        ownedBy: provider.name || provider.id,
        providerId: provider.id,
        providerName: provider.name || provider.id,
        contextWindow: ctxSpec.contextWindow,
        autoCompactLimit: ctxSpec.autoCompactLimit,
        maxOutputTokens: ctxSpec.maxOutputTokens,
        reasoningType: reasonSpec.reasoningType,
        effortLevels: reasonSpec.effortLevels,
        defaultEffort: reasonSpec.defaultEffort
      });
    }
  }

  return results;
}
