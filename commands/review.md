---
description: Run an independent second-opinion code review on uncommitted changes or target files using 1 or more external models
argument-hint: "[model-id | model1,model2] [target-path]"
---

Perform an independent cross-model code review using `claude-multi-provider`:

1. Inspect `git status` and `git diff` (or read the specified target files from `$ARGUMENTS`).
2. Check `$ARGUMENTS` for model selection:
   - If comma-separated models are provided (e.g. `gpt-4.1,gemini-2.5-pro`), call `mp_compare_models` with `models` and a thorough Spec + Bugs + Security review prompt containing the diff.
   - Otherwise call `mp_chat` with the specified `model` (or default external model) and `effort: "high"`.
3. Synthesize findings prioritized by severity (`Critical`, `High`, `Medium`, `Low`), citing exact file paths and line numbers.
