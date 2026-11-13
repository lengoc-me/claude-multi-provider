# Task Checklist (`claude-multi-provider`)

## Phase 1: Specification & Governance (`/w2-specdrivendev`)
- [x] Initialize repository root, `.gitignore`, and local skill profile
- [x] Define mechanical & security constraints (`CONSTRAINTS.md`)
- [x] Write domain architecture & protocol contracts (`.docs/architecture.md`)
- [x] Lock wave execution plan (`.docs/plan.md`) and contributor guide (`AGENTS.md`)

## Phase 2: Implementation Rounds (`/w5-round-orchestrator`)
### Wave 0 — Core Engine & Security Ratchet
- [x] Create `package.json` and `scripts/security-audit.mjs` (zero-secret & zero-private-URL scanner)
- [x] Implement `src/core/security.mjs` (session token, `SameSite=Strict` cookie, CSRF/Origin guard, key masking)
- [x] Implement `src/core/catalog-spec.mjs` (`/v1/models` + `/v1beta/models` parser, context/auto-compact inference, URL builder)
- [x] Implement `src/core/config-store.mjs` (`0o600` config persistence, env seeding, secret-preserving updates)
- [x] Implement `src/core/protocol-adapter.mjs` (Anthropic <-> OpenAI JSON & SSE translator + `auto` fallback)

### Wave 1 — Servers, Web Dashboard & CLI
- [x] Implement `src/core/gateway-server.mjs` (local Anthropic `/v1/messages` & `/v1/models` HTTP/SSE proxy + auto 404 fallback)
- [x] Implement `src/core/cli-sync.mjs` (opt-in `~/.claude/settings.json` `modelPicker` sync + `claude_desktop_config.json` installer)
- [x] Implement `src/ui/dashboard-html.mjs` & `src/core/dashboard-server.mjs` (3-tab responsive Settings UI + `/mcp` HTTP)
- [x] Implement `src/mcp-server.mjs` & `bin/cli.mjs` (7 MCP tools over stdio/HTTP + unified CLI)

### Wave 2 — Official Plugin Manifests, `.mcpb` Bundle & English Docs
- [x] Create `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.claude-plugin/icon.png`, and `.mcp.json`
- [x] Create `manifest.json` (`.mcpb` Desktop Extension with `user_config`) and `scripts/pack-mcpb.mjs`
- [x] Author `commands/*.md`, `agents/*.md`, and `skills/multi-provider/SKILL.md`
- [x] Validate plugin via `claude plugin validate --strict --profile directory .` (`0` errors, `0` warnings)
- [x] Author comprehensive English `README.md`, `LICENSE` (Proprietary Usage License — All Rights Reserved), `CHANGELOG.md`, and `.github/workflows/ci.yml`

## Phase 3: Verification, E2E QA Scorecard (`/qa-tester-vera`) & GitHub Publish
- [x] Build comprehensive automated test & E2E harness (`tests/unit/core.test.mjs`, `tests/e2e/runtime.test.mjs`, `tests/e2e/run-scorecard.mjs`)
- [x] Run `reviewer-kai` static Spec + Standards + Security review (added Gateway `auto` 404 fallback)
- [x] Execute `/w18-e2e-qa-scorecard` (`qa-tester-vera` Track F -> `49 -> 100/100 PASS`, Hard-Fail Gate `CLEAR`)
- [x] Run `npm run security:audit` across working tree and git commit history (0 secrets, 0 private URLs)
- [x] Create public repository `lengoc-me/claude-multi-provider`, push `main`, tag `v1.0.0`, and attach `.mcpb` release bundle
