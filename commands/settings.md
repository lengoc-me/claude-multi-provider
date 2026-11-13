---
description: Open the local LLM Providers & Model Catalog Web Dashboard (127.0.0.1) and display active multi-provider status
---

Open the local **Multi-Provider** Settings & Model Catalog Web Dashboard so the user can add providers, securely enter API keys, fetch `/v1/models` + `/v1beta/models`, test endpoints, and manage enabled models:

1. Call the `mp_open_settings` MCP tool (`open_browser: true`).
2. Call `mp_list_models` (`include_cached_catalog: false`) to retrieve the current redacted provider and enabled model summary.
3. Present the authenticated local Dashboard URL (`dashboardUrl`) and a concise summary of configured providers and enabled models. Prefer letting the user enter secret API keys directly inside the local `127.0.0.1` Dashboard UI rather than pasting secrets into chat.
