---
name: sldev-eval
description: "Write an eval for sldev-io: a task with checks that tells which agent (or prompt) does best on this project, run from Mission Control → Evals. Use when asked to compare or benchmark agents, models or prompts on real work, or to turn a past bug or task into a repeatable test."
metadata:
  sldev-skill: "1"
---

# Write an sldev eval

An eval is one task given to several agents, each in its own git worktree, with checks that tell a good result from a bad one. The user runs it from sldev-io (Mission Control → Evals); you only write the file. Save it as `.sldev/evals/<short-slug>.yml` at the project root, where it shows up at once.

## Example

```yaml
name: "Fix the off-by-one in pagination"
description: Can the agent find a small bug from a report and prove the fix with a test?
brief: |
  The last page of /api/items is missing its final item when the total is a multiple of the page size.
  Fix it and add a test that fails without the fix.
base: 3f2c1ab       # a commit from before the fix, so there is something to do
timeout: 20         # minutes
checks:
  - run: npm test                       # must exit 0
  - run: node scripts/check-pages.js
    expect: ok                          # and print this
  - diff: 80                            # at most this many changed lines
  - judge: The fix is in the pagination code, not a special case in the route, and the new test covers the bug.
```

## Fields

- `name`, `brief` (required): the brief is exactly what the agent is told, as you'd give it to a person.
- `checks` (required, at least one): `run` (a command that must exit 0, with optional `expect`: text the output must contain), `diff` (the most changed lines allowed), `judge` (a rubric another agent grades the change against).
- `base`: the branch or commit to start from (default: HEAD when the run starts). `setup`: the dependency install (detected by default). `timeout` in minutes (default 20).

## Good evals

- The task is real and of this project: a bug that was fixed, a feature that was built. Pick a `base` from before it, so the checks fail there and pass only when the work is done.
- At least one `run` check that can't pass by accident (a test of the behaviour, not just "it builds").
- A `diff` limit catches agents that rewrite too much; a `judge` catches what commands can't (the right place, the right approach).

## Finish

Say in one line that the eval is in sldev-io under Mission Control → Evals, ready to run on the agents the user picks. If it doesn't load, Evals shows why under the file.
