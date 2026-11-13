# Changelog

All notable changes to `claude-multi-provider` are documented in this file.

## [1.1.0] - 2026-11-13

### Added
- **Short `/mp:*` Command Namespace**: Renamed plugin slug from `multi-provider` to `mp` (`/plugin install mp --marketplace lengoc-me/claude-multi-provider`) so all slash commands become concise `/mp:use`, `/mp:off`, `/mp:settings`, `/mp:models`, `/mp:ask`, `/mp:code`, `/mp:review`, `/mp:claude`, and `/mp:cli-gateway`.
- **Sticky Session Model Pinning (`hooks/hooks.json` `UserPromptSubmit`)**:
  - **Direct Mode (`/mp:use <model>`, default)**: Intercepts prompts locally before Anthropic's API is called, supports `@path/to/file` workspace file attachments and bounded multi-turn session memory (`~/.claude/mp-sessions/`), consumes **0 Claude tokens**, and continues working even when Claude account quota is 100% exhausted.
  - **Agentic Mode (`/mp:use <model> --agentic`)**: Injects `additionalContext` to delegate heavy reasoning/coding to `mp_chat` while keeping Claude's native `Read`/`Edit`/`Bash` workspace tools active.
  - **Instant Unpin (`/mp:off` / `/mp:reset` / `/mp:claude`)**: Switch back to the bottom Claude model picker anytime with zero Claude token cost.

## [1.0.0] - 2026-11-13

### Added
- **Official Claude Plugin & Marketplace Manifests**: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and `.mcp.json` validated under `claude plugin validate --strict --profile directory`.
- **Official Claude Desktop Extension (`.mcpb`)**: `manifest.json` (`manifest_version: "0.3"`) with native `user_config` fields inside **Claude Desktop → Settings → Extensions** and zero-dependency `.mcpb` bundler (`npm run pack:mcpb`).
- **Universal Protocol Adapter**: Bidirectional Anthropic `/v1/messages` ↔ OpenAI `/v1/chat/completions` translation (JSON, SSE streaming, reasoning effort, and tool calls) plus native Anthropic-compatible proxy routing (`auto`, `openai`, `anthropic`).
- **Authoritative Catalog & Context Sync**: Parallel `/v1/models` + `/v1beta/models` model discovery with automatic `contextWindow` detection and `90%` `autoCompactLimit` computation.
- **Settings & Model Catalog Web Dashboard (`127.0.0.1:18320`)**: Responsive 3-tab UI (`LLM Providers`, `Model Catalog`, `Claude Integration`) hardened with `HttpOnly; SameSite=Strict` cookies, `X-CMP-Token` CSRF protection, loopback Origin/Host guards, and redacted API keys.
- **Slash Commands & Subagents**: `/mp:settings`, `:models`, `:ask`, `:code`, `:review`, `:cli-gateway`, plus `@mp-coder`, `@mp-reviewer`, and `@mp-council`.
- **Optional Local Anthropic Gateway (`127.0.0.1:18329`)**: Native `ANTHROPIC_BASE_URL` proxy + opt-in `~/.claude/settings.json` `modelPicker` synchronization for Claude Code CLI users.
