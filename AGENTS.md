# AGENTS.md

## Worktrees

Create worktrees with `git worktree add -b <branch> .worktrees/<name> main`, then run `pnpm install` inside.
Keep the leading dot: `.gitignore` hides the folder from oxfmt, oxlint and secretlint, but tsc skips it only because it starts with a dot.
