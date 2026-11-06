#!/usr/bin/env node
import path, { basename, delimiter, dirname, join, posix, resolve, win32 } from "path";
import { parseArgs } from "util";
import { parse } from "yaml";
import { chmodSync, closeSync, constants, createReadStream, existsSync, fstatSync, mkdirSync, openSync, promises, readFileSync, readSync, readdirSync, statSync, unlinkSync, writeFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { createInterface } from "readline/promises";
import * as childProcess from "child_process";
import { execFile, spawn, spawnSync } from "child_process";
import { createConnection, createServer } from "net";
import { createHash, randomBytes } from "crypto";
import * as pty from "node-pty";
import { createServer as createServer$1 } from "http";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "module";
import { createInterface as createInterface$1 } from "readline";
[
	"You implement the task you are given, end to end.",
	"- Read the surrounding code first and match its style.",
	"- Keep the change focused: no unrelated refactors.",
	"- Run the project checks (typecheck, tests, lint) and fix what fails.",
	"- Commit when done with a short imperative message."
].join("\n"), [
	"You write specs, not code. Do not edit source files.",
	"Read the codebase as needed, then write a short spec: goal, scope and non-goals, the files",
	"likely to change, the approach, edge cases, and how to verify it (tests to add or run).",
	"Keep it under a page. If a decision is genuinely open, list it under \"Open questions\"."
].join("\n"), [
	"You review changes; you never edit files.",
	"Look for correctness bugs, missed edge cases, security issues, broken invariants and missing",
	"tests. Skip style nits a formatter would catch. For each finding give the file and line, what",
	"goes wrong and a concrete fix. End with a one-line verdict: ship, ship with fixes, or rework."
].join("\n"), [
	"You write tests. Follow the project test framework and conventions.",
	"Cover the behaviour that matters, including edge cases and failure paths. When asked to",
	"reproduce a bug, write a test that fails for the reported reason before any fix exists.",
	"Run the tests and report what passes and fails."
].join("\n"), [
	"You fix failures: failing tests, type errors, lint errors or a broken CI run.",
	"Find the root cause before changing anything. Make the smallest correct fix; never delete or",
	"weaken a test to make it pass. Re-run the failing check until it is green."
].join("\n");
/** For agents without a system-prompt flag the role travels in the prompt. */
function promptWithRole(role, prompt) {
	const task = prompt?.trim();
	return task ? `${role.trim()}\n\n---\n\nTask:\n${task}` : `${role.trim()}\n\nWait for my first task.`;
}
// src/shared/argv.ts
/**
* Agents are started from an argv array, never from a command string: the prompt is one array
* element from the renderer to the spawned process. Building one string and handing it to a shell
* broke on Windows (cmd.exe doesn't understand `\"`, so Claude got the prompt "need").
*
* This module holds the pure quoting rules; src/main/launch.ts picks which one applies.
*/
/**
* Split a user-typed argument string (extra args, custom agent templates) into words: whitespace
* separates, '…' and "…" group, a backslash escapes the next character outside single quotes.
*/
function splitArgs(s) {
	const out = [];
	let cur = "";
	let inWord = false;
	let quote = null;
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (quote) {
			if (c === quote) quote = null;
			else if (c === "\\" && quote === "\"" && (s[i + 1] === "\"" || s[i + 1] === "\\")) cur += s[++i];
			else cur += c;
		} else if (c === "\"" || c === "'") {
			quote = c;
			inWord = true;
		} else if (c === "\\" && i + 1 < s.length && !/[A-Za-z0-9_.:]/.test(s[i + 1])) {
			cur += s[++i];
			inWord = true;
		} else if (/\s/.test(c)) {
			if (inWord) out.push(cur);
			cur = "";
			inWord = false;
		} else {
			cur += c;
			inWord = true;
		}
	}
	if (inWord) out.push(cur);
	return out;
}
/**
* Quote one argument so CommandLineToArgvW (and the C runtime, which every .exe uses) reads it back
* exactly: wrap in quotes when needed, double the backslashes in front of a quote or the closing quote.
*/
function quoteWindowsArg(arg) {
	if (arg !== "" && !/[\s"]/.test(arg)) return arg;
	let out = "\"";
	let slashes = 0;
	for (const c of arg) {
		if (c === "\\") {
			slashes++;
			continue;
		}
		if (c === "\"") out += "\\".repeat(slashes * 2 + 1) + "\"";
		else out += "\\".repeat(slashes) + c;
		slashes = 0;
	}
	return out + "\\".repeat(slashes * 2) + "\"";
}
function windowsCommandLine(args) {
	return args.map(quoteWindowsArg).join(" ");
}
var CMD_META = /([()\][%!^"`<>&|;, *?])/g;
/**
* The command line for `cmd.exe /d /s /c "<this>"` that runs a .cmd/.bat shim with exact arguments
* (the cross-spawn rules: quote for the C runtime, then caret-escape cmd's metacharacters twice,
* because the shim's %* expands them once more). cmd.exe ends a command at a line break, so
* multi-line arguments can't go through it at all.
*/
function cmdShimCommandLine(shim, args) {
	if (args.some((a) => /[\r\n]/.test(a))) throw new Error("multi-line argument");
	const escapeArg = (a) => `"${a.replace(/(\\*)"/g, "$1$1\\\"").replace(/(\\*)$/, "$1$1")}"`.replace(CMD_META, "^$1").replace(CMD_META, "^$1");
	return [shim.replace(CMD_META, "^$1"), ...args.map(escapeArg)].join(" ");
}
// src/shared/agents.ts
/** The sldev MCP server for one mission. */
var sldevMcp = (info, mission) => ({
	command: info.command,
	args: [
		info.script,
		"--mission",
		mission
	],
	env: { ELECTRON_RUN_AS_NODE: "1" }
});
var tomlString = (s) => JSON.stringify(s);
var flag = (cond, ...parts) => cond ? parts : [];
var extraArgs = (o) => splitArgs(o.extraArgs ?? "");
var promptArg = (prompt) => flag(prompt?.trim(), prompt?.trim() ?? "");
var claude = {
	id: "claude",
	name: "Claude Code",
	bin: "claude",
	install: "npm i -g @anthropic-ai/claude-code",
	models: [
		"opus",
		"sonnet",
		"haiku",
		"fable"
	],
	modes: [
		{
			value: "acceptEdits",
			label: "Accept edits"
		},
		{
			value: "plan",
			label: "Plan"
		},
		{
			value: "auto",
			label: "Auto"
		},
		{
			value: "dontAsk",
			label: "Don't ask"
		},
		{
			value: "manual",
			label: "Manual"
		},
		{
			value: "bypassPermissions",
			label: "Bypass permissions"
		}
	],
	unattendedMode: "auto",
	readOnlyMode: "plan",
	efforts: [
		"low",
		"medium",
		"high",
		"xhigh",
		"max"
	],
	usageLimit: /(?:usage|session|weekly|5-hour|opus) limit reached|limit will reset at|you've hit your (?:usage|session|weekly) limit/i,
	hooks: true,
	claudeSkills: true,
	canPrint: true,
	canResume: true,
	systemPrompt: true,
	mcpArgs: (m) => ["--mcp-config", JSON.stringify({ mcpServers: { sldev: {
		type: "stdio",
		command: m.command,
		args: m.args,
		env: m.env
	} } })],
	build: (o, prompt, name, { settingsPath, resume, role }) => [
		"claude",
		...flag(settingsPath, "--settings", settingsPath ?? ""),
		...resume === true ? ["--continue"] : flag(resume, "--resume", String(resume)),
		...flag(o.print && !resume, "-p"),
		...flag(o.model, "--model", o.model ?? ""),
		...flag(o.permissionMode, "--permission-mode", o.permissionMode ?? ""),
		...flag(o.effort, "--effort", o.effort ?? ""),
		...flag(role?.trim() && !resume, "--append-system-prompt", role?.trim() ?? ""),
		...flag(!o.print && name && !resume, "-n", name ?? ""),
		...extraArgs(o),
		...resume ? [] : promptArg(prompt)
	]
};
var BUILTIN_AGENTS = [
	claude,
	{
		id: "codex",
		name: "Codex",
		bin: "codex",
		install: "npm i -g @openai/codex",
		models: [],
		modelPlaceholder: "default",
		modes: [
			{
				value: "read-only",
				label: "Read only"
			},
			{
				value: "full-auto",
				label: "Workspace write, no prompts"
			},
			{
				value: "yolo",
				label: "No sandbox, no approvals"
			}
		],
		unattendedMode: "full-auto",
		readOnlyMode: "read-only",
		efforts: [
			"minimal",
			"low",
			"medium",
			"high"
		],
		usageLimit: /you've hit your usage limit|usage limit (?:reached|exceeded)|rate limit reached for|last status: 429/i,
		asks: /Would you like to (?:run|make|apply)|Yes, proceed|Allow command|\[y\/N\]/i,
		hooks: false,
		canPrint: true,
		canResume: true,
		mcpArgs: (m) => ["-c", `mcp_servers.sldev={command=${tomlString(m.command)},args=[${m.args.map(tomlString).join(",")}],env={${Object.entries(m.env).map(([k, v]) => `${k}=${tomlString(v)}`).join(",")}}}`],
		build: (o, prompt, _name, { resume }) => [
			"codex",
			...resume ? ["resume", "--last"] : flag(o.print, "exec"),
			...flag(o.model, "--model", o.model ?? ""),
			...flag(o.permissionMode === "read-only", "--sandbox", "read-only"),
			...flag(o.permissionMode === "full-auto", "--sandbox", "workspace-write"),
			...flag(o.permissionMode === "full-auto" && !o.print, "--ask-for-approval", "on-request"),
			...flag(o.permissionMode === "yolo", "--dangerously-bypass-approvals-and-sandbox"),
			...flag(o.effort, "-c", `model_reasoning_effort=${o.effort}`),
			...extraArgs(o),
			...resume ? [] : promptArg(prompt)
		]
	},
	{
		id: "cursor",
		name: "Cursor Agent",
		bin: "agent",
		aliases: ["cursor-agent"],
		install: "curl https://cursor.com/install -fsS | bash",
		models: [],
		modelPlaceholder: "default",
		modes: [{
			value: "force",
			label: "Auto-approve commands (--force)"
		}],
		efforts: [],
		usageLimit: /you've hit your usage limit|usage limit (?:reached|exceeded)/i,
		asks: /Run this command\?|Waiting for approval|Accept (?:changes|this)|\[y\/N\]|\(y\/n\)/i,
		hooks: false,
		canPrint: true,
		canResume: true,
		build: (o, prompt, _name, { resume }) => [
			"agent",
			...flag(resume, "resume"),
			...flag(o.print && !resume, "-p", "--trust"),
			...flag(o.model, "--model", o.model ?? ""),
			...flag(o.permissionMode === "force", "--force"),
			...extraArgs(o),
			...resume ? [] : promptArg(prompt)
		]
	},
	{
		id: "copilot",
		name: "GitHub Copilot",
		bin: "copilot",
		install: "npm i -g @github/copilot",
		models: [],
		modelPlaceholder: "default",
		modes: [{
			value: "allow-all-tools",
			label: "Allow all tools"
		}],
		efforts: [],
		usageLimit: /quota exceeded|exceeded your .{0,40}(?:allowance|quota)|rate limit exceeded/i,
		asks: /Do you want to (?:run|edit|create|make|allow)|don't ask again|\[y\/N\]/i,
		hooks: false,
		canPrint: true,
		canResume: true,
		build: (o, prompt, _name, { resume }) => [
			"copilot",
			...flag(resume, "--continue"),
			...flag(o.model, "--model", o.model ?? ""),
			...flag(o.permissionMode === "allow-all-tools" || o.print && !resume, "--allow-all-tools"),
			...extraArgs(o),
			...resume || !prompt?.trim() ? [] : [o.print ? "-p" : "-i", prompt.trim()]
		]
	},
	{
		id: "opencode",
		name: "OpenCode",
		bin: "opencode",
		install: "npm i -g opencode-ai",
		models: [],
		modelPlaceholder: "provider/model",
		modes: [{
			value: "build",
			label: "Build agent"
		}, {
			value: "plan",
			label: "Plan agent"
		}],
		readOnlyMode: "plan",
		efforts: [],
		usageLimit: /usage limit (?:reached|exceeded)|quota exceeded|rate limit exceeded|429 Too Many Requests/i,
		asks: /Permission required|Allow once|Always allow/,
		hooks: false,
		canPrint: true,
		canResume: true,
		build: (o, prompt, _name, { resume }) => [
			"opencode",
			...flag(o.print && !resume, "run"),
			...flag(resume, "--continue"),
			...flag(o.model, "--model", o.model ?? ""),
			...flag(o.permissionMode, "--agent", o.permissionMode ?? ""),
			...extraArgs(o),
			...resume || !prompt?.trim() ? [] : o.print ? [prompt.trim()] : ["--prompt", prompt.trim()]
		]
	},
	{
		id: "gemini",
		name: "Gemini CLI",
		bin: "gemini",
		install: "npm i -g @google/gemini-cli",
		models: [],
		modelPlaceholder: "default",
		modes: [{
			value: "auto_edit",
			label: "Auto-accept edits"
		}, {
			value: "yolo",
			label: "YOLO (approve everything)"
		}],
		unattendedMode: "auto_edit",
		efforts: [],
		usageLimit: /quota exceeded|RESOURCE_EXHAUSTED|usage limit reached/i,
		asks: /Allow execution|Apply this change\?|Yes, allow (?:once|always)|\[y\/N\]/i,
		hooks: false,
		canPrint: true,
		canResume: true,
		build: (o, prompt, _name, { resume }) => [
			"gemini",
			...flag(resume, "--resume", "latest"),
			...flag(o.model, "--model", o.model ?? ""),
			...flag(o.permissionMode, "--approval-mode", o.permissionMode ?? ""),
			...extraArgs(o),
			...resume || !prompt?.trim() ? [] : [o.print ? "-p" : "-i", prompt.trim()]
		]
	}
];
/**
* Fill a user-defined command template: {prompt}, {model}, {name}. The template is split into words
* first, so a value fills its word and never becomes more arguments. A word that is only a
* placeholder disappears when the value is empty; the prompt is appended when there is no {prompt}.
*/
function fillTemplate(template, o, prompt, name) {
	const values = {
		prompt: prompt?.trim() ?? "",
		model: o.model?.trim() ?? "",
		name: name?.trim() ?? ""
	};
	const words = splitArgs(template);
	const out = words.flatMap((w) => {
		const filled = w.replace(/\{(prompt|model|name)\}/g, (_m, k) => values[k]);
		return /^\{(prompt|model|name)\}$/.test(w) && !filled ? [] : [filled];
	});
	if (!words.some((w) => w.includes("{prompt}")) && values.prompt) out.push(values.prompt);
	return [...out, ...extraArgs(o)];
}
function customAgentDef(c) {
	return {
		id: c.id,
		name: c.name,
		bin: splitArgs(c.command)[0] ?? "",
		models: [],
		modelPlaceholder: c.command.includes("{model}") ? "model" : void 0,
		modes: [],
		efforts: [],
		hooks: false,
		canPrint: !!c.printCommand?.trim(),
		canResume: !!c.resumeCommand?.trim(),
		custom: true,
		build: (o, prompt, name, { resume }) => {
			if (resume && c.resumeCommand?.trim()) return splitArgs(c.resumeCommand);
			return fillTemplate(o.print && c.printCommand?.trim() ? c.printCommand : c.command, o, prompt, name);
		}
	};
}
function allAgents(custom = []) {
	return [...BUILTIN_AGENTS, ...custom.filter((c) => c.name.trim() && c.command.trim()).map(customAgentDef)];
}
function findAgent(id, custom = []) {
	return allAgents(custom).find((a) => a.id === (id || "claude")) ?? claude;
}
/**
* The permission mode a Factory stage runs with when its profile sets none: Settings → Factory, else
* the agent's unattendedMode. '' in settings means the CLI's own default.
*/
function stageMode(agent, settings) {
	const picked = settings?.[agent.id];
	return (picked === void 0 ? agent.unattendedMode : picked) || void 0;
}
var onPath = null;
/** Executables found on PATH (state/agents.ts), so an agent starts under whichever name is installed. */
function setInstalledBins(bins) {
	onPath = bins;
}
/** The installed name of an agent's CLI: its bin, else the first installed alias. */
function installedBin(agent) {
	return [agent.bin, ...agent.aliases ?? []].find((b) => onPath?.includes(b));
}
/** The argv that starts (or resumes) an agent session; the prompt is one element. */
function agentCommand(agent, o, prompt, name, extra = {}) {
	const role = extra.resume ? void 0 : extra.role?.trim();
	const p = role && !agent.systemPrompt ? promptWithRole(role, prompt) : prompt;
	const parts = agent.build(o, p, name, agent.hooks ? {
		...extra,
		role
	} : { resume: extra.resume });
	if (extra.mcp && agent.mcpArgs) parts.splice(1, 0, ...agent.mcpArgs(extra.mcp));
	const bin = installedBin(agent);
	if (bin && parts[0] === agent.bin) parts[0] = bin;
	return parts;
}
// src/shared/context.ts
/**
* Project context: what agents should know about a project, found by topic or by file. The truth is
* Markdown in the repo (committable, reviewable): `.sldev/memory.md` (learnings), `.sldev/context/*.md`
* (reference docs, e.g. from a "Map project" mission), `.sldev/pinned.md` (files the user pinned) and
* project skills. The main process indexes them into a local SQLite database (full-text search plus
* edges from each note to the files it mentions); deleting the index loses nothing.
*
* Everything here is pure, so parsing, ranking, staleness and the prompt text are unit-tested.
*/
var CONTEXT_DIR = ".sldev/context";
var PINNED_FILE = ".sldev/pinned.md";
var SKILL_DIRS = [
	".claude/skills",
	".sldev/skills",
	".agents/skills"
];
var EXT = /\.[a-z0-9]{1,8}$/i;
var CODE = /`([^`\n]{2,200})`/g;
var BARE = /(?:^|[\s("'[])((?:\.{0,2}\/)?[\w@.-]+(?:\/[\w@.-]+)*\/?)(?=$|[\s)"',;:\]!?])/g;
/** Normalize to repo-relative with forward slashes; undefined for what can't be a project path. */
function normalizePath(p, root) {
	let s = p.trim().replace(/\\/g, "/").replace(/^["'`]|["'`]$/g, "");
	if (root) {
		const r = root.replace(/\\/g, "/").replace(/\/$/, "");
		if (s === r) return void 0;
		if (s.startsWith(`${r}/`)) s = s.slice(r.length + 1);
	}
	s = s.replace(/^\.\//, "").replace(/\/+$/, "").replace(/\/{2,}/g, "/");
	if (!s || s === "." || s.startsWith("../") || s.startsWith("/") || /^[a-z]:/i.test(s) || /^[a-z]+:\/\//i.test(s)) return void 0;
	if (s.includes(" ") || s.length > 200) return void 0;
	return s;
}
/**
* File and folder paths a note mentions: anything in backticks that looks like a path, and bare
* tokens with a slash or an extension. Candidates only: the indexer keeps the ones that exist.
*/
function extractPaths(text) {
	const out = /* @__PURE__ */ new Set();
	const add = (raw) => {
		const cleaned = raw.replace(/[.,;:]+$/, "").replace(/:\d+(?::\d+)?$/, "");
		if (!cleaned.includes("/") && !EXT.test(cleaned)) return;
		if (/^\d+(\.\d+)+$/.test(cleaned) || /^v?\d/.test(cleaned) && !cleaned.includes("/")) return;
		const p = normalizePath(cleaned);
		if (p) out.add(p);
	};
	for (const m of text.matchAll(CODE)) if (!/\s/.test(m[1].trim())) add(m[1].trim());
	const plain = text.replace(CODE, " ");
	for (const m of plain.matchAll(BARE)) add(m[1]);
	return [...out];
}
/** Does a note about `edge` concern `path`? The same file, or one inside the other (a folder). */
function pathMatches(edge, path) {
	return edge === path || path.startsWith(`${edge}/`) || edge.startsWith(`${path}/`);
}
var MEMORY_LINE = /^- (\d{4}-\d\d-\d\d): (.*?)(?: · files: (.+))?$/;
/** Splits "note text (origin)" into its parts; the origin is the last parenthesized group. */
function splitOrigin(s) {
	const m = /^(.*\S)\s+\(([^()]+)\)$/.exec(s);
	return m ? {
		text: m[1],
		origin: m[2]
	} : { text: s };
}
/** One node per dated line of `.sldev/memory.md`. */
function parseMemory(text, source = ".sldev/memory.md") {
	const out = [];
	text.split(/\r?\n/).forEach((line, i) => {
		const m = MEMORY_LINE.exec(line);
		if (!m) return;
		const { text: note, origin } = splitOrigin(m[2].trim());
		const listed = (m[3] ?? "").split(",").map((p) => normalizePath(p)).filter((p) => !!p);
		out.push({
			kind: "learning",
			source,
			line: i + 1,
			title: note,
			body: note,
			day: m[1],
			origin,
			paths: [.../* @__PURE__ */ new Set([...listed, ...extractPaths(note)])]
		});
	});
	return out;
}
var FRONT$1 = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
var SECTION_MAX = 4e3;
/**
* A Markdown doc as one node per section (# / ## / ### heading), so a hit points at the part that
* matters. Text before the first heading belongs to a section titled after the file.
*/
function parseDoc(text, source, kind = "doc") {
	const lines = text.replace(FRONT$1, (m) => "\n".repeat(m.split("\n").length - 1)).split(/\r?\n/);
	const fileTitle = source.split("/").pop().replace(/\.md$/i, "");
	const out = [];
	let cur = {
		title: fileTitle,
		line: 1,
		body: []
	};
	let fence = false;
	const flush = () => {
		const body = cur.body.join("\n").trim();
		if (!body) return;
		out.push({
			kind,
			source,
			line: cur.line,
			title: cur.title,
			body: body.slice(0, SECTION_MAX),
			paths: extractPaths(`${cur.title}\n${body}`)
		});
	};
	lines.forEach((l, i) => {
		if (/^\s*(```|~~~)/.test(l)) fence = !fence;
		const h = fence ? null : /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(l);
		if (h) {
			flush();
			cur = {
				title: h[2],
				line: i + 1,
				body: []
			};
		} else cur.body.push(l);
	});
	flush();
	return out;
}
/** A skill as one node: its name and description are what an agent decides on. */
function parseSkill(text, source) {
	const front = FRONT$1.exec(text)?.[1] ?? "";
	const field = (k) => {
		const m = new RegExp(`^${k}:\\s*(.+)$`, "m").exec(front);
		return m ? m[1].trim().replace(/^["']|["']$/g, "") : void 0;
	};
	const dir = source.split("/").slice(-2, -1)[0] ?? source;
	const name = field("name") ?? dir;
	const description = field("description") ?? "";
	const rest = text.replace(FRONT$1, "").trim();
	return {
		kind: "skill",
		source,
		line: 1,
		title: `Skill: ${name}`,
		body: `${description}\n\n${rest}`.trim().slice(0, SECTION_MAX),
		paths: extractPaths(rest)
	};
}
var PINNED_LINE = /^- `([^`]+)`(?::\s*(.*))?$/;
[
	"# Pinned context",
	"",
	"Files sldev-io offers to agents when a mission is about them. Edit freely; commit it to share with your team.",
	""
].join("\n");
function parsePinned(text) {
	const out = [];
	text.split(/\r?\n/).forEach((line, i) => {
		const m = PINNED_LINE.exec(line.trim());
		const path = m && normalizePath(m[1]);
		if (path) out.push({
			path,
			note: m[2]?.trim() || void 0,
			line: i + 1
		});
	});
	return out;
}
/** A pinned file as a node: its note and path; Markdown files also get their sections indexed. */
function pinnedNode(p, content) {
	const head = {
		kind: "file",
		source: p.path,
		line: 0,
		title: p.note ? `${p.path}: ${p.note}` : p.path,
		body: `${p.note ?? ""}\n${p.path.replace(/[/._-]+/g, " ")}`.trim(),
		paths: [p.path]
	};
	if (!content || !/\.(md|mdx|markdown|txt)$/i.test(p.path)) return [head];
	return [head, ...parseDoc(content, p.path, "file").map((n) => ({
		...n,
		paths: [.../* @__PURE__ */ new Set([p.path, ...n.paths])]
	}))];
}
var STOP = new Set("the and for with that this from into onto about what when where which while have has had was were are not but you your our its can could should would will shall then than them they there here also just only some any all each more most other such very make made use used using add fix get set new old one two out how why who does did done let lets need needs want please task mission work code file files project change changes".split(" "));
/** Words worth searching for in a brief or a question. */
function searchTerms(text, max = 24) {
	const words = text.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? [];
	return [...new Set(words.filter((w) => !STOP.has(w) && !/^\d+$/.test(w)))].slice(0, max);
}
/** An FTS5 MATCH expression: any of the terms, each quoted so nothing is read as syntax. */
function ftsQuery(text) {
	const terms = searchTerms(text);
	return terms.length ? terms.map((t) => `"${t.replace(/"/g, "")}"`).join(" OR ") : null;
}
var KIND_WEIGHT = {
	learning: 1.5,
	doc: 1,
	file: 1.2,
	skill: .8
};
/**
* Ranks full-text hits (bm25: lower is better) together with notes about the files the text names.
* A note about a named file is a strong signal; learnings weigh a little more than reference text.
*/
function rankHits(fts, byPath, kinds, limit) {
	const score = /* @__PURE__ */ new Map();
	for (const r of fts) score.set(r.id, Math.max(0, -r.bm25));
	for (const id of byPath) score.set(id, (score.get(id) ?? 0) + 5);
	return [...score.entries()].map(([id, s]) => ({
		id,
		score: s * (KIND_WEIGHT[kinds.get(id) ?? "doc"] ?? 1)
	})).filter((h) => h.score > 0).sort((a, b) => b.score - a.score || b.id - a.id).slice(0, limit);
}
/** When a note was written, in ms: the end of its day for learnings, else its file's last change. */
function writtenAt(n, sourceTime) {
	if (n.day) {
		const [y, m, d] = n.day.split("-").map(Number);
		return new Date(y, m - 1, d + 1).getTime();
	}
	return sourceTime;
}
/**
* The first file a note is about that changed after the note was written, or that's gone.
* `changedAt` holds each path's last change (commit time, or mtime outside git); undefined = missing.
*/
function staleness(paths, written, changedAt, ignore) {
	for (const p of paths) {
		if (p === ignore || !changedAt.has(p)) continue;
		const t = changedAt.get(p);
		if (t === void 0) return {
			path: p,
			why: "missing"
		};
		if (written !== void 0 && t > written) return {
			path: p,
			why: "changed"
		};
	}
}
var clipLine = (s, n) => {
	const one = s.replace(/\s+/g, " ").trim();
	return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};
/** One line per hit: where to read it (absolute, so it works from a worktree too) and what it says. */
function hitLine(h, root) {
	const sep = root.includes("\\") && !root.includes("/") ? "\\" : "/";
	return `- ${`${root.replace(/[\\/]$/, "")}${sep}${h.source.split("/").join(sep)}${h.line > 1 ? `:${h.line}` : ""}`}: ${h.kind === "learning" ? `${clipLine(h.title, 160)}${h.day ? ` (${h.day})` : ""}` : h.kind === "file" && h.line === 0 ? `pinned: ${clipLine(h.title, 120)}` : clipLine(h.title, 120)}${h.stale ? ` [may be out of date: ${h.stale.path} ${h.stale.why === "missing" ? "is gone" : "changed since"}]` : ""}`;
}
/**
* The lines a mission's prompt gets: the notes from the project context that match its brief, where
* the whole memory is, and (with the sldev tools) how to look up more and add to it.
*/
function contextPointer(hits, root, o) {
	const parts = [];
	if (o.memoryExists) parts.push(`Project memory: earlier agents and the team recorded what they learned about this project in ${o.memoryPath}. Read it before you start; it may save you time.`);
	if (hits.length) parts.push(`Project context that looks relevant to this task (read what applies; check anything marked out of date against the code):\n${hits.map((h) => hitLine(h, root)).join("\n")}`);
	const tools = [o.tools && (hits.length || o.memoryExists) ? "Look up more with the sldev_recall tool, by topic or by file." : "", o.tools ? "If you learn something a future agent here should know (a gotcha, a command, a convention), record it in one line with the sldev_remember tool, with the files it is about." : ""].filter(Boolean).join(" ");
	if (tools) parts.push(tools);
	return parts.join("\n\n");
}
/** Text for sldev_recall: each hit with where it is, what it says, and the files it links to. */
function recallText(hits, root, related = []) {
	if (!hits.length) return "Nothing in the project context matches. Read the code, and record what you learn with sldev_remember.";
	const blocks = hits.map((h) => {
		const head = hitLine(h, root);
		const body = h.kind === "learning" || h.body.trim() === h.title.trim() ? "" : `\n  ${clipLine(h.body, 600)}`;
		const meta = [h.origin ? `from ${h.origin}` : "", h.paths.length ? `files: ${h.paths.slice(0, 8).join(", ")}` : ""].filter(Boolean).join(" · ");
		return `${head}${body}${meta ? `\n  ${meta}` : ""}`;
	});
	const more = related.length ? `\n\nRelated files (other notes mention them too): ${related.slice(0, 12).join(", ")}` : "";
	return `${blocks.join("\n")}${more}`;
}
/** What a Map mission (and the installable skill) asks for. Shared so both stay the same. */
var MAP_INSTRUCTIONS = [
	`Write reference docs about this project for the agents that will work here after you, in ${CONTEXT_DIR}/. sldev-io indexes them and points each later mission at the sections that match its task.`,
	"First read the README, docs, package and build files, CI workflows, scripts and the main source folders. Then write these Markdown files, skipping one when there is nothing true to say:",
	[
		"- overview.md: what the project is, its main parts and where each lives",
		"- architecture.md: modules, entry points and how data flows between them",
		"- commands.md: install, run, test, lint, build and release, verified against the package files and CI",
		"- conventions.md: the code style, patterns, naming and testing approach the code actually follows",
		"- gotchas.md: traps, invariants, environment quirks, things that are easy to break"
	].join("\n"),
	[
		"Rules:",
		"- One ## section per topic, short and specific. Search finds sections, not files.",
		"- Name the real files in backticks (`src/server/auth.ts`). sldev-io links each section to those files and flags it when they change.",
		"- Don't restate AGENTS.md, CLAUDE.md or other agent rules files; point to them.",
		"- Write only what you verified in the code. Mark guesses as such, or leave them out.",
		`- If ${CONTEXT_DIR}/ already has docs, update them instead of writing new ones beside them.`,
		"- If a recurring procedure with several steps stands out (a release, adding a module), you may also write it as a skill: .sldev/skills/<name>/SKILL.md with name and description front matter.",
		`- Create or change files only in ${CONTEXT_DIR}/ and .sldev/skills/. Do not commit.`
	].join("\n")
].join("\n\n");
`${CONTEXT_DIR}${CONTEXT_DIR}${MAP_INSTRUCTIONS}`;
// src/shared/missionKinds.ts
var WORK_HERE = "Work only in your current working folder.";
var NO_EDITS = "Do not create, modify or delete any files, and do not commit.";
var BUILTIN_KINDS = [
	{
		id: "build",
		name: "Build",
		description: "Change code: a feature, a fix, a refactor. Ends with a diff to review.",
		worktree: true,
		readOnly: false,
		placeholder: "e.g. Add pagination to the /users endpoint and cover it with tests",
		scope: "builtin",
		template: [
			"Mission: {title}",
			"{brief}",
			"{criteria}",
			`${WORK_HERE}\nWhen finished, summarize what changed, the checks you ran, and the remaining risks, for human review. Do not commit, push or merge unless the task explicitly asks.`
		].join("\n\n")
	},
	{
		id: "research",
		name: "Research",
		description: "Answer a question about the code, a library or an approach. Nothing is changed.",
		worktree: false,
		readOnly: true,
		placeholder: "e.g. How does authentication flow from the login form to the API? Which parts would a switch to OAuth touch?",
		scope: "builtin",
		template: [
			"Research: {title}",
			"{brief}",
			"{criteria}",
			`This is a research task. Read code, docs and, if you can, the web. ${NO_EDITS}`,
			"Answer in your final reply: the answer first, then the evidence (files and lines, links), then open questions and what you would look at next."
		].join("\n\n")
	},
	{
		id: "investigate",
		name: "Investigate",
		description: "Find the root cause of a bug or odd behaviour, with evidence. Fixes only if asked.",
		worktree: false,
		readOnly: false,
		placeholder: "e.g. Saving a profile sometimes returns 500. Find out why.",
		scope: "builtin",
		template: [
			"Investigate: {title}",
			"{brief}",
			"{criteria}",
			`${WORK_HERE}\nFind the root cause before suggesting anything. Reproduce it if you can. Don't change project files unless the task asks for a fix; remove any temporary files or scripts you create.`,
			"End with: the cause, the evidence (commands you ran, files and lines), the fix you recommend, and how confident you are."
		].join("\n\n")
	},
	{
		id: "plan",
		name: "Plan",
		description: "Write an implementation plan, no code. Hand it to a Build mission or a factory run.",
		worktree: false,
		readOnly: true,
		placeholder: "e.g. Plan how to move settings from JSON files to SQLite",
		scope: "builtin",
		template: [
			"Plan: {title}",
			"{brief}",
			"{criteria}",
			`Write a plan, not code. Read whatever you need. ${NO_EDITS}`,
			"Your final reply is the plan: goal, scope and non-goals, the approach, the files likely to change, the steps in order, risks, how to verify it, and open questions. Someone else will build from it, so be specific."
		].join("\n\n")
	},
	{
		id: "review",
		name: "Review",
		description: "Review a branch, a diff or a part of the codebase. Read-only.",
		worktree: false,
		readOnly: true,
		placeholder: "e.g. Review the changes on this branch against main (git diff main)",
		scope: "builtin",
		template: [
			"Review: {title}",
			"{brief}",
			"{criteria}",
			`You review; ${NO_EDITS}`,
			"List findings, most important first: file and line, what goes wrong, and a concrete fix. Skip nits a formatter would catch. End with a one-line verdict."
		].join("\n\n")
	},
	{
		id: "map",
		name: "Map project",
		description: "Write the reference docs in .sldev/context that later missions are pointed at.",
		worktree: false,
		readOnly: false,
		placeholder: "Optional: what to focus on, e.g. the payment flow and how releases work",
		scope: "builtin",
		template: [
			"Mission: {title}",
			"{brief}",
			"{criteria}",
			MAP_INSTRUCTIONS,
			"End with: the files you wrote, and what you could not verify."
		].join("\n\n")
	},
	{
		id: "freeform",
		name: "Freeform",
		description: "Your prompt exactly as you wrote it, with nothing added.",
		worktree: false,
		readOnly: false,
		placeholder: "Anything: the agent gets exactly this text",
		scope: "builtin",
		template: "{brief}"
	}
];
var DEFAULT_KIND = "build";
/** The first message of a mission of this kind. Empty placeholders drop their line. */
function renderKind(kind, o) {
	const criteria = o.criteria?.trim() ? `Acceptance criteria:\n${o.criteria.trim()}` : "";
	const values = {
		title: o.title.trim(),
		brief: o.brief.trim(),
		criteria
	};
	let text = kind.template.includes("{brief}") ? kind.template : `${kind.template.trim()}\n\n{brief}`;
	text = text.replace(/^[ \t]*\{(title|brief|criteria)\}[ \t]*$/gm, (m, k) => values[k] ? m : "\0");
	text = text.replace(/\u0000\n?/g, "");
	text = text.replace(/\{(title|brief|criteria)\}/g, (_m, k) => values[k]);
	return text.replace(/\n{3,}/g, "\n\n").trim();
}
function findKind(kinds, id) {
	return kinds.find((k) => k.id === id) ?? kinds.find((k) => k.id === "build") ?? BUILTIN_KINDS[0];
}
var FRONT = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
function parseKindFile(text, path, scope) {
	const m = FRONT.exec(text);
	if (!m) return null;
	let meta;
	try {
		meta = parse(m[1]) ?? {};
	} catch {
		return null;
	}
	const str = (k) => typeof meta[k] === "string" && meta[k].trim() ? meta[k].trim() : void 0;
	const name = str("name");
	const template = m[2].replace(/<!--[\s\S]*?-->/g, "").trim();
	if (!name || !template) return null;
	return {
		id: `${scope}:${path}`,
		name,
		description: str("description") ?? "",
		template,
		worktree: meta.worktree === true,
		readOnly: meta.readOnly === true || meta.access === "read",
		placeholder: str("placeholder"),
		scope,
		path
	};
}
/** the report and check output each pass hands on: enough to act on, short enough for a command line */
var REPORT_MAX = 2500;
var CHECK_MAX = 2500;
var freshProgress = (now) => ({
	state: "waiting",
	passes: [],
	nextAt: now
});
var lastPass = (p) => p?.passes[p.passes.length - 1];
/** Pass numbers count from 1; the next is one more than the passes so far. */
var nextPassNumber = (p) => (p?.passes.length ?? 0) + 1;
function beginPass(p, pass, at) {
	return {
		...p,
		state: "running",
		nextAt: void 0,
		reason: void 0,
		cwd: p.cwd ?? at.cwd,
		worktree: p.worktree ?? at.worktree,
		passes: [...p.passes, {
			...pass,
			n: p.passes.length + 1
		}]
	};
}
/** Did the pass change anything? Committed (HEAD moved) or not (the working tree's diff is different). */
function passChanged(pass, headNow, statNow) {
	if (pass.base && headNow && headNow !== pass.base) return true;
	const a = pass.startStat ?? {
		files: 0,
		insertions: 0,
		deletions: 0
	};
	const b = statNow ?? {
		files: 0,
		insertions: 0,
		deletions: 0
	};
	return a.files !== b.files || a.insertions !== b.insertions || a.deletions !== b.deletions;
}
/** The pass is over: record how it went, then finish the loop or schedule the next pass. */
function endPass(plan, p, r, now) {
	const passes = p.passes.slice();
	const i = passes.length - 1;
	if (i < 0) return p;
	const prev = passes[i - 1];
	passes[i] = {
		...passes[i],
		endedAt: now,
		outcome: r.outcome,
		checkOutput: clip$1(r.checkOutput, CHECK_MAX, true),
		report: clip$1(r.report, REPORT_MAX)
	};
	const n = passes[i].n;
	const stop = (reason) => ({
		...p,
		passes,
		state: "finished",
		nextAt: void 0,
		reason
	});
	if (r.outcome === "failed") return stop(`Pass ${n} failed`);
	if (r.outcome === "limited") return stop(`Pass ${n} stopped at the agent's usage limit`);
	if (r.outcome === "stopped") return stop(`Stopped during pass ${n}`);
	if (r.outcome === "unchanged" && !plan.keepGoingUnchanged) return stop(`Pass ${n} changed nothing: nothing left to improve`);
	if (r.outcome === "check-failed" && prev?.outcome === "check-failed") return stop(`The check failed twice in a row (passes ${n - 1} and ${n})`);
	if (plan.times > 0 && n >= plan.times) return stop(r.outcome === "check-failed" ? `${plan.times === 1 ? "The pass ran" : `All ${plan.times} passes ran`}; the check failed after the last one` : plan.times === 1 ? "The pass is done" : `All ${plan.times} passes done`);
	return {
		...p,
		passes,
		state: "waiting",
		reason: void 0,
		nextAt: now + Math.max(0, plan.gapMinutes) * 6e4
	};
}
/** due: start the next pass now. missed: its time passed long ago (the computer slept); it moves on a gap, no catching up. */
function repeatDue(p, now) {
	if (!p || p.state !== "waiting" || p.nextAt === void 0 || p.nextAt > now) return "wait";
	return now - p.nextAt <= 9e5 ? "due" : "missed";
}
/** The brief a pass gets: the user's brief, where it stands in the loop, and what the last pass left. The kind adds its closing lines. */
function passBrief(brief, plan, n, prev) {
	const of = plan.times > 0 ? ` of ${plan.times}` : "";
	const lines = [brief.trim(), ""];
	if (n === 1 && plan.times === 1) lines.pop();
	else if (n === 1) lines.push(`This is pass 1${of} of a repeated mission: more passes follow, each building on what the one before left. Make one solid, complete round of improvements rather than trying to do everything at once.`);
	else {
		lines.push(`This is pass ${n}${of} of a repeated mission. Earlier passes already worked on this in this folder${prev?.base ? " and committed their changes (see `git log`)" : ""}. Build on them: improve what's there, don't start over or undo good work. If nothing is left that's worth changing, change nothing and say so.`);
		if (prev?.outcome === "check-failed" && plan.check) lines.push("", `After the last pass the check \`${plan.check}\` failed. Fix that first. Its output:`, "", "```", prev.checkOutput?.trim() || "(no output)", "```");
		if (prev?.report?.trim()) lines.push("", "The last pass reported:", "", prev.report.trim());
	}
	return lines.join("\n");
}
/** "5 passes, 30 min apart, checked with `npm test`", "Until nothing changes, back to back" */
function describeRepeat(plan) {
	return [
		plan.times > 0 ? `${plan.times} pass${plan.times === 1 ? "" : "es"}` : "Until nothing changes",
		plan.gapMinutes > 0 ? `${formatGap(plan.gapMinutes)} apart` : "back to back",
		plan.doneWhen === "accept" ? "you accept each" : "unattended",
		plan.check?.trim() ? `checked with \`${plan.check.trim()}\`` : ""
	].filter(Boolean).join(", ");
}
/** "Pass 2 of 5", "Checking pass 3", "Next pass at 14:30", or why it finished. */
function progressLabel(plan, p, now, time) {
	if (!p || !p.passes.length && p.state === "waiting") return "Not started";
	const n = lastPass(p)?.n ?? 0;
	const of = plan.times > 0 ? ` of ${plan.times}` : "";
	if (p.state === "running") return `Pass ${n}${of} running`;
	if (p.state === "checking") return `Checking pass ${n}${of}`;
	if (p.state === "waiting") return p.nextAt !== void 0 && p.nextAt > now ? `Pass ${n + 1}${of} at ${time(p.nextAt)}` : `Pass ${n + 1}${of} next`;
	return p.reason ?? (p.state === "paused" ? `Paused after pass ${n}` : `Finished after pass ${n}`);
}
function formatGap(minutes) {
	if (minutes < 1) return `${Math.round(minutes * 60)} s`;
	if (minutes < 60 || minutes % 60) return `${Math.round(minutes)} min`;
	return `${minutes / 60} h`;
}
/** "30m", "1h", "90s", "45" (minutes), "0" → minutes; undefined when it isn't a duration. */
function parseGap(text) {
	const m = /^\s*(\d+(?:\.\d+)?)\s*(s|sec|m|min|h|hr)?\s*$/i.exec(text);
	if (!m) return void 0;
	const n = Number(m[1]);
	const unit = (m[2] ?? "m").toLowerCase();
	return unit.startsWith("s") ? n / 60 : unit.startsWith("h") ? n * 60 : n;
}
function clip$1(text, max, tail = false) {
	const t = text?.trim();
	if (!t) return void 0;
	if (t.length <= max) return t;
	return tail ? `…${t.slice(-max)}` : `${t.slice(0, max)}…`;
}
// src/shared/status.ts
var sig = (tone, label, pulse = false) => ({
	tone,
	label,
	pulse
});
var MISSION = {
	starting: sig("working", "Starting", true),
	working: sig("working", "Working", true),
	"needs-input": sig("attention", "Needs you", true),
	waiting: sig("review", "Ready for you"),
	failed: sig("error", "Failed"),
	ended: sig("neutral", "Ended")
};
var missionSignal = (s) => MISSION[s];
var INTERRUPTED = /* @__PURE__ */ new Set([
	130,
	3221225786,
	-1073741510
]);
/** A GitHub Actions run, as `gh run list` reports it. */
function ghRunSignal(r) {
	if (r.status !== "completed") return r.status === "in_progress" ? sig("working", "Running", true) : sig("neutral", "Queued", true);
	if (r.conclusion === "success") return sig("done", "Passed");
	if (r.conclusion === "cancelled" || r.conclusion === "skipped" || r.conclusion === "neutral") return sig("neutral", r.conclusion === "skipped" ? "Skipped" : "Cancelled");
	return sig("error", "Failed");
}
/** Ctrl+C, not a crash: the user stopped it. */
var wasInterrupted = (code) => code !== void 0 && INTERRUPTED.has(code);
var PASS = {
	done: sig("done", "Done"),
	unchanged: sig("neutral", "Changed nothing"),
	"check-failed": sig("attention", "Check failed"),
	failed: sig("error", "Failed"),
	limited: sig("attention", "Usage limit"),
	stopped: sig("neutral", "Stopped")
};
/** One pass of a repeated mission (src/shared/repeat.ts); a pass without an outcome is still going. */
var passSignal = (o) => o ? PASS[o] : sig("working", "Running", true);
// src/main/launch.ts
var realFs = {
	isFile: (p) => {
		try {
			return statSync(p).isFile();
		} catch {
			return false;
		}
	},
	read: (p) => readFileSync(p, "utf8"),
	list: (dir) => {
		try {
			return readdirSync(dir);
		} catch {
			return [];
		}
	}
};
/** Find a program on PATH. On Windows a real .exe anywhere on PATH wins over an npm .cmd shim. */
function findOnPath(bin, env, platform = process.platform, fs = realFs) {
	const win = platform === "win32";
	const { join, extname, isAbsolute } = win ? path.win32 : path.posix;
	const pathVar = (win ? env.Path ?? env.PATH : env.PATH) ?? "";
	const dirs = isAbsolute(bin) || /[\\/]/.test(bin) ? [""] : pathVar.split(win ? ";" : ":").filter(Boolean);
	const exts = win && !extname(bin) ? [
		".exe",
		".com",
		".cmd",
		".bat"
	] : [""];
	for (const ext of exts) for (const dir of dirs) {
		const p = dir ? join(dir, bin + ext) : bin + ext;
		if (fs.isFile(p)) return p;
	}
	return null;
}
/**
* The program behind an npm .cmd shim, which ends in `"%_prog%" "%dp0%\node_modules\…\cli.js" %*`
* (or runs a target directly: `"%dp0%\…\tool.exe" %*`). Running that program ourselves keeps every
* argument exact, which cmd.exe can't (it ends a command at the first line break).
*/
function shimTarget(shim, env, fs = realFs) {
	let text;
	try {
		text = fs.read(shim);
	} catch {
		return null;
	}
	const m = /"%(?:~)?dp0%\\?([^"]+)"\s+%\*/i.exec(text);
	if (!m) return null;
	const dir = path.win32.dirname(shim);
	const target = path.win32.join(dir, m[1]);
	if (!fs.isFile(target)) return null;
	if (/\.(exe|com)$/i.test(target)) return [target];
	if (!/\.[cm]?js$/i.test(target)) return null;
	const node = fs.isFile(path.win32.join(dir, "node.exe")) ? path.win32.join(dir, "node.exe") : findOnPath("node", env, "win32", fs);
	return node ? [node, target] : null;
}
/** `2026.10.22-27dcf5f` or `2026.10.22-14-05-09-27dcf5f` as numbers to sort by; null for anything else */
function versionKey(name) {
	const m = /^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:-(\d{2})-(\d{2})-(\d{2}))?-[a-f0-9]+$/.exec(name);
	return m ? m.slice(1).map((n) => Number(n ?? 0)) : null;
}
/**
* Launchers that keep side-by-side versions next to them, like Cursor's agent.cmd: it runs agent.ps1,
* which starts `versions\<newest>\node.exe index.js`. Starting that node ourselves keeps every argument
* exact (cmd.exe cuts at a line break, Windows PowerShell drops embedded quotes).
*/
function versionedTarget(shim, fs = realFs) {
	const dir = path.win32.join(path.win32.dirname(shim), "versions");
	const newest = fs.list(dir).map((name) => ({
		name,
		key: versionKey(name)
	})).filter((v) => !!v.key).sort((a, b) => b.key.reduce((d, n, i) => d || n - a.key[i], 0)).map((v) => path.win32.join(dir, v.name)).find((v) => fs.isFile(path.win32.join(v, "node.exe")) && fs.isFile(path.win32.join(v, "index.js")));
	return newest ? [path.win32.join(newest, "node.exe"), path.win32.join(newest, "index.js")] : null;
}
/** Windows PowerShell, which every Windows has (pwsh only when the user installed it). */
function windowsPowerShell(env, fs = realFs) {
	const root = env.SystemRoot ?? env.SYSTEMROOT ?? "C:\\Windows";
	const builtin = path.win32.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
	return fs.isFile(builtin) ? builtin : "powershell.exe";
}
var psFileArgs = (script) => [
	"-NoProfile",
	"-ExecutionPolicy",
	"Bypass",
	"-File",
	script
];
/**
* How to spawn an argv without a shell. Throws a readable error when the program isn't installed,
* or when a multi-line prompt would have to go through cmd.exe (it would be cut at the first line).
*/
function resolveLaunch(argv, env, platform = process.platform, fs = realFs) {
	const [first, ...args] = argv;
	if (!first) throw new Error("Nothing to run");
	const found = findOnPath(/^~[\\/]/.test(first) ? path.join(homedir(), first.slice(2)) : first, env, platform, fs);
	if (!found) throw new Error(`${first} was not found on PATH. Install it, or check the agent's command in Settings → Agents.`);
	if (platform !== "win32") return {
		file: found,
		args
	};
	if (!/\.(cmd|bat)$/i.test(found)) return {
		file: found,
		args: windowsCommandLine(args)
	};
	const target = shimTarget(found, env, fs) ?? versionedTarget(found, fs);
	if (target) return {
		file: target[0],
		args: windowsCommandLine([...target.slice(1), ...args])
	};
	try {
		return {
			file: env.ComSpec ?? env.COMSPEC ?? "cmd.exe",
			args: `/d /s /c "${cmdShimCommandLine(found, args)}"`
		};
	} catch {
		const ps1 = found.replace(/\.(cmd|bat)$/i, ".ps1");
		if (fs.isFile(ps1)) return {
			file: windowsPowerShell(env, fs),
			args: windowsCommandLine([...psFileArgs(ps1), ...args])
		};
		throw new Error(`${first} is a .cmd script, and cmd.exe can't pass it a prompt with line breaks. Install ${first} as an .exe or through npm, or use a one-line prompt.`);
	}
}
/**
* How a typed command line (runtime, shell task) runs on Windows: through cmd.exe, except a command
* that starts with a .ps1 script, which cmd.exe would hand to its file association (Notepad).
*/
function windowsShellLaunch(command, env, powershell, fs = realFs) {
	const m = /^\s*(?:&\s*)?(?:"([^"]+\.ps1)"|'([^']+\.ps1)'|([^\s"'&|<>]+\.ps1))(?=\s|$)(.*)$/is.exec(command);
	if (m) {
		const script = m[1] ?? m[2] ?? m[3];
		return {
			file: powershell ?? windowsPowerShell(env, fs),
			args: `${windowsCommandLine(psFileArgs(script))}${m[4]}`
		};
	}
	return {
		file: env.ComSpec ?? env.COMSPEC ?? "cmd.exe",
		args: `/d /s /c "${command}"`
	};
}
// src/main/missionKinds.ts
/** Custom mission kinds: `.sldev/missions/*.md` in the project, or `<dataDir>/missions/*.md` (userData) for every project. */
var kindsDir = (scope, root, dataDir) => scope === "project" && root ? join(root, ".sldev", "missions") : join(dataDir, "missions");
async function kindsIn(dir, scope) {
	const files = (await promises.readdir(dir).catch(() => [])).filter((f) => f.endsWith(".md")).sort();
	return (await Promise.all(files.map(async (f) => parseKindFile(await promises.readFile(join(dir, f), "utf8"), join(dir, f), scope)))).filter((k) => !!k);
}
async function listKinds(root, dataDir) {
	const [project, user] = await Promise.all([root ? kindsIn(kindsDir("project", root, dataDir), "project") : [], kindsIn(kindsDir("user", null, dataDir), "user")]);
	return [...project, ...user];
}
// src/main/git.ts
function run(cmd, args, cwd, timeout = 3e4) {
	return new Promise((resolve) => {
		execFile(cmd, args, {
			cwd,
			timeout,
			maxBuffer: 67108864,
			windowsHide: true,
			env: {
				...process.env,
				GIT_TERMINAL_PROMPT: "0",
				GH_PROMPT_DISABLED: "1"
			}
		}, (err, stdout, stderr) => resolve({
			code: err ? typeof err.code === "number" ? err.code : 1 : 0,
			stdout,
			stderr: stderr || (err && !stderr ? String(err.message) : "")
		}));
	});
}
var git = (args, cwd) => run("git", args, cwd);
async function ok(args, cwd) {
	const r = await git(args, cwd);
	if (r.code !== 0) throw new Error(r.stderr.trim() || `git ${args[0]} failed`);
	return r.stdout;
}
async function gitBranch(cwd) {
	const r = await git([
		"rev-parse",
		"--abbrev-ref",
		"HEAD"
	], cwd);
	return r.code === 0 ? r.stdout.trim() || null : null;
}
async function head(cwd) {
	const r = await git(["rev-parse", "HEAD"], cwd);
	return r.code === 0 ? r.stdout.trim() : null;
}
async function isRepo(cwd) {
	return (await git(["rev-parse", "--is-inside-work-tree"], cwd)).stdout.trim() === "true";
}
/** Create an isolated worktree for a mission next to the repo: ../.sldev-worktrees/<repo>/<slug> */
/**
* `name` is the branch: "feature/dark-mode" as it is, or a bare slug, which goes under sldev/ as before.
* The folder is the name with its slashes turned into dashes; both get -2, -3… when taken.
*/
async function addWorktree(root, name, base) {
	const top = (await ok(["rev-parse", "--show-toplevel"], root)).trim();
	const dir = join(dirname(top), ".sldev-worktrees", basename(top));
	mkdirSync(dir, { recursive: true });
	const wanted = name.includes("/") ? name : `sldev/${name}`;
	const folder = name.replace(/\//g, "-");
	let path = join(dir, folder);
	let branch = wanted;
	for (let i = 2; existsSync(path) || (await git([
		"rev-parse",
		"--verify",
		"--quiet",
		`refs/heads/${branch}`
	], top)).code === 0; i++) {
		path = join(dir, `${folder}-${i}`);
		branch = `${wanted}-${i}`;
	}
	await ok([
		"worktree",
		"add",
		"-b",
		branch,
		path,
		base
	], top);
	return {
		path,
		branch,
		base,
		repo: top
	};
}
/** What removing a worktree would lose: uncommitted files, and commits only its branch has. */
async function worktreeStatus(wt) {
	if (!existsSync(wt.path)) return {
		exists: false,
		modified: 0,
		untracked: 0,
		unmerged: 0
	};
	const lines = (await git([
		"status",
		"--porcelain",
		"--untracked-files=all"
	], wt.path)).stdout.split("\n").filter(Boolean);
	const untracked = lines.filter((l) => l.startsWith("??")).length;
	const ahead = await git([
		"rev-list",
		"--count",
		`${wt.base}..${wt.branch}`
	], wt.repo);
	return {
		exists: true,
		modified: lines.length - untracked,
		untracked,
		unmerged: ahead.code === 0 ? Number(ahead.stdout.trim()) || 0 : 0
	};
}
/**
* Remove a mission's worktree. Without `discard`, git refuses when the folder has uncommitted or
* untracked files, so work is never thrown away unless the user acknowledged exactly that.
*/
async function removeWorktree(wt, opts) {
	if (existsSync(wt.path)) await ok([
		"worktree",
		"remove",
		...opts.discard ? ["--force"] : [],
		wt.path
	], wt.repo);
	else await git(["worktree", "prune"], wt.repo);
	if (opts.deleteBranch) await ok([
		"branch",
		"-D",
		wt.branch
	], wt.repo);
}
/** Unified diff of everything that changed since `base` (committed, staged, unstaged and untracked). */
async function diff(cwd, base) {
	const tracked = await ok([
		"diff",
		"--no-color",
		"--no-ext-diff",
		(await git([
			"merge-base",
			base,
			"HEAD"
		], cwd)).stdout.trim() || base
	], cwd);
	const untracked = (await git([
		"ls-files",
		"--others",
		"--exclude-standard"
	], cwd)).stdout.split("\n").filter(Boolean).slice(0, 100);
	const nul = process.platform === "win32" ? "NUL" : "/dev/null";
	return tracked + (await Promise.all(untracked.map((f) => git([
		"diff",
		"--no-color",
		"--no-index",
		"--",
		nul,
		f
	], cwd).then((r) => r.stdout)))).join("");
}
/** A file as it was at the mission's base (the merge base, like diff), or '' if it didn't exist there. */
async function baseVersion(cwd, base, path) {
	const r = await git(["show", `${(await git([
		"merge-base",
		base,
		"HEAD"
	], cwd)).stdout.trim() || base}:${path}`], cwd);
	return r.code === 0 ? r.stdout : "";
}
async function diffStat(cwd, base) {
	const r = await git([
		"diff",
		"--shortstat",
		(await git([
			"merge-base",
			base,
			"HEAD"
		], cwd)).stdout.trim() || base
	], cwd);
	const untracked = (await git([
		"ls-files",
		"--others",
		"--exclude-standard"
	], cwd)).stdout.split("\n").filter(Boolean);
	const nul = process.platform === "win32" ? "NUL" : "/dev/null";
	const added = await Promise.all(untracked.slice(0, 100).map((f) => git([
		"diff",
		"--numstat",
		"--no-index",
		"--",
		nul,
		f
	], cwd).then((x) => Number(x.stdout.split("	")[0]) || 0)));
	const n = (re) => Number(re.exec(r.stdout)?.[1] ?? 0);
	return {
		files: n(/(\d+) files? changed/) + untracked.length,
		insertions: n(/(\d+) insertions?/) + added.reduce((a, b) => a + b, 0),
		deletions: n(/(\d+) deletions?/)
	};
}
async function commitAll(cwd, message) {
	if (!(await ok(["status", "--porcelain"], cwd)).trim()) return "";
	await ok(["add", "-A"], cwd);
	return ok([
		"commit",
		"-m",
		message
	], cwd);
}
// cli/src/clean.ts
var LIVE = /* @__PURE__ */ new Set([
	"starting",
	"working",
	"waiting",
	"needs-input"
]);
var norm = (p) => process.platform === "win32" ? resolve(p).toLowerCase() : resolve(p);
/** The app's own records, as text: a worktree whose path appears in them belongs to the app. */
function appMentions(dataDir) {
	return [
		"missions.json",
		"factory-runs.json",
		"automations.json"
	].map((f) => {
		try {
			return readFileSync(join(dataDir, f), "utf8");
		} catch {
			return "";
		}
	}).join("\n");
}
var mentioned = (text, path) => {
	const escaped = JSON.stringify(path).slice(1, -1);
	return text.includes(escaped) || process.platform === "win32" && text.toLowerCase().includes(escaped.toLowerCase());
};
/** sldev worktrees of `repo` (git worktree list), the ones in its .sldev-worktrees folder. */
async function sldevWorktrees(repo) {
	const top = (await run("git", ["rev-parse", "--show-toplevel"], repo)).stdout.trim();
	if (!top) return [];
	const root = resolve(top);
	const dir = norm(join(dirname(root), ".sldev-worktrees", basename(root)));
	const base = await gitBranch(root) || "HEAD";
	const out = (await run("git", [
		"worktree",
		"list",
		"--porcelain"
	], root)).stdout;
	const list = [];
	for (const block of out.split(/\n\n+/)) {
		const path = /^worktree (.+)$/m.exec(block)?.[1];
		const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1];
		if (path && branch && norm(path).startsWith(dir)) list.push({
			path: resolve(path),
			branch,
			base,
			repo: root
		});
	}
	return list;
}
async function planClean(panes, loops, o) {
	const busy = /* @__PURE__ */ new Map();
	for (const p of panes) if (LIVE.has(p.status)) busy.set(norm(p.cwd), `pane ${p.id} still works there`);
	const running = new Set(loops.filter((l) => l.progress.state !== "finished").map((l) => l.id));
	for (const p of panes) if (p.repeat && running.has(p.repeat.loop)) busy.set(norm(p.cwd), `its repeat loop ${p.repeat.loop} isn't over`);
	const items = [];
	const seen = /* @__PURE__ */ new Set();
	const add = async (pane, title, wt) => {
		if (!wt) return void items.push({
			pane,
			title,
			deleteBranch: false
		});
		const key = norm(wt.path);
		if (seen.has(key)) return void items.push({
			pane,
			title,
			deleteBranch: false
		});
		seen.add(key);
		const status = await worktreeStatus(wt);
		const dirty = status.modified + status.untracked;
		const keep = busy.get(key) ?? (dirty && !o.discard ? `${dirty} uncommitted file${dirty === 1 ? "" : "s"} (--discard throws them away)` : void 0);
		items.push({
			pane,
			title,
			worktree: wt,
			status,
			keep,
			deleteBranch: !!o.branches && !keep && status.unmerged === 0
		});
	};
	for (const p of panes) {
		if (LIVE.has(p.status)) continue;
		if (p.repeat && running.has(p.repeat.loop)) continue;
		await add(p.id, p.title, p.worktree);
	}
	if (o.orphans && o.repo) {
		const app = appMentions(o.dataDir);
		const known = new Set(panes.flatMap((p) => p.worktree ? [norm(p.worktree.path)] : []));
		for (const wt of await sldevWorktrees(o.repo)) {
			if (known.has(norm(wt.path)) || mentioned(app, wt.path)) continue;
			await add(void 0, `worktree ${wt.branch}`, wt);
		}
	}
	return items;
}
/** The plan in lines: what goes, what stays and why. */
function describeClean(items) {
	return items.map((i) => {
		const who = i.pane ? `pane ${i.pane} ${i.title}` : i.title;
		if (!i.worktree) return `  remove ${who} from the list`;
		const commits = i.status?.unmerged ? `; ${i.status.unmerged} commit${i.status.unmerged === 1 ? "" : "s"} only on ${i.worktree.branch}` : "";
		if (i.keep) return `  keep   ${who}: ${i.worktree.path} (${i.keep})`;
		const branch = i.deleteBranch ? `, and its branch ${i.worktree.branch}` : `; branch ${i.worktree.branch} stays${commits}`;
		return `  remove ${who}: ${i.worktree.path}${branch}`;
	});
}
/** Does the plan; returns a line per thing that went wrong (git refusing, say). */
async function runClean(items, o, removePane) {
	const problems = [];
	for (const i of items) {
		if (i.worktree && !i.keep) try {
			if (existsSync(i.worktree.path) || i.deleteBranch) await removeWorktree(i.worktree, {
				deleteBranch: i.deleteBranch,
				discard: !!o.discard
			});
		} catch (e) {
			problems.push(`${i.worktree.path}: ${e.message.split("\n")[0]}`);
			continue;
		}
		if (i.pane && !i.keep) await removePane(i.pane).catch((e) => problems.push(`pane ${i.pane}: ${e.message}`));
	}
	return problems;
}
// cli/src/protocol.ts
var WAIT_STATES = {
	ready: ["waiting"],
	"needs-you": ["needs-input"],
	done: ["ended", "failed"],
	idle: [
		"waiting",
		"needs-input",
		"ended",
		"failed"
	]
};
/** Splits a byte stream into JSON lines; malformed lines are dropped. */
function lineReader(onMessage) {
	let buf = "";
	return (chunk) => {
		buf += chunk.toString();
		let at;
		while ((at = buf.indexOf("\n")) >= 0) {
			const line = buf.slice(0, at);
			buf = buf.slice(at + 1);
			if (!line.trim()) continue;
			try {
				onMessage(JSON.parse(line));
			} catch {}
		}
	};
}
// cli/src/paths.ts
/**
* The CLI shares the app's data folder (Electron's userData for "sldev-io"), so custom mission kinds and
* the project context index are the same in both. Its own runtime files (socket, hook relay, MCP script
* and endpoint) go in a `cli` folder inside it, so the app and the daemon never answer each other's agents.
*/
function dataDir(env = process.env, platform = process.platform) {
	const { join } = platform === "win32" ? win32 : posix;
	if (env.SLDEV_DATA_DIR) return env.SLDEV_DATA_DIR;
	if (platform === "darwin") return join(homedir(), "Library", "Application Support", "sldev-io");
	if (platform === "win32") return join(env.APPDATA || join(homedir(), "AppData", "Roaming"), "sldev-io");
	return join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "sldev-io");
}
var cliDir = (data = dataDir()) => (process.platform === "win32" ? win32 : posix).join(data, "cli");
/** Unix sockets have a short path limit (104 bytes on macOS); a long data folder gets a socket in the temp folder. */
function socketPath(dir = cliDir(), platform = process.platform) {
	if (platform === "win32") return `\\\\.\\pipe\\sldev-${createHash("sha256").update(dir).digest("hex").slice(0, 16)}`;
	const p = posix.join(dir, "daemon.sock");
	return p.length < 100 ? p : posix.join(tmpdir(), `sldev-${createHash("sha256").update(dir).digest("hex").slice(0, 16)}.sock`);
}
// cli/src/client.ts
/** A connection to the daemon: requests get their reply by id; events (attach) go to onEvent. */
var Client = class {
	sock;
	seq = 0;
	pending = /* @__PURE__ */ new Map();
	listeners = [];
	constructor(sock) {
		this.sock = sock;
		sock.on("data", lineReader((m) => {
			if (m && typeof m === "object" && "event" in m) return this.listeners.forEach((l) => l(m));
			const msg = m;
			const p = this.pending.get(msg.id);
			if (!p) return;
			this.pending.delete(msg.id);
			if (msg.ok) p.resolve(msg.result);
			else p.reject(new Error(msg.error));
		}));
		const fail = () => {
			for (const p of this.pending.values()) p.reject(/* @__PURE__ */ new Error("The sldev daemon closed the connection"));
			this.pending.clear();
		};
		sock.on("close", fail);
		sock.on("error", fail);
	}
	request(cmd, args) {
		const id = ++this.seq;
		return new Promise((resolve, reject) => {
			this.pending.set(id, {
				resolve,
				reject
			});
			this.sock.write(JSON.stringify({
				id,
				cmd,
				args
			}) + "\n");
		});
	}
	onEvent(fn) {
		this.listeners.push(fn);
	}
	onClose(fn) {
		this.sock.on("close", fn);
	}
	close() {
		this.sock.end();
	}
};
function tryConnect(socket) {
	return new Promise((resolve) => {
		const s = createConnection(socket);
		s.once("connect", () => resolve(new Client(s)));
		s.once("error", () => resolve(null));
	});
}
/**
* Connects to the daemon, starting it in the background first when it isn't running (`sldev serve`,
* detached, logging to <data>/cli/daemon.log). `script` is this CLI's entry file.
*/
async function connect(o) {
	const dir = cliDir(o.dataDir);
	const socket = socketPath(dir);
	const c = await tryConnect(socket);
	if (c || o.start === false) {
		if (c) return c;
		throw new Error("sldev is not running");
	}
	mkdirSync(dir, {
		recursive: true,
		mode: 448
	});
	const log = openSync(join(dir, "daemon.log"), "a");
	spawn(process.execPath, [o.script, "serve"], {
		detached: true,
		windowsHide: true,
		stdio: [
			"ignore",
			log,
			log
		],
		env: {
			...process.env,
			SLDEV_DATA_DIR: o.dataDir
		}
	}).unref();
	for (let i = 0; i < 50; i++) {
		await new Promise((r) => setTimeout(r, 100));
		const c2 = await tryConnect(socket);
		if (c2) return c2;
	}
	throw new Error(`The sldev daemon didn't start; see ${join(dir, "daemon.log")}`);
}
// src/main/editors.ts
var EDITORS = [
	{
		id: "cursor",
		name: "Cursor",
		kind: "gui",
		bins: ["cursor"],
		macApp: "Cursor"
	},
	{
		id: "vscode",
		name: "VS Code",
		kind: "gui",
		bins: ["code"],
		macApp: "Visual Studio Code"
	},
	{
		id: "vscode-insiders",
		name: "VS Code Insiders",
		kind: "gui",
		bins: ["code-insiders"],
		macApp: "Visual Studio Code - Insiders"
	},
	{
		id: "windsurf",
		name: "Windsurf",
		kind: "gui",
		bins: ["windsurf"],
		macApp: "Windsurf"
	},
	{
		id: "zed",
		name: "Zed",
		kind: "gui",
		bins: ["zed", "zeditor"],
		macApp: "Zed"
	},
	{
		id: "sublime",
		name: "Sublime Text",
		kind: "gui",
		bins: ["subl"],
		macApp: "Sublime Text"
	},
	{
		id: "idea",
		name: "IntelliJ IDEA",
		kind: "gui",
		bins: ["idea", "idea.sh"],
		macApp: "IntelliJ IDEA"
	},
	{
		id: "webstorm",
		name: "WebStorm",
		kind: "gui",
		bins: ["webstorm", "webstorm.sh"],
		macApp: "WebStorm"
	},
	{
		id: "pycharm",
		name: "PyCharm",
		kind: "gui",
		bins: ["pycharm", "pycharm.sh"],
		macApp: "PyCharm"
	},
	{
		id: "goland",
		name: "GoLand",
		kind: "gui",
		bins: ["goland", "goland.sh"],
		macApp: "GoLand"
	},
	{
		id: "rustrover",
		name: "RustRover",
		kind: "gui",
		bins: ["rustrover", "rustrover.sh"],
		macApp: "RustRover"
	},
	{
		id: "nvim",
		name: "Neovim",
		kind: "terminal",
		bins: ["nvim"]
	},
	{
		id: "helix",
		name: "Helix",
		kind: "terminal",
		bins: ["hx", "helix"]
	},
	{
		id: "vim",
		name: "Vim",
		kind: "terminal",
		bins: ["vim"]
	}
];
var lookups = /* @__PURE__ */ new Map();
/**
* findOnPath without blocking the main process. On Windows a lookup is PATH folders × PATHEXT checks,
* and a folder on a network or WSL drive can stall each one for seconds; done synchronously, that froze
* the whole app. Results are kept for 30 s (polled views ask often), and per PATH, so a reload sees new tools.
*/
function whichAsync(bin) {
	const key = `${process.env.PATH ?? ""}\0${bin}`;
	const hit = lookups.get(key);
	if (hit && Date.now() - hit.at < 3e4) return hit.found;
	const found = lookup(bin);
	lookups.set(key, {
		at: Date.now(),
		found
	});
	return found;
}
async function lookup(bin) {
	const exts = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
	const candidates = (process.env.PATH ?? "").split(delimiter).filter(Boolean).flatMap((dir) => exts.map((ext) => join(dir, bin + ext)));
	return candidates[(await Promise.all(candidates.map((p) => promises.access(p, constants.X_OK).then(() => true, () => false)))).indexOf(true)] ?? null;
}
function macAppPath(app) {
	if (process.platform !== "darwin" || !app) return null;
	for (const base of ["/Applications", join(process.env.HOME ?? "", "Applications")]) {
		const p = join(base, `${app}.app`);
		if (existsSync(p)) return p;
	}
	return null;
}
var detected = null;
async function detectEditors() {
	detected = (await Promise.all(EDITORS.map(async (e) => ({
		...e,
		bin: (await Promise.all(e.bins.map(whichAsync))).find(Boolean) ?? null,
		app: macAppPath(e.macApp)
	})))).filter((e) => e.bin || e.app);
	return detected.map(({ id, name, kind }) => ({
		id,
		name,
		kind,
		canDiff: !!diffArgs(id, "a", "b")
	}));
}
var VSCODE_FAMILY = [
	"cursor",
	"vscode",
	"vscode-insiders",
	"windsurf"
];
var JETBRAINS = [
	"idea",
	"webstorm",
	"pycharm",
	"goland",
	"rustrover"
];
function diffArgs(id, left, right) {
	if (VSCODE_FAMILY.includes(id)) return [
		"--diff",
		left,
		right
	];
	if (JETBRAINS.includes(id)) return [
		"diff",
		left,
		right
	];
	return null;
}
/**
* Opens the editor's own side-by-side diff: the file as it was at `base` (written to a temp file,
* named after the base so the editor's tab says which side is which) against the working copy.
*/
async function openDiffInEditor(id, cwd, base, path, oldPath) {
	if (!detected) await detectEditors();
	const e = detected.find((d) => d.id === id);
	if (!e?.bin || !diffArgs(id, "", "")) return false;
	const dir = join(tmpdir(), "sldev-review", `${Date.now().toString(36)}-${base.replace(/[^\w.-]+/g, "_").slice(0, 40)}`);
	await promises.mkdir(dir, { recursive: true });
	const left = join(dir, basename(oldPath ?? path));
	await promises.writeFile(left, await baseVersion(cwd, base, oldPath ?? path));
	const viaShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(e.bin);
	const child = spawn(e.bin, diffArgs(id, left, join(cwd, path)), {
		detached: true,
		stdio: "ignore",
		shell: viaShell,
		windowsHide: viaShell
	});
	child.on("error", () => {});
	child.unref();
	return true;
}
/** Arguments that open `file` at `line:col` for each editor family. */
function gotoArgs(id, file, line, col) {
	if (VSCODE_FAMILY.includes(id)) return ["-g", `${file}:${line}:${col}`];
	if (["zed", "sublime"].includes(id)) return [`${file}:${line}:${col}`];
	if (JETBRAINS.includes(id)) return [
		"--line",
		String(line),
		"--column",
		String(col),
		file
	];
	return [file];
}
/** Command line for terminal editors, which the renderer runs inside a terminal panel. */
function terminalEditorCommand(id) {
	const e = (detected ?? []).find((d) => d.id === id);
	return e && e.kind === "terminal" ? e.bins[0] : null;
}
function openInEditor(id, target, line, col = 1) {
	if (!detected) detectEditors();
	const e = detected.find((d) => d.id === id);
	if (!e || e.kind === "terminal") return false;
	const fileArgs = line ? gotoArgs(id, target, line, col) : [target];
	const [cmd, args] = e.bin ? [e.bin, fileArgs] : ["open", [
		"-a",
		e.app,
		target
	]];
	const viaShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(cmd);
	const child = spawn(cmd, args, {
		detached: true,
		stdio: "ignore",
		shell: viaShell,
		windowsHide: viaShell
	});
	child.on("error", () => {});
	child.unref();
	return true;
}
// cli/src/editor.ts
/**
* `sldev open` and the TUI's Ctrl-b e / v: a pane's folder, or its changed files side by side, in the
* user's editor. Which one: --editor, then the app's preferred editor (Settings), then the first found
* (Cursor, VS Code, Windsurf, Zed, …; src/main/editors.ts).
*/
/** The editor to use: one asked for, else the preferred one if it's installed, else the first GUI editor, else a terminal one. */
function pickEditor(found, wanted, preferred) {
	if (wanted) return found.find((e) => e.id === wanted || e.name.toLowerCase() === wanted.toLowerCase());
	return found.find((e) => e.id === preferred) ?? found.find((e) => e.kind === "gui") ?? found[0];
}
/** The files a pane changed since its base: committed, staged, unstaged and new ones, without deletions. */
async function changedFiles(cwd, base) {
	const tracked = (await run("git", [
		"diff",
		"--name-only",
		"--diff-filter=d",
		(await run("git", [
			"merge-base",
			base,
			"HEAD"
		], cwd)).stdout.trim() || base
	], cwd)).stdout.split("\n");
	const untracked = (await run("git", [
		"ls-files",
		"--others",
		"--exclude-standard"
	], cwd)).stdout.split("\n");
	return [...new Set([...tracked, ...untracked].map((f) => f.trim()).filter(Boolean))];
}
async function openPane(p, o) {
	const found = await detectEditors();
	const e = pickEditor(found, o.editor, o.preferred);
	if (!e) {
		if (o.editor) throw new Error(`No editor "${o.editor}" found. Found: ${found.map((x) => x.id).join(", ") || "none"}`);
		throw new Error("No editor found on PATH (Cursor, VS Code, Windsurf, Zed, Sublime, JetBrains, Neovim, Helix, Vim)");
	}
	if (e.kind === "terminal") {
		const bin = terminalEditorCommand(e.id);
		return {
			note: `Opening ${p.cwd} in ${e.name}`,
			terminal: bin ? [bin, p.cwd] : void 0
		};
	}
	const base = p.worktree?.base ?? p.baseCommit;
	if (o.diff && base && e.canDiff) {
		const files = await changedFiles(p.cwd, base);
		if (!files.length) {
			openInEditor(e.id, p.cwd);
			return { note: `No changes yet; opened the folder in ${e.name}` };
		}
		openInEditor(e.id, p.cwd);
		for (const f of files.slice(0, 12)) await openDiffInEditor(e.id, p.cwd, base, f);
		const more = files.length > 12 ? ` (the first 12 of ${files.length}; the rest are in its source control view)` : "";
		return { note: `Opened ${Math.min(files.length, 12)} changed file${files.length === 1 ? "" : "s"} side by side in ${e.name}${more}` };
	}
	openInEditor(e.id, p.cwd);
	const why = o.diff && !e.canDiff ? ` (${e.name} can't open a diff from the command line, so the folder)` : "";
	return { note: `Opened ${p.cwd} in ${e.name}${why}` };
}
/** Runs a terminal editor in this terminal until it exits. */
function runTerminalEditor(argv, cwd) {
	spawnSync(argv[0], argv.slice(1), {
		cwd,
		stdio: "inherit"
	});
}
/** The editor picked in the app (Settings → Editor), shared through its data folder; null when none is set. */
function preferredEditor(dataDir) {
	try {
		return JSON.parse(readFileSync(join(dataDir, "settings.json"), "utf8")).preferredEditor ?? null;
	} catch {
		return null;
	}
}
// src/main/github.ts
var gh = (args, cwd, timeout = 3e4) => run("gh", args, cwd, timeout);
/** `empty` is what an empty answer means: gh prints nothing (not `[]`) for a repo without workflows. */
async function ghJson(args, cwd, empty) {
	const r = await gh(args, cwd);
	if (r.code !== 0) throw new Error(r.stderr.trim() || `gh ${args.join(" ")} failed`);
	if (!r.stdout.trim() && empty !== void 0) return empty;
	try {
		return JSON.parse(r.stdout);
	} catch {
		throw new Error(`Unexpected output from gh ${args.slice(0, 2).join(" ")}. Check that gh is up to date (gh --version).`);
	}
}
var listRuns = (cwd, workflow) => ghJson([
	"run",
	"list",
	"--limit",
	"30",
	...workflow ? ["--workflow", workflow] : [],
	"--json",
	"databaseId,displayTitle,workflowName,status,conclusion,headBranch,event,createdAt,url,number"
], cwd, []);
async function rerun(cwd, runId, failedOnly) {
	const r = await gh([
		"run",
		"rerun",
		String(runId),
		...failedOnly ? ["--failed"] : []
	], cwd);
	if (r.code !== 0) throw new Error(r.stderr.trim() || "gh run rerun failed");
}
// cli/src/workflows.ts
/**
* GitHub Actions runs for `sldev workflows` and the TUI's Ctrl-b w, through the user's own GitHub CLI
* (signed in as them; nothing goes anywhere else). Only asked when the user opens the view.
*/
/** What went wrong, in words the user can act on: gh missing, not signed in, not a GitHub repository. */
function ghProblem(stderr) {
	const t = stderr.trim();
	if (/ENOENT|not recognized as an internal|command not found|spawn gh/i.test(t)) return "The GitHub CLI (gh) isn't installed: https://cli.github.com";
	if (/gh auth login|not logged in|authentication|HTTP 401/i.test(t)) return "Not signed in to GitHub: run gh auth login";
	if (/no git remotes|not a git repository|could not determine|none of the git remotes|no default repository/i.test(t)) return "This folder isn't a GitHub repository (no GitHub remote)";
	return t.split("\n")[0] || "gh failed";
}
async function loadRuns(cwd) {
	if (!findOnPath("gh", process.env)) throw new Error(ghProblem("ENOENT"));
	try {
		return await listRuns(cwd);
	} catch (e) {
		throw new Error(ghProblem(e.message));
	}
}
async function rerunFailed(cwd, id) {
	try {
		await rerun(cwd, id, true);
	} catch (e) {
		throw new Error(ghProblem(e.message));
	}
}
/** Opens the run on github.com in the browser (gh does that, so it works with GitHub Enterprise too). */
async function openRun(cwd, id) {
	const r = await run("gh", [
		"run",
		"view",
		String(id),
		"--web"
	], cwd, 15e3);
	if (r.code !== 0) throw new Error(ghProblem(r.stderr));
}
function ago(iso, now = Date.now()) {
	const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1e3));
	if (s < 60) return `${s}s`;
	if (s < 3600) return `${Math.floor(s / 60)}m`;
	if (s < 86400) return `${Math.floor(s / 3600)}h`;
	return `${Math.floor(s / 86400)}d`;
}
/** One run as columns: status, workflow, branch, title, age. */
function runColumns(r, now = Date.now()) {
	const sig = ghRunSignal(r);
	return {
		label: sig.label,
		tone: sig.tone,
		text: `${r.workflowName} · ${r.headBranch} · ${r.displayTitle} · ${ago(r.createdAt, now)} ago`
	};
}
// src/shared/branch.ts
var TYPE_WORDS = [
	["fix", /^(fix|fixes|fixed|bug|bugs|bugfix|broken|crash|crashes|error|errors|repair|regression|hotfix|wrong)$/],
	["docs", /^(docs?|documentation|readme|changelog|guide)$/],
	["test", /^(tests?|testing|e2e|coverage|spec|specs)$/],
	["refactor", /^(refactor|refactoring|restructure|rename|cleanup|clean|simplify|extract|reorganize)$/],
	["perf", /^(perf|performance|faster|speed|slow|optimi[sz]e)$/],
	["chore", /^(chore|bump|upgrade|deps|dependencies|ci|lint|config|release)$/]
];
/** words that say nothing about the change */
var FILLER = new Set(`a an the to of in on for and or with without from into by at as is are be it its this that these those our my your we i you
  please can could should would will need needs make makes add adds added implement implements create creates build builds
  support supports allow allows let lets new use using so when then also just some all any page pages
  fix fixes fixed bug bugs refactor docs doc test tests chore update updates`.split(/\s+/));
var words = (text) => text.toLowerCase().replace(/[`'’]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
/** The conventional type a brief reads as; "feature" unless its first words say otherwise. */
function branchType(text) {
	const first = words(text.split("\n")[0]).slice(0, 6);
	for (const w of first) for (const [type, re] of TYPE_WORDS) if (re.test(w)) return type;
	return "feature";
}
/** "feature/dark-mode-toggle-settings": at most `max` words, at most 40 characters after the slash. */
function branchName(text, opts = {}) {
	const all = words(text.trim().split("\n").find((l) => l.trim()) ?? "");
	const kept = all.filter((w) => !FILLER.has(w) && w.length > 1);
	const pick = (kept.length ? kept : all).slice(0, opts.max ?? 4);
	let slug = "";
	for (const w of pick) {
		const next = slug ? `${slug}-${w}` : w;
		if (next.length > 40) break;
		slug = next;
	}
	return `${opts.type ?? branchType(text)}/${slug || "work"}`;
}
/** A branch name the user typed, made safe for git (spaces, `..`, a leading dash, a trailing .lock or slash). */
function cleanBranchName(name) {
	return name.trim().replace(/\s+/g, "-").replace(/[~^:?*[\\\]@{}"'<>|]+/g, "").replace(/\.{2,}/g, ".").replace(/\/{2,}/g, "/").replace(/^[-./]+|[-./]+$/g, "").replace(/\.lock$/i, "").split("/").map((part) => part.replace(/^\.+/, "")).filter(Boolean).join("/");
}
// src/shared/failover.ts
/** The line that says the agent hit its limit, or null. Only the last lines are checked. */
function limitLine(text, pattern) {
	if (!pattern || !text) return null;
	const lines = text.split("\n").slice(-40);
	for (let i = lines.length - 1; i >= 0; i--) if (pattern.test(lines[i])) return lines[i].trim().slice(0, 200);
	return null;
}
/** The first agent in the user's order that is installed and isn't the one that stopped. */
function nextAgent(order, current, installed) {
	return order.find((id) => id !== current && installed(id));
}
/** What the next agent is told: where the work stands and how to pick it up. */
function failoverNote(prevAgent, tail, limit) {
	const out = tail.trim().split("\n").slice(-30).map((l) => limit?.test(l) ? "[usage limit message]" : l).join("\n").slice(-3e3);
	return [
		`${prevAgent} stopped at its usage limit before finishing. Its work so far is in this folder, including uncommitted changes.`,
		"Before you continue, check where it stands: run `git status` and `git diff`, and read the files it touched. Then finish the task; do not start over.",
		out ? `Its last output:\n\`\`\`\n${out}\n\`\`\`` : ""
	].filter(Boolean).join("\n\n");
}
/** The brief of the mission that takes over: the original task, the handoff, and the note above. */
function failoverBrief(m, prevAgent, tail, limit) {
	return [
		`Continue the mission "${m.title}".`,
		failoverNote(prevAgent, tail, limit),
		`Original task:\n${(m.brief ?? m.prompt).trim()}`,
		m.handoff?.trim() ? `Notes from the reviewer:\n${m.handoff.trim()}` : ""
	].filter(Boolean).join("\n\n");
}
// src/shared/missionHistory.ts
/** The mission with `patch` applied, recording a status change in its history. */
function patchMission(m, patch, now) {
	const next = {
		...m,
		...patch,
		updatedAt: now
	};
	if (patch.status && patch.status !== m.status) next.history = pushStatus(m.history, patch.status, now);
	return next;
}
function pushStatus(history, status, at) {
	return [...history ?? [], {
		status,
		at
	}].slice(-500);
}
// src/shared/missionPrompt.ts
/**
* The opening prompt of a mission started from the New mission form, and the briefs of the
* missions that continue one (follow-up, second opinion). The closing lines are deliberate: they
* make the agent's last reply a usable report, which becomes the handoff to whoever comes next.
*/
var REPORT_LIMIT = 6e3;
/** A mission's first message; without a kind it is a Build mission. */
function missionPrompt(o, kind = findKind(BUILTIN_KINDS, DEFAULT_KIND)) {
	return renderKind(kind, o);
}
/** What the next agent gets from a finished mission: the human's notes win over the agent's own report. */
function handoffText(m) {
	if (m.handoff?.trim()) return `Handoff notes from the reviewer:\n${m.handoff.trim()}`;
	const report = m.report?.trim() || m.lastMessage?.trim();
	if (report && m.report?.trim() && m.reportFrom === "terminal") return `The previous agent's terminal when it finished (it wrote no report):\n${report}`;
	if (report) return `Final report from the previous agent:\n${report}`;
	return "No handoff notes were recorded.";
}
var originalTask = (m) => (m.brief ?? m.prompt).trim();
/** A second agent reviews a mission's changes without editing anything. */
function secondOpinionBrief(m, agentName, base) {
	return [
		`Review the work ${agentName} did for the mission "${m.title}": run \`git diff ${base}\` and look at untracked files too.`,
		`Original task:\n${originalTask(m)}`,
		...m.criteria?.trim() ? [`Acceptance criteria:\n${m.criteria.trim()}`] : [],
		handoffText(m),
		"List your findings, most important first, and say whether the acceptance criteria are met. Do not edit any files."
	].join("\n\n");
}
function clipReport(text) {
	return text.length > 6e3 ? `${text.slice(0, REPORT_LIMIT)}\n[truncated]` : text;
}
// src/shared/memory.ts
/**
* Project memory: `.sldev/memory.md` in the project, a dated list of things agents and people learned
* about the project (a gotcha, a command, a convention). Every mission is pointed at it, so the next
* agent doesn't start from zero; agents with the sldev tools add to it with sldev_remember.
*/
var MEMORY_FILE = ".sldev/memory.md";
var MEMORY_HEADER = [
	"# Project memory",
	"",
	"Things agents and people learned about this project. sldev-io points every mission here.",
	"Edit freely: remove what is no longer true. Commit it to share it with your team.",
	""
].join("\n");
/**
* One line per entry: notes are flattened and capped, so the file stays a quick read. The files a note
* is about go at the end (` · files: a, b`); the project context links the note to them and flags it
* when they change.
*/
function memoryEntry(note, source, at, paths = []) {
	const text = note.replace(/\s+/g, " ").replace(/ · files: /g, " - files: ").trim().slice(0, 500);
	const day = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
	const files = [...new Set(paths.map((p) => p.trim().replace(/\\/g, "/").replace(/,/g, "")).filter(Boolean))].slice(0, 12);
	return `- ${day}: ${text}${source.trim() ? ` (${source.trim()})` : ""}${files.length ? ` · files: ${files.join(", ")}` : ""}`;
}
/** The mission prompt with the memory pointer, if there is anything to point at. */
function withMemory(prompt, pointer) {
	return pointer ? `${prompt.trimEnd()}\n\n${pointer}` : prompt;
}
// src/main/pty.ts
/**
* On Windows, node-pty's kill() forks a helper (conpty_console_list_agent) to list the console's
* processes, without windowsHide: from the CLI daemon or the app, which have no console, each kill
* flashed a console window. Forks then default to hidden. Patched on the module object, which node-pty
* reads at call time; an explicit windowsHide still wins.
*/
function hideForkedWindows(cp) {
	const fork = cp.fork;
	if (fork.hidden) return;
	const hidden = ((modulePath, args, options) => {
		if (Array.isArray(args) || args === void 0) return fork(modulePath, args ?? [], {
			windowsHide: true,
			...options
		});
		return fork(modulePath, {
			windowsHide: true,
			...args
		});
	});
	hidden.hidden = true;
	cp.fork = hidden;
}
if (process.platform === "win32") hideForkedWindows(childProcess.default ?? childProcess);
var FLUSH_MS = 8;
var MAX_FRAME = 262144;
var HIGH_WATER = 1048576;
var LOW_WATER = 262144;
var shellOverride = null;
function defaultShell() {
	if (shellOverride) return {
		shell: shellOverride,
		args: process.platform === "win32" ? [] : ["-l"]
	};
	if (process.platform === "win32") return {
		shell: process.env.COMSPEC?.toLowerCase().includes("pwsh") ? "pwsh.exe" : "powershell.exe",
		args: []
	};
	return {
		shell: process.env.SHELL || (existsSync("/bin/zsh") && process.platform === "darwin" ? "/bin/zsh" : "/bin/bash"),
		args: ["-l"]
	};
}
var PtyManager = class {
	sessions = /* @__PURE__ */ new Map();
	has(id) {
		return this.sessions.has(id);
	}
	create(owner, id, opts) {
		this.kill(id);
		const def = defaultShell();
		let shell = opts.shell ?? def.shell;
		let args = opts.args ?? (opts.shell ? [] : def.args);
		const env = {
			...process.env,
			TERM: "xterm-256color",
			COLORTERM: "truecolor",
			TERM_PROGRAM: "sldev-io",
			...opts.env
		};
		if (Array.isArray(opts.command)) ({file: shell, args} = resolveLaunch(opts.command, env));
		else if (opts.command) {
			if (process.platform === "win32") {
				const ps = /(^|[\\/])(pwsh|powershell)(\.exe)?$/i.test(def.shell) ? def.shell : void 0;
				({file: shell, args} = windowsShellLaunch(opts.command, env, ps));
			} else args = ["-c", opts.command];
		}
		const cwd = opts.cwd && existsSync(opts.cwd) ? opts.cwd : homedir();
		const proc = pty.spawn(shell, args, {
			name: "xterm-256color",
			cols: clampInt(opts.cols, 80),
			rows: clampInt(opts.rows, 24),
			cwd,
			env
		});
		const s = {
			proc,
			owner,
			buffer: "",
			timer: null,
			unacked: 0,
			paused: false
		};
		this.sessions.set(id, s);
		proc.onData((chunk) => {
			if (this.sessions.get(id) !== s) return;
			s.buffer += chunk;
			s.unacked += chunk.length;
			if (!s.paused && s.unacked > HIGH_WATER) {
				s.paused = true;
				proc.pause();
			}
			if (s.buffer.length >= MAX_FRAME) this.flush(id, s);
			else if (!s.timer) s.timer = setTimeout(() => this.flush(id, s), FLUSH_MS);
		});
		proc.onExit(({ exitCode }) => {
			if (this.sessions.get(id) !== s) return;
			this.flush(id, s);
			this.sessions.delete(id);
			if (!owner.closed()) owner.exit(id, exitCode);
		});
		return {
			pid: proc.pid,
			shell,
			cwd
		};
	}
	write(id, data) {
		this.sessions.get(id)?.proc.write(data);
	}
	resize(id, cols, rows) {
		const s = this.sessions.get(id);
		if (!s) return;
		try {
			s.proc.resize(clampInt(cols, s.proc.cols), clampInt(rows, s.proc.rows));
		} catch {}
	}
	ack(id, bytes) {
		const s = this.sessions.get(id);
		if (!s) return;
		s.unacked = Math.max(0, s.unacked - bytes);
		if (s.paused && s.unacked < LOW_WATER) {
			s.paused = false;
			s.proc.resume();
		}
	}
	kill(id) {
		const s = this.sessions.get(id);
		if (!s) return;
		this.sessions.delete(id);
		if (s.timer) clearTimeout(s.timer);
		try {
			if (s.paused) s.proc.resume();
			s.proc.kill();
		} catch {}
	}
	killOwnedBy(owner) {
		for (const [id, s] of this.sessions) if (s.owner === owner) this.kill(id);
	}
	killAll() {
		for (const id of [...this.sessions.keys()]) this.kill(id);
	}
	flush(id, s) {
		if (s.timer) clearTimeout(s.timer);
		s.timer = null;
		if (!s.buffer) return;
		const data = s.buffer;
		s.buffer = "";
		if (!s.owner.closed()) s.owner.data(id, data);
	}
};
function clampInt(n, fallback) {
	return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 2e3) : fallback;
}
var MCP_SERVER = `const http = require('http')
const fs = require('fs')
const path = require('path')
const readline = require('readline')
const TOOLS = ${JSON.stringify([
	{
		name: "sldev_status",
		description: "Tell sldev-io what you're doing so the user sees it on the mission board. Call it with needs_input when you need the user (a question, a permission, a decision), with working when you continue, and with done when the task is finished.",
		inputSchema: {
			type: "object",
			properties: {
				state: {
					type: "string",
					enum: [
						"working",
						"needs_input",
						"done"
					]
				},
				message: {
					type: "string",
					description: "One line for the user: what you are doing, what you need, or what you did"
				}
			},
			required: ["state"]
		}
	},
	{
		name: "sldev_output",
		description: "Save this step's result (a spec, a review, a summary) as Markdown. In a factory run the next steps read it.",
		inputSchema: {
			type: "object",
			properties: { markdown: { type: "string" } },
			required: ["markdown"]
		}
	},
	{
		name: "sldev_done",
		description: "Finish this step. Use it when sldev-io runs you as an interactive factory step and you have completed the task.",
		inputSchema: {
			type: "object",
			properties: { summary: {
				type: "string",
				description: "What you did, in a few lines"
			} }
		}
	},
	{
		name: "sldev_missions",
		description: "List the other agent missions in this project: title, agent, status and branch.",
		inputSchema: {
			type: "object",
			properties: {}
		}
	},
	{
		name: "sldev_mission_diff",
		description: "Get another mission's changes as a unified diff, for example to review it. Use an id from sldev_missions.",
		inputSchema: {
			type: "object",
			properties: { id: { type: "string" } },
			required: ["id"]
		}
	},
	{
		name: "sldev_remember",
		description: "Add one line to the project's memory (.sldev/memory.md), which future agents in this project are pointed at. Record what would have saved you time: a gotcha, a command that works, a convention, where something lives. Not a summary of your task.",
		inputSchema: {
			type: "object",
			properties: {
				note: {
					type: "string",
					description: "One line, under 500 characters"
				},
				paths: {
					type: "array",
					items: { type: "string" },
					description: "The files or folders the note is about (relative to the project). Later agents working on them are pointed at the note, and it is flagged when they change."
				}
			},
			required: ["note"]
		}
	},
	{
		name: "sldev_recall",
		description: "Look up what earlier agents and the team know about this project: learnings, reference docs (.sldev/context), pinned files and skills. Ask by topic (query) or by file (path), for example before you change a file or when you are stuck. With a path you also get the other files those notes link to.",
		inputSchema: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description: "A topic or question, e.g. \"how are tests run\" or \"auth tokens\""
				},
				path: {
					type: "string",
					description: "A file or folder relative to the project, e.g. src/server/auth.ts"
				}
			}
		}
	},
	{
		name: "sldev_rules",
		description: "The project's agent rules (.sldev/rules.md, or AGENTS.md when there is none).",
		inputSchema: {
			type: "object",
			properties: {}
		}
	}
])}
const at = process.argv.indexOf('--mission')
const mission = at > 0 ? process.argv[at + 1] : ''
let endpoint = null
try { endpoint = JSON.parse(fs.readFileSync(path.join(__dirname, 'mcp-endpoint.json'), 'utf8')) } catch {}

function call(tool, args) {
  return new Promise((resolve) => {
    if (!endpoint) return resolve({ error: 'sldev-io is not running' })
    const body = JSON.stringify({ mission, tool, args, cwd: process.cwd() })
    const req = http.request({ host: '127.0.0.1', port: endpoint.port, path: '/mcp', method: 'POST', timeout: 20000,
      headers: { 'content-type': 'application/json', 'x-sldev-token': endpoint.token, 'content-length': Buffer.byteLength(body) } },
      (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { try { resolve(JSON.parse(d)) } catch { resolve({ error: 'sldev-io sent an unreadable reply' }) } }) })
    req.on('error', (e) => resolve({ error: 'sldev-io is not reachable: ' + e.message }))
    req.on('timeout', () => { req.destroy(); resolve({ error: 'sldev-io did not answer in time' }) })
    req.end(body)
  })
}

const send = (m) => process.stdout.write(JSON.stringify(m) + '\\n')
readline.createInterface({ input: process.stdin }).on('line', async (line) => {
  let msg
  try { msg = JSON.parse(line) } catch { return }
  const { id, method, params } = msg
  if (method === 'initialize')
    return send({ jsonrpc: '2.0', id, result: { protocolVersion: (params && params.protocolVersion) || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'sldev', version: '1.0.0' } } })
  if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } })
  if (method === 'tools/call') {
    const r = await call(params && params.name, (params && params.arguments) || {})
    return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: r.error || r.text || 'ok' }], isError: !!r.error } })
  }
  if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} })
  if (id !== undefined && id !== null) send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found: ' + method } })
})
`;
// src/main/memory.ts
var memoryPath = (root) => join(root, ...MEMORY_FILE.split("/"));
async function memoryInfo(root) {
	const path = memoryPath(root);
	const text = await promises.readFile(path, "utf8").catch(() => null);
	return {
		path,
		exists: text !== null,
		entries: text ? text.split("\n").filter((l) => l.startsWith("- ")).length : 0
	};
}
/** Creates the file with its header when it doesn't exist; returns its path (to open in the editor). */
async function ensureMemory(root) {
	const path = memoryPath(root);
	await promises.mkdir(dirname(path), { recursive: true });
	await promises.writeFile(path, `${MEMORY_HEADER}\n`, { flag: "wx" }).catch(() => void 0);
	return path;
}
async function remember(root, note, source, paths = []) {
	if (!note.trim()) throw new Error("The note is empty");
	const path = await ensureMemory(root);
	const text = await promises.readFile(path, "utf8");
	const files = paths.map((p) => normalizePath(p, root)).filter((p) => !!p);
	await promises.appendFile(path, `${text.endsWith("\n") ? "" : "\n"}${memoryEntry(note, source, /* @__PURE__ */ new Date(), files)}\n`);
}
// src/main/context.ts
/**
* The project context index: one SQLite database per project in <userData>/context, rebuilt from the
* Markdown sources whenever one of them changes (they're small, so a rebuild is a few milliseconds).
* Nodes are notes and doc sections, `edges` link them to the files they mention, and an FTS5 table
* answers topic searches. The repo holds the truth; this is a cache.
*/
var SCHEMA = 2;
var MAX_DOCS = 200;
var MAX_PINNED_BYTES = 262144;
var baseDir = "";
var dbs = /* @__PURE__ */ new Map();
function initContext(userData) {
	baseDir = join(userData, "context");
}
function closeContext() {
	for (const db of dbs.values()) try {
		db.close();
	} catch {}
	dbs.clear();
}
function open(root) {
	const cached = dbs.get(root);
	if (cached) return cached;
	if (!baseDir) throw new Error("The context index is not ready");
	mkdirSync(baseDir, { recursive: true });
	const file = join(baseDir, `${createHash("sha1").update(root).digest("hex").slice(0, 16)}.db`);
	const db = new DatabaseSync(file);
	db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)");
	if (db.prepare("SELECT value FROM meta WHERE key = 'schema'").get()?.value !== String(SCHEMA)) {
		db.exec(`
      DROP TABLE IF EXISTS nodes; DROP TABLE IF EXISTS edges; DROP TABLE IF EXISTS fts; DELETE FROM meta;
      CREATE TABLE nodes (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, source TEXT NOT NULL, line INTEGER NOT NULL,
        title TEXT NOT NULL, body TEXT NOT NULL, day TEXT, origin TEXT, source_time INTEGER);
      CREATE TABLE edges (node INTEGER NOT NULL, path TEXT NOT NULL, PRIMARY KEY (node, path));
      CREATE INDEX edges_path ON edges (path);
      CREATE VIRTUAL TABLE fts USING fts5(title, body, paths, tokenize = 'porter unicode61');
    `);
		db.prepare("INSERT INTO meta (key, value) VALUES ('schema', ?)").run(String(SCHEMA));
	}
	dbs.set(root, db);
	return db;
}
async function stat(root, rel) {
	const s = await promises.stat(join(root, rel)).catch(() => null);
	return s?.isFile() ? {
		mtime: Math.floor(s.mtimeMs),
		size: s.size
	} : null;
}
async function mdFiles(root, rel, depth = 3) {
	const entries = await promises.readdir(join(root, rel), { withFileTypes: true }).catch(() => []);
	const out = [];
	for (const e of entries) {
		if (e.name.startsWith(".")) continue;
		const child = `${rel}/${e.name}`;
		if (e.isDirectory() && depth > 1) out.push(...await mdFiles(root, child, depth - 1));
		else if (e.isFile() && /\.mdx?$/i.test(e.name)) out.push(child);
	}
	return out;
}
async function listSources(root) {
	const want = [[MEMORY_FILE, "memory"], [PINNED_FILE, "pins"]];
	for (const f of (await mdFiles(root, CONTEXT_DIR)).slice(0, MAX_DOCS)) want.push([f, "doc"]);
	for (const dir of SKILL_DIRS) {
		const subs = await promises.readdir(join(root, dir), { withFileTypes: true }).catch(() => []);
		for (const d of subs) if (d.isDirectory()) want.push([`${dir}/${d.name}/SKILL.md`, "skill"]);
	}
	const pinnedText = await promises.readFile(join(root, PINNED_FILE), "utf8").catch(() => "");
	for (const p of parsePinned(pinnedText)) want.push([p.path, "pinned"]);
	const sources = [];
	for (const [rel, kind] of want) {
		const s = await stat(root, rel);
		if (s) sources.push({
			rel,
			kind,
			...s
		});
	}
	return sources;
}
var signature = (sources) => createHash("sha1").update(JSON.stringify(sources.map((s) => [
	s.rel,
	s.mtime,
	s.size
]))).digest("hex");
async function read$1(root, rel) {
	return promises.readFile(join(root, rel), "utf8").catch(() => null);
}
/** Paths a note mentions that are real (or that the note listed itself, so a deleted file shows as gone). */
function keepPaths(root, n, listed) {
	return n.paths.filter((p) => listed.has(p) || existsSync(join(root, p)));
}
async function collect(root, sources) {
	const nodes = [];
	const byRel = new Map(sources.map((s) => [s.rel, s]));
	for (const s of sources) {
		if (s.kind === "pinned") continue;
		const text = await read$1(root, s.rel);
		if (text === null) continue;
		if (s.kind === "memory") for (const n of parseMemory(text, s.rel)) {
			const listed = new Set(/ · files: (.+)$/.exec(text.split(/\r?\n/)[n.line - 1] ?? "")?.[1].split(",").map((p) => normalizePath(p) ?? "") ?? []);
			nodes.push({
				...n,
				paths: keepPaths(root, n, listed)
			});
		}
		else if (s.kind === "pins") for (const p of parsePinned(text)) {
			const file = byRel.get(p.path);
			const content = file && file.size <= MAX_PINNED_BYTES ? await read$1(root, p.path) : null;
			for (const n of pinnedNode(p, content)) nodes.push({
				...n,
				paths: keepPaths(root, n, /* @__PURE__ */ new Set([p.path])),
				sourceTime: file?.mtime
			});
		}
		else if (s.kind === "doc") for (const n of parseDoc(text, s.rel)) nodes.push({
			...n,
			paths: keepPaths(root, n, /* @__PURE__ */ new Set()),
			sourceTime: s.mtime
		});
		else if (s.kind === "skill") {
			const n = parseSkill(text, s.rel);
			nodes.push({
				...n,
				paths: keepPaths(root, n, /* @__PURE__ */ new Set()),
				sourceTime: s.mtime
			});
		}
	}
	return nodes;
}
var building = /* @__PURE__ */ new Map();
/** Rebuilds the index when any source file changed since the last build. */
async function ensureIndex(root, force = false) {
	const pending = building.get(root);
	if (pending) return pending;
	const job = (async () => {
		const db = open(root);
		const sources = await listSources(root);
		const sig = signature(sources);
		const prev = db.prepare("SELECT value FROM meta WHERE key = 'sig'").get();
		if (!force && prev?.value === sig) return;
		const nodes = await collect(root, sources);
		db.exec("BEGIN");
		try {
			db.exec("DELETE FROM nodes; DELETE FROM edges; DELETE FROM fts;");
			const insNode = db.prepare("INSERT INTO nodes (kind, source, line, title, body, day, origin, source_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
			const insEdge = db.prepare("INSERT OR IGNORE INTO edges (node, path) VALUES (?, ?)");
			const insFts = db.prepare("INSERT INTO fts (rowid, title, body, paths) VALUES (?, ?, ?, ?)");
			for (const n of nodes) {
				const r = insNode.run(n.kind, n.source, n.line, n.title, n.body, n.day ?? null, n.origin ?? null, n.sourceTime ?? null);
				const id = Number(r.lastInsertRowid);
				for (const p of n.paths) insEdge.run(id, p);
				insFts.run(id, n.title, n.body, [...n.paths, n.source].map((p) => p.replace(/[/._-]+/g, " ")).join(" "));
			}
			db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('sig', ?), ('at', ?)").run(sig, String(Date.now()));
			db.exec("COMMIT");
		} catch (e) {
			db.exec("ROLLBACK");
			throw e;
		}
	})().finally(() => building.delete(root));
	building.set(root, job);
	return job;
}
function edgesOf(db, ids) {
	const out = /* @__PURE__ */ new Map();
	if (!ids.length) return out;
	const rows = db.prepare(`SELECT node, path FROM edges WHERE node IN (${ids.map(() => "?").join(",")}) ORDER BY path`).all(...ids);
	for (const r of rows) out.set(r.node, [...out.get(r.node) ?? [], r.path]);
	return out;
}
/**
* When each path last changed: its last commit in git (checkout times would make a fresh clone look
* changed everywhere), else its mtime. A path that doesn't exist maps to undefined.
*/
async function changeTimes(root, paths) {
	const out = /* @__PURE__ */ new Map();
	if (!paths.length) return out;
	const r = await run("git", [
		"log",
		"--format=%x00%ct",
		"--name-only",
		"--no-renames",
		"--",
		...paths.slice(0, 200)
	], root, 1e4);
	const committed = /* @__PURE__ */ new Map();
	if (r.code === 0) {
		let t = 0;
		for (const raw of r.stdout.split("\n")) {
			const line = raw.trim();
			if (raw.startsWith("\0")) t = Number(raw.slice(1)) * 1e3;
			else if (line) {
				for (const p of paths) if (!committed.has(p) && (line === p || line.startsWith(`${p}/`))) committed.set(p, t);
			}
		}
	}
	for (const p of paths) {
		const s = await promises.stat(join(root, p)).catch(() => null);
		out.set(p, s ? committed.get(p) ?? Math.floor(s.mtimeMs) : void 0);
	}
	return out;
}
async function toHits(root, db, scored) {
	if (!scored.length) return [];
	const ids = scored.map((s) => s.id);
	const rows = db.prepare(`SELECT * FROM nodes WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids);
	const byId = new Map(rows.map((r) => [r.id, r]));
	const edges = edgesOf(db, ids);
	const times = await changeTimes(root, [...new Set([...edges.values()].flat())]);
	const hits = [];
	for (const s of scored) {
		const r = byId.get(s.id);
		if (!r) continue;
		const paths = edges.get(r.id) ?? [];
		const ignore = r.kind === "file" ? r.source : void 0;
		hits.push({
			id: r.id,
			score: s.score,
			kind: r.kind,
			source: r.source,
			line: r.line,
			title: r.title,
			body: r.body,
			day: r.day ?? void 0,
			origin: r.origin ?? void 0,
			paths,
			stale: r.kind === "skill" ? void 0 : staleness(paths, writtenAt({ day: r.day ?? void 0 }, r.source_time ?? void 0), times, ignore)
		});
	}
	return hits;
}
/** Nodes that are about a path (or a file inside it, or the folder it is in). */
function idsForPaths(db, paths) {
	const ids = /* @__PURE__ */ new Set();
	const q = db.prepare("SELECT DISTINCT node FROM edges WHERE path = ? OR path LIKE ? ESCAPE '\\' OR ? LIKE (replace(replace(path, '%', '\\%'), '_', '\\_') || '/%') ESCAPE '\\'");
	const qs = db.prepare("SELECT id FROM nodes WHERE source = ?");
	const esc = (s) => s.replace(/[%_\\]/g, (c) => `\\${c}`);
	for (const p of paths) {
		for (const r of q.all(p, `${esc(p)}/%`, p)) ids.add(r.node);
		for (const r of qs.all(p)) ids.add(r.id);
	}
	return [...ids];
}
function kindsOf(db, ids) {
	if (!ids.length) return /* @__PURE__ */ new Map();
	const rows = db.prepare(`SELECT id, kind FROM nodes WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids);
	return new Map(rows.map((r) => [r.id, r.kind]));
}
/** Paths in `text` that the index has notes about (the brief names a file, a notes section links it). */
function knownPaths(db, root, text) {
	const candidates = /* @__PURE__ */ new Set();
	for (const m of text.matchAll(/[\w@./\\-]+/g)) {
		const p = normalizePath(m[0].replace(/[.,;:]+$/, ""), root);
		if (p && (p.includes("/") || /\.[a-z0-9]{1,8}$/i.test(p))) candidates.add(p);
	}
	if (!candidates.size) return [];
	const known = new Set(db.prepare("SELECT DISTINCT path FROM edges").all().map((r) => r.path));
	const sources = new Set(db.prepare("SELECT DISTINCT source FROM nodes").all().map((r) => r.source));
	return [...candidates].filter((c) => sources.has(c) || [...known].some((k) => pathMatches(k, c)));
}
/** The notes that best match a brief or a question: full text plus notes about the files it names. */
async function search(root, text, limit = 6) {
	if (!root) return [];
	await ensureIndex(root);
	const db = open(root);
	const q = ftsQuery(text);
	let fts = [];
	if (q) try {
		fts = db.prepare("SELECT rowid AS id, bm25(fts, 3.0, 1.0, 2.0) AS bm25 FROM fts WHERE fts MATCH ? ORDER BY bm25 LIMIT 40").all(q);
	} catch {
		fts = [];
	}
	const byPath = idsForPaths(db, knownPaths(db, root, text));
	const ids = [.../* @__PURE__ */ new Set([...fts.map((f) => f.id), ...byPath])];
	return toHits(root, db, rankHits(fts, byPath, kindsOf(db, ids), limit));
}
/**
* sldev_recall: by file (every note about it, and the other files those notes mention: one hop
* through the graph) or by topic.
*/
async function recall(root, o, limit = 10) {
	await ensureIndex(root);
	const db = open(root);
	const path = o.path ? normalizePath(o.path, root) : void 0;
	if (path) {
		let hits = await toHits(root, db, idsForPaths(db, [path]).map((id) => ({
			id,
			score: 1
		})));
		if (o.query?.trim()) {
			const topical = new Set((await search(root, o.query, 40)).map((h) => h.id));
			hits = [...hits.filter((h) => topical.has(h.id)), ...hits.filter((h) => !topical.has(h.id))];
		}
		hits = hits.slice(0, limit);
		const related = [...new Set(hits.flatMap((h) => h.paths))].filter((p) => !pathMatches(p, path));
		return {
			hits,
			related
		};
	}
	return {
		hits: await search(root, o.query ?? "", limit),
		related: []
	};
}
// src/main/mcp.ts
var str = (v) => typeof v === "string" ? v : "";
/** A path from an agent: absolute in its worktree or the project, or already relative. */
var projectPath = (self, p) => normalizePath(p, self.cwd) ?? normalizePath(p, self.root);
async function handleMcp(r, deps) {
	const all = deps.missions();
	const self = all.find((m) => m.id === r.mission);
	if (!self) return { error: "This session was not started by sldev-io, so it has no mission to report to." };
	switch (r.tool) {
		case "sldev_status": {
			const state = str(r.args.state);
			if (![
				"working",
				"needs_input",
				"done"
			].includes(state)) return { error: "state must be working, needs_input or done" };
			deps.send({
				mission: self.id,
				type: "status",
				state,
				text: str(r.args.message).slice(0, 600) || void 0
			});
			return { text: "Status updated." };
		}
		case "sldev_output": {
			const markdown = str(r.args.markdown);
			if (!markdown.trim()) return { error: "markdown is empty" };
			deps.send({
				mission: self.id,
				type: "output",
				text: markdown.slice(0, 2e5)
			});
			return { text: "Saved." };
		}
		case "sldev_done":
			deps.send({
				mission: self.id,
				type: "done",
				text: str(r.args.summary).slice(0, 2e3) || void 0
			});
			return { text: "Marked as done. You can stop now." };
		case "sldev_missions": {
			const mine = all.filter((m) => m.root === self.root && m.id !== self.id).slice(0, 50);
			if (!mine.length) return { text: "No other missions in this project." };
			return { text: mine.map((m) => `${m.id} · ${m.options.agent ?? "claude"} · ${m.status} · ${m.worktree?.branch ?? "in place"} · ${m.title}`).join("\n") };
		}
		case "sldev_mission_diff": {
			const m = all.find((x) => x.id === str(r.args.id) && x.root === self.root);
			if (!m) return { error: "No mission with that id in this project. Use sldev_missions." };
			const d = await diff(m.cwd, m.worktree?.base ?? m.baseCommit ?? "HEAD").catch((e) => `Could not read the diff: ${e.message}`);
			return { text: d.length > 6e4 ? `${d.slice(0, 6e4)}\n… diff cut at 60k characters` : d || "No changes." };
		}
		case "sldev_remember": {
			const note = str(r.args.note);
			if (!note.trim()) return { error: "note is empty" };
			const paths = Array.isArray(r.args.paths) ? r.args.paths.map((p) => typeof p === "string" ? projectPath(self, p) : void 0).filter((p) => !!p).slice(0, 12) : [];
			await remember(self.root, note, `${self.options.agent ?? "claude"}, mission "${self.title}"`, paths);
			return { text: "Saved to the project memory." };
		}
		case "sldev_recall": {
			const query = str(r.args.query).slice(0, 500);
			const path = str(r.args.path).slice(0, 300);
			if (!query.trim() && !path.trim()) return { error: "Give a query, a path, or both" };
			const { hits, related } = await recall(self.root, {
				query,
				path: path ? projectPath(self, path) ?? path : void 0
			});
			return { text: recallText(hits, self.root, related) };
		}
		case "sldev_rules":
			for (const f of [".sldev/rules.md", "AGENTS.md"]) {
				const text = await promises.readFile(join(self.root, f), "utf8").catch(() => null);
				if (text) return { text };
			}
			return { text: "This project has no agent rules yet." };
	}
	return { error: `Unknown tool ${r.tool}` };
}
// src/main/hooks.ts
/**
* Claude Code hooks → sldev. Missions launch `claude --settings <file>` where the settings register
* hooks that run a tiny relay script (with Electron as node). The relay POSTs the hook payload to
* this loopback server, so the app knows when an agent is working, waiting, or needs permission,
* without touching the user's own Claude settings. The sldev CLI daemon runs the same server with
* plain node and its own folder, so the app and the CLI never answer each other's agents.
*/
var EVENTS = [
	"SessionStart",
	"UserPromptSubmit",
	"PreToolUse",
	"Notification",
	"Stop",
	"SessionEnd"
];
var RELAY = `const http = require('http')
const event = process.argv[2]
let input = ''
const done = () => process.exit(0)
setTimeout(done, 4000)
process.stdin.on('data', (d) => (input += d))
process.stdin.on('end', () => {
  const { SLDEV_HOOK_PORT: port, SLDEV_HOOK_TOKEN: token, SLDEV_MISSION_ID: mission } = process.env
  if (!port || !mission) return done()
  const body = JSON.stringify({ mission, event, input })
  const req = http.request({ host: '127.0.0.1', port, path: '/hook', method: 'POST', timeout: 2000,
    headers: { 'content-type': 'application/json', 'x-sldev-token': token, 'content-length': Buffer.byteLength(body) } },
    (res) => { res.resume(); res.on('end', done) })
  req.on('error', done)
  req.on('timeout', () => { req.destroy(); done() })
  req.end(body)
})
`;
var info = null;
var server = null;
async function startHookServer(o) {
	const token = randomBytes(16).toString("hex");
	const srv = createServer$1((req, res) => {
		if (req.method === "POST" && req.url === "/mcp" && req.headers["x-sldev-token"] === token) return void serveMcp(req, res);
		if (req.method !== "POST" || req.url !== "/hook" || req.headers["x-sldev-token"] !== token) {
			res.writeHead(403).end();
			return;
		}
		let body = "";
		req.on("data", (d) => {
			body += d;
			if (body.length > 2e6) req.destroy();
		});
		req.on("end", () => {
			res.writeHead(204).end();
			try {
				const { mission, event, input } = JSON.parse(body);
				const evt = summarize(String(mission), String(event), safeJson(input));
				if (evt) o.onHook(evt);
			} catch {}
		});
	});
	const serveMcp = (req, res) => {
		let body = "";
		req.on("data", (d) => {
			body += d;
			if (body.length > 1e6) req.destroy();
		});
		req.on("end", () => {
			Promise.resolve().then(() => handleMcp(JSON.parse(body), o.mcp)).catch(() => ({ error: "Bad request" })).then((r) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(r)));
		});
	};
	const port = await new Promise((resolve) => srv.listen(0, "127.0.0.1", () => resolve(srv.address().port)));
	srv.unref();
	server = srv;
	const dir = o.dir;
	const relay = join(dir, "hook-relay.cjs").replace(/\\/g, "/");
	writeFileSync(relay, RELAY);
	const exec = o.node.replace(/\\/g, "/");
	let relayCommand = `ELECTRON_RUN_AS_NODE=1 "${exec}" "${relay}"`;
	if (process.platform === "win32") {
		const wrapper = join(dir, "hook-relay.cmd");
		writeFileSync(wrapper, `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${o.node}" "${relay.replace(/\//g, "\\")}" %1\r\n`);
		relayCommand = `"${wrapper.replace(/\\/g, "/")}"`;
	}
	const hooks = {};
	for (const e of EVENTS) {
		const command = `${relayCommand} ${e}`;
		hooks[e] = [{
			...e === "PreToolUse" ? { matcher: "*" } : {},
			hooks: [{
				type: "command",
				command,
				timeout: 10
			}]
		}];
	}
	const settingsPath = join(dir, "claude-hooks.json");
	writeFileSync(settingsPath, JSON.stringify({ hooks }, null, 2));
	const script = join(dir, "sldev-mcp.cjs").replace(/\\/g, "/");
	writeFileSync(script, MCP_SERVER);
	writeFileSync(join(dir, "mcp-endpoint.json"), JSON.stringify({
		port,
		token
	}), { mode: 384 });
	info = {
		port,
		token,
		settingsPath,
		mcp: {
			command: exec,
			script
		}
	};
	return info;
}
function stopHookServer() {
	server?.close();
	server = null;
	info = null;
}
function safeJson(s) {
	try {
		return typeof s === "string" ? JSON.parse(s) : {};
	} catch {
		return {};
	}
}
var clip = (s, n = 240) => typeof s === "string" && s ? s.length > n ? s.slice(0, n - 1) + "…" : s : void 0;
/** Transcripts Claude's hooks named this session: the only ones the renderer may ask to read (with those saved on missions). */
var knownTranscripts = /* @__PURE__ */ new Set();
function summarize(mission, event, p) {
	if (typeof p.transcript_path === "string" && p.transcript_path.endsWith(".jsonl")) knownTranscripts.add(p.transcript_path);
	const base = {
		mission,
		sessionId: typeof p.session_id === "string" ? p.session_id : void 0,
		transcriptPath: typeof p.transcript_path === "string" ? p.transcript_path : void 0
	};
	switch (event) {
		case "SessionStart": return {
			...base,
			type: "session-start"
		};
		case "UserPromptSubmit": return {
			...base,
			type: "prompt",
			text: clip(p.prompt)
		};
		case "PreToolUse": return {
			...base,
			type: "tool",
			text: toolSummary(String(p.tool_name ?? "tool"), p.tool_input ?? {})
		};
		case "Notification": return {
			...base,
			type: "notification",
			text: clip(p.message) ?? "Claude needs your attention"
		};
		case "Stop": return {
			...base,
			type: "stop",
			text: lastAssistantText(p.transcript_path)
		};
		case "SessionEnd": return {
			...base,
			type: "session-end",
			text: clip(p.reason)
		};
	}
	return null;
}
function toolSummary(tool, input) {
	const pick = (k) => typeof input[k] === "string" ? input[k] : void 0;
	const file = pick("file_path") ?? pick("notebook_path") ?? pick("path");
	const detail = file ? file.split(/[\\/]/).slice(-2).join("/") : pick("description") ?? pick("command") ?? pick("pattern") ?? pick("url") ?? pick("query");
	return clip(detail ? `${tool}: ${detail}` : tool, 160);
}
/** Read the tail of the session transcript (JSONL) and return the last assistant text block. */
function lastAssistantText(path) {
	if (typeof path !== "string" || !path) return void 0;
	let fd;
	try {
		fd = openSync(path, "r");
		const size = fstatSync(fd).size;
		const len = Math.min(size, 262144);
		const buf = Buffer.alloc(len);
		readSync(fd, buf, 0, len, size - len);
		const lines = buf.toString("utf8").split("\n").reverse();
		for (const line of lines) {
			if (!line.includes("\"assistant\"")) continue;
			try {
				const msg = JSON.parse(line);
				const content = msg?.message?.content;
				if (msg.type !== "assistant" || !Array.isArray(content)) continue;
				const text = content.filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
				if (text) return clipReport(text);
			} catch {}
		}
	} catch {} finally {
		if (fd !== void 0) closeSync(fd);
	}
}
// cli/src/screen.ts
var { Terminal } = createRequire(import.meta.url)("@xterm/headless");
/** A terminal screen with no display: what the agent drew, for status checks, `sldev read` and the TUI. */
function createTerm(cols, rows, events) {
	const term = new Terminal({
		cols,
		rows,
		scrollback: 5e3,
		allowProposedApi: true
	});
	if (events) {
		term.onBell(events.bell);
		term.parser.registerOscHandler(9, (data) => {
			if (!/^\d;/.test(data)) events.notify(data);
			return true;
		});
		term.parser.registerOscHandler(777, (data) => {
			const [kind, title, body] = data.split(";");
			if (kind === "notify") events.notify([title, body].filter(Boolean).join(": "));
			return true;
		});
	}
	return term;
}
/** The last `lines` lines that have text: the empty rows below the cursor don't count. */
function screenText(term, lines) {
	const b = term.buffer.active;
	let end = b.length;
	while (end > 0 && !b.getLine(end - 1)?.translateToString(true).trim()) end--;
	const out = [];
	for (let i = Math.max(0, end - lines); i < end; i++) out.push(b.getLine(i)?.translateToString(true) ?? "");
	return out.join("\n");
}
function termScreen(term) {
	return {
		tail: (rows, from = 0) => {
			const b = term.buffer.active;
			const out = [];
			for (let i = Math.max(from, b.length - rows); i < b.length; i++) out.push(b.getLine(i)?.translateToString(true) ?? "");
			return out.join("\n").trim();
		},
		cursor: () => {
			const b = term.buffer.active;
			return {
				line: b.baseY + b.cursorY,
				alt: b.type === "alternate"
			};
		}
	};
}
// src/shared/screenReport.ts
/**
* The report of an agent that doesn't report back (no hooks, no sldev_done call): its terminal
* screen when it went quiet or exited. Full-screen agents draw panels with box characters, so
* those are stripped and the blank space they leave is collapsed; what remains is its last reply,
* with whatever else was on screen.
*/
var CHROME = /[─-▟⠀-⣿]/g;
/**
* The screen after the agent's prompt: agents echo it (and sldev-io shows the command line first),
* so the reply starts below its last appearance. The terminal wraps lines anywhere, so the match
* ignores whitespace. Unchanged when the prompt isn't on screen any more.
*/
function afterPrompt(screen, prompt) {
	const tail = prompt.replace(/\s+/g, "").slice(-60);
	if (tail.length < 12) return screen;
	const lines = screen.split("\n");
	const flat = lines.map((l) => l.replace(/\s+/g, ""));
	const at = flat.join("").lastIndexOf(tail);
	if (at < 0) return screen;
	const end = at + tail.length;
	let seen = 0;
	for (let i = 0; i < lines.length; i++) {
		seen += flat[i].length;
		if (seen >= end) return lines.slice(i + 1).join("\n");
	}
	return screen;
}
function screenReport(screen, prompt) {
	const lines = (prompt ? afterPrompt(screen.replace(CHROME, " "), prompt) : screen).split("\n").map((l) => l.replace(CHROME, " ").replace(/\s+$/, "")).map((l) => l.replace(/ {4,}/g, "   "));
	const out = [];
	for (const l of lines) {
		if (!l.trim()) {
			if (out.length && out[out.length - 1] !== "") out.push("");
			continue;
		}
		out.push(l);
	}
	while (out.length && out[out.length - 1] === "") out.pop();
	const kept = out.slice(-80);
	const indent = Math.min(...kept.filter(Boolean).map((l) => l.length - l.trimStart().length));
	return clipReport(kept.map((l) => l.slice(Number.isFinite(indent) ? indent : 0)).join("\n").trim());
}
// src/shared/attention.ts
/**
* "Needs you" for agents without hooks: the approval prompt on their screen. Full-screen agents
* (OpenCode, Codex, Gemini) draw a dialog and wait without a bell, so the bell alone misses them.
* What a prompt looks like is per agent (`asks` in src/shared/agents.ts); this is the agent-neutral part.
*/
/** For custom agents and as a fallback: the usual shapes of a CLI asking for a yes. */
var ASK_GENERIC = /\[y\/N\]|\(y\/n\)|Allow once|Yes, allow|Permission required|Allow (?:command|execution)|Do you want to (?:run|allow|proceed|make|edit|apply|create)|Would you like to (?:run|make|apply)/i;
/**
* The approval line on screen, or null: the first match near the bottom, which is the dialog's question
* rather than its buttons. Only what came after the mission's prompt counts, so a prompt that mentions
* "allow once" doesn't flag its own mission.
*/
function askLine(screen, pattern, prompt) {
	const line = (prompt ? afterPrompt(screen, prompt) : screen).split("\n").slice(-25).find((l) => pattern.test(l));
	return line ? line.replace(/\s+/g, " ").replace(/^[^\p{L}\p{N}$[(]+/u, "").trim().slice(0, 200) : null;
}
// cli/src/tracker.ts
var IDLE_MS = 5e3;
var LIMIT_QUIET_MS = 3e3;
var ASK_CHECK_MS = 1e3;
var ASK_SETTLE_MS = 400;
var ECHO_MS = 250;
var live = (m) => m.status === "starting" || m.status === "working" || m.status === "waiting" || m.status === "needs-input";
var Tracker = class {
	d;
	idle;
	limitTimer;
	askTimer;
	bellTimer;
	askChecked = 0;
	asking = false;
	askNotified;
	/** where the user last typed: a prompt above it was answered */
	answeredAt = 0;
	lastInput = 0;
	reporting = false;
	constructor(d) {
		this.d = d;
	}
	dispose() {
		clearTimeout(this.idle);
		clearTimeout(this.limitTimer);
		clearTimeout(this.askTimer);
		clearTimeout(this.bellTimer);
	}
	output() {
		if (!live(this.d.get())) return;
		if (Date.now() - this.lastInput < ECHO_MS) return;
		clearTimeout(this.limitTimer);
		this.limitTimer = setTimeout(() => this.checkLimit(), LIMIT_QUIET_MS);
		if (this.d.agent.hooks) return;
		this.watchAsk();
		if (!this.reporting) this.activity();
	}
	/** a bell, or an OSC 9 / 777 desktop notification */
	attention(text) {
		const m = this.d.get();
		this.checkLimit(text);
		if (this.d.agent.hooks || !live(m) || this.reporting) return;
		if (!text && this.checkAsk()) return;
		if (!text) {
			clearTimeout(this.bellTimer);
			this.bellTimer = setTimeout(() => {
				if (live(this.d.get()) && !this.checkAsk()) this.flag();
			}, ASK_SETTLE_MS);
			return;
		}
		this.flag(text);
	}
	flag(text) {
		const m = this.d.get();
		clearTimeout(this.idle);
		const message = text || `${this.d.agent.name} needs your attention`;
		this.d.update({
			status: "needs-input",
			notification: message
		});
		this.d.notify(`${m.title} needs you`, message);
	}
	input() {
		this.lastInput = Date.now();
		const m = this.d.get();
		if (this.d.agent.hooks || !live(m)) return;
		const cur = this.d.screen.cursor();
		if (!cur.alt) this.answeredAt = cur.line + 1;
		if (this.asking) {
			this.asking = false;
			if (m.status === "needs-input") this.d.update({
				status: "working",
				notification: void 0,
				activityAt: Date.now()
			});
		}
	}
	hook(e) {
		const m = this.d.get();
		const base = {
			...e.sessionId ? { sessionId: e.sessionId } : {},
			...e.transcriptPath ? { transcriptPath: e.transcriptPath } : {}
		};
		switch (e.type) {
			case "session-start": return this.d.update({
				...base,
				status: m.status === "starting" && m.prompt ? "working" : "waiting"
			});
			case "prompt": return this.d.update({
				...base,
				status: "working",
				notification: void 0,
				limited: void 0,
				activity: e.text ? `Prompt: ${e.text}` : m.activity,
				activityAt: Date.now()
			});
			case "tool": return this.d.update({
				...base,
				status: "working",
				notification: void 0,
				activity: e.text,
				activityAt: Date.now()
			});
			case "notification": {
				const idle = /waiting for your input/i.test(e.text ?? "");
				this.d.update({
					...base,
					status: idle ? "waiting" : "needs-input",
					notification: idle ? void 0 : e.text
				});
				if (!idle) this.d.notify(`${m.title} needs you`, e.text ?? "");
				return this.checkLimit(e.text);
			}
			case "stop":
				this.d.update({
					...base,
					status: "waiting",
					lastMessage: e.text?.slice(0, 600) ?? m.lastMessage,
					report: e.text ?? m.report,
					...e.text ? { reportFrom: void 0 } : {},
					notification: void 0
				});
				this.d.notify(`${m.title} finished`, e.text ?? `${this.d.agent.name} is waiting for your next message`);
				return this.checkLimit(e.text);
			case "session-end": return this.d.update({
				...base,
				status: "ended"
			});
		}
	}
	mcp(e) {
		const m = this.d.get();
		const name = this.d.agent.name;
		if (e.type === "status") {
			this.reporting = true;
			clearTimeout(this.idle);
			if (e.state === "working") this.d.update({
				status: "working",
				notification: void 0,
				activity: e.text ?? m.activity
			});
			else if (e.state === "needs_input") {
				this.d.update({
					status: "needs-input",
					notification: e.text ?? `${name} needs you`
				});
				this.d.notify(`${m.title} needs you`, e.text ?? `${name} needs you`);
			} else {
				this.captureScreen();
				this.d.update({
					status: "waiting",
					notification: void 0,
					lastMessage: e.text?.slice(0, 600) ?? m.lastMessage
				});
				this.d.notify(`${m.title} finished`, e.text ?? `${name} says it's done`);
			}
		} else if ((e.type === "done" || e.type === "output") && e.text) this.d.update({
			lastMessage: e.text.slice(0, 600),
			...e.type === "done" ? {
				report: clipReport(e.text),
				reportFrom: void 0
			} : {}
		});
	}
	exit(code) {
		this.dispose();
		this.checkLimit();
		this.captureScreen(true);
		const m = this.d.get();
		if (live(m)) this.d.update({ status: code === 0 || m.status === "waiting" ? "ended" : "failed" });
	}
	activity() {
		const m = this.d.get();
		clearTimeout(this.idle);
		if (m.status !== "working" && m.status !== "needs-input") this.d.update({
			status: "working",
			notification: void 0,
			activityAt: Date.now()
		});
		else if (Date.now() - (m.activityAt ?? 0) > 3e3) this.d.update({ activityAt: Date.now() });
		this.idle = setTimeout(() => {
			const cur = this.d.get();
			if (cur.status !== "working" || this.checkAsk()) return;
			this.captureScreen();
			this.d.update({ status: "waiting" });
			if (Date.now() - cur.updatedAt > 1e4) this.d.notify(`${cur.title} is waiting`, `${this.d.agent.name} went quiet; it's probably your turn`);
		}, IDLE_MS);
	}
	watchAsk() {
		if (Date.now() - this.askChecked >= ASK_CHECK_MS) this.checkAsk();
		clearTimeout(this.askTimer);
		this.askTimer = setTimeout(() => this.checkAsk(), ASK_SETTLE_MS);
	}
	checkAsk() {
		const m = this.d.get();
		if (!live(m) || this.d.agent.hooks) return false;
		this.askChecked = Date.now();
		const cur = this.d.screen.cursor();
		const line = askLine(this.d.screen.tail(200, cur.alt ? 0 : this.answeredAt), this.d.agent.asks ?? ASK_GENERIC, m.prompt);
		if (line) {
			clearTimeout(this.idle);
			if (this.asking && m.status === "needs-input") return true;
			this.asking = true;
			this.d.update({
				status: "needs-input",
				notification: line
			});
			if (m.status !== "needs-input" && this.askNotified !== line) this.d.notify(`${m.title} needs you`, line);
			this.askNotified = line;
			return true;
		}
		this.askNotified = void 0;
		if (this.asking) {
			this.asking = false;
			if (m.status === "needs-input") this.d.update({
				status: "working",
				notification: void 0,
				activityAt: Date.now()
			});
		}
		return false;
	}
	checkLimit(extra) {
		const m = this.d.get();
		if (m.limited || m.continuedBy) return;
		const hit = limitLine(`${this.d.screen.tail(200)}\n${extra ?? ""}`, this.d.agent.usageLimit);
		if (!hit) return;
		this.d.update({
			limited: {
				at: Date.now(),
				text: hit
			},
			notification: `${this.d.agent.name} hit its usage limit`,
			...live(m) ? { status: "needs-input" } : {}
		});
		this.d.limited(hit);
	}
	/** agents that don't report back get their screen as the report; a real report always wins */
	captureScreen(onExit = false) {
		const m = this.d.get();
		if (this.d.agent.hooks) return;
		if (m.report && (m.reportFrom !== "terminal" || onExit)) return;
		const report = screenReport(this.d.screen.tail(200), m.prompt);
		if (report && report !== m.report) this.d.update({
			report,
			reportFrom: "terminal"
		});
	}
};
// cli/src/loops.ts
var clock = (t) => new Date(t).toLocaleTimeString([], {
	hour: "2-digit",
	minute: "2-digit"
});
var Loops = class {
	d;
	loops = /* @__PURE__ */ new Map();
	next = 1;
	constructor(d) {
		this.d = d;
	}
	/** Creates a loop and starts its first pass; resolves with that pass's pane. */
	async create(spec) {
		const loop = {
			id: `L${this.next++}`,
			name: spec.name,
			brief: spec.brief,
			plan: spec.plan,
			args: spec.args,
			progress: freshProgress(Date.now()),
			busy: false
		};
		this.loops.set(loop.id, loop);
		const pane = await this.startPass(loop);
		if (!pane) {
			const reason = loop.progress.reason ?? "The first pass did not start";
			this.loops.delete(loop.id);
			throw new Error(reason);
		}
		return pane;
	}
	list() {
		return [...this.loops.values()].map((l) => this.info(l));
	}
	get(id) {
		const l = this.loops.get(id);
		return l && this.info(l);
	}
	/** No pass after this one: a waiting loop finishes now, a running one when its pass is over. */
	stop(id) {
		const l = this.loops.get(id);
		if (!l) throw new Error(`No loop "${id}". See sldev loops.`);
		l.stopping = true;
		if (l.progress.state === "waiting" || l.progress.state === "paused") {
			clearTimeout(l.timer);
			l.progress = {
				...l.progress,
				state: "finished",
				nextAt: void 0,
				reason: `Stopped after pass ${lastPass(l.progress)?.n ?? 0}`
			};
		}
		this.changed(l);
		return this.info(l);
	}
	/** A pass's pane is over (the daemon says how: exited cleanly, failed, stopped, accepted, hit the limit). */
	ended(paneId, outcome, report) {
		const l = [...this.loops.values()].find((x) => x.progress.passes.some((p) => p.mission === paneId) || x.pending?.pane === paneId);
		if (!l) return;
		if (l.busy) {
			l.pending = {
				pane: paneId,
				outcome,
				report
			};
			return;
		}
		this.wrapUp(l, paneId, outcome, report);
	}
	dispose() {
		for (const l of this.loops.values()) clearTimeout(l.timer);
	}
	info(l) {
		return {
			id: l.id,
			name: l.name,
			brief: l.brief,
			plan: l.plan,
			progress: l.progress,
			label: progressLabel(l.plan, l.progress, Date.now(), clock),
			stopping: l.stopping
		};
	}
	changed(l) {
		this.d.changed?.(this.info(l));
	}
	async startPass(l) {
		if (l.busy || l.progress.state === "running" || l.progress.state === "checking") return void 0;
		l.busy = true;
		const prog = l.progress;
		const n = nextPassNumber(prog);
		let pane;
		try {
			if (prog.cwd && prog.worktree) await commitAll(prog.cwd, `${l.name}: work left before pass ${n}`.slice(0, 100)).catch(() => void 0);
			pane = await this.d.start(l.args, {
				brief: passBrief(l.brief, l.plan, n, lastPass(prog)),
				title: `${l.name} · pass ${n}${l.plan.times ? `/${l.plan.times}` : ""}`.slice(0, 80),
				cwd: prog.cwd,
				worktree: prog.worktree,
				repeat: {
					loop: l.id,
					pass: n,
					of: l.plan.times,
					accept: l.plan.doneWhen === "accept"
				}
			});
			const repo = await isRepo(pane.cwd);
			const base = repo ? await head(pane.cwd) ?? void 0 : void 0;
			const startStat = repo && base && !pane.worktree && !prog.worktree ? await diffStat(pane.cwd, base).catch(() => void 0) : void 0;
			l.progress = beginPass(prog, {
				mission: pane.id,
				startedAt: Date.now(),
				base,
				startStat
			}, {
				cwd: pane.cwd,
				worktree: pane.worktree
			});
		} catch (e) {
			l.progress = {
				...prog,
				state: "finished",
				nextAt: void 0,
				reason: `Couldn't start pass ${n}: ${e.message.split("\n")[0]}`
			};
			this.d.notify(`Repeat: ${l.name}`, l.progress.reason);
		} finally {
			l.busy = false;
		}
		this.changed(l);
		const p = l.pending;
		l.pending = void 0;
		if (p) this.wrapUp(l, p.pane, p.outcome, p.report);
		return pane;
	}
	async wrapUp(l, paneId, first, report) {
		const pass = lastPass(l.progress);
		if (!pass || pass.mission !== paneId || l.progress.state !== "running" || l.busy) return;
		l.busy = true;
		try {
			let outcome = first;
			let checkOutput;
			const cwd = l.progress.cwd;
			const repo = await isRepo(cwd);
			if (outcome === "done" && repo) {
				const headNow = await head(cwd);
				if (!passChanged(pass, headNow, await diffStat(cwd, pass.base ?? headNow ?? "HEAD").catch(() => void 0))) outcome = "unchanged";
			}
			if (outcome === "done" && l.plan.check?.trim()) {
				l.progress = {
					...l.progress,
					state: "checking"
				};
				this.changed(l);
				const r = await (this.d.check ?? runCheck)(cwd, l.plan.check.trim());
				if (!r.ok) {
					outcome = "check-failed";
					checkOutput = r.log;
				}
			}
			if (repo && l.progress.worktree && outcome !== "unchanged") await commitAll(cwd, `${l.name}: pass ${pass.n}`.slice(0, 100)).catch(() => void 0);
			let next = endPass(l.plan, {
				...l.progress,
				state: "running"
			}, {
				outcome,
				checkOutput,
				report
			}, Date.now());
			if (l.stopping && next.state === "waiting") next = {
				...next,
				state: "finished",
				nextAt: void 0,
				reason: `Stopped after pass ${pass.n}`
			};
			l.progress = next;
			if (next.state === "finished") this.d.notify(`Repeat: ${l.name}`, next.reason ?? "Finished");
		} finally {
			l.busy = false;
		}
		this.changed(l);
		this.schedule(l);
	}
	schedule(l) {
		clearTimeout(l.timer);
		if (l.progress.state !== "waiting" || l.progress.nextAt === void 0) return;
		l.timer = setTimeout(() => {
			const state = repeatDue(l.progress, Date.now());
			if (state === "missed") {
				l.progress = {
					...l.progress,
					nextAt: Date.now() + l.plan.gapMinutes * 6e4
				};
				this.changed(l);
				return this.schedule(l);
			}
			if (state === "due") this.startPass(l);
		}, Math.max(0, l.progress.nextAt - Date.now()));
	}
};
/**
* How a check runs: a shell command line, the way tasks are typed. On Windows that's cmd.exe, except a
* command starting with a .ps1 script, which goes to PowerShell (cmd.exe would open it in Notepad).
*/
function checkLaunch(command, platform = process.platform) {
	if (platform === "win32" && /^\s*(?:&\s*)?(?:"[^"]+\.ps1"|'[^']+\.ps1'|\S+\.ps1)(\s|$)/i.test(command)) return {
		file: "powershell.exe",
		args: [
			"-NoProfile",
			"-NonInteractive",
			"-ExecutionPolicy",
			"Bypass",
			"-Command",
			command
		],
		shell: false
	};
	return {
		file: command,
		args: [],
		shell: true
	};
}
/** Runs a check; its last lines go to the next pass. */
function runCheck(cwd, command) {
	return new Promise((resolve) => {
		let out = "";
		const add = (d) => void (out = (out + d.toString()).slice(-2e4));
		const l = checkLaunch(command);
		const child = spawn(l.file, l.args, {
			cwd,
			shell: l.shell,
			windowsHide: true,
			env: process.env,
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			]
		});
		child.stdout?.on("data", add);
		child.stderr?.on("data", add);
		child.on("error", (e) => resolve({
			ok: false,
			log: e.message
		}));
		child.on("close", (code) => resolve({
			ok: code === 0,
			log: out.trim().split("\n").slice(-60).join("\n")
		}));
	});
}
// cli/src/notify.ts
/**
* A Windows toast from Windows PowerShell (its WinRT types; pwsh has none). The texts come in through the
* environment, so nothing the agent wrote is ever parsed as PowerShell. It shows under PowerShell's own app
* id, because Windows drops toasts from an app id nobody registered.
*/
var TOAST = [
	"$ErrorActionPreference = 'Stop'",
	"[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null",
	"$x = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)",
	"$t = $x.GetElementsByTagName('text')",
	"$t.Item(0).AppendChild($x.CreateTextNode($env:SLDEV_NOTE_TITLE)) > $null",
	"$t.Item(1).AppendChild($x.CreateTextNode($env:SLDEV_NOTE_BODY)) > $null",
	"$id = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'",
	"[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($id).Show([Windows.UI.Notifications.ToastNotification]::new($x))"
].join("; ");
/**
* A native desktop notification, from argv (no shell): notify-send on Linux, osascript on macOS, a toast
* through Windows PowerShell on Windows. Nothing happens when there's none, or with SLDEV_NOTIFY=0.
*/
function notifyCommand(title, body, platform = process.platform, env = process.env) {
	if (env.SLDEV_NOTIFY === "0") return null;
	const t = title.slice(0, 120);
	const b = body.replace(/\s+/g, " ").slice(0, 240);
	if (platform === "darwin") return { argv: [
		"osascript",
		"-e",
		"on run argv",
		"-e",
		"display notification (item 2 of argv) with title (item 1 of argv)",
		"-e",
		"end run",
		t,
		b
	] };
	if (platform === "linux" && findOnPath("notify-send", env)) return { argv: [
		"notify-send",
		"--app-name=sldev",
		t,
		b
	] };
	if (platform === "win32") return {
		argv: [
			"powershell.exe",
			"-NoProfile",
			"-NonInteractive",
			"-WindowStyle",
			"Hidden",
			"-Command",
			TOAST
		],
		env: {
			SLDEV_NOTE_TITLE: t,
			SLDEV_NOTE_BODY: b
		}
	};
	return null;
}
function desktopNotify(title, body) {
	const cmd = notifyCommand(title, body);
	if (!cmd) return;
	try {
		const { argv } = cmd;
		spawn(argv[0], argv.slice(1), {
			stdio: "ignore",
			detached: true,
			windowsHide: true,
			env: {
				...process.env,
				...cmd.env
			}
		}).on("error", () => void 0).unref();
	} catch {}
}
// cli/src/version.ts
/** Kept equal to cli/package.json (a test checks it), so the bundle needs no JSON import. */
var VERSION = "0.1.0";
// cli/src/daemon.ts
var MAX_INLINE_PROMPT = 12e3;
var CONTEXT_HITS = 6;
async function startDaemon(o) {
	const dir = cliDir(o.dataDir);
	mkdirSync(dir, {
		recursive: true,
		mode: 448
	});
	const socket = socketPath(dir);
	await claimSocket(socket);
	const settings = readSettings(o.dataDir);
	const custom = settings.customAgents ?? [];
	const agents = allAgents(custom);
	setInstalledBins(agents.flatMap((a) => [a.bin, ...a.aliases ?? []]).filter((b) => b && findOnPath(b, process.env)));
	initContext(o.dataDir);
	const panes = /* @__PURE__ */ new Map();
	const clients = /* @__PURE__ */ new Set();
	const focused = /* @__PURE__ */ new Map();
	let waiters = [];
	let nextId = 1;
	const notify = o.notify ?? desktopNotify;
	const broadcast = (e) => {
		const line = JSON.stringify(e) + "\n";
		for (const c of clients) if (!c.destroyed) c.write(line);
	};
	const ptys = new PtyManager();
	const sink = {
		data: (id, data) => {
			const p = panes.get(id);
			if (!p) return ptys.ack(id, data.length);
			p.history = (p.history + data).slice(-524288);
			p.term.write(data, () => ptys.ack(id, data.length));
			broadcast({
				event: "output",
				pane: id,
				data
			});
			p.tracker.output();
		},
		exit: (id, code) => {
			const p = panes.get(id);
			if (!p) return;
			update(p, {
				pid: void 0,
				exitCode: code
			});
			p.tracker.exit(code);
		},
		closed: () => false
	};
	/** panes whose pass of a repeat the user accepted (sldev accept) */
	const accepted = /* @__PURE__ */ new Set();
	function update(p, patch) {
		const before = p.info.status;
		p.info = patchMission(p.info, patch, Date.now());
		broadcast({
			event: "pane",
			pane: p.info
		});
		if (p.info.status !== before && (p.info.status === "waiting" || p.info.status === "ended")) refreshStats(p);
		if (p.info.repeat && isLive(before) && !isLive(p.info.status)) loops.ended(p.info.id, passOutcome(p.info), p.info.report?.trim() || p.info.lastMessage?.trim());
		const done = [];
		for (const w of waiters) if ((!w.pane || w.pane === p.info.id) && w.states.includes(p.info.status)) done.push(w);
		if (done.length) {
			waiters = waiters.filter((w) => !done.includes(w));
			for (const w of done) w.resolve(p.info);
		}
	}
	async function refreshStats(p) {
		const base = p.info.worktree?.base ?? p.info.baseCommit;
		if (!base) return;
		const stats = await diffStat(p.info.cwd, base).catch(() => void 0);
		if (stats && panes.has(p.info.id)) update(p, { stats });
	}
	function passOutcome(info) {
		if (accepted.delete(info.id)) return "done";
		if (info.limited) return "limited";
		if (info.repeat?.accept || wasInterrupted(info.exitCode)) return "stopped";
		return info.status === "failed" ? "failed" : "done";
	}
	const loops = new Loops({
		start: (args, pass) => newPane({
			...args,
			brief: pass.brief,
			title: pass.title,
			print: !pass.repeat.accept
		}, pass),
		notify: (title, body) => {
			broadcast({
				event: "notify",
				pane: "",
				title,
				body
			});
			notify(title, body);
		},
		changed: (loop) => broadcast({
			event: "loop",
			loop
		})
	});
	const hook = await startHookServer({
		dir,
		node: o.node ?? process.execPath,
		onHook: (e) => panes.get(e.mission)?.tracker.hook(e),
		mcp: {
			missions: () => [...panes.values()].map((p) => p.info),
			send: (e) => panes.get(e.mission)?.tracker.mcp(e)
		}
	});
	function spawnPane(s) {
		const id = String(nextId++);
		const now = Date.now();
		const info = {
			id,
			title: s.title,
			prompt: s.prompt,
			brief: s.brief,
			root: s.root,
			cwd: s.cwd,
			worktree: s.worktree,
			options: {
				...s.options,
				agent: s.agent.id
			},
			kind: s.kind,
			parent: s.parent,
			repeat: s.repeat,
			status: "starting",
			createdAt: now,
			updatedAt: now,
			history: pushStatus(void 0, "starting", now),
			agentName: s.agent.name,
			failover: s.failover?.length ? s.failover : void 0
		};
		const term = createTerm(s.cols, s.rows, {
			bell: () => pane.tracker.attention(),
			notify: (text) => pane.tracker.attention(text)
		});
		const pane = {
			info,
			agent: s.agent,
			term,
			history: "",
			tracker: new Tracker({
				agent: s.agent,
				get: () => pane.info,
				update: (patch) => update(pane, patch),
				notify: (title, body) => {
					broadcast({
						event: "notify",
						pane: id,
						title,
						body
					});
					if (![...focused.values()].includes(id)) notify(title, body);
				},
				limited: (line) => void failover(pane, line),
				screen: termScreen(term)
			})
		};
		panes.set(id, pane);
		const prompt = launchPrompt(id, s.prompt);
		const argv = agentCommand(s.agent, s.options, prompt, s.title, {
			settingsPath: hook.settingsPath,
			mcp: s.agent.mcpArgs ? sldevMcp(hook.mcp, id) : void 0
		});
		const env = {
			SLDEV_MISSION_ID: id,
			SLDEV_HOOK_PORT: String(hook.port),
			SLDEV_HOOK_TOKEN: hook.token
		};
		try {
			const { pid } = ptys.create(sink, id, {
				cwd: s.cwd,
				command: argv,
				cols: s.cols,
				rows: s.rows,
				env
			});
			pane.info = {
				...pane.info,
				pid
			};
		} catch (err) {
			panes.delete(id);
			pane.tracker.dispose();
			throw new Error(`Could not start ${s.agent.name}: ${err.message}`);
		}
		broadcast({
			event: "pane",
			pane: pane.info
		});
		return pane.info;
	}
	function launchPrompt(id, prompt) {
		if (prompt.length <= MAX_INLINE_PROMPT) return prompt;
		const briefs = join(dir, "briefs");
		mkdirSync(briefs, {
			recursive: true,
			mode: 448
		});
		const file = join(briefs, `${process.pid}-${id}.md`);
		promises.writeFile(file, prompt);
		return `Your task is in ${file} (it was too long to pass on the command line). Read the whole file first, then do what it says.`;
	}
	function agentFor(id) {
		const a = findAgent(id, custom);
		if (id && a.id !== id) throw new Error(`Unknown agent "${id}". Known: ${agents.map((x) => x.id).join(", ")}`);
		if (!installedBin(a)) throw new Error(`${a.name} isn't installed${a.install ? ` (${a.install})` : ""}`);
		return a;
	}
	/** A repeat: the loop starts its first pass (and the rest) through newPane, with the pass's brief and folder. */
	async function newLoop(a) {
		const plan = a.repeat;
		if (!a.brief.trim()) throw new Error("A repeat needs a brief");
		agentFor(a.agent);
		const name = a.title?.trim() || a.brief.trim().split("\n")[0].slice(0, 50);
		return loops.create({
			name,
			brief: a.brief,
			plan,
			args: {
				...a,
				repeat: void 0
			}
		});
	}
	async function newPane(a, pass) {
		if (a.repeat && !pass) return newLoop(a);
		const agent = agentFor(a.agent);
		if (!a.brief.trim() && a.kind) throw new Error("A mission kind needs a brief");
		const repo = await isRepo(a.cwd);
		const top = repo ? (await run("git", ["rev-parse", "--show-toplevel"], a.cwd)).stdout.trim() : "";
		const root = top ? resolve(top) : a.cwd;
		const kinds = [...BUILTIN_KINDS, ...await listKinds(root, o.dataDir)];
		const kind = a.kind ? kinds.find((k) => k.id === a.kind || k.name.toLowerCase() === a.kind.toLowerCase()) : void 0;
		if (a.kind && !kind) throw new Error(`Unknown mission kind "${a.kind}". Known: ${kinds.map((k) => k.id).join(", ")}`);
		const title = a.title?.trim() || a.brief.trim().split("\n")[0].slice(0, 60) || `${agent.name} session`;
		let prompt = a.brief;
		if (kind && kind.id !== "freeform") {
			prompt = missionPrompt({
				title,
				brief: a.brief
			}, kind);
			prompt = withMemory(prompt, await contextLines(root, agent, a.brief));
		}
		let cwd = pass?.cwd ?? a.cwd;
		let worktree = pass?.cwd ? pass.worktree : void 0;
		const wantsTree = !pass?.cwd && (typeof a.worktree === "string" || a.worktree === void 0 && (kind?.worktree ?? false));
		if (wantsTree && repo) {
			const base = await gitBranch(root) || "HEAD";
			worktree = await addWorktree(root, a.worktree ? cleanBranchName(a.worktree) : branchName(a.brief || title), base);
			cwd = worktree.path;
		} else if (wantsTree && typeof a.worktree === "string") throw new Error(`${a.cwd} is not a git repository, so it can't have a worktree`);
		const order = a.failover ?? (settings.failoverAuto ? settings.failoverOrder : void 0);
		const info = spawnPane({
			agent,
			prompt,
			brief: a.brief,
			title,
			root,
			cwd,
			worktree,
			kind: kind && {
				id: kind.id,
				name: kind.name,
				readOnly: kind.readOnly
			},
			options: {
				model: a.model,
				effort: a.effort,
				print: a.print || void 0,
				permissionMode: a.mode ?? (kind?.readOnly ? agent.readOnlyMode : a.print ? stageMode(agent, settings.factoryModes) : void 0)
			},
			repeat: pass?.repeat,
			failover: pass ? void 0 : order?.filter((x) => x !== agent.id),
			cols: a.cols ?? 120,
			rows: a.rows ?? 40
		});
		if (!worktree && repo && !pass?.cwd) {
			const base = await head(cwd);
			const p = panes.get(info.id);
			if (p && base) update(p, { baseCommit: base });
		}
		return panes.get(info.id)?.info ?? info;
	}
	async function contextLines(root, agent, brief) {
		const [mem, hits] = await Promise.all([memoryInfo(root).catch(() => null), brief.trim() ? search(root, brief, CONTEXT_HITS).catch(() => []) : Promise.resolve([])]);
		if (!mem) return "";
		return contextPointer(hits, root, {
			memoryPath: mem.path,
			memoryExists: mem.exists,
			tools: !!agent.mcpArgs
		});
	}
	/** The same work continues on the next agent in the pane's failover list, in the same folder. */
	async function failover(p, line) {
		const order = p.info.failover ?? [];
		const to = nextAgent(order, p.agent.id, (id) => !!installedBin(findAgent(id, custom)) && findAgent(id, custom).id === id);
		if (!to) {
			notify(`${p.info.title}: ${p.agent.name} hit its usage limit`, line);
			return;
		}
		const agent = findAgent(to, custom);
		const next = spawnPane({
			agent,
			prompt: failoverBrief(p.info, p.agent.name, termScreen(p.term).tail(200), p.agent.usageLimit),
			brief: p.info.brief,
			title: p.info.title,
			root: p.info.root,
			cwd: p.info.cwd,
			worktree: p.info.worktree,
			kind: p.info.kind,
			options: { permissionMode: p.info.kind?.readOnly ? agent.readOnlyMode : void 0 },
			parent: {
				id: p.info.id,
				kind: "failover"
			},
			failover: order.filter((x) => x !== to),
			cols: p.term.cols,
			rows: p.term.rows
		});
		update(p, {
			continuedBy: next.id,
			notification: `${p.agent.name} hit its usage limit; continued on ${agent.name} in pane ${next.id}`
		});
		notify(`${p.info.title}: continued on ${agent.name}`, `${p.agent.name} hit its usage limit`);
	}
	function review(paneId, agentId) {
		const p = paneFor(paneId);
		const agent = agentFor(agentId);
		const base = p.info.worktree?.base ?? p.info.baseCommit ?? "HEAD";
		return spawnPane({
			agent,
			prompt: secondOpinionBrief(p.info, p.agent.name, base),
			title: `Review: ${p.info.title}`.slice(0, 80),
			root: p.info.root,
			cwd: p.info.cwd,
			options: { permissionMode: agent.readOnlyMode },
			kind: {
				id: "review",
				name: "Review",
				readOnly: true
			},
			parent: {
				id: p.info.id,
				kind: "second-opinion"
			},
			cols: p.term.cols,
			rows: p.term.rows
		});
	}
	function paneFor(id) {
		const p = panes.get(id) ?? [...panes.values()].find((x) => x.info.title === id);
		if (!p) throw new Error(`No pane "${id}". See sldev ls.`);
		return p;
	}
	function wait(a) {
		const states = WAIT_STATES[a.for];
		if (!states) throw new Error("wait for ready, needs-you, done or idle");
		const id = a.pane ? paneFor(a.pane).info.id : void 0;
		const hit = (id ? [panes.get(id)] : [...panes.values()]).find((p) => states.includes(p.info.status));
		if (hit) return Promise.resolve(hit.info);
		if (!id && !panes.size) throw new Error("No panes to wait for");
		return new Promise((resolve) => {
			const w = {
				pane: id,
				states,
				resolve
			};
			waiters.push(w);
			if (a.timeout && a.timeout > 0) setTimeout(() => {
				if (!waiters.includes(w)) return;
				waiters = waiters.filter((x) => x !== w);
				resolve(null);
			}, a.timeout * 1e3);
		});
	}
	const handlers = {
		ping: () => ({
			version: VERSION,
			pid: process.pid
		}),
		ls: () => [...panes.values()].map((p) => p.info),
		new: (a) => newPane(a),
		send: (a) => {
			const p = paneFor(a.pane);
			if (p.info.pid === void 0) throw new Error(`Pane ${p.info.id} has exited`);
			p.tracker.input();
			ptys.write(p.info.id, a.text);
			if (a.enter !== false) setTimeout(() => ptys.write(p.info.id, "\r"), 50);
			if (a.enter !== false && (p.info.status === "waiting" || p.info.status === "needs-input")) update(p, {
				status: "working",
				notification: void 0,
				activityAt: Date.now()
			});
			return null;
		},
		read: (a) => ({ text: screenText(paneFor(a.pane).term, Math.max(1, Math.min(a.lines ?? 60, 5e3))) }),
		wait: (a) => wait(a),
		kill: (a) => {
			const p = paneFor(a.pane);
			ptys.kill(p.info.id);
			p.tracker.dispose();
			panes.delete(p.info.id);
			broadcast({
				event: "closed",
				pane: p.info.id
			});
			if (p.info.repeat && isLive(p.info.status)) loops.ended(p.info.id, "stopped");
			return null;
		},
		review: (a) => review(a.pane, a.agent),
		accept: (a) => {
			const p = paneFor(a.pane);
			if (!p.info.repeat?.accept) throw new Error(`Pane ${p.info.id} isn't a pass that waits for you (sldev new --repeat … --accept)`);
			if (!isLive(p.info.status)) throw new Error(`Pane ${p.info.id} is already over`);
			accepted.add(p.info.id);
			ptys.kill(p.info.id);
			p.tracker.dispose();
			update(p, {
				pid: void 0,
				status: "ended"
			});
			return null;
		},
		loops: () => loops.list(),
		"loop-stop": (a) => loops.stop(a.loop),
		attach: (_a, c) => {
			clients.add(c);
			focused.set(c, null);
			return [...panes.values()].map((p) => p.info);
		},
		input: (a) => {
			const p = paneFor(a.pane);
			p.tracker.input();
			ptys.write(p.info.id, a.data);
			return null;
		},
		resize: (a) => {
			const p = paneFor(a.pane);
			const cols = Math.max(20, Math.min(500, Math.floor(a.cols)));
			const rows = Math.max(5, Math.min(300, Math.floor(a.rows)));
			if (cols === p.term.cols && rows === p.term.rows) return null;
			p.term.resize(cols, rows);
			ptys.resize(p.info.id, cols, rows);
			return null;
		},
		focus: (a, c) => {
			focused.set(c, a.pane);
			return null;
		},
		screen: (a) => ({ data: paneFor(a.pane).history }),
		stop: () => {
			setTimeout(() => void close().then(() => process.exit(0)), 20);
			return null;
		}
	};
	const server = createServer((c) => {
		c.on("data", lineReader((m) => {
			const r = m;
			if (typeof r?.id !== "number" || typeof r.cmd !== "string" || !(r.cmd in handlers)) return;
			const reply = (res) => void (!c.destroyed && c.write(JSON.stringify(res) + "\n"));
			Promise.resolve().then(() => handlers[r.cmd](r.args ?? {}, c)).then((result) => reply({
				id: r.id,
				ok: true,
				result: result ?? null
			}), (err) => reply({
				id: r.id,
				ok: false,
				error: err?.message ?? String(err)
			}));
		}));
		const drop = () => {
			clients.delete(c);
			focused.delete(c);
		};
		c.on("close", drop);
		c.on("error", drop);
	});
	const mask = process.platform === "win32" ? void 0 : process.umask(63);
	try {
		await new Promise((resolve, reject) => {
			server.once("error", reject);
			server.listen(socket, () => resolve());
		});
	} finally {
		if (mask !== void 0) process.umask(mask);
	}
	if (process.platform !== "win32") chmodSync(socket, 384);
	let closed = false;
	async function close() {
		if (closed) return;
		closed = true;
		for (const p of panes.values()) p.tracker.dispose();
		loops.dispose();
		ptys.killAll();
		panes.clear();
		for (const w of waiters) w.resolve(null);
		waiters = [];
		for (const c of clients) c.destroy();
		stopHookServer();
		closeContext();
		await new Promise((resolve) => server.close(() => resolve()));
		if (process.platform !== "win32" && existsSync(socket)) unlinkSync(socket);
	}
	return {
		socket,
		close
	};
}
var isLive = (s) => s === "starting" || s === "working" || s === "waiting" || s === "needs-input";
function readSettings(dataDir) {
	try {
		return JSON.parse(readFileSync(join(dataDir, "settings.json"), "utf8"));
	} catch {
		return {};
	}
}
/**
* A live daemon means this one doesn't start; a socket file left by one that died is removed. Windows named
* pipes leave no file behind, so there it's only the "already running" check.
*/
async function claimSocket(socket) {
	const win = process.platform === "win32";
	if (!win && !existsSync(socket)) return;
	if (await new Promise((resolve) => {
		const c = createConnection(socket);
		c.once("connect", () => (c.destroy(), resolve(true)));
		c.once("error", () => resolve(false));
	})) throw new Error(`sldev is already running (${socket})`);
	if (!win) unlinkSync(socket);
}
// src/shared/rules.ts
/**
* Rules sync: one `.sldev/rules.md` written out as the file each agent reads. Hashes of what was
* written are kept in `.sldev/rules.json`, so a target someone edited by hand is never overwritten
* without asking.
*/
var RULES_SOURCE = ".sldev/rules.md";
var RULES_CONFIG = ".sldev/rules.json";
var RULE_TARGETS = [
	{
		id: "agents",
		path: "AGENTS.md",
		readers: "Codex, OpenCode, Cursor, Copilot and most other agents"
	},
	{
		id: "claude",
		path: "CLAUDE.md",
		readers: "Claude Code"
	},
	{
		id: "gemini",
		path: "GEMINI.md",
		readers: "Gemini CLI"
	},
	{
		id: "cursor",
		path: ".cursor/rules/sldev.mdc",
		readers: "Cursor"
	},
	{
		id: "copilot",
		path: ".github/copilot-instructions.md",
		readers: "GitHub Copilot"
	}
];
var EMPTY_CONFIG = {
	targets: {},
	written: {}
};
var HEADER = "<!-- Generated by sldev-io from .sldev/rules.md. Edit that file and sync, not this one. -->";
var isOn = (c, id) => c.targets[id] !== false;
/** Claude Code and Gemini CLI follow `@file` imports, so they point at AGENTS.md when it's written. */
function renderTarget(id, source, config) {
	const body = source.trim();
	if ((id === "claude" || id === "gemini") && isOn(config, "agents")) return `${HEADER}\n\n@AGENTS.md\n`;
	if (id === "cursor") return `---\ndescription: Project rules (from .sldev/rules.md)\nalwaysApply: true\n---\n\n${HEADER}\n\n${body}\n`;
	return `${HEADER}\n\n${body}\n`;
}
/** FNV-1a: enough to notice a hand edit, and the same in every process. */
function hashText(s) {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return (h >>> 0).toString(16).padStart(8, "0");
}
/** Lines only in `b` and lines only in `a`, as a quick measure of the change. */
function lineChanges(a, b) {
	const count = (lines) => lines.reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), /* @__PURE__ */ new Map());
	const ca = count(a.split("\n"));
	const cb = count(b.split("\n"));
	let added = 0;
	let removed = 0;
	for (const [l, n] of cb) added += Math.max(0, n - (ca.get(l) ?? 0));
	for (const [l, n] of ca) removed += Math.max(0, n - (cb.get(l) ?? 0));
	return {
		added,
		removed
	};
}
function planTarget(target, source, current, config) {
	const next = renderTarget(target.id, source, config);
	const base = {
		target,
		next,
		...lineChanges(current ?? "", next)
	};
	if (!isOn(config, target.id)) return {
		...base,
		status: "off",
		added: 0,
		removed: 0
	};
	if (current === null) return {
		...base,
		status: "create"
	};
	if (current === next) return {
		...base,
		status: "in-sync",
		added: 0,
		removed: 0
	};
	const last = config.written[target.path];
	return {
		...base,
		status: last && hashText(current) === last ? "update" : "hand-edited"
	};
}
/** A first rules.md from whatever agent files the project already has: each distinct text once. */
function importRules(files) {
	const seen = /* @__PURE__ */ new Set();
	const parts = [];
	for (const f of files) {
		if (!f.text) continue;
		const text = f.text.replace(/^---\n[\s\S]*?\n---\n/, "").replace(HEADER, "").split("\n").filter((l) => !/^@\S+$/.test(l.trim())).join("\n").trim();
		if (!text || seen.has(text)) continue;
		seen.add(text);
		parts.push(parts.length ? `<!-- from ${f.path} -->\n\n${text}` : text);
	}
	return parts.length ? `${parts.join("\n\n")}\n` : "# Project rules\n\nHow agents should work in this project: commands, conventions, things that broke before.\n";
}
// src/main/rules.ts
var read = (p) => promises.readFile(p, "utf8").catch(() => null);
async function readConfig(root) {
	try {
		const c = JSON.parse(await read(join(root, ".sldev/rules.json")) ?? "{}");
		return {
			targets: c.targets ?? {},
			written: c.written ?? {}
		};
	} catch {
		return { ...EMPTY_CONFIG };
	}
}
var writeConfig = async (root, c) => {
	await promises.mkdir(join(root, ".sldev"), { recursive: true });
	await promises.writeFile(join(root, RULES_CONFIG), JSON.stringify(c, null, 2) + "\n");
};
async function rulesState(root) {
	const [source, config, files] = await Promise.all([
		read(join(root, RULES_SOURCE)),
		readConfig(root),
		Promise.all(RULE_TARGETS.map((t) => read(join(root, t.path))))
	]);
	return {
		sourcePath: join(root, RULES_SOURCE),
		source,
		config,
		targets: RULE_TARGETS.map((t, i) => {
			const plan = source === null ? null : planTarget(t, source, files[i], config);
			return {
				id: t.id,
				path: t.path,
				readers: t.readers,
				exists: files[i] !== null,
				status: plan?.status ?? null,
				added: plan?.added ?? 0,
				removed: plan?.removed ?? 0
			};
		})
	};
}
/** Starts .sldev/rules.md from the agent files already in the project. Never replaces an existing one. */
async function createRules(root) {
	const p = join(root, RULES_SOURCE);
	if (existsSync(p)) return p;
	const files = await Promise.all(RULE_TARGETS.map(async (t) => ({
		path: t.path,
		text: await read(join(root, t.path))
	})));
	await promises.mkdir(dirname(p), { recursive: true });
	await promises.writeFile(p, importRules(files));
	return p;
}
/** Writes every target that is new or was last written by us, plus the hand-edited ones listed in `overwrite`. */
async function syncRules(root, overwrite = []) {
	const source = await read(join(root, RULES_SOURCE));
	if (source === null) throw new Error("No .sldev/rules.md yet");
	const config = await readConfig(root);
	const written = { ...config.written };
	for (const t of RULE_TARGETS) {
		const plan = planTarget(t, source, await read(join(root, t.path)), config);
		const go = plan.status === "create" || plan.status === "update" || plan.status === "hand-edited" && overwrite.includes(t.id);
		if (go) {
			await promises.mkdir(dirname(join(root, t.path)), { recursive: true });
			await promises.writeFile(join(root, t.path), plan.next);
		}
		if (go || plan.status === "in-sync") written[t.path] = hashText(plan.next);
	}
	await writeConfig(root, {
		...config,
		written
	});
	return rulesState(root);
}
// cli/src/repo.ts
/**
* The repo features, without the daemon: they read and write the same `.sldev/` files as the app,
* so a project moves between the two with nothing lost.
*/
/** The project a folder belongs to: its git top level, else the folder itself. */
async function projectRoot(cwd) {
	const r = await run("git", ["rev-parse", "--show-toplevel"], cwd);
	return r.code === 0 && r.stdout.trim() ? resolve(r.stdout.trim()) : cwd;
}
var STATUS = {
	off: "off",
	"in-sync": "in sync",
	create: "will be created",
	update: "will be updated",
	"hand-edited": "edited by hand (sync --overwrite to replace)"
};
async function rulesStatus(root) {
	const s = await rulesState(root);
	if (s.source === null) return `No ${s.sourcePath} yet. Run \`sldev rules init\` to start it from the agent files already here.`;
	const width = Math.max(...s.targets.map((t) => t.path.length));
	return [`Rules: ${s.sourcePath}`, ...s.targets.map((t) => `  ${t.path.padEnd(width)}  ${STATUS[t.status ?? "off"] ?? t.status}${t.added || t.removed ? ` (+${t.added} -${t.removed})` : ""}  · ${t.readers}`)].join("\n");
}
async function rulesInit(root) {
	return `Rules source: ${await createRules(root)}\nEdit it, then run \`sldev rules sync\`.`;
}
async function rulesSync(root, overwrite) {
	const before = await rulesState(root);
	if (before.source === null) throw new Error("No .sldev/rules.md yet. Run `sldev rules init` first.");
	return ["Synced .sldev/rules.md:", ...(await syncRules(root, overwrite)).targets.map((t, i) => {
		const was = before.targets[i].status;
		const wrote = (was === "create" || was === "update" || was === "hand-edited" && overwrite.includes(t.id)) && t.status === "in-sync";
		return `  ${wrote ? "wrote  " : "skipped"} ${t.path}  ${wrote ? "" : STATUS[t.status ?? "off"]}`;
	})].join("\n");
}
async function rememberNote(root, note, files) {
	await remember(root, note, "sldev CLI", files);
	return `Saved to ${(await memoryInfo(root)).path}`;
}
async function memorySummary(root) {
	const m = await memoryInfo(root);
	return m.exists ? `${m.path}: ${m.entries} ${m.entries === 1 ? "entry" : "entries"}` : `No project memory yet (${m.path}). Add to it with \`sldev remember "…"\`.`;
}
async function recallNotes(dataDir, root, query, path) {
	if (!query.trim() && !path?.trim()) throw new Error("Give a topic, --path <file>, or both");
	initContext(dataDir);
	const { hits, related } = await recall(root, {
		query,
		path
	});
	return recallText(hits, root, related);
}
/** The sidebar goes away on narrow terminals; a split needs room for two usable panes. */
function layout(cols, rows, split) {
	const status = {
		x: 0,
		y: rows - 1,
		w: cols,
		h: 1
	};
	const sidebar = cols >= 80 ? {
		x: 0,
		y: 0,
		w: 28,
		h: rows - 1
	} : null;
	const x = sidebar ? 29 : 0;
	const w = cols - x;
	const h = rows - 1;
	if (split && w >= 60) {
		const left = Math.floor((w - 1) / 2);
		return {
			sidebar,
			panes: [{
				x,
				y: 0,
				w: left,
				h
			}, {
				x: x + left + 1,
				y: 0,
				w: w - left - 1,
				h
			}],
			status
		};
	}
	return {
		sidebar,
		panes: [{
			x,
			y: 0,
			w,
			h
		}],
		status
	};
}
var TONE_SGR = {
	working: "32",
	attention: "33",
	error: "31",
	review: "34",
	done: "36",
	neutral: "90"
};
var at = (x, y) => `\x1b[${y + 1};${x + 1}H`;
/** A string cut or padded to exactly `w` columns (wide characters count as two). */
function fit(s, w) {
	let out = "";
	let used = 0;
	for (const ch of s.replace(/[\x00-\x1f\x7f]/g, " ")) {
		const cw = wide(ch) ? 2 : 1;
		if (used + cw > w) break;
		out += ch;
		used += cw;
	}
	return out + " ".repeat(Math.max(0, w - used));
}
function wide(ch) {
	const c = ch.codePointAt(0) ?? 0;
	return c >= 4352 && c <= 4447 || c >= 11904 && c <= 42191 || c >= 44032 && c <= 55203 || c >= 63744 && c <= 64255 || c >= 65072 && c <= 65103 || c >= 65280 && c <= 65376 || c >= 65504 && c <= 65510 || c >= 127744 && c <= 129791 || c >= 131072 && c <= 262141;
}
function color(cell, fg) {
	const v = fg ? cell.getFgColor() : cell.getBgColor();
	if (fg ? cell.isFgDefault() : cell.isBgDefault()) return fg ? "39" : "49";
	if (fg ? cell.isFgRGB() : cell.isBgRGB()) return `${fg ? 38 : 48};2;${v >> 16 & 255};${v >> 8 & 255};${v & 255}`;
	if (v < 8) return String((fg ? 30 : 40) + v);
	if (v < 16) return String((fg ? 90 : 100) + v - 8);
	return `${fg ? 38 : 48};5;${v}`;
}
function sgr(cell) {
	const parts = ["0"];
	if (cell.isBold()) parts.push("1");
	if (cell.isDim()) parts.push("2");
	if (cell.isItalic()) parts.push("3");
	if (cell.isUnderline()) parts.push("4");
	if (cell.isInverse()) parts.push("7");
	if (cell.isInvisible()) parts.push("8");
	if (cell.isStrikethrough()) parts.push("9");
	parts.push(color(cell, true), color(cell, false));
	return parts.join(";");
}
/** The visible screen of `term`, drawn into `r` (rows past the screen are cleared). */
function drawTerm(term, r) {
	const b = term.buffer.active;
	const cell = b.getNullCell();
	let out = "";
	for (let row = 0; row < r.h; row++) {
		out += at(r.x, r.y + row) + "\x1B[0m";
		const line = row < term.rows ? b.getLine(b.viewportY + row) : void 0;
		let used = 0;
		let last = "";
		if (line) for (let col = 0; col < Math.min(term.cols, r.w); col++) {
			const c = line.getCell(col, cell);
			if (!c) break;
			const w = c.getWidth();
			if (w === 0) continue;
			if (used + w > r.w) break;
			const style = sgr(c);
			if (style !== last) {
				out += `\x1b[${style}m`;
				last = style;
			}
			out += c.getChars() || " ";
			used += w;
		}
		out += "\x1B[0m" + " ".repeat(Math.max(0, r.w - used));
	}
	return out;
}
// cli/src/tui.ts
/**
* `sldev` with no arguments: the agents in a sidebar with their status, one or two panes beside it, and
* the keyboard going to the pane in focus. Ctrl-b is the prefix (n/p, 1-9, s split, Tab, c new, x kill,
* w workflows, e editor, v changed files in the editor, d detach). Detaching leaves every agent running.
*/
var PREFIX = "";
var HELP = "Ctrl-b then: n/p next/prev · 1-9 pick · s split · c new · x kill · w workflows · e editor · v diff · d detach";
var RUNS_HELP = "↑↓ pick · Enter open in browser · r rerun failed jobs · u refresh · Esc close";
/** how often the workflows view asks GitHub again while it's open */
var RUNS_REFRESH_MS = 15e3;
function defaultServices(preferred) {
	return {
		runs: loadRuns,
		rerun: rerunFailed,
		openRun,
		open: (p, diff) => openPane(p, {
			diff,
			preferred: preferred()
		})
	};
}
async function runTui(client, cwd, io = {
	input: process.stdin,
	output: process.stdout
}, services = defaultServices(() => null)) {
	const out = io.output;
	const input = io.input;
	const views = /* @__PURE__ */ new Map();
	let order = [];
	let focus = 0;
	let split = false;
	let prefix = false;
	let prompt = null;
	let message = "";
	let runsView = null;
	let frame = null;
	let restored = false;
	const visible = () => {
		if (!order.length) return [];
		const first = order[Math.min(focus, order.length - 1)];
		if (!split || order.length < 2) return [first];
		return [first, order[(Math.min(focus, order.length - 1) + 1) % order.length]];
	};
	const addView = async (info) => {
		if (views.has(info.id)) return;
		const view = {
			info,
			term: createTerm(120, 40)
		};
		views.set(info.id, view);
		order.push(info.id);
		const { data } = await client.request("screen", { pane: info.id }).catch(() => ({ data: "" }));
		view.term.write(data);
	};
	const sizeViews = () => {
		const l = layout(out.columns || 80, out.rows || 24, split);
		visible().forEach((id, i) => {
			const v = views.get(id);
			const r = l.panes[i];
			if (!v || !r) return;
			const cols = Math.max(20, r.w);
			const rows = Math.max(5, r.h - 1);
			if (v.term.cols !== cols || v.term.rows !== rows) v.term.resize(cols, rows);
			const size = `${cols}x${rows}`;
			if (v.size !== size) {
				v.size = size;
				client.request("resize", {
					pane: id,
					cols,
					rows
				}).catch(() => void 0);
			}
		});
		client.request("focus", { pane: visible()[0] ?? null }).catch(() => void 0);
	};
	const schedule = () => {
		if (!frame && !restored) frame = setTimeout(draw, 33);
	};
	function draw() {
		frame = null;
		if (restored) return;
		const cols = out.columns || 80;
		const l = layout(cols, out.rows || 24, split);
		let s = "\x1B[?2026h\x1B[?25l";
		if (l.sidebar) s += drawSidebar(l.sidebar);
		const shown = visible();
		if (!shown.length) {
			const r = l.panes[0];
			const lines = [
				"No agents yet.",
				"",
				"Ctrl-b c starts one here, or from another terminal:",
				"  sldev new --agent claude \"fix the failing test\""
			];
			for (let i = 0; i < r.h; i++) s += at(r.x, r.y + i) + fit(lines[i - 2] ?? "", r.w);
		}
		if (runsView) {
			const first = l.panes[0];
			const last = l.panes[l.panes.length - 1];
			s += drawRuns(runsView, {
				x: first.x,
				y: 0,
				w: last.x + last.w - first.x,
				h: first.h
			});
			s += at(0, l.status.y) + statusLine(cols);
			out.write(s + "\x1B[?2026l");
			return;
		}
		shown.forEach((id, i) => {
			const v = views.get(id);
			const r = l.panes[i];
			if (!v || !r) return;
			s += at(r.x, r.y) + paneHeader(v.info, r.w, i === 0);
			s += drawTerm(v.term, {
				x: r.x,
				y: r.y + 1,
				w: r.w,
				h: r.h - 1
			});
			if (i === 0 && l.panes[1]) for (let y = 0; y < r.h; y++) s += at(r.x + r.w, y) + "\x1B[90m│\x1B[0m";
		});
		s += at(0, l.status.y) + statusLine(cols);
		const main = shown[0] && views.get(shown[0]);
		if (prompt) s += at(prompt.label.length + prompt.text.length + 1, l.status.y) + "\x1B[?25h";
		else if (main) {
			const b = main.term.buffer.active;
			s += at(l.panes[0].x + Math.min(b.cursorX, l.panes[0].w - 1), l.panes[0].y + 1 + b.cursorY) + "\x1B[?25h";
		}
		out.write(s + "\x1B[?2026l");
	}
	function drawSidebar(r) {
		let s = at(r.x, r.y) + "\x1B[1m" + fit(" sldev", r.w) + "\x1B[0m";
		const shown = visible();
		let y = 2;
		order.forEach((id, i) => {
			const v = views.get(id);
			if (!v || y + 1 >= r.h) return;
			const sig = missionSignal(v.info.status);
			const mark = shown.includes(id) ? "\x1B[7m" : "";
			s += at(r.x, r.y + y) + mark + ` \x1b[${TONE_SGR[sig.tone]}m●\x1b[0m${mark} ` + fit(`${i + 1} ${v.info.title}`, r.w - 3) + "\x1B[0m";
			s += at(r.x, r.y + y + 1) + "\x1B[90m" + fit(`   ${v.info.agentName} · ${sig.label}`, r.w) + "\x1B[0m";
			y += 2;
		});
		for (; y < r.h; y++) s += at(r.x, r.y + y) + " ".repeat(r.w);
		for (let i = 0; i < r.h; i++) s += at(r.x + r.w, r.y + i) + "\x1B[90m│\x1B[0m";
		return s;
	}
	function drawRuns(v, r) {
		let s = at(r.x, r.y) + "\x1B[1m" + fit(` Workflows · ${v.cwd}${v.loading ? " · loading…" : ""}`, r.w) + "\x1B[0m";
		const lines = [];
		if (v.error) lines.push(`\x1b[31m ${fit(v.error, r.w - 1)}\x1b[0m`);
		else if (!v.runs.length) lines.push(fit(v.loading ? " Asking GitHub…" : " No workflow runs yet in this repository.", r.w));
		const now = Date.now();
		const rows = r.h - 2;
		const start = Math.max(0, Math.min(v.sel - Math.floor(rows / 2), v.runs.length - rows));
		if (!v.error) v.runs.slice(start, start + rows).forEach((run, i) => {
			const c = runColumns(run, now);
			const mark = start + i === v.sel ? "\x1B[7m" : "";
			lines.push(`${mark} \x1b[${TONE_SGR[c.tone]}m●\x1b[0m${mark} ${fit(`${c.label.padEnd(9)} ${c.text}`, r.w - 3)}\x1b[0m`);
		});
		for (let i = 0; i < r.h - 1; i++) s += at(r.x, r.y + 1 + i) + (lines[i] ?? " ".repeat(r.w));
		return s;
	}
	const refreshRuns = () => {
		const v = runsView;
		if (!v) return;
		v.loading = true;
		schedule();
		services.runs(v.cwd).then((runs) => {
			if (runsView !== v) return;
			v.runs = runs;
			v.error = void 0;
			v.sel = Math.min(v.sel, Math.max(0, runs.length - 1));
		}).catch((err) => runsView === v && (v.error = err.message)).finally(() => {
			if (runsView !== v) return;
			v.loading = false;
			clearTimeout(v.timer);
			if (!v.error) v.timer = setTimeout(refreshRuns, RUNS_REFRESH_MS);
			schedule();
		});
	};
	const openRuns = () => {
		const id = visible()[0];
		runsView = {
			cwd: id && views.get(id)?.info.root || cwd,
			runs: [],
			sel: 0,
			loading: true
		};
		message = "";
		refreshRuns();
	};
	const closeRuns = () => {
		if (runsView) clearTimeout(runsView.timer);
		runsView = null;
		message = "";
		schedule();
	};
	/** Keys while the workflows view is open; returns what is left. */
	function runsKey(s) {
		const v = runsView;
		const arrow = /^\x1b\[([AB])/.exec(s) ?? /^\x1bO([AB])/.exec(s);
		if (arrow || s[0] === "j" || s[0] === "k") {
			const up = arrow ? arrow[1] === "A" : s[0] === "k";
			v.sel = Math.max(0, Math.min(v.runs.length - 1, v.sel + (up ? -1 : 1)));
			return s.slice(arrow ? arrow[0].length : 1);
		}
		const c = s[0];
		const run = v.runs[v.sel];
		if (c === "\x1B" || c === "q" || c === "") {
			closeRuns();
			return "";
		}
		if (c === "u") refreshRuns();
		else if ((c === "\r" || c === "o") && run) services.openRun(v.cwd, run.databaseId).then(() => message = `Opened run ${run.databaseId} in the browser`).catch((err) => message = err.message).finally(schedule);
		else if (c === "r" && run) {
			if (run.status !== "completed" || run.conclusion === "success") message = "Only a finished run that failed can be rerun";
			else ask(`Rerun the failed jobs of ${run.workflowName} #${run.number}? (y/N) `, (text) => {
				if (!/^y/i.test(text.trim())) return;
				services.rerun(v.cwd, run.databaseId).then(() => (message = `Rerunning the failed jobs of #${run.number}`, refreshRuns())).catch((err) => message = err.message).finally(schedule);
			});
		} else if (c === PREFIX) prefix = true;
		return s.slice(1);
	}
	const openEditor = (diff) => {
		const id = visible()[0];
		const info = id ? views.get(id)?.info : void 0;
		if (!info) return void (message = "No pane to open");
		message = diff ? "Opening the changes in your editor…" : "Opening the folder in your editor…";
		services.open(info, diff).then((r) => message = r.terminal ? `Only a terminal editor was found: run sldev open ${info.id} from another terminal` : r.note).catch((err) => message = err.message).finally(schedule);
	};
	function paneHeader(p, w, focused) {
		const sig = missionSignal(p.status);
		const where = p.worktree ? p.worktree.branch : "in place";
		const stats = p.stats ? ` · ${p.stats.files} files +${p.stats.insertions} -${p.stats.deletions}` : "";
		const note = p.notification ? ` · ${p.notification}` : "";
		const text = ` ${p.id} ${p.title} · ${p.agentName} · ${where}${stats}${note}`;
		return `\x1b[${TONE_SGR[sig.tone]}m●\x1b[0m${focused ? "\x1B[1m" : "\x1B[90m"}${fit(text, w - 1)}\x1b[0m`;
	}
	function statusLine(cols) {
		if (prompt) return "\x1B[7m" + fit(`${prompt.label}${prompt.text}`, cols) + "\x1B[0m";
		return "\x1B[90m" + fit(` ${prefix ? "Ctrl-b …" : message || (runsView ? RUNS_HELP : HELP)}`, cols) + "\x1B[0m";
	}
	const onEvent = (e) => {
		if (e.event === "output") {
			const v = views.get(e.pane);
			if (v) {
				v.term.write(e.data);
				if (visible().includes(e.pane)) schedule();
			}
		} else if (e.event === "pane") {
			const v = views.get(e.pane.id);
			if (v) v.info = e.pane;
			else addView(e.pane).then(() => (sizeViews(), schedule()));
			schedule();
		} else if (e.event === "closed") {
			views.delete(e.pane);
			order = order.filter((id) => id !== e.pane);
			focus = Math.min(focus, Math.max(0, order.length - 1));
			sizeViews();
			schedule();
		} else if (e.event === "notify" && !visible().includes(e.pane)) {
			message = `${e.title}: ${e.body}`;
			schedule();
		}
	};
	const select = (i) => {
		if (!order.length) return;
		focus = (i % order.length + order.length) % order.length;
		message = "";
		sizeViews();
		schedule();
	};
	const ask = (label, done) => {
		prompt = {
			label,
			text: "",
			done
		};
		schedule();
	};
	let resolveExit = () => void 0;
	const finished = new Promise((r) => resolveExit = r);
	/** Keys can arrive several to a chunk (fast typing, a paste), so the input is taken apart here. */
	const onKey = (d) => {
		let rest = d.toString();
		while (rest && !restored) rest = key(rest);
		schedule();
	};
	/** Handles the start of `s` and returns what is left. */
	function key(s) {
		if (prompt) {
			const p = prompt;
			const ch = String.fromCodePoint(s.codePointAt(0));
			if (ch === "\r") {
				prompt = null;
				p.done(p.text);
			} else if (ch === "\x1B" || ch === "") {
				prompt = null;
				return "";
			} else if (ch === "" || ch === "\b") p.text = p.text.slice(0, -1);
			else if (!/[\x00-\x1f]/.test(ch)) p.text += ch;
			return s.slice(ch.length);
		}
		if (runsView && !prefix) return runsKey(s);
		if (prefix) {
			prefix = false;
			const c = s[0];
			const id = visible()[0];
			if (c === "w") {
				if (runsView) closeRuns();
				else openRuns();
				return s.slice(1);
			}
			if (runsView) closeRuns();
			if (c === "e" || c === "v") {
				openEditor(c === "v");
				return s.slice(1);
			}
			if (c === "n" || c === "	" || c === "o") select(focus + 1);
			else if (c === "p") select(focus - 1);
			else if (/^[1-9]$/.test(c)) select(Number(c) - 1);
			else if (c === "s") {
				split = !split;
				sizeViews();
			} else if (c === "d") {
				detach();
				return "";
			} else if (c === "c") ask("New pane (agent, then the brief): ", (text) => {
				const [agent, ...words] = text.trim().split(/\s+/);
				if (!agent) return;
				client.request("new", {
					agent,
					brief: words.join(" "),
					cwd,
					worktree: false
				}).then((p) => (message = `Started pane ${p.id}`, schedule())).catch((err) => (message = err.message, schedule()));
			});
			else if (c === "x" && id) ask(`Kill pane ${id}? Its agent stops; files stay. (y/N) `, (text) => {
				if (/^y/i.test(text.trim())) client.request("kill", { pane: id }).catch((err) => message = err.message);
			});
			else if (c === PREFIX && id) client.request("input", {
				pane: id,
				data: PREFIX
			});
			return s.slice(1);
		}
		const at = s.indexOf(PREFIX);
		const typed = at < 0 ? s : s.slice(0, at);
		const id = visible()[0];
		if (typed && id) client.request("input", {
			pane: id,
			data: typed
		}).catch(() => void 0);
		if (at < 0) return "";
		prefix = true;
		return s.slice(at + 1);
	}
	const restore = () => {
		if (restored) return;
		restored = true;
		if (frame) clearTimeout(frame);
		if (runsView) clearTimeout(runsView.timer);
		input.off("data", onKey);
		if (input.isTTY) input.setRawMode?.(false);
		input.pause();
		out.write("\x1B[0m\x1B[?25h\x1B[?1049l");
	};
	function detach() {
		restore();
		out.write("Detached. The agents keep running; `sldev` attaches again.\n");
		client.close();
		resolveExit();
	}
	const panes = await client.request("attach", {
		cols: out.columns || 80,
		rows: out.rows || 24
	});
	for (const p of panes) await addView(p);
	client.onEvent(onEvent);
	client.onClose(() => {
		if (restored) return;
		restore();
		out.write("The sldev daemon stopped.\n");
		resolveExit();
	});
	out.write("\x1B[?1049h\x1B[2J");
	if (input.isTTY) input.setRawMode?.(true);
	input.resume();
	input.on("data", onKey);
	out.on("resize", () => {
		out.write("\x1B[2J");
		sizeViews();
		schedule();
	});
	sizeViews();
	draw();
	return finished;
}
// src/shared/prices.ts
/**
* Approximate API list prices in USD per million tokens, for the usage dashboard's cost estimate.
* They go stale: update them (and PRICES_CHECKED) with each release. A model that matches nothing
* has no price, and its tokens are shown as unpriced instead of guessed.
* Sources: Anthropic and OpenAI pricing pages, checked on PRICES_CHECKED.
*/
var PRICES_CHECKED = "2026-10-26";
/** Cache reads at 0.1x and 5-minute cache writes at 1.25x the input price, unless a model says otherwise. */
var p = (input, output, cacheRead = input * .1, cacheWrite = input * 1.25) => ({
	input,
	output,
	cacheRead,
	cacheWrite
});
/** First match wins, so the more specific ids come first. Matched against the lowercased model id. */
var TABLE = [
	[/(fable|mythos)-5-1/, p(10, 50, .25)],
	[/(fable|mythos)-5/, p(10, 50)],
	[/opus-5-5/, p(4, 20, .2)],
	[/opus-5/, p(5, 25)],
	[/opus-4-[5-8]/, p(5, 25)],
	[/sonnet-5/, p(2, 10, .2)],
	[/sonnet-4/, p(3, 15)],
	[/haiku-5-5/, p(.1, .5, .01)],
	[/haiku-4-5/, p(1, 5)],
	[/gpt-5\.3-codex/, p(1.75, 14, .175, 0)],
	[/^gpt-5(-codex)?$/, p(1.25, 10, .125, 0)]
];
function priceFor(model) {
	if (!model) return null;
	const id = model.toLowerCase().trim();
	return TABLE.find(([re]) => re.test(id))?.[1] ?? null;
}
function costOf(u, price) {
	return (u.input * price.input + u.output * price.output + u.cacheRead * price.cacheRead + u.cacheWrite * price.cacheWrite) / 1e6;
}
// src/shared/usage.ts
var tokenTotal = (u) => u.input + u.output + u.cacheRead + u.cacheWrite;
function addTokens(a, b) {
	return {
		input: a.input + b.input,
		output: a.output + b.output,
		cacheRead: a.cacheRead + b.cacheRead,
		cacheWrite: a.cacheWrite + b.cacheWrite,
		cost: a.cost + b.cost,
		unpriced: a.unpriced + b.unpriced
	};
}
var NO_TOKENS = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	cost: 0,
	unpriced: 0
};
/** Tokens of one model, priced. */
function priced(t, model) {
	const price = priceFor(model);
	return {
		...t,
		cost: price ? costOf(t, price) : 0,
		unpriced: price ? 0 : t.input + t.output + t.cacheRead + t.cacheWrite
	};
}
/**
* Claude Code transcript (JSONL): each assistant message carries `usage`. A message can span several
* lines with the same id, so the last line per id counts.
*/
function claudeTranscriptReader() {
	const byId = /* @__PURE__ */ new Map();
	return {
		line: (line) => {
			if (!line.includes("\"usage\"")) return;
			try {
				const d = JSON.parse(line);
				const u = d.type === "assistant" ? d.message?.usage : void 0;
				if (!u) return;
				byId.set(d.message?.id ?? String(byId.size), priced({
					input: u.input_tokens ?? 0,
					output: u.output_tokens ?? 0,
					cacheRead: u.cache_read_input_tokens ?? 0,
					cacheWrite: u.cache_creation_input_tokens ?? 0
				}, d.message?.model));
			} catch {}
		},
		result: () => byId.size ? [...byId.values()].reduce(addTokens, NO_TOKENS) : null
	};
}
/**
* Codex session log (JSONL): a session_meta line with the cwd and start time, turn_context lines with
* the model, then token_count events whose `total_token_usage` is the running total.
*/
function codexSessionReader() {
	const out = { usage: null };
	let model;
	return {
		line: (line) => {
			if (!line.includes("\"session_meta\"") && !line.includes("\"model\"") && !line.includes("\"token_count\"")) return;
			try {
				const d = JSON.parse(line);
				const p = d.payload ?? {};
				if (d.type === "session_meta") {
					out.cwd = typeof p.cwd === "string" ? p.cwd : out.cwd;
					const t = Date.parse(String(p.timestamp ?? d.timestamp ?? ""));
					if (!Number.isNaN(t)) out.startedAt = t;
				}
				if (typeof p.model === "string") model = p.model;
				const total = p.type === "token_count" ? p.info?.total_token_usage : void 0;
				if (total) {
					const cached = total.cached_input_tokens ?? 0;
					out.usage = priced({
						input: Math.max(0, (total.input_tokens ?? 0) - cached),
						output: (total.output_tokens ?? 0) + (total.reasoning_output_tokens ?? 0),
						cacheRead: cached,
						cacheWrite: 0
					}, model);
				}
			} catch {}
		},
		result: () => ({ ...out })
	};
}
// cli/src/usage.ts
var TIMESTAMP = /"timestamp"\s*:\s*"([^"]+)"/;
async function streamLines(path, each) {
	const rl = createInterface$1({
		input: createReadStream(path, { encoding: "utf8" }),
		crlfDelay: Infinity
	});
	for await (const line of rl) if (line.trim()) each(line);
}
async function jsonlFiles(dir, depth, since) {
	const out = [];
	for (const e of await promises.readdir(dir, { withFileTypes: true }).catch(() => [])) {
		const p = join(dir, e.name);
		if (e.isDirectory() && depth > 0) out.push(...await jsonlFiles(p, depth - 1, since));
		else if (e.isFile() && e.name.endsWith(".jsonl")) {
			const st = await promises.stat(p).catch(() => null);
			if (st && st.mtimeMs >= since) out.push(p);
		}
	}
	return out;
}
/** Claude Code: only the messages written in the period count, so a session that spans days is split. */
async function claudeUsage(since, env = process.env) {
	const dir = join(env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects");
	let total = NO_TOKENS;
	let sessions = 0;
	for (const f of await jsonlFiles(dir, 1, since)) {
		const reader = claudeTranscriptReader();
		await streamLines(f, (line) => {
			const t = Date.parse(TIMESTAMP.exec(line)?.[1] ?? "");
			if (!Number.isNaN(t) && t >= since) reader.line(line);
		});
		const u = reader.result();
		if (u) {
			total = addTokens(total, u);
			sessions++;
		}
	}
	return {
		agent: "Claude Code",
		sessions,
		usage: total
	};
}
/** Codex logs a running total per session, so a session counts whole when it started in the period. */
async function codexUsage(since, env = process.env) {
	const dir = join(env.CODEX_HOME || join(homedir(), ".codex"), "sessions");
	let total = NO_TOKENS;
	let sessions = 0;
	for (const f of await jsonlFiles(dir, 3, since)) {
		const reader = codexSessionReader();
		await streamLines(f, (line) => reader.line(line));
		const s = reader.result();
		if (s.usage && (s.startedAt ?? 0) >= since) {
			total = addTokens(total, s.usage);
			sessions++;
		}
	}
	return {
		agent: "Codex",
		sessions,
		usage: total
	};
}
/** Midnight today, or the Monday of this week, in local time. */
function periodStart(week, now = /* @__PURE__ */ new Date()) {
	const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	if (week) d.setDate(d.getDate() - (d.getDay() + 6) % 7);
	return d.getTime();
}
var n = (x) => x >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : x >= 1e3 ? `${(x / 1e3).toFixed(1)}k` : String(x);
function usageTable(rows, label) {
	const head = [
		"Agent",
		"Sessions",
		"Input",
		"Output",
		"Cache read",
		"Cache write",
		"Est. cost"
	];
	const body = rows.map((r) => [
		r.agent,
		String(r.sessions),
		n(r.usage.input),
		n(r.usage.output),
		n(r.usage.cacheRead),
		n(r.usage.cacheWrite),
		`$${r.usage.cost.toFixed(2)}`
	]);
	const widths = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
	const line = (cells) => cells.map((c, i) => i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i])).join("  ");
	const unpriced = rows.reduce((a, r) => a + r.usage.unpriced, 0);
	const total = rows.reduce((a, r) => a + tokenTotal(r.usage), 0);
	return [
		`Token usage ${label}, from the agents' local logs`,
		"",
		line(head),
		...body.map(line),
		"",
		`${n(total)} tokens. Cost is an estimate at API list prices (checked ${PRICES_CHECKED}); a subscription bills differently.`,
		...unpriced ? [`${n(unpriced)} tokens are from models without a known price and aren't in the cost.`] : []
	].join("\n");
}
// cli/src/main.ts
var USAGE = `sldev ${VERSION}: run coding agents side by side in your terminal

  sldev                         attach: every agent, its status, and its screen
                                (Ctrl-b w workflows, e editor, v changed files in the editor)
  sldev new [options] "brief"   start an agent in a new pane (prints its id)
      --agent <id>              claude, codex, cursor, copilot, opencode, gemini (default claude)
      --kind <kind>             frame the brief as a mission kind (build, research, plan, review…)
      --worktree <branch>       run in a new git worktree; --here keeps it in this folder
      --title, --model, --mode, --effort
      --failover <a,b>          continue on these agents when this one hits its usage limit
      --print                   the agent does the task and exits, no questions (its exit means done)
      --repeat <n>              run the brief n times, each pass building on the last (0: until a pass
                                changes nothing); every pass is committed in the loop's worktree
        --gap <30m>             wait this long after a pass is over before the next (s, m, h)
        --check "<cmd>"         run after each pass; a failure goes to the next pass, two stop the loop
        --accept                passes are interactive and end on sldev accept, not on the agent's exit
        --keep-going            don't stop when a pass changes nothing
  sldev ls [--json]             panes with agent, status and branch
  sldev send <pane> "text"      type into a pane (Enter included; --no-enter to leave it out)
  sldev read <pane> [--lines n] the pane's screen as text
  sldev wait [<pane>] --for ready|needs-you|done|idle [--timeout s]
  sldev review <pane> --agent <id>   a second agent reviews that pane's changes, read-only
  sldev accept <pane>           a pass that waits for you is good: stop it, the loop goes on
  sldev loops [--json]          repeat loops: their passes and what's next
  sldev loops stop <loop>       no pass after the running one
  sldev open <pane> [--diff]    the pane's folder in your editor; --diff: its changed files side by side
      --editor <id>             cursor, vscode, windsurf, zed, sublime, idea, nvim… (default: the app's
                                preferred editor, else the first one found)
  sldev workflows [--json]      the repo's latest GitHub Actions runs (needs the GitHub CLI, signed in)
  sldev clean                   finished panes leave the list and their worktrees are removed (asks first)
      --orphans                 also sldev worktrees no pane knows about (never ones the app uses)
      --discard                 remove worktrees with uncommitted files too
      --branches                delete their branches when every commit is on the base
      --dry-run, --yes          only show the plan / don't ask
  sldev kill <pane>             stop a pane's agent (its files stay)
  sldev stop                    stop the daemon and every agent in it

  sldev rules [status|init|sync [--overwrite <ids>]]   one .sldev/rules.md for every agent
  sldev remember "note" [--files a,b]                  add a line to .sldev/memory.md
  sldev recall [topic] [--path <file>]                 search the project's memory and docs
  sldev memory                                         where the memory is, how big
  sldev usage [--week]                                 tokens and estimated cost, from local logs
  sldev agents | sldev kinds                           what's installed, what kinds exist

Panes run in a background daemon (sldev serve), so they keep going when you detach.
Nothing here talks to the network, except the workflows view, which asks GitHub through your gh.`;
var script = () => resolve(process.argv[1] ?? "");
function fail(msg) {
	process.stderr.write(`sldev: ${msg}\n`);
	process.exit(1);
}
function paneLine(p) {
	const sig = missionSignal(p.status);
	const where = p.worktree ? p.worktree.branch : "in place";
	const stats = p.stats ? `  ${p.stats.files} files +${p.stats.insertions} -${p.stats.deletions}` : "";
	return `${p.id.padStart(3)}  ${p.agentName.padEnd(14)} ${sig.label.padEnd(13)} ${where.padEnd(24)} ${p.title}${stats}${p.notification ? `\n     ${p.notification}` : ""}`;
}
function loopLine(l) {
	const passes = l.progress.passes.map((p) => `${p.n}:${passSignal(p.outcome).label.toLowerCase()} (pane ${p.mission})`).join(", ");
	return `${l.id.padStart(3)}  ${l.name}\n     ${describeRepeat(l.plan)}\n     ${l.label}${l.stopping && l.progress.state !== "finished" ? " (stops after this pass)" : ""}${passes ? `\n     passes: ${passes}` : ""}`;
}
/** --repeat and its options as a plan; undefined without --repeat. */
function repeatPlan(v) {
	if (v.repeat === void 0) {
		if (v.gap !== void 0 || v.check !== void 0 || v.accept || v["keep-going"]) fail("--gap, --check, --accept and --keep-going go with --repeat <n>");
		return;
	}
	const times = Number(v.repeat);
	if (!Number.isInteger(times) || times < 0 || times > 50) fail("--repeat takes a number of passes from 0 (until nothing changes) to 50");
	const gapMinutes = v.gap === void 0 ? 0 : parseGap(v.gap);
	if (gapMinutes === void 0) fail(`--gap "${v.gap}" isn't a duration; try 30s, 10m or 1h`);
	return {
		times,
		gapMinutes,
		check: v.check?.trim() || void 0,
		doneWhen: v.accept ? "accept" : "exit",
		keepGoingUnchanged: v["keep-going"] || void 0
	};
}
var list = (v) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
async function main(argv) {
	const [cmd, ...rest] = argv;
	const data = dataDir();
	const client = () => connect({
		dataDir: data,
		script: script()
	});
	const opts = (options) => parseArgs({
		args: rest,
		options,
		allowPositionals: true,
		strict: true
	});
	switch (cmd) {
		case void 0:
			if (!process.stdout.isTTY || !process.stdin.isTTY) return fail("attaching needs a terminal; see sldev help");
			return runTui(await client(), process.cwd(), void 0, defaultServices(() => preferredEditor(data)));
		case "help":
		case "-h":
		case "--help":
			console.log(USAGE);
			return;
		case "-v":
		case "--version":
		case "version":
			console.log(VERSION);
			return;
		case "serve": {
			const d = await startDaemon({ dataDir: data });
			console.log(`sldev ${VERSION} serving on ${d.socket}`);
			const stop = () => void d.close().then(() => process.exit(0));
			process.on("SIGTERM", stop);
			process.on("SIGINT", stop);
			return;
		}
		case "new": {
			const { values, positionals } = opts({
				agent: { type: "string" },
				kind: { type: "string" },
				worktree: { type: "string" },
				here: { type: "boolean" },
				title: { type: "string" },
				model: { type: "string" },
				mode: { type: "string" },
				effort: { type: "string" },
				failover: { type: "string" },
				cwd: { type: "string" },
				print: { type: "boolean" },
				repeat: { type: "string" },
				gap: { type: "string" },
				check: { type: "string" },
				accept: { type: "boolean" },
				"keep-going": { type: "boolean" }
			});
			const brief = positionals.join(" ");
			const repeat = repeatPlan(values);
			const c = await client();
			const p = await c.request("new", {
				agent: values.agent,
				brief,
				title: values.title,
				kind: values.kind,
				worktree: values.here ? false : values.worktree,
				cwd: resolve(values.cwd ?? process.cwd()),
				model: values.model,
				mode: values.mode,
				effort: values.effort,
				failover: values.failover !== void 0 ? list(values.failover) : void 0,
				print: values.print,
				repeat,
				cols: process.stdout.columns,
				rows: process.stdout.rows
			});
			c.close();
			if (repeat) process.stderr.write(`loop ${p.repeat?.loop}: ${describeRepeat(repeat)}; pass 1 is pane ${p.id}\n`);
			console.log(p.id);
			return;
		}
		case "open": {
			const { values, positionals } = opts({
				diff: { type: "boolean" },
				editor: { type: "string" }
			});
			if (!positionals[0]) return fail("sldev open <pane> [--diff] [--editor <id>]");
			const c = await client();
			const p = (await c.request("ls", {})).find((x) => x.id === positionals[0] || x.title === positionals[0]);
			c.close();
			if (!p) return fail(`No pane "${positionals[0]}". See sldev ls.`);
			const r = await openPane(p, {
				diff: values.diff,
				editor: values.editor,
				preferred: preferredEditor(data)
			});
			console.log(r.note);
			if (r.terminal) runTerminalEditor(r.terminal, p.cwd);
			return;
		}
		case "workflows": {
			const { values } = opts({ json: { type: "boolean" } });
			const runs = await loadRuns(process.cwd());
			if (values.json) return void console.log(JSON.stringify(runs, null, 2));
			if (!runs.length) return void console.log("No workflow runs yet in this repository.");
			console.log(runs.slice(0, 20).map((r) => {
				const col = runColumns(r);
				return `${String(r.databaseId).padStart(12)}  ${col.label.padEnd(9)} ${col.text}`;
			}).join("\n"));
			return;
		}
		case "clean": {
			const { values } = opts({
				orphans: { type: "boolean" },
				discard: { type: "boolean" },
				branches: { type: "boolean" },
				"dry-run": { type: "boolean" },
				yes: { type: "boolean" }
			});
			const c = await connect({
				dataDir: data,
				script: script(),
				start: false
			}).catch(() => null);
			const [panes, loopList] = c ? await Promise.all([c.request("ls", {}), c.request("loops", {})]) : [[], []];
			const o = {
				orphans: values.orphans,
				discard: values.discard,
				branches: values.branches,
				repo: await projectRoot(process.cwd()),
				dataDir: data
			};
			const items = await planClean(panes, loopList, o);
			if (!items.length) {
				c?.close();
				console.log(values.orphans ? "Nothing to clean: no finished panes, and no sldev worktrees nobody uses." : "Nothing to clean: no finished panes. --orphans also looks for sldev worktrees no pane knows about.");
				return;
			}
			console.log(describeClean(items).join("\n"));
			const doing = items.filter((i) => !i.keep);
			if (!doing.length || values["dry-run"]) return void c?.close();
			if (!values.yes) {
				if (!process.stdin.isTTY) {
					c?.close();
					return fail("nothing removed: pass --yes to clean without asking");
				}
				const rl = createInterface({
					input: process.stdin,
					output: process.stdout
				});
				const answer = await rl.question(`Remove ${doing.filter((i) => i.worktree).length} worktree(s) and ${doing.filter((i) => i.pane).length} pane(s) from the list? (y/N) `);
				rl.close();
				if (!/^y/i.test(answer.trim())) {
					c?.close();
					console.log("Nothing removed.");
					return;
				}
			}
			const problems = await runClean(items, o, async (id) => void await c?.request("kill", { pane: id }));
			c?.close();
			if (problems.length) return fail(`some things stayed:\n${problems.map((p) => `  ${p}`).join("\n")}`);
			console.log("Cleaned.");
			return;
		}
		case "accept": {
			if (!rest[0]) return fail("sldev accept <pane>");
			const c = await client();
			await c.request("accept", { pane: rest[0] });
			return c.close();
		}
		case "loops": {
			const { values, positionals } = opts({ json: { type: "boolean" } });
			const c = await client();
			if (positionals[0] === "stop") {
				if (!positionals[1]) return fail("sldev loops stop <loop>");
				const l = await c.request("loop-stop", { loop: positionals[1] });
				c.close();
				console.log(loopLine(l));
				return;
			}
			const all = await c.request("loops", {});
			c.close();
			if (values.json) return void console.log(JSON.stringify(all, null, 2));
			console.log(all.length ? all.map(loopLine).join("\n") : "No loops. Start one with sldev new --repeat 3 \"…\"");
			return;
		}
		case "ls": {
			const { values } = opts({ json: { type: "boolean" } });
			const c = await client();
			const panes = await c.request("ls", {});
			c.close();
			if (values.json) return void console.log(JSON.stringify(panes, null, 2));
			console.log(panes.length ? panes.map(paneLine).join("\n") : "No panes. Start one with sldev new --agent claude \"…\"");
			return;
		}
		case "send": {
			const { values, positionals } = opts({ "no-enter": { type: "boolean" } });
			const [pane, ...text] = positionals;
			if (!pane || !text.length) return fail("sldev send <pane> \"text\"");
			const c = await client();
			await c.request("send", {
				pane,
				text: text.join(" "),
				enter: !values["no-enter"]
			});
			return c.close();
		}
		case "read": {
			const { values, positionals } = opts({ lines: { type: "string" } });
			if (!positionals[0]) return fail("sldev read <pane>");
			const c = await client();
			const { text } = await c.request("read", {
				pane: positionals[0],
				lines: values.lines ? Number(values.lines) : void 0
			});
			c.close();
			console.log(text);
			return;
		}
		case "wait": {
			const { values, positionals } = opts({
				for: { type: "string" },
				timeout: { type: "string" },
				json: { type: "boolean" }
			});
			const c = await client();
			const p = await c.request("wait", {
				pane: positionals[0],
				for: values.for ?? "idle",
				timeout: values.timeout ? Number(values.timeout) : void 0
			});
			c.close();
			if (!p) return fail("timed out");
			console.log(values.json ? JSON.stringify(p, null, 2) : paneLine(p));
			return;
		}
		case "review": {
			const { values, positionals } = opts({ agent: { type: "string" } });
			if (!positionals[0] || !values.agent) return fail("sldev review <pane> --agent <id>");
			const c = await client();
			const p = await c.request("review", {
				pane: positionals[0],
				agent: values.agent
			});
			c.close();
			console.log(p.id);
			return;
		}
		case "kill": {
			if (!rest[0]) return fail("sldev kill <pane>");
			const c = await client();
			await c.request("kill", { pane: rest[0] });
			return c.close();
		}
		case "stop": {
			const c = await connect({
				dataDir: data,
				script: script(),
				start: false
			}).catch(() => null);
			if (!c) return void console.log("sldev is not running");
			await c.request("stop", {});
			return c.close();
		}
		case "rules": {
			const { values, positionals } = opts({ overwrite: { type: "string" } });
			const root = await projectRoot(process.cwd());
			const sub = positionals[0] ?? "status";
			if (sub === "status") return void console.log(await rulesStatus(root));
			if (sub === "init") return void console.log(await rulesInit(root));
			if (sub === "sync") return void console.log(await rulesSync(root, list(values.overwrite)));
			return fail("sldev rules [status|init|sync]");
		}
		case "remember": {
			const { values, positionals } = opts({ files: { type: "string" } });
			if (!positionals.length) return fail("sldev remember \"note\"");
			console.log(await rememberNote(await projectRoot(process.cwd()), positionals.join(" "), list(values.files)));
			return;
		}
		case "recall": {
			const { values, positionals } = opts({ path: { type: "string" } });
			console.log(await recallNotes(data, await projectRoot(process.cwd()), positionals.join(" "), values.path));
			return;
		}
		case "memory":
			console.log(await memorySummary(await projectRoot(process.cwd())));
			return;
		case "usage": {
			const { values } = opts({ week: { type: "boolean" } });
			const since = periodStart(!!values.week);
			const rows = await Promise.all([claudeUsage(since), codexUsage(since)]);
			console.log(usageTable(rows, values.week ? "this week" : "today"));
			return;
		}
		case "agents": {
			const agents = allAgents();
			setInstalledBins(agents.flatMap((a) => [a.bin, ...a.aliases ?? []]).filter((b) => findOnPath(b, process.env)));
			console.log(agents.map((a) => `${a.id.padEnd(10)} ${a.name.padEnd(16)} ${installedBin(a) ? "installed" : `not installed${a.install ? `: ${a.install}` : ""}`}`).join("\n"));
			return;
		}
		case "kinds": {
			const kinds = [...BUILTIN_KINDS, ...await listKinds(await projectRoot(process.cwd()), data)];
			console.log(kinds.map((k) => `${k.id.padEnd(14)} ${k.readOnly ? "read-only " : ""}${k.description}`).join("\n"));
			return;
		}
	}
	fail(`unknown command "${cmd}"; see sldev help`);
}
main(process.argv.slice(2)).catch((err) => fail(err.message));
export {};
