---
name: sldev-stories
description: "Write user stories for sldev-io's work board: well-defined cards with acceptance criteria and dependencies, filed into the Proposed column for a person to approve. Use when asked to break a feature or epic into stories, tickets or tasks, or to plan work for the board."
metadata:
  sldev-skill: "1"
---

# Write stories for the sldev board

Stories you write land in the board's **Proposed** column. A person reads them, edits them if needed and approves them into Agent ready, where agents pick them up. Don't start any of the work yourself.

## 1. Understand the feature

Read the code it touches and what the board already has, so you don't file work that is done or already planned. Ask the user only when the goal itself is unclear.

## 2. Shape each story

Each story is one piece of work for one coding agent in one session (one pull request), independent of the others where it can be. Give each:
- a title: imperative, under 80 characters ("Add rate limiting to /api/login")
- details in Markdown with these parts: **Why** (one or two lines), **What to do** (the files and functions likely to change), **Acceptance criteria** (a checklist anyone can verify), **How to check** (the tests or commands to run)
- labels: one to three, lowercase, e.g. feature, bug, tests, ui, api, refactor, docs
- a priority: high, normal or low
- after: only when it can't start before another story is done, that story's title (or a card number like 12); agents pick it up once those are Done

Keep it to what was asked: at most about 12 stories, and no "nice to have" work nobody asked for.

## 3. File them

- **With the sldev tools** (`sldev_board_add` is available): call it once per story, in order, so `after` can name stories you filed earlier.
- **Otherwise** write them all to `.sldev/drafts/stories-<short-slug>.json`. Write it at the project root (the git top level). If you are in a git worktree, use the main checkout instead: the parent of `git rev-parse --path-format=absolute --git-common-dir`. Create the folder if it is missing.

```json
{
  "by": "claude",
  "stories": [
    {
      "title": "Store login attempts per IP",
      "details": "**Why** …\n\n**What to do** …\n\n**Acceptance criteria**\n- [ ] …\n\n**How to check** …",
      "labels": ["api"],
      "priority": "high"
    },
    {
      "title": "Rate-limit /api/login",
      "details": "…",
      "labels": ["api", "feature"],
      "priority": "normal",
      "after": ["Store login attempts per IP"]
    }
  ]
}
```

`by` is your own agent id (claude, codex, cursor, copilot, opencode or gemini). The app adds the stories to Proposed (now if it is open, otherwise when it next opens) and removes the file.

## 4. Finish

Say in one line how many stories you wrote and that they wait in Proposed on the board.
