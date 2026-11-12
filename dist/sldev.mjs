#!/usr/bin/env node
import path, { basename, delimiter, dirname, isAbsolute, join, posix, relative, resolve, win32 } from "path";
import { parseArgs } from "util";
import { parse } from "yaml";
import { appendFileSync, chmodSync, closeSync, constants, createReadStream, existsSync, fstatSync, mkdirSync, openSync, promises, readFileSync, readSync, readdirSync, statSync, unlinkSync, writeFileSync } from "fs";
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
var SKILL_DIRS$1 = [
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
/** Reads an eval file. Errors say what's wrong in words the file's author can fix. */
function parseEval(text, path) {
	let raw;
	try {
		raw = parse(text);
	} catch (e) {
		return { error: `Not valid YAML: ${e.message.split("\n")[0]}` };
	}
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "An eval is a YAML mapping with name, brief and checks" };
	const r = raw;
	const name = typeof r.name === "string" ? r.name.trim() : "";
	const brief = typeof r.brief === "string" ? r.brief.trim() : "";
	if (!name) return { error: "name is missing" };
	if (!brief) return { error: "brief is missing: what the agent is asked to do" };
	if (!Array.isArray(r.checks) || !r.checks.length) return { error: "checks is missing: at least one way to tell a good result from a bad one" };
	const checks = [];
	for (const [n, c] of r.checks.entries()) {
		const at = `check ${n + 1}`;
		if (typeof c === "string") {
			checks.push({
				type: "run",
				command: c
			});
			continue;
		}
		if (!c || typeof c !== "object") return { error: `${at}: use run, diff or judge` };
		const o = c;
		if (typeof o.run === "string" && o.run.trim()) checks.push({
			type: "run",
			command: o.run.trim(),
			expect: o.expect === void 0 ? void 0 : String(o.expect)
		});
		else if (o.diff !== void 0) {
			const max = typeof o.diff === "number" ? o.diff : Number(o.diff?.max_lines);
			if (!Number.isFinite(max) || max <= 0) return { error: `${at}: diff takes the most changed lines allowed, e.g. diff: 80` };
			checks.push({
				type: "diff",
				maxLines: Math.round(max)
			});
		} else if (typeof o.judge === "string" && o.judge.trim()) checks.push({
			type: "judge",
			rubric: o.judge.trim()
		});
		else return { error: `${at}: use run (a command), diff (most changed lines) or judge (a rubric)` };
	}
	const timeout = r.timeout === void 0 ? 20 : Number(r.timeout);
	if (!Number.isFinite(timeout) || timeout <= 0) return { error: "timeout is in minutes, e.g. timeout: 20" };
	const str = (v) => typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : void 0;
	return { spec: {
		name,
		description: str(r.description),
		brief,
		base: str(r.base),
		setup: str(r.setup),
		timeout,
		checks,
		path
	} };
}
// src/shared/lead.ts
/** The Lead kind's working method, appended to its goal (see the 'lead' mission kind). */
var LEAD_METHOD = [
	"You are the Lead: you plan and coordinate, other agents write the code. Do not edit files yourself, except to resolve a merge conflict.",
	"How to work:",
	"1. Read enough of the code to plan. Split the goal into independent tasks of one pull request each, with acceptance criteria.",
	"2. Start each with sldev_delegate (agent \"auto\" picks the best agent from this project's evals; or name one). Workers run in parallel in their own branches, made from yours.",
	"3. Call sldev_wait to get their reports. Review every diff with sldev_mission_diff against the criteria. If it falls short, send it back with sldev_followup and say exactly what to fix.",
	"4. Merge good work into your branch with sldev_integrate (give it the test command), in an order that builds up. Later workers start from what you integrated.",
	"5. When everything is in, end with a summary for the human: what was built, by whom, what was checked, and what is left. Do not push: the human reviews your branch.",
	"Tell the user your plan before you delegate when the goal is ambiguous."
].join("\n");
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
		id: "lead",
		name: "Lead",
		description: "Plans a big goal and delegates the parts to other agents in parallel, reviews and merges their work. Needs the sldev tools (Claude Code, Codex).",
		worktree: true,
		readOnly: false,
		placeholder: "e.g. Teams: users create a team, invite people by email, share projects with it, and owners remove members",
		scope: "builtin",
		template: [
			"Lead: {title}",
			"{brief}",
			"{criteria}",
			LEAD_METHOD
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
// cli/src/version.ts
/** Kept equal to cli/package.json (a test checks it), so the bundle needs no JSON import. */
var VERSION = "0.4.0";
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
	/**
	* A request and its reply. With `timeoutMs` a daemon that never answers is an error instead of a wait
	* forever: a daemon left running from an older sldev ignored commands it didn't know, and the TUI hung.
	*/
	request(cmd, args, timeoutMs) {
		const id = ++this.seq;
		return new Promise((resolve, reject) => {
			const timer = timeoutMs ? setTimeout(() => {
				if (!this.pending.delete(id)) return;
				reject(/* @__PURE__ */ new Error(`The sldev daemon didn't answer "${cmd}"; sldev stop, then try again`));
			}, timeoutMs) : void 0;
			const done = (fn) => (v) => (clearTimeout(timer), fn(v));
			this.pending.set(id, {
				resolve: done(resolve),
				reject: done(reject)
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
/** how long a quick request (the version check, ls, stop) may take before the daemon counts as stuck */
var QUICK_MS = 3e3;
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Polls until nothing answers on the socket any more; false if something still does after `ms`. */
async function gone(socket, ms) {
	for (let t = 0; t < ms; t += 100) {
		const c = await tryConnect(socket);
		if (!c) return true;
		c.close();
		await sleep(100);
	}
	return false;
}
/**
* The daemon on the socket must be this sldev's version. One left running by an older install answers what
* it knew (ls, attach) and stays silent on anything newer, so after an upgrade `sldev` hung on a blank
* screen. A stale daemon with nothing running in it is stopped and replaced; one with live panes is left
* alone (stopping it would kill agents mid-work), and the error says how to restart it.
*/
async function checkVersion(c, socket) {
	const info = await c.request("ping", {}, QUICK_MS).catch(() => null);
	if (info?.version === "0.4.0") return { ok: true };
	const was = info?.version ? `sldev ${info.version}` : "an older sldev";
	const live = (await c.request("ls", {}, QUICK_MS).catch(() => [])).filter((p) => p.pid !== void 0);
	if (live.length) {
		c.close();
		throw new Error(`the background daemon is from ${was} and still runs ${live.length} pane${live.length === 1 ? "" : "s"} (${live.map((p) => `${p.id} ${p.title}`).join(", ")}). This is sldev ${VERSION}. Let them finish, then run "sldev stop" (it ends them) and "sldev" again.`);
	}
	await c.request("stop", {}, QUICK_MS).catch(() => void 0);
	c.close();
	if (!await gone(socket, 3e3) && info?.pid) {
		try {
			process.kill(info.pid, "SIGTERM");
		} catch {}
		await gone(socket, 2e3);
	}
	return {
		ok: false,
		was
	};
}
/**
* Connects to the daemon, starting it in the background first when it isn't running (`sldev serve`,
* detached, logging to <data>/cli/daemon.log). `script` is this CLI's entry file. A daemon of another
* version is replaced first (see checkVersion); `check: false` skips that, for `sldev stop`.
*/
async function connect(o) {
	const dir = cliDir(o.dataDir);
	const socket = socketPath(dir);
	const c = await tryConnect(socket);
	if (c) {
		if (o.check === false) return c;
		const v = await checkVersion(c, socket);
		if (v.ok) return c;
		o.onRestart?.(v.was);
	}
	if (o.start === false) throw new Error("sldev is not running");
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
		name: "sldev_board",
		description: "The project's work board in sldev-io: cards with their number, column (backlog, proposed, ready, progress, review, done), priority, labels and title. Check it before filing a card, so you don't add one that is already there.",
		inputSchema: {
			type: "object",
			properties: { column: {
				type: "string",
				enum: [
					"backlog",
					"proposed",
					"ready",
					"progress",
					"review",
					"done"
				],
				description: "Only this column"
			} }
		}
	},
	{
		name: "sldev_board_add",
		description: "File a story on the work board: follow-up work you found but should not do now (a bug, a missing test, a refactor), or a story you were asked to write. It goes to Proposed, where a person approves it before an agent picks it up. One card per piece of work.",
		inputSchema: {
			type: "object",
			properties: {
				title: {
					type: "string",
					description: "What needs doing, under 100 characters"
				},
				details: {
					type: "string",
					description: "Markdown: why, what to do (files), acceptance criteria, how to check"
				},
				labels: {
					type: "array",
					items: { type: "string" },
					description: "e.g. bug, tests, refactor"
				},
				priority: {
					type: "string",
					enum: [
						"high",
						"normal",
						"low"
					]
				},
				after: {
					type: "array",
					items: { type: ["string", "number"] },
					description: "Only when it cannot start before other work is done: card numbers, or the titles of stories you filed before this one. Agents pick it up once those are Done."
				}
			},
			required: ["title"]
		}
	},
	{
		name: "sldev_board_update",
		description: "Rewrite a card on the work board you were asked to refine (by its number), as a well-defined story. Only cards in Backlog or Proposed can be changed; the card goes to Proposed for the user to approve.",
		inputSchema: {
			type: "object",
			properties: {
				key: {
					type: "number",
					description: "The card number, e.g. 12 for #12"
				},
				title: {
					type: "string",
					description: "What needs doing, under 100 characters"
				},
				details: {
					type: "string",
					description: "Markdown: why, what to do (files), acceptance criteria, how to check"
				},
				labels: {
					type: "array",
					items: { type: "string" }
				},
				priority: {
					type: "string",
					enum: [
						"high",
						"normal",
						"low"
					]
				},
				after: {
					type: "array",
					items: { type: ["string", "number"] },
					description: "Card numbers or story titles this one waits for"
				}
			},
			required: ["key", "title"]
		}
	},
	{
		name: "sldev_delegate",
		description: "Lead missions only: start another agent on one task, in its own worktree branched from yours. It runs unattended and reports back; collect the result with sldev_wait. Give it everything it needs: the task, the files, and acceptance criteria.",
		inputSchema: {
			type: "object",
			properties: {
				title: {
					type: "string",
					description: "The task in a few words, e.g. \"Team invites by email\""
				},
				brief: {
					type: "string",
					description: "What to do, where, and any constraints"
				},
				criteria: {
					type: "string",
					description: "Acceptance criteria, one per line"
				},
				agent: {
					type: "string",
					description: "auto (best on this project's evals, the default), or claude, codex, gemini, …"
				},
				kind: {
					type: "string",
					enum: [
						"build",
						"investigate",
						"research",
						"review"
					],
					description: "build (default) changes code; the others read and report"
				}
			},
			required: ["title", "brief"]
		}
	},
	{
		name: "sldev_wait",
		description: "Lead missions only: wait for your workers to finish (up to 45 seconds per call) and get their reports. Without ids, waits for any worker you have not heard back from. Call it again while some are still running.",
		inputSchema: {
			type: "object",
			properties: {
				ids: {
					type: "array",
					items: { type: "string" },
					description: "Worker ids from sldev_delegate"
				},
				seconds: {
					type: "number",
					description: "At most 45"
				}
			}
		}
	},
	{
		name: "sldev_followup",
		description: "Lead missions only: send a finished worker back with feedback (what is wrong, what to change). It continues in the same branch; wait for it again with sldev_wait.",
		inputSchema: {
			type: "object",
			properties: {
				id: { type: "string" },
				message: { type: "string" }
			},
			required: ["id", "message"]
		}
	},
	{
		name: "sldev_integrate",
		description: "Lead missions only: merge finished workers' branches into your branch, in the order given, then optionally run a check command (e.g. npm test). Stops at the first merge conflict and tells you which files; resolve them in your folder, commit, and call it again.",
		inputSchema: {
			type: "object",
			properties: {
				ids: {
					type: "array",
					items: { type: "string" }
				},
				check: {
					type: "string",
					description: "A command to run after merging, e.g. npm test"
				}
			},
			required: ["ids"]
		}
	},
	{
		name: "sldev_rules",
		description: "The project's agent rules (.sldev/rules.md, or AGENTS.md when there is none).",
		inputSchema: {
			type: "object",
			properties: {}
		}
	},
	{
		name: "sldev_check",
		description: "Check a file you wrote with an sldev skill (a mission or stories draft in .sldev/drafts, a recipe in .sldev/factory, an eval in .sldev/evals) the way sldev-io will read it. Call it before you say the draft is done, and fix what it reports: the app sets a file it cannot read aside and the user never sees it.",
		inputSchema: {
			type: "object",
			properties: { path: {
				type: "string",
				description: "The file, absolute or relative to your working folder"
			} },
			required: ["path"]
		}
	}
])}
// tools that wait for workers or run their checks
const LONG = ['sldev_wait', 'sldev_integrate', 'sldev_delegate']
const at = process.argv.indexOf('--mission')
const mission = at > 0 ? process.argv[at + 1] : ''
let endpoint = null
try { endpoint = JSON.parse(fs.readFileSync(path.join(__dirname, 'mcp-endpoint.json'), 'utf8')) } catch {}

function call(tool, args) {
  return new Promise((resolve) => {
    if (!endpoint) return resolve({ error: 'sldev-io is not running' })
    const body = JSON.stringify({ mission, tool, args, cwd: process.cwd() })
    const req = http.request({ host: '127.0.0.1', port: endpoint.port, path: '/mcp', method: 'POST', timeout: LONG.includes(tool) ? 180000 : 20000,
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
// src/shared/board.ts
var BOARD_COLUMNS = [
	{
		id: "backlog",
		title: "Backlog",
		hint: "Ideas and work that isn’t ready for an agent yet."
	},
	{
		id: "proposed",
		title: "Proposed",
		hint: "Stories an agent wrote or refined. Read them, edit if you like, and approve them for the agents."
	},
	{
		id: "ready",
		title: "Agent ready",
		hint: "Clear enough for an agent. Pick-up takes these, highest priority first."
	},
	{
		id: "progress",
		title: "In progress",
		hint: "An agent is on it. Each card shows how its run is going."
	},
	{
		id: "review",
		title: "Review",
		hint: "The agent is done: review the diff or the pull request."
	},
	{
		id: "done",
		title: "Done",
		hint: "Reviewed and merged. Drag a card here when you’re happy with it."
	}
];
/** A column's cards, top to bottom. */
function columnItems(items, column) {
	return items.filter((i) => i.column === column).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}
/** "bug, UI ,  bug" → ["bug", "ui"] */
function parseLabels(text) {
	return [...new Set(text.split(/[,\n]/).map((l) => l.trim().toLowerCase().replace(/\s+/g, "-")).filter(Boolean))].slice(0, 8);
}
/** The board as text for an agent (the sldev_board tool): one line per card, by column. */
function boardCardLines(items, column) {
	const lines = [];
	for (const c of BOARD_COLUMNS) {
		if (column && c.id !== column) continue;
		for (const i of columnItems(items, c.id)) {
			const meta = [
				c.id,
				i.priority !== "normal" && i.priority,
				i.labels.length && i.labels.join(","),
				i.blockedBy?.length && `after ${i.blockedBy.map((k) => `#${k}`).join(",")}`
			].filter(Boolean).join(" · ");
			lines.push(`#${i.key} [${meta}] ${i.title}`);
		}
	}
	return lines.length ? lines.join("\n") : column ? `No cards in ${column}.` : "The board is empty.";
}
var STORY_SHAPE = [
	"Each story is one piece of work for one coding agent in one session (one pull request), independent of the others where it can be. Give each:",
	"- a title: imperative, under 80 characters (\"Add rate limiting to /api/login\")",
	"- details in Markdown with these parts: **Why** (one or two lines), **What to do** (the files and functions likely to change), **Acceptance criteria** (a checklist anyone can verify), **How to check** (the tests or commands to run)",
	"- labels: one to three, lowercase, e.g. feature, bug, tests, ui, api, refactor, docs",
	"- a priority: high, normal or low",
	"- after: only when it can't start before another story is done, that story's title (or a card number like 12); agents pick it up once those are Done"
].join("\n");
var PRIORITIES = [
	"high",
	"normal",
	"low"
];
/** One story from loose input (a tool call, a JSON object), or null without a title. */
function storyDraft(v) {
	const title = typeof v.title === "string" ? v.title.trim().slice(0, 120) : "";
	if (!title) return null;
	const labels = parseLabels(Array.isArray(v.labels) ? v.labels.filter((l) => typeof l === "string").join(",") : typeof v.labels === "string" ? v.labels : "");
	const priority = PRIORITIES.includes(v.priority) ? v.priority : "normal";
	const after = (Array.isArray(v.after) ? v.after : v.after === void 0 || v.after === null || v.after === "" ? [] : [v.after]).map((x) => typeof x === "number" ? x : typeof x === "string" ? /^#?\d+$/.test(x.trim()) ? Number(x.trim().replace("#", "")) : x.trim() : null).filter((x) => x !== null && x !== "" && x !== 0).slice(0, 8);
	return {
		title,
		details: typeof v.details === "string" ? v.details.trim().slice(0, 6e3) : "",
		labels,
		priority,
		...after.length ? { after } : {}
	};
}
/** The stories in a file or a reply: a JSON array, or the last ```stories (or ```json) block holding one. */
function parseStories(text) {
	const blocks = [text.trim(), ...[...text.matchAll(/```(?:stories|json)[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1])];
	for (const b of blocks.reverse()) try {
		const v = JSON.parse(b);
		if (!Array.isArray(v)) continue;
		const stories = v.map((x) => x && typeof x === "object" ? storyDraft(x) : null).filter((x) => !!x);
		if (stories.length) return stories.slice(0, 30);
	} catch {}
	return [];
}
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
	for (const dir of SKILL_DIRS$1) {
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
async function read$2(root, rel) {
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
		const text = await read$2(root, s.rel);
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
			const content = file && file.size <= MAX_PINNED_BYTES ? await read$2(root, p.path) : null;
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
// src/shared/factory.ts
var list$1 = (v) => v === void 0 || v === null ? [] : (Array.isArray(v) ? v : [v]).map((x) => String(x).trim()).filter(Boolean);
var str$1 = (v) => typeof v === "string" && v.trim() ? v.trim() : void 0;
function parseRecipe(text, path) {
	let doc;
	try {
		doc = parse(text);
	} catch (e) {
		return { error: `YAML: ${e.message.split("\n")[0]}` };
	}
	if (!doc || typeof doc !== "object") return { error: "A recipe is a YAML mapping with name and stages" };
	const name = typeof doc.name === "string" ? doc.name.trim() : "";
	if (!name) return { error: "The recipe needs a name" };
	const stages = doc.stages;
	if (!Array.isArray(stages) || !stages.length) return { error: "The recipe needs at least one stage" };
	const nodes = [];
	for (const [i, raw] of stages.entries()) {
		const s = raw ?? {};
		const id = typeof s.id === "string" && s.id.trim() ? s.id.trim() : `stage-${i + 1}`;
		if (!/^[A-Za-z0-9_-]+$/.test(id)) return { error: `Stage id "${id}": use letters, digits, - and _` };
		if (nodes.some((n) => n.id === id)) return { error: `Two stages are called "${id}"` };
		const agents = list$1(s.agent);
		const run = list$1(s.run);
		const skill = typeof s.skill === "string" && s.skill.trim() ? s.skill.trim().replace(/^\//, "") : void 0;
		const isPr = s.pr !== void 0 && s.pr !== false;
		const promptOnly = !agents.length && !skill && !run.length && !isPr && typeof s.prompt === "string" && !!s.prompt.trim();
		if ([
			agents.length > 0 || !!skill || promptOnly,
			run.length > 0,
			isPr
		].filter(Boolean).length !== 1) return { error: `Stage "${id}": give exactly one of agent (or skill), run or pr` };
		const kind = agents.length || skill || promptOnly ? "agent" : run.length ? "run" : "pr";
		if (kind === "agent" && !skill && (typeof s.prompt !== "string" || !s.prompt.trim())) return { error: `Stage "${id}": an agent stage needs a prompt or a skill` };
		const needs = s.needs === void 0 ? nodes.length ? [nodes[nodes.length - 1].id] : [] : list$1(s.needs);
		for (const n of needs) if (!nodes.some((x) => x.id === n)) return { error: `Stage "${id}" needs "${n}", which isn't defined above it` };
		let onFail;
		if (s.onFail) {
			const f = s.onFail;
			const retry = list$1(f.retry);
			if (!retry.length) return { error: `Stage "${id}": onFail needs retry: <stage>` };
			for (const r of retry) if (!nodes.some((x) => x.id === r)) return { error: `Stage "${id}" retries "${r}", which isn't defined above it` };
			onFail = {
				retry,
				max: Math.max(1, Math.min(10, Number(f.max ?? 2) || 2))
			};
		}
		const pr = s.pr && typeof s.pr === "object" ? s.pr : {};
		nodes.push({
			id,
			kind,
			needs,
			agents,
			skill,
			prompt: typeof s.prompt === "string" && s.prompt.trim() ? s.prompt.trim() : skill ? "{intent}" : "",
			interactive: s.interactive === true,
			model: str$1(s.model),
			effort: str$1(s.effort),
			mode: str$1(s.mode),
			run,
			onFail,
			approve: s.gate === "approve",
			maxDiff: typeof s.maxDiff === "number" && s.maxDiff > 0 ? s.maxDiff : void 0,
			pr: kind === "pr" ? {
				title: typeof pr.title === "string" ? pr.title : "{intent}",
				body: typeof pr.body === "string" ? pr.body : ""
			} : void 0
		});
	}
	return { recipe: {
		name,
		description: typeof doc.description === "string" ? doc.description.trim() : "",
		intake: doc.intake === "issue" ? "issue" : "prompt",
		nodes,
		setup: doc.setup === false || doc.setup === "none" ? false : typeof doc.setup === "string" && doc.setup.trim() ? doc.setup.trim() : void 0,
		path
	} };
}
var DRAFTS_DIR = ".sldev/drafts";
/** where each skill is installed in a project: Claude Code reads .claude/skills, most other agents .agents/skills */
var SKILL_DIRS = [".claude/skills", ".agents/skills"];
var ROOT_LINE = "Write it at the project root (the git top level). If you are in a git worktree, use the main checkout instead: the parent of `git rev-parse --path-format=absolute --git-common-dir`. Create the folder if it is missing.";
var AGENT_IDS = "claude, codex, cursor, copilot, opencode or gemini";
var YAML_RULE = "put any value that contains `: ` or ` #`, or starts with `[ { * & ! | > ' \" % @` or a backtick, in double quotes (`title: \"Fix: the parser\"`)";
var JSON_RULE = "it must be valid JSON: double quotes, no trailing commas, quotes and newlines inside strings written as `\\\"` and `\\n`";
/**
* The step every skill ends with. The app reads a file once and sets one it can't read aside, so an agent
* that reports "done" without checking leaves a draft the user never sees.
*/
var checkStep = (heading, rule) => `${heading}

The app reads the file once, and sets aside one it can't read: the user never sees it. So before you say it's done, check it the way sldev-io reads it:

- With the sldev tools: call \`sldev_check\` with the file's path.
- Otherwise, if the \`sldev\` command is installed: run \`sldev skills check <file>\`.
- Otherwise read the file back yourself: ${rule}.

Fix what the check reports and check again. Say it's done only once it passes; if you couldn't check it, say that.`;
var SLDEV_SKILLS = [
	{
		name: "sldev-mission",
		label: "Draft a mission",
		description: "Draft a mission for sldev-io: a brief, acceptance criteria, a kind and optionally an agent, saved as a draft the user launches from the app. Use when asked to write up, plan or queue a task for an agent, \"make this a mission\", or prepare work for later. It never starts the work.",
		body: `# Draft an sldev mission

sldev-io turns the file you write into a saved mission in its Missions list. A person reads it there and presses Launch. Don't launch anything and don't do the work yourself: your job is a brief another agent can carry out without asking questions.

## 1. Understand the task

Read the code it touches first, so the brief names real files, functions and commands. Ask the user only when the goal itself is unclear.

## 2. Write the draft

One file per mission: \`${DRAFTS_DIR}/mission-<short-slug>.md\`. ${ROOT_LINE}

\`\`\`markdown
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

Add retries to \`uploadFile\` in src/api/upload.ts: up to 3 attempts for 5xx responses and network errors,
waiting 1 s, 2 s and 4 s. Keep the function's signature. Don't add a dependency for this.
\`\`\`

- **title**: imperative, under 60 characters. In double quotes when it contains a colon.
- **kind**: \`build\` (changes code; the default), \`research\` (answers a question, read-only), \`investigate\` (finds a bug's cause, no fix), \`plan\` (writes a plan, no code), \`review\` (reviews changes already made), \`freeform\` (the brief is sent exactly as written).
- **criteria**: what a reviewer checks the change against. Each one observable and checkable; sldev's review shows which are met.
- **agent**: only when the user asked for one: ${AGENT_IDS}. Leave it out for the user's default.
- **worktree**: \`false\` to work in the project folder; by default a build runs in its own git worktree.
- **by**: your own agent id (${AGENT_IDS}), so the user sees who drafted it.

## 3. A good brief

- The outcome first, and why it matters, in a sentence or two.
- Where: the files and functions to change, and existing code to reuse.
- Limits: what not to touch, no new dependencies unless needed, keep public APIs.
- How to check: the tests or commands to run.
- One mission is one change someone can review in one sitting. Split bigger work into several files, or use the sldev-stories skill when the parts depend on each other.

${checkStep("## 4. Check it", `the part between the \`---\` lines is YAML: ${YAML_RULE}, and the brief under it is not empty`)}

## 5. Finish

Say in one line what you drafted and that it is in sldev-io under Missions, ready to launch. The app reads the file (now if it is open, otherwise when it next opens) and removes it from the drafts folder.
`
	},
	{
		name: "sldev-stories",
		label: "Write board stories",
		description: "Write user stories for sldev-io's work board: well-defined cards with acceptance criteria and dependencies, filed into the Proposed column for a person to approve. Use when asked to break a feature or epic into stories, tickets or tasks, or to plan work for the board.",
		body: `# Write stories for the sldev board

Stories you write land in the board's **Proposed** column. A person reads them, edits them if needed and approves them into Agent ready, where agents pick them up. Don't start any of the work yourself.

## 1. Understand the feature

Read the code it touches and what the board already has, so you don't file work that is done or already planned. Ask the user only when the goal itself is unclear.

## 2. Shape each story

${STORY_SHAPE}

Keep it to what was asked: at most about 12 stories, and no "nice to have" work nobody asked for.

## 3. File them

- **With the sldev tools** (\`sldev_board_add\` is available): call it once per story, in order, so \`after\` can name stories you filed earlier.
- **Otherwise** write them all to \`${DRAFTS_DIR}/stories-<short-slug>.json\`. ${ROOT_LINE}

\`\`\`json
{
  "by": "claude",
  "stories": [
    {
      "title": "Store login attempts per IP",
      "details": "**Why** …\\n\\n**What to do** …\\n\\n**Acceptance criteria**\\n- [ ] …\\n\\n**How to check** …",
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
\`\`\`

\`by\` is your own agent id (${AGENT_IDS}). The app adds the stories to Proposed (now if it is open, otherwise when it next opens) and removes the file.

${checkStep("## 4. Check the file", `${JSON_RULE}, and every story has a "title". Stories filed with \`sldev_board_add\` need no check`)}

## 5. Finish

Say in one line how many stories you wrote and that they wait in Proposed on the board.
`
	},
	{
		name: "sldev-recipe",
		label: "Write a factory recipe",
		description: "Write a Software Factory recipe for sldev-io: a YAML pipeline of agent, command and pull-request stages that the user runs from the app's Factory. Use when asked for a workflow, pipeline or process an agent team should follow (spec → build → test → review → PR), or to automate a repeated way of working.",
		body: `# Write an sldev factory recipe

A recipe is a pipeline of stages the user starts from sldev-io's Factory. It never runs on its own: you only write the file. Save it as \`.sldev/factory/<short-slug>.yml\` at the project root, where it shows up in the Recipes library at once. A recipe with the same name as a built-in one replaces it in this project.

## Example

\`\`\`yaml
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
\`\`\`

## Fields

Recipe: \`name\` (required), \`description\` (one line), \`setup\` (command that prepares a new worktree, \`none\` to skip; detected from the lockfile by default), \`stages\` (required).

Each stage is **exactly one** of:
- an agent stage: \`prompt\`, optionally \`agent\` (a profile name from \`.sldev/agents/*.md\`, a CLI id: ${AGENT_IDS}, \`Profile@cli\`, or a list for a bake-off; left out = the user's default agent), or \`skill\` (a skill name; the prompt becomes its arguments)
- a run stage: \`run\`, a command, a package script name (\`test\`; \`test?\` = skip when the project has none) or a list of them
- a PR stage: \`pr: { title, body }\`, both optional. It only opens the pull request when the user clicks.

Per stage: \`id\` (letters, digits, \`-\`, \`_\`; unique), \`needs\` (stage ids to wait for; default the stage above; several run in parallel and are merged here; each must be defined above), \`gate: approve\` (wait for the user after it), \`onFail: { retry: <stage above>, max: 1–10 }\` (on a run stage), \`maxDiff\` (ask for approval past this many changed lines), \`interactive: true\` (a normal session the user types into), \`model\`, \`effort\`, \`mode\` (in that CLI's own values).

Placeholders in prompts and the PR: \`{intent}\` (what the user typed when starting the run), \`{out}\` (this stage's output file), \`{<stage>.out}\` (another stage's output file), \`{base}\` (the branch the run started from), \`{log}\` (on a retry, the failure that caused it).

## Good recipes

- Hand-offs between stages are files: a stage writes \`{out}\`, a later one reads \`{stage.out}\`.
- Put a check (\`run\`) after every stage that changes code, with \`onFail\` back to it.
- Gate the steps a person should see (the spec, the review); not every stage.
- Use the project's own scripts, read from package.json, the Makefile or whatever the project uses.

${checkStep("## Check it", `it is YAML, so ${YAML_RULE}; each stage is exactly one kind, and every \`needs\`/\`retry\` names a stage above it`)}

## Finish

Say in one line that the recipe is in sldev-io under Factory → Recipes.
`
	},
	{
		name: "sldev-eval",
		label: "Write an eval",
		description: "Write an eval for sldev-io: a task with checks that tells which agent (or prompt) does best on this project, run from Mission Control → Evals. Use when asked to compare or benchmark agents, models or prompts on real work, or to turn a past bug or task into a repeatable test.",
		body: `# Write an sldev eval

An eval is one task given to several agents, each in its own git worktree, with checks that tell a good result from a bad one. The user runs it from sldev-io (Mission Control → Evals); you only write the file. Save it as \`.sldev/evals/<short-slug>.yml\` at the project root, where it shows up at once.

## Example

\`\`\`yaml
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
\`\`\`

## Fields

- \`name\`, \`brief\` (required): the brief is exactly what the agent is told, as you'd give it to a person.
- \`checks\` (required, at least one): \`run\` (a command that must exit 0, with optional \`expect\`: text the output must contain), \`diff\` (the most changed lines allowed), \`judge\` (a rubric another agent grades the change against).
- \`base\`: the branch or commit to start from (default: HEAD when the run starts). \`setup\`: the dependency install (detected by default). \`timeout\` in minutes (default 20).

## Good evals

- The task is real and of this project: a bug that was fixed, a feature that was built. Pick a \`base\` from before it, so the checks fail there and pass only when the work is done.
- At least one \`run\` check that can't pass by accident (a test of the behaviour, not just "it builds").
- A \`diff\` limit catches agents that rewrite too much; a \`judge\` catches what commands can't (the right place, the right approach).

${checkStep("## Check it", `it is YAML, so ${YAML_RULE}; \`name\`, \`brief\` and at least one check are there`)}

## Finish

Say in one line that the eval is in sldev-io under Mission Control → Evals, ready to run on the agents the user picks.
`
	}
];
var MARK = "sldev-skill";
/** The SKILL.md as written into a project. */
function skillText(s) {
	return `---\nname: ${s.name}\ndescription: ${JSON.stringify(s.description)}\nmetadata:\n  ${MARK}: "2"\n---\n\n${s.body.trim()}\n`;
}
/** the version an installed copy says it is; null when it isn't one of ours */
function skillVersionOf(text) {
	const m = new RegExp(`^\\s*${MARK}:\\s*"?(\\d+)"?\\s*$`, "m").exec(/^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "");
	return m ? Number(m[1]) : null;
}
/** An installed copy against this app's: outdated copies are replaced, hand-edited and foreign ones are kept. */
function copyState(s, text) {
	if (text === null) return "missing";
	if (text.replace(/\r\n/g, "\n") === skillText(s)) return "current";
	const v = skillVersionOf(text);
	if (v === null) return "foreign";
	return v < 2 ? "outdated" : "edited";
}
var MISSION_KINDS_DRAFTABLE = [
	"build",
	"research",
	"investigate",
	"plan",
	"review",
	"freeform"
];
var text = (v) => typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : void 0;
var unquote = (v) => {
	const t = v.trim();
	return t.length > 1 && (t[0] === "\"" || t[0] === "'") && t.endsWith(t[0]) ? t.slice(1, -1) : t;
};
/**
* Front matter read line by line, for when it isn't valid YAML: agents write `title: Fix: the parser` or
* `title: [WIP] …` unquoted. Each `key: value` takes the rest of its line; a key with nothing after it starts
* a `- item` list. Null when a line fits neither, so a truly broken header still fails.
*/
function looseFrontMatter(src) {
	const out = {};
	let list = null;
	for (const line of src.split(/\r?\n/)) {
		if (!line.trim() || /^\s*#/.test(line)) continue;
		const item = /^\s*-\s+(.*)$/.exec(line);
		if (item && list) {
			list.push(unquote(item[1]));
			continue;
		}
		const kv = /^([A-Za-z_][\w-]*):(?:\s+(.*))?$/.exec(line);
		if (!kv) return null;
		const v = (kv[2] ?? "").trim();
		if (!v) out[kv[1]] = list = [];
		else {
			list = null;
			out[kv[1]] = v === "true" ? true : v === "false" ? false : unquote(v);
		}
	}
	return out;
}
/** a criterion as YAML read it: `- Retries: up to 3` comes back as a one-key mapping */
var criterion = (c) => c && typeof c === "object" && !Array.isArray(c) ? Object.entries(c).map(([k, v]) => v === null || v === void 0 ? k : `${k}: ${String(v)}`).join(", ") : String(c ?? "");
/**
* A mission-*.md draft: YAML front matter (title, kind, criteria, agent, worktree, by) and the brief. Front
* matter that isn't valid YAML is read line by line instead (`warning` says so), so an unquoted colon in a
* title doesn't lose the draft.
*/
function parseMissionDraft(src, kinds = MISSION_KINDS_DRAFTABLE) {
	const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(src);
	let fm = {};
	let warning;
	if (m) try {
		const v = parse(m[1]);
		if (v && typeof v === "object" && !Array.isArray(v)) fm = v;
	} catch (e) {
		const why = e.message.split("\n")[0];
		const loose = looseFrontMatter(m[1]);
		if (!loose) return { error: `The front matter isn't valid YAML: ${why}` };
		fm = loose;
		warning = `The front matter isn't valid YAML (${why}), so it was read line by line. Put values that contain ": " or start with [ { * & ! | > ' " % @ in double quotes.`;
	}
	const brief = (m ? m[2] : src).trim();
	if (!brief) return { error: "The brief is empty: write it under the front matter" };
	const crit = Array.isArray(fm.criteria) ? fm.criteria.map((c) => criterion(c).trim()).filter(Boolean) : text(fm.criteria)?.split("\n").filter((l) => l.trim()) ?? [];
	const kind = text(fm.kind)?.toLowerCase();
	if (kind && !kinds.includes(kind)) warning = [warning, `Unknown kind "${kind}": it becomes build. Known: ${kinds.join(", ")}.`].filter(Boolean).join(" ");
	return {
		...warning ? { warning } : {},
		draft: {
			title: text(fm.title)?.slice(0, 100),
			brief,
			criteria: crit.length ? crit.map((c) => /^\s*(?:[-*+]|\d+[.)])\s/.test(c) ? c.trim() : `- ${c}`).join("\n") : void 0,
			kind: kind && kinds.includes(kind) ? kind : "build",
			agent: text(fm.agent)?.toLowerCase(),
			worktree: typeof fm.worktree === "boolean" ? fm.worktree : void 0,
			by: text(fm.by)?.toLowerCase()
		}
	};
}
/** A stories-*.json draft: {by, stories: […]} or just the array. */
function parseStoriesDraft(src) {
	try {
		const v = JSON.parse(src);
		if (v && typeof v === "object" && !Array.isArray(v)) {
			const o = v;
			return {
				stories: Array.isArray(o.stories) ? parseStories(JSON.stringify(o.stories)) : [],
				by: text(o.by)?.toLowerCase()
			};
		}
	} catch {}
	return { stories: parseStories(src) };
}
/** what kind of draft a file in .sldev/drafts is, by its name */
function draftKind(name) {
	if (/^mission[^/\\]*\.md$/i.test(name)) return "mission";
	if (/^stories[^/\\]*\.json$/i.test(name)) return "stories";
	return null;
}
/** Which of the skills' files `path` is, from where it sits: a draft by its name, a recipe or eval by its folder. */
function skillFileKind(path) {
	const p = path.replace(/\\/g, "/");
	if (/(^|\/)\.sldev\/factory\/[^/]+\.ya?ml$/i.test(p)) return "recipe";
	if (/(^|\/)\.sldev\/evals\/[^/]+\.ya?ml$/i.test(p)) return "eval";
	if (/(^|\/)\.sldev\/drafts\/[^/]+$/i.test(p)) return draftKind(p.split("/").pop());
	return null;
}
/**
* Reads a file an agent wrote with an sldev skill the way the app will, so the agent can fix it before it
* says it's done (sldev_check, `sldev skills check`). The app reads drafts once and sets bad ones aside, so a
* mistake found later is a draft the user never sees.
*/
function checkSkillFile(path, src) {
	const kind = skillFileKind(path);
	if (!kind) return {
		ok: false,
		kind,
		error: `sldev-io doesn't read ${path}. Missions go to ${DRAFTS_DIR}/mission-<slug>.md, stories to ${DRAFTS_DIR}/stories-<slug>.json, recipes to .sldev/factory/<slug>.yml and evals to .sldev/evals/<slug>.yml, at the project root.`
	};
	if (kind === "mission") {
		const r = parseMissionDraft(src);
		if (!r.draft) return {
			ok: false,
			kind,
			error: r.error
		};
		const d = r.draft;
		const crit = d.criteria ? d.criteria.split("\n").length : 0;
		return {
			ok: true,
			kind,
			summary: `A ${d.kind} mission: "${d.title ?? d.brief.split("\n")[0].slice(0, 60)}", ${crit} criteria.`,
			...r.warning ? { warning: r.warning } : {}
		};
	}
	if (kind === "stories") {
		const t = src.trim();
		let listed;
		if (t.startsWith("{") || t.startsWith("[")) try {
			const v = JSON.parse(t);
			const arr = Array.isArray(v) ? v : v?.stories;
			if (!Array.isArray(arr)) return {
				ok: false,
				kind,
				error: "The file needs a \"stories\" array: {\"by\": \"…\", \"stories\": [{\"title\": \"…\", \"details\": \"…\"}]}"
			};
			listed = arr.length;
		} catch (e) {
			return {
				ok: false,
				kind,
				error: `Not valid JSON: ${e.message}. Escape quotes and newlines inside strings (\\" and \\n).`
			};
		}
		const { stories } = parseStoriesDraft(src);
		if (!stories.length) return {
			ok: false,
			kind,
			error: "No stories found: each story needs at least a \"title\"."
		};
		const dropped = listed !== void 0 ? listed - stories.length : 0;
		return {
			ok: true,
			kind,
			summary: `${stories.length} ${stories.length === 1 ? "story" : "stories"}: ${stories.map((st) => st.title).join("; ").slice(0, 300)}`,
			...dropped > 0 ? { warning: `${dropped} of the ${listed} entries were skipped: each story needs a "title".` } : {}
		};
	}
	if (kind === "recipe") {
		const r = parseRecipe(src, path);
		if (!r.recipe) return {
			ok: false,
			kind,
			error: r.error
		};
		return {
			ok: true,
			kind,
			summary: `The recipe "${r.recipe.name}": ${r.recipe.nodes.map((n) => n.id).join(" → ")}.`
		};
	}
	const e = parseEval(src, path);
	if (!e.spec) return {
		ok: false,
		kind,
		error: e.error ?? "Not an eval"
	};
	return {
		ok: true,
		kind,
		summary: `The eval "${e.spec.name}": ${e.spec.checks.length} checks.`
	};
}
/** A check's result in a few lines, for an agent (the MCP tool) or a terminal (the CLI). */
function checkText(path, c) {
	if (!c.ok) return `${path}: NOT OK. sldev-io would not take this file.\n${c.error}\nFix the file and check it again before you say it's done.`;
	return `${path}: OK. ${c.summary}${c.warning ? `\nBut: ${c.warning}` : ""}`;
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
		case "sldev_board": {
			if (!deps.board) return { error: "The work board lives in the sldev-io app; this session has none." };
			const column = str(r.args.column);
			return { text: boardCardLines(deps.board().filter((i) => i.root === self.root), column || void 0) };
		}
		case "sldev_board_add": {
			if (!deps.board) return { error: "The work board lives in the sldev-io app; this session has none." };
			const card = storyDraft(r.args);
			if (!card) return { error: "title is empty" };
			const agent = self.options.agent ?? "claude";
			const footer = self.kind?.id === "stories" ? "" : `Filed by ${agent} during mission "${self.title}".`;
			deps.send({
				mission: self.id,
				type: "board-add",
				card: {
					title: card.title,
					body: [card.details, footer].filter(Boolean).join("\n\n"),
					labels: card.labels,
					priority: card.priority,
					after: card.after
				}
			});
			return { text: `Filed "${card.title}" in Proposed.` };
		}
		case "sldev_board_update": {
			if (!deps.board) return { error: "The work board lives in the sldev-io app; this session has none." };
			const key = Number(r.args.key);
			const target = deps.board().find((i) => i.root === self.root && i.key === key);
			if (!target) return { error: `No card #${key} on this project's board. Use sldev_board.` };
			if (target.column !== "backlog" && target.column !== "proposed") return { error: `#${key} is in ${target.column}: only cards in Backlog or Proposed can be rewritten.` };
			const card = storyDraft(r.args);
			if (!card) return { error: "title is empty" };
			deps.send({
				mission: self.id,
				type: "board-update",
				key,
				card: {
					title: card.title,
					body: card.details,
					labels: card.labels,
					priority: card.priority,
					after: card.after
				}
			});
			return { text: `Rewrote #${key}; it waits in Proposed for approval.` };
		}
		case "sldev_delegate":
		case "sldev_wait":
		case "sldev_followup":
		case "sldev_integrate":
			if (!deps.lead) return { error: "Lead missions live in the sldev-io app; this session cannot delegate." };
			if (self.kind?.id !== "lead") return { error: "Only a Lead mission can delegate. Workers do their own part and report back." };
			return deps.lead(r);
		case "sldev_rules":
			for (const f of [".sldev/rules.md", "AGENTS.md"]) {
				const text = await promises.readFile(join(self.root, f), "utf8").catch(() => null);
				if (text) return { text };
			}
			return { text: "This project has no agent rules yet." };
		case "sldev_check": {
			const given = str(r.args.path).trim();
			if (!given) return { error: "Give the path of the file you wrote" };
			const file = isAbsolute(given) ? given : resolve(self.cwd, given);
			const src = await promises.readFile(file, "utf8").catch(() => null);
			if (src === null) return { error: `Could not read ${file}. Did you write it?` };
			const c = checkSkillFile(file, src);
			let text = checkText(given, c);
			const drafts = join(self.root, ...DRAFTS_DIR.split("/"));
			const rel = relative(drafts, resolve(file, ".."));
			if ((c.kind === "mission" || c.kind === "stories") && rel !== "") text += `\nBut: sldev-io reads drafts from ${drafts}, not from where this file is. Move it there.`;
			return { text };
		}
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
	/** the TUI's tabs: their order, the one in front and the split, so attaching again finds them as they were */
	const tabs = {
		order: [],
		active: null,
		split: false
	};
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
			p.tracker?.output();
		},
		exit: (id, code) => {
			const p = panes.get(id);
			if (!p) return;
			if (!p.tracker) {
				update(p, {
					pid: void 0,
					exitCode: code,
					status: "ended"
				});
				return removePane(p);
			}
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
		for (const w of waiters) if ((w.pane ? w.pane === p.info.id : !p.info.shell) && w.states.includes(p.info.status)) done.push(w);
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
		onHook: (e) => panes.get(e.mission)?.tracker?.hook(e),
		mcp: {
			missions: () => agentPanes().map((p) => p.info),
			send: (e) => panes.get(e.mission)?.tracker?.mcp(e)
		}
	});
	const agentPanes = () => [...panes.values()].filter((p) => !p.info.shell);
	/** a pane joins the tab bar at the end */
	function addTab(id) {
		tabs.order.push(id);
		tabs.active ??= id;
	}
	function removePane(p) {
		ptys.kill(p.info.id);
		p.tracker?.dispose();
		panes.delete(p.info.id);
		const at = tabs.order.indexOf(p.info.id);
		tabs.order = tabs.order.filter((x) => x !== p.info.id);
		if (tabs.active === p.info.id) tabs.active = tabs.order[Math.min(Math.max(0, at), tabs.order.length - 1)] ?? null;
		broadcast({
			event: "closed",
			pane: p.info.id
		});
	}
	/** A plain shell in its own tab: the user's $SHELL (Windows: PowerShell), through the same pty code as the agents. */
	async function newShell(a) {
		const id = String(nextId++);
		const now = Date.now();
		const top = await isRepo(a.cwd) ? (await run("git", ["rev-parse", "--show-toplevel"], a.cwd)).stdout.trim() : "";
		const name = basename(defaultShell().shell).replace(/\.exe$/i, "");
		const pane = {
			info: {
				id,
				title: a.title?.trim() || name,
				prompt: "",
				root: top ? resolve(top) : a.cwd,
				cwd: a.cwd,
				options: { agent: "shell" },
				status: "waiting",
				createdAt: now,
				updatedAt: now,
				agentName: name,
				shell: true
			},
			agent: null,
			term: createTerm(a.cols ?? 120, a.rows ?? 40),
			history: ""
		};
		panes.set(id, pane);
		try {
			const { pid } = ptys.create(sink, id, {
				cwd: a.cwd,
				cols: a.cols ?? 120,
				rows: a.rows ?? 40
			});
			pane.info = {
				...pane.info,
				pid
			};
		} catch (err) {
			panes.delete(id);
			throw new Error(`Could not start a shell: ${err.message}`);
		}
		addTab(id);
		broadcast({
			event: "pane",
			pane: pane.info
		});
		return pane.info;
	}
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
			bell: () => pane.tracker?.attention(),
			notify: (text) => pane.tracker?.attention(text)
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
			pane.tracker?.dispose();
			throw new Error(`Could not start ${s.agent.name}: ${err.message}`);
		}
		addTab(id);
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
		if (a.shell) return newShell(a);
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
		if (!p.agent) return;
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
		if (!p.agent) throw new Error(`Pane ${p.info.id} is a shell, not an agent: there are no changes of its own to review`);
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
		const now = id ? [panes.get(id)] : agentPanes();
		const hit = now.find((p) => states.includes(p.info.status));
		if (hit) return Promise.resolve(hit.info);
		if (!id && !now.length) throw new Error("No agent panes to wait for");
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
			p.tracker?.input();
			ptys.write(p.info.id, a.text);
			if (a.enter !== false) setTimeout(() => ptys.write(p.info.id, "\r"), 50);
			if (a.enter !== false && !p.info.shell && (p.info.status === "waiting" || p.info.status === "needs-input")) update(p, {
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
			removePane(p);
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
			p.tracker?.dispose();
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
			return tabs.order.flatMap((id) => panes.get(id)?.info ?? []);
		},
		tabs: (a) => {
			if (Array.isArray(a.order)) {
				const known = a.order.filter((id, i) => panes.has(id) && a.order.indexOf(id) === i);
				tabs.order = [...known, ...tabs.order.filter((id) => !known.includes(id))];
			}
			if (a.active !== void 0 && (a.active === null || panes.has(a.active))) tabs.active = a.active;
			if (typeof a.split === "boolean") tabs.split = a.split;
			return {
				...tabs,
				order: [...tabs.order]
			};
		},
		rename: (a) => {
			const p = paneFor(a.pane);
			const title = a.title?.trim().replace(/[\x00-\x1f]/g, " ").slice(0, 80);
			if (!title) throw new Error("A tab needs a name");
			update(p, { title });
			return p.info;
		},
		input: (a) => {
			const p = paneFor(a.pane);
			p.tracker?.input();
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
			if (typeof r?.id !== "number" || typeof r.cmd !== "string") return;
			const reply = (res) => void (!c.destroyed && c.write(JSON.stringify(res) + "\n"));
			if (!Object.hasOwn(handlers, r.cmd)) return reply({
				id: r.id,
				ok: false,
				error: `sldev ${VERSION} doesn't know "${r.cmd}"`
			});
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
		for (const p of panes.values()) p.tracker?.dispose();
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
var read$1 = (p) => promises.readFile(p, "utf8").catch(() => null);
async function readConfig(root) {
	try {
		const c = JSON.parse(await read$1(join(root, ".sldev/rules.json")) ?? "{}");
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
		read$1(join(root, RULES_SOURCE)),
		readConfig(root),
		Promise.all(RULE_TARGETS.map((t) => read$1(join(root, t.path))))
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
		text: await read$1(join(root, t.path))
	})));
	await promises.mkdir(dirname(p), { recursive: true });
	await promises.writeFile(p, importRules(files));
	return p;
}
/** Writes every target that is new or was last written by us, plus the hand-edited ones listed in `overwrite`. */
async function syncRules(root, overwrite = []) {
	const source = await read$1(join(root, RULES_SOURCE));
	if (source === null) throw new Error("No .sldev/rules.md yet");
	const config = await readConfig(root);
	const written = { ...config.written };
	for (const t of RULE_TARGETS) {
		const plan = planTarget(t, source, await read$1(join(root, t.path)), config);
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
// src/main/sldevSkills.ts
/** sldev's skills in a project and the drafts agents leave for the app. No electron imports: the CLI uses this too. */
var read = (p) => promises.readFile(p, "utf8").catch(() => null);
var copies = (root, name) => SKILL_DIRS.map((d) => join(root, ...d.split("/"), name, "SKILL.md"));
var RANK = [
	"missing",
	"outdated",
	"edited",
	"foreign",
	"current"
];
async function skillsState(root) {
	return Promise.all(SLDEV_SKILLS.map(async (s) => {
		const all = await Promise.all(copies(root, s.name).map(async (p) => copyState(s, await read(p))));
		const states = all.some((st) => st !== "missing") ? all.filter((st) => st !== "missing") : all;
		return {
			name: s.name,
			label: s.label,
			state: RANK.find((r) => states.includes(r)) ?? "current"
		};
	}));
}
/**
* Writes the missing and outdated copies. A copy edited by hand (or someone else's skill of that name) is
* kept unless its skill is named in `overwrite`. Returns the files written.
*/
async function installSkills(root, overwrite = []) {
	const wrote = [];
	for (const s of SLDEV_SKILLS) for (const p of copies(root, s.name)) {
		const st = copyState(s, await read(p));
		if (st === "current" || (st === "edited" || st === "foreign") && !overwrite.includes(s.name)) continue;
		await promises.mkdir(join(p, ".."), { recursive: true });
		await promises.writeFile(p, skillText(s));
		wrote.push(p);
	}
	await prepareDrafts(root);
	return wrote;
}
/** The skills as plain folders (`<dir>/<name>/SKILL.md`), for the public skills repo that `npx skills add` reads. */
async function exportSkills(dir) {
	const out = [];
	for (const s of SLDEV_SKILLS) {
		const p = join(dir, s.name, "SKILL.md");
		await promises.mkdir(join(dir, s.name), { recursive: true });
		await promises.writeFile(p, skillText(s));
		out.push(p);
	}
	return out;
}
var draftsDir = (root) => join(root, ...DRAFTS_DIR.split("/"));
/** The drafts folder, kept out of git: drafts are an inbox the app empties. */
async function prepareDrafts(root) {
	const dir = draftsDir(root);
	await promises.mkdir(dir, { recursive: true });
	await promises.writeFile(join(dir, ".gitignore"), "*\n", { flag: "wx" }).catch((e) => {
		if (e.code !== "EEXIST") throw e;
	});
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
var SKILL_STATE = {
	missing: "not installed",
	current: "installed",
	outdated: "older version (sldev skills install updates it)",
	edited: "edited by hand (install --overwrite <name> to replace)",
	foreign: "another skill with this name (install --overwrite <name> to replace)"
};
/** sldev's own skills: agents draft missions, board stories, recipes and evals as files the app picks up. */
async function skillsStatus(root) {
	const s = await skillsState(root);
	const width = Math.max(...s.map((x) => x.name.length));
	return [`sldev skills in ${root}:`, ...s.map((x) => `  /${x.name.padEnd(width)}  ${x.label.padEnd(24)} ${SKILL_STATE[x.state]}`)].join("\n");
}
async function skillsInstall(root, overwrite) {
	const wrote = await installSkills(root, overwrite);
	const kept = (await skillsState(root)).filter((x) => x.state === "edited" || x.state === "foreign").map((x) => x.name);
	return [
		wrote.length ? `Wrote ${wrote.length} files:` : "Already up to date.",
		...wrote.map((p) => `  ${p}`),
		...kept.length ? [`Kept (edited by hand): ${kept.join(", ")}. Use --overwrite ${kept.join(",")} to replace them.`] : [],
		"Agents now draft missions and stories into .sldev/drafts; sldev-io takes them in when it is open."
	].join("\n");
}
async function skillsExport(dir) {
	const wrote = await exportSkills(resolve(dir));
	return [`Wrote ${wrote.length} skills:`, ...wrote.map((p) => `  ${p}`)].join("\n");
}
/** `sldev skills check <file…>`: each file read the way the app will; false when one wouldn't be taken. */
async function skillsCheck(files) {
	const out = [];
	let ok = true;
	for (const f of files) {
		const src = await promises.readFile(resolve(f), "utf8").catch(() => null);
		const c = src === null ? {
			ok: false,
			kind: null,
			error: `Could not read ${f}`
		} : checkSkillFile(resolve(f), src);
		ok &&= c.ok;
		out.push(checkText(f, c));
	}
	return {
		ok,
		text: out.join("\n\n")
	};
}
/** The sidebar goes away on narrow terminals; a split needs room for two usable panes. */
function layout(cols, rows, split) {
	cols = Math.max(1, cols);
	rows = Math.max(3, rows);
	const status = {
		x: 0,
		y: rows - 1,
		w: cols,
		h: 1
	};
	const side = cols >= 100;
	const sidebar = side ? {
		x: 0,
		y: 2,
		w: 28,
		h: Math.max(0, rows - 3)
	} : null;
	const brand = side ? {
		x: 0,
		y: 0,
		w: 28,
		h: 1
	} : null;
	const x = side ? 29 : 0;
	const w = cols - x;
	const tabs = {
		x,
		y: 0,
		w,
		h: 1
	};
	const h = rows - 2;
	if (split && w >= 60) {
		const left = Math.floor((w - 1) / 2);
		return {
			brand,
			sidebar,
			tabs,
			panes: [{
				x,
				y: 1,
				w: left,
				h
			}, {
				x: x + left + 1,
				y: 1,
				w: w - left - 1,
				h
			}],
			status
		};
	}
	return {
		brand,
		sidebar,
		tabs,
		panes: [{
			x,
			y: 1,
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
var DIM = "\x1B[90m";
var RESET = "\x1B[0m";
var BOLD = "\x1B[1m";
/** the accent: the bar beside the row in focus, the line under the active tab, key names */
var ACCENT = "\x1B[38;5;75m";
/** the brand gradient, blue → green → purple, in 256 colours (truecolor isn't everywhere) */
var BRAND = [
	75,
	79,
	114,
	141,
	177
];
/** "sldev" in the brand gradient */
function brandMark() {
	return [..."sldev"].map((ch, i) => `\x1b[1;38;5;${BRAND[i]}m${ch}`).join("") + RESET;
}
/** A pane's state: an agent's mission status, or neutral for a shell tab (it has no status of its own). */
function paneSignal(p) {
	if (p.shell) return {
		tone: "neutral",
		label: p.pid === void 0 ? "Exited" : "Shell",
		pulse: false
	};
	return missionSignal(p.status);
}
var SPINNER = [
	"⠋",
	"⠙",
	"⠹",
	"⠸",
	"⠼",
	"⠴",
	"⠦",
	"⠧",
	"⠇",
	"⠏"
];
/** The one-column marker for a pane: a spinner while it works, a dot when it waits, ✓/✕ when it's over. */
function glyph(p, frame = 0) {
	const s = paneSignal(p);
	if (p.shell) return p.pid === void 0 ? "·" : "›";
	if (s.tone === "working") return s.pulse ? SPINNER[frame % SPINNER.length] : "●";
	if (s.tone === "error") return "✕";
	if (s.tone === "done") return "✓";
	if (s.tone === "neutral") return "○";
	return "●";
}
/** a pane's marker in its colour; one that needs you is bold, so it stands out from across the screen */
function marker(p, frame = 0) {
	const s = paneSignal(p);
	return `\x1b[${s.tone === "attention" || s.tone === "error" ? "1;" : ""}${TONE_SGR[s.tone]}m${glyph(p, frame)}${RESET}`;
}
/** which tone wins when a group of panes is summed up: what needs the human first */
var URGENCY = [
	"attention",
	"error",
	"working",
	"review",
	"done",
	"neutral"
];
function rollup(panes) {
	const tones = panes.map((p) => paneSignal(p).tone);
	return URGENCY.find((t) => tones.includes(t)) ?? "neutral";
}
var TAB_TITLE_MAX = 22;
/** The plain text of tab `i` (1-based number, its title cut to `max` columns); the marker is its second character. */
function tabText(t, i, max) {
	const title = width(t.title) > max ? fit(t.title, Math.max(1, max - 1)).trimEnd() + "…" : t.title;
	return ` ${t.glyph ?? "●"} ${i + 1} ${title} `;
}
/**
* Which tabs fit in `w` columns, the active one always among them: [start, end). Tabs scroll so the active
* one is in view; `‹` and `›` take a column each when tabs are hidden on that side.
*/
function tabWindow(widths, active, w) {
	if (widths.reduce((a, b) => a + b, 0) <= w) return {
		start: 0,
		end: widths.length
	};
	const avail = w - 2;
	active = Math.max(0, Math.min(active, widths.length - 1));
	let start = active;
	let end = active + 1;
	let used = widths[active];
	while (end < widths.length && used + widths[end] <= avail) used += widths[end++];
	while (start > 0 && used + widths[start - 1] <= avail) used += widths[--start];
	return {
		start,
		end
	};
}
var PLUS = " + ";
/**
* The tab bar, exactly `w` columns: `⠹ 1 fix the parser   ● 2 review   › 3 zsh   +`. Each marker keeps its
* colour, so a background tab that needs you stands out; the active tab is bold, the rest grey.
*/
function tabBarLayout(tabs, w) {
	if (w <= 0) return {
		text: "",
		spans: [],
		plus: null
	};
	const plusW = w >= 12 ? 3 : 0;
	if (!tabs.length) return {
		text: DIM + fit(" no tabs", w - plusW) + RESET + (plusW ? `${ACCENT}${PLUS}${RESET}` : ""),
		spans: [],
		plus: plusW ? {
			from: w - plusW,
			to: w
		} : null
	};
	const room = w - plusW;
	const max = Math.max(4, Math.min(TAB_TITLE_MAX, room - 10));
	const texts = tabs.map((t, i) => tabText(t, i, max));
	const active = Math.max(0, tabs.findIndex((t) => t.active));
	const { start, end } = tabWindow(texts.map(width), active, room);
	const clipped = start > 0 || end < tabs.length;
	const spans = [];
	let out = clipped ? DIM + (start > 0 ? "‹" : " ") + RESET : "";
	let used = clipped ? 1 : 0;
	const inner = room - (clipped ? 2 : 0);
	for (let i = start; i < end; i++) {
		const t = tabs[i];
		const text = fit(texts[i], Math.min(width(texts[i]), inner - (used - (clipped ? 1 : 0))));
		if (!text.trim()) break;
		const style = t.active ? BOLD : t.shown ? "" : DIM;
		const color = `\x1b[${t.tone === "attention" || t.tone === "error" ? "1;" : ""}${TONE_SGR[t.tone]}m`;
		out += style + text[0] + RESET + color + text.slice(1, 2) + RESET + style + text.slice(2) + RESET;
		spans.push({
			index: i,
			from: used,
			to: used + width(text)
		});
		used += width(text);
	}
	out += " ".repeat(Math.max(0, room - used - (clipped ? 1 : 0)));
	if (clipped) out += DIM + (end < tabs.length ? "›" : " ") + RESET;
	if (plusW) out += `${DIM}${PLUS}${RESET}`;
	return {
		text: out,
		spans,
		plus: plusW ? {
			from: room,
			to: w
		} : null
	};
}
/**
* The rule under the tab bar, `w` columns: a thin line, heavy and in the accent under the active tab, and
* on its right the focused pane's details (agent, branch, diff stat), so the tab itself stays short.
*/
function ruleLine(w, under, info = "") {
	if (w <= 0) return "";
	const label = info ? fit(` ${info} `, Math.min(width(info) + 2, Math.max(0, w - 8))) : "";
	const lw = width(label);
	const lineW = w - lw - (lw ? 2 : 0);
	const heavy = (x) => !!under && x > under.from && x < under.to - 1;
	let out = "";
	for (let x = 0; x < lineW;) {
		const on = heavy(x);
		let n = 1;
		while (x + n < lineW && heavy(x + n) === on) n++;
		out += (on ? ACCENT + "━".repeat(n) : DIM + "─".repeat(n)) + RESET;
		x += n;
	}
	return lw ? out + DIM + label + "──\x1B[0m" : out;
}
/** A pane's details for the rule: who runs it and where, shortest first so a narrow pane keeps the useful part. */
function paneDetails(p, home = "", id = true) {
	if (p.shell) return `${id ? `#${p.id} · ` : ""}${tailFit(tilde(p.cwd, home), 40).trimEnd()}`;
	const parts = [
		...id ? [`#${p.id}`] : [],
		p.agentName,
		paneSignal(p).label.toLowerCase()
	];
	if (p.worktree) parts.push(p.worktree.branch);
	if (p.stats && (p.stats.insertions || p.stats.deletions)) parts.push(`+${p.stats.insertions} -${p.stats.deletions}`);
	if (p.notification) parts.push(p.notification);
	return parts.join(" · ");
}
var tilde = (path, home) => home && (path === home || path.startsWith(home + "/")) ? "~" + path.slice(home.length) : path;
var basename$1 = (path) => path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path;
/**
* The sidebar: sessions grouped by project (the repo they work in), each group with its most urgent state;
* a session is a marker, its tab number and title, and under it the agent and its state, or a shell's folder.
* Below them, anchored to the bottom: a count per state and the repeat loops. The row in focus gets an
* accent bar and bold, never reverse video.
*/
function sidebar(input, w, h) {
	const { order, active, shown, frame = 0, home = "" } = input;
	const byId = new Map(input.panes.map((p) => [p.id, p]));
	const panes = order.flatMap((id) => byId.get(id) ?? []);
	const rows = [];
	const push = (text, hit = null) => void rows.push({
		text,
		hit
	});
	const groups = /* @__PURE__ */ new Map();
	for (const p of panes) {
		const key = p.root || p.cwd;
		groups.set(key, [...groups.get(key) ?? [], p]);
	}
	if (!panes.length) push(DIM + fit("  No tabs yet", w) + RESET);
	let first = true;
	for (const [root, list] of groups) {
		if (!first) push("");
		first = false;
		const tone = rollup(list);
		const count = String(list.length);
		push(`${BOLD}${fit(` ${basename$1(root)}`, w - count.length - 3)}${RESET} \x1b[${TONE_SGR[tone]}m${tone === "neutral" ? " " : "●"}${RESET} ${DIM}${count}${RESET}`);
		for (const p of [...list.filter((x) => !x.shell), ...list.filter((x) => x.shell)]) {
			const n = order.indexOf(p.id) + 1;
			const focus = p.id === active;
			const bar = focus ? `${ACCENT}▌${RESET}` : shown.includes(p.id) ? `${DIM}│${RESET}` : " ";
			const num = `${n}`;
			const title = fit(p.title, w - 5 - num.length);
			push(`${bar} ${marker(p, frame)} ${DIM}${num}${RESET} ${focus ? BOLD : ""}${title}${RESET}`, p.id);
			const sig = paneSignal(p);
			const sub = p.shell ? tilde(p.cwd, home) : [
				p.agentName,
				sig.label.toLowerCase(),
				p.worktree?.branch
			].filter(Boolean).join(" · ");
			const stat = !p.shell && p.stats && (p.stats.insertions || p.stats.deletions) ? `+${p.stats.insertions} -${p.stats.deletions}` : "";
			const subW = w - 4 - (stat ? stat.length + 1 : 0);
			push(`${bar}   ${DIM}${p.shell ? tailFit(sub, subW) : fit(sub, subW)}${RESET}${stat ? ` \x1b[2;32m+${p.stats.insertions}${RESET}\x1b[2;31m -${p.stats.deletions}${RESET}` : ""}`, p.id);
		}
	}
	const foot = [];
	const counts = URGENCY.filter((t) => t !== "neutral").map((t) => ({
		t,
		n: panes.filter((p) => !p.shell && paneSignal(p).tone === t).length
	})).filter((c) => c.n);
	const NAMES = {
		attention: "need you",
		error: "failed",
		working: "working",
		review: "ready",
		done: "done",
		neutral: ""
	};
	if (counts.length) {
		let line = " ";
		for (const c of counts) {
			const part = ` ${c.n} ${NAMES[c.t]}`;
			if (width(plain(line)) + 1 + part.length > w) break;
			line += `\x1b[${TONE_SGR[c.t]}m●${RESET}${DIM}${part}${RESET}  `;
		}
		foot.push(line);
	}
	for (const l of (input.loops ?? []).filter((x) => x.progress.state !== "finished").slice(0, 2)) {
		foot.push(` ${ACCENT}↻${RESET} ${fit(l.name, w - 3)}`);
		foot.push(`   ${DIM}${fit(l.label, w - 3)}${RESET}`);
	}
	if (foot.length) foot.unshift(DIM + "─".repeat(w) + RESET);
	const footer = foot.length && h - foot.length >= 6 ? foot : [];
	const room = Math.max(0, h - footer.length - (footer.length ? 1 : 0));
	const focusRow = rows.findIndex((r) => r.hit === active);
	const start = rows.length <= room ? 0 : Math.max(0, Math.min(focusRow - Math.floor(room / 2), rows.length - room));
	const body = rows.slice(start, start + room);
	const lines = [];
	const hits = [];
	for (let i = 0; i < h; i++) {
		const fromFoot = i - (h - footer.length);
		if (fromFoot >= 0) {
			lines.push(pad(footer[fromFoot], w));
			hits.push(null);
		} else {
			lines.push(pad(body[i]?.text ?? "", w));
			hits.push(body[i]?.hit ?? null);
		}
	}
	return {
		lines,
		hits
	};
}
/** pads a styled string with spaces to `w` visible columns (it's built not to be longer) */
function pad(s, w) {
	return s + " ".repeat(Math.max(0, w - width(plain(s))));
}
var plain = (s) => s.replace(/\x1b\[[0-9;?<>]*[A-Za-z]/g, "");
/** `keys` as chips: each key in the accent, what it does in grey, as many as fit in `w`. */
function hints(pairs, w, lead = "") {
	let out = lead;
	let used = width(plain(lead));
	for (const [k, what] of pairs) {
		const n = width(k) + 1 + width(what) + 2;
		if (used + n > w) break;
		out += `${BOLD}${k}${RESET} ${DIM}${what}${RESET}  `;
		used += n;
	}
	return out + " ".repeat(Math.max(0, w - used));
}
/** A box with rounded corners and a title, `w` wide, centred in `r`; returns its rows positioned with at(). */
function popup(r, title, rows, sel, footer = "") {
	const w = Math.min(r.w - 2, 64, Math.max(36, ...rows.map((x) => width(x.text) + width(x.key ?? "") + width(x.note ?? "") + 10), width(title) + 6, width(footer) + 4));
	const h = Math.min(r.h - 1, rows.length + 2 + (footer ? 2 : 0));
	if (w < 10 || h < 3) return "";
	const x = r.x + Math.floor((r.w - w) / 2);
	const y = r.y + Math.max(1, Math.floor((r.h - h) / 3));
	const keyW = Math.max(0, ...rows.map((x) => width(x.key ?? "")));
	let s = at(x, y) + "\x1B[90m╭─ \x1B[0m\x1B[1m" + fit(title, Math.min(width(title), w - 6)) + "\x1B[0m\x1B[90m " + "─".repeat(Math.max(0, w - width(title) - 5)) + "╮\x1B[0m";
	const inner = w - 2;
	const body = rows.slice(0, h - 2 - (footer ? 2 : 0));
	body.forEach((row, i) => {
		let line;
		if (row.head) line = " \x1B[1m" + fit(row.text, inner - 1) + RESET;
		else {
			const focus = i === sel;
			const key = row.key ? `${row.off ? DIM : ACCENT}${fit(row.key, keyW)}${RESET}` : " ".repeat(keyW);
			const noteW = row.note ? width(row.note) + 1 : 0;
			const text = fit(row.text, Math.max(0, inner - keyW - 5 - noteW));
			line = `${focus ? `${ACCENT}▌${RESET}` : " "} ${key}  ${row.off ? DIM : focus ? BOLD : ""}${text}${RESET}${row.note ? `${DIM} ${row.note}${RESET}` : ""} `;
		}
		s += at(x, y + 1 + i) + "\x1B[90m│\x1B[0m" + pad(line, inner) + "\x1B[90m│\x1B[0m";
	});
	if (footer) {
		s += at(x, y + 1 + body.length) + "\x1B[90m│" + " ".repeat(inner) + "│\x1B[0m";
		s += at(x, y + 2 + body.length) + "\x1B[90m│\x1B[0m \x1B[90m" + fit(footer, inner - 1) + "\x1B[0m\x1B[90m│\x1B[0m";
	}
	s += at(x, y + h - 1) + "\x1B[90m╰" + "─".repeat(w - 2) + "╯\x1B[0m";
	return s;
}
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
/** A path cut from the left to `w` columns, so the folder name (the end) stays: `…/scratchpad/repo`. */
function tailFit(s, w) {
	if (width(s) <= w) return fit(s, w);
	if (w <= 1) return fit("…", w);
	const chars = [...s];
	let out = "";
	let used = 1;
	for (let i = chars.length - 1; i >= 0; i--) {
		const cw = wide(chars[i]) ? 2 : 1;
		if (used + cw > w) break;
		out = chars[i] + out;
		used += cw;
	}
	return fit("…" + out, w);
}
/** Columns `s` takes (wide characters count as two). */
function width(s) {
	let n = 0;
	for (const ch of s) n += wide(ch) ? 2 : 1;
	return n;
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
/** start and end in reading order */
function ordered(s) {
	return s.a.y < s.b.y || s.a.y === s.b.y && s.a.x <= s.b.x ? [s.a, s.b] : [s.b, s.a];
}
/** Is the cell selected? Like a terminal: from the start to the end of the line, whole lines, then to the end cell. */
function inSelection(s, x, y) {
	const [from, to] = ordered(s);
	if (y < from.y || y > to.y) return false;
	if (y === from.y && x < from.x) return false;
	if (y === to.y && x > to.x) return false;
	return true;
}
/**
* The selected text of the screen as it's shown (scrolled back or not): trailing blanks dropped per line, and
* a line the terminal wrapped joined to the next, so a long command copies as one line.
*/
function selectionText(term, s) {
	const [from, to] = ordered(s);
	const b = term.buffer.active;
	let out = "";
	for (let y = from.y; y <= to.y; y++) {
		const line = b.getLine(b.viewportY + y);
		if (!line) break;
		const start = y === from.y ? from.x : 0;
		const end = y === to.y ? to.x + 1 : term.cols;
		out += line.translateToString(y !== to.y ? false : true, start, end);
		if (y < to.y) {
			if (!b.getLine(b.viewportY + y + 1)?.isWrapped) out = out.replace(/ +$/, "") + "\n";
		}
	}
	return out.replace(/ +$/, "");
}
/** the selection's colour: a background, so the text keeps its own colours */
var SELECTED_BG = ";48;5;24";
/** The visible screen of `term`, drawn into `r` (rows past the screen are cleared); `sel` is highlighted. */
function drawTerm(term, r, sel) {
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
			const style = sgr(c) + (sel && inSelection(sel, col, row) ? SELECTED_BG : "");
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
// cli/src/clipboard.ts
/**
* Text to the system clipboard: the platform's own tool (wl-copy on Wayland, xclip or xsel on X11, pbcopy,
* clip.exe), fed through stdin. Nothing to the network. Over SSH there's no display to copy to; the TUI
* also sends OSC 52, which terminals that support it turn into a copy on the user's own machine.
*/
function clipboardCommand(env = process.env, platform = process.platform) {
	if (platform === "darwin") return ["pbcopy"];
	if (platform === "win32") return ["clip"];
	const has = (bin) => !!findOnPath(bin, env);
	if (env.WAYLAND_DISPLAY && has("wl-copy")) return ["wl-copy"];
	if (env.DISPLAY && has("xclip")) return [
		"xclip",
		"-selection",
		"clipboard"
	];
	if (env.DISPLAY && has("xsel")) return [
		"xsel",
		"--clipboard",
		"--input"
	];
	return null;
}
/** Resolves true once the tool took the text, false when there's no tool (OSC 52 is then the only copy). */
function copyToClipboard(text) {
	const cmd = clipboardCommand();
	if (!cmd) return Promise.resolve(false);
	return new Promise((resolve) => {
		const p = spawn(cmd[0], cmd.slice(1), {
			stdio: [
				"pipe",
				"ignore",
				"ignore"
			],
			detached: process.platform !== "win32",
			windowsHide: true
		});
		p.on("error", () => resolve(false));
		p.stdin.on("error", () => resolve(false));
		p.stdin.end(text, () => resolve(true));
		p.unref();
	});
}
/** OSC 52: asks the terminal itself to put `text` on the clipboard (works over SSH where the terminal allows it). */
var osc52 = (text) => `\x1b]52;c;${Buffer.from(text, "utf8").toString("base64")}\x07`;
// cli/src/tui.ts
/**
* `sldev` with no arguments: every session (an agent or a plain shell) is a tab along the top, numbered
* 1, 2, 3 with a + for a new one; on wide terminals a sidebar groups them by project with each one's state.
* One or two are shown, and the keyboard goes to the tab in focus. Ctrl-b is the prefix (n/p, 1-9, </> move,
* s split, c new tab, t new shell, , rename, x close, w workflows, e editor, v changed files, ? keys,
* d detach); tabs, sidebar rows and + take clicks too. Detaching leaves every session running, and the
* daemon keeps the tabs' order, names, the one in front and the split.
*/
var PREFIX = "";
/** the hint bar, and what the prefix waits for */
var HINTS = [
	["c", "new tab"],
	["t", "shell"],
	["1-9", "go to"],
	["?", "all keys"],
	["d", "detach"],
	["s", "split"],
	["w", "workflows"],
	["n/p", "next/prev"],
	["e", "editor"]
];
var RUNS_HINTS = [
	["↑↓", "pick"],
	["Enter", "open in browser"],
	["r", "rerun failed jobs"],
	["u", "refresh"],
	["Esc", "close"]
];
var MENU_HINTS = [
	["↑↓", "pick"],
	["Enter", "start"],
	["Esc", "cancel"]
];
/** every key, for Ctrl-b ? */
var HELP_ROWS = [
	{
		head: true,
		text: "Tabs"
	},
	{
		key: "c",
		text: "new tab: an agent or a shell"
	},
	{
		key: "t",
		text: "shell in the folder of the tab in focus"
	},
	{
		key: "1-9",
		text: "go to tab"
	},
	{
		key: "n p",
		text: "next, previous tab"
	},
	{
		key: "< >",
		text: "move the tab left, right"
	},
	{
		key: ",",
		text: "rename the tab"
	},
	{
		key: "x",
		text: "close the tab"
	},
	{
		head: true,
		text: "View"
	},
	{
		key: "s",
		text: "split: the next tab beside this one"
	},
	{
		key: "w",
		text: "workflows: GitHub Actions runs of this repo"
	},
	{
		key: "e",
		text: "the tab's folder in your editor"
	},
	{
		key: "v",
		text: "the tab's changed files in your editor"
	},
	{
		head: true,
		text: "Session"
	},
	{
		key: "d",
		text: "detach: everything keeps running"
	},
	{
		key: "^b",
		text: "send Ctrl-b to the tab"
	}
];
/** a spinner frame for working agents; only while one works */
var SPIN_MS = 100;
/** how often the workflows view asks GitHub again while it's open */
var RUNS_REFRESH_MS = 15e3;
/**
* Windows Terminal's win32-input-mode sends every key as `ESC [ Vk ; Sc ; Uc ; Kd ; Cs ; Rc _` (virtual key,
* scan code, the character, down 1 / up 0, modifier state, repeat count) instead of its plain bytes. Typing
* into a pane works either way (its ConPTY reads both), but sldev's own keys have to be read out of it.
*/
var WIN32_KEY = /^\x1b\[(\d*);(\d*);(\d*);(\d*);(\d*);(\d*)_/;
/** a Ctrl-b key press in that form, anywhere in a chunk */
var WIN32_PREFIX = /\x1b\[\d*;\d*;2;1;\d*;\d*_/;
/** keys with no character of their own, as the bytes the views already read */
var WIN32_VK = {
	13: "\r",
	27: "\x1B",
	8: "",
	9: "	",
	37: "\x1B[D",
	38: "\x1B[A",
	39: "\x1B[C",
	40: "\x1B[B"
};
/** The key a win32-input-mode event stands for: its bytes on a key press, '' on a release or a lone modifier. */
function win32Key(s) {
	const m = WIN32_KEY.exec(s);
	if (!m) return null;
	const [vk, uc, down] = [
		Number(m[1] || 0),
		Number(m[3] || 0),
		m[4] === "1"
	];
	if (!down) return {
		len: m[0].length,
		text: ""
	};
	return {
		len: m[0].length,
		text: uc ? String.fromCharCode(uc) : WIN32_VK[vk] ?? ""
	};
}
/** What a tab's program switches with CSI ? Pm h/l that the TUI has to know: its cursor and mouse encoding. */
function trackModes(v) {
	const set = (on) => (params) => {
		for (const p of params.flat()) {
			if (p === 25) v.cursorHidden = !on;
			if (p === 1006) v.sgrMouse = on;
		}
		return false;
	};
	v.term.parser.registerCsiHandler({
		prefix: "?",
		final: "h"
	}, set(true));
	v.term.parser.registerCsiHandler({
		prefix: "?",
		final: "l"
	}, set(false));
}
/** a mouse report in SGR form: ESC [ < button ; x ; y M (press) or m (release) */
var MOUSE = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/;
function defaultServices(preferred) {
	return {
		runs: loadRuns,
		rerun: rerunFailed,
		openRun,
		open: (p, diff) => openPane(p, {
			diff,
			preferred: preferred()
		}),
		copy: copyToClipboard
	};
}
/** lines the wheel scrolls a tab's history by */
var WHEEL_LINES = 3;
async function runTui(client, cwd, io = {
	input: process.stdin,
	output: process.stdout
}, services = defaultServices(() => null)) {
	const out = io.output;
	const input = io.input;
	const views = /* @__PURE__ */ new Map();
	/** tab order, as the daemon keeps it */
	let order = [];
	/** the tab in focus */
	let active = null;
	let split = false;
	let prefix = false;
	let prompt = null;
	let message = "";
	let runsView = null;
	let menu = null;
	let help = false;
	let loops = /* @__PURE__ */ new Map();
	let frame = null;
	let restored = false;
	/** the spinner's frame, and its timer while an agent works */
	let spin = 0;
	let spinTimer = null;
	/** what the last frame drew where, for clicks */
	let bar = {
		text: "",
		spans: [],
		plus: null
	};
	/** text being selected (or just copied) in a tab by dragging the mouse */
	let sel = null;
	let side = {
		lines: [],
		hits: []
	};
	const home = homedir();
	const activeIndex = () => Math.max(0, active === null ? 0 : order.indexOf(active));
	/** the tab in focus, and in a split the one after it */
	const visible = () => {
		if (!order.length) return [];
		const i = activeIndex();
		if (!split || order.length < 2) return [order[i]];
		return [order[i], order[(i + 1) % order.length]];
	};
	/** the daemon keeps the tabs, so the next attach finds them as they are now */
	const saveTabs = (patch) => void client.request("tabs", patch).catch(() => void 0);
	const addView = async (info) => {
		if (views.has(info.id)) return;
		const view = {
			info,
			term: createTerm(120, 40)
		};
		trackModes(view);
		views.set(info.id, view);
		if (!order.includes(info.id)) order.push(info.id);
		active ??= info.id;
		const { data } = await client.request("screen", { pane: info.id }, 1e4).catch(() => ({ data: "" }));
		await new Promise((r) => view.term.write(data, r));
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
	/** the brand, the tab bar, the rule under it and the sidebar: everything but the panes */
	function chrome() {
		const l = layout(out.columns || 80, out.rows || 24, split);
		const shown = visible();
		let s = "";
		if (l.brand) s += at(0, 0) + fit("", 1) + brandMark() + `\x1b[90m ${fit(VERSION, 21)}\x1b[0m`;
		bar = tabBarLayout(order.flatMap((id) => {
			const v = views.get(id);
			return v ? [{
				title: v.info.title,
				tone: paneSignal(v.info).tone,
				glyph: glyph(v.info, spin),
				active: id === shown[0],
				shown: shown.includes(id)
			}] : [];
		}), l.tabs.w);
		s += at(l.tabs.x, l.tabs.y) + bar.text;
		if (l.sidebar) s += at(0, 1) + "\x1B[90m" + "─".repeat(28) + "┬\x1B[0m";
		l.panes.forEach((r, i) => {
			const v = shown[i] ? views.get(shown[i]) : void 0;
			if (l.panes.length > 1) {
				const n = order.indexOf(shown[i]) + 1;
				const info = v ? `${n} ${v.info.title} · ${paneDetails(v.info, home, false)}` : "";
				s += at(r.x, r.y) + ruleLine(r.w, i === 0 ? {
					from: -1,
					to: r.w + 1
				} : null, info);
				if (i === 0) s += at(r.x + r.w, r.y) + "\x1B[90m┬\x1B[0m";
			} else {
				const span = bar.spans.find((x) => order[x.index] === shown[0]);
				const back = v ? scrolledBack(v) : 0;
				s += at(r.x, r.y) + ruleLine(r.w, span ?? null, v ? `${back ? `↑ ${back} lines back · ` : ""}${paneDetails(v.info, home)}` : "");
			}
		});
		if (l.sidebar) {
			side = sidebar({
				panes: [...views.values()].map((v) => v.info),
				order,
				active: shown[0] ?? null,
				shown,
				loops: [...loops.values()],
				frame: spin,
				home
			}, l.sidebar.w, l.sidebar.h);
			side.lines.forEach((line, i) => s += at(l.sidebar.x, l.sidebar.y + i) + line + "\x1B[90m│\x1B[0m");
		}
		return s;
	}
	/** where the terminal's cursor goes: the prompt, else the tab's own cursor if it shows one */
	function cursor() {
		const l = layout(out.columns || 80, out.rows || 24, split);
		if (prompt) return at(3 + prompt.label.length + prompt.text.length, l.status.y) + "\x1B[?25h";
		const main = visible()[0] && views.get(visible()[0]);
		if (!main || menu || help || runsView || main.cursorHidden || scrolledBack(main)) return "";
		const b = main.term.buffer.active;
		return at(l.panes[0].x + Math.min(b.cursorX, l.panes[0].w - 1), l.panes[0].y + 1 + b.cursorY) + "\x1B[?25h";
	}
	function draw() {
		frame = null;
		if (restored) return;
		const cols = out.columns || 80;
		const l = layout(cols, out.rows || 24, split);
		let s = "\x1B[?2026h\x1B[?25l" + chrome();
		const shown = visible();
		const area = {
			x: l.panes[0].x,
			y: l.panes[0].y + 1,
			w: l.panes[l.panes.length - 1].x + l.panes[l.panes.length - 1].w - l.panes[0].x,
			h: l.panes[0].h - 1
		};
		if (runsView) s += drawRuns(runsView, area);
		else if (!shown.length) s += welcome(area);
		else shown.forEach((id, i) => {
			const v = views.get(id);
			const r = l.panes[i];
			if (!v || !r) return;
			s += drawTerm(v.term, {
				x: r.x,
				y: r.y + 1,
				w: r.w,
				h: r.h - 1
			}, sel?.pane === id ? sel.s : null);
			if (i === 0 && l.panes[1]) for (let y = 1; y < r.h; y++) s += at(r.x + r.w, r.y + y) + "\x1B[90m│\x1B[0m";
		});
		if (menu) s += popup(area, "New tab", menu.rows, menu.sel, `in ${tailFit(tilde(newTabCwd(), home), 50).trimEnd()}`);
		else if (help) s += popup(area, "Keys · after Ctrl-b", HELP_ROWS, -1, "Drag copies, the wheel scrolls back, tabs and + take clicks.");
		s += at(0, l.status.y) + statusLine(cols);
		out.write(s + cursor() + "\x1B[?2026l");
		spinning();
	}
	/** nothing open yet: what to do, in the pane area */
	function welcome(r) {
		const lines = [
			` ${brandMark()}  \x1b[90mcoding agents side by side\x1b[0m`,
			"",
			` ${ACCENT}^b c\x1b[0m  new tab: an agent or a shell`,
			` ${ACCENT}^b t\x1b[0m  a shell here`,
			` ${ACCENT}^b ?\x1b[0m  every key`,
			"",
			" \x1B[90mor from another terminal:\x1B[0m",
			"   sldev new --agent claude \"fix the failing test\""
		];
		const top = r.y + Math.max(0, Math.floor((r.h - lines.length) / 3));
		let s = "";
		for (let i = 0; i < r.h; i++) s += at(r.x, r.y + i) + " ".repeat(r.w);
		lines.forEach((line, i) => s += at(r.x + 2, top + i) + line);
		return s;
	}
	/** the spinner runs while an agent works, and redraws only the chrome */
	function spinning() {
		const busy = [...views.values()].some((v) => {
			const sig = paneSignal(v.info);
			return sig.tone === "working" && sig.pulse;
		});
		if (busy && !spinTimer && !restored) spinTimer = setInterval(() => {
			spin++;
			if (!frame && !restored) out.write("\x1B[?2026h\x1B[?25l" + chrome() + cursor() + "\x1B[?2026l");
		}, SPIN_MS);
		else if (!busy && spinTimer) {
			clearInterval(spinTimer);
			spinTimer = null;
		}
	}
	function drawRuns(v, r) {
		let s = at(r.x, r.y) + "\x1B[1m" + fit(` Workflows · ${tilde(v.cwd, home)}${v.loading ? " · loading…" : ""}`, r.w) + "\x1B[0m";
		const lines = [];
		if (v.error) lines.push(`\x1b[31m ${fit(v.error, r.w - 1)}\x1b[0m`);
		else if (!v.runs.length) lines.push(fit(v.loading ? " Asking GitHub…" : " No workflow runs yet in this repository.", r.w));
		const now = Date.now();
		const rows = r.h - 2;
		const start = Math.max(0, Math.min(v.sel - Math.floor(rows / 2), v.runs.length - rows));
		if (!v.error) v.runs.slice(start, start + rows).forEach((run, i) => {
			const c = runColumns(run, now);
			const focus = start + i === v.sel;
			lines.push(`${focus ? `${ACCENT}▌\x1b[0m` : " "}\x1b[${TONE_SGR[c.tone]}m●\x1b[0m ${focus ? "\x1B[1m" : ""}${fit(`${c.label.padEnd(9)} ${c.text}`, r.w - 3)}\x1b[0m`);
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
	function statusLine(cols) {
		if (prompt) return ` ${ACCENT}›\x1b[0m [1m` + fit(prompt.label, Math.min(prompt.label.length, cols - 3)) + "\x1B[0m" + fit(prompt.text, Math.max(0, cols - 3 - prompt.label.length));
		if (prefix) return hints(HINTS, cols, " \x1B[1;33m^b\x1B[0m ");
		if (message) return ` \x1b[90m•\x1b[0m ` + fit(message, cols - 3);
		if (menu) return hints(MENU_HINTS, cols, " ");
		if (help) return hints([["any key", "close"]], cols, " ");
		if (runsView) return hints(RUNS_HINTS, cols, " ");
		return hints(HINTS, cols, ` ${ACCENT}^b\x1b[0m `);
	}
	/** a new tab works where the tab in focus works (its worktree), else where sldev was attached */
	const newTabCwd = () => {
		const id = visible()[0];
		return id && views.get(id)?.info.cwd || cwd;
	};
	const newShell = () => {
		client.request("new", {
			shell: true,
			brief: "",
			cwd: newTabCwd(),
			...paneSize()
		}).then((p) => started(p, "shell")).catch((err) => (message = err.message, schedule()));
	};
	const newAgent = (a) => {
		const where = newTabCwd();
		ask(`${a.name}, brief (Enter alone starts it without one): `, (text) => {
			client.request("new", {
				agent: a.id,
				brief: text.trim(),
				cwd: where,
				worktree: false,
				...paneSize()
			}).then((p) => started(p, a.name)).catch((err) => (message = err.message, schedule()));
		});
	};
	/** Ctrl-b c or a click on +: a shell, or one of the agents (the ones not installed say how to get them) */
	const openMenu = () => {
		const agents = allAgents();
		setInstalledBins(agents.flatMap((a) => [a.bin, ...a.aliases ?? []]).filter((b) => findOnPath(b, process.env)));
		const rows = [{
			key: "t",
			text: "Shell",
			note: process.platform === "win32" ? "" : (process.env.SHELL ?? "").split("/").pop()
		}];
		const pick = [newShell];
		agents.forEach((a, i) => {
			const ok = !!installedBin(a);
			rows.push({
				key: i < 9 ? String(i + 1) : "",
				text: a.name,
				note: ok ? "" : "not installed",
				off: !ok
			});
			pick.push(() => ok ? newAgent(a) : void (message = a.install ? `${a.name} isn't installed: ${a.install}` : `${a.name} isn't installed`));
		});
		menu = {
			rows,
			pick,
			sel: Math.max(0, rows.findIndex((r, i) => i > 0 && !r.off))
		};
		help = false;
		message = "";
	};
	/** Keys while the New tab popup is open; returns what is left. */
	function menuKey(s) {
		const m = menu;
		const arrow = /^\x1b\[([AB])/.exec(s) ?? /^\x1bO([AB])/.exec(s);
		if (arrow || s[0] === "j" || s[0] === "k") {
			const up = arrow ? arrow[1] === "A" : s[0] === "k";
			m.sel = Math.max(0, Math.min(m.rows.length - 1, m.sel + (up ? -1 : 1)));
			return s.slice(arrow ? arrow[0].length : 1);
		}
		const c = s[0];
		if (c === "\x1B" || c === "q" || c === "") {
			menu = null;
			return "";
		}
		const i = c === "\r" ? m.sel : m.rows.findIndex((r) => r.key === c);
		if (i >= 0) {
			menu = null;
			m.pick[i]();
		}
		return s.slice(1);
	}
	/** lines a tab is scrolled back from its newest output */
	const scrolledBack = (v) => v.term.buffer.active.baseY - v.term.buffer.active.viewportY;
	const scroll = (v, by) => {
		v.term.scrollLines(by);
		sel = null;
	};
	/** the selection to the clipboard: the system's tool, and OSC 52 for terminals that take it (over SSH too) */
	const copySelection = (v, s) => {
		const text = selectionText(v.term, s);
		if (!text.trim()) return void (sel = null);
		out.write(osc52(text));
		const n = [...text].length;
		(services.copy ?? copyToClipboard)(text).catch(() => false).then((ok) => {
			message = ok ? `Copied ${n} character${n === 1 ? "" : "s"}` : `Sent ${n} characters to the terminal's clipboard (OSC 52); if nothing arrived, install wl-clipboard or xclip`;
			schedule();
		});
	};
	/** A click: on a tab or + in the bar, a row of the sidebar, or inside a tab whose program reads the mouse. */
	function mouse(button, x, y, down) {
		const l = layout(out.columns || 80, out.rows || 24, split);
		const wheel = (button & 64) !== 0;
		const motion = (button & 32) !== 0;
		const shown = visible();
		/** the cell under the mouse in pane i, held inside it (a drag can leave the pane) */
		const cellIn = (i) => {
			const r = l.panes[i];
			return {
				x: Math.max(0, Math.min(r.w - 1, x - r.x)),
				y: Math.max(0, Math.min(r.h - 2, y - r.y - 1))
			};
		};
		if (sel?.dragging) {
			const i = shown.indexOf(sel.pane);
			const v = views.get(sel.pane);
			if (i < 0 || !v) return void (sel = null);
			sel.s.b = cellIn(i);
			if (!down) {
				sel.dragging = false;
				if (sel.s.a.x === sel.s.b.x && sel.s.a.y === sel.s.b.y) sel = null;
				else copySelection(v, sel.s);
			}
			return;
		}
		if (!menu && !help && !runsView) for (let i = 0; i < l.panes.length; i++) {
			const r = l.panes[i];
			const v = shown[i] ? views.get(shown[i]) : void 0;
			if (!v || x < r.x || x >= r.x + r.w || y <= r.y || y >= r.y + r.h) continue;
			const mode = v.term.modes.mouseTrackingMode;
			if (mode === "none") {
				if (wheel) return scroll(v, (button & 1) === 0 ? -3 : WHEEL_LINES);
				if (down && !motion && (button & 3) === 0) sel = {
					pane: v.info.id,
					s: {
						a: cellIn(i),
						b: cellIn(i)
					},
					dragging: true
				};
				return;
			}
			if (mode === "x10" && (!down || wheel || motion) || motion && mode === "vt200") return;
			const [px, py] = [x - r.x + 1, y - r.y];
			const data = v.sgrMouse ? `\x1b[<${button};${px};${py}${down ? "M" : "m"}` : px < 223 && py < 223 ? `\x1b[M${String.fromCharCode(32 + (down ? button : 3), 32 + px, 32 + py)}` : "";
			if (data) client.request("input", {
				pane: v.info.id,
				data
			}).catch(() => void 0);
			return;
		}
		if (!down || wheel || motion || (button & 3) !== 0) return;
		sel = null;
		if (help) return void (help = false);
		if (menu) return void (menu = null);
		if (y === l.tabs.y && x >= l.tabs.x) {
			const bx = x - l.tabs.x;
			if (bar.plus && bx >= bar.plus.from && bx < bar.plus.to) return openMenu();
			const hit = bar.spans.find((t) => bx >= t.from && bx < t.to);
			if (hit && order[hit.index]) {
				if (runsView) closeRuns();
				focusTab(order[hit.index]);
			}
			return;
		}
		if (l.sidebar && x < l.sidebar.x + l.sidebar.w && y >= l.sidebar.y) {
			const id = side.hits[y - l.sidebar.y];
			if (id) {
				if (runsView) closeRuns();
				focusTab(id);
			}
		}
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
			const at = order.indexOf(e.pane);
			order = order.filter((id) => id !== e.pane);
			if (active === e.pane) active = order[Math.min(Math.max(0, at), order.length - 1)] ?? null;
			sizeViews();
			schedule();
		} else if (e.event === "loop") {
			loops.set(e.loop.id, e.loop);
			schedule();
		} else if (e.event === "notify" && !visible().includes(e.pane)) {
			message = `${e.title}: ${e.body}`;
			schedule();
		}
	};
	const select = (i) => {
		if (!order.length) return;
		focusTab(order[(i % order.length + order.length) % order.length]);
	};
	const focusTab = (id) => {
		active = id;
		sel = null;
		message = "";
		saveTabs({ active });
		sizeViews();
		schedule();
	};
	/** the tab in focus one place left or right */
	const move = (by) => {
		const i = activeIndex();
		const j = i + by;
		if (!order.length || j < 0 || j >= order.length) return;
		[order[i], order[j]] = [order[j], order[i]];
		saveTabs({ order });
		sizeViews();
	};
	/** a pane this TUI started comes to the front */
	const started = (p, what) => {
		if (!order.includes(p.id)) order.push(p.id);
		message = `Started ${what} ${p.id}`;
		focusTab(p.id);
	};
	const ask = (label, done, text = "") => {
		prompt = {
			label,
			text,
			done
		};
		schedule();
	};
	let resolveExit = () => void 0;
	const finished = new Promise((r) => resolveExit = r);
	/** Keys can arrive several to a chunk (fast typing, a paste), so the input is taken apart here. */
	const keyLog = process.env.SLDEV_DEBUG_KEYS;
	const onKey = (d) => {
		let rest = d.toString();
		if (keyLog) try {
			appendFileSync(keyLog, `${JSON.stringify({
				at: Date.now(),
				tab: visible()[0] ?? null,
				prefix,
				data: rest
			})}\n`);
		} catch {}
		while (rest && !restored) rest = key(rest);
		schedule();
	};
	/** Handles the start of `s` and returns what is left. */
	function key(s) {
		const m = MOUSE.exec(s);
		if (m) {
			mouse(Number(m[1]), Number(m[2]) - 1, Number(m[3]) - 1, m[4] === "M");
			return s.slice(m[0].length);
		}
		const w = (prompt || prefix || runsView || menu || help) && win32Key(s);
		if (w) {
			let k = w.text;
			while (k && !restored) k = key(k);
			return s.slice(w.len);
		}
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
		if (menu && !prefix) return menuKey(s);
		if (help && !prefix) {
			help = false;
			return s[0] === "\x1B" ? "" : s.slice(1);
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
			menu = null;
			help = false;
			if (c === "?") {
				help = true;
				return s.slice(1);
			}
			if (c === "e" || c === "v") {
				openEditor(c === "v");
				return s.slice(1);
			}
			if (c === "n" || c === "	" || c === "o") select(activeIndex() + 1);
			else if (c === "p") select(activeIndex() - 1);
			else if (/^[1-9]$/.test(c)) {
				if (Number(c) <= order.length) select(Number(c) - 1);
			} else if (c === "<") move(-1);
			else if (c === ">") move(1);
			else if (c === "s") {
				split = !split;
				saveTabs({ split });
				sizeViews();
			} else if (c === "d") {
				detach();
				return "";
			} else if (c === "c" || c === "+") openMenu();
			else if (c === "t") newShell();
			else if (c === "," && id) {
				const info = views.get(id)?.info;
				ask(`Rename tab ${id}: `, (text) => {
					if (text.trim()) client.request("rename", {
						pane: id,
						title: text
					}).catch((err) => (message = err.message, schedule()));
				}, info?.title ?? "");
			} else if (c === "x" && id) {
				const info = views.get(id)?.info;
				const kill = () => void client.request("kill", { pane: id }).catch((err) => (message = err.message, schedule()));
				if (info?.pid === void 0) kill();
				else ask(info.shell ? `Close tab ${id}? Its shell and anything running in it stop. (y/N) ` : `Close tab ${id}? Its agent stops; files stay. (y/N) `, (text) => {
					if (/^y/i.test(text.trim())) kill();
				});
			} else if (c === PREFIX && id) client.request("input", {
				pane: id,
				data: PREFIX
			});
			return s.slice(1);
		}
		const plain = s.indexOf(PREFIX);
		const enc = WIN32_PREFIX.exec(s);
		const useEnc = !!enc && (plain < 0 || enc.index < plain);
		const at = useEnc ? enc.index : plain;
		const click = s.indexOf("\x1B[<");
		const cut = click >= 0 && (at < 0 || click < at) ? click : at;
		const typed = cut < 0 ? s : s.slice(0, cut);
		const id = visible()[0];
		if (typed && id) {
			const v = views.get(id);
			if (v && scrolledBack(v)) v.term.scrollToBottom();
			sel = null;
			client.request("input", {
				pane: id,
				data: typed
			}).catch(() => void 0);
		}
		if (cut < 0) return "";
		if (cut === click) return s.slice(click);
		prefix = true;
		return s.slice(at + (useEnc ? enc[0].length : 1));
	}
	const restore = () => {
		if (restored) return;
		restored = true;
		if (frame) clearTimeout(frame);
		if (spinTimer) clearInterval(spinTimer);
		if (runsView) clearTimeout(runsView.timer);
		input.off("data", onKey);
		if (input.isTTY) input.setRawMode?.(false);
		input.pause();
		out.write("\x1B[?1006l\x1B[?1002l\x1B[?1000l\x1B[0m\x1B[?25h\x1B[?1049l");
	};
	function detach() {
		restore();
		out.write("Detached. The agents keep running; `sldev` attaches again.\n");
		client.close();
		resolveExit();
	}
	/** the size a new pane starts at, so it doesn't redraw as soon as it's shown */
	function paneSize() {
		const r = layout(out.columns || 80, out.rows || 24, split).panes[0];
		return {
			cols: Math.max(20, r.w),
			rows: Math.max(5, r.h - 1)
		};
	}
	const panes = await client.request("attach", {
		cols: out.columns || 80,
		rows: out.rows || 24
	}, 1e4);
	const saved = await client.request("tabs", {}, 1e4).catch(() => null);
	for (const l of await client.request("loops", {}, 1e4).catch(() => [])) loops.set(l.id, l);
	if (saved) {
		order = saved.order.filter((id) => panes.some((p) => p.id === id));
		active = saved.active;
		split = saved.split;
	}
	for (const p of panes) await addView(p);
	if (active === null || !order.includes(active)) active = order[0] ?? null;
	client.onEvent(onEvent);
	client.onClose(() => {
		if (restored) return;
		restore();
		out.write("The sldev daemon stopped.\n");
		resolveExit();
	});
	out.write("\x1B[?1049h\x1B[2J\x1B[?1000h\x1B[?1002h\x1B[?1006h");
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

  sldev                         attach: every agent and shell as a tab, grouped by project, with its status
                                (Ctrl-b c new tab, t shell, 1-9 or n/p tabs, , rename, x close, s split,
                                w workflows, e editor, v changed files, ? every key, d detach; tabs take clicks)
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
  sldev skills [status|install [--overwrite <names>]] skills that let agents draft missions, stories,
                                                       recipes and evals for the sldev-io app
  sldev skills export <dir>                            the same skills as plain folders in <dir>
  sldev skills check <file…>                           read a draft, recipe or eval as the app will
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
	const sig = paneSignal(p);
	const where = p.shell ? "shell" : p.worktree ? p.worktree.branch : "in place";
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
	const restarted = (was) => void process.stderr.write(`sldev: replaced the background daemon from ${was} with ${VERSION}\n`);
	const client = () => connect({
		dataDir: data,
		script: script(),
		onRestart: restarted
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
				start: false,
				check: false
			}).catch(() => null);
			const known = c ? await Promise.all([c.request("ls", {}, 5e3), c.request("loops", {}, 5e3)]).catch(() => null) : [[], []];
			if (!known) {
				c?.close();
				return fail("the running sldev daemon is from another version and could not say what it runs; sldev stop first, then sldev clean");
			}
			const [panes, loopList] = known;
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
				start: false,
				check: false
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
		case "skills": {
			const { values, positionals } = opts({ overwrite: { type: "string" } });
			const root = await projectRoot(process.cwd());
			const sub = positionals[0] ?? "status";
			if (sub === "status") return void console.log(await skillsStatus(root));
			if (sub === "install") return void console.log(await skillsInstall(root, list(values.overwrite)));
			if (sub === "export" && positionals[1]) return void console.log(await skillsExport(positionals[1]));
			if (sub === "check" && positionals[1]) {
				const r = await skillsCheck(positionals.slice(1));
				console.log(r.text);
				if (!r.ok) process.exitCode = 1;
				return;
			}
			return fail("sldev skills [status|install|export <dir>|check <file…>]");
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
