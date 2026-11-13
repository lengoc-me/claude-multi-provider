---
description: Pin an external LLM model for all subsequent messages in this session (0 Claude tokens in Direct mode, or --agentic for native Edit/Bash tools)
argument-hint: "[model-id | status | off] [--agentic | --effort high]"
---

Pin or inspect sticky external model routing for the current session:

- Normally intercepted locally by `hooks/hooks.json` (`UserPromptSubmit`) with **0 Claude tokens** (works even when Claude quota is exhausted).
- If hooks are disabled in your current launch flags (`--bare` or `disableAllHooks`), call `mp_list_models` to display available models and remind the user to run without `--bare` so `/mp:use <model>` and `/mp:off` intercept messages automatically.
