# Agent instructions

Project-level guidance for AI coding agents (Cursor, Claude, Codex, etc.) working
in this repository. Read this before making changes.

## Always run `npm run check` after every implementation

After finishing any code change — feature, fix, refactor, even a one-line edit —
run `npm run check` and fix anything it reports before declaring the task done.

```bash
npm run check
```

This runs:

1. `npm run lint` — `eslint --ext .ts,.tsx --max-warnings 0 .` (zero-warning policy)
2. `npm run typecheck` — `tsc --noEmit`

Both must pass with exit code 0. Do not hand work back to the user with lint
errors, type errors, or unaddressed warnings. CI runs the same command and will
block otherwise.

If a lint rule genuinely cannot be satisfied, prefer rewording the code over
disabling the rule; only add an `eslint-disable` comment with a one-line
justification if there is no reasonable alternative.
