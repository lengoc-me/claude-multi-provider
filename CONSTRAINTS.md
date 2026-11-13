# Mechanical & Security Constraints (`CONSTRAINTS.md`)

This repository (`lengoc-me/claude-multi-provider`) is a **public source-available project licensed under the Elastic License 2.0 (ELv2) (`LICENSE`)**. Every commit, release artifact, test fixture, and documentation file must satisfy the following non-negotiable invariants.

## C1. Zero Secrets, Personal Endpoints, or Internal Topology Leaks (Hard Fail)
1. **No Real Credentials**: No API keys (`sk-...`, `ghp_...`, `gho_...`, `AIza...`, `xoxb-...`), bearer tokens, cookies, or session secrets may appear in any tracked file or git commit history.
2. **No Private Infrastructure URLs or Hostnames**: Never commit private proxy URLs, internal LAN IP ranges (`10.x.x.x`, `192.168.x.x`, `172.16-31.x.x`), UNC paths (`\\...`), personal local usernames, or references to private repositories.
3. **Allowed Public Identifiers Only**: Only generic public provider examples (`https://openrouter.ai/api/v1`, `https://api.openai.com/v1`, `https://generativelanguage.googleapis.com/v1beta/openai`, `https://api.deepseek.com/v1`, `http://localhost:8317`, `http://localhost:11434/v1`) and the official GitHub org (`https://github.com/lengoc-me/claude-multi-provider`) are permitted.
4. **Automated Enforcement**: `npm run security:audit` (`scripts/security-audit.mjs`) scans all tracked files and git history and exits non-zero on any violation.

## C2. Localhost Security & Secret Redaction at Runtime (Hard Fail)
1. **Loopback-Only Binding**: Both the Settings Web Dashboard (`127.0.0.1:18320`) and the Anthropic-Compatible Local Gateway (`127.0.0.1:18329`) must bind strictly to `127.0.0.1` unless explicitly overridden by the user via environment variable.
2. **Fail-Closed Dashboard Auth & Anti-CSRF**:
   - Every `/api/*` endpoint on the Settings Dashboard requires a valid per-process cryptographic token via `X-CMP-Token` header or `HttpOnly; SameSite=Strict` session cookie (`cmp_session`).
   - Wildcard CORS (`Access-Control-Allow-Origin: *`) is **prohibited** on dashboard `/api/*` and `/mcp` endpoints. Cross-origin browser requests must be rejected (`401`/`403`).
3. **Zero Plaintext Key Echo**:
   - `GET /api/state`, `/health`, `/mcp` tool responses, and request logs must **never** return raw `apiKey` values. Secrets are represented strictly as `{ hasApiKey: boolean, apiKeyMasked: "sk-••••abcd" }`.
   - Updating a provider with `apiKey: ""` (or omitted) while `keepExistingApiKey !== false` preserves the existing stored key on disk without round-tripping plaintext keys through the browser DOM.
4. **Restricted Config Permissions**: `~/.claude/multi-provider.json` is written with mode `0o600` (owner read/write only on POSIX).

## C3. Zero External Runtime Dependencies & Official Manifest Validity
1. **Pure Node.js (`>= 18.0.0`) Runtime**: Core MCP server, protocol translator, local gateway, Web UI, and CLI use only Node.js built-in modules (`node:http`, `node:https`, `node:crypto`, `node:fs`, `node:path`, `node:os`, `node:child_process`, `node:url`) so `/plugin install` and `.mcpb` bundles work immediately without `npm install` or native binary compilation.
2. **Official Claude Plugin Validation**: `claude plugin validate --strict --profile directory .` must pass with exit code `0` (zero errors, zero warnings).
3. **Non-Destructive Host Sync**: Installing or starting the MCP server must **never** mutate `~/.claude/settings.json` unless the user explicitly invokes `syncCliSettings` via the Dashboard or CLI/MCP opt-in action, and must create a `.bak` backup before writing `claude_desktop_config.json`.
