# Agent & Contributor Guide (`claude-multi-provider`)

## Overview
`claude-multi-provider` is an official-compatible Claude Plugin and Claude Desktop Extension (`.mcpb`) that connects Claude Desktop and Claude Code to external OpenAI-compatible and Anthropic-compatible LLM providers (CLIProxyAPI/CPA, OpenRouter, OpenAI, Google Gemini, DeepSeek, Groq, LiteLLM, Ollama, LM Studio) without modifying Claude binaries.

## Non-Negotiable Rules (See `CONSTRAINTS.md`)
1. **Zero Dependencies**: Use only Node.js `>= 18` standard library modules (`node:*`) in runtime code (`src/`, `bin/`, `scripts/`).
2. **Zero Secrets / Private Endpoints**: Never place real API keys, private proxy domains, internal LAN IPs, or personal local paths in code, tests, docs, or commits. Run `npm run security:audit` before every commit.
3. **Fail-Closed Local Security**: Bind servers to `127.0.0.1` by default, enforce `X-CMP-Token` / `SameSite=Strict` cookie auth on Dashboard `/api/*`, reject cross-origin requests, and redact all API keys in HTTP/MCP/log outputs.
4. **Manifest Compliance**: Keep `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.mcp.json`, `commands/`, `agents/`, and `skills/` strictly valid under `claude plugin validate --strict --profile directory .`.

## Key Commands
- `npm test` — Run unit + live E2E protocol, gateway, MCP, and security tests
- `npm run security:audit` — Scan repository and git history for secrets or private URLs
- `npm run pack:mcpb` — Build `dist/claude-multi-provider.mcpb` Desktop Extension bundle
- `node bin/cli.mjs dashboard` — Launch the local Settings Web UI (`http://127.0.0.1:18320`)
- `node bin/cli.mjs gateway` — Launch the local Anthropic-compatible Gateway (`http://127.0.0.1:18329`)
- `node bin/cli.mjs install-desktop` — Register the MCP server into `claude_desktop_config.json`
