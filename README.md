# sldev CLI

Run coding agents side by side in your terminal: Claude Code, Codex, Cursor Agent, GitHub Copilot,
OpenCode and Gemini CLI, each in its own tab, with a marker that says which one is working, which is
ready, and which needs you. Plain shell tabs sit next to them, so one `sldev` window can stand in for a
terminal multiplexer while agents work. Free and open source (Apache-2.0). The paid [sldev-io](https://github.com/ben42-01/sldev-io)
desktop app adds mission cards, the Software Factory and more on the same project files.

What it does that a plain multiplexer doesn't:

- **Status you can trust.** Claude reports through its hooks. Every other agent is watched from its
  screen: output means working, 5 s of quiet means ready, and a bell, OSC 9/777 or its approval prompt
  means it needs you. You get a desktop notification when one needs you.
- **A worktree per agent** (`--worktree`), with the branch and diff stat on each pane.
- **Failover.** When an agent hits its plan's usage limit, the same task continues on the next one,
  with a note about where the work stands (`--failover codex,gemini`).
- **Repeat.** `sldev new --repeat 4 --gap 30m --check "npm test" "Polish the settings page"` runs the
  brief pass after pass in one worktree, a commit per pass; each pass ends when the agent exits (print mode),
  and the next gets the last report and any check failure. `--accept` makes passes interactive (`sldev accept <pane>`).
- **Workflows, editor, clean.** Attached, Ctrl-b w shows the repo's GitHub Actions runs (rerun the failed
  jobs, open one in the browser; needs the GitHub CLI, signed in), Ctrl-b e opens the pane's folder in your
  editor and Ctrl-b v its changed files side by side. `sldev open <pane> [--diff]` and `sldev workflows` do the
  same from a script. `sldev clean` drops finished panes and removes their worktrees, asking first.
- **Second opinions.** `sldev review <pane> --agent claude` has another agent review a pane's changes, read-only.
- **One set of rules** in `.sldev/rules.md`, written out as AGENTS.md, CLAUDE.md, GEMINI.md, Cursor and Copilot rules.
- **sldev skills** (`sldev skills install`): any agent can draft a mission, board stories, a factory recipe or an eval
  as files the sldev-io app takes in as drafts. `sldev skills check <file>` reads one the way the app will (agents
  started by sldev get the same check as the `sldev_check` tool), so a draft that wouldn't load is fixed before anyone waits for it.
- **Project memory** in `.sldev/memory.md`, searchable with `sldev recall`, and the sldev MCP tools in
  every agent it starts.
- **Usage and cost** from the agents' own local logs: `sldev usage [--week]`.

Nothing in the CLI talks to the network itself; the workflows view asks GitHub through your own `gh`, only
while it's open. The daemon listens on a Unix socket (a named pipe on Windows) and a loopback port (for
Claude's hooks and the MCP tools), both protected.

## Install

Needs Node.js 22.5 or newer, on Linux, macOS or Windows 10/11 (Windows is new: tested in CI, tell us what breaks).

```bash
npm i -g sldev        # once it is published to npm
```

Until then, install it from GitHub (the public downloads repo, branch `cli`, written by the "Publish CLI" workflow):

```bash
npm i -g github:ben42-01/downloads.sldev.io#cli          # newest
npm i -g github:ben42-01/downloads.sldev.io#cli-v0.3.0   # a specific version
```

From a checkout of the source repo, `npm run cli:pack` builds `dist/sldev-<version>.tgz`, which installs with `npm i -g ./dist/sldev-<version>.tgz`.

The CLI is standalone: it does not need the sldev-io desktop app, Electron or a license. It needs Node.js
22.5+, plus a C++ toolchain on Linux (`build-essential`, Python 3), because node-pty compiles there; macOS and Windows get a prebuilt binary.

On Windows the daemon listens on a named pipe instead of a Unix socket, notifications are Windows toasts,
and repeat checks run in cmd.exe (a check that starts with a `.ps1` runs in PowerShell).

## Use

```bash
sldev new --agent claude --kind build --worktree feature/dark-mode "Add a dark mode toggle"
sldev new --agent codex "Why is test/parser.test.ts flaky?"
sldev                     # attach: every session is a tab (keys below)
sldev ls
sldev wait 2 --for needs-you
sldev send 2 "yes"
sldev stop                # stops the daemon and every agent in it
```

### Tabs

Attached, every session (an agent or a plain shell) is a tab along the top, numbered `1 2 3` with a `+` at the
end for a new one. Each tab's marker is its state: a spinner while the agent works, an amber dot when it needs you,
blue when it's ready for you, `✓` done, `✕` failed, `›` a shell. A tab in the background that needs you stands out.
The line under the tabs marks the one in front and says who runs it, where (its branch) and its diff stat.

On terminals 100 columns or wider a sidebar groups the tabs by project (the repo they work in), each group with its
most urgent state, and each tab with its agent and state in words, or a shell's folder. Its foot counts the agents
by state and shows any repeat loops. Nothing is drawn in reverse video: the tab in front is bold with an accent bar,
and the line under it carries the app's blue → green → purple gradient. In a split, the pane that doesn't take the
keys is drawn faint. Colours are 24-bit where the terminal says so (`COLORTERM=truecolor`), the nearest of 256
otherwise, and sldev asks the terminal for its background (OSC 11) so lines and popups suit a light theme too.

Keys go to the tab in front; Ctrl-b is the prefix:

| Ctrl-b then | does |
| --- | --- |
| `c` | a new tab: pick a shell or an agent (the ones not installed say how to get them), then type the brief, or nothing to start it without one |
| `t` | a new shell tab (`$SHELL`; PowerShell on Windows) in the folder of the tab in front |
| `1`–`9` | that tab |
| `n` / `p` (or Tab, `o`) | next / previous tab |
| `<` / `>` | move the tab left / right |
| `,` | rename the tab |
| `x` | close the tab (asks first while its agent or shell still runs) |
| `s` | split: the tab in front and the next one side by side (needs 60 columns) |
| `w` / `e` / `v` | workflows, the tab's folder in your editor, its changed files |
| `?` | every key |
| `d` | detach; everything keeps running |
| Ctrl-b | send a Ctrl-b to the tab |

Tabs, `+` and the sidebar's rows take clicks. **Drag over a tab's text to copy it**: the selection stays inside
that tab (never the sidebar or the tab beside it) and goes to the clipboard when you let go, through wl-copy,
xclip or xsel (pbcopy, clip on macOS and Windows) and OSC 52, which also works over SSH in terminals that allow it.
The **wheel scrolls back** through a tab's history; typing goes back to the newest output. A program in a tab that
reads the mouse itself gets its clicks and wheel instead; Shift+drag still makes your terminal's own selection.

The daemon keeps the tabs: `sldev` attaches again to the same order, names, tab in front and split, and
every tab's screen and scrollback. Typing `exit` in a shell tab closes it. Shell tabs show in `sldev ls`
and take `send`, `read` and `kill` like agents, but they aren't missions: the sldev MCP tools don't list
them, and `sldev wait` without a pane waits for agents only.

### After an upgrade

The daemon from the sldev you had before may still be running. `sldev` checks its version: one with nothing
running in it is replaced on the spot; one still running agents is left alone (stopping it would stop them), and
`sldev` says so. Let them finish, then `sldev stop` and `sldev` again.

If a key does nothing, start `sldev` with `SLDEV_DEBUG_KEYS=<file>` set: each chunk the terminal sends is logged
there (with the tab in front), which shows how your terminal encodes it. Windows Terminal's win32-input-mode
(`ESC[66;48;2;1;8;1_` for Ctrl-b) is understood.

`sldev help` lists everything. `SKILL.md` teaches an agent to use sldev itself, so one agent can hand
work to another.

## Shared with the app

The CLI uses the same `.sldev/` folder (rules, memory, mission kinds, context) and the same data folder
as the app (`~/.config/sldev-io` on Linux, `~/Library/Application Support/sldev-io` on macOS;
`SLDEV_DATA_DIR` overrides it). Its own runtime files live in `cli/` inside that folder, so the app and
the CLI can run at the same time without answering each other's agents.

## Development

The CLI lives in `cli/` of the sldev-io repo and imports only `src/shared/` and the Electron-free
modules of `src/main/` (pty, launch, hooks, mcp, git, rules, memory, context, missionKinds, sldevSkills).

```bash
npm run cli:build            # → cli/dist/sldev.mjs
node cli/dist/sldev.mjs help
npx vitest run cli/test      # daemon, TUI and tracker tests, against the e2e fake CLIs
```
