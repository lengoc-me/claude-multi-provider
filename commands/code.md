---
description: Delegate a coding, debugging, or refactoring task with repository context to an external LLM model
argument-hint: "<model-id> <coding-task>"
---

Execute a repository coding or debugging task powered by an external LLM model in `claude-multi-provider`:

1. Parse `$ARGUMENTS` to identify the requested `model` (if specified) and the target coding task.
2. Read the relevant workspace files first so the external model receives accurate file contents, types, and constraints.
3. Call `mp_chat` with:
   - `model`: the requested external model (or default model if omitted)
   - `system`: "You are a senior software engineer. Return concrete, minimal, production-ready code changes and explain any edge cases."
   - `effort`: `"high"`
   - `prompt`: structured task brief + relevant file excerpts.
4. Review the proposed changes for correctness, apply them cleanly to the workspace files using your editing tools, and run the project's test/build verification command.
