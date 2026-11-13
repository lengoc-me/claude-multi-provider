# Project Status (`claude-multi-provider`)

- **Version**: `1.1.0`
- **Repository**: `https://github.com/lengoc-me/claude-multi-provider`
- **Plugin Slug**: `mp` (`/plugin install mp --marketplace lengoc-me/claude-multi-provider`)
- **QA Gate (`/w18-e2e-qa-scorecard`)**: **100/100 (`PASS — SHIP / CUTOVER READY`)**, Hard-Fail Gate `CLEAR`

## Delivered Capabilities
1. **Official Claude Plugin + Marketplace (`/mp:*`)**: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.mcp.json`, `hooks/hooks.json`, 9 slash commands (`/mp:use`, `/mp:off`, `/mp:claude`, `/mp:settings`, `/mp:models`, `/mp:ask`, `/mp:code`, `/mp:review`, `/mp:cli-gateway`), 3 subagents, and auto-triggered skill passing `claude plugin validate --strict --profile directory .` with zero errors and zero warnings.
2. **Sticky External Model Session Routing (`UserPromptSubmit` Hook)**:
   - `/mp:use <model>` (Direct Mode, default): `0` Claude tokens, multi-turn history, `@file` workspace context, works even when Claude quota is 0%.
   - `/mp:use <model> --agentic`: Low-token Agentic Mode keeping Claude's native `Read`/`Edit`/`Bash` tools active.
   - `/mp:off`: Instant zero-token return to native Claude model picker.
3. **Official Claude Desktop Extension (`.mcpb`)**: `manifest.json` (`v0.3`) with OS keychain `user_config` form fields and pure-Node `.mcpb` packager (`dist/claude-multi-provider.mcpb`).
4. **Universal Protocol Engine**: Bidirectional OpenAI `/v1/chat/completions` ↔ Anthropic `/v1/messages` translation (JSON, SSE streaming, thinking blocks, tool calls) + native Anthropic proxy support + automatic `404`/`405` protocol fallback.
5. **Settings & Model Catalog Web Dashboard (`127.0.0.1:18320`)**: 3-tab responsive UI (`1440px` desktop & `375px` mobile) with `HttpOnly; SameSite=Strict` cookie + `X-CMP-Token` CSRF protection, `/v1/models` + `/v1beta/models` sync, `90%` auto-compact calculation, and key-redacted state APIs.
6. **Optional Local Anthropic Gateway (`127.0.0.1:18329`)**: Loopback `/v1/messages` proxy + opt-in `~/.claude/settings.json` `modelPicker` synchronization for standalone Claude Code CLI sessions.
