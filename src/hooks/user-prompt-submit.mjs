#!/usr/bin/env node
/**
 * Official Claude Code `UserPromptSubmit` Lifecycle Hook for `claude-multi-provider` (`/mp:*`).
 *
 * Capabilities:
 *  1. `/mp:use [model] [--agentic | --direct] [--effort <level>] [--global]`
 *     Pins an external LLM model for all subsequent messages in the current session (`0` Claude tokens).
 *  2. `/mp:off` (or `/mp:use off`)
 *     Unpins the external model and returns immediately to the native Claude model picker (`0` Claude tokens).
 *  3. Sticky Direct Mode (Default):
 *     Intercepts normal chat prompts locally BEFORE Anthropic's API is called, resolves `@file` workspace
 *     mentions safely inside `cwd`, maintains multi-turn session history, calls the external provider
 *     directly, and returns `{ decision: "block", reason }` — consuming `0` Claude tokens and working
 *     even when Claude account quota is 100% exhausted.
 *  4. Sticky Agentic Mode (`--agentic`):
 *     Injects `additionalContext` instructing Claude to delegate heavy reasoning/code generation to
 *     `mp_chat(model)` while keeping native `Read`/`Edit`/`Bash` workspace tools active.
 */
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../core/config-store.mjs";
import { callProviderModel } from "../core/protocol-adapter.mjs";
import {
  appendSessionTurn,
  clearSessionHistory,
  clearSessionPin,
  getSessionPin,
  resolveFuzzyModelTarget,
  setSessionPin
} from "../core/session-pin.mjs";

const VALID_EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);
const MAX_ATTACHED_FILES = 5;
const MAX_FILE_EXCERPT_CHARS = 32000;
const SENSITIVE_FILE_RE = /(?:^|[\\/])(?:\.env(?:\..+)?|.*\.(?:pem|key|pfx|p12|kdbx)|id_rsa.*|multi-provider\.json|credentials\.json)$/i;

function emitJson(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function emitPassThrough() {
  emitJson({});
}

function emitBlock(reason) {
  emitJson({
    decision: "block",
    reason: String(reason || "")
  });
}

function readStdinText() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", () => resolve(""));
  });
}

function formatEnabledModelsList(cfg) {
  const enabled = (cfg.customModels || []).filter((m) => m.enabled !== false);
  if (enabled.length === 0) {
    const cached = (cfg.cachedCatalogModels || []).slice(0, 8);
    if (cached.length === 0) {
      return "  (No models enabled yet — run `/mp:settings` to configure providers & models)";
    }
    return cached.map((m) => `  • ${m.id} (${m.providerName || m.providerId || "provider"})`).join("\n");
  }
  return enabled
    .slice(0, 15)
    .map((m) => {
      const defMark = cfg.defaultModel && cfg.defaultModel.toLowerCase() === m.id.toLowerCase() ? " [default]" : "";
      const ctxK = Math.round((Number(m.contextWindow) || 200000) / 1000) + "k";
      return `  • ${m.id} — ${m.providerName || m.providerId} (${ctxK} ctx)${defMark}`;
    })
    .join("\n");
}

function parseUseCommandArgs(argText) {
  const tokens = String(argText || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  let mode = "direct";
  let effort = "";
  let isGlobal = false;
  const positional = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const lower = t.toLowerCase();
    if (lower === "--agentic" || lower === "-a") {
      mode = "agentic";
    } else if (lower === "--direct" || lower === "-d") {
      mode = "direct";
    } else if (lower === "--global" || lower === "-g") {
      isGlobal = true;
    } else if ((lower === "--effort" || lower === "-e") && i + 1 < tokens.length) {
      const candidate = tokens[i + 1].toLowerCase();
      if (VALID_EFFORTS.has(candidate)) {
        effort = candidate;
        i += 1;
      }
    } else if (lower.startsWith("--effort=")) {
      const candidate = lower.slice("--effort=".length);
      if (VALID_EFFORTS.has(candidate)) effort = candidate;
    } else {
      positional.push(t);
    }
  }

  return {
    mode,
    effort,
    isGlobal,
    firstArg: positional[0] || "",
    inlinePrompt: positional.slice(1).join(" ").trim()
  };
}

function extractWorkspaceFileContext(promptText, cwd) {
  if (!cwd || typeof cwd !== "string") return "";
  let rootReal;
  try {
    rootReal = fs.realpathSync(cwd);
  } catch {
    return "";
  }
  const rootPrefix = rootReal.endsWith(path.sep) ? rootReal : rootReal + path.sep;

  const regex = /(?:^|\s)@([A-Za-z0-9_./\\-]+)/g;
  const seen = new Set();
  const blocks = [];
  let match;

  while ((match = regex.exec(promptText)) !== null) {
    if (blocks.length >= MAX_ATTACHED_FILES) break;
    const rawRel = match[1].replace(/[.,;:!?)]+$/, "");
    if (!rawRel || seen.has(rawRel)) continue;
    seen.add(rawRel);

    try {
      const candidate = path.resolve(rootReal, rawRel);
      if (candidate !== rootReal && !candidate.startsWith(rootPrefix)) continue;
      if (SENSITIVE_FILE_RE.test(candidate) || SENSITIVE_FILE_RE.test(rawRel)) continue;
      if (!fs.existsSync(candidate)) continue;
      const realCandidate = fs.realpathSync(candidate);
      if (realCandidate !== rootReal && !realCandidate.startsWith(rootPrefix)) continue;

      const st = fs.statSync(realCandidate);
      if (!st.isFile() || st.size > 512 * 1024) continue;

      const content = fs.readFileSync(realCandidate, "utf8");
      if (content.includes("\u0000")) continue; // Skip binary files
      const relDisplay = path.relative(rootReal, realCandidate).replace(/\\/g, "/");
      const excerpt =
        content.length > MAX_FILE_EXCERPT_CHARS
          ? content.slice(0, MAX_FILE_EXCERPT_CHARS) + "\n/* ... truncated ... */"
          : content;
      blocks.push(`<file path="${relDisplay}">\n${excerpt}\n</file>`);
    } catch {
      // Ignore unreadable or non-existent @mentions
    }
  }

  if (blocks.length === 0) return "";
  return `\n\n<workspace_files>\n${blocks.join("\n\n")}\n</workspace_files>`;
}

async function executeDirectTurn({ cfg, sessionId, pin, userPrompt, cwd, prefixBanner = "" }) {
  const fileContext = extractWorkspaceFileContext(userPrompt, cwd);
  const effectiveUserContent = fileContext ? `${userPrompt}${fileContext}` : userPrompt;
  const priorHistory = Array.isArray(pin.history) ? pin.history : [];
  const messages = [...priorHistory, { role: "user", content: effectiveUserContent }];

  const systemPrompt =
    "You are a senior software engineering and reasoning assistant responding inside Claude via claude-multi-provider (/mp:use direct mode). " +
    "Give concise, accurate, directly actionable Markdown responses.";

  const res = await callProviderModel(cfg, {
    model: pin.model,
    providerId: pin.providerId || "",
    messages,
    system: systemPrompt,
    effort: pin.effort || undefined,
    maxTokens: 8192,
    timeoutMs: 110000
  });

  if (!res.ok) {
    emitBlock(
      `${prefixBanner}⚠️ External model error [${pin.model} · ${pin.providerName || "provider"}]: ${res.error}\n` +
        `Tip: Run \`/mp:use <other-model>\` to switch models or \`/mp:off\` to return to native Claude.`
    );
    return;
  }

  appendSessionTurn(sessionId, userPrompt, res.text);

  const inTok = Number(res.usage?.input_tokens) || 0;
  const outTok = Number(res.usage?.output_tokens) || 0;
  const effortBadge = pin.effort ? ` · effort:${pin.effort}` : "";
  const header = `⚡ [${res.model} · ${res.providerName} · ${res.latencyMs}ms · in:${inTok} out:${outTok}${effortBadge} · 0 Claude tokens]`;
  const thinkingSection = res.thinking
    ? `\n<thinking>\n${res.thinking.slice(0, 1200)}${res.thinking.length > 1200 ? "…" : ""}\n</thinking>\n`
    : "";

  emitBlock(`${prefixBanner}${header}${thinkingSection}\n\n${res.text}`);
}

async function main() {
  const rawInput = await readStdinText();
  if (!rawInput || !rawInput.trim()) {
    emitPassThrough();
    return;
  }

  let payload;
  try {
    payload = JSON.parse(rawInput);
  } catch {
    emitPassThrough();
    return;
  }

  const sessionId = String(payload?.session_id || payload?.sessionId || "default");
  const cwd = String(payload?.cwd || process.cwd());
  const rawPrompt = String(payload?.prompt || "");
  const trimmed = rawPrompt.trim();

  if (!trimmed) {
    emitPassThrough();
    return;
  }

  // 1. Intercept `/mp:off` (or legacy `/multi-provider:off`) — 0 Claude tokens
  if (/^\/(?:mp|multi-provider):off(?:\s+.*)?$/i.test(trimmed)) {
    const hadPin = clearSessionPin(sessionId);
    emitBlock(
      hadPin
        ? "✓ External model unpinned. Subsequent messages now use your native Claude model selected in the bottom picker (0 Claude tokens)."
        : "ℹ️ Native Claude model is already active (no external model was pinned)."
    );
    return;
  }

  // 2. Intercept `/mp:reset` (clear external multi-turn memory) — 0 Claude tokens
  if (/^\/(?:mp|multi-provider):reset(?:\s+.*)?$/i.test(trimmed)) {
    clearSessionHistory(sessionId);
    const activePin = getSessionPin(sessionId);
    emitBlock(
      activePin
        ? `✓ Cleared external conversation memory for [${activePin.model}]. Pin remains active.`
        : "✓ External session history cleared."
    );
    return;
  }

  // 3. Intercept `/mp:use ...` (or legacy `/multi-provider:use ...`) — 0 Claude tokens
  const useMatch = trimmed.match(/^\/(?:mp|multi-provider):use(?:\s+([\s\S]*))?$/i);
  if (useMatch) {
    const cfg = loadConfig();
    const { mode, effort, isGlobal, firstArg, inlinePrompt } = parseUseCommandArgs(useMatch[1] || "");
    const subLower = firstArg.toLowerCase();

    if (["off", "none", "claude", "stop", "unpin", "disable"].includes(subLower)) {
      clearSessionPin(sessionId);
      emitBlock("✓ External model unpinned. Subsequent messages now use your native Claude model in the bottom picker.");
      return;
    }

    if (subLower === "reset" || subLower === "clear") {
      clearSessionHistory(sessionId);
      emitBlock("✓ External session memory cleared.");
      return;
    }

    const currentPin = getSessionPin(sessionId);
    if (subLower === "status" || subLower === "list" || (!firstArg && currentPin)) {
      const statusHeader = currentPin
        ? `● Active Pin: ${currentPin.model} (${currentPin.providerName || currentPin.providerId}) · mode: ${currentPin.mode}${currentPin.effort ? ` · effort: ${currentPin.effort}` : ""} · history: ${Math.floor((currentPin.history?.length || 0) / 2)} turn(s)`
        : "○ Active Pin: None (using native Claude bottom model picker)";
      emitBlock(
        `${statusHeader}\n\nEnabled External Models:\n${formatEnabledModelsList(cfg)}\n\n` +
          `Usage:\n` +
          `  /mp:use <model>             Pin external model in Direct Mode (0 Claude tokens — works even at 0% Claude quota)\n` +
          `  /mp:use <model> --agentic   Pin external model + keep Claude native Edit/Bash tools active\n` +
          `  /mp:off                     Switch back to native Claude model`
      );
      return;
    }

    try {
      const target = resolveFuzzyModelTarget(cfg, firstArg);
      const effectiveEffort = effort || "";
      const saved = setSessionPin(sessionId, {
        model: target.modelId,
        providerId: target.provider.id,
        providerName: target.provider.name,
        mode,
        effort: effectiveEffort,
        global: isGlobal,
        preserveHistory: true
      });

      const modeDesc =
        saved.mode === "agentic"
          ? "Agentic Mode (delegates reasoning to external model + keeps Claude Edit/Bash tools)"
          : "Direct Mode (0 Claude tokens — works even when Claude quota is exhausted)";

      const banner =
        `✓ Pinned [${target.modelId}] via ${target.provider.name} · ${modeDesc}${effectiveEffort ? ` · effort: ${effectiveEffort}` : ""}${isGlobal ? " · global" : ""}\n` +
        `  Chat normally from now on (use @path/to/file to attach local files). Run /mp:off anytime to switch back to Claude.`;

      if (inlinePrompt && saved.mode === "direct") {
        await executeDirectTurn({
          cfg,
          sessionId,
          pin: { ...saved, history: [] },
          userPrompt: inlinePrompt,
          cwd,
          prefixBanner: `${banner}\n\n`
        });
        return;
      }

      emitBlock(banner);
    } catch (err) {
      emitBlock(
        `⚠️ Cannot pin external model: ${err.message}\n\nEnabled External Models:\n${formatEnabledModelsList(cfg)}`
      );
    }
    return;
  }

  // 4. Let all other slash commands (`/mp:settings`, `/mp:models`, `/mp:ask`, `/mp:claude`, `/compact`, `/help`, etc.) pass through
  if (trimmed.startsWith("/")) {
    emitPassThrough();
    return;
  }

  // 5. Fast path for normal messages when NO pin is active (< 3ms, 0 side effects)
  const activePin = getSessionPin(sessionId);
  if (!activePin || !activePin.active || !activePin.model) {
    emitPassThrough();
    return;
  }

  // 6. Active Pin — Agentic Mode (`--agentic`): keep Claude's native tools while delegating reasoning to `mp_chat`
  if (activePin.mode === "agentic") {
    const effortClause = activePin.effort ? `, "effort": "${activePin.effort}"` : "";
    emitJson({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext:
          `[ACTIVE /mp:use OVERRIDE — AGENTIC MODE: ${activePin.model}]\n` +
          `Delegate primary reasoning, analysis, and code generation for this turn to the \`mp_chat\` MCP tool with \`{ "model": "${activePin.model}"${effortClause} }\`. ` +
          `Use your native Read/Edit/Bash tools to gather file context and apply workspace changes while keeping your own Claude wrapper tokens minimal.`
      }
    });
    return;
  }

  // 7. Active Pin — Direct Mode (Default): 0 Claude tokens, calls external model directly!
  const cfg = loadConfig();
  await executeDirectTurn({
    cfg,
    sessionId,
    pin: activePin,
    userPrompt: trimmed,
    cwd
  });
}

main().catch((err) => {
  emitBlock(`⚠️ Multi-Provider hook error: ${err?.message || err}\n(Run \`/mp:off\` to disable external model pin.)`);
});
