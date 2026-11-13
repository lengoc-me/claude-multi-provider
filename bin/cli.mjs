#!/usr/bin/env node
/**
 * Unified CLI for `claude-multi-provider`.
 */
import path from "node:path";
import { loadConfig, redactConfigForClient } from "../src/core/config-store.mjs";
import { openUrlInBrowser, startDashboardServer } from "../src/core/dashboard-server.mjs";
import { startGatewayServer } from "../src/core/gateway-server.mjs";
import { McpDispatcher } from "../src/core/mcp-dispatcher.mjs";
import { installClaudeDesktopMcpConfig, syncClaudeCliSettings } from "../src/core/cli-sync.mjs";

const args = process.argv.slice(2);
const cmd = (args[0] || "help").toLowerCase();

function getFlagValue(flag) {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return "";
}

function printHelp() {
  console.log(`claude-multi-provider v1.1.0

Usage:
  claude-multi-provider <command> [options]

Commands:
  mcp                         Start the MCP stdio server (used by Claude Plugin / Desktop)
  dashboard [--port N]        Start the Settings & Model Catalog Web UI (default: 127.0.0.1:18320)
  gateway   [--port N]        Start the Anthropic-compatible Gateway (default: 127.0.0.1:18329)
  serve                       Start both the Settings Dashboard and Local Gateway together
  install-desktop [--config]  Register MCP server into official claude_desktop_config.json
  sync-cli [--settings]       Opt-in: sync enabled models into ~/.claude/settings.json modelPicker
  status                      Print redacted provider & model configuration summary
  help                        Show this help message

Options:
  --no-open                   Do not auto-launch browser when starting dashboard
  --port <number>             Override listen port
  --config <path>             Explicit claude_desktop_config.json target path
  --settings <path>           Explicit ~/.claude/settings.json target path
`);
}

async function main() {
  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    printHelp();
    return;
  }
  if (cmd === "--version" || cmd === "-v" || cmd === "version") {
    console.log("1.1.0");
    return;
  }
  if (cmd === "mcp") {
    await import("../src/mcp-server.mjs");
    return;
  }
  if (cmd === "status") {
    const cfg = redactConfigForClient(loadConfig());
    console.log(JSON.stringify({
      providers: cfg.providers,
      defaultModel: cfg.defaultModel,
      enabledModelsCount: cfg.customModels.filter(m => m.enabled !== false).length,
      cachedCatalogCount: cfg.cachedCatalogModels.length,
      dashboardPort: cfg.dashboardPort,
      gatewayPort: cfg.gatewayPort
    }, null, 2));
    return;
  }
  if (cmd === "install-desktop") {
    const explicitConfigPath = getFlagValue("--config");
    const res = installClaudeDesktopMcpConfig({
      explicitConfigPath,
      pluginRoot: path.resolve(import.meta.dirname, "..")
    });
    console.log("Registered claude-multi-provider in Claude Desktop:");
    for (const p of res.updatedPaths) {
      console.log("  - " + p);
    }
    return;
  }
  if (cmd === "sync-cli") {
    const explicitSettings = getFlagValue("--settings");
    const res = syncClaudeCliSettings(null, explicitSettings);
    console.log(`Synced ${res.syncedCount} custom model(s) to ${res.settingsPath}`);
    console.log(`Run Claude Code CLI with: ${res.gatewayEnvHint} claude`);
    return;
  }
  if (cmd === "gateway") {
    const portFlag = getFlagValue("--port");
    const gw = await startGatewayServer({
      host: "127.0.0.1",
      port: portFlag ? Number(portFlag) : undefined
    });
    console.log(`Anthropic-compatible Multi-Provider Gateway listening on ${gw.url}`);
    return;
  }
  if (cmd === "dashboard" || cmd === "serve") {
    const portFlag = getFlagValue("--port");
    let gw = null;
    if (cmd === "serve") {
      try {
        gw = await startGatewayServer({ host: "127.0.0.1" });
        console.log(`Local Anthropic Gateway listening on ${gw.url}`);
      } catch (err) {
        console.warn(`Gateway port already in use or unavailable (${err.message}); continuing with Dashboard.`);
      }
    }
    let dashRef = null;
    const dispatcher = new McpDispatcher({
      ensureDashboard: async () => dashRef,
      ensureGateway: async () => {
        if (!gw) gw = await startGatewayServer({ host: "127.0.0.1" });
        return { running: true, url: gw.url };
      },
      getGatewayStatus: () => ({ running: Boolean(gw), url: gw ? gw.url : "" })
    });
    dashRef = await startDashboardServer({
      host: "127.0.0.1",
      port: portFlag ? Number(portFlag) : undefined,
      mcpDispatcher: dispatcher,
      getGatewayInfo: () => ({ running: Boolean(gw), url: gw ? gw.url : "" })
    });
    console.log(`Settings & Model Catalog Dashboard ready at:`);
    console.log(`  ${dashRef.authenticatedUrl}`);
    if (!args.includes("--no-open") && process.env.CMP_NO_BROWSER !== "1") {
      openUrlInBrowser(dashRef.authenticatedUrl);
    }
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  printHelp();
  process.exit(1);
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
