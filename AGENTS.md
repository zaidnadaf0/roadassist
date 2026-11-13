# AGENTS.md

Instructions for AI coding agents working in this repository.

## Before changing anything

1. Inspect the full project structure before making changes.
2. Read the relevant files and understand the existing architecture and dependencies.
3. Run `git status` and review the current branch before editing files.
4. Identify the root cause of a problem rather than applying a superficial fix.

## Making changes

5. Do not rewrite working code unnecessarily.
6. Follow the existing naming conventions, formatting, and coding standards.
7. Make focused, incremental changes — one concern at a time.
8. Preserve existing functionality and public interfaces.

## Protecting the project

9. Never modify authentication, authorization, Firestore rules, storage rules, or secrets without explicit approval.
10. Never expose API keys, tokens, or credentials in code, logs, or commit messages.

## Verification

11. Run the relevant tests after changes.
12. Run type checks and production builds when applicable.
13. Report exactly what changed.
14. Report failed tests and unresolved problems honestly.
15. Never claim a task is complete without verification.

## Git

16. Never commit or push without explicit approval.
17. Never modify git remotes, delete repositories, or publish projects.

## Local models

This project is configured for local inference via Ollama on `http://127.0.0.1:11434`.

- General coding: `local-ollama/qwen35agent:latest`
- Lightweight: `local-ollama/qwen25coder:latest`
- Three.js / 3D: `local-ollama/qwen3dagent:latest`

Only one model should be loaded at a time — the GPU has 4 GB VRAM.
