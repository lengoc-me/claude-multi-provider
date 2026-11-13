import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDefaultClaudeSettingsPath, loadConfig } from "./config-store.mjs";
import { inferContextAndCompactSpec } from "./catalog-spec.mjs";

/**
 * Syncs enabled custom models into `~/.claude/settings.json` (`modelPicker.options` + `modelSettings`)
 * ONLY when explicitly requested by the user. Creates a `.bak` backup before mutating an existing file.
 */
export function syncClaudeCliSettings(cfgInput = null, customSettingsPath = "") {
  const cfg = cfgInput || loadConfig();
  const settingsPath = customSettingsPath || getDefaultClaudeSettingsPath();
  const dir = path.dirname(settingsPath);
  fs.mkdirSync(dir, { recursive: true });

  let current = {};
  if (fs.existsSync(settingsPath)) {
    const raw = fs.readFileSync(settingsPath, "utf8");
    fs.writeFileSync(`${settingsPath}.bak`, raw, "utf8");
    try {
      current = JSON.parse(raw) || {};
    } catch {
      current = {};
    }
  }

  const enabledModels = (cfg.customModels || []).filter(m => m && m.id && m.enabled !== false);
  const pickerOptions = [];
  const seen = new Set();
  const nextModelSettings = { ...(current.modelSettings || {}) };

  for (const m of enabledModels) {
    const id = String(m.id).trim();
    if (!id || seen.has(id.toLowerCase())) continue;
    seen.add(id.toLowerCase());

    const spec = inferContextAndCompactSpec(m);
    const compactLim = Number(m.autoCompactLimit) > 0 ? Number(m.autoCompactLimit) : spec.autoCompactLimit;
    pickerOptions.push({
      model: id,
      label: String(m.name || id).trim(),
      behavesAs: String(m.behavesAs || cfg.defaultBehavesAs || "claude-opus-4-6").trim()
    });
    // Claude Code CLI subtracts 33,000 buffer tokens internally when computing autoCompactThreshold
    const cliAutoCompactWin = Math.min(1000000, Math.max(100000, compactLim + 33000));
    nextModelSettings[id] = {
      ...(nextModelSettings[id] || {}),
      autoCompactWindow: cliAutoCompactWin
    };
  }

  current.modelPicker = {
    options: pickerOptions,
    replaceBuiltInOptions: false
  };
  current.modelSettings = nextModelSettings;

  fs.writeFileSync(settingsPath, JSON.stringify(current, null, 2) + "\n", "utf8");
  return {
    ok: true,
    settingsPath,
    syncedCount: pickerOptions.length,
    gatewayEnvHint: `ANTHROPIC_BASE_URL=http://127.0.0.1:${cfg.gatewayPort || 18329}`
  };
}

/**
 * Discovers official Claude Desktop configuration file paths across Windows, macOS, and Linux.
 */
export function detectClaudeDesktopConfigPaths(explicitPath = "") {
  if (explicitPath) {
    return [path.resolve(explicitPath)];
  }
  const home = os.homedir();
  const platform = process.platform;

  if (platform === "darwin") {
    return [path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")];
  }
  if (platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    const candidates = [path.join(appData, "Claude", "claude_desktop_config.json")];
    const storeRoot = path.join(localAppData, "Claude-Data");
    if (fs.existsSync(storeRoot)) {
      try {
        for (const entry of fs.readdirSync(storeRoot, { withFileTypes: true })) {
          if (entry.isDirectory() && entry.name.toLowerCase().startsWith("claude_")) {
            candidates.push(path.join(storeRoot, entry.name, "claude_desktop_config.json"));
          }
        }
      } catch {
        // Ignore directory read error
      }
    }
    return candidates;
  }
  return [path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "Claude", "claude_desktop_config.json")];
}

/**
 * Safely registers `claude-multi-provider` inside `claude_desktop_config.json` with automatic `.bak` backup.
 */
export function installClaudeDesktopMcpConfig({
  explicitConfigPath = "",
  pluginRoot = path.resolve(import.meta.dirname, "..", ".."),
  serverName = "claude-multi-provider"
} = {}) {
  const targets = detectClaudeDesktopConfigPaths(explicitConfigPath);
  const mcpEntryScript = path.join(pluginRoot, "src", "mcp-server.mjs");
  const updatedPaths = [];

  for (const cfgPath of targets) {
    const parentDir = path.dirname(cfgPath);
    fs.mkdirSync(parentDir, { recursive: true });

    let parsed = {};
    if (fs.existsSync(cfgPath)) {
      const prevRaw = fs.readFileSync(cfgPath, "utf8");
      fs.writeFileSync(`${cfgPath}.bak`, prevRaw, "utf8");
      try {
        parsed = JSON.parse(prevRaw) || {};
      } catch {
        parsed = {};
      }
    }

    if (!parsed.mcpServers || typeof parsed.mcpServers !== "object") {
      parsed.mcpServers = {};
    }

    parsed.mcpServers[serverName] = {
      command: process.execPath,
      args: [mcpEntryScript]
    };

    fs.writeFileSync(cfgPath, JSON.stringify(parsed, null, 2) + "\n", "utf8");
    updatedPaths.push(cfgPath);
  }

  return {
    ok: true,
    serverName,
    updatedPaths
  };
}
