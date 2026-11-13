---
name: mp
description: Configure, pin (/mp:use), and invoke external OpenAI-compatible and Anthropic-compatible LLM providers (CLIProxyAPI/CPA, OpenRouter, OpenAI, Google Gemini, DeepSeek, Groq, LiteLLM, Ollama) inside official Claude Desktop and Claude Code. Use when the user asks to call another model, pin an external model for ongoing chat, compare multiple models, configure external API providers, open the Model Catalog UI, or route Claude Code CLI through the local multi-provider gateway.
---

# Claude Multi-Provider Skill (`/mp:*`)

Use `claude-multi-provider` (`/mp:*` commands, sticky `UserPromptSubmit` hook, and MCP tools) to manage external LLM providers and invoke external models cleanly inside official Claude Desktop and Claude Code:

## Sticky Session Routing (`0` Claude Tokens)
- `/mp:use <model>` — Pins `<model>` in **Direct Mode** (`0` Claude tokens — intercepted locally before Anthropic's API, works even when Claude quota is 100% exhausted; supports `@path/to/file` mentions and multi-turn memory).
- `/mp:use <model> --agentic` — Pins `<model>` in **Agentic Mode** (delegates reasoning to `mp_chat` while keeping Claude's native `Read`/`Edit`/`Bash` workspace tools).
- `/mp:off` — Unpins the external model and switches immediately back to the native Claude model picker.

## Available MCP Tools
- `mp_open_settings` — Launch the local **LLM Providers & Model Catalog** Web Dashboard (`http://127.0.0.1:18320`) in the user's browser so they can add providers, securely save API keys, fetch `/v1/models` + `/v1beta/models`, and configure context/auto-compact limits.
- `mp_list_models` — Inspect configured providers (with masked API keys) and enabled/cached models.
- `mp_fetch_catalog` — Refresh model catalogs and authoritative context windows (`90%` auto-compact default) from `/v1/models` and `/v1beta/models`.
- `mp_configure_provider` — Register a provider URL/protocol or enable specific model IDs.
- `mp_chat` — Send single-turn or multi-turn prompts (with `system` and `effort` levels `low`..`max`) to any external model.
- `mp_compare_models` — Query 2–5 external models in parallel and compare responses side-by-side.
- `mp_gateway_status` — Start/check the local Anthropic-compatible Gateway (`127.0.0.1:18329`) and optionally sync `modelPicker` into `~/.claude/settings.json` when explicitly requested.

## Security Best Practices
- Prefer `mp_open_settings` (`/mp:settings`) whenever the user needs to enter or rotate secret API keys so secrets are entered directly into the local `127.0.0.1` UI rather than pasted into chat transcripts.
- Never mutate `~/.claude/settings.json` (`sync_cli_settings: true`) unless the user explicitly asks to sync custom models for Claude Code CLI.
