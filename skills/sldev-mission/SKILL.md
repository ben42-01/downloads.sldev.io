---
name: sldev-mission
description: "Draft a mission for sldev-io: a brief, acceptance criteria, a kind and optionally an agent, saved as a draft the user launches from the app. Use when asked to write up, plan or queue a task for an agent, \"make this a mission\", or prepare work for later. It never starts the work."
metadata:
  sldev-skill: "2"
---

# Draft an sldev mission

sldev-io turns the file you write into a saved mission in its Missions list. A person reads it there and presses Launch. Don't launch anything and don't do the work yourself: your job is a brief another agent can carry out without asking questions.

## 1. Understand the task

Read the code it touches first, so the brief names real files, functions and commands. Ask the user only when the goal itself is unclear.

## 2. Write the draft

One file per mission: `.sldev/drafts/mission-<short-slug>.md`. Write it at the project root (the git top level). If you are in a git worktree, use the main checkout instead: the parent of `git rev-parse --path-format=absolute --git-common-dir`. Create the folder if it is missing.

```markdown
---
title: Retry failed uploads
kind: build
by: claude
criteria:
  - An upload that fails with a 5xx is retried up to 3 times, with backoff
  - A 4xx is not retried
  - npm test passes, with a test for each case
---
Uploads fail for good on the first 502 from the storage API, and users lose the file.

Add retries to `uploadFile` in src/api/upload.ts: up to 3 attempts for 5xx responses and network errors,
waiting 1 s, 2 s and 4 s. Keep the function's signature. Don't add a dependency for this.
```

- **title**: imperative, under 60 characters. In double quotes when it contains a colon.
- **kind**: `build` (changes code; the default), `research` (answers a question, read-only), `investigate` (finds a bug's cause, no fix), `plan` (writes a plan, no code), `review` (reviews changes already made), `freeform` (the brief is sent exactly as written).
- **criteria**: what a reviewer checks the change against. Each one observable and checkable; sldev's review shows which are met.
- **agent**: only when the user asked for one: claude, codex, cursor, copilot, opencode or gemini. Leave it out for the user's default.
- **worktree**: `false` to work in the project folder; by default a build runs in its own git worktree.
- **by**: your own agent id (claude, codex, cursor, copilot, opencode or gemini), so the user sees who drafted it.

## 3. A good brief

- The outcome first, and why it matters, in a sentence or two.
- Where: the files and functions to change, and existing code to reuse.
- Limits: what not to touch, no new dependencies unless needed, keep public APIs.
- How to check: the tests or commands to run.
- One mission is one change someone can review in one sitting. Split bigger work into several files, or use the sldev-stories skill when the parts depend on each other.

## 4. Check it

The app reads the file once, and sets aside one it can't read: the user never sees it. So before you say it's done, check it the way sldev-io reads it:

- With the sldev tools: call `sldev_check` with the file's path.
- Otherwise, if the `sldev` command is installed: run `sldev skills check <file>`.
- Otherwise read the file back yourself: the part between the `---` lines is YAML: put any value that contains `: ` or ` #`, or starts with `[ { * & ! | > ' " % @` or a backtick, in double quotes (`title: "Fix: the parser"`), and the brief under it is not empty.

Fix what the check reports and check again. Say it's done only once it passes; if you couldn't check it, say that.

## 5. Finish

Say in one line what you drafted and that it is in sldev-io under Missions, ready to launch. The app reads the file (now if it is open, otherwise when it next opens) and removes it from the drafts folder.
