import { ALL_EFFORT_LEVELS, BEHAVES_AS_MODELS, PROVIDER_PRESETS } from "../core/catalog-spec.mjs";

export function renderDashboardHtml({ csrfToken, gatewayPort }) {
  const bootstrapJson = JSON.stringify({
    csrfToken,
    gatewayPort,
    presets: PROVIDER_PRESETS,
    behavesAsOptions: BEHAVES_AS_MODELS,
    effortLevels: ALL_EFFORT_LEVELS
  }).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Claude Multi-Provider — Settings & Model Catalog</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="icon" type="image/png" href="/favicon.png" />
  <link rel="alternate icon" href="/favicon.ico" />
  <link rel="apple-touch-icon" href="/favicon.png" />
  <style>
    :root {
      --bg-app: #faf9f5;
      --bg-sidebar: #f3f1ea;
      --bg-card: #ffffff;
      --bg-subtle: rgba(24, 24, 27, 0.04);
      --bg-hover: rgba(24, 24, 27, 0.06);
      --border: rgba(24, 24, 27, 0.13);
      --border-strong: rgba(24, 24, 27, 0.28);
      --text-main: #18181b;
      --text-muted: #62605b;
      --accent: #c96442;
      --accent-hover: #b55636;
      --accent-soft: rgba(201, 100, 66, 0.12);
      --ok: #16a34a;
      --ok-soft: rgba(22, 163, 74, 0.12);
      --err: #dc2626;
      --err-soft: rgba(220, 38, 38, 0.1);
      --radius: 10px;
      --radius-sm: 7px;
      --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg-app: #171719;
        --bg-sidebar: #1e1e21;
        --bg-card: #222226;
        --bg-subtle: rgba(255, 255, 255, 0.045);
        --bg-hover: rgba(255, 255, 255, 0.08);
        --border: rgba(255, 255, 255, 0.12);
        --border-strong: rgba(255, 255, 255, 0.26);
        --text-main: #f4f3ee;
        --text-muted: #a1a09a;
        --accent: #d97757;
        --accent-hover: #e28769;
        --accent-soft: rgba(217, 119, 87, 0.16);
      }
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      max-width: 100%;
      overflow-x: hidden;
      background: var(--bg-app);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.45;
      -webkit-font-smoothing: antialiased;
    }
    .layout {
      display: grid;
      grid-template-columns: 248px minmax(0, 1fr);
      min-height: 100vh;
    }
    .sidebar {
      background: var(--bg-sidebar);
      border-right: 1px solid var(--border);
      padding: 20px 14px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .brand {
      padding: 4px 8px;
      display: flex;
      align-items: center;
      gap: 11px;
    }
    .brand-mark {
      width: 38px;
      height: 38px;
      border-radius: 9px;
      overflow: hidden;
      flex-shrink: 0;
    }
    .brand-mark img {
      width: 100%;
      height: 100%;
      display: block;
    }
    .brand-title {
      font-size: 15px;
      font-weight: 600;
      letter-spacing: -0.01em;
      line-height: 1.2;
    }
    .brand-sub {
      font-size: 11.5px;
      color: var(--text-muted);
      margin-top: 2px;
      white-space: nowrap;
    }
    .nav-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .nav-btn {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      border: 1px solid transparent;
      background: transparent;
      color: var(--text-main);
      font-family: inherit;
      font-size: 13.5px;
      padding: 8px 10px;
      border-radius: 8px;
      cursor: pointer;
      text-align: left;
      transition: background 0.12s ease;
      min-height: 36px;
    }
    .nav-btn:hover { background: var(--bg-hover); }
    .nav-btn.active {
      background: var(--bg-card);
      border-color: var(--border);
      font-weight: 500;
      box-shadow: var(--shadow-sm);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 1px 7px;
      border-radius: 999px;
      font-size: 11px;
      border: 1px solid var(--border);
      background: var(--bg-subtle);
      color: var(--text-muted);
      white-space: nowrap;
    }
    .badge.ok {
      color: var(--ok);
      background: var(--ok-soft);
      border-color: rgba(22, 163, 74, 0.28);
    }
    .badge.accent {
      color: var(--accent);
      background: var(--accent-soft);
      border-color: rgba(201, 100, 66, 0.3);
    }
    .main {
      padding: 24px 32px 48px;
      max-width: 1040px;
      width: 100%;
      min-width: 0;
    }
    .live-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      padding: 10px 14px;
      margin-bottom: 20px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--ok);
      display: inline-block;
      flex-shrink: 0;
    }
    .pane-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      flex-wrap: wrap;
      margin-bottom: 18px;
    }
    .pane-title {
      font-size: 19px;
      font-weight: 600;
      margin: 0 0 4px 0;
      letter-spacing: -0.01em;
    }
    .pane-desc {
      font-size: 13px;
      color: var(--text-muted);
      margin: 0;
    }
    .toast {
      padding: 10px 14px;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 13px;
      border: 1px solid var(--border);
      display: none;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .toast.visible { display: flex; }
    .toast.ok { background: var(--ok-soft); border-color: rgba(22, 163, 74, 0.3); }
    .toast.err { background: var(--err-soft); border-color: rgba(220, 38, 38, 0.35); color: var(--err); }
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
      margin-bottom: 14px;
      box-shadow: var(--shadow-sm);
    }
    .card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .grid-3 {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    .field label {
      display: block;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-muted);
      margin-bottom: 5px;
    }
    .input, .select {
      width: 100%;
      padding: 8px 10px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-strong);
      background: var(--bg-app);
      color: var(--text-main);
      font-family: inherit;
      font-size: 13px;
      min-height: 36px;
      outline: none;
    }
    .input:focus, .select:focus {
      border-color: var(--accent);
    }
    .btn-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 7px 13px;
      min-height: 36px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-strong);
      background: var(--bg-card);
      color: var(--text-main);
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.12s ease, border-color 0.12s ease;
      white-space: nowrap;
    }
    .btn:hover:not(:disabled) { background: var(--bg-hover); }
    .btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .btn.primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #ffffff;
    }
    .btn.primary:hover:not(:disabled) {
      background: var(--accent-hover);
      border-color: var(--accent-hover);
    }
    .btn.sm {
      padding: 4px 10px;
      min-height: 30px;
      font-size: 12px;
    }
    .preset-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 16px;
    }
    .preset-chip {
      padding: 5px 10px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--bg-card);
      color: var(--text-main);
      font-size: 12px;
      cursor: pointer;
      min-height: 30px;
    }
    .preset-chip:hover {
      border-color: var(--accent);
      background: var(--accent-soft);
    }
    .model-list {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--bg-card);
      overflow: hidden;
    }
    .model-row {
      border-bottom: 1px solid var(--border);
    }
    .model-row:last-child { border-bottom: none; }
    .model-row-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 14px;
      flex-wrap: wrap;
    }
    .model-row-drawer {
      padding: 14px 16px;
      border-top: 1px dashed var(--border);
      background: var(--bg-subtle);
    }
    .effort-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .effort-chip {
      padding: 4px 9px;
      border-radius: 6px;
      border: 1px solid var(--border-strong);
      background: transparent;
      color: var(--text-muted);
      font-size: 12px;
      cursor: pointer;
    }
    .effort-chip.on {
      background: var(--accent-soft);
      border-color: var(--accent);
      color: var(--text-main);
      font-weight: 500;
    }
    .empty-state {
      text-align: center;
      padding: 32px 18px;
      border: 1px dashed var(--border-strong);
      border-radius: var(--radius);
      color: var(--text-muted);
      background: var(--bg-card);
    }
    pre.code-box {
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      overflow-x: auto;
      font-size: 12px;
      margin: 8px 0 0;
    }
    table.log-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12.5px;
    }
    table.log-table th, table.log-table td {
      text-align: left;
      padding: 8px 10px;
      border-bottom: 1px solid var(--border);
    }
    .table-wrap {
      width: 100%;
      overflow-x: auto;
    }
    @media (max-width: 768px) {
      .layout {
        grid-template-columns: 1fr;
      }
      .sidebar {
        border-right: none;
        border-bottom: 1px solid var(--border);
        padding: 12px 14px;
        gap: 10px;
      }
      .nav-list {
        flex-direction: row;
        overflow-x: auto;
        padding-bottom: 2px;
      }
      .nav-btn {
        width: auto;
        flex-shrink: 0;
      }
      .main {
        padding: 16px 14px 36px;
      }
      .grid-2, .grid-3 {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar" aria-label="Settings sections">
      <div class="brand">
        <div class="brand-mark">
          <img src="/favicon.svg" alt="Claude Multi-Provider" />
        </div>
        <div>
          <div class="brand-title">Multi-Provider</div>
          <div class="brand-sub">Claude Plugin &amp; Gateway</div>
        </div>
      </div>
      <nav class="nav-list" role="tablist">
        <button type="button" class="nav-btn active" data-tab="providers" role="tab" aria-selected="true">
          <span>LLM Providers</span>
          <span class="badge" id="nav-count-providers">0</span>
        </button>
        <button type="button" class="nav-btn" data-tab="catalog" role="tab" aria-selected="false">
          <span>Model Catalog</span>
          <span class="badge" id="nav-count-models">0</span>
        </button>
        <button type="button" class="nav-btn" data-tab="integration" role="tab" aria-selected="false">
          <span>Claude Integration</span>
          <span class="badge ok">MCP</span>
        </button>
      </nav>
    </aside>

    <main class="main">
      <div class="live-bar" id="live-gateway-bar">
        <div style="display:flex;align-items:center;gap:8px;min-width:0;">
          <span class="status-dot"></span>
          <span id="live-bar-text" style="font-size:13px;">Loading Multi-Provider state...</span>
        </div>
        <div class="btn-row">
          <button type="button" class="btn sm" id="btn-refresh-state">Refresh</button>
          <button type="button" class="btn sm primary" id="btn-save-top">Save &amp; Apply</button>
        </div>
      </div>

      <div id="toast-box" class="toast" role="status" aria-live="polite">
        <span id="toast-msg"></span>
        <button type="button" class="btn sm" id="toast-close">Dismiss</button>
      </div>

      <section id="pane-providers" data-pane="providers"></section>
      <section id="pane-catalog" data-pane="catalog" hidden></section>
      <section id="pane-integration" data-pane="integration" hidden></section>
    </main>
  </div>

  <script>
    const BOOT = ${bootstrapJson};
    if (window.location.search.includes("token=")) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    let appState = {
      config: { providers: [], customModels: [], cachedCatalogModels: [], defaultModel: "", gatewayPort: BOOT.gatewayPort },
      gatewayRunning: false,
      gatewayUrl: "",
      logs: []
    };
    let activeTab = "providers";
    let catalogSearch = "";
    let catalogProviderFilter = "all";
    let catalogStatusFilter = "all";
    const expandedModels = new Set();

    function esc(v) {
      return String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function showToast(msg, kind = "ok") {
      const box = document.getElementById("toast-box");
      const text = document.getElementById("toast-msg");
      box.className = "toast visible " + (kind === "err" ? "err" : "ok");
      text.textContent = msg;
    }

    document.getElementById("toast-close").addEventListener("click", () => {
      document.getElementById("toast-box").className = "toast";
    });

    async function apiCall(path, method = "GET", body = null) {
      const headers = { "X-CMP-Token": BOOT.csrfToken };
      if (body !== null) headers["Content-Type"] = "application/json";
      const res = await fetch(path, {
        method,
        headers,
        body: body !== null ? JSON.stringify(body) : undefined
      });
      const data = await res.json().catch(() => ({ ok: false, error: "Invalid JSON response" }));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || ("HTTP " + res.status));
      }
      return data;
    }

    function updateBadgesAndBar() {
      const cfg = appState.config || {};
      const provCount = (cfg.providers || []).length;
      const enabledModels = (cfg.customModels || []).filter(m => m.enabled !== false).length;
      document.getElementById("nav-count-providers").textContent = String(provCount);
      document.getElementById("nav-count-models").textContent = String(enabledModels);

      const gwText = appState.gatewayRunning
        ? "Gateway active on " + appState.gatewayUrl + " · " + enabledModels + " enabled model(s)"
        : "MCP Bridge ready · " + provCount + " provider(s) configured";
      document.getElementById("live-bar-text").textContent = gwText;
    }

    function switchTab(tab) {
      activeTab = tab;
      document.querySelectorAll(".nav-btn").forEach(btn => {
        const isAct = btn.dataset.tab === tab;
        btn.classList.toggle("active", isAct);
        btn.setAttribute("aria-selected", isAct ? "true" : "false");
      });
      document.querySelectorAll("[data-pane]").forEach(sec => {
        sec.hidden = sec.dataset.pane !== tab;
      });
      renderActivePane();
    }

    document.querySelectorAll(".nav-btn").forEach(btn => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    function addPresetProvider(presetId) {
      const preset = BOOT.presets.find(p => p.id === presetId) || BOOT.presets[0];
      const list = appState.config.providers || [];
      const slug = preset.id + "-" + (list.length + 1);
      list.push({
        id: slug,
        name: preset.defaultName,
        baseUrl: preset.baseUrl,
        protocol: preset.protocol,
        enabled: true,
        hasApiKey: false,
        apiKeyMasked: "",
        apiKey: ""
      });
      appState.config.providers = list;
      renderProvidersPane();
      updateBadgesAndBar();
    }

    function renderProvidersPane() {
      const host = document.getElementById("pane-providers");
      const providers = appState.config.providers || [];

      const presetHtml = BOOT.presets.map(p =>
        '<button type="button" class="preset-chip" data-preset="' + esc(p.id) + '">+ ' + esc(p.label) + '</button>'
      ).join("");

      let cardsHtml = "";
      if (providers.length === 0) {
        cardsHtml = '<div class="empty-state">' +
          '<p style="font-weight:500;color:var(--text-main);margin:0 0 6px;">No providers configured</p>' +
          '<p style="margin:0 0 14px;font-size:13px;">Select a preset above or add a custom gateway URL.</p>' +
          '<button type="button" class="btn primary" id="btn-empty-add-cpa">+ Add Provider</button>' +
          '</div>';
      } else {
        cardsHtml = providers.map((p, idx) => {
          const keyBadge = p.hasApiKey
            ? '<span class="badge ok">Stored (' + esc(p.apiKeyMasked) + ')</span>'
            : '<span class="badge">No API key stored</span>';
          return '<div class="card" data-prov-idx="' + idx + '">' +
            '<div class="card-head">' +
              '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
                '<strong>' + esc(p.name || p.id) + '</strong>' +
                keyBadge +
                '<span class="badge">' + esc((p.protocol || "auto").toUpperCase()) + '</span>' +
              '</div>' +
              '<div class="btn-row">' +
                '<label style="display:inline-flex;align-items:center;gap:5px;font-size:12.5px;cursor:pointer;">' +
                  '<input type="checkbox" data-prov-field="enabled" data-idx="' + idx + '" ' + (p.enabled !== false ? "checked" : "") + ' /> Enabled' +
                '</label>' +
                '<button type="button" class="btn sm" data-action="fetch-prov" data-idx="' + idx + '">Fetch Models</button>' +
                '<button type="button" class="btn sm" data-action="remove-prov" data-idx="' + idx + '">Remove</button>' +
              '</div>' +
            '</div>' +
            '<div class="grid-2">' +
              '<div class="field">' +
                '<label>Provider Name</label>' +
                '<input class="input" type="text" data-prov-field="name" data-idx="' + idx + '" value="' + esc(p.name) + '" placeholder="e.g. CLIProxyAPI Gateway" />' +
              '</div>' +
              '<div class="field">' +
                '<label>Base URL</label>' +
                '<input class="input" type="url" data-prov-field="baseUrl" data-idx="' + idx + '" value="' + esc(p.baseUrl) + '" placeholder="https://openrouter.ai/api/v1" />' +
              '</div>' +
              '<div class="field">' +
                '<label>API Key</label>' +
                '<input class="input" type="password" autocomplete="off" data-prov-field="apiKey" data-idx="' + idx + '" value="' + esc(p.apiKey || "") + '" placeholder="' + (p.hasApiKey ? "Leave blank to keep stored key" : "Enter API key (optional for local)") + '" />' +
              '</div>' +
              '<div class="field">' +
                '<label>Wire Protocol</label>' +
                '<select class="select" data-prov-field="protocol" data-idx="' + idx + '">' +
                  '<option value="auto" ' + (p.protocol === "auto" ? "selected" : "") + '>Auto Detect (Recommended)</option>' +
                  '<option value="openai" ' + (p.protocol === "openai" ? "selected" : "") + '>OpenAI (/v1/chat/completions)</option>' +
                  '<option value="anthropic" ' + (p.protocol === "anthropic" ? "selected" : "") + '>Anthropic (/v1/messages)</option>' +
                '</select>' +
              '</div>' +
            '</div>' +
          '</div>';
        }).join("");
      }

      host.innerHTML =
        '<div class="pane-header">' +
          '<div>' +
            '<h1 class="pane-title">LLM Providers</h1>' +
            '<p class="pane-desc">OpenAI &amp; Anthropic endpoints · Stored locally (0600, masked).</p>' +
          '</div>' +
          '<div class="btn-row">' +
            '<button type="button" class="btn" id="btn-fetch-all">Fetch All Models</button>' +
            '<button type="button" class="btn primary" id="btn-save-providers">Save Providers</button>' +
          '</div>' +
        '</div>' +
        '<div class="preset-bar" aria-label="Quick add provider presets">' + presetHtml + '</div>' +
        cardsHtml;

      host.querySelectorAll("[data-preset]").forEach(btn => {
        btn.addEventListener("click", () => addPresetProvider(btn.dataset.preset));
      });
      const emptyBtn = host.querySelector("#btn-empty-add-cpa");
      if (emptyBtn) emptyBtn.addEventListener("click", () => addPresetProvider("cliproxyapi"));

      host.querySelectorAll("[data-prov-field]").forEach(el => {
        el.addEventListener("input", () => {
          const idx = Number(el.dataset.idx);
          const f = el.dataset.provField;
          if (!appState.config.providers[idx]) return;
          if (el.type === "checkbox") appState.config.providers[idx][f] = el.checked;
          else appState.config.providers[idx][f] = el.value;
        });
      });

      host.querySelectorAll('[data-action="remove-prov"]').forEach(btn => {
        btn.addEventListener("click", () => {
          const idx = Number(btn.dataset.idx);
          appState.config.providers.splice(idx, 1);
          renderProvidersPane();
          updateBadgesAndBar();
        });
      });

      host.querySelectorAll('[data-action="fetch-prov"]').forEach(btn => {
        btn.addEventListener("click", async () => {
          const idx = Number(btn.dataset.idx);
          const prov = appState.config.providers[idx];
          if (!prov) return;
          btn.disabled = true;
          btn.textContent = "Fetching...";
          try {
            await persistConfig(false);
            const res = await apiCall("/api/fetch-models", "POST", { providerId: prov.id });
            appState = { ...appState, ...res };
            updateBadgesAndBar();
            renderProvidersPane();
            showToast("Fetched " + res.fetchedCount + " model(s) from " + prov.name + ".");
          } catch (err) {
            showToast(err.message, "err");
            btn.disabled = false;
            btn.textContent = "Fetch Models";
          }
        });
      });

      host.querySelector("#btn-fetch-all")?.addEventListener("click", async (ev) => {
        const b = ev.currentTarget;
        b.disabled = true;
        b.textContent = "Fetching...";
        try {
          await persistConfig(false);
          const res = await apiCall("/api/fetch-models", "POST", {});
          appState = { ...appState, ...res };
          updateBadgesAndBar();
          renderProvidersPane();
          showToast("Fetched " + res.fetchedCount + " total model(s) across enabled providers.");
        } catch (err) {
          showToast(err.message, "err");
        } finally {
          b.disabled = false;
          b.textContent = "Fetch All Models";
        }
      });

      host.querySelector("#btn-save-providers")?.addEventListener("click", () => persistConfig(true));
    }

    function ensureCustomModelEntry(catItem) {
      const list = appState.config.customModels || [];
      let found = list.find(m => m.id.toLowerCase() === catItem.id.toLowerCase() && m.providerId === catItem.providerId);
      if (!found) {
        found = {
          id: catItem.id,
          name: catItem.name || catItem.id,
          providerId: catItem.providerId || (appState.config.providers[0]?.id || "default-provider"),
          providerName: catItem.providerName || (appState.config.providers[0]?.name || "Provider"),
          behavesAs: "claude-opus-4-6",
          contextWindow: catItem.contextWindow || 200000,
          autoCompactLimit: catItem.autoCompactLimit || 180000,
          maxOutputTokens: catItem.maxOutputTokens || 64000,
          reasoningType: catItem.reasoningType || "effort",
          effortLevels: Array.isArray(catItem.effortLevels) ? [...catItem.effortLevels] : [...BOOT.effortLevels],
          defaultEffort: catItem.defaultEffort || "medium",
          enabled: true
        };
        list.push(found);
        appState.config.customModels = list;
      }
      return found;
    }

    function renderCatalogPane() {
      const host = document.getElementById("pane-catalog");
      const providers = appState.config.providers || [];
      const customMap = new Map();
      for (const cm of (appState.config.customModels || [])) {
        customMap.set(cm.providerId + "::" + cm.id.toLowerCase(), cm);
      }

      const unified = [];
      const seenKeys = new Set();
      for (const cm of (appState.config.customModels || [])) {
        const k = cm.providerId + "::" + cm.id.toLowerCase();
        seenKeys.add(k);
        unified.push({ ...cm, isConfigured: true });
      }
      for (const cat of (appState.config.cachedCatalogModels || [])) {
        const k = cat.providerId + "::" + cat.id.toLowerCase();
        if (seenKeys.has(k)) continue;
        seenKeys.add(k);
        unified.push({ ...cat, enabled: false, isConfigured: false });
      }

      const q = catalogSearch.trim().toLowerCase();
      const filtered = unified.filter(item => {
        if (catalogProviderFilter !== "all" && item.providerId !== catalogProviderFilter) return false;
        if (catalogStatusFilter === "enabled" && !item.enabled) return false;
        if (q && !item.id.toLowerCase().includes(q) && !String(item.name || "").toLowerCase().includes(q)) return false;
        return true;
      });

      const provOpts = '<option value="all">All Providers</option>' + providers.map(p =>
        '<option value="' + esc(p.id) + '" ' + (catalogProviderFilter === p.id ? "selected" : "") + '>' + esc(p.name) + '</option>'
      ).join("");

      const defaultModelOpts = '<option value="">Auto (First Enabled Model)</option>' +
        (appState.config.customModels || []).filter(m => m.enabled !== false).map(m =>
          '<option value="' + esc(m.id) + '" ' + (appState.config.defaultModel === m.id ? "selected" : "") + '>' + esc(m.name || m.id) + ' (' + esc(m.providerName) + ')</option>'
        ).join("");

      let listHtml = "";
      if (filtered.length === 0) {
        listHtml = '<div class="empty-state">' +
          '<p style="font-weight:500;color:var(--text-main);margin:0 0 6px;">No models match the current filter</p>' +
          '<p style="margin:0;font-size:13px;">Add a custom model ID manually below or click "Fetch All Models" in LLM Providers.</p>' +
        '</div>';
      } else {
        listHtml = '<div class="model-list">' + filtered.slice(0, 250).map(item => {
          const rowKey = item.providerId + "::" + item.id;
          const isExp = expandedModels.has(rowKey);
          const ctxK = Math.round((Number(item.contextWindow) || 200000) / 1000) + "k";
          const cmpK = Math.round((Number(item.autoCompactLimit) || 180000) / 1000) + "k";

          let drawerHtml = "";
          if (isExp) {
            const levels = Array.isArray(item.effortLevels) ? item.effortLevels : [];
            const chips = BOOT.effortLevels.map(lvl =>
              '<button type="button" class="effort-chip ' + (levels.includes(lvl) ? "on" : "") + '" data-effort-key="' + esc(rowKey) + '" data-lvl="' + esc(lvl) + '">' + esc(lvl) + '</button>'
            ).join("");
            const behavesOpts = BOOT.behavesAsOptions.map(b =>
              '<option value="' + esc(b.id) + '" ' + (item.behavesAs === b.id ? "selected" : "") + '>' + esc(b.label) + '</option>'
            ).join("");

            drawerHtml = '<div class="model-row-drawer">' +
              '<div class="grid-3">' +
                '<div class="field">' +
                  '<label>Display Name</label>' +
                  '<input class="input" type="text" data-model-field="name" data-key="' + esc(rowKey) + '" value="' + esc(item.name || item.id) + '" />' +
                '</div>' +
                '<div class="field">' +
                  '<label>Context Window (tokens)</label>' +
                  '<input class="input" type="number" min="4096" step="1000" data-model-field="contextWindow" data-key="' + esc(rowKey) + '" value="' + esc(item.contextWindow || 200000) + '" />' +
                '</div>' +
                '<div class="field">' +
                  '<label>Auto-Compact Threshold (90% default)</label>' +
                  '<input class="input" type="number" min="4096" step="1000" data-model-field="autoCompactLimit" data-key="' + esc(rowKey) + '" value="' + esc(item.autoCompactLimit || 180000) + '" />' +
                '</div>' +
              '</div>' +
              '<div class="grid-2" style="margin-top:12px;">' +
                '<div class="field">' +
                  '<label>Reasoning Effort Levels</label>' +
                  '<div class="effort-chips">' + chips + '</div>' +
                '</div>' +
                '<div class="field">' +
                  '<label>Claude CLI Capability Profile (behavesAs)</label>' +
                  '<select class="select" data-model-field="behavesAs" data-key="' + esc(rowKey) + '">' + behavesOpts + '</select>' +
                '</div>' +
              '</div>' +
            '</div>';
          }

          return '<div class="model-row">' +
            '<div class="model-row-head">' +
              '<div style="display:flex;align-items:center;gap:10px;min-width:0;flex-wrap:wrap;">' +
                '<input type="checkbox" aria-label="Enable ' + esc(item.id) + '" data-toggle-model="' + esc(rowKey) + '" ' + (item.enabled ? "checked" : "") + ' />' +
                '<strong style="word-break:break-all;">' + esc(item.name || item.id) + '</strong>' +
                (item.name && item.name !== item.id ? '<code style="font-size:12px;color:var(--text-muted);">' + esc(item.id) + '</code>' : '') +
                '<span class="badge accent">' + esc(item.providerName || item.providerId) + '</span>' +
                '<span class="badge">Ctx ' + esc(ctxK) + ' · Compact ' + esc(cmpK) + '</span>' +
              '</div>' +
              '<div class="btn-row">' +
                '<button type="button" class="btn sm" data-test-model="' + esc(rowKey) + '">Test</button>' +
                '<button type="button" class="btn sm" data-expand-model="' + esc(rowKey) + '">' + (isExp ? "Hide Options" : "Configure") + '</button>' +
              '</div>' +
            '</div>' +
            drawerHtml +
          '</div>';
        }).join("") + '</div>';
      }

      host.innerHTML =
        '<div class="pane-header">' +
          '<div>' +
            '<h1 class="pane-title">Model Catalog</h1>' +
            '<p class="pane-desc">Toggle models, context windows, and reasoning effort.</p>' +
          '</div>' +
          '<button type="button" class="btn primary" id="btn-save-catalog">Save Catalog</button>' +
        '</div>' +
        '<div class="card">' +
          '<div class="grid-3">' +
            '<div class="field">' +
              '<label>Default Model</label>' +
              '<select class="select" id="sel-default-model">' + defaultModelOpts + '</select>' +
            '</div>' +
            '<div class="field">' +
              '<label>Add Custom Model ID</label>' +
              '<input class="input" type="text" id="inp-manual-model" placeholder="e.g. gpt-4.1, gemini-2.5-pro" />' +
            '</div>' +
            '<div class="field">' +
              '<label>Provider</label>' +
              '<div style="display:flex;gap:6px;">' +
                '<select class="select" id="sel-manual-prov">' +
                  providers.map(p => '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>').join("") +
                '</select>' +
                '<button type="button" class="btn" id="btn-add-manual">Add</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="card" style="padding:12px 14px;">' +
          '<div class="grid-3">' +
            '<input class="input" type="search" id="inp-cat-search" placeholder="Search model ID or display name..." value="' + esc(catalogSearch) + '" />' +
            '<select class="select" id="sel-cat-prov">' + provOpts + '</select>' +
            '<select class="select" id="sel-cat-status">' +
              '<option value="all" ' + (catalogStatusFilter === "all" ? "selected" : "") + '>All Models (' + unified.length + ')</option>' +
              '<option value="enabled" ' + (catalogStatusFilter === "enabled" ? "selected" : "") + '>Enabled Only</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        listHtml;

      host.querySelector("#sel-default-model")?.addEventListener("change", (ev) => {
        appState.config.defaultModel = ev.target.value;
      });
      host.querySelector("#inp-cat-search")?.addEventListener("input", (ev) => {
        catalogSearch = ev.target.value;
        renderCatalogPane();
        const input = document.getElementById("inp-cat-search");
        if (input) { input.focus(); input.setSelectionRange(catalogSearch.length, catalogSearch.length); }
      });
      host.querySelector("#sel-cat-prov")?.addEventListener("change", (ev) => {
        catalogProviderFilter = ev.target.value;
        renderCatalogPane();
      });
      host.querySelector("#sel-cat-status")?.addEventListener("change", (ev) => {
        catalogStatusFilter = ev.target.value;
        renderCatalogPane();
      });

      host.querySelector("#btn-add-manual")?.addEventListener("click", () => {
        const idVal = document.getElementById("inp-manual-model").value.trim();
        const provId = document.getElementById("sel-manual-prov").value;
        if (!idVal) return showToast("Enter a model ID first.", "err");
        const prov = providers.find(p => p.id === provId) || providers[0];
        if (!prov) return showToast("Configure at least one LLM Provider first.", "err");
        const cm = ensureCustomModelEntry({ id: idVal, name: idVal, providerId: prov.id, providerName: prov.name });
        cm.enabled = true;
        renderCatalogPane();
        updateBadgesAndBar();
      });

      const findUnifiedByKey = (rk) => unified.find(u => (u.providerId + "::" + u.id) === rk);

      host.querySelectorAll("[data-toggle-model]").forEach(chk => {
        chk.addEventListener("change", () => {
          const item = findUnifiedByKey(chk.dataset.toggleModel);
          if (!item) return;
          const cm = ensureCustomModelEntry(item);
          cm.enabled = chk.checked;
          updateBadgesAndBar();
          renderCatalogPane();
        });
      });

      host.querySelectorAll("[data-expand-model]").forEach(btn => {
        btn.addEventListener("click", () => {
          const rk = btn.dataset.expandModel;
          const item = findUnifiedByKey(rk);
          if (item) ensureCustomModelEntry(item);
          if (expandedModels.has(rk)) expandedModels.delete(rk);
          else expandedModels.add(rk);
          renderCatalogPane();
        });
      });

      host.querySelectorAll("[data-model-field]").forEach(el => {
        el.addEventListener("change", () => {
          const item = findUnifiedByKey(el.dataset.key);
          if (!item) return;
          const cm = ensureCustomModelEntry(item);
          const f = el.dataset.modelField;
          if (f === "contextWindow") {
            cm.contextWindow = Math.max(4096, Number(el.value) || 200000);
            cm.autoCompactLimit = Math.round(cm.contextWindow * 0.9);
            renderCatalogPane();
          } else if (f === "autoCompactLimit") {
            cm.autoCompactLimit = Math.max(4096, Number(el.value) || 180000);
          } else {
            cm[f] = el.value;
          }
        });
      });

      host.querySelectorAll("[data-effort-key]").forEach(btn => {
        btn.addEventListener("click", () => {
          const item = findUnifiedByKey(btn.dataset.effortKey);
          if (!item) return;
          const cm = ensureCustomModelEntry(item);
          const lvl = btn.dataset.lvl;
          const set = new Set(Array.isArray(cm.effortLevels) ? cm.effortLevels : []);
          if (set.has(lvl)) set.delete(lvl);
          else set.add(lvl);
          cm.effortLevels = BOOT.effortLevels.filter(x => set.has(x));
          cm.reasoningType = cm.effortLevels.length > 0 ? "effort" : "none";
          renderCatalogPane();
        });
      });

      host.querySelectorAll("[data-test-model]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const item = findUnifiedByKey(btn.dataset.testModel);
          if (!item) return;
          btn.disabled = true;
          btn.textContent = "Testing...";
          try {
            await persistConfig(false);
            const res = await apiCall("/api/test-model", "POST", { model: item.id, providerId: item.providerId });
            showToast("[" + res.model + " · " + res.latencyMs + "ms] " + (res.reply || "OK"));
          } catch (err) {
            showToast("Test failed: " + err.message, "err");
          } finally {
            btn.disabled = false;
            btn.textContent = "Test";
          }
        });
      });

      host.querySelector("#btn-save-catalog")?.addEventListener("click", () => persistConfig(true));
    }

    function renderIntegrationPane() {
      const host = document.getElementById("pane-integration");
      const gwPort = appState.config.gatewayPort || BOOT.gatewayPort || 18329;
      const logs = appState.logs || [];

      const logsRows = logs.length === 0
        ? '<tr><td colspan="6" style="color:var(--text-muted);text-align:center;padding:18px;">No model calls recorded in this session yet.</td></tr>'
        : logs.slice(0, 25).map(l =>
            '<tr>' +
              '<td>' + esc(new Date(l.time).toLocaleTimeString()) + '</td>' +
              '<td><code>' + esc(l.model) + '</code></td>' +
              '<td>' + esc(l.provider) + '</td>' +
              '<td>' + esc(l.protocol) + '</td>' +
              '<td><span class="badge ' + (l.status < 400 ? "ok" : "") + '">HTTP ' + esc(l.status) + '</span></td>' +
              '<td>' + esc(l.latencyMs) + ' ms</td>' +
            '</tr>'
          ).join("");

      host.innerHTML =
        '<div class="pane-header">' +
          '<div>' +
            '<h1 class="pane-title">Claude Integration</h1>' +
            '<p class="pane-desc">One-click registration for Claude Desktop &amp; Claude Code CLI.</p>' +
          '</div>' +
        '</div>' +
        '<div class="grid-2">' +
          '<div class="card">' +
            '<h3 style="margin:0 0 6px;font-size:15px;">Claude Desktop (MCP)</h3>' +
            '<p style="margin:0 0 12px;font-size:13px;color:var(--text-muted);">Adds <code>claude-multi-provider</code> to <code>claude_desktop_config.json</code> (with <code>.bak</code> backup).</p>' +
            '<button type="button" class="btn primary" id="btn-install-desktop">Register in Claude Desktop</button>' +
          '</div>' +
          '<div class="card">' +
            '<h3 style="margin:0 0 6px;font-size:15px;">Claude Code CLI (<code>/model</code> Picker)</h3>' +
            '<p style="margin:0 0 12px;font-size:13px;color:var(--text-muted);">Syncs enabled models &amp; 90% auto-compact limits to <code>~/.claude/settings.json</code> (Gateway <code>:' + esc(gwPort) + '</code>).</p>' +
            '<button type="button" class="btn" id="btn-sync-cli">Sync CLI Settings</button>' +
          '</div>' +
        '</div>' +
        '<div class="card">' +
          '<h3 style="margin:0 0 6px;font-size:15px;">Quick Commands</h3>' +
          '<pre class="code-box">/plugin install mp --marketplace lengoc-me/claude-multi-provider\\n/mp:use &lt;model&gt;  ·  /mp:off  ·  /mp:settings  ·  /mp:models  ·  /mp:ask &lt;model&gt; &lt;prompt&gt;\\nANTHROPIC_BASE_URL=http://127.0.0.1:' + esc(gwPort) + ' claude</pre>' +
        '</div>' +
        '<div class="card">' +
          '<div class="card-head">' +
            '<h3 style="margin:0;font-size:15px;">Recent Requests</h3>' +
            '<span class="badge">Metadata only · 0 prompts logged</span>' +
          '</div>' +
          '<div class="table-wrap">' +
            '<table class="log-table">' +
              '<thead><tr><th>Time</th><th>Model</th><th>Provider</th><th>Protocol</th><th>Status</th><th>Latency</th></tr></thead>' +
              '<tbody>' + logsRows + '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>';

      host.querySelector("#btn-install-desktop")?.addEventListener("click", async (ev) => {
        const b = ev.currentTarget;
        b.disabled = true;
        try {
          const res = await apiCall("/api/install-desktop", "POST", {});
          showToast("Updated Claude Desktop config: " + (res.updatedPaths || []).join(", "));
        } catch (err) {
          showToast(err.message, "err");
        } finally {
          b.disabled = false;
        }
      });

      host.querySelector("#btn-sync-cli")?.addEventListener("click", async (ev) => {
        const b = ev.currentTarget;
        b.disabled = true;
        try {
          await persistConfig(false);
          const res = await apiCall("/api/sync-cli", "POST", {});
          showToast("Synced " + res.syncedCount + " model(s) to " + res.settingsPath);
        } catch (err) {
          showToast(err.message, "err");
        } finally {
          b.disabled = false;
        }
      });
    }

    function renderActivePane() {
      if (activeTab === "providers") renderProvidersPane();
      else if (activeTab === "catalog") renderCatalogPane();
      else renderIntegrationPane();
    }

    async function loadState() {
      try {
        const data = await apiCall("/api/state", "GET");
        appState = data;
        updateBadgesAndBar();
        renderActivePane();
      } catch (err) {
        showToast("Failed to load state: " + err.message, "err");
      }
    }

    async function persistConfig(notify = true) {
      const res = await apiCall("/api/save", "POST", appState.config);
      appState = { ...appState, ...res };
      updateBadgesAndBar();
      renderActivePane();
      if (notify) showToast("Configuration saved.");
    }

    document.getElementById("btn-refresh-state").addEventListener("click", loadState);
    document.getElementById("btn-save-top").addEventListener("click", () => persistConfig(true));

    loadState();
  </script>
</body>
</html>`;
}
