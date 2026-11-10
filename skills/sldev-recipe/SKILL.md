---
name: sldev-recipe
description: "Write a Software Factory recipe for sldev-io: a YAML pipeline of agent, command and pull-request stages that the user runs from the app's Factory. Use when asked for a workflow, pipeline or process an agent team should follow (spec → build → test → review → PR), or to automate a repeated way of working."
metadata:
  sldev-skill: "2"
---

# Write an sldev factory recipe

A recipe is a pipeline of stages the user starts from sldev-io's Factory. It never runs on its own: you only write the file. Save it as `.sldev/factory/<short-slug>.yml` at the project root, where it shows up in the Recipes library at once. A recipe with the same name as a built-in one replaces it in this project.

## Example

```yaml
name: Feature
description: Spec, build, check, review, pull request. You approve the spec and the review.
stages:
  - id: spec
    prompt: |
      Write a short spec for this change: {intent}
      Save it to {out}. Don't change any code.
    gate: approve
  - id: build
    prompt: |
      Implement the spec in {spec.out}.
      Commit your work when the checks pass.
  - id: verify
    run: [typecheck?, lint?, test?]
    onFail: { retry: build, max: 2 }
  - id: review
    agent: codex
    prompt: |
      Review the changes on this branch against the spec in {spec.out}.
      Write your findings to {out}.
    gate: approve
  - id: pr
    pr:
      title: "{intent}"
      body: "{spec.out}"
```

## Fields

Recipe: `name` (required), `description` (one line), `setup` (command that prepares a new worktree, `none` to skip; detected from the lockfile by default), `stages` (required).

Each stage is **exactly one** of:
- an agent stage: `prompt`, optionally `agent` (a profile name from `.sldev/agents/*.md`, a CLI id: claude, codex, cursor, copilot, opencode or gemini, `Profile@cli`, or a list for a bake-off; left out = the user's default agent), or `skill` (a skill name; the prompt becomes its arguments)
- a run stage: `run`, a command, a package script name (`test`; `test?` = skip when the project has none) or a list of them
- a PR stage: `pr: { title, body }`, both optional. It only opens the pull request when the user clicks.

Per stage: `id` (letters, digits, `-`, `_`; unique), `needs` (stage ids to wait for; default the stage above; several run in parallel and are merged here; each must be defined above), `gate: approve` (wait for the user after it), `onFail: { retry: <stage above>, max: 1–10 }` (on a run stage), `maxDiff` (ask for approval past this many changed lines), `interactive: true` (a normal session the user types into), `model`, `effort`, `mode` (in that CLI's own values).

Placeholders in prompts and the PR: `{intent}` (what the user typed when starting the run), `{out}` (this stage's output file), `{<stage>.out}` (another stage's output file), `{base}` (the branch the run started from), `{log}` (on a retry, the failure that caused it).

## Good recipes

- Hand-offs between stages are files: a stage writes `{out}`, a later one reads `{stage.out}`.
- Put a check (`run`) after every stage that changes code, with `onFail` back to it.
- Gate the steps a person should see (the spec, the review); not every stage.
- Use the project's own scripts, read from package.json, the Makefile or whatever the project uses.

## Check it

The app reads the file once, and sets aside one it can't read: the user never sees it. So before you say it's done, check it the way sldev-io reads it:

- With the sldev tools: call `sldev_check` with the file's path.
- Otherwise, if the `sldev` command is installed: run `sldev skills check <file>`.
- Otherwise read the file back yourself: it is YAML, so put any value that contains `: ` or ` #`, or starts with `[ { * & ! | > ' " % @` or a backtick, in double quotes (`title: "Fix: the parser"`); each stage is exactly one kind, and every `needs`/`retry` names a stage above it.

Fix what the check reports and check again. Say it's done only once it passes; if you couldn't check it, say that.

## Finish

Say in one line that the recipe is in sldev-io under Factory → Recipes.
