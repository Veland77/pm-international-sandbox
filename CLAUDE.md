# House rules for AI-assisted development on this repo

This file is read automatically by Claude Code at the start of every session in this repo. Follow it without being reminded.

## Non-negotiable

1. **No real PM International data, ever.** Not in code, not in seed files, not in comments, not in commit messages. If you are ever given real data by mistake, stop and flag it instead of using it.
2. **Plan before code.** For any new feature or module, write a short plan (what files change, why, what the user will see) and wait for explicit approval before writing code. Small bug fixes and typo corrections are exempt.
3. **Small files.** One responsibility per file. If a file crosses ~200 lines, split it.
4. **No secrets in the repo.** API keys, tokens, credentials go in environment variables (Render dashboard), never committed.
5. **Every screen/page must show a "SANDBOX — TEST DATA" banner.** Non-negotiable, so this is never confused with a real system.

## Style

- Plain, readable code over clever code. The person maintaining this may not be a professional developer.
- Comment *why*, not *what*, and only where it's not obvious.
- Prefer explicit names over abbreviations.
- One route/feature per file under `src/routes/`.

## Testing

- Core logic (anything touching the database or business rules) needs a test.
- Tests must be runnable with a single command (`npm test`) and pass before anything is merged to `main`.

## Workflow

1. Read the plan or feature request.
2. Write a short plan back in plain language. Stop and wait for approval.
3. Once approved, implement in small commits with clear messages.
4. Run tests.
5. Summarize what changed in plain language, no jargon, suitable for a non-developer to review.

## When unsure

Ask, in plain language, rather than guessing. It's cheaper to ask than to build the wrong thing.
