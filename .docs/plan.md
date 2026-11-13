# Execution Plan (`claude-multi-provider`)

## Governance & Methodology Track
- **Selected Track**: **Hybrid Mode (`Track M — Domain & Tracer-Bullet SDD` + `lnc-constraint-driven-dev`)**
- **Execution Engine**: `/w5-round-orchestrator` in-thread structured waves (zero subagent spawning per owner constraint) -> `reviewer-kai` static diff audit -> `/w18-e2e-qa-scorecard` (`qa-tester-vera` `>= 90/100` gate) -> public release to `https://github.com/lengoc-me/claude-multi-provider`.
- **Target Runtime**: Node.js `>= 18.0.0` (zero external runtime npm dependencies).

---

## Wave Breakdown

### Wave 0 — Core Domain, Security & Protocol Backbone
- **`package.json` & `scripts/security-audit.mjs`**: Package metadata, CLI bin entry, test runner, and zero-secret / zero-private-URL mechanical scanner (`CONSTRAINTS.md` C1).
- **`src/core/security.mjs`**: Per-boot cryptographic token generation, `HttpOnly; SameSite=Strict` cookie handling, `X-CMP-Token` / Origin enforcement, and API key masking (`sk-••••abcd`).
- **`src/core/catalog-spec.mjs`**: Context window & auto-compact (`90%`) inference, `/v1/models` + `/v1beta/models` parser, smart endpoint URL builder, and reasoning effort metadata.
- **`src/core/config-store.mjs`**: Atomic `0o600` JSON config persistence (`~/.claude/multi-provider.json` or `CMP_CONFIG_PATH`), `.mcpb` environment variable seeding, and secret-preserving save semantics.
- **`src/core/protocol-adapter.mjs`**: Universal upstream caller + bidirectional Anthropic `/v1/messages` <-> OpenAI `/v1/chat/completions` translator (JSON + SSE streaming + tool calls + `auto` protocol detection).

### Wave 1 — MCP Server, Local Gateway, Web Dashboard UI & Host Sync
- **`src/core/gateway-server.mjs`**: Loopback Anthropic-compatible `/v1/messages`, `/v1/models`, and `/health` HTTP/SSE server (`127.0.0.1:18329`).
- **`src/core/cli-sync.mjs`**: Opt-in `~/.claude/settings.json` `modelPicker` + `autoCompactWindow` sync and backup-safe `claude_desktop_config.json` installer.
- **`src/ui/dashboard-html.mjs` & `src/core/dashboard-server.mjs`**: Token-guarded Settings Dashboard (`127.0.0.1:18320`) with 3 responsive tabs (`LLM Providers`, `Model Catalog`, `Claude Integration & Logs`) + `/mcp` Streamable HTTP JSON-RPC endpoint.
- **`src/mcp-server.mjs` & `bin/cli.mjs`**: Official MCP `stdio` + HTTP dispatcher exposing 7 tools (`mp_list_models`, `mp_chat`, `mp_compare_models`, `mp_fetch_catalog`, `mp_configure_provider`, `mp_open_settings`, `mp_gateway_status`) and unified CLI commands.

### Wave 2 — Official Claude Plugin, `.mcpb` Bundle, Documentation & CI
- **`.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.mcp.json`**: Strict Anthropic directory-grade plugin manifests.
- **`manifest.json` & `scripts/pack-mcpb.mjs`**: Official Claude Desktop Extension (`.mcpb` v0.3) manifest with native `user_config` form fields in Claude Desktop Settings -> Extensions.
- **`commands/*.md`, `agents/*.md`, `skills/multi-provider/SKILL.md`**: Slash commands (`settings`, `models`, `ask`, `code`, `review`, `cli-gateway`), subagents (`mp-coder`, `mp-reviewer`, `mp-council`), and auto-triggered skill.
- **`README.md`, `LICENSE`, `CHANGELOG.md`, `.github/workflows/ci.yml`**: Complete English user & developer documentation and GitHub Actions CI (unit/E2E tests + `security:audit`).

### Wave 3 — Independent Code Review (`reviewer-kai`) & Live E2E QA (`qa-tester-vera` `/w18`)
- Run unit + E2E test suite against isolated mock OpenAI & Anthropic/CPA upstream servers:
  - Test `/v1/models` + `/v1beta/models` catalog discovery & `90%` auto-compact calculation
  - Test `mp_chat` & `mp_compare_models` over both `stdio` MCP and `/mcp` HTTP JSON-RPC
  - Test `/v1/messages` local gateway non-streaming & SSE streaming translation against both OpenAI `/v1/chat/completions` and Anthropic `/v1/messages` upstreams
  - Test Dashboard auth fail-closed (`401` without token, `403` cross-origin CSRF, masked API keys on `GET /api/state`, secret-preserving edits on `POST /api/save`)
  - Test responsive DOM layout (`1440x900` desktop & `375x812` mobile) and `claude plugin validate --strict --profile directory .`
- Score on `/w18-e2e-qa-scorecard` (`>= 90/100` required), verify `npm run security:audit`, and publish to `https://github.com/lengoc-me/claude-multi-provider`.
