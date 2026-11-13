---
description: Start or inspect the local Anthropic-compatible Gateway (127.0.0.1:18329) and optionally sync custom models to Claude Code CLI
argument-hint: "[sync]"
---

Check or start the local Anthropic-compatible Multi-Provider Gateway for Claude Code CLI usage:

1. Call `mp_gateway_status` with:
   - `ensure_running: true`
   - `sync_cli_settings`: `true` ONLY if `$ARGUMENTS` explicitly includes `sync` (otherwise `false`).
2. Report the active loopback Gateway URL (`http://127.0.0.1:18329` by default) and show how to launch a standalone Claude Code CLI session against it:
   ```bash
   ANTHROPIC_BASE_URL=http://127.0.0.1:18329 claude
   ```
