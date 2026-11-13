# E2E QA Scorecard & Gate Verdict (`qa-tester-vera` · `/w18`)

- **Target**: `claude-multi-provider` (`v1.0.0`)
- **QA Track**: **Track F — Full Feature & User-Journey E2E QA**
- **Tested Surfaces**:
  - Official Claude Plugin Manifests (`claude plugin validate --strict --profile directory .`)
  - Official Desktop Extension Bundle (`dist/claude-multi-provider.mcpb`)
  - MCP `stdio` JSON-RPC + Streamable HTTP `/mcp` (JSON-RPC + SSE)
  - Local Anthropic Gateway (`/v1/messages` JSON + SSE streaming + `auto` protocol 404 fallback)
  - Settings & Model Catalog Web UI (`1440x900` Desktop + `375x812` Mobile via Headless Chromium CDP)

---

## Weighted Score Breakdown

| Category | Weight | Score | Notes |
| :--- | :---: | :---: | :--- |
| **1. Core E2E Journeys & Business Effect** | 30% | **100/100** | Provider CRUD, `/v1/models` + `/v1beta/models` fetch, 90% auto-compact, `mp_chat`, `mp_compare_models`, CLI/Desktop config sync with `.bak` backups |
| **2. Contract, Protocol & Persistence Parity** | 20% | **100/100** | OpenAI `/v1/chat/completions` <-> Anthropic `/v1/messages` JSON/SSE/tool_use translation + `0600` atomic config persistence |
| **3. Auth, Security & Adversarial Boundaries** | 20% | **100/100** | Unauth `/api/state` -> `401`, unauth `/mcp` -> `401`, cross-origin CSRF -> `403`, DNS-rebind `Host` -> `403`, 0 raw API keys in responses/DOM |
| **4. Runtime, Console, Network & Footprint** | 15% | **100/100** | `0` console errors, `0` HTTP 4xx/5xx in UI, RSS `65.6 MB`, Gateway p95 `11.27 ms` |
| **5. UI/UX States, Responsive 375px & Health** | 15% | **100/100** | Desktop `1440x900` & Mobile `375x812` (`overflowX=false`), `?token=` stripped via `replaceState`, `F5` reload works via `HttpOnly; SameSite=Strict` cookie |
| **Overall Weighted Score** | **100%** | **100/100** | **Hard-Fail Gate: `CLEAR`** |

---

## Gate Verdict

> **🟢 `PASS — SHIP / CUTOVER READY` (100/100)**
> Zero Critical/High/Medium findings. Approved for public GitHub release under `lengoc-me/claude-multi-provider`.

## Evidence Artifacts
- `baseline.json`
- `screenshots/desktop-providers-1440x900.png`
- `screenshots/desktop-catalog-1440x900.png`
- `screenshots/mobile-catalog-375x812.png`
