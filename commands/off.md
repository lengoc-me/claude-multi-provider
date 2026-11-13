---
description: Unpin the active /mp:use external model and return to the native Claude model picker
---

Unpin any active `/mp:use` external model override:

- Normally intercepted locally by `hooks/hooks.json` (`UserPromptSubmit`) with **0 Claude tokens**.
- Confirm that subsequent messages will be answered by the native Claude model selected in the bottom model picker.
