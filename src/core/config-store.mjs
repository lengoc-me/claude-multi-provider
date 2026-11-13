import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { maskApiKey } from "./security.mjs";
import { inferContextAndCompactSpec, inferReasoningSpec } from "./catalog-spec.mjs";

export function getDefaultConfigPath() {
  if (process.env.CMP_CONFIG_PATH && String(process.env.CMP_CONFIG_PATH).trim()) {
    return path.resolve(String(process.env.CMP_CONFIG_PATH).trim());
  }
  return path.join(os.homedir(), ".claude", "multi-provider.json");
}

export function getDefaultClaudeSettingsPath() {
  if (process.env.CMP_CLAUDE_SETTINGS_PATH && String(process.env.CMP_CLAUDE_SETTINGS_PATH).trim()) {
    return path.resolve(String(process.env.CMP_CLAUDE_SETTINGS_PATH).trim());
  }
  return path.join(os.homedir(), ".claude", "settings.json");
}

function buildSeedFromEnvironment() {
  const envUrl = String(process.env.CMP_PROVIDER_BASE_URL || "").trim();
  const envKey = String(process.env.CMP_PROVIDER_API_KEY || "").trim();
  const envName = String(process.env.CMP_PROVIDER_NAME || "Primary Gateway").trim();
  const envProto = String(process.env.CMP_PROVIDER_PROTOCOL || "auto").trim().toLowerCase();
  const envModel = String(process.env.CMP_DEFAULT_MODEL || "").trim();
  const dashPort = Number(process.env.CMP_DASHBOARD_PORT) || 18320;
  const gwPort = Number(process.env.CMP_GATEWAY_PORT) || 18329;

  const providers = [];
  if (envUrl) {
    providers.push({
      id: "default-provider",
      name: envName || "Primary Gateway",
      baseUrl: envUrl.replace(/\/+$/, ""),
      apiKey: envKey,
      protocol: ["auto", "openai", "anthropic"].includes(envProto) ? envProto : "auto",
      enabled: true
    });
  }

  const customModels = [];
  if (envModel && providers.length > 0) {
    const ctxSpec = inferContextAndCompactSpec(envModel);
    const reasonSpec = inferReasoningSpec(envModel);
    customModels.push({
      id: envModel,
      name: envModel,
      providerId: providers[0].id,
      providerName: providers[0].name,
      behavesAs: "claude-opus-4-6",
      contextWindow: ctxSpec.contextWindow,
      autoCompactLimit: ctxSpec.autoCompactLimit,
      maxOutputTokens: ctxSpec.maxOutputTokens,
      reasoningType: reasonSpec.reasoningType,
      effortLevels: reasonSpec.effortLevels,
      defaultEffort: reasonSpec.defaultEffort,
      pinnedAgent: false,
      enabled: true
    });
  }

  return {
    version: 1,
    dashboardPort: dashPort,
    gatewayPort: gwPort,
    gatewayEnabled: true,
    syncCliPicker: false,
    defaultModel: envModel || "",
    defaultBehavesAs: "claude-opus-4-6",
    providers,
    customModels,
    cachedCatalogModels: []
  };
}

function normalizeProvider(raw, fallbackIdx = 0) {
  const id = String(raw?.id || `provider-${fallbackIdx + 1}`).trim() || `provider-${fallbackIdx + 1}`;
  const name = String(raw?.name || id).trim();
  const baseUrl = String(raw?.baseUrl || "").trim().replace(/\/+$/, "");
  const proto = String(raw?.protocol || "auto").trim().toLowerCase();
  return {
    id,
    name,
    baseUrl,
    apiKey: typeof raw?.apiKey === "string" ? raw.apiKey.trim() : "",
    protocol: ["auto", "openai", "anthropic"].includes(proto) ? proto : "auto",
    enabled: raw?.enabled !== false
  };
}

function normalizeCustomModel(raw, providersMap) {
  const id = String(raw?.id || "").trim();
  if (!id) return null;
  const ctxSpec = inferContextAndCompactSpec(raw);
  const reasonSpec = inferReasoningSpec(raw);
  const provId = String(raw?.providerId || "").trim();
  const prov = providersMap.get(provId) || Array.from(providersMap.values())[0] || null;
  return {
    id,
    name: String(raw?.name || id).trim(),
    providerId: prov ? prov.id : (provId || "default-provider"),
    providerName: prov ? prov.name : String(raw?.providerName || "Provider"),
    behavesAs: String(raw?.behavesAs || "claude-opus-4-6").trim(),
    contextWindow: Number(raw?.contextWindow) > 0 ? Number(raw.contextWindow) : ctxSpec.contextWindow,
    autoCompactLimit: Number(raw?.autoCompactLimit) > 0 ? Number(raw.autoCompactLimit) : ctxSpec.autoCompactLimit,
    maxOutputTokens: Number(raw?.maxOutputTokens) > 0 ? Number(raw.maxOutputTokens) : ctxSpec.maxOutputTokens,
    reasoningType: raw?.reasoningType || reasonSpec.reasoningType,
    effortLevels: Array.isArray(raw?.effortLevels) ? raw.effortLevels : reasonSpec.effortLevels,
    defaultEffort: String(raw?.defaultEffort || reasonSpec.defaultEffort),
    pinnedAgent: Boolean(raw?.pinnedAgent),
    enabled: raw?.enabled !== false
  };
}

export function normalizeConfig(rawCfg) {
  const seed = buildSeedFromEnvironment();
  const src = rawCfg && typeof rawCfg === "object" ? rawCfg : {};

  const providersRaw = Array.isArray(src.providers) ? src.providers : seed.providers;
  const providers = [];
  const seenProvIds = new Set();
  for (let i = 0; i < providersRaw.length; i++) {
    const p = normalizeProvider(providersRaw[i], i);
    if (!p.baseUrl && !p.name) continue;
    if (seenProvIds.has(p.id)) {
      p.id = `${p.id}-${i + 1}`;
    }
    seenProvIds.add(p.id);
    providers.push(p);
  }

  // Merge environment provider key/url if env specifies default-provider and existing has empty key
  if (seed.providers.length > 0) {
    const envP = seed.providers[0];
    const match = providers.find(p => p.id === envP.id || p.baseUrl === envP.baseUrl);
    if (!match && providers.length === 0) {
      providers.push(envP);
    } else if (match && !match.apiKey && envP.apiKey) {
      match.apiKey = envP.apiKey;
    }
  }

  const providersMap = new Map(providers.map(p => [p.id, p]));

  const customModelsRaw = Array.isArray(src.customModels) ? src.customModels : seed.customModels;
  const customModels = [];
  const seenModels = new Set();
  for (const item of customModelsRaw) {
    const cm = normalizeCustomModel(item, providersMap);
    if (!cm) continue;
    const key = `${cm.providerId}::${cm.id.toLowerCase()}`;
    if (seenModels.has(key)) continue;
    seenModels.add(key);
    customModels.push(cm);
  }

  const cachedCatalogModels = Array.isArray(src.cachedCatalogModels)
    ? src.cachedCatalogModels
        .filter(m => m && m.id)
        .map(m => {
          const ctx = inferContextAndCompactSpec(m);
          const rsn = inferReasoningSpec(m);
          return {
            id: String(m.id).trim(),
            name: String(m.name || m.id).trim(),
            ownedBy: String(m.ownedBy || m.owned_by || m.providerName || ""),
            providerId: String(m.providerId || ""),
            providerName: String(m.providerName || ""),
            contextWindow: Number(m.contextWindow) > 0 ? Number(m.contextWindow) : ctx.contextWindow,
            autoCompactLimit: Number(m.autoCompactLimit) > 0 ? Number(m.autoCompactLimit) : ctx.autoCompactLimit,
            maxOutputTokens: Number(m.maxOutputTokens) > 0 ? Number(m.maxOutputTokens) : ctx.maxOutputTokens,
            reasoningType: m.reasoningType || rsn.reasoningType,
            effortLevels: Array.isArray(m.effortLevels) ? m.effortLevels : rsn.effortLevels,
            defaultEffort: m.defaultEffort || rsn.defaultEffort
          };
        })
    : [];

  return {
    version: 1,
    dashboardPort: Number(src.dashboardPort) > 0 ? Number(src.dashboardPort) : seed.dashboardPort,
    gatewayPort: Number(src.gatewayPort) > 0 ? Number(src.gatewayPort) : seed.gatewayPort,
    gatewayEnabled: src.gatewayEnabled !== false,
    syncCliPicker: Boolean(src.syncCliPicker),
    defaultModel: String(src.defaultModel ?? seed.defaultModel ?? "").trim(),
    defaultBehavesAs: String(src.defaultBehavesAs || "claude-opus-4-6").trim(),
    providers,
    customModels,
    cachedCatalogModels
  };
}

export function loadConfig(customPath) {
  const filePath = customPath || getDefaultConfigPath();
  try {
    if (fs.existsSync(filePath)) {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
      return normalizeConfig(raw);
    }
  } catch {
    // Fall back cleanly if file does not exist or is unreadable
  }
  const initial = normalizeConfig({});
  try {
    writeConfigAtomic(filePath, initial);
  } catch {
    // Read-only filesystem fallback
  }
  return initial;
}

function writeConfigAtomic(filePath, cfgObj) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const serialized = JSON.stringify(cfgObj, null, 2) + "\n";
  fs.writeFileSync(tmpPath, serialized, { encoding: "utf8", mode: 0o600 });
  try {
    fs.chmodSync(tmpPath, 0o600);
  } catch {
    // Windows chmod is a best-effort no-op
  }
  fs.renameSync(tmpPath, filePath);
}

/**
 * Saves updated configuration while preserving existing stored API keys whenever a client
 * omits `apiKey`, passes `""` without `clearApiKey: true`, or sends a masked sentinel (`••••`).
 */
export function saveConfig(patch, customPath) {
  const filePath = customPath || getDefaultConfigPath();
  const existing = loadConfig(filePath);
  const existingKeyById = new Map(existing.providers.map(p => [p.id, p.apiKey || ""]));

  const nextObj = {
    ...existing,
    ...(patch || {})
  };

  if (Array.isArray(patch?.providers)) {
    nextObj.providers = patch.providers.map((incoming, idx) => {
      const id = String(incoming?.id || `provider-${idx + 1}`).trim();
      const prevKey = existingKeyById.get(id) || "";
      const rawKey = typeof incoming?.apiKey === "string" ? incoming.apiKey.trim() : "";
      const isMaskedSentinel = rawKey.includes("••••");

      let resolvedKey = prevKey;
      if (incoming?.clearApiKey === true) {
        resolvedKey = "";
      } else if (rawKey && !isMaskedSentinel) {
        resolvedKey = rawKey;
      }
      return {
        ...incoming,
        id,
        apiKey: resolvedKey
      };
    });
  }

  const normalized = normalizeConfig(nextObj);
  writeConfigAtomic(filePath, normalized);
  return normalized;
}

/**
 * Produces a client-safe view of the config with all raw `apiKey` secrets stripped and masked.
 */
export function redactConfigForClient(cfg) {
  const norm = normalizeConfig(cfg);
  return {
    ...norm,
    providers: norm.providers.map(p => {
      const hasApiKey = Boolean(p.apiKey && p.apiKey.length > 0);
      return {
        id: p.id,
        name: p.name,
        baseUrl: p.baseUrl,
        protocol: p.protocol,
        enabled: p.enabled,
        hasApiKey,
        apiKeyMasked: hasApiKey ? maskApiKey(p.apiKey) : ""
      };
    })
  };
}

/**
 * Resolves a model ID and optional providerId against configured custom models, cached catalog, and providers.
 */
export function resolveModelTarget(cfg, requestedModelId, explicitProviderId = "") {
  const norm = normalizeConfig(cfg);
  const enabledProviders = norm.providers.filter(p => p.enabled !== false && p.baseUrl);
  if (enabledProviders.length === 0) {
    throw new Error("No enabled LLM providers configured. Run /mp:settings or use mp_configure_provider first.");
  }

  let cleanModel = String(requestedModelId || norm.defaultModel || "").replace(/\[(1|2)m\]$/i, "").trim();
  if (!cleanModel) {
    const firstEnabledCustom = norm.customModels.find(m => m.enabled !== false);
    cleanModel = firstEnabledCustom?.id || norm.cachedCatalogModels[0]?.id || "";
  }
  if (!cleanModel) {
    throw new Error("No target model specified and no default model configured.");
  }

  const lower = cleanModel.toLowerCase();
  const customMatch = norm.customModels.find(
    m => m.enabled !== false && m.id.toLowerCase() === lower && (!explicitProviderId || m.providerId === explicitProviderId)
  );
  const catalogMatch = !customMatch
    ? norm.cachedCatalogModels.find(
        m => m.id.toLowerCase() === lower && (!explicitProviderId || m.providerId === explicitProviderId)
      )
    : null;

  const targetProvId = explicitProviderId || customMatch?.providerId || catalogMatch?.providerId || "";
  const provider =
    enabledProviders.find(p => p.id === targetProvId) ||
    enabledProviders[0];

  const modelMeta = customMatch || catalogMatch || {
    id: cleanModel,
    name: cleanModel,
    providerId: provider.id,
    providerName: provider.name,
    ...inferContextAndCompactSpec(cleanModel),
    ...inferReasoningSpec(cleanModel)
  };

  return {
    modelId: customMatch?.id || catalogMatch?.id || cleanModel,
    provider,
    modelMeta
  };
}
