import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizeConfig, resolveModelTarget } from "./config-store.mjs";

const MAX_HISTORY_MESSAGES = 16;
const MAX_STORED_MESSAGE_CHARS = 24000;
const GLOBAL_SESSION_KEY = "_global";

export function getSessionsDir() {
  if (process.env.CMP_SESSIONS_DIR && String(process.env.CMP_SESSIONS_DIR).trim()) {
    return path.resolve(String(process.env.CMP_SESSIONS_DIR).trim());
  }
  return path.join(os.homedir(), ".claude", "mp-sessions");
}

function sanitizeSessionKey(sessionId) {
  const cleaned = String(sessionId || "")
    .trim()
    .replace(/[^A-Za-z0-9_.-]/g, "_")
    .slice(0, 96);
  return cleaned || GLOBAL_SESSION_KEY;
}

function getSessionFilePath(sessionKey) {
  return path.join(getSessionsDir(), `${sanitizeSessionKey(sessionKey)}.json`);
}

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return raw && typeof raw === "object" ? raw : null;
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, dataObj) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const payload = JSON.stringify(dataObj, null, 2) + "\n";
  fs.writeFileSync(tmpPath, payload, { encoding: "utf8", mode: 0o600 });
  try {
    fs.chmodSync(tmpPath, 0o600);
  } catch {
    // Best-effort on Windows
  }
  fs.renameSync(tmpPath, filePath);
}

/**
 * Resolves a user-supplied model query (exact ID or unambiguous shorthand substring)
 * against configured customModels and cachedCatalogModels before delegating to resolveModelTarget.
 */
export function resolveFuzzyModelTarget(cfg, rawQuery = "", explicitProviderId = "") {
  const norm = normalizeConfig(cfg);
  const q = String(rawQuery || "").trim();
  if (!q) {
    return resolveModelTarget(norm, "", explicitProviderId);
  }

  const lower = q.toLowerCase();
  const enabledCustom = norm.customModels.filter(m => m.enabled !== false);

  // 1. Exact ID match in enabled custom models or cached catalog
  const exactCustom = enabledCustom.find(m => m.id.toLowerCase() === lower);
  if (exactCustom) {
    return resolveModelTarget(norm, exactCustom.id, explicitProviderId || exactCustom.providerId);
  }
  const exactCat = norm.cachedCatalogModels.find(m => m.id.toLowerCase() === lower);
  if (exactCat) {
    return resolveModelTarget(norm, exactCat.id, explicitProviderId || exactCat.providerId);
  }

  // 2. Unambiguous substring match in enabled custom models first
  const subCustom = enabledCustom.filter(
    m => m.id.toLowerCase().includes(lower) || String(m.name || "").toLowerCase().includes(lower)
  );
  if (subCustom.length === 1) {
    return resolveModelTarget(norm, subCustom[0].id, explicitProviderId || subCustom[0].providerId);
  }

  // 3. Unambiguous substring match in cached catalog
  const subCat = norm.cachedCatalogModels.filter(m => m.id.toLowerCase().includes(lower));
  if (subCat.length === 1) {
    return resolveModelTarget(norm, subCat[0].id, explicitProviderId || subCat[0].providerId);
  }

  // 4. Pass raw ID straight through (supports arbitrary provider/gateway model slugs)
  return resolveModelTarget(norm, q, explicitProviderId);
}

/**
 * Returns the active pin state for `sessionId` (or global fallback if pinned globally), or `null`.
 */
export function getSessionPin(sessionId) {
  const key = sanitizeSessionKey(sessionId);
  const directData = readJsonSafe(getSessionFilePath(key));
  if (directData && directData.active === true && directData.model) {
    return {
      sessionKey: key,
      scope: key === GLOBAL_SESSION_KEY ? "global" : "session",
      active: true,
      model: String(directData.model),
      providerId: String(directData.providerId || ""),
      providerName: String(directData.providerName || ""),
      mode: directData.mode === "agentic" ? "agentic" : "direct",
      effort: String(directData.effort || ""),
      updatedAt: String(directData.updatedAt || ""),
      history: Array.isArray(directData.history) ? directData.history : []
    };
  }

  if (key !== GLOBAL_SESSION_KEY) {
    const globalData = readJsonSafe(getSessionFilePath(GLOBAL_SESSION_KEY));
    if (globalData && globalData.active === true && globalData.model) {
      return {
        sessionKey: key,
        scope: "global",
        active: true,
        model: String(globalData.model),
        providerId: String(globalData.providerId || ""),
        providerName: String(globalData.providerName || ""),
        mode: globalData.mode === "agentic" ? "agentic" : "direct",
        effort: String(globalData.effort || ""),
        updatedAt: String(globalData.updatedAt || ""),
        // Keep history isolated per sessionId even when global model pin is used
        history: Array.isArray(directData?.history) ? directData.history : []
      };
    }
  }

  return null;
}

/**
 * Pins an external model for subsequent turns in `sessionId` (or globally when `global: true`).
 */
export function setSessionPin(
  sessionId,
  {
    model,
    providerId = "",
    providerName = "",
    mode = "direct",
    effort = "",
    global = false,
    preserveHistory = true
  } = {}
) {
  const targetKey = global ? GLOBAL_SESSION_KEY : sanitizeSessionKey(sessionId);
  const filePath = getSessionFilePath(targetKey);
  const prev = readJsonSafe(filePath);
  const sameModel = prev && String(prev.model || "").toLowerCase() === String(model || "").toLowerCase();

  const nextState = {
    active: true,
    model: String(model || "").trim(),
    providerId: String(providerId || "").trim(),
    providerName: String(providerName || "").trim(),
    mode: mode === "agentic" ? "agentic" : "direct",
    effort: String(effort || "").trim(),
    updatedAt: new Date().toISOString(),
    history: preserveHistory && sameModel && Array.isArray(prev?.history) ? prev.history : []
  };

  writeJsonAtomic(filePath, nextState);
  return nextState;
}

/**
 * Clears active pin for both `sessionId` and any global pin so subsequent messages return to native Claude.
 */
export function clearSessionPin(sessionId) {
  const keys = new Set([sanitizeSessionKey(sessionId), GLOBAL_SESSION_KEY]);
  let clearedAny = false;
  for (const k of keys) {
    const fp = getSessionFilePath(k);
    const existing = readJsonSafe(fp);
    if (existing && existing.active) {
      clearedAny = true;
    }
    try {
      if (fs.existsSync(fp)) {
        fs.unlinkSync(fp);
      }
    } catch {
      // Ignore missing file race
    }
  }
  return clearedAny;
}

/**
 * Clears stored multi-turn external conversation history for `sessionId` without unpinning the model.
 */
export function clearSessionHistory(sessionId) {
  const key = sanitizeSessionKey(sessionId);
  const fp = getSessionFilePath(key);
  const existing = readJsonSafe(fp);
  if (!existing) return false;
  existing.history = [];
  existing.updatedAt = new Date().toISOString();
  writeJsonAtomic(fp, existing);
  return true;
}

/**
 * Appends a completed `(user, assistant)` exchange to `sessionId` history with bounded size.
 */
export function appendSessionTurn(sessionId, userText, assistantText) {
  const key = sanitizeSessionKey(sessionId);
  const fp = getSessionFilePath(key);
  const existing = readJsonSafe(fp) || {
    active: false,
    model: "",
    providerId: "",
    providerName: "",
    mode: "direct",
    effort: "",
    history: []
  };

  const history = Array.isArray(existing.history) ? [...existing.history] : [];
  const trimText = (s) => {
    const str = String(s || "");
    return str.length > MAX_STORED_MESSAGE_CHARS
      ? str.slice(0, MAX_STORED_MESSAGE_CHARS) + "\n...[truncated]"
      : str;
  };

  history.push({ role: "user", content: trimText(userText) });
  history.push({ role: "assistant", content: trimText(assistantText) });

  while (history.length > MAX_HISTORY_MESSAGES) {
    history.shift();
  }

  existing.history = history;
  existing.updatedAt = new Date().toISOString();
  writeJsonAtomic(fp, existing);
  return history;
}
