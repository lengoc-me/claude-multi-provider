#!/usr/bin/env node
/**
 * Deterministic Visual Assets Generator for `claude-multi-provider`.
 * Renders:
 *  1. `.claude-plugin/icon.png` + `assets/icon.png` (1024x1024 transparent-outer paper-sketch icon)
 *  2. `assets/icon.ico` (multi-size 16/24/32/48/64/128/256 ICO)
 *  3. `assets/cover-banner.png` (1280x640 @2x -> 2560x1280 GitHub Hero Cover & Social Preview)
 *  4. `assets/architecture-diagram.png` (1440x860 @2x -> 2880x1720 End-to-End Mechanism Blueprint)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const ASSETS_DIR = path.join(ROOT, "assets");
const PLUGIN_DIR = path.join(ROOT, ".claude-plugin");
const ICON_SVG_PATH = path.join(ASSETS_DIR, "icon.svg");

function findChromiumBinary() {
  const candidates = [
    process.env.CHROME_BIN,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ].filter(Boolean);
  return candidates.find(p => fs.existsSync(p)) || null;
}

function buildCoverHtml(iconSvg) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 1280px;
    height: 640px;
    overflow: hidden;
    background: #f5f2ea;
    color: #18181b;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .canvas {
    position: relative;
    width: 1280px;
    height: 640px;
    padding: 54px 64px;
    display: grid;
    grid-template-columns: 1.18fr 0.82fr;
    gap: 44px;
    align-items: center;
    background:
      radial-gradient(circle at 86% 18%, rgba(201, 100, 66, 0.14), transparent 44%),
      radial-gradient(circle at 12% 88%, rgba(110, 51, 29, 0.08), transparent 42%),
      #f5f2ea;
    border: 1px solid #dfdacf;
  }
  .grid-bg {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(to right, rgba(24, 24, 27, 0.035) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(24, 24, 27, 0.035) 1px, transparent 1px);
    background-size: 32px 32px;
    pointer-events: none;
  }
  .left {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .kicker-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .pill-kicker {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 13px;
    border-radius: 999px;
    background: #ffffff;
    border: 1px solid rgba(110, 51, 29, 0.22);
    color: #6e331d;
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
  }
  .pill-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #16a34a;
  }
  .brand-lockup {
    display: flex;
    align-items: center;
    gap: 20px;
  }
  .icon-box {
    width: 96px;
    height: 96px;
    flex-shrink: 0;
    filter: drop-shadow(0 8px 18px rgba(110, 51, 29, 0.16));
  }
  .icon-box svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  h1 {
    font-size: 46px;
    line-height: 1.08;
    font-weight: 750;
    letter-spacing: -0.028em;
    color: #18181b;
  }
  h1 span {
    color: #a84928;
  }
  .subtitle {
    font-size: 18.5px;
    line-height: 1.5;
    color: #4b4944;
    max-width: 650px;
  }
  .subtitle strong {
    color: #18181b;
    font-weight: 600;
  }
  .cmd-box {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    background: #1c1b1a;
    color: #f6f4ee;
    padding: 13px 18px;
    border-radius: 11px;
    font-family: Consolas, "SFMono-Regular", ui-monospace, monospace;
    font-size: 14px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 10px 24px rgba(24, 24, 27, 0.12);
    width: fit-content;
  }
  .cmd-prompt {
    color: #e58c68;
    font-weight: 700;
  }
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
    margin-top: 2px;
  }
  .badge {
    padding: 6px 12px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.85);
    border: 1px solid rgba(24, 24, 27, 0.13);
    font-size: 13px;
    font-weight: 550;
    color: #2f2e2b;
  }
  .badge.accent {
    background: #f8ebe2;
    border-color: rgba(168, 73, 40, 0.3);
    color: #6e331d;
  }

  /* Right Visual Stack */
  .right {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .mock-window {
    background: #ffffff;
    border: 1px solid rgba(24, 24, 27, 0.15);
    border-radius: 16px;
    padding: 20px;
    box-shadow: 0 18px 40px rgba(24, 24, 27, 0.09);
  }
  .win-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 14px;
    margin-bottom: 14px;
    border-bottom: 1px solid rgba(24, 24, 27, 0.09);
  }
  .dots {
    display: flex;
    gap: 6px;
  }
  .dots i {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: block;
    background: #dedad0;
  }
  .dots i:first-child { background: #e07a5f; }
  .dots i:nth-child(2) { background: #e9c46a; }
  .dots i:nth-child(3) { background: #6ab07c; }
  .win-tag {
    font-family: Consolas, ui-monospace, monospace;
    font-size: 11.5px;
    color: #166534;
    background: #dcfce7;
    border: 1px solid #bbf7d0;
    padding: 3px 9px;
    border-radius: 999px;
    font-weight: 600;
  }
  .route-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 11px 13px;
    border-radius: 10px;
    background: #faf9f5;
    border: 1px solid rgba(24, 24, 27, 0.1);
    margin-bottom: 9px;
  }
  .route-card:last-child {
    margin-bottom: 0;
  }
  .route-left {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .route-name {
    font-size: 14px;
    font-weight: 650;
    color: #18181b;
    white-space: nowrap;
  }
  .route-sub {
    font-size: 11.5px;
    color: #62605b;
    font-family: Consolas, ui-monospace, monospace;
    white-space: nowrap;
  }
  .route-pill {
    font-size: 11.5px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 6px;
    background: #f5ebe4;
    color: #7c371e;
    border: 1px solid rgba(124, 55, 30, 0.22);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .route-pill.teal {
    background: #e1efee;
    color: #18696a;
    border-color: rgba(24, 105, 106, 0.24);
  }
  .route-pill.indigo {
    background: #e9e9f6;
    color: #4b4f9e;
    border-color: rgba(75, 79, 158, 0.24);
  }
  .footer-strip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 12px;
    background: #ede9de;
    border: 1px solid rgba(24, 24, 27, 0.11);
    font-size: 12.5px;
    color: #3f3d38;
    font-weight: 550;
    white-space: nowrap;
  }
  .footer-strip code {
    font-family: Consolas, ui-monospace, monospace;
    color: #6e331d;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
  }
</style>
</head>
<body>
  <div class="canvas">
    <div class="grid-bg"></div>
    <div class="left">
      <div class="kicker-row">
        <span class="pill-kicker"><span class="pill-dot"></span> Official Claude Plugin &amp; .mcpb Extension</span>
      </div>
      <div class="brand-lockup">
        <div class="icon-box">${iconSvg}</div>
        <div>
          <h1>Claude <span>Multi-Provider</span></h1>
        </div>
      </div>
      <p class="subtitle">
        Connect <strong>CLIProxyAPI (CPA)</strong>, <strong>OpenRouter</strong>, <strong>OpenAI</strong>, <strong>Gemini</strong>, <strong>DeepSeek</strong>, and <strong>Ollama</strong> inside Official Claude — <strong>zero binary patching</strong>.
      </p>
      <div class="cmd-box">
        <span class="cmd-prompt">/plugin</span>
        <span>install mp --marketplace lengoc-me/claude-multi-provider</span>
      </div>
      <div class="badges">
        <span class="badge accent">/mp:use &lt;model&gt; · 0 Claude Tokens</span>
        <span class="badge">/mp:settings · /mp:off</span>
        <span class="badge">@mp-coder · @mp-reviewer · @mp-council</span>
        <span class="badge">Zero npm Dependencies</span>
      </div>
    </div>

    <div class="right">
      <div class="mock-window">
        <div class="win-head">
          <div class="dots"><i></i><i></i><i></i></div>
          <span style="font-size:12.5px;font-weight:600;color:#4b4944;">Model Catalog &amp; Protocol Bridge</span>
          <span class="win-tag">127.0.0.1 Only</span>
        </div>

        <div class="route-card">
          <div class="route-left">
            <span class="route-name">CLIProxyAPI (CPA) &amp; LiteLLM</span>
            <span class="route-sub">/v1/models + /v1beta/models sync</span>
          </div>
          <span class="route-pill">90% Auto-Compact</span>
        </div>

        <div class="route-card">
          <div class="route-left">
            <span class="route-name">Gemini 2.5 Pro · GPT-4.1 · DeepSeek R1</span>
            <span class="route-sub">Effort: low · medium · high · max</span>
          </div>
          <span class="route-pill indigo">Parallel Council</span>
        </div>

        <div class="route-card">
          <div class="route-left">
            <span class="route-name">OpenRouter · Groq · Ollama</span>
            <span class="route-sub">OpenAI SSE ↔ Anthropic /v1/messages</span>
          </div>
          <span class="route-pill teal">0600 Masked Vault</span>
        </div>
      </div>

      <div class="footer-strip">
        <span>Unmodified Claude Desktop &amp; Claude Code</span>
        <code>Elastic-2.0 (ELv2) · Node &gt;= 18</code>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function buildArchitectureHtml(iconSvg) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 1480px;
    height: 860px;
    overflow: hidden;
    background: #faf9f5;
    color: #1a1a1a;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .board {
    position: relative;
    width: 1480px;
    height: 860px;
    padding: 36px 44px;
    background: #f5f3ec;
    border: 1px solid #e2ded2;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 18px;
    border-bottom: 1px solid #dedad0;
  }
  .h-left {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .h-icon {
    width: 46px;
    height: 46px;
  }
  .h-icon svg { width: 100%; height: 100%; display: block; }
  .h-kicker {
    font-family: Consolas, ui-monospace, monospace;
    font-size: 11.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #6e331d;
    font-weight: 700;
  }
  .h-title {
    font-size: 24px;
    font-weight: 700;
    color: #18181b;
    letter-spacing: -0.015em;
  }
  .legend {
    display: flex;
    align-items: center;
    gap: 16px;
    background: #ffffff;
    padding: 8px 16px;
    border-radius: 999px;
    border: 1px solid #dcd8cc;
    font-size: 12px;
    color: #4a4842;
    font-weight: 550;
  }
  .leg-item {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }
  .swatch {
    width: 22px;
    height: 3px;
    border-radius: 2px;
  }
  .swatch.mcp { background: #4b4f9e; }
  .swatch.gw { background: #a84928; }
  .swatch.ui { background: #18696a; }

  /* 3-Column Stage */
  .stage {
    position: relative;
    display: grid;
    grid-template-columns: 370px 490px 360px;
    justify-content: space-between;
    align-items: stretch;
    height: 645px;
    margin-top: 16px;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 14px;
    z-index: 2;
  }
  .col-zone {
    flex: 1;
    border-radius: 16px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 13px;
  }
  .zone-clients {
    background: #eeece4;
    border: 1.5px solid #d5d1c4;
  }
  .zone-engine {
    background: #ffffff;
    border: 2px solid #c96442;
    box-shadow: 0 14px 34px rgba(110, 51, 29, 0.08);
  }
  .zone-upstreams {
    background: #edf1f6;
    border: 1.5px solid #c6d3e3;
  }
  .zone-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(24, 24, 27, 0.09);
  }
  .zone-label {
    font-family: Consolas, ui-monospace, monospace;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #52504a;
  }
  .zone-badge {
    font-family: Consolas, ui-monospace, monospace;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(24, 24, 27, 0.06);
    color: #3f3d38;
    font-weight: 600;
  }
  .zone-engine .zone-label { color: #9c4021; }
  .zone-engine .zone-badge {
    background: #dcfce7;
    color: #166534;
    border: 1px solid #bbf7d0;
  }
  .zone-upstreams .zone-label { color: #264b7d; }

  .node-card {
    background: #ffffff;
    border: 1.5px solid rgba(24, 24, 27, 0.14);
    border-radius: 12px;
    padding: 13px 15px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.025);
  }
  .node-card.indigo {
    background: #f4f4fb;
    border-color: #9ea2db;
  }
  .node-card.teal {
    background: #eff7f6;
    border-color: #84bcbc;
  }
  .node-card.amber {
    background: #fdf6ec;
    border-color: #deb97c;
  }
  .node-card.plum {
    background: #faf1f6;
    border-color: #d49ec2;
  }
  .node-card.vault {
    background: #f4f7f2;
    border-color: #9dc29b;
  }
  .node-card.blue {
    background: #ffffff;
    border-color: #9cb6d9;
  }
  .node-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .node-title {
    font-size: 14.5px;
    font-weight: 700;
    color: #18181b;
  }
  .node-port {
    font-family: Consolas, ui-monospace, monospace;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 5px;
    background: rgba(24, 24, 27, 0.07);
    color: #2f2e2b;
  }
  .node-desc {
    font-size: 12.5px;
    line-height: 1.42;
    color: #4b4944;
  }
  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 3px;
  }
  .chip {
    font-family: Consolas, ui-monospace, monospace;
    font-size: 11px;
    padding: 2px 7px;
    border-radius: 5px;
    background: #ffffff;
    border: 1px solid rgba(24, 24, 27, 0.14);
    color: #27272a;
    font-weight: 600;
  }

  /* SVG Connector Overlay */
  .wires {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 3;
    pointer-events: none;
  }

  .footer-note {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 12px;
    border-top: 1px solid #dedad0;
    font-size: 12.5px;
    color: #57554f;
  }
  .footer-note strong { color: #18181b; }
  .footer-note code {
    font-family: Consolas, ui-monospace, monospace;
    background: #eae6da;
    padding: 2px 6px;
    border-radius: 4px;
    color: #6e331d;
  }
</style>
</head>
<body>
  <div class="board">
    <div class="header">
      <div class="h-left">
        <div class="h-icon">${iconSvg}</div>
        <div>
          <div class="h-kicker">End-to-End Architecture &amp; Security Boundary</div>
          <div class="h-title">How Claude Multi-Provider Works (Zero Binary Patching)</div>
        </div>
      </div>
      <div class="legend">
        <span class="leg-item"><span class="swatch mcp"></span> JSON-RPC / MCP Dispatch</span>
        <span class="leg-item"><span class="swatch gw"></span> Anthropic / OpenAI SSE Stream</span>
        <span class="leg-item"><span class="swatch ui"></span> Loopback CSRF-Guarded Config</span>
      </div>
    </div>

    <div class="stage">
          <!-- Column 1: Official Claude Surfaces -->
      <div class="col">
        <div class="col-zone zone-clients">
          <div class="zone-header">
            <span class="zone-label">1. Official Claude Surfaces</span>
            <span class="zone-badge" style="white-space:nowrap;">Unmodified</span>
          </div>

          <div class="node-card" style="margin-top:4px;">
            <div class="node-top">
              <span class="node-title">Claude Desktop</span>
              <span class="node-port" style="white-space:nowrap;">.mcpb</span>
            </div>
            <p class="node-desc">1-click Extension or <code>claude_desktop_config.json</code>.</p>
            <div class="chip-row">
              <span class="chip">Settings → Extensions</span>
              <span class="chip">OS Keychain</span>
            </div>
          </div>

          <div class="node-card">
            <div class="node-top">
              <span class="node-title">Claude Code Plugin</span>
              <span class="node-port" style="white-space:nowrap;">/plugin</span>
            </div>
            <p class="node-desc">Sticky 0-token hook, <code>/mp:*</code> commands &amp; subagents.</p>
            <div class="chip-row">
              <span class="chip">/mp:use · /mp:off</span>
              <span class="chip">/mp:*</span>
              <span class="chip">@mp-council</span>
            </div>
          </div>

          <div class="node-card">
            <div class="node-top">
              <span class="node-title">Claude Code CLI</span>
              <span class="node-port" style="white-space:nowrap;">Optional</span>
            </div>
            <p class="node-desc">Native <code>/model</code> picker via <code>sync-cli</code> + <code>ANTHROPIC_BASE_URL</code>.</p>
            <div class="chip-row">
              <span class="chip">modelPicker.options</span>
              <span class="chip">autoCompactWindow</span>
            </div>
          </div>

          <div class="node-card">
            <div class="node-top">
              <span class="node-title">Local Browser</span>
              <span class="node-port" style="white-space:nowrap;">Settings UI</span>
            </div>
            <p class="node-desc">Configure providers, fetch catalogs, and test latency.</p>
          </div>
        </div>
      </div>

      <!-- Column 2: Local Multi-Provider Engine -->
      <div class="col">
        <div class="col-zone zone-engine">
          <div class="zone-header">
            <span class="zone-label">2. Local Multi-Provider Engine</span>
            <span class="zone-badge" style="white-space:nowrap;">127.0.0.1 Only</span>
          </div>

          <div class="node-card indigo">
            <div class="node-top">
              <span class="node-title">MCP Dispatcher (7 Tools)</span>
              <span class="node-port" style="white-space:nowrap;">stdio + /mcp</span>
            </div>
            <p class="node-desc"><code>mp_chat</code>, <code>mp_compare_models</code> (2–5 parallel), <code>mp_list_models</code>, <code>mp_open_settings</code>.</p>
          </div>

          <div class="node-card teal">
            <div class="node-top">
              <span class="node-title">Settings &amp; Catalog UI</span>
              <span class="node-port" style="white-space:nowrap;">127.0.0.1:18320</span>
            </div>
            <p class="node-desc">Guarded by <code>X-CMP-Token</code> + <code>SameSite=Strict</code> cookie &amp; Host/Origin checks.</p>
          </div>

          <div class="node-card amber">
            <div class="node-top">
              <span class="node-title">Local Anthropic Gateway</span>
              <span class="node-port" style="white-space:nowrap;">127.0.0.1:18329</span>
            </div>
            <p class="node-desc"><code>POST /v1/messages</code> SSE · Custom models → Upstreams · <code>claude-*</code> → Anthropic.</p>
          </div>

          <div class="node-card plum">
            <div class="node-top">
              <span class="node-title">Protocol &amp; Catalog Adapter</span>
              <span class="node-port" style="white-space:nowrap;">Auto Fallback</span>
            </div>
            <p class="node-desc"><code>/v1/messages</code> ↔ <code>/v1/chat/completions</code> (SSE, thinking, tools) + <code>/v1beta/models</code>.</p>
          </div>

          <div class="node-card vault">
            <div class="node-top">
              <span class="node-title">Config &amp; Secret Store</span>
              <span class="node-port" style="white-space:nowrap;">chmod 0600</span>
            </div>
            <p class="node-desc"><code>~/.claude/multi-provider.json</code> · Masked keys (<code>••••</code>) + automatic <code>.bak</code> backups.</p>
          </div>
        </div>
      </div>

      <!-- Column 3: Upstream Providers -->
      <div class="col">
        <div class="col-zone zone-upstreams">
          <div class="zone-header">
            <span class="zone-label">3. Upstream Providers</span>
            <span class="zone-badge" style="white-space:nowrap;">HTTPS / Local</span>
          </div>

          <div class="node-card blue" style="margin-top:4px;">
            <div class="node-top">
              <span class="node-title">CLIProxyAPI &amp; LiteLLM</span>
              <span class="node-port" style="white-space:nowrap;">Unified Proxy</span>
            </div>
            <p class="node-desc">Multi-account gateways (Anthropic &amp; OpenAI specs).</p>
          </div>

          <div class="node-card blue">
            <div class="node-top">
              <span class="node-title">OpenRouter · OpenAI · Groq</span>
              <span class="node-port" style="white-space:nowrap;">OpenAI Spec</span>
            </div>
            <p class="node-desc"><code>/v1/chat/completions</code> &amp; <code>/v1/models</code> with effort &amp; tools.</p>
          </div>

          <div class="node-card blue">
            <div class="node-top">
              <span class="node-title">Google Gemini &amp; DeepSeek</span>
              <span class="node-port" style="white-space:nowrap;">1M+ Context</span>
            </div>
            <p class="node-desc"><code>/v1beta/models</code> context limits + <code>90%</code> auto-compact.</p>
          </div>

          <div class="node-card blue">
            <div class="node-top">
              <span class="node-title">Ollama &amp; LM Studio</span>
              <span class="node-port" style="white-space:nowrap;">localhost</span>
            </div>
            <p class="node-desc">Offline local models on <code>:11434/v1</code> or <code>:1234/v1</code>.</p>
          </div>

          <div class="node-card" style="background:#f7f5f0;border-style:dashed;">
            <div class="node-top">
              <span class="node-title">Anthropic Official API</span>
              <span class="node-port" style="white-space:nowrap;">Passthrough</span>
            </div>
            <p class="node-desc">Built-in <code>claude-*</code> models route directly to Anthropic.</p>
          </div>
        </div>
      </div>

      <!-- Crisp Vector Connectors Between Columns -->
      <svg class="wires" viewBox="0 0 1392 645" preserveAspectRatio="none">
        <defs>
          <marker id="arr-mcp" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 1 L10 5 L0 9 Z" fill="#4b4f9e" />
          </marker>
          <marker id="arr-gw" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 1 L10 5 L0 9 Z" fill="#a84928" />
          </marker>
          <marker id="arr-ui" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 1 L10 5 L0 9 Z" fill="#18696a" />
          </marker>
        </defs>

        <!-- Left Col (x=370) -> Center Col (x=460) -->
        <!-- Desktop -> MCP Dispatcher -->
        <path d="M 370 128 C 415 128, 415 108, 458 108" fill="none" stroke="#4b4f9e" stroke-width="2.6" marker-end="url(#arr-mcp)" />
        <!-- Plugin -> MCP Dispatcher -->
        <path d="M 370 278 C 415 278, 415 126, 458 126" fill="none" stroke="#4b4f9e" stroke-width="2.6" marker-end="url(#arr-mcp)" />
        <!-- CLI -> Local Anthropic Gateway -->
        <path d="M 370 432 C 415 432, 415 338, 458 338" fill="none" stroke="#a84928" stroke-width="2.6" marker-end="url(#arr-gw)" />
        <!-- Browser -> Settings Dashboard -->
        <path d="M 370 566 C 420 566, 415 228, 458 228" fill="none" stroke="#18696a" stroke-width="2.4" stroke-dasharray="6 4" marker-end="url(#arr-ui)" />

        <!-- Center Col (x=950) -> Right Col (x=1032) -->
        <!-- Adapter -> CPA -->
        <path d="M 950 442 C 992 442, 990 120, 1030 120" fill="none" stroke="#a84928" stroke-width="2.6" marker-end="url(#arr-gw)" />
        <!-- Adapter -> OpenRouter/OpenAI -->
        <path d="M 950 452 C 992 452, 990 238, 1030 238" fill="none" stroke="#a84928" stroke-width="2.6" marker-end="url(#arr-gw)" />
        <!-- Adapter -> Gemini/DeepSeek -->
        <path d="M 950 462 C 992 462, 990 356, 1030 356" fill="none" stroke="#a84928" stroke-width="2.6" marker-end="url(#arr-gw)" />
        <!-- Adapter -> Ollama -->
        <path d="M 950 472 C 992 472, 990 472, 1030 472" fill="none" stroke="#a84928" stroke-width="2.6" marker-end="url(#arr-gw)" />
        <!-- Gateway -> Official Anthropic Passthrough -->
        <path d="M 950 345 C 995 345, 992 578, 1030 578" fill="none" stroke="#6f6f6a" stroke-width="2.2" stroke-dasharray="5 4" marker-end="url(#arr-gw)" />
      </svg>
    </div>

    <div class="footer-note">
      <span><strong>Privacy &amp; Security Guarantee:</strong> Zero telemetry · Zero external npm packages · All credentials stay on <code>127.0.0.1</code> inside <code>~/.claude/multi-provider.json</code> (<code>0600</code>).</span>
      <span><code>github.com/lengoc-me/claude-multi-provider</code></span>
    </div>
  </div>
</body>
</html>`;
}

function buildDesktopExtensionConfigHtml(iconSvg) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html {
    width: 1400px;
    height: 860px;
    overflow: hidden;
    background: #eae7df;
  }
  body {
    width: 1400px;
    height: 860px;
    overflow: hidden;
    background: #eae7df;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
    color: #18181b;
    -webkit-font-smoothing: antialiased;
    padding: 28px 34px;
  }
  .window {
    width: 100%;
    height: 100%;
    background: #faf9f5;
    border-radius: 16px;
    border: 1px solid rgba(24, 24, 27, 0.16);
    box-shadow: 0 24px 60px rgba(24, 24, 27, 0.14);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .titlebar {
    height: 44px;
    background: #f1efe8;
    border-bottom: 1px solid rgba(24, 24, 27, 0.1);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 18px;
  }
  .traffic { display: flex; gap: 8px; }
  .traffic span { width: 12px; height: 12px; border-radius: 50%; display: block; }
  .traffic span:nth-child(1) { background: #ff5f57; }
  .traffic span:nth-child(2) { background: #febc2e; }
  .traffic span:nth-child(3) { background: #28c840; }
  .win-title {
    font-size: 13px;
    font-weight: 600;
    color: #4b4944;
  }
  .win-pill {
    font-size: 11.5px;
    font-weight: 600;
    color: #6e331d;
    background: #f5ebe2;
    border: 1px solid rgba(110, 51, 29, 0.22);
    padding: 3px 10px;
    border-radius: 999px;
  }
  .body {
    flex: 1;
    display: grid;
    grid-template-columns: 240px 1fr;
    min-height: 0;
  }
  .sidebar {
    background: #f3f1ea;
    border-right: 1px solid rgba(24, 24, 27, 0.1);
    padding: 22px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .side-heading {
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #716f68;
    padding: 4px 12px 10px;
  }
  .side-item {
    padding: 9px 12px;
    border-radius: 8px;
    font-size: 13.5px;
    color: #3f3d38;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .side-item.active {
    background: #ffffff;
    color: #18181b;
    font-weight: 600;
    border: 1px solid rgba(24, 24, 27, 0.12);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  }
  .content {
    padding: 28px 42px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .breadcrumb {
    font-size: 13px;
    color: #6e6c65;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .breadcrumb strong { color: #18181b; }
  .ext-header {
    background: #ffffff;
    border: 1px solid rgba(24, 24, 27, 0.12);
    border-radius: 14px;
    padding: 20px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
  }
  .ext-left {
    display: flex;
    align-items: center;
    gap: 18px;
  }
  .ext-icon {
    width: 64px;
    height: 64px;
    flex-shrink: 0;
  }
  .ext-icon svg { width: 100%; height: 100%; display: block; }
  .ext-title {
    font-size: 20px;
    font-weight: 700;
    color: #18181b;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .ver {
    font-size: 12px;
    font-family: Consolas, ui-monospace, monospace;
    background: #f1efe8;
    color: #52504a;
    padding: 2px 8px;
    border-radius: 6px;
    font-weight: 600;
  }
  .ext-desc {
    font-size: 13.5px;
    color: #57554f;
    margin-top: 4px;
    max-width: 680px;
    line-height: 1.42;
  }
  .ext-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }
  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 6px 13px;
    border-radius: 999px;
    background: #dcfce7;
    color: #166534;
    font-size: 12.5px;
    font-weight: 600;
    border: 1px solid #bbf7d0;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .status-pill i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #16a34a;
    display: block;
    flex-shrink: 0;
  }
  .toggle {
    width: 44px;
    height: 24px;
    border-radius: 999px;
    background: #c96442;
    position: relative;
  }
  .toggle::after {
    content: "";
    position: absolute;
    top: 3px;
    right: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #ffffff;
  }
  .form-card {
    background: #ffffff;
    border: 1px solid rgba(24, 24, 27, 0.12);
    border-radius: 14px;
    padding: 22px 26px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
  }
  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(24, 24, 27, 0.08);
    padding-bottom: 12px;
  }
  .card-head h2 {
    font-size: 15.5px;
    font-weight: 650;
  }
  .keychain-note {
    font-size: 12px;
    color: #18696a;
    background: #e1efee;
    padding: 4px 10px;
    border-radius: 6px;
    font-weight: 600;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px 22px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .field label {
    font-size: 12.5px;
    font-weight: 600;
    color: #3f3d38;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .field label span {
    font-weight: 500;
    color: #78756e;
    font-size: 11.5px;
  }
  .input {
    height: 38px;
    padding: 0 12px;
    border-radius: 8px;
    border: 1px solid rgba(24, 24, 27, 0.22);
    background: #faf9f5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13.5px;
    color: #18181b;
    font-family: Consolas, ui-monospace, monospace;
  }
  .input.sans {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
  }
  .tools-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #f5f3ec;
    border: 1px solid rgba(24, 24, 27, 0.11);
    border-radius: 12px;
    padding: 13px 18px;
  }
  .tool-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }
  .t-chip {
    font-family: Consolas, ui-monospace, monospace;
    font-size: 11.5px;
    background: #ffffff;
    border: 1px solid rgba(24, 24, 27, 0.14);
    padding: 4px 9px;
    border-radius: 6px;
    color: #27272a;
    font-weight: 600;
  }
  .btn-save {
    background: #c96442;
    color: #ffffff;
    font-weight: 600;
    font-size: 13.5px;
    padding: 9px 18px;
    border-radius: 8px;
  }
</style>
</head>
<body>
  <div class="window">
    <div class="titlebar">
      <div class="traffic"><span></span><span></span><span></span></div>
      <div class="win-title">Claude — Settings</div>
      <div class="win-pill">Desktop Extension (.mcpb)</div>
    </div>
    <div class="body">
      <div class="sidebar">
        <div class="side-heading">Settings</div>
        <div style="margin:0 6px 8px;padding:6px 10px;border-radius:8px;background:#e8e5dc;color:#78756e;font-size:12px;">Search</div>
        <div class="side-item" style="padding:6px 12px;font-size:13px;">Account</div>
        <div class="side-item" style="padding:6px 12px;font-size:13px;">Billing</div>
        <div class="side-item" style="padding:6px 12px;font-size:13px;">Usage</div>
        <div style="height:1px;background:rgba(24,24,27,0.08);margin:4px 8px;"></div>
        <div class="side-item" style="padding:6px 12px;font-size:13px;">Appearance</div>
        <div class="side-item" style="padding:6px 12px;font-size:13px;">Your Claude</div>
        <div class="side-item" style="padding:6px 12px;font-size:13px;">Capabilities</div>
        <div class="side-item" style="padding:6px 12px;font-size:13px;">Notifications</div>
        <div class="side-item" style="padding:6px 12px;font-size:13px;">Privacy</div>
        <div class="side-item" style="padding:6px 12px;font-size:13px;">Wellbeing</div>
        <div style="height:1px;background:rgba(24,24,27,0.08);margin:4px 8px;"></div>
        <div class="side-item active" style="padding:7px 12px;font-size:13px;">
          <span>Customize</span>
          <span style="font-size:11px;background:#f5ebe2;color:#6e331d;padding:1px 7px;border-radius:99px;white-space:nowrap;">1 active</span>
        </div>
        <div class="side-item" style="padding:6px 12px;font-size:13px;">Code</div>
        <div style="height:1px;background:rgba(24,24,27,0.08);margin:4px 8px;"></div>
        <div class="side-item" style="padding:6px 12px;font-size:13px;">Desktop app</div>
      </div>

      <div class="content">
        <div class="breadcrumb">
          <span>Settings</span> <span>›</span> <span>Customize</span> <span>›</span> <span>Extensions</span> <span>›</span> <strong>Multi-Provider LLM Gateway</strong>
        </div>

        <div class="ext-header">
          <div class="ext-left">
            <div class="ext-icon">${iconSvg}</div>
            <div>
              <div class="ext-title">
                <span>Multi-Provider LLM Gateway</span>
                <span class="ver">v1.1.0</span>
              </div>
              <p class="ext-desc">
                Connect external OpenAI &amp; Anthropic LLM providers inside Claude Chat &amp; Cowork.
              </p>
            </div>
          </div>
          <div class="ext-right">
            <span class="status-pill"><i></i> 7 Tools Active</span>
            <div class="toggle"></div>
          </div>
        </div>

        <div class="form-card">
          <div class="card-head">
            <h2>Configuration</h2>
            <span class="keychain-note" style="white-space:nowrap;">🔒 OS Keychain</span>
          </div>

          <div class="grid">
            <div class="field">
              <label>Primary Provider Name</label>
              <div class="input sans">CLIProxyAPI Gateway</div>
            </div>
            <div class="field">
              <label>Provider Base URL</label>
              <div class="input">http://localhost:8317</div>
            </div>
            <div class="field">
              <label>Provider API Key</label>
              <div class="input">•••••••••••••••••••••••• <span style="font-size:11px;color:#166534;font-family:sans-serif;font-weight:600;white-space:nowrap;">Stored</span></div>
            </div>
            <div class="field">
              <label>Wire Protocol</label>
              <div class="input">auto</div>
            </div>
            <div class="field">
              <label>Default Model ID</label>
              <div class="input">gemini-2.5-pro</div>
            </div>
            <div class="field">
              <label>Settings Dashboard Port</label>
              <div class="input">18320</div>
            </div>
          </div>
        </div>

        <div class="tools-bar">
          <div>
            <div style="font-size:12px;font-weight:650;color:#4b4944;margin-bottom:6px;">Enabled Tools</div>
            <div class="tool-chips">
              <span class="t-chip">mp_chat</span>
              <span class="t-chip">mp_compare_models</span>
              <span class="t-chip">mp_list_models</span>
              <span class="t-chip">mp_fetch_catalog</span>
              <span class="t-chip">mp_configure_provider</span>
              <span class="t-chip">mp_open_settings</span>
              <span class="t-chip">mp_gateway_status</span>
            </div>
          </div>
          <div class="btn-save" style="white-space:nowrap;">Save</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function buildDesktopChatAskHtml(iconSvg) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html {
    width: 1400px;
    height: 900px;
    overflow: hidden;
    background: #eae7df;
  }
  body {
    width: 1400px;
    height: 900px;
    overflow: hidden;
    background: #eae7df;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
    color: #18181b;
    -webkit-font-smoothing: antialiased;
    padding: 26px 32px;
  }
  .window {
    width: 100%;
    height: 100%;
    background: #faf9f5;
    border-radius: 16px;
    border: 1px solid rgba(24, 24, 27, 0.16);
    box-shadow: 0 24px 60px rgba(24, 24, 27, 0.14);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .titlebar {
    height: 44px;
    background: #f1efe8;
    border-bottom: 1px solid rgba(24, 24, 27, 0.1);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 18px;
  }
  .traffic { display: flex; gap: 8px; }
  .traffic span { width: 12px; height: 12px; border-radius: 50%; display: block; }
  .traffic span:nth-child(1) { background: #ff5f57; }
  .traffic span:nth-child(2) { background: #febc2e; }
  .traffic span:nth-child(3) { background: #28c840; }
  .win-title { font-size: 13px; font-weight: 600; color: #4b4944; }
  .main {
    flex: 1;
    display: grid;
    grid-template-columns: 230px 1fr;
    min-height: 0;
  }
  .left-rail {
    background: #f3f1ea;
    border-right: 1px solid rgba(24, 24, 27, 0.1);
    padding: 18px 14px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .recents-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #78756e;
    padding: 6px 10px;
  }
  .chat-item {
    padding: 9px 10px;
    border-radius: 8px;
    font-size: 13px;
    color: #4b4944;
    margin-bottom: 4px;
  }
  .chat-item.active {
    background: #ffffff;
    color: #18181b;
    font-weight: 600;
    border: 1px solid rgba(24, 24, 27, 0.11);
  }
  .mcp-connected {
    background: #ffffff;
    border: 1px solid rgba(24, 24, 27, 0.12);
    border-radius: 10px;
    padding: 10px 12px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .mcp-connected .mini-ic { width: 30px; height: 30px; flex-shrink: 0; }
  .mcp-connected .mini-ic svg { width: 100%; height: 100%; display: block; }

  .chat-pane {
    padding: 24px 56px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 14px;
  }
  .messages {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .user-bubble {
    align-self: flex-end;
    background: #efede4;
    border: 1px solid rgba(24, 24, 27, 0.1);
    padding: 13px 18px;
    border-radius: 16px 16px 4px 16px;
    max-width: 780px;
    font-size: 14.5px;
    line-height: 1.48;
    color: #18181b;
  }
  .user-bubble code {
    font-family: Consolas, ui-monospace, monospace;
    background: #ffffff;
    padding: 2px 6px;
    border-radius: 5px;
    color: #8f3b1e;
    font-size: 13px;
    font-weight: 600;
  }
  .assistant-block {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 960px;
  }
  .tool-call-box {
    background: #ffffff;
    border: 1px solid rgba(75, 79, 158, 0.28);
    border-radius: 12px;
    padding: 12px 16px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.025);
  }
  .tool-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .tool-left {
    display: flex;
    align-items: center;
    gap: 9px;
    font-size: 13px;
    font-weight: 650;
    color: #2f2e2b;
  }
  .tool-ic { width: 22px; height: 22px; }
  .tool-ic svg { width: 100%; height: 100%; display: block; }
  .tool-badge {
    font-family: Consolas, ui-monospace, monospace;
    font-size: 11.5px;
    padding: 2px 8px;
    border-radius: 99px;
    background: #e9e9f6;
    color: #4b4f9e;
    font-weight: 600;
  }
  .tool-json {
    font-family: Consolas, ui-monospace, monospace;
    font-size: 12px;
    background: #f7f6f1;
    border: 1px solid rgba(24, 24, 27, 0.09);
    padding: 8px 12px;
    border-radius: 8px;
    color: #3f3d38;
  }
  .tool-meta-bar {
    margin-top: 8px;
    font-family: Consolas, ui-monospace, monospace;
    font-size: 11.5px;
    color: #166534;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    padding: 5px 10px;
    border-radius: 6px;
  }
  .synthesis-card {
    background: #ffffff;
    border: 1px solid rgba(24, 24, 27, 0.12);
    border-radius: 14px;
    padding: 18px 22px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .syn-title {
    font-size: 15px;
    font-weight: 700;
    color: #18181b;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .cmp-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
  .cmp-col {
    background: #faf9f5;
    border: 1px solid rgba(24, 24, 27, 0.1);
    border-radius: 10px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .cmp-col h4 {
    font-size: 13px;
    font-weight: 700;
    color: #6e331d;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .cmp-col h4 span {
    font-family: Consolas, ui-monospace, monospace;
    font-size: 11px;
    color: #62605b;
    font-weight: 500;
  }
  .cmp-col p {
    font-size: 12.8px;
    line-height: 1.45;
    color: #3f3d38;
  }
  .verdict {
    font-size: 13.5px;
    line-height: 1.45;
    color: #18181b;
    background: #f8ebe2;
    border: 1px solid rgba(168, 73, 40, 0.25);
    padding: 10px 14px;
    border-radius: 9px;
  }
  .composer {
    background: #ffffff;
    border: 1px solid rgba(24, 24, 27, 0.18);
    border-radius: 14px;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .comp-left {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    color: #78756e;
  }
  .comp-pill {
    font-size: 12px;
    font-weight: 600;
    color: #18181b;
    background: #f3f1ea;
    border: 1px solid rgba(24, 24, 27, 0.12);
    padding: 4px 10px;
    border-radius: 8px;
  }
</style>
</head>
<body>
  <div class="window">
    <div class="titlebar">
      <div class="traffic"><span></span><span></span><span></span></div>
      <div class="win-title">Claude</div>
      <div style="font-size:12px;color:#166534;font-weight:600;white-space:nowrap;">● Multi-Provider</div>
    </div>

    <div class="main">
      <div class="left-rail">
        <div>
          <div class="recents-title">Recents</div>
          <div class="chat-item active">Rate limiter review</div>
          <div class="chat-item">SQLite WAL concurrency</div>
          <div class="chat-item">Multi-Provider settings</div>
        </div>
        <div class="mcp-connected">
          <div class="mini-ic">${iconSvg}</div>
          <div>
            <div style="font-size:12.5px;font-weight:650;">Multi-Provider</div>
            <div style="font-size:11px;color:#62605b;">7 tools enabled</div>
          </div>
        </div>
      </div>

      <div class="chat-pane">
        <div class="messages">
          <div class="user-bubble">
            Ask <code>gemini-2.5-pro</code> and <code>gpt-4.1</code> (effort: <code>high</code>) to check our Redis rate limiter for failover race conditions.
          </div>

          <div class="assistant-block">
            <div class="tool-call-box">
              <div class="tool-head">
                <div class="tool-left">
                  <div class="tool-ic">${iconSvg}</div>
                  <span>Used <strong>mp_compare_models</strong></span>
                </div>
                <span class="tool-badge" style="white-space:nowrap;">2 models · 1.18s</span>
              </div>
              <div class="tool-json">
                { "models": ["gemini-2.5-pro", "gpt-4.1"], "effort": "high" }
              </div>
              <div class="tool-meta-bar">
                ✓ gemini-2.5-pro (1,180ms · in:412 out:298)  ·  ✓ gpt-4.1 (940ms · in:412 out:264)
              </div>
            </div>

            <div class="synthesis-card">
              <div class="syn-title">
                <span>Comparison Summary</span>
                <span style="font-size:12px;color:#62605b;font-weight:500;">2/2 models</span>
              </div>

              <div class="cmp-grid">
                <div class="cmp-col">
                  <h4>gemini-2.5-pro <span>1,180 ms</span></h4>
                  <p>Non-atomic <code>GET</code> + <code>DECR</code> splits across replica promotion. Use a single Lua script with Redis <code>TIME</code>.</p>
                </div>
                <div class="cmp-col">
                  <h4>gpt-4.1 <span>940 ms</span></h4>
                  <p>TOCTOU race during Sentinel failover plus missing <code>PEXPIRE</code> refresh on idle token buckets.</p>
                </div>
              </div>

              <div class="verdict">
                <strong>Fix:</strong> Replace the two-step pipeline with an atomic <code>EVALSHA</code> Lua script that refills tokens via Redis <code>TIME</code> and refreshes <code>PEXPIRE</code>.
              </div>
            </div>
          </div>
        </div>

        <div class="composer">
          <div class="comp-left">
            <span>Reply to Claude...</span>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <span class="comp-pill" style="white-space:nowrap;">🔨 7 Tools</span>
            <span class="comp-pill" style="white-space:nowrap;">Claude Sonnet 4.6 ▾</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function buildCliModelPickerHtml(iconSvg) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html {
    width: 1400px;
    height: 820px;
    overflow: hidden;
    background: #e6e3da;
  }
  body {
    width: 1400px;
    height: 820px;
    overflow: hidden;
    background: #e6e3da;
    font-family: Consolas, "JetBrains Mono", "SFMono-Regular", ui-monospace, monospace;
    -webkit-font-smoothing: antialiased;
    padding: 28px 34px;
  }
  .term {
    width: 100%;
    height: 100%;
    background: #131417;
    color: #e6e4dd;
    border-radius: 16px;
    border: 1px solid #2e3138;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .term-bar {
    height: 44px;
    background: #1c1e24;
    border-bottom: 1px solid #2b2e37;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 18px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
  }
  .traffic { display: flex; gap: 8px; }
  .traffic span { width: 12px; height: 12px; border-radius: 50%; display: block; }
  .traffic span:nth-child(1) { background: #ff5f57; }
  .traffic span:nth-child(2) { background: #febc2e; }
  .traffic span:nth-child(3) { background: #28c840; }
  .term-title {
    font-size: 13px;
    color: #a9a79f;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .t-ic { width: 20px; height: 20px; }
  .t-ic svg { width: 100%; height: 100%; display: block; }
  .term-badge {
    font-size: 11.5px;
    background: rgba(201, 100, 66, 0.18);
    color: #f09a79;
    border: 1px solid rgba(201, 100, 66, 0.4);
    padding: 3px 10px;
    border-radius: 99px;
    font-weight: 600;
  }
  .screen {
    flex: 1;
    padding: 24px 32px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    font-size: 14px;
    line-height: 1.55;
  }
  .cmd-line { color: #d4d2c8; }
  .prompt { color: #4ade80; font-weight: 700; }
  .flag { color: #93c5fd; }
  .dim { color: #7c7f87; }
  .ok { color: #4ade80; }
  .accent { color: #e58c68; font-weight: 700; }

  .claude-banner {
    margin-top: 4px;
    padding: 12px 16px;
    border: 1px solid #353842;
    border-radius: 10px;
    background: #191b20;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .picker-box {
    margin-top: 4px;
    border: 1.5px solid #d97757;
    border-radius: 12px;
    background: #181a20;
    padding: 18px 22px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .picker-title {
    color: #f4f3ee;
    font-weight: 700;
    font-size: 15px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .opt {
    padding: 9px 14px;
    border-radius: 8px;
    display: grid;
    grid-template-columns: 30px 260px 210px 1fr;
    align-items: center;
    color: #b7b5ad;
    font-size: 13.5px;
  }
  .opt.selected {
    background: rgba(217, 119, 87, 0.18);
    border: 1px solid rgba(217, 119, 87, 0.55);
    color: #ffffff;
    font-weight: 700;
  }
  .tag-ext {
    display: inline-block;
    width: fit-content;
    font-size: 11.5px;
    padding: 2px 8px;
    border-radius: 5px;
    background: rgba(74, 222, 128, 0.14);
    color: #86efac;
    border: 1px solid rgba(74, 222, 128, 0.3);
  }
  .tag-native {
    display: inline-block;
    width: fit-content;
    font-size: 11.5px;
    padding: 2px 8px;
    border-radius: 5px;
    background: rgba(148, 163, 184, 0.14);
    color: #cbd5e1;
  }
  .status-footer {
    margin-top: auto;
    padding-top: 12px;
    border-top: 1px solid #262932;
    display: flex;
    justify-content: space-between;
    color: #8e9199;
    font-size: 12.5px;
  }
</style>
</head>
<body>
  <div class="term">
    <div class="term-bar">
      <div class="traffic"><span></span><span></span><span></span></div>
      <div class="term-title">
        <span class="t-ic">${iconSvg}</span>
        <span>Claude Code CLI — /model</span>
      </div>
      <span class="term-badge" style="white-space:nowrap;">Gateway 127.0.0.1:18329</span>
    </div>

    <div class="screen">
      <div>
        <div class="cmd-line"><span class="prompt">$</span> node ./bin/cli.mjs sync-cli</div>
        <div class="ok">  ✓ Synced 4 models to ~/.claude/settings.json (backup: settings.json.bak)</div>
      </div>

      <div>
        <div class="cmd-line"><span class="prompt">$</span> <span class="flag">ANTHROPIC_BASE_URL=http://127.0.0.1:18329</span> claude</div>
      </div>

      <div class="claude-banner">
        <div><span class="accent">✻ Claude Code</span> <span class="dim">· Connected to 127.0.0.1:18329</span></div>
        <div class="ok" style="white-space:nowrap;">● Ready</div>
      </div>

      <div class="cmd-line"><span class="accent">❯</span> /model</div>

      <div class="picker-box">
        <div class="picker-title">
          <span>Select model</span>
          <span class="dim" style="font-size:12px;">↑/↓ select · ←/→ effort · Enter confirm</span>
        </div>

        <div class="opt selected">
          <span class="accent">❯</span>
          <span>Gemini 2.5 Pro</span>
          <span><span class="tag-ext" style="white-space:nowrap;">gemini-2.5-pro</span></span>
          <span style="color:#fcd34d;">1,048k ctx · compact 944k · effort: high</span>
        </div>

        <div class="opt">
          <span> </span>
          <span>GPT-4.1</span>
          <span><span class="tag-ext" style="white-space:nowrap;">gpt-4.1</span></span>
          <span class="dim">1,047k ctx · compact 943k · effort: medium</span>
        </div>

        <div class="opt">
          <span> </span>
          <span>DeepSeek R1</span>
          <span><span class="tag-ext" style="white-space:nowrap;">deepseek-reasoner</span></span>
          <span class="dim">131k ctx · compact 118k · thinking</span>
        </div>

        <div class="opt">
          <span> </span>
          <span>Qwen 3 Coder 32B</span>
          <span><span class="tag-ext" style="white-space:nowrap;">ollama</span></span>
          <span class="dim">128k ctx · compact 115k · local</span>
        </div>

        <div class="opt" style="border-top:1px dashed #2e313a;padding-top:11px;">
          <span> </span>
          <span>Claude Sonnet 4.6 (Built-in)</span>
          <span><span class="tag-native" style="white-space:nowrap;">anthropic</span></span>
          <span class="dim">Passthrough → api.anthropic.com</span>
        </div>
      </div>

      <div class="status-footer">
        <span>Model: <strong style="color:#f4f3ee;">gemini-2.5-pro</strong></span>
        <span>Context: 14.2k / 943.7k (1.5%)</span>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function buildCliChatUsageHtml(iconSvg) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html {
    width: 1400px;
    height: 860px;
    overflow: hidden;
    background: #e6e3da;
  }
  body {
    width: 1400px;
    height: 860px;
    overflow: hidden;
    background: #e6e3da;
    font-family: Consolas, "JetBrains Mono", "SFMono-Regular", ui-monospace, monospace;
    -webkit-font-smoothing: antialiased;
    padding: 28px 34px;
  }
  .term {
    width: 100%;
    height: 100%;
    background: #131417;
    color: #e6e4dd;
    border-radius: 16px;
    border: 1px solid #2e3138;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .term-bar {
    height: 44px;
    background: #1c1e24;
    border-bottom: 1px solid #2b2e37;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 18px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
  }
  .traffic { display: flex; gap: 8px; }
  .traffic span { width: 12px; height: 12px; border-radius: 50%; display: block; }
  .traffic span:nth-child(1) { background: #ff5f57; }
  .traffic span:nth-child(2) { background: #febc2e; }
  .traffic span:nth-child(3) { background: #28c840; }
  .term-title {
    font-size: 13px;
    color: #a9a79f;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .t-ic { width: 20px; height: 20px; }
  .t-ic svg { width: 100%; height: 100%; display: block; }
  .term-badge {
    font-size: 11.5px;
    background: rgba(99, 102, 241, 0.18);
    color: #a5b4fc;
    border: 1px solid rgba(99, 102, 241, 0.4);
    padding: 3px 10px;
    border-radius: 99px;
    font-weight: 600;
  }
  .screen {
    flex: 1;
    padding: 22px 30px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    font-size: 13.5px;
    line-height: 1.54;
  }
  .accent { color: #e58c68; font-weight: 700; }
  .cyan { color: #67e8f9; }
  .green { color: #4ade80; }
  .dim { color: #8b8e98; }
  .yellow { color: #fcd34d; }

  .block {
    background: #181b21;
    border: 1px solid #2b2f3a;
    border-radius: 10px;
    padding: 13px 16px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .tool-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: #c7d2fe;
    font-weight: 700;
  }
  .meta-line {
    color: #86efac;
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.25);
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12.5px;
    width: fit-content;
  }
  .diff-box {
    background: #111318;
    border: 1px solid #262934;
    border-radius: 8px;
    padding: 9px 13px;
    font-size: 12.5px;
  }
  .del { color: #f87171; }
  .add { color: #4ade80; }

  .council-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10px;
    margin-top: 4px;
  }
  .c-card {
    background: #121419;
    border: 1px solid #2d313d;
    border-radius: 8px;
    padding: 9px 11px;
    font-size: 12px;
  }
  .c-card strong { color: #f4f3ee; display: block; margin-bottom: 3px; }
  .status-bar {
    margin-top: auto;
    padding-top: 10px;
    border-top: 1px solid #262932;
    display: flex;
    justify-content: space-between;
    color: #8e9199;
    font-size: 12.5px;
  }
</style>
</head>
<body>
  <div class="term">
    <div class="term-bar">
      <div class="traffic"><span></span><span></span><span></span></div>
      <div class="term-title">
        <span class="t-ic">${iconSvg}</span>
        <span>Claude Code — Sticky /mp:use (0 Claude Tokens) &amp; Subagents</span>
      </div>
      <span class="term-badge" style="white-space:nowrap;">mp@1.1.0</span>
    </div>

    <div class="screen">
      <!-- Example 1: Sticky /mp:use + normal chat -->
      <div><span class="accent">❯</span> <span class="cyan">/mp:use</span> <span class="yellow">deepseek-r1</span></div>
      <div class="green" style="font-size:12.8px;margin-top:-6px;">  ✓ Pinned [deepseek-r1] · Direct Mode (0 Claude tokens — works even at 0% Claude quota). Run /mp:off to unpin.</div>
      <div><span class="accent">❯</span> Rewrite @src/users.sql N+1 query as a single CTE</div>

      <div class="block">
        <div class="tool-header">
          <span>⚡ Direct Hook → deepseek-r1 (effort: "high" · 0 Claude tokens)</span>
          <span class="dim" style="white-space:nowrap;">1,340 ms</span>
        </div>
        <div class="meta-line">⚡ [deepseek-r1 · Unified Gateway · 1340ms · in:248 out:312 · 0 Claude tokens]</div>
        <div class="dim">&lt;thinking&gt; Replace correlated subquery on orders(user_id) with ROW_NUMBER() window partition. &lt;/thinking&gt;</div>
        <div class="diff-box">
          <div class="del">- SELECT u.id, (SELECT MAX(total) FROM orders o WHERE o.user_id = u.id) FROM users u;</div>
          <div class="add">+ WITH ranked AS (SELECT user_id, total, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY total DESC) rn FROM orders)</div>
          <div class="add">+ SELECT u.id, r.total FROM users u LEFT JOIN ranked r ON r.user_id = u.id AND r.rn = 1;</div>
        </div>
      </div>

      <!-- Example 2: Subagent @mp-council -->
      <div style="margin-top:2px;"><span class="accent">❯</span> <span class="cyan">@mp-council</span> Check JWT refresh rotation under concurrent tab retries</div>

      <div class="block">
        <div class="tool-header">
          <span>⏺ @mp-council → mp_compare_models (["gemini-2.5-pro", "gpt-4.1", "qwen3-coder"])</span>
          <span class="green" style="white-space:nowrap;">3/3 OK</span>
        </div>
        <div class="council-grid">
          <div class="c-card">
            <strong>gemini-2.5-pro (1.09s)</strong>
            <span class="dim">Add 10s grace window per token family_id to avoid false reuse lockouts.</span>
          </div>
          <div class="c-card">
            <strong>gpt-4.1 (0.88s)</strong>
            <span class="dim">Coordinate tabs via navigator.locks + server idempotency key.</span>
          </div>
          <div class="c-card">
            <strong>qwen3-coder (0.74s)</strong>
            <span class="dim">Enforce REPEATABLE READ on token_family revocation writes.</span>
          </div>
        </div>
        <div style="color:#e6e4dd;font-size:12.8px;margin-top:4px;">
          <span class="green">✔ Verdict:</span> Pair client <span class="cyan">navigator.locks</span> with a 10s server grace window per <span class="cyan">family_id</span>.
        </div>
      </div>

      <div class="status-bar">
        <span>/mp:{use,off,settings,models,ask,code,review,cli-gateway}</span>
        <span>@mp-coder · @mp-reviewer · @mp-council</span>
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function renderWithCdp(browserBin, jobs) {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-assets-"));
  const proc = spawn(browserBin, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profileDir}`,
    "--remote-debugging-port=0",
    "about:blank"
  ], { stdio: ["ignore", "pipe", "pipe"] });

  const wsEndpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for CDP endpoint")), 12000);
    let stderr = "";
    proc.stderr.on("data", d => {
      stderr += d.toString("utf8");
      const m = stderr.match(/DevTools listening on (ws:\/\/[^\s\r\n]+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
  });

  const port = new URL(wsEndpoint).port;
  const listRes = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
  const pageTarget = listRes.find(t => t.type === "page");
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = () => res();
    ws.onerror = e => rej(e);
  });

  let seq = 0;
  const inflight = new Map();
  ws.onmessage = ev => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && inflight.has(msg.id)) {
      const { resolve, reject } = inflight.get(msg.id);
      inflight.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      inflight.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  try {
    await send("Page.enable");
    for (const job of jobs) {
      await send("Emulation.setDeviceMetricsOverride", {
        width: job.width,
        height: job.height,
        deviceScaleFactor: job.scale || 2,
        mobile: false
      });
      if (job.transparent) {
        await send("Emulation.setDefaultBackgroundColorOverride", {
          color: { r: 0, g: 0, b: 0, a: 0 }
        });
      } else {
        await send("Emulation.setDefaultBackgroundColorOverride");
      }
      const tmpHtml = path.join(profileDir, `${job.name}.html`);
      fs.writeFileSync(tmpHtml, job.html, "utf8");
      const fileUrl = "file:///" + tmpHtml.replace(/\\/g, "/");
      await send("Page.navigate", { url: fileUrl });
      await sleep(350);
      const shot = await send("Page.captureScreenshot", {
        format: "png",
        clip: { x: 0, y: 0, width: job.width, height: job.height, scale: 1 }
      });
      const buf = Buffer.from(shot.data, "base64");
      for (const outPath of job.outputs) {
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, buf);
        console.log(`Rendered ${path.relative(ROOT, outPath)} (${(buf.length / 1024).toFixed(1)} KB)`);
      }
    }
  } finally {
    try { ws.close(); } catch {}
    proc.kill();
    setTimeout(() => {
      try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
    }, 400);
  }
}

async function main() {
  const browserBin = findChromiumBinary();
  if (!browserBin) {
    throw new Error("No Chromium/Edge binary found to render SVG/HTML assets.");
  }
  const iconSvg = fs.readFileSync(ICON_SVG_PATH, "utf8");

  const iconHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>*{margin:0;padding:0;box-sizing:border-box;}html,body{width:512px;height:512px;overflow:hidden;background:transparent;}svg{width:512px;height:512px;display:block;}</style></head><body>${iconSvg}</body></html>`;

  await renderWithCdp(browserBin, [
    {
      name: "icon-1024",
      width: 512,
      height: 512,
      scale: 2, // 1024x1024 crisp PNG
      transparent: true,
      html: iconHtml,
      outputs: [
        path.join(PLUGIN_DIR, "icon.png"),
        path.join(ASSETS_DIR, "icon.png")
      ]
    },
    {
      name: "icon-32-preview",
      width: 512,
      height: 512,
      scale: 0.0625, // 32x32 legibility check
      transparent: true,
      html: iconHtml,
      outputs: [
        path.join(os.tmpdir(), "cmp-icon-32px-check.png")
      ]
    },
    {
      name: "cover-banner",
      width: 1280,
      height: 640,
      scale: 2, // 2560x1280 crisp HiDPI
      transparent: false,
      html: buildCoverHtml(iconSvg),
      outputs: [
        path.join(ASSETS_DIR, "cover-banner.png")
      ]
    },
    {
      name: "architecture-diagram",
      width: 1480,
      height: 860,
      scale: 2, // 2960x1720 crisp HiDPI
      transparent: false,
      html: buildArchitectureHtml(iconSvg),
      outputs: [
        path.join(ASSETS_DIR, "architecture-diagram.png")
      ]
    },
    {
      name: "desktop-extension-config",
      width: 1400,
      height: 860,
      scale: 2,
      transparent: false,
      html: buildDesktopExtensionConfigHtml(iconSvg),
      outputs: [
        path.join(ASSETS_DIR, "desktop-extension-config.png")
      ]
    },
    {
      name: "desktop-chat-ask",
      width: 1400,
      height: 900,
      scale: 2,
      transparent: false,
      html: buildDesktopChatAskHtml(iconSvg),
      outputs: [
        path.join(ASSETS_DIR, "desktop-chat-ask.png")
      ]
    },
    {
      name: "cli-model-picker",
      width: 1400,
      height: 820,
      scale: 2,
      transparent: false,
      html: buildCliModelPickerHtml(iconSvg),
      outputs: [
        path.join(ASSETS_DIR, "cli-model-picker.png")
      ]
    },
    {
      name: "cli-chat-usage",
      width: 1400,
      height: 860,
      scale: 2,
      transparent: false,
      html: buildCliChatUsageHtml(iconSvg),
      outputs: [
        path.join(ASSETS_DIR, "cli-chat-usage.png")
      ]
    }
  ]);

  // Also generate multi-size assets/icon.ico via Python Pillow if available
  try {
    const pyCode = [
      "from PIL import Image",
      `im = Image.open(r"${path.join(ASSETS_DIR, "icon.png")}")`,
      `im.save(r"${path.join(ASSETS_DIR, "icon.ico")}", sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])`
    ].join("; ");
    execFileSync("python", ["-c", pyCode], { stdio: "pipe" });
    console.log("Generated assets/icon.ico (multi-size 16..256)");
  } catch {
    // Optional if Pillow not installed
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
