---
description: List configured external LLM providers, enabled models, context windows, and optionally refresh the catalog from /v1/models
argument-hint: "[refresh | provider-id]"
---

Inspect or refresh the external model catalog in `claude-multi-provider`:

1. If `$ARGUMENTS` contains `refresh` or `fetch`, call `mp_fetch_catalog` first (passing `provider_id` if another argument specifies a provider slug).
2. Call `mp_list_models` (`include_cached_catalog: true`).
3. Present a clean Markdown table of:
   - Configured Providers (`Name`, `Base URL`, `Protocol`, `API Key Stored`)
   - Enabled Models (`Model ID`, `Provider`, `Context Window`, `Auto-Compact (90%)`, `Effort Levels`)
   - Total cached catalog count (and how to open `/mp:settings` to toggle additional models, or `/mp:use <model-id>` to pin a model for ongoing chat).
