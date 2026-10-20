/**
 * Every shipped step is refused `git push`, a forced branch delete, a kill by name (`pkill`, `killall`) and Playwright's
 * `browser_run_code_unsafe` by its own fence, and the checkout's `.claude/settings.json` refuses none of them: the settings bind a
 * person's own session in this checkout too, and a person may ask their session to push.
 *
 * The guard reads every workflow folder `shippedFolders` finds under `SHIPPED_HOLDERS`: the repository's `workflows/`, this repository's
 * own team, and the package's own, none on disk. It holds the tests' team (`team.ts`) to the same fence: each refusal below is made on
 * the team, cut back, and on a watcher's step written here, so whatever is shipped is held by a guard proven to refuse.
 *
 * Each step is read at shipped defaults, as `wf start` freezes it (`loadWorkflows`). A step in `auto` — the engine's default — runs
 * whatever no deny names, so its own `disallowedTools` must name each call. A step in `dontAsk` runs only what an allow reaches, so
 * no rule of its `allowedTools`, of the settings' allow or of a skill's `allowed-tools` may reach one. A step that reads settings the
 * repository does not ship — a background session reads the person's user settings, and a job in the checkout itself that checkout's
 * working-tree `.claude/settings.json`, which a person may have edited — may be allowed anything there, so it too must name each call
 * itself. A step on codex is fenced by a
 * read-only sandbox. The matcher is Claude Code's rule shapes this suite relies on, and throws on a wildcard it does not model, so an
 * allow it cannot read fails the test rather than passing it. A command is matched part by part, as Claude Code matches it (`partsOf`):
 * a deny of any part refuses the whole, and a dontAsk step runs it only when an allow reaches every part.
 *
 * A fence also reaches the run's artifacts folder: each step is filed the folder of every step it comes after, read-only
 * (`handedMounts`), and reads what it holds and writes none of it, in any mode; it is filed no folder of a step it does not come after.
 * The reach is read off the config a filing gives the harness (`filedConfig`), as Claude Code holds a mount (`readsAt`, `writesAt`). So
 * does the store's inbox, for a step whose `reads:` names it (`readsMounts`): read-only, in any mode, and to no other step.
 *
 * Agora, the reviewer, asks git's read-only questions by its own allow, whatever the settings say, and runs no git write (`GIT_QUESTIONS`,
 * `GIT_WRITES`, `runs`); every git question its skill names is one that allow reaches (`askedGit`). Its step is refused the whole suite
 * its round's check already ran by a deny of its own of each spelling (`WHOLE_SUITE`), and runs a package's tests and a file's
 * (`SCOPED_TESTS`). An agent's fence names no command of this repository: the checks a step names in its note are allowed by the
 * settings (`CHECKERS`, `unallowed`), and the denies that answer those allows are the step's own.
 * The render of a checkout's dashboards (`tools/observe/render/render.ts`) starts a container, so it is the implementer's alone: design
 * and review are refused each form of it and Docker by hand, since no allow reaches one (`RENDERS`, `DOCKER`).
 * Implement and land, which run what no deny names, deny the live collector by its two ports on their own line, each beside every deny
 * of its agent's (`LIVE_COLLECTOR`, `COLLECTOR_FENCED`). A deny is matched against a part as typed too, its leading assignment kept
 * (`deniedPartsOfCall`), as Claude Code was measured to match one; an allow against the unwrapped part alone.
 *
 * Seldon and Agora drive the browser: each allows every tool of its server by name on its own file (`BROWSER_TOOLS`), never the server
 * whole (`wholeServers`), and denies `browser_run_code_unsafe`; the design and review steps name the server, deny the live board by its
 * address (`LIVE_BOARD`) and name the two commands that serve a board of the change (`BOARD_CHECKS`), which the settings allow. Agent
 * and step alike deny a `filename` to each browser tool that takes one (`NAMED_FILES`): a file named could be the workspace's.
 *
 * Nemia, the store's own agent, ships outside any workflow folder (`nemia/nemia.md`) and runs in the background, reading the person's user
 * settings: she is held to the same fence by her own deny, and to `git merge` and a pull request merged by `gh` besides; a mode but
 * `auto` is refused her (`readNemia`). Her rules are those her keeper files (`herRules`): the fence derived from the table's classes
 * (`nemiaFence`) asks every write that prompts and every write form of a command that reads bare, denies her what is out of her reach,
 * and lets the rest through (`misjudged`); her admission asks every answer to what waits on the person, whatever the person allows
 * (`verdictOf`); and an edit of the store outside her folder is denied her (`editVerdictOf`).
 *
 * The build workflow's design, implement and review steps each list `effect`, `shadcn` and `change-the-board` to their sessions
 * (`workSkillsMissing`), and every path a repository skill says its work is on matches a file of the checkout (`appliesUnmatched`).
 * A dontAsk job given a skill whose SKILL.md grants tools is told to read that file with Read, since its fence refuses the Skill tool's
 * load (`grantingSkillsUnread`). Each call a shipped skill's rule says it breaks is one the stats count against it (`rulesOfTry`).
 *
 * Every shipped step's `tools:` is callable under its own fence (`unallowedRefusal`), judged against this checkout's own allow rules:
 * a step held to its rules and given a tool no rule names could never call it, and the refusals would read in the feed like a fence
 * doing its job. The same steps with no project rule refuse, naming which agents the checkout's settings are covering
 * (`COVERED_BY_SETTINGS`): what makes them pass here is the repository, not the folder, so a factory elsewhere must allow those calls
 * itself.
 *
 * A skill a shipped step names with its folder (`apps/web:ds-build`) is read where the line says: the folders those lines name
 * (`NESTED`) are among the folders of skills whose grants, files and rules are read (`SKILL_FOLDERS`, `skillFileOf`, `lineNameOf`).
 * The reader of the kit's `ds-spec` is a command design's and review's notes name (`reader` in `CHECKERS`), the one the trigger skill
 * names (`KIT_COMMAND`), and the settings allow it (`KIT_ALLOW`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadWorkflows } from '../src/folder/folder.store.ts';
import type { Workflow } from '../src/step/step.ts';
import { readSkillRules, RULES_FILE } from '../src/skills/read.store.ts';
import { appliesMatch, appliesOf, type SkillRule } from '../src/skills/skills.ts';
import { filedConfig, inputsMounts, readsMounts } from '../src/filed/filed.ts';
import { handedMounts } from '../src/artifacts/artifacts.ts';
import { isFolderTeam, sandboxed, unallowedRefusal, upstreamOf } from '../src/workflow/index.ts';
import { scratch } from './scratch.ts';
import { declared } from '../place/git/declared.ts';
import { levelFile, promptFile, readNemia, storeDenies, toldFile } from '../src/nemia/level.store.ts';
import { admissionOf, nemiaFence, widened } from '../src/admission/index.ts';
import { TABLE } from '../src/command/commands.verb.ts';
import { rulesOfTry } from '../src/stats/discipline.ts';
import { givenSkillOf } from '../src/keys/given-skill.ts';
import { placesOf, shippedFolders, SHIPPED_HOLDERS, TEAM, TEAM_DEV, teamCopy } from './team.ts';

const REPO = path.join(import.meta.dirname, '..', '..', '..');

/** Every shipped workflow folder, read off the disk: this repository's own team's, under its `workflows/`. */
const FOLDERS = shippedFolders();

/** Every shipped agents folder there is: each agent in it is named by a step of a shipped folder. */
const AGENT_FOLDERS = SHIPPED_HOLDERS.map((holder) => path.join(holder, 'agents')).filter((dir) => fs.existsSync(dir));

/** Each folder of the repository a shipped step's skills name before a skill's name (`folder:name`), once: `apps/web`. */
const NESTED = [
  ...new Set(
    FOLDERS.flatMap((dir) => loadWorkflows(dir, placesOf(dir)))
      .flatMap((step) => step.agent?.skills ?? [])
      .flatMap((skill) => givenSkillOf(skill)?.folder ?? []),
  ),
];

/** The folders of skills of `NESTED` in the checkout `root`, each where a session there finds it. */
const nestedSkillFolders = (root: string): string[] => NESTED.map((folder) => path.join(root, folder, '.claude', 'skills'));

/**
 * Every folder of skills a step may load, whose `allowed-tools` a loaded skill grants the session: the repository's, those of its
 * folders a shipped step names (`NESTED`), shipped, the team's.
 */
const SKILL_FOLDERS = [
  path.join(REPO, '.claude', 'skills'),
  ...nestedSkillFolders(REPO),
  ...SHIPPED_HOLDERS.map((holder) => path.join(holder, 'skills')),
  path.join(TEAM, 'skills'),
].filter((dir) => fs.existsSync(dir));

type Settings = { permissions?: { allow?: string[]; deny?: string[] } };
const SETTINGS = JSON.parse(fs.readFileSync(path.join(REPO, '.claude', 'settings.json'), 'utf8')) as Settings;

/**
 * A call a session makes: a shell command, or a tool by its name, an edit or a write with the absolute path it writes when one is said, a
 * browser tool with the address it opens or the file it is told to write when one is given, a fetch with the host it reads.
 */
type Call =
  | { tool: 'Bash'; command: string; path?: undefined; url?: undefined; filename?: undefined; domain?: undefined }
  | { tool: string; command?: undefined; path?: string; url?: string; filename?: string; domain?: string };

/** The parameters of an MCP tool a rule may name here, each read off the call as it wrote it. */
const MCP_PARAMS = ['url', 'filename'] as const;

/** Every parameter a rule may name here: an MCP tool's, and the host `WebFetch` reads. */
const PARAMS = [...MCP_PARAMS, 'domain'] as const;

/** What no shipped step may run, in the spellings a session types. */
const FENCED: Call[] = [
  { tool: 'Bash', command: 'git push' },
  { tool: 'Bash', command: 'git push origin main' },
  { tool: 'Bash', command: 'git push --force origin wf/r-1/implement' },
  { tool: 'Bash', command: 'git branch -D wf/r-1/implement' },
  { tool: 'Bash', command: 'git branch --delete --force wf/r-1/implement' },
  { tool: 'Bash', command: 'pkill -f "turbo run test"' },
  { tool: 'Bash', command: 'killall node' },
  { tool: 'Bash', command: 'cd packages/agent-orchestrator && pkill -f "turbo run test"' },
  { tool: 'Bash', command: 'timeout 5 pkill -f turbo' },
  { tool: 'Bash', command: 'true; killall node' },
  { tool: 'Bash', command: 'gh pr create --title x --body y' },
  { tool: 'Bash', command: 'gh pr merge 7 --merge' },
  { tool: 'Bash', command: 'gh pr edit 7 --body x' },
  { tool: 'Bash', command: 'gh pr ready 7' },
  { tool: 'Bash', command: 'gh pr close 7' },
  { tool: 'Bash', command: 'gh pr comment 7 -b x' },
  { tool: 'Bash', command: 'gh pr review 7 --approve' },
  { tool: 'Bash', command: 'gh api -X POST repos/o/r/pulls' },
  { tool: 'Bash', command: 'gh repo delete o/r' },
  { tool: 'Bash', command: 'gh release create v1' },
  { tool: 'Bash', command: 'gh workflow run ci.yml' },
  { tool: 'Bash', command: 'gh run rerun 1' },
  { tool: 'mcp__playwright__browser_run_code_unsafe' },
];

/**
 * A session a step could start of its own by hand, its name no run's, in the spellings a session types: in the background, or reaching
 * the person's phone through Remote Control. A step starts a probe through `workflows/build/probe.ts`, which names it for its run.
 */
const PROBES: Call[] = [
  { tool: 'Bash', command: 'claude --bg --remote-control -n probe-A "x"' },
  { tool: 'Bash', command: 'claude --bg -n x "p"' },
  { tool: 'Bash', command: 'claude --background --name x "p"' },
  { tool: 'Bash', command: 'claude -n x --bg "p"' },
  { tool: 'Bash', command: 'claude remote-control' },
  { tool: 'Bash', command: 'claude --remote-control probe' },
  { tool: 'Bash', command: 'cd /tmp && claude --bg x' },
  { tool: 'Bash', command: 'timeout 60 claude --bg x' },
];

/** The home folder `~` is in an edit rule, for the paths the calls below write. */
const HOME = '/home/u';

/** A file outside every worktree that a harness reads as its trust or its settings: no step of this team edits it to make a probe run. */
const HARNESS_FILES = [`${HOME}/projects/.claude/settings.local.json`, `${HOME}/.claude.json`, `${HOME}/.claude/settings.json`];

/** A file of a step's own worktree. */
const OWN_FILE = `${HOME}/.agent-workflows/worktrees/r-1/design/src/a.ts`;

/** A call as a rule would name it, for a message. */
const shown = (call: Call): string => {
  if (call.command !== undefined) return `Bash(${call.command})`;
  const param = PARAMS.find((name) => call[name] !== undefined);
  return param === undefined ? call.tool : `${call.tool}(${param}:${call[param]})`;
};

/**
 * Whether a permission rule reaches a call: a bare tool name is that tool, `mcp__<server>` or `mcp__<server>__*` every tool of the
 * server, `Bash(x)` the command `x` exactly, and `Bash(x:*)` or `Bash(x *)` the command `x` or `x` followed by a space and more; a `*`
 * inside a Bash rule is any run of characters, none included (`globbed`). Any other `Tool(x)` reaches some call of that tool, so it is
 * read as reaching every one, unless the call says the path it writes: then `Edit(//<glob>)` and `Edit(~/<glob>)` reach it when the glob
 * covers it (`covers`). Claude Code matches a write against `Edit` rules, so an `Edit` rule reaches `Write` too. A rule on an MCP tool's
 * parameter, `mcp__<server>__<tool>(url:<glob>)` or `(filename:<glob>)`, reaches a call of that tool whose parameter the glob covers
 * whole, each `*` any run of characters, compared as the call wrote it, and no call that gives none: so Claude Code was measured to
 * read one in a deny list, and an allow list is read through `granting`, which refuses one. A rule on `WebFetch`'s host,
 * `WebFetch(domain:<host>)`, reaches a fetch of exactly that host and no other, and no fetch that says none; a bare `WebFetch` reaches
 * every one. Throws on a `*` in a tool's name and on any other parameter, which this matcher does not model.
 */
function reaches(rule: string, call: Call): boolean {
  const bash = /^Bash\((.*)\)$/s.exec(rule)?.[1];
  if (bash === undefined) {
    const tool = rule.includes('(') ? rule.slice(0, rule.indexOf('(')) : undefined;
    if (tool?.startsWith('mcp__')) {
      const said = rule.slice(tool.length + 1, -1);
      const param = MCP_PARAMS.find((name) => said.startsWith(`${name}:`));
      if (param === undefined || tool.includes('*'))
        throw new Error(
          `${rule}: a parameter rule on an MCP tool is modelled for \`url:\` and \`filename:\` alone; say how it reads, here`,
        );
      const given = call[param];
      return tool === call.tool && given !== undefined && globbed(said.slice(param.length + 1), false).test(given);
    }
    if (tool === 'WebFetch') {
      const said = rule.slice(tool.length + 1, -1);
      if (!said.startsWith('domain:'))
        throw new Error(`${rule}: a rule on WebFetch is modelled for \`domain:\` alone; say how it reads, here`);
      return call.tool === 'WebFetch' && call.domain === said.slice('domain:'.length);
    }
    const pathed = call.path !== undefined && tool !== undefined;
    if (pathed && (tool === call.tool || (call.tool === 'Write' && tool === 'Edit')))
      return covers(rule.slice(tool.length + 1, -1), call.path!);
    if (call.tool === 'Write' && (rule === 'Edit' || tool === 'Edit')) return true;
    if (tool !== undefined) return tool === call.tool && call.command === undefined;
    const server = rule.startsWith('mcp__') ? rule.replace(/__\*$/, '') : undefined;
    if (server !== undefined && !server.includes('*') && server.split('__').length === 2)
      return rule === call.tool || call.tool.startsWith(`${server}__`);
    if (rule.includes('*')) throw new Error(`${rule}: a wildcard in a tool name is not modelled; say how it reads, here`);
    return rule === call.tool;
  }
  if (call.command === undefined) return false;
  const prefix = /^(.*?)(?::\*| \*)$/s.exec(bash)?.[1];
  const exact = prefix ?? bash;
  if (exact.includes('*')) return globbed(exact, prefix !== undefined).test(call.command);
  return prefix === undefined ? call.command === bash : call.command === prefix || call.command.startsWith(`${prefix} `);
}

/**
 * The words of a Bash rule with a `*` inside them, as a pattern of the whole command: each `*` any run of characters, none included;
 * `open`, where the rule ends in `:*` or ` *`, the words alone or followed by a space and more.
 */
const globbed = (words: string, open: boolean): RegExp =>
  new RegExp(
    `^${words
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('[\\s\\S]*')}${open ? '(?: [\\s\\S]*)?' : ''}$`,
  );

/**
 * Whether the path of a file rule covers the absolute path `file`: `//<glob>` from the root, `~/<glob>` from `HOME`; in the glob `**\/`
 * is any run of folders, none included, `**` any run of characters, and `*` any run within a folder's name. Throws on a path from the
 * project or the working folder, which this matcher does not model.
 */
function covers(rulePath: string, file: string): boolean {
  const from = rulePath.startsWith('//') ? rulePath.slice(1) : rulePath.startsWith('~/') ? `${HOME}${rulePath.slice(1)}` : undefined;
  if (from === undefined)
    throw new Error(`${rulePath}: a path from the project or the working folder is not modelled; say how it reads, here`);
  const pattern = from
    .split(/(\*\*\/|\*\*|\*)/)
    .map((part) =>
      part === '**/' ? '(?:.*/)?' : part === '**' ? '.*' : part === '*' ? '[^/]*' : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('');
  return new RegExp(`^${pattern}$`).test(file);
}

/**
 * The rules of an allow list as this matcher may read them: all of them. Throws on a rule on an MCP tool's parameter, which Claude Code
 * was measured to read in a deny list alone: what such a rule allows is not modelled, and a guess would make a fence pass for nothing.
 */
function granting(rules: readonly string[]): readonly string[] {
  const odd = rules.find((rule) => /^mcp__[^(]*\(/.test(rule));
  if (odd !== undefined)
    throw new Error(`${odd}: a parameter rule on an MCP tool in an allow list is not modelled; say how it reads, here`);
  return rules;
}

/** A wrapper Claude Code strips before it matches a part: a leading assignment, `timeout` with its duration, `nohup`. */
const WRAPPER = /^(?:[A-Za-z_]\w*=\S*|timeout \d+(?:\.\d+)?[smhd]?|nohup)\s+/;

/** A part with every leading wrapper stripped (`WRAPPER`). */
function unwrapped(part: string): string {
  let rest = part.trim();
  let wrapper = WRAPPER.exec(rest);
  while (wrapper) {
    rest = rest.slice(wrapper[0].length).trimStart();
    wrapper = WRAPPER.exec(rest);
  }
  return rest;
}

/**
 * The parts of a shell command as typed: split on `&&`, `||`, `;`, `|&`, `|`, `&` and a newline outside quotes, each trimmed. Throws on
 * a substitution, a redirection, an escape, an unclosed quote or a separator inside quotes, which this matcher does not model.
 */
function typedPartsOf(command: string): string[] {
  if (/\$\(|[`<>\\]/.test(command))
    throw new Error(`${command}: a substitution, redirection or escape is not modelled; say how it reads, here`);
  const tokens = [...command.matchAll(/'[^']*'|"[^"]*"|&&|\|\||\|&|[;|&\n]|[^'"&|;\n]+/g)].map((token) => token[0]);
  const quoted = tokens.filter((token) => /^['"]/.test(token));
  if (tokens.join('') !== command || quoted.some((token) => /[;&|\n]/.test(token)))
    throw new Error(`${command}: an unclosed quote or a separator inside quotes is not modelled; say how it reads, here`);
  const parts = [''];
  for (const token of tokens)
    if (/^(?:&&|\|\||\|&|[;|&\n])$/.test(token)) parts.push('');
    else parts[parts.length - 1] += token;
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** The parts of a shell command Claude Code matches an allow against: each part as typed (`typedPartsOf`), `unwrapped`. */
const partsOf = (command: string): string[] => typedPartsOf(command).map(unwrapped).filter(Boolean);

/** A call as the parts Claude Code matches an allow against: each part of a shell command (`partsOf`), or the tool call itself. */
const partsOfCall = (call: Call): Call[] =>
  call.command === undefined ? [call] : partsOf(call.command).map((command) => ({ tool: 'Bash', command }) as const);

/**
 * A call as the parts Claude Code matches a deny against: each part of a shell command unwrapped, and as typed too, its leading
 * assignment and wrappers kept, so a deny of what an assignment says reaches it; or the tool call itself.
 */
const deniedPartsOfCall = (call: Call): Call[] =>
  call.command === undefined
    ? [call]
    : [...new Set([...partsOf(call.command), ...typedPartsOf(call.command)])].map((command) => ({ tool: 'Bash', command }) as const);

/** A SKILL.md's `allowed-tools`, split on commas: what a session that loads the skill may run without asking. */
function allowedToolsOf(file: string): string[] {
  const front = /^---\n([\s\S]*?)\n---/.exec(fs.readFileSync(file, 'utf8'))?.[1] ?? '';
  const line = /^allowed-tools:(.*)$/m.exec(front)?.[1]?.trim();
  if (line === undefined) return [];
  if (line === '' || line.startsWith('[')) throw new Error(`${file}: allowed-tools is not one line of rules; read its shape here`);
  return line.split(/,\s*/).filter(Boolean);
}

/** Every grant of every skill of the folders of skills `folders`. */
const grantsOf = (folders: readonly string[]): string[] =>
  folders.flatMap((dir) =>
    fs
      .readdirSync(dir)
      .map((name) => path.join(dir, name, 'SKILL.md'))
      .filter((file) => fs.existsSync(file))
      .flatMap(allowedToolsOf),
  );

/** Every skill's grants, from every folder a shipped step may load one from. */
const SKILL_GRANTS = grantsOf(SKILL_FOLDERS);

type Step = ReturnType<typeof loadWorkflows>[number];

/**
 * What of `calls` (`FENCED` by default) a step could run, each as `<step>: <call>`; empty for a step fenced from all of it. A dontAsk
 * job runs what an allow reaches: its own, `settings`' and `grants`, a skill's.
 */
function unfenced(step: Step, settings: Settings = SETTINGS, calls: Call[] = FENCED, grants: readonly string[] = SKILL_GRANTS): string[] {
  const harness = step.harness ?? 'claude';
  if (harness === 'codex')
    return step.sandbox === 'read-only' ? [] : [`${step.name}: on codex in sandbox ${step.sandbox ?? 'workspace-write'}, not read-only`];
  if (harness !== 'claude' && harness !== 'claude-detached')
    return [`${step.name}: on ${harness}, which this test does not know how to fence`];
  const denies = [...(step.disallowedTools ?? []), ...(settings.permissions?.deny ?? [])];
  const allows = granting([...(step.allowedTools ?? []), ...(settings.permissions?.allow ?? []), ...grants]);
  const unshipped = step.background === true || step.workspace === 'main';
  const dontAsk = step.permissionMode === 'dontAsk' && !unshipped;
  return calls
    .filter((call) => {
      if (deniedPartsOfCall(call).some((part) => denies.some((rule) => reaches(rule, part)))) return false;
      return !dontAsk || partsOfCall(call).every((part) => allows.some((rule) => reaches(rule, part)));
    })
    .map((call) => `${step.name}: ${shown(call)}`);
}

/**
 * The commands a step's file or a skill's names, `file` by its path from the repository's root: every backticked span `spans` matches (an
 * `npm …` or `npx …` one by default) in its paragraph that starts at `from`, up to the next blank line or numbered item. Throws, naming
 * the file, when `from` is not in it.
 */
function checksOf(file: string, from: string, spans = /`(np[mx]\s[^`]*)`/g): string[] {
  const text = fs.readFileSync(path.join(REPO, file), 'utf8');
  const start = text.indexOf(from);
  if (start < 0) throw new Error(`${file}: no "${from}" to read its checks from; name the line its checks are on, here`);
  const rest = text.slice(start);
  const end = /\n\s*\n|\n\d+\.\s/.exec(rest)?.index ?? rest.length;
  return [...rest.slice(0, end).matchAll(spans)].map((span) => span[1].replace(/\s+/g, ' '));
}

/** The settings' allows, which name this repository's commands for every session in it: an agent's own fence names none. */
const SETTINGS_ALLOWS = SETTINGS.permissions?.allow ?? [];

/** The commands a step's fence would refuse: reached by no allow of its own or of the settings' `allowed`, or by a deny of its own. */
function unallowed(step: Step, commands: string[], allowed: readonly string[] = SETTINGS_ALLOWS): string[] {
  const allows = granting([...(step.allowedTools ?? []), ...allowed]);
  return commands.filter((command) => {
    const call = { tool: 'Bash', command } as const;
    return !allows.some((rule) => reaches(rule, call)) || (step.disallowedTools ?? []).some((rule) => reaches(rule, call));
  });
}

/** Every step of every shipped folder, by its folder. */
const shipped = (): { dir: string; step: Step }[] =>
  FOLDERS.flatMap((dir) => loadWorkflows(dir, placesOf(dir)).map((step) => ({ dir, step })));

/** The step of the tests' team that names an agent, as its folder resolves it. */
const stepOf = (agent: string): Step => loadWorkflows(TEAM_DEV).find((step) => step.agent?.name === agent)!;

/** A folder of steps written from their frontmatter and a one-line body, beside no agents. */
const folderOf = (steps: Record<string, string>): string => {
  const dir = scratch('wf-fences-folder-');
  for (const [name, front] of Object.entries(steps))
    fs.writeFileSync(path.join(dir, `${name}.md`), `---\nplace: git\n${front}\n---\n${name} it\n`);
  return dir;
};

test('the matcher reads the rule shapes the fences use, and throws on a wildcard it does not model', () => {
  const push = { tool: 'Bash', command: 'git push origin main' } as const;
  assert.equal(reaches('Bash(git push:*)', push), true);
  assert.equal(reaches('Bash(git push *)', push), true);
  assert.equal(reaches('Bash(git push)', push), false, 'a rule with no wildcard is the command exactly');
  assert.equal(reaches('Bash(git push)', { tool: 'Bash', command: 'git push' }), true);
  assert.equal(reaches('Bash(git pu:*)', push), false, 'a prefix ends at a word');
  assert.equal(reaches('Bash(git:*)', push), true);
  assert.equal(reaches('Bash', push), true, 'a bare Bash is every command');
  assert.equal(reaches('Bash(git branch --list:*)', { tool: 'Bash', command: 'git branch -D x' }), false);
  const unsafe = { tool: 'mcp__playwright__browser_run_code_unsafe' };
  assert.equal(reaches('mcp__playwright__browser_run_code_unsafe', unsafe), true);
  assert.equal(reaches('mcp__playwright', unsafe), true, 'a server is every tool of it');
  assert.equal(reaches('mcp__playwright__*', unsafe), true);
  assert.equal(reaches('mcp__playwright__browser_navigate', unsafe), false);
  assert.equal(reaches('Bash(git push:*)', unsafe), false);
  assert.equal(reaches('Edit(**)', { tool: 'Edit' }), true, 'an edit rule on any path reaches an edit');
  assert.equal(reaches('Edit(src/**)', { tool: 'Write' }), true, 'a write is matched against Edit rules');
  assert.equal(reaches('Edit', { tool: 'Write' }), true);
  assert.equal(reaches('Read(**)', { tool: 'Edit' }), false);
  assert.equal(reaches('Edit(**)', push), false);
  assert.equal(reaches('Bash(git * main)', push), true, 'a * inside a rule is any run of characters');
  assert.equal(reaches('Bash(git * main)', { tool: 'Bash', command: 'git push origin main2' }), false, 'up to the end of the command');
  const store = 'Bash(nemia factory instruction *--store*)';
  assert.equal(reaches(store, { tool: 'Bash', command: 'nemia factory instruction f --store' }), true);
  assert.equal(reaches(store, { tool: 'Bash', command: 'nemia factory instruction --store f' }), true, 'and none');
  assert.equal(reaches(store, { tool: 'Bash', command: 'nemia factory instruction f' }), false);
  assert.equal(reaches('Bash(git (x) *.md)', { tool: 'Bash', command: 'git (x) a.md' }), true, "a rule's other characters are its own");
  assert.equal(reaches('Bash(git (x) *.md)', { tool: 'Bash', command: 'git (x) a_md' }), false);
  const fetch = { tool: 'WebFetch', domain: 'code.claude.com' } as const;
  assert.equal(reaches('WebFetch(domain:code.claude.com)', fetch), true);
  assert.equal(reaches('WebFetch(domain:docs.claude.com)', fetch), false, 'a rule on a host is that host alone');
  assert.equal(reaches('WebFetch(domain:claude.com)', fetch), false, 'a host is matched whole, never as a suffix');
  assert.equal(reaches('WebFetch(domain:code.claude.com)', { tool: 'WebFetch' }), false, 'and reaches no fetch that says no host');
  assert.equal(reaches('WebFetch', fetch), true, 'a bare WebFetch is every host');
  assert.equal(reaches('WebFetch(domain:code.claude.com)', { tool: 'WebSearch' }), false);
  assert.throws(
    () => reaches('mcp__play*', unsafe),
    (err: Error) => err.message.includes('not modelled'),
  );
  assert.throws(
    () => reaches('WebFetch(url:https://code.claude.com/docs)', fetch),
    (err: Error) => err.message.includes('a rule on WebFetch is modelled for `domain:` alone'),
  );
});

test('the matcher reads a rule on a browser tool by the address it opens, as written, and throws on a parameter it does not model', () => {
  const live = 'mcp__playwright__browser_navigate(url:*:8787*)';
  const to = (url?: string): Call => ({ tool: 'mcp__playwright__browser_navigate', url });
  for (const url of ['http://127.0.0.1:8787/', 'localhost:8787', 'http://[::1]:8787/runs', 'http://localhost:8787'])
    assert.equal(reaches(live, to(url)), true, url);
  assert.equal(reaches(live, to('http://127.0.0.1:41234/')), false, 'another port');
  assert.equal(reaches(live, to('http://127.0.0.1:18787/')), false, "the colon is the port's");
  assert.equal(reaches(live, to()), false, 'a call that gives no address is matched by no parameter rule');
  assert.equal(reaches(live, { tool: 'mcp__playwright__browser_tabs', url: 'http://127.0.0.1:8787/' }), false, "a rule is one tool's");
  assert.equal(reaches('mcp__playwright__browser_navigate', to('http://127.0.0.1:8787/')), true, 'a bare name is every call of it');
  assert.equal(reaches('mcp__playwright', to('http://127.0.0.1:8787/')), true);
  assert.equal(shown(to('http://127.0.0.1:8787/')), 'mcp__playwright__browser_navigate(url:http://127.0.0.1:8787/)');
  for (const rule of ['mcp__playwright__browser_evaluate(function:*)', 'mcp__playwright__*(url:*)'])
    assert.throws(
      () => reaches(rule, to('http://127.0.0.1:8787/')),
      (err: Error) => err.message.includes('modelled for `url:` and `filename:` alone'),
      rule,
    );
  const named = 'mcp__playwright__browser_take_screenshot(filename:*)';
  const shot = (filename?: string): Call => ({ tool: 'mcp__playwright__browser_take_screenshot', filename });
  for (const filename of ['x.png', 'a/x.png', '/tmp/playwright-mcp/x.png']) assert.equal(reaches(named, shot(filename)), true, filename);
  assert.equal(reaches(named, shot()), false, 'a picture given no name is matched by no rule on its name');
  assert.equal(reaches(named, { tool: 'mcp__playwright__browser_snapshot', filename: 'x.yml' }), false);
  assert.equal(shown(shot('x.png')), 'mcp__playwright__browser_take_screenshot(filename:x.png)');
});

test("REFUSED: a rule on an MCP tool's parameter in an allow list is not read as allowing anything: the matcher throws on it", () => {
  const reviewer = stepOf('reviewer');
  const call = [{ tool: 'mcp__playwright__browser_navigate', url: 'http://127.0.0.1:41234/' }];
  const allowed = {
    ...reviewer,
    allowedTools: [...(reviewer.allowedTools ?? []), 'mcp__playwright__browser_navigate(url:http://127.0.0.1:*)'],
  };
  const unmodelled = (err: Error) => err.message.includes('in an allow list is not modelled');
  assert.throws(() => runs(allowed, call), unmodelled);
  assert.throws(() => unfenced(allowed), unmodelled);
  assert.throws(() => unallowed(allowed, ['npm run lint']), unmodelled);
  assert.throws(
    () => runs(reviewer, call, { permissions: { allow: ['mcp__playwright__browser_tabs(url:*)'] } }),
    unmodelled,
    'nor in the settings',
  );
  assert.deepEqual(
    runs({ ...reviewer, disallowedTools: ['mcp__playwright__browser_navigate(url:*:8787*)'] }, call),
    [],
    'a deny list reads one',
  );
});

test('the matcher splits a command into the parts Claude Code matches, strips the wrappers it strips, and throws on a form it does not model', () => {
  assert.deepEqual(partsOf('cd packages/agent-orchestrator && pkill -f "turbo run test"'), [
    'cd packages/agent-orchestrator',
    'pkill -f "turbo run test"',
  ]);
  assert.deepEqual(partsOf('a || b; c | d |& e & f\ng'), ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  assert.deepEqual(partsOf('timeout 5 pkill -f turbo'), ['pkill -f turbo']);
  assert.deepEqual(partsOf('FOO=1 nohup timeout 2.5s killall node'), ['killall node']);
  assert.deepEqual(partsOf('true &'), ['true'], 'a command sent to the background is its own part');
  assert.deepEqual(partsOf("bash -c 'pkill -f x'"), ["bash -c 'pkill -f x'"], 'a shell started by a command is one part');
  assert.deepEqual(partsOf('timeoutx pkill'), ['timeoutx pkill'], 'a wrapper is a whole word');
  for (const command of ['kill $(pgrep -f turbo)', 'kill `pgrep -f turbo`', "bash -c 'a; pkill x'", 'npm test 2>&1', 'echo "a'])
    assert.throws(
      () => partsOf(command),
      (err: Error) => err.message.includes('not modelled'),
      command,
    );
  const compound = { tool: 'Bash', command: 'cd packages/agent-orchestrator && pkill -f "turbo run test"' } as const;
  assert.equal(reaches('Bash(pkill:*)', compound), false, 'a rule matched against the whole command misses the part');
  assert.ok(partsOfCall(compound).some((part) => reaches('Bash(pkill:*)', part)));
  assert.deepEqual(partsOfCall({ tool: 'Edit' }), [{ tool: 'Edit' }]);
  const assigned: Call = { tool: 'Bash', command: 'true && X=http://localhost:4318 timeout 5 true' };
  assert.deepEqual(typedPartsOf(assigned.command), ['true', 'X=http://localhost:4318 timeout 5 true']);
  assert.deepEqual(
    deniedPartsOfCall(assigned).map((part) => part.command),
    ['true', 'X=http://localhost:4318 timeout 5 true'],
    'a deny is matched against a part as typed too',
  );
  assert.ok(
    deniedPartsOfCall(assigned).some((part) => reaches('Bash(*:4318*)', part)),
    'so a deny of an address reaches an assignment',
  );
  assert.ok(!partsOfCall(assigned).some((part) => reaches('Bash(*:4318*)', part)), 'and an allow of it reaches nothing an assignment says');
  assert.deepEqual(deniedPartsOfCall({ tool: 'Edit' }), [{ tool: 'Edit' }]);
});

test('every shipped agent is named by a shipped step, so the fence below reads each one', () => {
  const named = new Set(shipped().flatMap(({ step }) => (step.agent ? [step.agent.name] : [])));
  for (const dir of AGENT_FOLDERS)
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md'))
      assert.ok(named.has(path.basename(file, '.md')), `${path.join(dir, file)} is named by no shipped step`);
});

test('every shipped step is refused git push, a forced branch delete, a kill by name, every gh write and browser_run_code_unsafe: by its own deny in auto, by no allow in dontAsk, by a read-only sandbox on codex', () => {
  const open = shipped().flatMap(({ dir, step }) => unfenced(step).map((what) => `${path.relative(REPO, dir)}/${what}`));
  assert.deepEqual(open, []);
  assert.ok(
    FOLDERS.every((dir) => !['agents', 'skills'].includes(path.basename(dir))),
    'agents and skills are no workflow of their own',
  );
});

test("the tests' team is fenced as a shipped team must be: every step of its dev, auto and dontAsk", () => {
  const steps = loadWorkflows(TEAM_DEV);
  assert.deepEqual(
    steps.flatMap((step) => unfenced(step)),
    [],
  );
  assert.ok(steps.some((step) => step.permissionMode === 'auto') && steps.some((step) => step.permissionMode === 'dontAsk'), 'both modes');
});

test('the settings deny none of them: the refusal is each worker’s own, and a person’s session may push and start a probe', () => {
  const deny = SETTINGS.permissions?.deny ?? [];
  for (const call of [...FENCED, ...PROBES])
    assert.deepEqual(
      deny.filter((rule) => reaches(rule, call)),
      [],
      `${shown(call)} is denied by .claude/settings.json, which binds a person's own session too`,
    );
});

/** The shipped step an agent runs, as `wf start` freezes it. */
const shippedStepOf = (agent: string): Step => {
  const found = shipped().find(({ step }) => step.agent?.name === agent);
  assert.ok(found, `no shipped step runs ${agent}`);
  return found.step;
};

/** The line of the build workflow's review that names its checks. */
const REVIEW_CHECKS = 'Run the typecheck and the lint yourself';

/** The first words of the sentence of a fenced step's note that names the command of the kit's `ds-spec` reader. */
const READER = "`ds-spec`'s reader runs from the root";

/**
 * Each dontAsk agent whose step names the checks it runs, with the step's file and the line those checks are on, and for a step given
 * the kit's skills the first words of the sentence its reader's command is on (`reader`).
 */
const CHECKERS: { agent: string; step: string; from: string; reader?: string }[] = [
  { agent: 'seldon', step: 'workflows/build/design.md', from: 'The checks you may run here', reader: READER },
  { agent: 'agora', step: 'workflows/build/review.md', from: REVIEW_CHECKS, reader: READER },
  { agent: 'argus', step: 'workflows/janitor/argus.md', from: '**Run each read bare**' },
];

test('every check the steps of Seldon, Agora and Argus name is one their fence allows', () => {
  for (const { agent, step: file, from } of CHECKERS) {
    const step = shippedStepOf(agent);
    assert.equal(step.permissionMode, 'dontAsk', `${agent} runs dontAsk`);
    const checks = checksOf(file, from);
    assert.ok(checks.length >= 3, `${file} names its checks: ${checks.join(', ')}`);
    assert.deepEqual(unallowed(step, checks), [], `${agent}'s fence refuses a check ${file} names`);
  }
});

/** The numbered item of the trigger skill of a change to the board that names the command of the kit's `ds-spec` skill. */
const KIT_COMMAND = { file: '.claude/skills/change-the-board/SKILL.md', from: '**The project they speak of is `apps/web`**' };

/** The settings' allow of that command, whatever follows the script's name. */
const KIT_ALLOW = 'Bash(node apps/web/.claude/skills/ds-spec/md3.mjs:*)';

/** A backticked command that starts with `node`, as `checksOf` reads its spans. */
const NODE_SPANS = /`(node\s[^`]*)`/g;

/** Each fenced step whose note names the reader's command, with its agent, its file and the command its note names. */
const readers = (): { agent: string; file: string; commands: string[] }[] =>
  CHECKERS.flatMap(({ agent, step, reader }) =>
    reader === undefined ? [] : [{ agent, file: step, commands: checksOf(step, reader, NODE_SPANS) }],
  );

test("the command design's and review's notes name for the kit's ds-spec is change-the-board's, a script of the checkout their fences allow", () => {
  const named = checksOf(KIT_COMMAND.file, KIT_COMMAND.from, NODE_SPANS);
  assert.deepEqual(named, ['node apps/web/.claude/skills/ds-spec/md3.mjs <command>']);
  assert.ok(fs.statSync(path.join(REPO, named[0].split(' ')[1])).isFile(), 'its script is a file of the checkout');
  assert.deepEqual(
    readers().map(({ agent }) => agent),
    ['seldon', 'agora'],
  );
  for (const { agent, file, commands } of readers()) {
    const step = shippedStepOf(agent);
    assert.equal(step.permissionMode, 'dontAsk', `${agent} runs dontAsk`);
    assert.deepEqual(commands, named, `${file} names the command change-the-board names, and no other`);
    assert.deepEqual(unallowed(step, commands), [], `${agent}'s fence refuses the command ${file} names`);
  }
});

test("REFUSED: the kit's ds-spec command without the settings' allow of it is named for Seldon and Agora, and a note that names it no more throws", () => {
  assert.ok(SETTINGS_ALLOWS.includes(KIT_ALLOW), `${KIT_ALLOW} is in the settings`);
  const without = SETTINGS_ALLOWS.filter((rule) => rule !== KIT_ALLOW);
  for (const { agent, file, commands } of readers()) {
    assert.equal(commands.length, 1, file);
    assert.deepEqual(unallowed(shippedStepOf(agent), commands, without), commands, agent);
    assert.deepEqual(
      unallowed(shippedStepOf(agent), commands, [...without, KIT_ALLOW.replace(':*', '')]),
      commands,
      `${agent}, the bare name`,
    );
    assert.throws(
      () => checksOf(file, "`ds-spec`'s reader runs from its own folder", NODE_SPANS),
      (err: Error) => err.message.includes(`${file}: no "\`ds-spec\`'s reader runs from its own folder"`),
    );
  }
  assert.throws(
    () => checksOf(KIT_COMMAND.file, 'The project they speak of is the root', NODE_SPANS),
    (err: Error) => err.message.includes(`${KIT_COMMAND.file}: no "The project they speak of is the root"`),
  );
});

test("REFUSED: a step's check that neither its fence nor the settings allow is named", () => {
  const [design, review, janitor] = CHECKERS.map(({ agent, step, from }) => ({ step: shippedStepOf(agent), checks: checksOf(step, from) }));
  const without = (rule: string): string[] => SETTINGS_ALLOWS.filter((r) => r !== rule);
  assert.deepEqual(unallowed(design.step, design.checks, without('Bash(npm run lint)')), ['npm run lint']);
  assert.deepEqual(unallowed(review.step, review.checks, without('Bash(npx turbo run typecheck --force)')), [
    'npx turbo run typecheck --force',
  ]);
  const stats = janitor.checks.filter((check) => check.startsWith('npx nemia stats '));
  assert.equal(stats.length, 3, janitor.checks.join(', '));
  assert.deepEqual(unallowed(janitor.step, janitor.checks, without('Bash(npx nemia stats:*)')), stats);
  assert.deepEqual(unallowed(janitor.step, janitor.checks, without('Bash(npx nemia inbox)')), ['npx nemia inbox']);
  assert.deepEqual(unallowed(design.step, design.checks, []), design.checks, 'Seldon allows none of them itself');
  assert.deepEqual(
    unallowed({ ...review.step, disallowedTools: ['Bash(npm run lint)'] }, ['npm run lint']),
    ['npm run lint'],
    'a deny wins',
  );
  assert.throws(
    () => checksOf('workflows/build/design.md', 'Run no check'),
    (err: Error) => err.message.includes('workflows/build/design.md: no "Run no check"'),
  );
});

test('REFUSED: an auto step without its own deny, and a dontAsk step an allow reaches, are open', () => {
  const implementer = stepOf('implementer');
  assert.equal(implementer.permissionMode, 'auto');
  const bare = {
    ...implementer,
    disallowedTools: implementer.disallowedTools?.filter((rule) => !FENCED.some((call) => reaches(rule, call))),
  };
  assert.equal(unfenced(bare).length, FENCED.length, unfenced(bare).join('\n'));
  assert.deepEqual(
    unfenced(bare, { permissions: { deny: ['Bash(git push:*)'] } }).filter((what) => what.includes('git push')),
    [],
    'the same step is fenced from push by a deny in the settings, which is the refusal this test moves off the checkout',
  );

  const reviewer = stepOf('reviewer');
  assert.equal(reviewer.permissionMode, 'dontAsk');
  assert.deepEqual(unfenced({ ...reviewer, allowedTools: [...(reviewer.allowedTools ?? []), 'Bash(git push:*)'] }), [
    'review: Bash(git push)',
    'review: Bash(git push origin main)',
    'review: Bash(git push --force origin wf/r-1/implement)',
  ]);
  assert.deepEqual(unfenced({ ...reviewer, allowedTools: ['mcp__playwright'] }), ['review: mcp__playwright__browser_run_code_unsafe']);
  assert.deepEqual(unfenced(reviewer, { permissions: { allow: ['Bash(git branch:*)'] } }), [
    'review: Bash(git branch -D wf/r-1/implement)',
    'review: Bash(git branch --delete --force wf/r-1/implement)',
  ]);
  assert.deepEqual(unfenced({ ...stepOf('reviewer'), harness: 'codex', permissionMode: undefined, sandbox: 'workspace-write' }), [
    'review: on codex in sandbox workspace-write, not read-only',
  ]);
});

test("REFUSED: a watcher's step without its own deny of the forced delete is open, though it runs dontAsk and the settings allow it none", () => {
  const supervise = loadWorkflows(
    folderOf({
      supervise:
        'workspace: main\nslot: none\nharness: claude\nbackground: true\npermissionMode: dontAsk\n' +
        'disallowedTools: Bash(git push:*), Bash(gh), Bash(gh:*), Bash(git branch -D:*), Bash(git branch --delete --force:*), ' +
        'Bash(pkill:*), Bash(killall:*), ' +
        'mcp__playwright__browser_run_code_unsafe',
    }),
  ).find((s) => s.name === 'supervise')!;
  assert.deepEqual(unfenced(supervise), [], 'fenced by its own list');
  assert.equal(supervise.permissionMode, 'dontAsk');
  assert.equal(supervise.background, true, "a background session, which reads the person's user settings as well as the checkout's");
  const bare = {
    ...supervise,
    disallowedTools: supervise.disallowedTools?.filter((rule) => !rule.startsWith('Bash(git branch')),
  };
  assert.deepEqual(unfenced(bare), [
    'supervise: Bash(git branch -D wf/r-1/implement)',
    'supervise: Bash(git branch --delete --force wf/r-1/implement)',
  ]);
  assert.deepEqual(
    unfenced({ ...bare, background: undefined, workspace: undefined, place: 'folder' }),
    [],
    'the same step as a job in a folder the run made reads only the settings shipped here, where no allow reaches a forced delete',
  );
  assert.deepEqual(
    unfenced({ ...bare, background: undefined }),
    ['supervise: Bash(git branch -D wf/r-1/implement)', 'supervise: Bash(git branch --delete --force wf/r-1/implement)'],
    "a job in the checkout itself reads that checkout's working-tree settings.json, which a person may have edited",
  );
});

test("REFUSED: the team's implementer with its deny line cut back to the four it had is open, read from its file as a run reads it", () => {
  const root = teamCopy('wf-fences-');
  const file = path.join(root, 'agents', 'implementer.md');
  const text = fs.readFileSync(file, 'utf8');
  const cut = text.replace(/^disallowedTools: .*$/m, 'disallowedTools: SendMessage, CronCreate, CronDelete, RemoteTrigger');
  assert.notEqual(cut, text, 'the implementer has a deny line to cut');
  fs.writeFileSync(file, cut);
  const implement = loadWorkflows(path.join(root, 'dev')).find((s) => s.name === 'implement')!;
  assert.equal(implement.agent?.name, 'implementer');
  assert.equal(unfenced(implement).length, FENCED.length, unfenced(implement).join('\n'));
});

/** Every call of `FENCED` that runs `pkill` or `killall` in some part, as `unfenced` names it for `step`. */
const killsByName = (step: string): string[] =>
  FENCED.filter((call) => partsOfCall(call).some((part) => /^(?:pkill|killall)\b/.test(part.command ?? ''))).map(
    (call) => `${step}: ${shown(call)}`,
  );

test("REFUSED: Ada without its deny of pkill and killall, read from its file as a run reads it, is open on each kill by name, the compound's too", () => {
  const ada = shippedStepOf('ada');
  const line = ada.disallowedTools!.filter((rule) => rule !== 'Bash(pkill:*)' && rule !== 'Bash(killall:*)');
  assert.equal(line.length, ada.disallowedTools!.length - 2, 'Ada denies both by name');
  const bare = shippedWith('ada', 'build', 'disallowedTools', line.join(', '), ...denyFilesOf('ada'));
  assert.equal(bare.permissionMode, 'auto');
  assert.deepEqual(unfenced(bare), killsByName(bare.name));
  assert.ok(
    unfenced(bare).includes(`${bare.name}: Bash(cd packages/agent-orchestrator && pkill -f "turbo run test")`),
    'the form that killed a landing check',
  );
});

/** Every call of `FENCED` that writes through `gh`, as `unfenced` names it for `step`: the whole of `gh` is denied, so each is every. */
const ghWrites = (step: string): string[] =>
  FENCED.filter((call) => /^gh\b/.test(call.command ?? '')).map((call) => `${step}: ${shown(call)}`);

test("REFUSED: Ada and Otto without their deny of gh, read from their files as a run reads them, are open on every gh write", () => {
  for (const agent of ['ada', 'otto']) {
    const step = shippedStepOf(agent);
    const line = step.disallowedTools!.filter((rule) => rule !== 'Bash(gh)' && rule !== 'Bash(gh:*)');
    assert.equal(line.length, step.disallowedTools!.length - 2, `${agent} denies gh whole, bare and with arguments`);
    const bare = shippedWith(agent, 'build', 'disallowedTools', line.join(', '), ...denyFilesOf(agent));
    assert.equal(bare.permissionMode, 'auto', `${agent} runs auto, so its own deny is its fence`);
    assert.deepEqual(unfenced(bare), ghWrites(bare.name));
    assert.ok(ghWrites(bare.name).length >= 12, 'every gh write a session could type is a call here');
  }
});

/** The two reads of the pull request review's note names, and the settings' allows that reach them and nothing else. */
const PR_READS = ['gh pr view 7', 'gh pr checks 7'];
const PR_READ_ALLOWS = ['Bash(gh pr view:*)', 'Bash(gh pr checks:*)'];

test("the two gh reads review's note names are allowed Agora by the settings, and REFUSED with either allow dropped", () => {
  const review = shippedStepOf('agora');
  assert.equal(review.permissionMode, 'dontAsk', 'nothing reaches Agora but an allow');
  const named = checksOf('workflows/build/review.md', '**Read the pull request and its checks**', /`(gh\s[^`]*)`/g);
  assert.deepEqual(named, PR_READS, "review's note names the two reads and no other gh call");
  assert.deepEqual(unallowed(review, named), [], "Agora's fence refuses neither read");
  for (const allow of PR_READ_ALLOWS) {
    assert.ok(SETTINGS_ALLOWS.includes(allow), `${allow} is in the settings`);
    const without = SETTINGS_ALLOWS.filter((rule) => rule !== allow);
    assert.equal(unallowed(review, named, without).length, 1, `${allow} is what reaches one of them`);
  }
  assert.deepEqual(unallowed(review, named, []), named, 'Agora allows neither itself');
  assert.deepEqual(unfenced(review), [], 'and neither allow reaches a gh write');
});

test('REFUSED: a dontAsk step an allow of pkill reaches is open on each kill by pkill whose every part some allow reaches', () => {
  const reviewer = stepOf('reviewer');
  assert.equal(reviewer.permissionMode, 'dontAsk');
  assert.deepEqual(unfenced({ ...reviewer, allowedTools: [...(reviewer.allowedTools ?? []), 'Bash(pkill:*)'] }), [
    'review: Bash(pkill -f "turbo run test")',
    'review: Bash(cd packages/agent-orchestrator && pkill -f "turbo run test")',
    'review: Bash(timeout 5 pkill -f turbo)',
  ]);
  assert.deepEqual(
    unfenced({ ...reviewer, allowedTools: [...(reviewer.allowedTools ?? []), 'Bash(killall:*)'] }),
    ['review: Bash(killall node)'],
    'no allow reaches `true`, so the compound stays fenced',
  );
  assert.ok(
    (SETTINGS.permissions?.allow ?? []).includes('Bash(cd:*)'),
    'the settings allow cd, and still the compound is fenced: its pkill part is reached by no allow',
  );
  assert.deepEqual(unfenced(reviewer), []);
});

test('the matcher reads an edit rule by the path it covers, from the root or the home folder, and throws on one it does not model', () => {
  const local = 'Edit(//**/.claude/settings.local.json)';
  assert.equal(reaches(local, { tool: 'Edit', path: '/home/u/projects/.claude/settings.local.json' }), true);
  assert.equal(reaches(local, { tool: 'Write', path: '/.claude/settings.local.json' }), true, 'a write too, and **/ is no folder as well');
  assert.equal(reaches(local, { tool: 'Edit', path: '/home/u/projects/.claude/settings.json' }), false);
  assert.equal(reaches(local, { tool: 'Edit', path: '/home/u/projects/x.claude/settings.local.json' }), false, 'a folder whole');
  assert.equal(reaches('Edit(~/.claude.json)', { tool: 'Write', path: '/home/u/.claude.json' }), true);
  assert.equal(reaches('Edit(~/.claude.json)', { tool: 'Write', path: '/home/u/x/.claude.json' }), false);
  assert.equal(reaches('Edit(//a/*/c)', { tool: 'Edit', path: '/a/b/c' }), true);
  assert.equal(reaches('Edit(//a/*/c)', { tool: 'Edit', path: '/a/b/d/c' }), false, 'a * stays within a folder');
  assert.equal(reaches('Read(//**)', { tool: 'Edit', path: '/a' }), false);
  assert.equal(reaches('Edit', { tool: 'Write', path: '/a' }), true);
  assert.throws(
    () => reaches('Edit(src/**)', { tool: 'Edit', path: '/a/src/b' }),
    (err: Error) => err.message.includes('a path from the project or the working folder is not modelled'),
  );
});

test('every shipped step is refused a session of its own started by hand, in the background or through Remote Control: by its own deny in auto, by no allow in dontAsk', () => {
  const open = shipped().flatMap(({ dir, step }) => unfenced(step, SETTINGS, PROBES).map((what) => `${path.relative(REPO, dir)}/${what}`));
  assert.deepEqual(open, []);
});

/** The rules of Ada's and Otto's fence that refuse a session started by hand: a deny of `claude` with a flag or a subcommand. */
const probeRule = (rule: string): boolean => rule.startsWith('Bash(claude ');

for (const agent of ['ada', 'otto'])
  test(`REFUSED: ${agent} without its deny of a background session and Remote Control, read from its file as a run reads it, is open on each`, () => {
    const step = shippedStepOf(agent);
    assert.equal(step.permissionMode, 'auto');
    const line = step.disallowedTools!.filter((rule) => !probeRule(rule));
    assert.ok(line.length < step.disallowedTools!.length, `${agent} denies a session started by hand`);
    const bare = shippedWith(agent, 'build', 'disallowedTools', line.join(', '), ...denyFilesOf(agent));
    assert.deepEqual(
      unfenced(bare, SETTINGS, PROBES),
      PROBES.map((call) => `${bare.name}: ${shown(call)}`),
    );
  });

/** Which of `files` a step's own deny refuses it to edit, by the Edit tool and by the Write tool alike. */
const editsDenied = (step: Step, files: string[]): string[] =>
  files.filter((file) =>
    ['Edit', 'Write'].every((tool) => (step.disallowedTools ?? []).some((rule) => reaches(rule, { tool, path: file }))),
  );

test("Ada and Otto are refused an edit of a harness's trust or local settings anywhere, and not one in their own worktree", () => {
  for (const agent of ['ada', 'otto']) {
    const step = shippedStepOf(agent);
    assert.deepEqual(editsDenied(step, HARNESS_FILES), HARNESS_FILES, agent);
    assert.deepEqual(editsDenied(step, [OWN_FILE]), [], agent);
  }
});

for (const agent of ['ada', 'otto'])
  test(`REFUSED: ${agent} without its deny of a folder's local settings, read from its file as a run reads it, may edit the owner's`, () => {
    const step = shippedStepOf(agent);
    const line = step.disallowedTools!.filter((rule) => rule !== 'Edit(//**/.claude/settings.local.json)');
    assert.equal(line.length, step.disallowedTools!.length - 1, `${agent} denies an edit of a folder's local settings`);
    const bare = shippedWith(agent, 'build', 'disallowedTools', line.join(', '), ...denyFilesOf(agent));
    assert.deepEqual(editsDenied(bare, HARNESS_FILES), HARNESS_FILES.slice(1), 'the rule cut leaves the projects folder open');
    const none = shippedWith(
      agent,
      'build',
      'disallowedTools',
      line.filter((rule) => !rule.startsWith('Edit(')).join(', '),
      ...denyFilesOf(agent),
    );
    assert.deepEqual(editsDenied(none, HARNESS_FILES), [], 'and the trust and user settings with theirs');
  });

/** Each verb that acts, typed after the command `cli`: start, file, queue or drop a card, approve or retry a step. */
const actsBy = (cli: string): Call[] =>
  ['start x', 'inbox add x', 'inbox queue x', 'inbox rm x', 'approve r s', 'retry r s'].map((verb) => ({
    tool: 'Bash',
    command: `${cli} ${verb}`,
  }));

/** What a janitor must never do, in the spellings a session types: a verb that acts, by the command's name or its alias, or an edit. */
const ACTS: Call[] = [...['npx nemia', 'nemia', 'npx wf', 'wf'].flatMap(actsBy), { tool: 'Edit' }, { tool: 'Write' }];

/**
 * What of `ACTS` a step could run: in a dontAsk job, each that a rule of its own, of the settings or of a skill allows and none of its
 * own denies; any other step runs every call no deny names.
 */
function acting(step: Step): string[] {
  if (step.permissionMode !== 'dontAsk' || step.background === true || step.workspace === 'main')
    return [`${step.name}: not a dontAsk job, so every call no deny names runs`];
  const allows = [...(step.allowedTools ?? []), ...(SETTINGS.permissions?.allow ?? []), ...SKILL_GRANTS];
  return ACTS.filter(
    (call) => allows.some((rule) => reaches(rule, call)) && !(step.disallowedTools ?? []).some((rule) => reaches(rule, call)),
  ).map(shown);
}

/**
 * The step of the shipped `workflow` that `agent` runs, read from a scratch copy of the shipped team, the `key` line replaced by `line`
 * in each file of `of`, the agent's alone by default.
 */
function shippedWith(agent: string, workflow: string, key: 'allowedTools' | 'disallowedTools', line: string, ...of: string[]): Step {
  return shippedEdited(
    agent,
    workflow,
    `a ${key} line to replace`,
    (text) => text.replace(new RegExp(`^${key}: .*$`, 'm'), `${key}: ${line}`),
    ...of,
  );
}

/** The steps that run what no deny names, each with its file under the shipped holder: the two whose own line denies the collector. */
const COLLECTOR_FENCED = [
  { agent: 'ada', workflow: 'build', file: 'build/implement.md' },
  { agent: 'otto', workflow: 'build', file: 'build/land.md' },
  { agent: 'ada', workflow: 'quick', file: 'quick/implement.md' },
  { agent: 'otto', workflow: 'quick', file: 'quick/land.md' },
];

/** The rules on the `disallowedTools:` line of the shipped file `file`, none where it has no such line. */
const denyLineOf = (file: string): string[] =>
  /^disallowedTools: (.*)$/m.exec(fs.readFileSync(path.join(SHIPPED_HOLDERS[0], file), 'utf8'))?.[1].split(', ') ?? [];

/** The step of the shipped `workflow` that `agent` runs, as `wf start` freezes it. */
const shippedStepIn = (agent: string, workflow: string): Step => {
  const found = shipped().find(({ dir, step }) => path.basename(dir) === workflow && step.agent?.name === agent);
  assert.ok(found, `no step of the shipped ${workflow} runs ${agent}`);
  return found.step;
};

/**
 * The files a deny of `agent`'s is written in for its step of `workflow`, from the shipped holder: its own, and its step's, which
 * repeats each to add its own.
 */
const denyFilesOf = (agent: string, workflow = 'build'): string[] => [
  `agents/${agent}.md`,
  ...COLLECTOR_FENCED.filter((fenced) => fenced.agent === agent && fenced.workflow === workflow).map((fenced) => fenced.file),
];

/**
 * The step of the shipped `workflow` that `agent` runs, read from a scratch copy of the shipped team in which `edit` rewrote each file
 * of `of`, the agent's alone by default. Fails, saying which file has no `what`, when the edit changes nothing in one.
 */
function shippedEdited(agent: string, workflow: string, what: string, edit: (text: string) => string, ...of: string[]): Step {
  const root = scratch(`wf-fences-${agent}-`);
  fs.cpSync(SHIPPED_HOLDERS[0], root, { recursive: true });
  for (const name of of.length ? of : [`agents/${agent}.md`]) {
    const file = path.join(root, name);
    const text = fs.readFileSync(file, 'utf8');
    const changed = edit(text);
    assert.notEqual(changed, text, `${name} has ${what}`);
    fs.writeFileSync(file, changed);
  }
  return loadWorkflows(path.join(root, workflow), { repo: REPO }).find((step) => step.agent?.name === agent)!;
}

/** The step of the shipped `workflow` that `agent` runs, its agent's `allowedTools` line replaced by `allowed` (`shippedWith`). */
const shippedAllowed = (agent: string, workflow: string, allowed: string): Step => shippedWith(agent, workflow, 'allowedTools', allowed);

/** The janitor's step, its agent's `allowedTools` line replaced by `allowed` (`shippedAllowed`). */
const argusAllowed = (allowed: string): Step => shippedAllowed('argus', 'janitor', allowed);

/** Every tool of the browser's server a step given the browser drives: all of the pinned server's but `browser_run_code_unsafe`. */
const BROWSER_TOOLS = [
  'click',
  'close',
  'console_messages',
  'drag',
  'drop',
  'evaluate',
  'file_upload',
  'fill_form',
  'find',
  'handle_dialog',
  'hover',
  'navigate',
  'navigate_back',
  'network_request',
  'network_requests',
  'press_key',
  'resize',
  'select_option',
  'snapshot',
  'tabs',
  'take_screenshot',
  'type',
  'wait_for',
].map((name) => `mcp__playwright__browser_${name}`);

/** A page of a board served for the step (`npm run board:serve`), opened in the tab or in a new one. */
const SERVED_BOARD: Call[] = [
  { tool: 'mcp__playwright__browser_navigate', url: 'http://127.0.0.1:41234/runs' },
  { tool: 'mcp__playwright__browser_tabs', url: 'http://127.0.0.1:41234/' },
];

/** The live board, the person's own on :8787 and :5173, in the spellings a session types: what a step given the browser never opens. */
const LIVE_BOARD: Call[] = [
  'http://127.0.0.1:8787/',
  'http://localhost:8787/runs',
  'localhost:8787',
  'http://[::1]:8787/',
  'http://127.0.0.1:5173/',
  'http://localhost:5173/factory',
].flatMap((url) => [
  { tool: 'mcp__playwright__browser_navigate', url },
  { tool: 'mcp__playwright__browser_tabs', url },
]);

/**
 * A browser tool told the file to write, in the workspace or out of it: each tool of the pinned server that takes a `filename` but
 * `browser_run_code_unsafe`. A step that writes nothing gives none, and the tool then saves in the server's own output directory.
 */
const FILE_TOOLS = ['console_messages', 'evaluate', 'network_request', 'network_requests', 'snapshot', 'take_screenshot'];
const NAMED_FILES: Call[] = FILE_TOOLS.flatMap((name) =>
  ['x.png', 'notes/x.png', '/tmp/playwright-mcp/x.png'].map((filename) => ({ tool: `mcp__playwright__browser_${name}`, filename })),
);

/** The dontAsk agents given the browser, each with its workflow and the file of the step that names the server and the live board. */
const BROWSERS = [
  { agent: 'seldon', workflow: 'build', file: 'build/design.md' },
  { agent: 'agora', workflow: 'build', file: 'build/review.md' },
];

/** The rules of a step's `allowedTools` that allow a whole MCP server: a tool its pinned server gains later would be allowed unnamed. */
const wholeServers = (step: Step): string[] =>
  (step.allowedTools ?? []).filter((rule) => /^mcp__[^_(]+(?:_[^_(]+)*(?:__\*)?$/.test(rule)).map((rule) => `${step.name}: ${rule}`);

test('Seldon and Agora drive the browser by their own allow, each tool by name, on a served board, and are refused the live board by address', () => {
  const tools = BROWSER_TOOLS.map((tool) => ({ tool }));
  assert.equal(BROWSER_TOOLS.length, 23);
  for (const { agent, workflow, file } of BROWSERS) {
    const step = shippedStepOf(agent);
    assert.equal(step.permissionMode, 'dontAsk', agent);
    assert.ok(step.agent?.mcp?.includes('playwright'), `${agent}'s step loads the browser's server, or its allows reach no tool`);
    assert.deepEqual(runs(step, tools, {}, []), BROWSER_TOOLS, `${agent}: by its own allow, no settings read`);
    assert.deepEqual(runs(step, SERVED_BOARD, {}, []), SERVED_BOARD.map(shown), `${agent} opens a served board`);
    assert.deepEqual(unfenced(step, SETTINGS, LIVE_BOARD), [], `${agent} is refused the live board`);
    assert.deepEqual(unfenced(step, SETTINGS, NAMED_FILES), [], `${agent} names no file a browser tool writes`);
    assert.deepEqual(unfenced(step), [], agent);
    const hired = shippedEdited(agent, workflow, 'a deny line of its own', (text) => text.replace(/^disallowedTools: .*\n/m, ''), file);
    assert.ok(
      hired.disallowedTools?.includes('mcp__playwright__browser_run_code_unsafe'),
      `${agent}'s own file denies browser_run_code_unsafe by name, for a step that hires it and denies nothing itself`,
    );
    assert.deepEqual(unfenced(hired, SETTINGS, NAMED_FILES), [], `${agent}'s own file denies a named file too`);
  }
  assert.deepEqual(
    shipped().flatMap(({ step }) => wholeServers(step)),
    [],
    'no shipped step allows a whole server',
  );
});

test('REFUSED: a browser tool an agent allows no more is reached no more, and browser_run_code_unsafe allowed without its deny is open', () => {
  for (const { agent, workflow, file } of BROWSERS) {
    const cut = shippedEdited(agent, workflow, 'an allow of browser_click', (text) => text.replace(', mcp__playwright__browser_click', ''));
    const reached = runs(
      cut,
      BROWSER_TOOLS.map((tool) => ({ tool })),
      {},
      [],
    );
    assert.deepEqual(
      BROWSER_TOOLS.filter((tool) => !reached.includes(tool)),
      ['mcp__playwright__browser_click'],
      agent,
    );
    const unsafe = shippedEdited(
      agent,
      workflow,
      'a deny of browser_run_code_unsafe',
      (text) =>
        text
          .replace(', mcp__playwright__browser_run_code_unsafe', '')
          .replace(/^allowedTools: (.*)$/m, 'allowedTools: $1, mcp__playwright__browser_run_code_unsafe'),
      `agents/${agent}.md`,
      file,
    );
    assert.deepEqual(unfenced(unsafe), [`${unsafe.name}: mcp__playwright__browser_run_code_unsafe`], agent);
    assert.throws(
      () => shippedEdited(agent, workflow, 'a deny', (text) => text.replace(', mcp__playwright__browser_run_code_unsafe', ''), file),
      (err: Error) => err.message.includes('would lift `mcp__playwright__browser_run_code_unsafe`'),
      `${file} alone cannot drop what its agent denies`,
    );
    const allowedAlone = shippedEdited(agent, workflow, 'an allowedTools line', (text) =>
      text.replace(/^allowedTools: (.*)$/m, 'allowedTools: $1, mcp__playwright__browser_run_code_unsafe'),
    );
    assert.deepEqual(unfenced(allowedAlone), [], `${agent}: its own deny wins over an allow`);
  }
});

test('REFUSED: a whole server allowed on an agent is named, in either spelling, and a tool or a rule on one is not', () => {
  for (const [rule, named] of [
    ['mcp__playwright', true],
    ['mcp__playwright__*', true],
    ['mcp__my_server', true],
    ['mcp__playwright__browser_click', false],
    ['mcp__playwright__browser_navigate(url:*:8787*)', false],
  ] as const) {
    const step = shippedEdited('agora', 'build', 'an allowedTools line', (text) =>
      text.replace(/^allowedTools: (.*)$/m, `allowedTools: $1, ${rule}`),
    );
    assert.deepEqual(wholeServers(step), named ? [`review: ${rule}`] : [], rule);
  }
});

test('REFUSED: design or review with one of its four address rules cut opens the live board on that port by that tool', () => {
  for (const { agent, workflow, file } of BROWSERS)
    for (const tool of ['mcp__playwright__browser_navigate', 'mcp__playwright__browser_tabs'])
      for (const port of ['8787', '5173']) {
        const rule = `${tool}(url:*:${port}*)`;
        const cut = shippedEdited(agent, workflow, `the rule ${rule}`, (text) => text.replace(`, ${rule}`, ''), file);
        const open = LIVE_BOARD.filter((call) => call.tool === tool && call.url?.includes(`:${port}`));
        assert.equal(open.length, port === '8787' ? 4 : 2);
        assert.deepEqual(
          unfenced(cut, SETTINGS, LIVE_BOARD),
          open.map((call) => `${cut.name}: ${shown(call)}`),
          `${file} without ${rule}`,
        );
      }
});

test("REFUSED: a step or an agent that denies a browser tool its filename no more may have it write a file, the workspace's too", () => {
  for (const { agent, workflow, file } of BROWSERS)
    for (const name of FILE_TOOLS) {
      const tool = `mcp__playwright__browser_${name}`;
      const cut = (text: string) => text.replace(`, ${tool}(filename:*)`, '');
      const open = NAMED_FILES.filter((call) => call.tool === tool);
      assert.equal(open.length, 3);
      const both = shippedEdited(agent, workflow, `a deny of a filename to ${tool}`, cut, `agents/${agent}.md`, file);
      assert.deepEqual(
        unfenced(both, SETTINGS, NAMED_FILES),
        open.map((call) => `${both.name}: ${shown(call)}`),
        `${file} and agents/${agent}.md without it`,
      );
      assert.throws(
        () => shippedEdited(agent, workflow, `a deny of a filename to ${tool}`, cut, file),
        (err: Error) => err.message.includes(`would lift \`${tool}(filename:*)\``),
        `${file} alone cannot drop what its agent denies`,
      );
      const narrowed = shippedEdited(
        agent,
        workflow,
        `a deny of a filename to ${tool}`,
        (text) => text.replace(`${tool}(filename:*)`, `${tool}(filename:/tmp/*)`),
        `agents/${agent}.md`,
        file,
      );
      assert.deepEqual(
        unfenced(narrowed, SETTINGS, NAMED_FILES),
        open.filter((call) => !call.filename?.startsWith('/tmp/')).map((call) => `${narrowed.name}: ${shown(call)}`),
        `${file} and agents/${agent}.md denying only a file under /tmp leave the workspace's open`,
      );
    }
});

/** The line of a step's note that names the two commands of a served board. */
const BOARD_CHECKS = '`npm run board:serve`';

test('design and review name the two commands of a served board, the settings allow each by its exact name, and neither may build', () => {
  for (const { agent, file } of BROWSERS) {
    const step = shippedStepOf(agent);
    const checks = checksOf(`workflows/${file}`, BOARD_CHECKS);
    assert.deepEqual([...new Set(checks)].sort(), ['npm run board:serve', 'npm run board:stop'], file);
    assert.deepEqual(unallowed(step, checks), [], `${agent}'s fence refuses a command ${file} names`);
    for (const command of ['npm run board:serve', 'npm run board:stop']) {
      assert.ok(SETTINGS_ALLOWS.includes(`Bash(${command})`), `${command} is allowed by its exact name`);
      assert.deepEqual(
        unallowed(
          step,
          [command],
          SETTINGS_ALLOWS.filter((rule) => rule !== `Bash(${command})`),
        ),
        [command],
        `REFUSED: ${agent} without the settings' allow of ${command}`,
      );
      assert.deepEqual(runs(step, [{ tool: 'Bash', command: `${command} --workspace api` }]), [], 'and no longer command');
    }
    assert.deepEqual(
      runs(
        step,
        ['npm run build', 'npm run e2e', 'npm run board:serve && npm run build'].map((command) => ({ tool: 'Bash', command })),
      ),
      [],
      `${agent} still builds nothing in the workspace`,
    );
  }
  assert.throws(
    () => checksOf('workflows/build/implement.md', BOARD_CHECKS),
    (err: Error) => err.message.includes('workflows/build/implement.md: no "`npm run board:serve`"'),
    'REFUSED: a note that names the commands no more',
  );
});

/** The steps that design, write or judge a change, by workflow, and the skills each gives its session to list. */
const WORK_STEPS: Record<string, string[]> = { build: ['design', 'implement', 'review'], quick: ['implement'] };
const WORK_SKILLS = ['effect', 'shadcn', 'change-the-board'];

/**
 * Each skill of `WORK_SKILLS` a work step of `steps`, the workflow `workflow`'s, does not give, as `<step>: <skill>`, read off the
 * agent each step froze.
 */
const workSkillsMissing = (steps: readonly Step[], workflow = 'build'): string[] =>
  WORK_STEPS[workflow].flatMap((name) => {
    const given = steps.find((step) => step.name === name)?.agent?.skills ?? [];
    return WORK_SKILLS.filter((skill) => !given.includes(skill)).map((skill) => `${name}: ${skill}`);
  });

/**
 * The steps of `workflow`, the build workflow by default, read from a scratch copy of the shipped team whose step `step` has its
 * `skills:` line replaced by `line`.
 */
function buildWith(step: string, line: string, workflow = 'build'): Step[] {
  const root = scratch('wf-fences-build-');
  fs.cpSync(SHIPPED_HOLDERS[0], root, { recursive: true });
  const file = path.join(root, workflow, `${step}.md`);
  const text = fs.readFileSync(file, 'utf8');
  const changed = text.replace(/^skills: .*\n/m, line);
  assert.notEqual(changed, text, `${step} has a skills: line to replace`);
  fs.writeFileSync(file, changed);
  return loadWorkflows(path.join(root, workflow), { repo: REPO });
}

test("build's design, implement and review, and quick's implement, each give effect, shadcn and change-the-board, whatever their agents give", () => {
  for (const workflow of Object.keys(WORK_STEPS)) {
    const dir = FOLDERS.find((folder) => path.basename(folder) === workflow);
    assert.ok(dir, `the ${workflow} workflow is shipped`);
    assert.deepEqual(workSkillsMissing(loadWorkflows(dir, placesOf(dir)), workflow), [], workflow);
  }
});

test('REFUSED: a work step that gives one of the three skills no more is named, read from its file as a run reads it', () => {
  assert.deepEqual(workSkillsMissing(buildWith('review', 'skills: effect, shadcn\n')), ['review: change-the-board']);
  assert.deepEqual(workSkillsMissing(buildWith('design', '')), ['design: effect', 'design: shadcn', 'design: change-the-board']);
  assert.deepEqual(workSkillsMissing(buildWith('implement', 'skills: shadcn, change-the-board\n', 'quick'), 'quick'), [
    'implement: effect',
  ]);
});

/**
 * What makes a landing step what it is, its `after` apart: where it works, its agent, its gate, its check, its budget, its fence and
 * its note.
 */
const landingOf = (step: Step | undefined): unknown[] => [
  step?.workspace,
  step?.agent?.name,
  step?.gate,
  step?.check,
  step?.budget,
  step?.disallowedTools,
  step?.body,
];

/** The landing step of the workflow `workflow`, read from `root`, a holder laid out as the shipped one. */
const landIn = (workflow: string, root = SHIPPED_HOLDERS[0]): Step | undefined =>
  loadWorkflows(path.join(root, workflow), { repo: REPO }).find((step) => step.name === 'land');

test("quick's land is build's land but its after: main has one guard, whatever the workflow", () => {
  const [build, quick] = [landIn('build'), landIn('quick')];
  assert.ok(build?.check && build.gate === true && build.workspace === 'main', 'build lands at a gate, in the checkout, on a check');
  assert.deepEqual(landingOf(quick), landingOf(build));
  assert.deepEqual([build.after, quick?.after], [['review'], ['implement']]);
});

test("REFUSED: a quick land whose check, workspace, gate, fence or budget is no more build's is unequal to it", () => {
  const edits: [string, (text: string) => string][] = [
    ['check', (text) => text.replace('npx turbo run test --force --continue && ', '')],
    ['check', (text) => text.replace('else npm run e2e; fi', 'else true; fi')],
    ['workspace and gate', (text) => text.replace('workspace: main\n', '').replace('gate: true\n', '')],
    ['fence', (text) => text.replace(', Bash(*:4317*)', '')],
    ['budget', (text) => text.replace('budget: 10', 'budget: 11')],
  ];
  for (const [what, edit] of edits) {
    const root = scratch('wf-fences-land-');
    fs.cpSync(SHIPPED_HOLDERS[0], root, { recursive: true });
    const file = path.join(root, 'quick', 'land.md');
    const text = fs.readFileSync(file, 'utf8');
    assert.notEqual(edit(text), text, `quick's land has the ${what} the edit changes`);
    fs.writeFileSync(file, edit(text));
    assert.notDeepEqual(landingOf(landIn('quick', root)), landingOf(landIn('build', root)), what);
  }
});

/**
 * The SKILL.md of a skill a step is given, as its line writes it: one named with its folder (`folder:name`) from that folder's skills
 * in the checkout `root`, a bare one from the first of `SKILL_FOLDERS` that holds it; undefined where none does.
 */
const skillFileOf = (skill: string, root = REPO): string | undefined => {
  const given = givenSkillOf(skill);
  const files =
    given?.folder === undefined
      ? SKILL_FOLDERS.map((dir) => path.join(dir, skill, 'SKILL.md'))
      : [path.join(root, given.folder, '.claude', 'skills', given.name, 'SKILL.md')];
  return files.find((file) => fs.existsSync(file));
};

/**
 * The SKILL.md of `skill`, read in the checkout `root`, when it declares `allowed-tools` (`allowedToolsOf`), which a dontAsk job's
 * Skill tool is refused to load.
 */
const grantingFileOf = (skill: string, root = REPO): string | undefined => {
  const file = skillFileOf(skill, root);
  return file !== undefined && allowedToolsOf(file).length > 0 ? file : undefined;
};

/**
 * Each skill a step is given whose SKILL.md grants tools (`grantingFileOf`), when the step's instructions do not say to read that file,
 * by its path from the checkout, with Read. Each as `<step>: <skill>`. A skill named with its folder is read in the checkout `root`.
 */
function grantingSkillsUnread(step: Step, root = REPO): string[] {
  return (step.agent?.skills ?? [])
    .filter((skill) => {
      const file = grantingFileOf(skill, root);
      if (file === undefined) return false;
      const from = file.startsWith(root + path.sep) ? root : REPO;
      const named = path.relative(from, file).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return !new RegExp(`read\\s+\`${named}\`\\s+with\\s+Read`).test(step.body);
    })
    .map((skill) => `${step.name}: ${skill}`);
}

test('every shipped dontAsk job given a skill that grants tools is told to read its SKILL.md with Read', () => {
  const jobs = shipped()
    .map(({ step }) => step)
    .filter(dontAskJob);
  const granted = jobs.filter((step) => (step.agent?.skills ?? []).some((skill) => grantingFileOf(skill) !== undefined));
  assert.deepEqual(granted.map((step) => step.name).sort(), ['design', 'review'], 'design and review are given shadcn, which grants');
  assert.deepEqual(
    jobs.flatMap((step) => grantingSkillsUnread(step)),
    [],
  );
});

/** A scratch checkout holding a copy of the kit's skills where a session finds them, its `ds-spec` granting `grant`: the checkout. */
function kitGranting(grant: string): string {
  const root = scratch('wf-fences-kit-');
  const [kit] = nestedSkillFolders(root);
  fs.cpSync(nestedSkillFolders(REPO)[0], kit, { recursive: true });
  const file = path.join(kit, 'ds-spec', 'SKILL.md');
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.startsWith('---\nname: ds-spec\n'), file);
  fs.writeFileSync(file, text.replace('---\nname: ds-spec\n', `---\nname: ds-spec\nallowed-tools: ${grant}\n`));
  return root;
}

test('the fence reads the folders of skills a shipped step names with a skill: the board’s, whose skills grant no tool today', () => {
  assert.deepEqual(NESTED, ['apps/web']);
  assert.ok(SKILL_FOLDERS.includes(path.join(REPO, 'apps', 'web', '.claude', 'skills')), SKILL_FOLDERS.join(', '));
  assert.deepEqual(grantsOf(nestedSkillFolders(REPO)), []);
  for (const agent of ['seldon', 'agora']) {
    const given = (shippedStepOf(agent).agent?.skills ?? []).filter((skill) => givenSkillOf(skill)?.folder !== undefined);
    assert.deepEqual(given, ['apps/web:ds-build', 'apps/web:ds-theme', 'apps/web:ds-spec'], agent);
    for (const skill of given) assert.ok(skillFileOf(skill)?.startsWith(nestedSkillFolders(REPO)[0] + path.sep), skill);
  }
  assert.equal(skillFileOf('apps/web:ds-none'), undefined);
});

test('REFUSED: a kit skill that grants a tool design and review are fenced from opens it to both, and is named as unread by each', () => {
  const root = kitGranting('Bash(git push:*)');
  const grants = [...SKILL_GRANTS, ...grantsOf(nestedSkillFolders(root))];
  for (const agent of ['seldon', 'agora']) {
    const step = shippedStepOf(agent);
    assert.deepEqual(unfenced(step, SETTINGS, FENCED), [], `${agent}, with the skills as shipped`);
    const open = unfenced(step, SETTINGS, FENCED, grants);
    assert.ok(open.includes(`${step.name}: Bash(git push)`), open.join('\n'));
    assert.ok(
      open.every((what) => what.includes('git push')),
      open.join('\n'),
    );
    assert.deepEqual(grantingSkillsUnread(step, root), [`${step.name}: apps/web:ds-spec`]);
    assert.deepEqual(grantingSkillsUnread(step), []);
  }
});

test('REFUSED: design or review with no line naming shadcn’s SKILL.md to read with Read is named, read from its file as a run reads it', () => {
  const unread = (text: string): string => text.replace(/read\s+`\.claude\/skills\/shadcn\/SKILL\.md`\s+with\s+Read/, 'read it');
  const named = 'a line naming shadcn’s SKILL.md';
  assert.deepEqual(grantingSkillsUnread(shippedEdited('seldon', 'build', named, unread, 'build/design.md')), ['design: shadcn']);
  assert.deepEqual(grantingSkillsUnread(shippedEdited('agora', 'build', named, unread, 'build/review.md')), ['review: shadcn']);
});

/** The folders a walk of the checkout leaves out: what an install, a build or git writes, none of them a file a change is on. */
const NOT_CHECKOUT = new Set(['node_modules', '.git', 'dist', '.turbo']);

/** Every file under the checkout `repo`, by its path from it, but under `NOT_CHECKOUT`. */
function checkoutFiles(repo: string, under = ''): string[] {
  return fs
    .readdirSync(path.join(repo, under), { withFileTypes: true })
    .filter((entry) => !NOT_CHECKOUT.has(entry.name))
    .flatMap((entry) => {
      const file = under ? `${under}/${entry.name}` : entry.name;
      return entry.isDirectory() ? checkoutFiles(repo, file) : [file];
    });
}

/** Each glob a skill of `skillsDir` applies to (`applies:`) that no file of the checkout `repo` matches, as `<skill>: <glob>`. */
function appliesUnmatched(skillsDir: string, repo: string): string[] {
  const files = checkoutFiles(repo);
  return fs
    .readdirSync(skillsDir)
    .filter((skill) => fs.existsSync(path.join(skillsDir, skill, 'SKILL.md')))
    .flatMap((skill) =>
      appliesOf(fs.readFileSync(path.join(skillsDir, skill, 'SKILL.md'), 'utf8'))
        .filter((glob) => !files.some((file) => appliesMatch(file, [glob])))
        .map((glob) => `${skill}: ${glob}`),
    );
}

test('every path a repository skill applies to matches a file of the checkout, and the two that say so are read', () => {
  const skills = path.join(REPO, '.claude', 'skills');
  assert.deepEqual(appliesUnmatched(skills, REPO), []);
  assert.deepEqual(appliesOf(fs.readFileSync(path.join(skills, 'change-the-board', 'SKILL.md'), 'utf8')), ['apps/web/**']);
  assert.equal(appliesOf(fs.readFileSync(path.join(skills, 'effect', 'SKILL.md'), 'utf8')).length, 7);
});

test('REFUSED: a skill that applies to a path no file of the checkout has is named, beside one that matches', () => {
  const skills = scratch('wf-fences-applies-');
  for (const [name, applies] of [
    ['typo', '["apps/webb/**", "apps/web/**"]'],
    ['none', ''],
  ]) {
    fs.mkdirSync(path.join(skills, name));
    const line = applies ? `applies: ${applies}\n` : '';
    fs.writeFileSync(path.join(skills, name, 'SKILL.md'), `---\nname: ${name}\ndescription: Do it.\n${line}---\nDo it.\n`);
  }
  assert.deepEqual(appliesUnmatched(skills, REPO), ['typo: apps/webb/**']);
});

test('Argus is refused every verb that acts and every edit: it runs dontAsk, and no allow reaches one', () => {
  assert.deepEqual(acting(shippedStepOf('argus')), []);
});

test('REFUSED: Argus allowed every verb, the inbox whole or an edit, read from its file as a run reads it, could act', () => {
  assert.deepEqual(acting(argusAllowed('Bash(npx nemia:*)')), actsBy('npx nemia').map(shown));
  assert.deepEqual(acting(argusAllowed('Bash(npx wf:*)')), actsBy('npx wf').map(shown));
  assert.deepEqual(acting(argusAllowed('Bash(nemia stats:*), Bash(nemia inbox:*)')), [
    'Bash(nemia inbox add x)',
    'Bash(nemia inbox queue x)',
    'Bash(nemia inbox rm x)',
  ]);
  assert.deepEqual(acting(argusAllowed('Bash(wf:*), Edit(**)')), [...actsBy('wf').map(shown), 'Edit', 'Write']);
  assert.deepEqual(acting({ ...shippedStepOf('argus'), permissionMode: 'auto' }), [
    'argus: not a dontAsk job, so every call no deny names runs',
  ]);
});

/**
 * The skill `name` of the folder of skills `dir` as a `skills:` line names it: with its folder (`folder:name`) when `dir` is the
 * skills of a folder of `NESTED`, bare for any other.
 */
const lineNameOf = (dir: string, name: string): string => {
  const folder = NESTED.find((nested) => path.join(REPO, nested, '.claude', 'skills') === dir);
  return folder === undefined ? name : `${folder}:${name}`;
};

/**
 * Every shipped skill that declares rules (`RULES_FILE`), by the name a line gives it (`lineNameOf`), each rule read as a run reads it
 * (`readSkillRules`).
 */
const SHIPPED_RULES = SKILL_FOLDERS.filter((dir) => dir !== path.join(TEAM, 'skills')).flatMap((dir) =>
  fs
    .readdirSync(dir)
    .filter((name) => fs.existsSync(path.join(dir, name, RULES_FILE)))
    .map((name) => ({ skill: lineNameOf(dir, name), rules: readSkillRules(path.join(dir, name)) })),
);

/** The call a `breaks` pattern names, as the runtime records a denial of it: a command by its first word, any other tool by its name. */
function brokenBy(pattern: string): Call {
  const written = /^([^()]+)\((.*)\)$/s.exec(pattern);
  if (!written) return { tool: pattern };
  if (written[1] !== 'Bash') return { tool: written[1] };
  return {
    tool: 'Bash',
    command: written[2]
      .replace(/(?::\*| \*)$/, '')
      .trim()
      .split(/\s+/)[0],
  };
}

/**
 * Each pattern of `rules` that a dontAsk job's fence lets through, so no denial of it is ever recorded and the rule could never break:
 * reached by an allow of the step's, of the settings' or of a skill's, and by no deny of its own. Each as `<step>: <rule> <pattern>`.
 */
function unbreakable(step: Step, rules: readonly SkillRule[]): string[] {
  const allows = [...(step.allowedTools ?? []), ...(SETTINGS.permissions?.allow ?? []), ...SKILL_GRANTS];
  const denies = [...(step.disallowedTools ?? []), ...(SETTINGS.permissions?.deny ?? [])];
  return rules.flatMap((rule) =>
    rule.breaks
      .filter((pattern) => {
        const call = brokenBy(pattern);
        return allows.some((r) => reaches(r, call)) && !denies.some((r) => reaches(r, call));
      })
      .map((pattern) => `${step.name}: ${rule.id} ${pattern}`),
  );
}

/** Whether a step is a dontAsk job, which runs only what an allow reaches: what a denial of its is recorded for. */
const dontAskJob = (step: Step): boolean => step.permissionMode === 'dontAsk' && step.background !== true && step.workspace !== 'main';

test("every shipped skill's rules.json reads, and every call that breaks one of its rules is refused to each dontAsk step given it", () => {
  assert.ok(SHIPPED_RULES.length > 0, 'a skill ships its rules');
  assert.equal(lineNameOf(path.join(REPO, 'apps', 'web', '.claude', 'skills'), 'ds-build'), 'apps/web:ds-build');
  assert.equal(lineNameOf(path.join(REPO, '.claude', 'skills'), 'write-a-spec'), 'write-a-spec', 'a skill of the root stays bare');
  for (const { skill, rules } of SHIPPED_RULES) {
    const steps = shipped()
      .map(({ step }) => step)
      .filter((step) => step.agent?.skills?.includes(skill) && dontAskJob(step));
    assert.ok(steps.length > 0, `${skill} declares rules, and no shipped dontAsk step is given it to refuse a call that breaks one`);
    for (const step of steps) assert.deepEqual(unbreakable(step, rules), [], `${skill}: a call that breaks a rule is allowed`);
  }
});

test('REFUSED: a call that breaks a shipped rule, allowed to the step given the skill, is named — by its own allow or the settings', () => {
  const [spec] = SHIPPED_RULES.filter(({ skill }) => skill === 'write-a-spec');
  assert.ok(spec, 'write-a-spec declares its rules');
  const seldon = shippedAllowed('seldon', 'build', 'Agent, Bash(cat:*)');
  assert.deepEqual(unbreakable(seldon, spec.rules), ['design: read-with-read Bash(cat:*)']);
  const cd = [{ id: 'checks-bare', says: 'never cd', breaks: ['Bash(cd:*)'] }];
  const ownDenies = shippedStepOf('seldon').disallowedTools ?? [];
  assert.ok(ownDenies.includes('Bash(cd:*)'), 'Seldon denies cd itself');
  assert.deepEqual(unbreakable(shippedStepOf('seldon'), cd), [], 'its own deny refuses cd');
  const unDenied = { ...shippedStepOf('seldon'), disallowedTools: ownDenies.filter((rule) => rule !== 'Bash(cd:*)') };
  assert.deepEqual(unbreakable(unDenied, cd), ['design: checks-bare Bash(cd:*)'], "without it, the settings' allow reaches cd");
  assert.deepEqual(
    unbreakable({ ...seldon, disallowedTools: [...ownDenies, 'Bash(cat:*)'] }, spec.rules),
    [],
    'a deny of its own refuses it',
  );
  assert.deepEqual(brokenBy('Bash(git -C:*)'), { tool: 'Bash', command: 'git' }, "a denial keeps a command's first word");
  assert.deepEqual(brokenBy('Read(//etc/**)'), { tool: 'Read' });
  assert.deepEqual(brokenBy('Glob'), { tool: 'Glob' });
  const outside = shippedAllowed('seldon', 'build', 'Agent, Glob, Read(//home/**)');
  assert.deepEqual(unbreakable(outside, spec.rules), ['design: read-within-reach Glob', 'design: read-within-reach Read']);
  const [review] = SHIPPED_RULES.filter(({ skill }) => skill === 'review-a-change');
  assert.ok(review, 'review-a-change declares its rules');
  const line = (shippedStepOf('agora').allowedTools ?? []).join(', ');
  assert.deepEqual(unbreakable(agoraAllowed(`${line}, Grep`), review.rules), ['review: read-within-reach Grep']);
});

test('the shipped read-within-reach rule is broken by a denied Glob, Grep or Read, as nemia stats counts it, and kept by a denied npm', () => {
  const outside = 'Read(/srv/.agent-workflows/runs/r/artifacts/a.md)';
  for (const skill of ['write-a-spec', 'review-a-change']) {
    const [shipped] = SHIPPED_RULES.filter((rules) => rules.skill === skill);
    assert.ok(shipped, `${skill} declares its rules`);
    const declared = new Map([[skill, shipped.rules]]);
    const reach = (denied: string[]) => {
      const fact = rulesOfTry(denied, declared)?.find((rule) => rule.rule === 'read-within-reach');
      assert.ok(fact, `${skill} declares read-within-reach`);
      return { broken: fact.broken, by: fact.by };
    };
    assert.deepEqual(reach(['Glob', outside, 'Bash(npm)']), { broken: true, by: ['Glob', outside] }, skill);
    assert.deepEqual(reach(['Grep']), { broken: true, by: ['Grep'] }, skill);
    assert.deepEqual(reach(['Bash(npm)']), { broken: false, by: [] }, skill);
  }
});

test("REFUSED: cd to Seldon, Agora and Iris, each by a deny of its own, where the settings' allow would reach it", () => {
  const cd = [{ id: 'never-cd', says: 'never cd', breaks: ['Bash(cd:*)'] }];
  for (const agent of ['seldon', 'agora', 'iris']) {
    const step = shippedStepOf(agent);
    assert.deepEqual(unbreakable(step, cd), [], `${agent} is refused cd`);
    const unDenied = { ...step, disallowedTools: (step.disallowedTools ?? []).filter((rule) => rule !== 'Bash(cd:*)') };
    assert.deepEqual(unbreakable(unDenied, cd), [`${step.name}: never-cd Bash(cd:*)`], `${agent}: without its deny, cd is open`);
  }
});

/** The agents that design, review and interview, each of which reads Anthropic's documentation. */
const READERS = ['seldon', 'agora', 'iris'];

/** Anthropic's documentation, by the host a fetch reads: the only hosts those agents open. */
const DOCUMENTATION: Call[] = ['code.claude.com', 'docs.claude.com', 'platform.claude.com', 'docs.anthropic.com'].map((domain) => ({
  tool: 'WebFetch',
  domain,
}));

/** Another site, in the spellings a session reaches one: a host near Anthropic's, and a host of its own. */
const ELSEWHERE: Call[] = ['claude.com', 'code.claude.com.example.test', 'example.com', 'github.com'].map((domain) => ({
  tool: 'WebFetch',
  domain,
}));

test("Seldon, Agora and Iris read Anthropic's documentation and search the web by their own allow, each host by name, and no other host", () => {
  for (const agent of READERS) {
    const step = shippedStepOf(agent);
    assert.ok(step.tools?.includes('WebFetch') && step.tools.includes('WebSearch'), `${agent} is given WebFetch and WebSearch`);
    assert.deepEqual(
      runs(step, [...DOCUMENTATION, { tool: 'WebSearch' }], {}, []),
      [...DOCUMENTATION.map(shown), 'WebSearch'],
      `${agent}: by its own allow, no settings read`,
    );
    assert.deepEqual(runs(step, ELSEWHERE, {}, []), [], `${agent} opens no other host`);
    assert.deepEqual(runs(step, [{ tool: 'WebFetch' }], {}, []), [], `${agent} reaches no fetch that names no host`);
  }
});

test('REFUSED: a host an agent allows no more is read no more, and a bare WebFetch allowed opens every site', () => {
  for (const agent of READERS) {
    const cut = shippedEdited(agent, agent === 'iris' ? 'intake' : 'build', 'an allow of docs.claude.com', (text) =>
      text.replace(' WebFetch(domain:docs.claude.com),', ''),
    );
    assert.deepEqual(
      runs(cut, DOCUMENTATION, {}, []),
      DOCUMENTATION.filter((call) => call.domain !== 'docs.claude.com').map(shown),
      `${agent}: without its allow, docs.claude.com is refused`,
    );
    const bare = shippedAllowed(agent, agent === 'iris' ? 'intake' : 'build', 'Agent, WebFetch, WebSearch');
    assert.deepEqual(runs(bare, ELSEWHERE, {}, []), ELSEWHERE.map(shown), `${agent}: a bare WebFetch opens every site`);
  }
});

/** Git's read-only questions a reviewer asks, in the spellings a session types. */
const GIT_QUESTIONS: Call[] = [
  'git log main..HEAD',
  'git show 4c8a05b --stat',
  'git diff main...HEAD',
  'git merge-base --is-ancestor 4c8a05b HEAD',
  'git rev-parse HEAD',
  'git branch --contains 4c8a05b',
  'git status',
].map((command) => ({ tool: 'Bash', command }));

/** Git's writes a reviewer must never run, in the spellings a session types. */
const GIT_WRITES: Call[] = [
  'git commit -m x',
  'git commit --amend --no-edit',
  'git checkout main',
  'git checkout -b x',
  'git reset --hard HEAD~1',
  'git push',
  'git push origin main',
  'git branch -D x',
].map((command) => ({ tool: 'Bash', command }));

/**
 * What of `calls` a dontAsk job runs: each whose every part an allow reaches — the step's own, `settings`' and `grants`, a skill's — and
 * no deny of its own or of `settings` does. Each as a rule would name it.
 */
function runs(step: Step, calls: readonly Call[], settings: Settings = SETTINGS, grants: readonly string[] = SKILL_GRANTS): string[] {
  assert.ok(dontAskJob(step), `${step.name} is a dontAsk job, which runs only what an allow reaches`);
  const allows = granting([...(step.allowedTools ?? []), ...(settings.permissions?.allow ?? []), ...grants]);
  const denies = [...(step.disallowedTools ?? []), ...(settings.permissions?.deny ?? [])];
  return calls
    .filter(
      (call) =>
        partsOfCall(call).every((part) => allows.some((rule) => reaches(rule, part))) &&
        !deniedPartsOfCall(call).some((part) => denies.some((rule) => reaches(rule, part))),
    )
    .map(shown);
}

/**
 * The git questions review-a-change names in its step 2, on the line that says which Bash runs, each placeholder (`<commit>`) filled in
 * with an argument a session types.
 */
const askedGit = (from = 'Bash runs only the checks below'): string[] =>
  checksOf('.claude/skills/review-a-change/SKILL.md', from, /`(git\s[^`]*)`/g).map((command) => command.replace(/<[^<>]+>/g, '4c8a05b'));

/** Agora's step, its agent's `allowedTools` line cut back to what it allowed before git's questions, or replaced by `allowed`. */
const agoraAllowed = (allowed = 'Agent'): Step => shippedAllowed('agora', 'build', allowed);

test("Agora asks each of git's read-only questions by its own allow, whatever the settings say, and is refused every git write", () => {
  const agora = shippedStepOf('agora');
  assert.deepEqual(runs(agora, GIT_QUESTIONS, {}, []), GIT_QUESTIONS.map(shown), 'by its own allow, no settings read');
  assert.deepEqual(runs(agora, GIT_QUESTIONS), GIT_QUESTIONS.map(shown), 'with the shipped settings');
  assert.deepEqual(runs(agora, GIT_WRITES), [], 'no allow of its own, of the settings or of a skill reaches a write');
});

test('REFUSED: Agora cut back to its sub-agents asks no git question with no settings read, and allowed git or git branch whole is open to a write', () => {
  assert.deepEqual(runs(agoraAllowed(), GIT_QUESTIONS, {}, []), [], 'the questions are its own allow, not the settings');
  const line = (shippedStepOf('agora').allowedTools ?? []).join(', ');
  assert.deepEqual(runs(agoraAllowed(`${line}, Bash(git:*)`), GIT_WRITES), GIT_WRITES.map(shown));
  assert.deepEqual(runs(agoraAllowed(line.replace('Bash(git branch --contains:*)', 'Bash(git branch:*)')), GIT_WRITES), [
    'Bash(git branch -D x)',
  ]);
});

test('every git question review-a-change names is one Agora asks by its own allow', () => {
  const asked = askedGit();
  assert.ok(asked.length >= 7, `review-a-change names its git questions: ${asked.join(', ')}`);
  const calls = asked.map((command) => ({ tool: 'Bash', command }) as const);
  assert.deepEqual(runs(shippedStepOf('agora'), calls, {}, []), calls.map(shown));
});

/** The line of the build workflow's review that says how the reviewer asks whether the branch holds its base. */
const HOLDS_BASE_NOTE = '**Say whether the branch holds the base**';

/** The git questions the build workflow's review names in that paragraph of its note. */
const askedOfTheBase = (): string[] => checksOf('workflows/build/review.md', HOLDS_BASE_NOTE, /`(git\s[^`]*)`/g);

test("every git question review's note asks of the base is one Agora asks by its own allow", () => {
  const asked = askedOfTheBase();
  assert.ok(asked.length >= 6, `review's note names its questions of the base: ${asked.join(', ')}`);
  const calls = asked.map((command) => ({ tool: 'Bash', command }) as const);
  assert.deepEqual(runs(shippedStepOf('agora'), calls, {}, []), calls.map(shown));
});

test("REFUSED: a question of the base that Agora's own allow does not reach is named", () => {
  const line = (shippedStepOf('agora').allowedTools ?? []).filter((rule) => rule !== 'Bash(git merge-base:*)').join(', ');
  const calls = askedOfTheBase().map((command) => ({ tool: 'Bash', command }) as const);
  const reached = runs(agoraAllowed(line), calls, {}, []);
  assert.deepEqual(
    calls.map(shown).filter((call) => !reached.includes(call)),
    ['Bash(git merge-base --is-ancestor main-worktree/HEAD HEAD)'],
  );
  assert.deepEqual(runs(shippedStepOf('agora'), [{ tool: 'Bash', command: 'git worktree list' }], {}, []), []);
});

/** The denies of a step's fence that reach the merge of the base into its own branch, as its note types it. */
const deniesMerge = (step: Step): string[] =>
  (step.disallowedTools ?? []).filter((rule) => reaches(rule, { tool: 'Bash', command: 'git merge main-worktree/HEAD' }));

test('implement merges the base into its branch by no allow, and no deny of its fence reaches the merge', () => {
  const ada = shippedStepOf('ada');
  assert.equal(ada.permissionMode, 'auto');
  assert.deepEqual(deniesMerge(ada), []);
  const fenced = { ...ada, disallowedTools: [...(ada.disallowedTools ?? []), 'Bash(git merge:*)', 'Bash(git:*)'] };
  assert.deepEqual(deniesMerge(fenced), ['Bash(git merge:*)', 'Bash(git:*)']);
});

/** The line of the build workflow's implement that names the render of a checkout's dashboards. */
const RENDER_NOTE = 'When the change touches `tools/observe`';

/** The render (`tools/observe/render/render.ts`) in each form a session types: bare, with its files, held for a browser, and stopped. */
const RENDERS: Call[] = [
  'node tools/observe/render/render.ts',
  'node tools/observe/render/render.ts --out /s/runs/r-1/artifacts/implement --dashboards steps',
  'node tools/observe/render/render.ts --hold 600',
  'node tools/observe/render/render.ts --stop nemia-render-1-ab',
].map((command) => ({ tool: 'Bash', command }));

/** Docker by hand, which only the render talks to. */
const DOCKER: Call[] = ['docker run -d --rm grafana/otel-lgtm', 'docker rm -f nemia-lgtm', 'docker ps'].map((command) => ({
  tool: 'Bash',
  command,
}));

test('the render of a dashboard is the implementer’s alone: design and review are refused each form of it, and Docker by hand', () => {
  const ada = shippedStepOf('ada');
  assert.equal(ada.name, 'implement');
  assert.notEqual(ada.permissionMode, 'dontAsk', 'the implementer runs what no deny names');
  assert.deepEqual(
    unfenced(ada, SETTINGS, RENDERS),
    RENDERS.map((call) => `implement: ${shown(call)}`),
  );
  const named = checksOf('workflows/build/implement.md', RENDER_NOTE, /`(node tools\/observe\/[^`]*)`/g);
  assert.ok(named.length >= 2, `implement's note names the render: ${named.join(', ')}`);
  for (const command of named) assert.ok(command.startsWith('node tools/observe/render/render.ts'), command);
  for (const agent of ['seldon', 'agora']) assert.deepEqual(runs(shippedStepOf(agent), [...RENDERS, ...DOCKER]), [], agent);
});

test('REFUSED: design or review that an allow of the render reaches, by the settings or its own line, runs each form of it', () => {
  const allow = 'Bash(node tools/observe/render/render.ts:*)';
  const settings = { permissions: { allow: [...SETTINGS_ALLOWS, allow] } };
  for (const agent of ['seldon', 'agora']) assert.deepEqual(runs(shippedStepOf(agent), RENDERS, settings), RENDERS.map(shown), agent);
  const own = { ...shippedStepOf('agora'), allowedTools: [...(shippedStepOf('agora').allowedTools ?? []), allow, 'Bash(docker:*)'] };
  assert.deepEqual(runs(own, [...RENDERS, ...DOCKER]), [...RENDERS, ...DOCKER].map(shown));
  const fenced = { ...shippedStepOf('ada'), disallowedTools: [...(shippedStepOf('ada').disallowedTools ?? []), allow] };
  assert.deepEqual(unfenced(fenced, SETTINGS, RENDERS), [], 'a deny of its own would refuse the implementer');
});

/**
 * The live collector, the side Grafana's own on :4318 (OTLP/HTTP) and :4317 (gRPC), in the spellings a session types to export or post
 * there: what a step that runs what no deny names never points a process of its own at.
 */
const LIVE_COLLECTOR: Call[] = [
  'OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 node src/main.ts',
  'export OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318',
  'env OTEL_EXPORTER_OTLP_ENDPOINT=http://[::1]:4318 nemia up',
  'curl -s -X POST http://localhost:4318/v1/traces -d @spans.json',
  'cd apps/api && OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 timeout 60 node src/main.ts',
  'OTEL_EXPORTER_OTLP_PROTOCOL=grpc OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 node src/main.ts',
].map((command) => ({ tool: 'Bash', command }));

test('every shipped step is refused the live collector by address: implement and land by their own deny, a dontAsk step by no allow', () => {
  for (const { step } of shipped()) assert.deepEqual(unfenced(step, SETTINGS, LIVE_COLLECTOR), [], step.name);
  for (const { agent, workflow, file } of COLLECTOR_FENCED) {
    const step = shippedStepIn(agent, workflow);
    assert.notEqual(step.permissionMode, 'dontAsk', `${file} runs what no deny names`);
    for (const port of ['4318', '4317']) assert.ok(step.disallowedTools?.includes(`Bash(*:${port}*)`), `${file} denies :${port}`);
    const agents = denyLineOf(`agents/${agent}.md`);
    assert.ok(agents.length > 0, `${agent} denies of its own`);
    assert.deepEqual(
      agents.filter((rule) => !denyLineOf(file).includes(rule)),
      [],
      `${file} repeats each deny of ${agent}'s`,
    );
  }
  assert.deepEqual(
    unfenced(shippedStepOf('ada'), SETTINGS, RENDERS),
    RENDERS.map((call) => `implement: ${shown(call)}`),
    'and the render, which holds a throwaway collector, still runs',
  );
  const deny = SETTINGS.permissions?.deny ?? [];
  for (const call of LIVE_COLLECTOR)
    assert.deepEqual(
      deny.filter((rule) => deniedPartsOfCall(call).some((part) => reaches(rule, part))),
      [],
      `${shown(call)} is denied by .claude/settings.json, which binds the person's session that starts the live daemon`,
    );
});

test('REFUSED: implement or land with one of its two address rules cut is open on the live collector by that port', () => {
  for (const { agent, workflow, file } of COLLECTOR_FENCED)
    for (const port of ['4318', '4317']) {
      const rule = `Bash(*:${port}*)`;
      const cut = shippedEdited(agent, workflow, `the rule ${rule}`, (text) => text.replace(`, ${rule}`, ''), file);
      const open = LIVE_COLLECTOR.filter((call) => call.command?.includes(`:${port}`));
      assert.equal(open.length, port === '4318' ? 5 : 1);
      assert.deepEqual(
        unfenced(cut, SETTINGS, LIVE_COLLECTOR),
        open.map((call) => `${cut.name}: ${shown(call)}`),
        `${file} without ${rule}`,
      );
    }
});

test("REFUSED: a deny read against the unwrapped part alone leaves the collector's address in a leading assignment open", () => {
  const assigned = LIVE_COLLECTOR.filter((call) => /^(?:cd \S+ && )?[A-Z_]+=/.test(call.command ?? ''));
  assert.equal(assigned.length, 3);
  const denies = shippedStepOf('ada').disallowedTools ?? [];
  for (const call of assigned) {
    assert.ok(!partsOfCall(call).some((part) => denies.some((rule) => reaches(rule, part))), `${shown(call)}, unwrapped, names no port`);
    assert.ok(
      deniedPartsOfCall(call).some((part) => denies.some((rule) => reaches(rule, part))),
      `${shown(call)}, as typed, does`,
    );
  }
});

/** The whole suite in the spellings a session types: what implement's check already ran on the round's tree. */
const WHOLE_SUITE: Call[] = [
  'npx turbo run test --force --continue',
  'npx turbo run test',
  'npx turbo run test --force',
  'npx turbo run test --continue',
  'npx turbo run test --continue --force',
  'npm test',
  'timeout 900 npx turbo run test --force --continue',
].map((command) => ({ tool: 'Bash', command }));

/** A package's tests and a file's, which a reviewer runs where a finding needs a run to stand on. */
const SCOPED_TESTS: Call[] = [
  'npx turbo run test --force --continue --filter=agent-orchestrator',
  'npx turbo run test --filter=web --force',
  'node --test test/a.test.ts',
].map((command) => ({ tool: 'Bash', command }));

test("Agora is refused the whole suite by its own deny, and runs a package's tests and a file's", () => {
  const agora = shippedStepOf('agora');
  assert.deepEqual(runs(agora, WHOLE_SUITE), []);
  assert.deepEqual(runs(agora, SCOPED_TESTS), SCOPED_TESTS.map(shown));
});

test("REFUSED: Agora without its denies of the whole suite, read from its file as a run reads it, runs each the settings' allow reaches", () => {
  const agora = shippedStepOf('agora');
  const whole = new Set(WHOLE_SUITE.map(shown));
  const open = { ...agora, disallowedTools: (agora.disallowedTools ?? []).filter((rule) => !whole.has(rule)) };
  assert.deepEqual(runs(open, WHOLE_SUITE), WHOLE_SUITE.map(shown));
});

test("REFUSED: a git question review-a-change names that Agora's own allow does not reach is named", () => {
  const line = (shippedStepOf('agora').allowedTools ?? []).filter((rule) => rule !== 'Bash(git merge-base:*)').join(', ');
  const calls = askedGit().map((command) => ({ tool: 'Bash', command }) as const);
  const reached = runs(agoraAllowed(line), calls, {}, []);
  assert.deepEqual(
    calls.map(shown).filter((call) => !reached.includes(call)),
    ['Bash(git merge-base)', 'Bash(git merge-base --is-ancestor 4c8a05b HEAD)'],
  );
  assert.throws(
    () => askedGit('Bash runs no git'),
    (err: Error) => err.message.includes('review-a-change/SKILL.md: no "Bash runs no git"'),
  );
});

/** The run's artifacts folder the reach below is filed against, one folder per step under it. */
const RUN_ARTIFACTS = '/s/runs/r-1/artifacts';

/** The store's inbox the reach below is filed against, and a card in it. */
const INBOX = '/s/inbox';
const CARD = path.join(INBOX, 'card.md');

/** A file the step `by` handed over, in its own folder of the run's artifacts. */
const handedBy = (by: string): string => path.join(RUN_ARTIFACTS, by, 'shot.png');

/** The run's inputs folder the reach below is filed against, and a file `nemia start --input` gave the run in it. */
const INPUTS = '/s/runs/r-1/inputs';
const INPUT_FILE = path.join(INPUTS, 'template-draft.md');

/**
 * Each step of `steps` by its name, with the config its first filing gives its harness (`filedConfig`), in a run that mounts nothing, and
 * is given no input unless `inputs` names its inputs folder.
 */
const filedOf = (steps: readonly Step[], inputs?: string): Map<string, Filed> =>
  new Map(
    steps.map((step) => [
      step.name,
      filedConfig(
        step,
        steps,
        { gates: [] },
        {
          model: undefined,
          budgetUsd: undefined,
          runArtifacts: RUN_ARTIFACTS,
          inbox: INBOX,
          ...(inputs === undefined ? {} : { inputs }),
          own: {},
          landingDenied: () => declared.denyWhileLanding,
        },
      ),
    ]),
  );

type Filed = ReturnType<typeof filedConfig>;

/** Whether `file` is under the folder a rule `Tool(//<folder>/**)` of the tool `tool` names, for a rule of that shape. */
const ruleCovers = (rule: string, tool: string, file: string): boolean => {
  const folder = new RegExp(`^${tool}\\(/(/.*)/\\*\\*\\)$`).exec(rule)?.[1];
  return folder !== undefined && file.startsWith(`${folder}/`);
};

/** Whether a mount of a filed config holds `file`, read-only or writable as `readOnly` says. */
const mountHolds = (config: Filed, file: string, readOnly: boolean): boolean =>
  (config.mounts ?? []).some((m) => m.readOnly === readOnly && file.startsWith(`${m.path}/`));

/** Whether a session filed with `config` reads `file` outside its workspace: a mount holds it, or a `Read(//<folder>/**)` allow does. */
const readsAt = (config: Filed, file: string): boolean =>
  mountHolds(config, file, true) ||
  mountHolds(config, file, false) ||
  (config.allowedTools ?? []).some((rule) => ruleCovers(rule, 'Read', file));

/**
 * Whether a session filed with `config` may write `file` outside its workspace: a writable mount or an `Edit(//<folder>/**)` allow names
 * it, and neither a read-only mount, whose deny beats every allow and mode, nor an `Edit(//<folder>/**)` deny holds it.
 */
const writesAt = (config: Filed, file: string): boolean =>
  (mountHolds(config, file, false) || (config.allowedTools ?? []).some((rule) => ruleCovers(rule, 'Edit', file))) &&
  !mountHolds(config, file, true) &&
  !(config.disallowedTools ?? []).some((rule) => ruleCovers(rule, 'Edit', file));

test('a later step reads, and never writes, what each step it comes after handed over; its own folder is held by none', () => {
  const filed = filedOf(loadWorkflows(TEAM_DEV));
  const review = filed.get('review')!;
  const ship = filed.get('ship')!;
  const implement = filed.get('implement')!;
  assert.ok(readsAt(review, handedBy('implement')), "review reads implement's pictures");
  assert.equal(writesAt(review, handedBy('implement')), false, "review writes none of implement's");
  for (const by of ['implement', 'review']) {
    assert.ok(readsAt(ship, handedBy(by)), `ship reads ${by}'s`);
    assert.equal(writesAt(ship, handedBy(by)), false, `ship writes none of ${by}'s`);
  }
  assert.equal(readsAt(implement, handedBy('review')), false, 'implement comes after nothing, and reads no folder of the run');
  for (const [name, config] of filed) {
    assert.equal(mountHolds(config, handedBy(name), true), false, `${name}'s own folder is not mounted read-only`);
    assert.equal(mountHolds(config, handedBy(name), false), false, `${name}'s own folder is not mounted`);
  }
});

test('REFUSED: a step does not read the folder of a step it does not come after', () => {
  const steps = loadWorkflows(folderOf({ a: 'permissionMode: dontAsk', b: 'permissionMode: dontAsk', c: 'after: a', d: 'after: b, c' }));
  const filed = filedOf(steps);
  const reads = (name: string): string[] => ['a', 'b', 'c', 'd'].filter((by) => readsAt(filed.get(name)!, handedBy(by)));
  assert.deepEqual(reads('c'), ['a'], "c reads a's, never its sibling b's nor d's after it");
  assert.deepEqual(reads('d'), ['a', 'b', 'c'], 'd reads b and c, and a through c');
  assert.deepEqual(reads('a'), [], 'a comes after nothing');
  assert.deepEqual(reads('b'), [], 'b comes after nothing');
  assert.deepEqual(
    handedMounts(
      steps.find((s) => s.name === 'd')!,
      steps,
      RUN_ARTIFACTS,
    ),
    ['a', 'b', 'c'].map((by) => ({ path: path.join(RUN_ARTIFACTS, by), readOnly: true })),
    "in the workflow's order",
  );
});

test('REFUSED: a handed folder mounted writable is open to a write, and an Edit allow on it is no write while it is mounted read-only', () => {
  const review = filedOf(loadWorkflows(TEAM_DEV)).get('review')!;
  const opened = { ...review, mounts: review.mounts!.map((m) => ({ ...m, readOnly: false })) };
  assert.ok(writesAt(opened, handedBy('implement')), 'the model sees a writable mount as a write');
  const allowed = { ...review, allowedTools: [...(review.allowedTools ?? []), `Edit(/${path.join(RUN_ARTIFACTS, 'implement')}/**)`] };
  assert.ok(writesAt({ ...allowed, mounts: [] }, handedBy('implement')), 'the model sees an Edit allow as a write');
  assert.equal(writesAt(allowed, handedBy('implement')), false, "the read-only mount's deny beats the allow");
});

test('a step on a sandboxed or a remote harness is filed no handed mount', () => {
  const steps = loadWorkflows(TEAM_DEV);
  const review = steps.find((s) => s.name === 'review')!;
  const codex = { ...review, harness: 'codex', permissionMode: 'read-only' };
  assert.deepEqual(handedMounts(codex, steps, RUN_ARTIFACTS), [], 'codex reads the disk in its sandbox already');
  assert.equal(Object.hasOwn(filedOf(steps.map((s) => (s.name === 'review' ? codex : s))).get('review')!, 'mounts'), false, 'no key');
  assert.deepEqual(handedMounts({ ...review, harness: 'a2a:peer' }, steps, RUN_ARTIFACTS), [], 'a remote agent is filed no local field');
  assert.deepEqual(handedMounts({ ...review, harness: 'claude' }, steps, RUN_ARTIFACTS), [
    { path: path.join(RUN_ARTIFACTS, 'implement'), readOnly: true },
  ]);
});

test('every shipped step on a harness fenced by a permission mode reads, and never writes, what each step it comes after handed over', () => {
  const checked: string[] = [];
  for (const dir of FOLDERS) {
    const steps = loadWorkflows(dir, placesOf(dir));
    const filed = filedOf(steps);
    for (const step of steps.filter((s) => !sandboxed(s.harness ?? 'claude') && !s.harness?.startsWith('a2a:'))) {
      for (const by of upstreamOf(steps, step.name)) {
        const config = filed.get(step.name)!;
        assert.ok(readsAt(config, handedBy(by)), `${path.basename(dir)}/${step.name} reads ${by}'s`);
        assert.equal(writesAt(config, handedBy(by)), false, `${path.basename(dir)}/${step.name} writes none of ${by}'s`);
        checked.push(`${path.basename(dir)}/${step.name} <- ${by}`);
      }
    }
  }
  assert.ok(checked.includes('build/review <- implement'), checked.join('\n'));
});

test('the janitor reads the inbox, and writes none of it: every shipped step whose `reads:` names it', () => {
  const readers = shipped().filter(({ step }) => step.reads?.includes('inbox'));
  assert.ok(
    readers.some(({ dir, step }) => `${path.basename(dir)}/${step.name}` === 'janitor/argus'),
    readers.map(({ dir, step }) => `${path.basename(dir)}/${step.name}`).join('\n'),
  );
  for (const { dir, step } of readers) {
    const config = filedOf(loadWorkflows(dir, placesOf(dir))).get(step.name)!;
    assert.ok(readsAt(config, CARD), `${path.basename(dir)}/${step.name} reads the inbox's cards`);
    assert.equal(writesAt(config, CARD), false, `${path.basename(dir)}/${step.name} writes none of them`);
  }
});

test('REFUSED: a step whose `reads:` does not name the inbox reads none of it', () => {
  const at = (workflow: string, name: string): Filed => {
    const found = shipped().find(({ dir, step }) => path.basename(dir) === workflow && step.name === name);
    assert.ok(found, `${workflow}/${name} is shipped`);
    return filedOf(loadWorkflows(found.dir, placesOf(found.dir))).get(name)!;
  };
  for (const [workflow, name] of [
    ['build', 'design'],
    ['build', 'review'],
    ['intake', 'intake'],
  ])
    assert.equal(readsAt(at(workflow, name), CARD), false, `${workflow}/${name} names no store folder, and reads no card`);
  const argus = shippedStepOf('argus');
  assert.equal(readsAt(filedOf([{ ...argus, reads: undefined }]).get(argus.name)!, CARD), false, 'Argus without the line reads none');
  assert.deepEqual(readsMounts({ ...argus, harness: 'codex' }, INBOX), [], 'codex reads the disk in its sandbox already');
  assert.deepEqual(readsMounts({ ...argus, harness: 'a2a:peer' }, INBOX), [], 'a remote agent is filed no local field');
  assert.deepEqual(readsMounts(argus, INBOX), [{ path: INBOX, readOnly: true }]);
});

test('REFUSED: the inbox mounted writable is open to a write, and an Edit allow on it is no write while it is mounted read-only', () => {
  const argus = shippedStepOf('argus');
  const config = filedOf([argus]).get(argus.name)!;
  const opened = { ...config, mounts: config.mounts!.map((m) => ({ ...m, readOnly: false })) };
  assert.ok(writesAt(opened, CARD), 'the model sees a writable mount as a write');
  const allowed = { ...config, allowedTools: [...(config.allowedTools ?? []), `Edit(/${INBOX}/**)`] };
  assert.ok(writesAt({ ...allowed, mounts: [] }, CARD), 'the model sees an Edit allow as a write');
  assert.equal(writesAt(allowed, CARD), false, "the read-only mount's deny beats the allow");
});

test("every shipped step of a repository run on a harness fenced by a permission mode reads, and never writes, its run's inputs", () => {
  const checked: string[] = [];
  for (const dir of FOLDERS) {
    const steps = loadWorkflows(dir, placesOf(dir));
    if (isFolderTeam(steps)) continue;
    const filed = filedOf(steps, INPUTS);
    for (const step of steps.filter((s) => !sandboxed(s.harness ?? 'claude') && !s.harness?.startsWith('a2a:'))) {
      const config = filed.get(step.name)!;
      assert.ok(readsAt(config, INPUT_FILE), `${path.basename(dir)}/${step.name} reads the run's inputs`);
      assert.equal(writesAt(config, INPUT_FILE), false, `${path.basename(dir)}/${step.name} writes none of them`);
      checked.push(`${path.basename(dir)}/${step.name}`);
    }
  }
  assert.ok(checked.includes('intake/intake') && checked.includes('build/design'), checked.join('\n'));
});

test('REFUSED: a run given no input reads none; the inputs mounted writable are open to a write, and an Edit allow is no write while they are read-only', () => {
  const steps = loadWorkflows(TEAM_DEV);
  for (const [name, config] of filedOf(steps)) assert.equal(readsAt(config, INPUT_FILE), false, `${name} is given no input`);
  const implement = filedOf(steps, INPUTS).get('implement')!;
  const opened = { ...implement, mounts: implement.mounts!.map((m) => ({ ...m, readOnly: false })) };
  assert.ok(writesAt(opened, INPUT_FILE), 'the model sees a writable mount as a write');
  const allowed = { ...implement, allowedTools: [...(implement.allowedTools ?? []), `Edit(/${INPUTS}/**)`] };
  assert.ok(writesAt({ ...allowed, mounts: [] }, INPUT_FILE), 'the model sees an Edit allow as a write');
  assert.equal(writesAt(allowed, INPUT_FILE), false, "the read-only mount's deny beats the allow");
});

test("a step on a sandboxed or a remote harness, and a folder team's, is filed no inputs mount; a run given none mounts nothing", () => {
  const repo = [{ place: 'git' as const }];
  const folder = [{ place: 'folder' as const }];
  assert.deepEqual(inputsMounts({ harness: 'claude' }, repo, INPUTS), [{ path: INPUTS, readOnly: true }]);
  assert.deepEqual(inputsMounts({ harness: undefined }, repo, INPUTS), [{ path: INPUTS, readOnly: true }], 'the default harness');
  assert.deepEqual(inputsMounts({ harness: 'codex' }, repo, INPUTS), [], 'codex reads the disk in its sandbox already');
  assert.deepEqual(inputsMounts({ harness: 'a2a:peer' }, repo, INPUTS), [], 'a remote agent is filed no local field');
  assert.deepEqual(inputsMounts({ harness: 'claude' }, folder, INPUTS), [], "a folder team's steps read the copy in their own folder");
  assert.deepEqual(inputsMounts({ harness: 'claude' }, repo, undefined), [], 'a run given none');
});

/** Nemia as her keeper files her: her shipped definition, in the background. */
const nemia = (file?: string): Step => ({ ...readNemia(file), name: 'nemia', background: true });

test("Nemia is refused git push, a forced branch delete, a kill by name, browser_run_code_unsafe, a merge and gh's merge by her own deny", () => {
  const her = nemia();
  assert.deepEqual(unfenced(her, {}), [], 'fenced by her own list, whatever the settings say');
  for (const command of ['git merge wf/r-1/implement', 'gh pr merge 12 --squash', 'cd /code/app && git merge main'])
    assert.ok(
      partsOfCall({ tool: 'Bash', command }).some((part) => (her.disallowedTools ?? []).some((rule) => reaches(rule, part))),
      command,
    );
});

test('REFUSED: Nemia without her deny of git push is open on each push, and a mode but auto is refused her', () => {
  const her = nemia();
  const bare = { ...her, disallowedTools: her.disallowedTools?.filter((rule) => !rule.startsWith('Bash(git push')) };
  assert.deepEqual(unfenced(bare, {}), [
    'nemia: Bash(git push)',
    'nemia: Bash(git push origin main)',
    'nemia: Bash(git push --force origin wf/r-1/implement)',
  ]);
  const dir = scratch('wf-nemia-mode-');
  const text = fs.readFileSync(path.join(import.meta.dirname, '..', 'nemia', 'nemia.md'), 'utf8');
  for (const mode of ['default', 'dontAsk', 'bypassPermissions', 'acceptEdits']) {
    const file = path.join(dir, `${mode}.md`);
    fs.writeFileSync(file, text.replace('permissionMode: auto', `permissionMode: ${mode}`));
    assert.throws(
      () => readNemia(file),
      (err: Error) => err.message.includes(`her permissionMode is ${mode}`) && err.message.endsWith('permissionMode: auto.'),
      mode,
    );
  }
});

/** Her rules as Claude Code reads them: what runs unasked, what is asked of the person, and what is refused her. */
type Rules = { allow: readonly string[]; ask: readonly string[]; deny: readonly string[] };

/**
 * Her rules as her keeper files them (`nemiaSpec`) in the store `root`: her own allow list and deny, the fence derived from the table
 * (`nemiaFence`) less each prompt `local` allows by its own rule (`widened`) and the store's denies (`storeDenies`), her memory allowed
 * her; with the person's own allows `local` besides, in her folder's local settings.
 */
function herRules(root: string, local: readonly string[] = []): Rules {
  const her = nemia();
  const fence = widened(nemiaFence(TABLE), local);
  return {
    allow: [...(her.allowedTools ?? []), ...fence.allow, `Edit(/${path.join(root, 'nemia', 'memory')}/**)`, ...local],
    ask: fence.ask,
    deny: [...(her.disallowedTools ?? []), ...fence.deny, ...storeDenies(root)],
  };
}

/** A store with what her keeper reads to deny her: a run's folder, the daemon's file and her own folder. */
function herStore(): string {
  const root = scratch('wf-nemia-store-');
  fs.mkdirSync(path.join(root, 'runs', 'r-1'), { recursive: true });
  fs.mkdirSync(path.join(root, 'nemia', 'memory'), { recursive: true });
  fs.writeFileSync(path.join(root, 'daemon.json'), '{}');
  return root;
}

/** What waits on the person in the tests' store: `design` of `r-1` at its gate; `check` of `r-1` on no one; no other run is there. */
const waitOf = (runId: string, step: string): string | undefined =>
  runId !== 'r-1' ? 'is not there: no such run' : step === 'design' ? 'is awaiting approval' : undefined;

/** What Claude Code does with a call: refuse it, ask the person, run it unasked, or leave it to its mode, which no rule reaches. */
type Verdict = 'deny' | 'ask' | 'allow' | 'unmatched';

/**
 * The verdict on the shell line `command` under `rules`, with her admission asked first (`admissionOf`) unless `admitted` is false: a
 * deny on any part refuses it; else her admission's ask, or an ask on any part, asks; else an allow on every part runs it unasked.
 */
function verdictOf(rules: Rules, command: string, admitted = true): Verdict {
  const parts = partsOfCall({ tool: 'Bash', command });
  const on = (list: readonly string[]) => (part: Call) => list.some((rule) => reaches(rule, part));
  if (parts.some(on(rules.deny))) return 'deny';
  const asked = admitted && admissionOf({ tool: 'Bash', input: { command }, cwd: '/' }, TABLE, waitOf) !== undefined;
  if (asked || parts.some(on(rules.ask))) return 'ask';
  return parts.every(on(rules.allow)) ? 'allow' : 'unmatched';
}

/** Whether an `Edit` rule on an absolute path (`Edit(//at)`, `Edit(//at/**)`) reaches a write of `file`: that file, or one under it. */
function editReaches(rule: string, file: string): boolean {
  const at = /^Edit\(\/(\/.*?)(\/\*\*)?\)$/.exec(rule);
  if (at === null) return false;
  return at[2] === undefined ? file === at[1] : file.startsWith(`${at[1]}/`);
}

/** The verdict on an edit of `file` under `rules`: a deny that reaches it refuses it, else an allow runs it unasked. */
const editVerdictOf = (rules: Rules, file: string): Verdict =>
  rules.deny.some((rule) => editReaches(rule, file)) ? 'deny' : rules.allow.some((rule) => editReaches(rule, file)) ? 'allow' : 'unmatched';

/**
 * Each call the command line serves of every command of `table`, and the verdict its class owes: a write that prompts asks, bare and with
 * an argument, one out of her reach is denied, a read, her own write and an answer run unasked by her rules alone; a command that reads
 * bare runs unasked with an argument and with a flag it reads by, and asks with each word or flag that sets, after its argument and
 * before it.
 */
function owedOf(table: readonly (typeof TABLE)[number][]): [string, Verdict][] {
  return table
    .filter((entry) => entry.only?.side !== 'api')
    .flatMap(({ name, nemia: c }): [string, Verdict][] => {
      const forms = [`nemia ${name}`, `nemia ${name} r-1`];
      if (c === 'out' || c === 'prompts') return forms.map((form) => [form, c === 'out' ? 'deny' : 'ask']);
      if (typeof c !== 'object') return forms.map((form) => [form, 'allow']);
      const set = (s: string) => (s.startsWith('-') ? [`nemia ${name} r-1 ${s} v`, `nemia ${name} ${s} v r-1`] : [`nemia ${name} ${s}`]);
      return [
        ...forms.map((form): [string, Verdict] => [form, 'allow']),
        ...(c.readsBy ?? []).map((s): [string, Verdict] => [`nemia ${name} r-1 ${s} v`, 'allow']),
        ...c.setsBy.flatMap(set).map((form): [string, Verdict] => [form, 'ask']),
      ];
    });
}

/** Each call of `owedOf` whose verdict under `rules`, her admission left out, is not the one its class owes, as `<call>: <verdict>`. */
const misjudged = (rules: Rules, table = TABLE): string[] =>
  owedOf(table)
    .filter(([command, owed]) => verdictOf(rules, command, false) !== owed)
    .map(([command]) => `${command}: ${verdictOf(rules, command, false)}`);

test('her fence asks every write that prompts and every write form of a command that reads bare, denies her what is out, and lets the rest through', () => {
  const rules = herRules(herStore());
  assert.deepEqual(misjudged(rules), []);
  const owed: [string, Verdict][] = [
    ['nemia ls', 'allow'],
    ['nemia show r-1', 'allow'],
    ['nemia level', 'allow'],
    ['nemia factory instruction f', 'allow'],
    ['nemia agents custom ada --repo /code/app', 'allow'],
    ['nemia start build --message m', 'allow'],
    ['nemia hold r-1', 'allow'],
    ['nemia inbox add card', 'allow'],
    ['nemia retry r-1 check', 'allow'],
    ['nemia level manual', 'ask'],
    ['nemia cancel r-1', 'ask'],
    ['nemia rm r-1', 'ask'],
    ['nemia factory instruct f --text t', 'ask'],
    ['nemia factory instruction f --path NEMIA.md', 'ask'],
    ['nemia factory instruction --store f', 'ask'],
    ['nemia agents custom --clear ada', 'ask'],
    ['nemia agents custom ada --file -', 'ask'],
    ['nemia agents write ada', 'ask'],
    ['nemia tick', 'deny'],
    ['nemia up --port 8787', 'deny'],
    ['wf approve r-1 design', 'deny'],
    ['ae stop t-1', 'deny'],
  ];
  assert.deepEqual(
    owed.filter(([command, verdict]) => verdictOf(rules, command) !== verdict).map(([command]) => command),
    [],
  );
});

test('REFUSED: a command of the fence reclassed, an ask rule of the fence taken away, and a deny taken away are each named', () => {
  const rules = herRules(herStore());
  const reclassed = TABLE.map((entry) => (entry.name === 'cancel' ? { ...entry, nemia: 'hers' as const } : entry));
  assert.deepEqual(misjudged(rules, reclassed), ['nemia cancel: ask', 'nemia cancel r-1: ask']);
  const cut = { ...rules, ask: rules.ask.filter((rule) => rule !== 'Bash(nemia rm:*)') };
  assert.deepEqual(misjudged(cut), ['nemia rm: unmatched', 'nemia rm r-1: unmatched']);
  const store = { ...rules, ask: rules.ask.filter((rule) => rule !== 'Bash(nemia factory instruction *--store*)') };
  assert.deepEqual(misjudged(store), ['nemia factory instruction r-1 --store v: allow', 'nemia factory instruction --store v r-1: allow']);
  const open = { ...rules, deny: rules.deny.filter((rule) => rule !== 'Bash(nemia tick:*)') };
  assert.deepEqual(misjudged(open), ['nemia tick: unmatched', 'nemia tick r-1: unmatched']);
});

test('REFUSED to run unasked: an approval, a round, an accept, a raised cap and a retry of what waits ask by her admission, whatever the person allows', () => {
  const answers = [
    'nemia approve r-1 design',
    'nemia round r-1 --message m',
    'nemia accept r-1 design',
    'nemia retry r-1 design',
    'nemia retry r-1 check --budget 5',
    'nemia retry r-9 check',
    'cd /code/app && nemia approve r-1 design',
  ];
  for (const local of [[], ['Bash(nemia:*)', 'Bash(nemia approve:*)', 'Bash(nemia retry:*)']]) {
    const rules = herRules(herStore(), local);
    assert.deepEqual(
      answers.filter((command) => verdictOf(rules, command) !== 'ask'),
      [],
      `local allows ${local.join(', ')}`,
    );
    assert.equal(verdictOf(rules, 'nemia retry r-1 check'), 'allow', 'a retry that waits on no one runs unasked');
    assert.equal(verdictOf(rules, 'nemia tick'), 'deny', 'no allow of the person reaches what is out of her reach');
  }
  const rules = herRules(herStore());
  assert.deepEqual(
    answers.filter((command) => verdictOf(rules, command, false) !== 'allow'),
    ['cd /code/app && nemia approve r-1 design'],
    'her static rules allow an answer, but where it follows a command of no rule of hers: her admission alone asks it',
  );
});

test('a prompt the person allowed by its own rule runs unasked once she is filed again; a broader allow widens no prompt and no answer', () => {
  const root = herStore();
  assert.equal(verdictOf(herRules(root), 'nemia cancel r-1'), 'ask');
  assert.equal(verdictOf(herRules(root, ['Bash(nemia cancel:*)']), 'nemia cancel r-1'), 'allow');
  const broad = herRules(root, ['Bash(nemia:*)', 'Bash(nemia approve:*)']);
  assert.equal(verdictOf(broad, 'nemia cancel r-1'), 'ask', 'an ask outranks an allow written anywhere');
  assert.equal(verdictOf(broad, 'nemia approve r-1 design'), 'ask', 'what waits is asked by her admission over every allow');
  assert.equal(verdictOf(herRules(root, ['Bash(nemia tick:*)']), 'nemia tick'), 'deny');
});

test('REFUSED: an edit of the store outside her folder, of her level, her instruction or what she was told is denied her; her memory is hers', () => {
  const root = herStore();
  const rules = herRules(root);
  const files = [path.join(root, 'runs', 'r-1', 'run.json'), path.join(root, 'daemon.json'), levelFile(), promptFile(), toldFile()];
  for (const file of files) assert.equal(editVerdictOf(rules, file), 'deny', file);
  assert.equal(editVerdictOf(rules, path.join(root, 'nemia', 'memory', 'fact.md')), 'allow');
  const open = { ...rules, deny: rules.deny.filter((rule) => !rule.includes(path.join(root, 'runs'))) };
  assert.equal(editVerdictOf(open, path.join(root, 'runs', 'r-1', 'run.json')), 'unmatched', 'without the deny, her mode decides');
});

test("REFUSED: a confirm or a drop of the person's rules for auto is asked over every allow, and an edit of their files is denied her", () => {
  const root = herStore();
  for (const local of [[], ['Bash(nemia:*)', 'Bash(nemia auto:*)', 'Bash(nemia auto confirm:*)', 'Bash(nemia auto drop:*)']]) {
    const rules = herRules(root, local);
    for (const command of ['nemia auto confirm nemia tries', 'nemia auto drop nemia default'])
      assert.equal(verdictOf(rules, command), 'ask', `${command}, local allows ${local.join(', ')}`);
    assert.equal(verdictOf(rules, 'nemia auto nemia'), 'allow', 'the read is hers');
    assert.equal(verdictOf(rules, 'nemia auto propose nemia --file -'), 'allow', 'so is her proposal');
  }
  assert.equal(fs.existsSync(path.join(root, 'auto')), false, 'denied before the folder is there');
  for (const file of ['nemia.json', 'nemia.proposed.json'])
    assert.equal(editVerdictOf(herRules(root), path.join(root, 'auto', file)), 'deny', file);
});

/**
 * The agent of each shipped or tests' step whose `tools:` only the checkout's own allow rules make callable, and the tool: the fence
 * travels with the folder, and these calls do not. Each is a step that must allow them itself before its folder runs anywhere else.
 */
const COVERED_BY_SETTINGS: ReadonlyArray<readonly [string, string, string]> = [
  ['design', 'seldon', 'Bash'],
  ['intake', 'iris', 'Bash'],
];

/** Every step of every shipped folder, and of the tests' team, with the folder it came from. */
const allSteps = (): Array<{ dir: string; step: Workflow }> =>
  [...FOLDERS, TEAM_DEV].flatMap((dir) => loadWorkflows(dir, placesOf(dir)).map((step) => ({ dir, step })));

test("every shipped step can call each tool it is given, judged against this checkout's own allow rules", () => {
  for (const { dir, step } of allSteps()) {
    assert.equal(unallowedRefusal([step], SETTINGS_ALLOWS), undefined, `${path.basename(dir)}/${step.name}`);
  }
});

test("the same steps with no project rule refuse, and only those the checkout's settings cover: what makes them pass here is the repository", () => {
  const refused = allSteps().flatMap(({ step }) => {
    const why = unallowedRefusal([step], []);
    return why === undefined ? [] : [[step.name, step.agent?.name ?? step.name, /gives its session `([^`]+)`/.exec(why)![1]] as const];
  });
  assert.deepEqual(refused, COVERED_BY_SETTINGS);
  for (const [name, agent, tool] of COVERED_BY_SETTINGS) {
    const step = allSteps().find((s) => s.step.name === name && s.step.agent?.name === agent)!.step;
    const why = unallowedRefusal([step], []);
    assert.match(why ?? '', new RegExp(`^${name}: `), name);
    assert.match(why ?? '', new RegExp(`agents/${agent}\\.md`), name);
    assert.ok(why?.includes(`take \`${tool}\` off \`tools:\``), `${name}: the refusal names taking ${tool} off the line`);
  }
});
