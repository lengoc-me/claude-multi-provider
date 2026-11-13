---
description: Query any configured external LLM model (CLIProxyAPI/CPA, OpenRouter, OpenAI, Gemini, DeepSeek, Groq, Ollama)
argument-hint: "<model-id> <prompt>"
---

Route a prompt directly to an external LLM model via `claude-multi-provider`:

1. Parse `$ARGUMENTS`:
   - If the first token matches a model slug or `provider/model` identifier and text follows it, treat the first token as `model` and the remainder as `prompt`.
   - If only a question/prompt is given without a model ID, omit `model` so `mp_chat` uses the user's configured `defaultModel` (or call `mp_list_models` first if unsure).
2. Call `mp_chat` with `model` and `prompt`.
3. Present the external model's response clearly, noting the model ID, provider name, protocol, token usage, and latency header returned by `mp_chat`.
