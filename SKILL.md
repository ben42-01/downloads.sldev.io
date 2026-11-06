---
name: sldev
description: Run other coding agents side by side with the sldev CLI, hand them work, wait for them, read what they did, and use the project's shared memory and rules. Use when asked to delegate, run agents in parallel, get a second opinion, or check what another agent is doing.
---

# sldev: other agents in panes next to you

`sldev` runs coding agents (Claude Code, Codex, Cursor Agent, Copilot, OpenCode, Gemini CLI) in
panes owned by a background daemon. You drive them with commands; the human can watch them all with
`sldev` (no arguments). Every command below returns when it's done, so you can script them.

## Hand off work

```bash
id=$(sldev new --agent codex --kind build --worktree fix/flaky-test "Make test/parser.test.ts pass reliably")
sldev wait "$id" --for idle --timeout 1800   # ready, needs-you, done or idle (any of those)
sldev read "$id" --lines 80                  # its screen as text
sldev ls --json                              # every pane: status, report, branch, diff stat
```

- `--kind` frames the brief (build, research, plan, review, freeform; `sldev kinds` lists custom ones).
  Read-only kinds start the agent in its read-only mode. Without `--kind` the brief goes as written.
- `--worktree <branch>` isolates the work in a new git worktree; `--here` keeps it in this folder.
- `--failover claude,gemini` continues the same task on the next agent if this one hits its usage limit.
- `--print` runs the agent non-interactively: it does the task and exits, so `wait --for done` is exact.
- `--repeat 3 [--gap 10m] [--check "npm test"]` runs the brief 3 times in one worktree, each pass building on the
  last (0: until a pass changes nothing). `sldev loops` shows where each loop is; `sldev loops stop L1` ends one after its pass.

## Answer, review, stop

```bash
sldev send "$id" "yes, use Postgres"           # types it, then Enter
sldev review "$id" --agent claude              # a second agent reviews that pane's diff, read-only
sldev kill "$id"                               # stops the agent; its files and worktree stay
sldev open "$id" --diff                        # its changed files in the human's editor, side by side
sldev workflows --json                         # the repo's latest GitHub Actions runs (needs gh, signed in)
sldev clean --dry-run                          # what finished panes and worktrees clean would remove
```

A pane is `needs-you` when its agent asks for approval or rings the bell; `ls` shows the question in
`notification`. Don't approve something you weren't asked to decide: tell the human instead.

## Project memory and rules

```bash
sldev recall "how are tests run"        # notes, .sldev/context docs, pinned files, skills
sldev recall --path src/parser.ts       # everything known about a file
sldev remember "Parser tests need TZ=UTC" --files src/parser.ts
sldev rules sync                        # .sldev/rules.md → AGENTS.md, CLAUDE.md, GEMINI.md, Cursor, Copilot
```

Agents started by sldev also get these as MCP tools (`sldev_recall`, `sldev_remember`, `sldev_status`,
`sldev_missions`, `sldev_mission_diff`, `sldev_rules`). Record a gotcha or a command that works, not a
summary of your task.
