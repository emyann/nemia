/**
 * What a permission rule reaches, proven on rules this suite writes or reads: a matcher of Claude Code's rule shapes, the fence of the
 * tests' team, the read set's denies planted on it, and Nemia's own fence. sdlc's agents and their rules as written are
 * `packages/templates/test/fences.test.ts`'s; this file says what such a rule reaches.
 *
 * The matcher is Claude Code's rule shapes this suite relies on (`reaches`), and throws on a wildcard it does not model, so an allow it
 * cannot read fails the test rather than passing it. A command is matched part by part, as Claude Code matches it (`partsOf`): a deny of
 * any part refuses the whole, and a dontAsk step runs it only when an allow reaches every part. A deny is matched against a part as typed
 * too, its leading assignment kept (`deniedPartsOfCall`), as Claude Code was measured to match one; an allow against the unwrapped part
 * alone.
 *
 * The tests' team (`team.ts`) is fenced as a team must be: each step is refused `git push`, a forced branch delete, a kill by name, every
 * `gh` write and Playwright's `browser_run_code_unsafe` (`FENCED`), by its own deny in `auto`, by no allow in `dontAsk`, by a read-only
 * sandbox on codex (`unfenced`). Each refusal is made on the team cut back, and on a watcher's step written here. The checkout's
 * `.claude/settings.json` refuses none of it: the settings bind a person's own session in this checkout too, and a person may ask their
 * session to push or start a probe (`PROBES`).
 *
 * The read set is git's read-only questions and the text tools a read-only agent allows itself (`READ_SET_ALLOWS`), and the denies
 * beside it of what that set would let git run a program by (`RUNS_A_PROGRAM_DENIES`), write a file by (`WRITES_A_FILE_DENY`) or read
 * outside the repository by (`READS_OUTSIDE_DENIES`), and `wc` read a list of paths by (`WC_READS_A_LIST_DENY`). Both are planted here
 * on the tests' reviewer, a dontAsk agent, in a copy of the team (`planted`), and read as a run reads it. Each deny is proven to be the one
 * that refuses its own spellings, and each plain read still asked. Beside them, a reviewer's reads of its pull request (`GH_ALLOWS`), and
 * the denies of every other form of gh they reach (`GH_REFUSED`), each proven the one that refuses its own spellings, and proven needed
 * where a settings file allows those reads to a step that allows none itself, which the checkout's no longer does. The planted lists
 * may drift from sdlc's: what sdlc writes is held where it is written.
 *
 * A writer of one kind of file: the read set with the allows of a contract (`CONTRACT_WRITES`), each a path from the session's working
 * folder (`WORK`), is planted the same way and writes exactly the checkout's contracts, read from the disk, and no helper beside them
 * nor a path of another shape (`NOT_CONTRACTS`); spelled with a leading `*` it writes none, and on a step over an agent that lacks them
 * the same lines are refused at load, a step's fence only narrowing its agent's.
 *
 * Every path a repository skill says its work is on matches a file of the checkout (`appliesUnmatched`), the read-within-reach rule of
 * the repository's skills is counted as `nemia stats` counts it (`rulesOfTry`), and no tsconfig of the checkout makes `tsc --noEmit`
 * write (`buildInfoConfigs`).
 *
 * Nemia, the store's own agent, ships outside any workflow folder (`nemia/nemia.md`) and runs long-lived, outside any checkout this
 * suite reads: she is held to the same fence by her own deny, and to `git merge` and a pull request merged by `gh` besides; a mode but
 * `auto` is refused her (`readNemia`). Her rules are those her keeper files (`herRules`): the fence derived from the table's classes
 * (`nemiaFence`) asks every write that prompts and every write form of a command that reads bare, denies her what is out of her reach,
 * and lets the rest through (`misjudged`); her admission asks every answer to what waits on the person, whatever the person allows
 * (`verdictOf`); and an edit of the store outside her folder is denied her (`editVerdictOf`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { loadWorkflows } from '../src/workflows/workflows.store.ts';
import { readSkillRules, RULES_FILE } from '../src/skills/read.store.ts';
import { appliesMatch, appliesOf } from '../src/skills/skills.ts';
import { scratch } from './scratch.ts';
import { levelFile, promptFile, readNemia, storeDenies, toldFile } from '../src/nemia/level.store.ts';
import { admissionOf, nemiaFence, widened } from '../src/admission/index.ts';
import { TABLE } from '../src/command/commands.verb.ts';
import { rulesOfTry } from '../src/stats/discipline.ts';
import { REPO, TEAM, TEAM_DEV, teamCopy } from './team.ts';

/** The repository's own folder of skills, which a step run in this checkout may load. */
const REPO_SKILLS = path.join(REPO, '.claude', 'skills');

/** Every folder of skills a step of the tests' team may load, whose `allowed-tools` a loaded skill grants the session. */
const SKILL_FOLDERS = [REPO_SKILLS, path.join(TEAM, 'skills')].filter((dir) => fs.existsSync(dir));

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

/** What no step of a team may run, in the spellings a session types. */
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
 * the person's phone through Remote Control. A step starts a probe through its run, which names it.
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

/** The folder a planted session works in, where an edit rule's path from the working folder starts. */
const WORK = '/work/checkout';

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
 * is any run of folders, none included, `**` any run of characters, and `*` any run within a folder's name. A path with no leading `/`,
 * `.` or `~` that holds a `/` before its last name is anchored at the session's working folder, `WORK`, as gitignore anchors a pattern
 * with a slash inside it. Throws on a path from the project (`/x`), on a bare name, which gitignore matches at any depth, and on
 * `<name>/**`, whose depth Claude Code reads differently by rule type: this matcher does not model them.
 */
function covers(rulePath: string, file: string): boolean {
  const fromWork = !/^[/.~]/.test(rulePath) && /\/[^/]+$/.test(rulePath) && !/^[^/]+\/\*\*$/.test(rulePath);
  const from = rulePath.startsWith('//')
    ? rulePath.slice(1)
    : rulePath.startsWith('~/')
      ? `${HOME}${rulePath.slice(1)}`
      : fromWork
        ? `${WORK}/${rulePath}`
        : undefined;
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

/** Every skill's grants, from every folder a step of the tests' team may load one from. */
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
  if (harness !== 'claude') return [`${step.name}: on ${harness}, which this test does not know how to fence`];
  const denies = [...(step.disallowedTools ?? []), ...(settings.permissions?.deny ?? [])];
  const allows = granting([...(step.allowedTools ?? []), ...(settings.permissions?.allow ?? []), ...grants]);
  const dontAsk = step.permissionMode === 'dontAsk' && step.workspace !== 'base';
  return calls
    .filter((call) => {
      if (deniedPartsOfCall(call).some((part) => denies.some((rule) => reaches(rule, part)))) return false;
      return !dontAsk || partsOfCall(call).every((part) => allows.some((rule) => reaches(rule, part)));
    })
    .map((call) => `${step.name}: ${shown(call)}`);
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
        'workspace: base\nslot: none\nharness: claude\npermissionMode: dontAsk\n' +
        'disallowedTools: Bash(git push:*), Bash(gh), Bash(gh:*), Bash(git branch -D:*), Bash(git branch --delete --force:*), ' +
        'Bash(pkill:*), Bash(killall:*), ' +
        'mcp__playwright__browser_run_code_unsafe',
    }),
  ).find((s) => s.name === 'supervise')!;
  assert.deepEqual(unfenced(supervise), [], 'fenced by its own list');
  assert.equal(supervise.permissionMode, 'dontAsk');
  const bare = {
    ...supervise,
    disallowedTools: supervise.disallowedTools?.filter((rule) => !rule.startsWith('Bash(git branch')),
  };
  assert.deepEqual(
    unfenced(bare),
    ['supervise: Bash(git branch -D wf/r-1/implement)', 'supervise: Bash(git branch --delete --force wf/r-1/implement)'],
    "a job in the checkout itself reads that checkout's working-tree settings.json, which a person may have edited",
  );
  assert.deepEqual(
    unfenced({ ...bare, workspace: undefined, place: 'folder' }),
    [],
    'the same step as a job in a folder the run made reads only the settings shipped here, where no allow reaches a forced delete',
  );
});

test("REFUSED: the team's implementer with its deny line cut back to the four it had is open, read from its file as a run reads it", () => {
  const root = teamCopy('wf-fences-');
  const file = path.join(root, 'agents', 'implementer.md');
  const text = fs.readFileSync(file, 'utf8');
  const cut = withFenceList(text, 'disallowedTools', () => 'SendMessage, CronCreate, CronDelete, RemoteTrigger');
  assert.notEqual(cut, text, 'the implementer has a deny line to cut');
  fs.writeFileSync(file, cut);
  const implement = loadWorkflows(path.join(root, 'dev')).find((s) => s.name === 'implement')!;
  assert.equal(implement.agent?.name, 'implementer');
  assert.equal(unfenced(implement).length, FENCED.length, unfenced(implement).join('\n'));
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

test('the matcher reads an edit rule by the path it covers, from the root, the home or the working folder, and throws on one it does not model', () => {
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
  const contract = 'Edit(packages/*/contracts/*.contract.ts)';
  assert.equal(reaches(contract, { tool: 'Write', path: `${WORK}/packages/a/contracts/x.contract.ts` }), true, 'from the session');
  assert.equal(reaches(contract, { tool: 'Edit', path: `${WORK}/packages/a/contracts/x.contract.ts` }), true);
  assert.equal(reaches(contract, { tool: 'Write', path: `${WORK}/packages/a/contracts/laws.ts` }), false);
  assert.equal(reaches(contract, { tool: 'Write', path: `${WORK}/packages/a/contracts/n/x.contract.ts` }), false, 'one folder deep');
  assert.equal(reaches(contract, { tool: 'Write', path: `${WORK}/packages/a/b/contracts/x.contract.ts` }), false, 'a * is one name');
  assert.equal(reaches(contract, { tool: 'Write', path: '/elsewhere/packages/a/contracts/x.contract.ts' }), false, 'anchored');
  assert.equal(
    reaches('Edit(*/contracts/*.contract.ts)', { tool: 'Write', path: `${WORK}/packages/a/contracts/x.contract.ts` }),
    false,
    'a leading * is one folder, not two',
  );
  for (const odd of ['Edit(src/**)', 'Edit(x.ts)'])
    assert.throws(
      () => reaches(odd, { tool: 'Edit', path: `${WORK}/src/b` }),
      (err: Error) => err.message.includes('is not modelled') && err.message.includes('say how it reads'),
      odd,
    );
});

/** A list of a fence that a file's frontmatter writes on one line, as a comma string. */
type FenceList = 'tools' | 'allowedTools' | 'disallowedTools';

/**
 * The line of the fence list `key` in the frontmatter of `text`, in either form: under its harness's block (`claude:`, then `  fence:`,
 * the key four spaces in), or at the top level, the former spelling. Its value is a comma string; a list written as YAML items is thrown
 * on, since no edit here reads one, so that such a list is never read as empty.
 */
function fenceLineIn(text: string, key: FenceList): { start: number; at: number; end: number; head: string; value: string } | undefined {
  const front = /^---\n[\s\S]*?\n---\n/.exec(text)?.[0] ?? '';
  const found = new RegExp(`^(\\w+:\\n  fence:\\n(?:    .*\\n)*?    |)(${key}: ?)(.*)$`, 'm').exec(front);
  if (!found) return undefined;
  const [whole, block = '', head = '', value = ''] = found;
  if (value.trim() === '') throw new Error(`the ${key} list is not a comma string on its own line: write it as one`);
  const at = found.index + block.length;
  return { start: text.lastIndexOf('\n', at) + 1, at, end: found.index + whole.length, head, value };
}

/**
 * `text` with its fence list `key`'s value rewritten by `edit`, in either form (`fenceLineIn`), or the list's line taken out where `edit`
 * gives `undefined`, and its block with it once the block holds nothing. `text` as it was where it has no such list, which each caller's
 * `notEqual` names.
 */
function withFenceList(text: string, key: FenceList, edit: (value: string) => string | undefined): string {
  const found = fenceLineIn(text, key);
  if (!found) return text;
  const value = edit(found.value);
  if (value !== undefined) return text.slice(0, found.at) + found.head + value + text.slice(found.end);
  return (text.slice(0, found.start) + text.slice(found.end + 1)).replace(/^\w+:\n  fence:\n(?! {4})/m, '');
}

/** Whether a step is a dontAsk job, which runs only what an allow reaches. */
const dontAskJob = (step: Step): boolean => step.permissionMode === 'dontAsk' && step.workspace !== 'base';

/**
 * Git's read-only questions a read-only step asks, in the spellings a session types: a form for each rule of the set its agent's
 * `allowedTools` carries. None of them writes the repository, its refs or its configuration. `git merge-tree` writes a loose object into
 * git's store and no ref, index or working tree, which is how this place's `trial` verb asks whether branches merge.
 */
const GIT_READS: Call[] = [
  'git diff main...HEAD',
  'git diff-tree -r HEAD',
  'git log --oneline main..HEAD',
  'git show 4c8a05b --stat',
  'git show main-worktree/HEAD:CLAUDE.md',
  'git show-ref main',
  'git status',
  'git status --porcelain',
  'git blame -L 1,20 CLAUDE.md',
  'git grep -n foo HEAD',
  'git ls-files packages',
  'git ls-tree HEAD',
  'git cat-file -p HEAD:CLAUDE.md',
  'git rev-parse HEAD',
  'git rev-list --count main..HEAD',
  'git merge-base --is-ancestor 4c8a05b HEAD',
  'git merge-tree main HEAD',
  'git shortlog -s',
  'git describe --always',
  'git name-rev HEAD',
  'git for-each-ref refs/heads',
  'git check-ignore -v node_modules',
  'git branch',
  "git branch --list 'wf/*'",
  'git branch --contains 4c8a05b',
  'git worktree list',
].map((command) => ({ tool: 'Bash', command }));

/**
 * Git's writes a read-only step must never run, in the spellings a session types: the working tree's, the index's, a ref's, a remote's,
 * a worktree's and the configuration's, and a push behind each prefix Claude Code strips no part of (`git -C`, `git -c`, `git --no-pager`).
 */
const GIT_WRITES: Call[] = [
  'git commit -m x',
  'git commit --amend --no-edit',
  'git checkout main',
  'git checkout -b x',
  'git reset --hard HEAD~1',
  'git stash push -m x',
  'git update-ref refs/heads/x HEAD',
  'git tag x',
  'git remote add x y',
  'git fetch',
  'git merge main',
  'git config --global x y',
  'git worktree add ../x',
  'git worktree remove x',
  'git worktree prune',
  'git push',
  'git push origin main',
  'git -C /tmp push',
  'git -c k=v push',
  'git --no-pager push',
  'git branch -D x',
].map((command) => ({ tool: 'Bash', command }));

/**
 * What of `calls` a dontAsk job runs: each whose every part an allow reaches — the step's own, `settings`' and `grants`, a skill's — and
 * no deny of its own or of `settings` does, nor Claude Code's own check of a path outside the working tree (`readsOutside`), unless
 * `inside` is false, which reads the rules alone. Each as a rule would name it.
 */
function runs(
  step: Step,
  calls: readonly Call[],
  settings: Settings = SETTINGS,
  grants: readonly string[] = SKILL_GRANTS,
  inside = true,
): string[] {
  assert.ok(dontAskJob(step), `${step.name} is a dontAsk job, which runs only what an allow reaches`);
  const allows = granting([...(step.allowedTools ?? []), ...(settings.permissions?.allow ?? []), ...grants]);
  const denies = [...(step.disallowedTools ?? []), ...(settings.permissions?.deny ?? [])];
  return calls
    .filter(
      (call) =>
        partsOfCall(call).every((part) => allows.some((rule) => reaches(rule, part)) && !(inside && readsOutside(part))) &&
        !deniedPartsOfCall(call).some((part) => denies.some((rule) => reaches(rule, part))),
    )
    .map(shown);
}

/**
 * The plain text tools each read-only agent allows beside git's questions, by its own allow. None of them writes a file or runs a
 * program: a `>` is a write Claude Code refuses a dontAsk job with no `Edit` allow, and each verb's own options name no output file and
 * no program. What each can read outside the working tree is held by Claude Code's own check (`CLAUDE_KEEPS_INSIDE`), but `wc
 * --files0-from=<file>`, which reads a list of paths from a file and counts each: that check reads no path inside the list, so its
 * deny (`WC_READS_A_LIST_DENY`) names it. Left out on purpose, each able to write a file or run a program: `sed` (`w`, `-i`), `awk`
 * (`system()`, `>`), `find` (`-exec`, `-delete`, `-fprint`), `sort` (`-o`), `uniq` (its output file) and `tee`.
 */
const TEXT_ALLOWS = ['Bash(wc:*)', 'Bash(cut:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(cat:*)', 'Bash(ls:*)'];

/** A read of each text tool inside the working tree, which every read-only agent runs by its own allow. */
const TEXT_READS: Call[] = [
  'cat CLAUDE.md',
  'head -n 20 CLAUDE.md',
  'tail -n 5 CLAUDE.md',
  'wc -l CLAUDE.md',
  'cut -d: -f1 package.json',
  'ls',
  'ls -la packages',
].map((command) => ({ tool: 'Bash', command }));

/**
 * The verbs whose paths Claude Code keeps inside the session's working folders by its own check, before any rule: measured on 2.1.308
 * a dontAsk session allowed `Bash(cat:*)`, `Bash(head:*)`, `Bash(tail:*)`, `Bash(wc:*)`, `Bash(cut:*)` and `Bash(ls:*)`
 * ran each on a file of its folder and was refused each on `/etc/hostname`, `..`, `../<file>`, `~/<file>`, `$HOME/<file>`, after
 * `--`, behind `<`, and on a link in its folder to `/etc/hostname`; and refused `cat <file> > <file>`. It ran `wc --files0-from=<list>`,
 * whose list named `/etc/hostname`, and read it; with `Bash(wc *--f*)` denied, it refused that, `wc --f=<list>` and
 * `wc -l --files0=<list>`, and still ran `wc -l <file>`, `cat <file> | wc -l` and `head -1 <file> && ls`. It resolves a path: `ls
 * ./../<its folder>` ran.
 */
const CLAUDE_KEEPS_INSIDE = ['cat', 'head', 'tail', 'wc', 'cut', 'ls'];

/**
 * Whether Claude Code's own check refuses a part as reading outside the working tree (`CLAUDE_KEEPS_INSIDE`): a word after the verb
 * that opens `/`, `~` or `$`, or that climbs with `..`. A link is not modelled here, having no file system: measured, it is refused.
 * A `..` that climbs back inside is refused here and run by Claude Code, a read inside either way.
 */
function readsOutside(part: Call): boolean {
  const [verb, ...words] = (part.command ?? '').split(/\s+/);
  return CLAUDE_KEEPS_INSIDE.includes(verb) && words.some((word) => /^[/~$]/.test(word) || /(?:^|\/)\.\.(?:\/|$)/.test(word));
}

/** The text tools' reads outside the working tree, each refused by Claude Code's own check, as measured (`CLAUDE_KEEPS_INSIDE`). */
const TEXT_READS_OUTSIDE: Call[] = [
  'cat /etc/hostname',
  'cat -- /etc/hostname',
  'head -1 /etc/hostname',
  'tail -1 /etc/hostname',
  'wc -l /etc/hostname',
  'cut -c1-3 /etc/hostname',
  'ls /etc',
  'ls -la /',
  'ls ..',
  'head -1 ../outside',
  'cat ~/.bashrc',
  'cat $HOME/.bashrc',
].map((command) => ({ tool: 'Bash', command }));

/**
 * `wc --files0-from=<file>` as typed, which reads outside through the paths its file lists, as measured. GNU `wc` takes any unambiguous
 * abbreviation of a long option and `--files0-from` is its only one that begins `--f`, so the deny is `--f` anywhere after `wc`
 * (`wc --f=<list>` was measured to read it); a file named with `--f` in it is refused with them.
 */
const WC_READS_A_LIST: Call[] = ['wc --files0-from=list0', 'wc --f=list0', 'wc -l --files0=list0', 'FOO=1 wc --files0-from=-'].map(
  (command) => ({ tool: 'Bash', command }),
);

/** The deny that answers `wc --files0-from`, planted beside the read set. */
const WC_READS_A_LIST_DENY = 'Bash(wc *--f*)';

/**
 * Every call of the read set that would run a program of its own, in the spellings a session types, each measured in a checkout to run
 * one:
 *
 * - `git grep`'s pager option runs a command on the files that matched. Short, it is `-O<command>`, and git bundles it after other short
 *   options (`-nOsh`), so the deny is every capital `O` after `git grep`. Long, git's parse-options takes any unambiguous abbreviation,
 *   and `--open-files-in-pager` is the only long option of `git grep` that begins `--op` (`--o` alone git refuses as ambiguous), so the
 *   deny is `--op` and every longer spelling holds it. A pattern or path of a search that carries a capital `O` is refused with them:
 *   the cost of a deny that cannot read an option list is a refusal the session reports, which is the trade this set is built on.
 * - An assignment before a git command names a program git then runs: `GIT_EXTERNAL_DIFF` once per changed path for every diff git
 *   shows, and `diff.external` through `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_0`. An allow is matched against the part with every leading
 *   wrapper stripped (`unwrapped`), so no allow of the set can refuse one; a deny is matched against the part as typed too, with its
 *   wrappers kept, so the deny is of `GIT_` anywhere in that part — `Bash(*GIT_*)`, the shape of a deny of what an assignment says
 *   (the matcher's test denies an address so). Without the leading `*` the deny reaches only a part that opens `GIT_`, and a first
 *   assignment that names something else, or a `nohup` or a `timeout` before it, carries the whole of git's environment through. It is
 *   the fence under what each of these roles' skills already says in prose: never `VAR=`.
 * - An assignment of a variable that is not git's names a program too: `HOME` and `XDG_CONFIG_HOME` move the configuration git reads to
 *   a folder the change under review can carry, whose `diff.external` or `core.pager` git then runs. `Bash(*GIT_*)` names none of them,
 *   so the deny is of any assignment before git, `Bash(*=* git *)`: an `=` anywhere before ` git` in the part as typed. It reaches every
 *   spelling `Bash(*GIT_*)` does here, and still asks a search for a word that holds `=` (`STILL_ASKED`), the `=` being after `git`.
 */
const GIT_RUNS_A_PROGRAM: Call[] = [
  'git grep -Osh foo HEAD',
  'git grep -n -Osh foo HEAD',
  'git grep -nOsh foo HEAD',
  'git grep --open-files-in-pager=sh foo HEAD',
  'git grep --open=sh foo HEAD',
  'git grep --ope=sh foo HEAD',
  'git grep --op=sh foo HEAD',
  'GIT_PAGER=sh git grep -Osh foo HEAD',
  'GIT_EXTERNAL_DIFF=sh git diff HEAD',
  'GIT_EXTERNAL_DIFF=sh git show HEAD',
  'GIT_EXTERNAL_DIFF=sh git log -p',
  'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=diff.external GIT_CONFIG_VALUE_0=sh git diff HEAD',
  'FOO=1 GIT_EXTERNAL_DIFF=sh git diff HEAD',
  'FOO=1 GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=diff.external GIT_CONFIG_VALUE_0=sh git diff HEAD',
  'nohup GIT_EXTERNAL_DIFF=sh git diff HEAD',
  'timeout 5 GIT_EXTERNAL_DIFF=sh git diff HEAD',
  'HOME=planted git diff HEAD',
  'XDG_CONFIG_HOME=planted git diff HEAD',
  'FOO=1 HOME=planted git log -p',
  'nohup XDG_CONFIG_HOME=planted git show HEAD',
  'timeout 5 HOME=planted git diff HEAD',
].map((command) => ({ tool: 'Bash', command }));

/** A plain read of each verb those denies narrow, which every read-only agent still asks. */
const STILL_ASKED: Call[] = [
  'git grep -n foo HEAD',
  'git diff HEAD',
  'git show HEAD',
  'git log -p',
  'git grep -n a=b HEAD',
  'git log --format=%H -1',
].map((command) => ({ tool: 'Bash', command }));

/** The deny that answers any assignment before git, `HOME` and `XDG_CONFIG_HOME` among them, planted beside the read set. */
const ASSIGNED_BEFORE_GIT_DENY = 'Bash(*=* git *)';

/** The four denies that answer the allow of a read, by the rule each is written as, planted beside the read set. */
const RUNS_A_PROGRAM_DENIES = ['Bash(git grep *O*)', 'Bash(git grep *--op*)', 'Bash(*GIT_*)', ASSIGNED_BEFORE_GIT_DENY];

/**
 * The verbs of the read set that take git's `--output=<file>`, which creates or truncates the file it names; each measured on git 2.43 to
 * write it (`git diff --output=x --stat HEAD~1 HEAD` prints nothing and writes `x`). `grep`, `ls-files`, `status` and `cat-file` write
 * none.
 */
const OUTPUT_VERBS = ['diff', 'diff-tree', 'log', 'show', 'rev-list', 'blame', 'shortlog'];

/**
 * Every spelling of `--output` a read-only step must not run, as typed: right after the verb and late in the line, joined by `=` and
 * apart, behind an assignment Claude Code strips and behind a wrapper. A deny that names `--output` right after the verb misses the late
 * ones. A quoted, escaped or brace-split spelling (`--out''put`) is not here: a Bash rule matches the text as typed, and no deny string
 * reaches it (root `CLAUDE.md`, *Agents in this repository*).
 */
const GIT_WRITES_A_FILE: Call[] = [
  ...OUTPUT_VERBS.flatMap((verb) => [`git ${verb} --output=/tmp/x HEAD`, `git ${verb} --stat HEAD --output /tmp/x`]),
  'FOO=1 git diff --output=/tmp/x HEAD',
  'nohup git log -p --output=/tmp/x',
  'timeout 5 git show HEAD --output=/tmp/x',
].map((command) => ({ tool: 'Bash', command }));

/** The deny that answers `--output` anywhere in a git command, planted beside the read set. */
const WRITES_A_FILE_DENY = 'Bash(git *--output*)';

/**
 * Every spelling of a read outside the repository a read-only step must not run, as typed, each measured on git 2.43 to read a file
 * outside the folder its Read and Grep are fenced to: `--no-index` on `diff` and `grep` (`grep` takes it abbreviated down to `--no-ind`;
 * `diff` takes it whole, and refuses `--no-ind` and `--no-inde` as ambiguous with `--no-indent-heuristic`), `blame --contents` (taken
 * down to `--con`, `--co` being ambiguous with `--color-by-age`), and `grep -f`, joined to its file or apart, first or late (2.43's
 * `grep` has no `--file`: it refuses it as ambiguous). Its denies name a word that opens `-f`, so `--full-name` and `--files-with-matches`
 * stay asked. Not here, as no deny string reaches them: a bundled `-nf <file>`, which no glob tells from a pattern, and a path outside
 * the working tree with no option typed (`git diff /etc/hostname f`), where git compares the two files on its own (root `CLAUDE.md`,
 * *Agents in this repository*).
 */
const GIT_READS_OUTSIDE: Call[] = [
  'git diff --no-index /etc/hostname CLAUDE.md',
  'git diff --stat --no-index /etc/hostname CLAUDE.md',
  'git grep --no-index foo',
  'git grep -n --no-ind foo',
  'git blame --contents /etc/hostname CLAUDE.md',
  'git blame --con=/etc/hostname CLAUDE.md',
  'git grep -f /etc/hostname',
  'git grep -n -f/etc/hostname HEAD',
  'FOO=1 git grep --no-index foo',
  'timeout 5 git blame CLAUDE.md --contents /etc/hostname',
].map((command) => ({ tool: 'Bash', command }));

/** The denies that answer a read outside the repository, planted beside the read set. */
const READS_OUTSIDE_DENIES = ['Bash(git *--no-ind*)', 'Bash(git blame *--con*)', 'Bash(git grep -f*)', 'Bash(git grep * -f*)'];

/**
 * Every deny planted beside the read set, on the agent's own line: a step's own line adds to it, so each step is refused it. sdlc's own
 * list as written is `packages/templates/test/fences.test.ts`'s.
 */
const READ_SET_DENIES = [...RUNS_A_PROGRAM_DENIES, WRITES_A_FILE_DENY, ...READS_OUTSIDE_DENIES, WC_READS_A_LIST_DENY];

/**
 * Git's read-only questions as rules, one for each form of `GIT_READS`: the git half of the read set planted here. Planted, it may
 * drift from sdlc's; `packages/templates/test/fences.test.ts` holds sdlc's rules as written.
 */
const GIT_ALLOWS = [
  'Bash(git diff:*)',
  'Bash(git diff-tree:*)',
  'Bash(git log:*)',
  'Bash(git show:*)',
  'Bash(git show-ref:*)',
  'Bash(git status:*)',
  'Bash(git blame:*)',
  'Bash(git grep:*)',
  'Bash(git ls-files:*)',
  'Bash(git ls-tree:*)',
  'Bash(git cat-file:*)',
  'Bash(git rev-parse:*)',
  'Bash(git rev-list:*)',
  'Bash(git merge-base:*)',
  'Bash(git merge-tree:*)',
  'Bash(git shortlog:*)',
  'Bash(git describe:*)',
  'Bash(git name-rev:*)',
  'Bash(git for-each-ref:*)',
  'Bash(git check-ignore:*)',
  'Bash(git branch)',
  'Bash(git branch --list:*)',
  'Bash(git branch --contains:*)',
  'Bash(git worktree list:*)',
];

/** The read set planted on a read-only agent's allow: git's questions and the text tools. */
const READ_SET_ALLOWS = [...GIT_ALLOWS, ...TEXT_ALLOWS];

/**
 * The review step of the tests' team, read as a run reads it, from a copy of the team (`teamCopy`) whose reviewer — a dontAsk agent —
 * allows `allows` and denies `denies`, each on its own line of the agent's fence; and the step file's own `disallowedTools:` written as
 * `own`, where it is given, the agent then offering its fence to override. The lines are planted here, so they may drift from sdlc's:
 * `packages/templates/test/fences.test.ts` holds sdlc's rules as written.
 */
function planted({
  allows = READ_SET_ALLOWS,
  denies = READ_SET_DENIES,
  own,
}: { allows?: readonly string[]; denies?: readonly string[]; own?: string } = {}): Step {
  const root = teamCopy('wf-fences-planted-');
  const agent = path.join(root, 'agents', 'reviewer.md');
  const text = fs.readFileSync(agent, 'utf8');
  const allowing = withFenceList(text, 'allowedTools', () => allows.join(', '));
  assert.notEqual(allowing, text, 'the reviewer has an allowedTools line to plant on');
  const denying = denies.length ? `\n    disallowedTools: ${denies.join(', ')}` : '';
  const fenced = allowing.replace(/^ {4}allowedTools: .*$/m, (line) => `${line}${denying}`);
  fs.writeFileSync(agent, own === undefined ? fenced : fenced.replace(/^overridable: (.*)$/m, 'overridable: $1, fence'));
  if (own !== undefined) {
    const file = path.join(root, 'dev', 'review.md');
    const step = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, step.replace(/\n---\n/, `\nclaude:\n  fence:\n    disallowedTools: ${own}\n---\n`));
  }
  const review = loadWorkflows(path.join(root, 'dev')).find((step) => step.name === 'review')!;
  assert.equal(review.agent?.name, 'reviewer');
  assert.ok(dontAskJob(review), 'the review is a dontAsk job, which runs only what an allow reaches');
  return review;
}

/** `rules` less `rule`, which it holds, so taking it off says something. */
const less = (rules: readonly string[], ...rule: string[]): string[] => {
  for (const one of rule) assert.ok(rules.includes(one), `${one} is planted, so taking it off says something`);
  return rules.filter((kept) => !rule.includes(kept));
};

/**
 * The read set's denies less the deny of any assignment before git, which reaches every spelling typed behind one: a test of another
 * deny reads it, so that deny's spelling behind an assignment shows it reaches that spelling on its own.
 */
const UNASSIGNED_DENIES = less(READ_SET_DENIES, ASSIGNED_BEFORE_GIT_DENY);

test('a dontAsk step with the read set and its denies planted asks each read by its own allow, and is refused each write, program and read outside', () => {
  const step = planted();
  assert.deepEqual(runs(step, GIT_READS, {}, []), GIT_READS.map(shown), 'by its own allow, no settings read');
  assert.deepEqual(runs(step, TEXT_READS, {}, []), TEXT_READS.map(shown));
  assert.deepEqual(runs(step, STILL_ASKED, {}, []), STILL_ASKED.map(shown));
  assert.deepEqual(runs(step, GIT_WRITES, {}, []), [], 'no rule of the set reaches a git write');
  assert.deepEqual(runs(step, GIT_RUNS_A_PROGRAM, {}, []), []);
  assert.deepEqual(runs(step, GIT_WRITES_A_FILE, {}, []), []);
  assert.deepEqual(runs(step, GIT_READS_OUTSIDE, {}, []), []);
  assert.deepEqual(runs(step, WC_READS_A_LIST, {}, []), []);
  assert.deepEqual(runs(step, TEXT_READS_OUTSIDE, {}, []), [], "by Claude Code's own check");
  for (const verb of ['sed', 'awk', 'find', 'sort', 'uniq', 'tee'])
    assert.ok(
      !(step.allowedTools ?? []).some((rule) => rule.startsWith(`Bash(${verb}`)),
      `${verb} writes a file or runs a program, and stays out`,
    );
});

test('REFUSED: git whole, git worktree whole or git branch whole in place of a rule of the set runs a write, and a rule dropped loses its question', () => {
  assert.deepEqual(
    runs(planted({ allows: [...READ_SET_ALLOWS, 'Bash(git:*)'] }), GIT_WRITES, {}, []),
    GIT_WRITES.map(shown),
    'git whole opens every write',
  );
  const swapped = (from: string, to: string): string[] =>
    runs(planted({ allows: [...less(READ_SET_ALLOWS, from), to] }), GIT_WRITES, {}, []);
  assert.deepEqual(swapped('Bash(git worktree list:*)', 'Bash(git worktree:*)'), [
    'Bash(git worktree add ../x)',
    'Bash(git worktree remove x)',
    'Bash(git worktree prune)',
  ]);
  assert.deepEqual(swapped('Bash(git branch --contains:*)', 'Bash(git branch:*)'), ['Bash(git branch -D x)']);
  const reached = runs(planted({ allows: less(READ_SET_ALLOWS, 'Bash(git diff:*)') }), GIT_READS, {}, []);
  assert.deepEqual(
    GIT_READS.map(shown).filter((call) => !reached.includes(call)),
    ['Bash(git diff main...HEAD)'],
  );
  assert.deepEqual(runs(planted({ allows: ['Agent'] }), GIT_READS, {}, []), [], 'the questions are its own allow');
});

test('REFUSED: without Claude Code’s check of a path, or without the deny of wc --files0-from, a dontAsk step reads outside', () => {
  assert.deepEqual(runs(planted(), TEXT_READS_OUTSIDE, {}, [], false), TEXT_READS_OUTSIDE.map(shown), 'the allows alone');
  const open = planted({ denies: less(READ_SET_DENIES, WC_READS_A_LIST_DENY) });
  assert.deepEqual(runs(open, WC_READS_A_LIST, {}, []), WC_READS_A_LIST.map(shown), 'its check reads no path in the list');
});

test('REFUSED: without the denies of a read outside a dontAsk step reads one by each, and each deny refuses its own spellings', () => {
  const open = planted({ denies: less(UNASSIGNED_DENIES, ...READS_OUTSIDE_DENIES) });
  assert.deepEqual(runs(open, GIT_READS_OUTSIDE, {}, []), GIT_READS_OUTSIDE.map(shown));
  const without = (rule: string): string[] => runs(planted({ denies: less(UNASSIGNED_DENIES, rule) }), GIT_READS_OUTSIDE, {}, []);
  assert.deepEqual(without('Bash(git *--no-ind*)'), [
    'Bash(git diff --no-index /etc/hostname CLAUDE.md)',
    'Bash(git diff --stat --no-index /etc/hostname CLAUDE.md)',
    'Bash(git grep --no-index foo)',
    'Bash(git grep -n --no-ind foo)',
    'Bash(FOO=1 git grep --no-index foo)',
  ]);
  assert.deepEqual(without('Bash(git blame *--con*)'), [
    'Bash(git blame --contents /etc/hostname CLAUDE.md)',
    'Bash(git blame --con=/etc/hostname CLAUDE.md)',
    'Bash(timeout 5 git blame CLAUDE.md --contents /etc/hostname)',
  ]);
  assert.deepEqual(without('Bash(git grep -f*)'), ['Bash(git grep -f /etc/hostname)']);
  assert.deepEqual(without('Bash(git grep * -f*)'), ['Bash(git grep -n -f/etc/hostname HEAD)']);
  const flags: Call[] = ['git grep --full-name -n foo HEAD', 'git grep --files-with-matches foo HEAD'].map((command) => ({
    tool: 'Bash',
    command,
  }));
  assert.deepEqual(runs(planted(), flags, {}, []), flags.map(shown), 'a long option that holds -f is still asked');
});

test('REFUSED: without the deny of --output a dontAsk step writes a file by each verb, and one narrowed to right after the verb misses it later', () => {
  const open = planted({ denies: less(UNASSIGNED_DENIES, WRITES_A_FILE_DENY) });
  assert.deepEqual(runs(open, GIT_WRITES_A_FILE, {}, []), GIT_WRITES_A_FILE.map(shown));
  const narrow = planted({ denies: [...less(UNASSIGNED_DENIES, WRITES_A_FILE_DENY), 'Bash(git diff --output*)'] });
  assert.ok(runs(narrow, GIT_WRITES_A_FILE, {}, []).includes('Bash(git diff --stat HEAD --output /tmp/x)'), 'written late, it runs');
});

test('REFUSED: without the denies of a program a dontAsk step runs one by each, and each refuses its own spellings', () => {
  const open = planted({ denies: less(READ_SET_DENIES, ...RUNS_A_PROGRAM_DENIES) });
  assert.deepEqual(runs(open, GIT_RUNS_A_PROGRAM, {}, []), GIT_RUNS_A_PROGRAM.map(shown));
  const without = (rule: string): string[] => runs(planted({ denies: less(READ_SET_DENIES, rule) }), GIT_RUNS_A_PROGRAM, {}, []);
  assert.deepEqual(without('Bash(git grep *O*)'), [
    'Bash(git grep -Osh foo HEAD)',
    'Bash(git grep -n -Osh foo HEAD)',
    'Bash(git grep -nOsh foo HEAD)',
  ]);
  assert.deepEqual(without('Bash(git grep *--op*)'), [
    'Bash(git grep --open-files-in-pager=sh foo HEAD)',
    'Bash(git grep --open=sh foo HEAD)',
    'Bash(git grep --ope=sh foo HEAD)',
    'Bash(git grep --op=sh foo HEAD)',
  ]);
  assert.deepEqual(without('Bash(*GIT_*)'), [], "every assignment of git's environment is an assignment before git, refused too");
  assert.deepEqual(without(ASSIGNED_BEFORE_GIT_DENY), [
    'Bash(HOME=planted git diff HEAD)',
    'Bash(XDG_CONFIG_HOME=planted git diff HEAD)',
    'Bash(FOO=1 HOME=planted git log -p)',
    'Bash(nohup XDG_CONFIG_HOME=planted git show HEAD)',
    'Bash(timeout 5 HOME=planted git diff HEAD)',
  ]);
  assert.deepEqual(runs(planted({ denies: less(READ_SET_DENIES, 'Bash(*GIT_*)', ASSIGNED_BEFORE_GIT_DENY) }), GIT_RUNS_A_PROGRAM, {}, []), [
    'Bash(GIT_EXTERNAL_DIFF=sh git diff HEAD)',
    'Bash(GIT_EXTERNAL_DIFF=sh git show HEAD)',
    'Bash(GIT_EXTERNAL_DIFF=sh git log -p)',
    'Bash(GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=diff.external GIT_CONFIG_VALUE_0=sh git diff HEAD)',
    'Bash(FOO=1 GIT_EXTERNAL_DIFF=sh git diff HEAD)',
    'Bash(FOO=1 GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=diff.external GIT_CONFIG_VALUE_0=sh git diff HEAD)',
    'Bash(nohup GIT_EXTERNAL_DIFF=sh git diff HEAD)',
    'Bash(timeout 5 GIT_EXTERNAL_DIFF=sh git diff HEAD)',
    'Bash(HOME=planted git diff HEAD)',
    'Bash(XDG_CONFIG_HOME=planted git diff HEAD)',
    'Bash(FOO=1 HOME=planted git log -p)',
    'Bash(nohup XDG_CONFIG_HOME=planted git show HEAD)',
    'Bash(timeout 5 HOME=planted git diff HEAD)',
  ]);
  const narrow = planted({ denies: [...less(READ_SET_DENIES, 'Bash(*GIT_*)', ASSIGNED_BEFORE_GIT_DENY), 'Bash(GIT_*)'] });
  assert.deepEqual(
    runs(narrow, GIT_RUNS_A_PROGRAM, {}, []),
    [
      'Bash(FOO=1 GIT_EXTERNAL_DIFF=sh git diff HEAD)',
      'Bash(FOO=1 GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=diff.external GIT_CONFIG_VALUE_0=sh git diff HEAD)',
      'Bash(nohup GIT_EXTERNAL_DIFF=sh git diff HEAD)',
      'Bash(timeout 5 GIT_EXTERNAL_DIFF=sh git diff HEAD)',
      'Bash(HOME=planted git diff HEAD)',
      'Bash(XDG_CONFIG_HOME=planted git diff HEAD)',
      'Bash(FOO=1 HOME=planted git log -p)',
      'Bash(nohup XDG_CONFIG_HOME=planted git show HEAD)',
      'Bash(timeout 5 HOME=planted git diff HEAD)',
    ],
    'the deny without its leading * reaches only a part that opens GIT_',
  );
});

test("REFUSED: a step's own deny line cut to one rule lifts none of its agent's, though the line alone would leave them open", () => {
  const cut = planted({ own: 'Bash(npm run build)' });
  assert.ok(cut.disallowedTools?.includes('Bash(npm run build)'), 'the step writes its own line');
  assert.deepEqual(runs(cut, GIT_RUNS_A_PROGRAM, {}, []), [], 'its agent still refuses every program the set would run');
  assert.deepEqual(runs(cut, GIT_WRITES_A_FILE, {}, []), [], 'and every --output');
  const alone = { ...cut, disallowedTools: ['Bash(npm run build)'] };
  assert.deepEqual(
    runs(alone, GIT_RUNS_A_PROGRAM, {}, []),
    GIT_RUNS_A_PROGRAM.map(shown),
    "the line alone, as it once replaced its agent's",
  );
});

/**
 * The allows that let a dontAsk agent write one kind of file and nothing else: a contract, `*.contract.ts` directly under a package's or
 * an app's `contracts/`, each path read from the session's working folder, gitignore's `*` being one name. The nemia factory's own copy
 * of its designer carries them, out of git (root `CLAUDE.md`, *Agents in this repository*); planted here, they may drift from it.
 */
const CONTRACT_WRITES = ['Edit(packages/*/contracts/*.contract.ts)', 'Edit(apps/*/contracts/*.contract.ts)'];

/**
 * Every file under a `contracts/` folder of a package or an app of the checkout, by its path from the root, read from the disk: the
 * contracts a designer writes, and the helpers beside them it must not.
 */
const CONTRACTS_FOLDERS_FILES: string[] = ['packages', 'apps'].flatMap((top) =>
  fs.readdirSync(path.join(REPO, top)).flatMap((name) => {
    const folder = path.join(REPO, top, name, 'contracts');
    if (!fs.existsSync(folder)) return [];
    return fs
      .readdirSync(folder, { recursive: true, encoding: 'utf8' })
      .filter((file) => fs.statSync(path.join(folder, file)).isFile())
      .map((file) => `${top}/${name}/contracts/${file}`)
      .sort();
  }),
);

/** Each other shape of a path the contract allows must refuse, by its path from the root but the last, which is outside `WORK`. */
const NOT_CONTRACTS = [
  'packages/a/src/x.ts',
  'packages/a/contracts/n/x.contract.ts',
  'packages/a/b/contracts/x.contract.ts',
  'contracts/x.contract.ts',
  'x.contract.ts',
  'CLAUDE.md',
  '/elsewhere/packages/a/contracts/x.contract.ts',
];

/** A write of each file of the checkout's contracts folders and of each other shape, at the planted session's working folder. */
const CONTRACT_SHAPED_WRITES: Call[] = [...CONTRACTS_FOLDERS_FILES, ...NOT_CONTRACTS].map((file) => ({
  tool: 'Write',
  path: file.startsWith('/') ? file : `${WORK}/${file}`,
}));

/** The paths of those writes `step` makes, each from the root where it is in `WORK`: each run on its own, `runs` showing no path. */
const writtenBy = (step: Step): string[] =>
  CONTRACT_SHAPED_WRITES.filter((call) => runs(step, [call], {}, []).length > 0).map((call) =>
    call.path!.startsWith(`${WORK}/`) ? call.path!.slice(WORK.length + 1) : call.path!,
  );

test('a dontAsk step with the read set and the contract allows planted writes exactly the contracts of the checkout, and still asks each read', () => {
  const step = planted({ allows: [...READ_SET_ALLOWS, ...CONTRACT_WRITES] });
  const contracts = CONTRACTS_FOLDERS_FILES.filter((file) => file.endsWith('.contract.ts'));
  assert.ok(contracts.length > 0, 'the checkout holds contracts to write');
  assert.ok(CONTRACTS_FOLDERS_FILES.includes('packages/agent-orchestrator/contracts/laws.ts'), 'and helpers beside them');
  assert.deepEqual(writtenBy(step), contracts, 'every contract, and no helper nor any other shape');
  assert.deepEqual(runs(step, GIT_READS, {}, []), GIT_READS.map(shown));
  assert.deepEqual(runs(step, GIT_WRITES, {}, []), []);
  assert.deepEqual(writtenBy(planted()), [], 'without them, the read set writes no file');
});

test("REFUSED: the contract allows spelled with a leading * in place of the package's folder write no contract of the checkout", () => {
  assert.deepEqual(writtenBy(planted({ allows: [...READ_SET_ALLOWS, 'Edit(*/contracts/*.contract.ts)'] })), []);
});

test('REFUSED: the contract writes on a step over an agent that lacks them are refused at load, so they go on the agent', () => {
  const root = teamCopy('wf-fences-contract-');
  const agent = path.join(root, 'agents', 'reviewer.md');
  fs.writeFileSync(agent, fs.readFileSync(agent, 'utf8').replace(/^overridable: (.*)$/m, 'overridable: $1, fence'));
  const file = path.join(root, 'dev', 'review.md');
  const step = fs.readFileSync(file, 'utf8');
  const fence = (lines: string) => step.replace(/\n---\n/, `\nclaude:\n  fence:\n${lines}---\n`);
  fs.writeFileSync(file, fence('    tools: Read, Bash, Skill\n'));
  assert.ok(
    loadWorkflows(path.join(root, 'dev')).some((one) => one.name === 'review'),
    'a narrower fence on the step loads',
  );
  for (const lines of [
    '    tools: Read, Bash, Skill, Write, Edit\n',
    `    tools: Read, Bash, Skill\n    allowedTools: ${CONTRACT_WRITES.join(', ')}\n`,
  ]) {
    fs.writeFileSync(file, fence(lines));
    assert.throws(() => loadWorkflows(path.join(root, 'dev')), lines);
  }
});

/** The pull request's reads the reviewer allows itself, planted beside the read set. sdlc's own is held as written there. */
const GH_ALLOWS = ['Bash(gh pr view:*)', 'Bash(gh pr checks:*)'];

/**
 * The reads of a run's pull request a reviewer makes, in the spellings a session types: its state, head, mergeability and checks, by
 * its number or its branch, fields asked with `--json`. A `w` or an `R` inside the fields is no option, and `--comments` stays open.
 */
const GH_READS: Call[] = [
  'gh pr view 196 --json state,mergeable,headRefOid,title,body,url',
  'gh pr view 196 --json reviews,reviewDecision',
  'gh pr view 196 --comments',
  'gh pr view wf/r-1/implement',
  'gh pr checks 196',
  'gh pr checks 196 --required',
  'gh pr checks 196 --json name,state,bucket',
].map((command) => ({ tool: 'Bash', command }));

/**
 * What gh's two reads would open, run or read beyond the answer by, each deny with the spellings it alone refuses, as typed. gh's flags
 * are pflag's, which takes no abbreviation of a long option, so a long one is denied by its whole name anywhere after `gh`, and a short
 * one by ` -<letter>` opening a word:
 *
 * - `--web`, `-w`: opens a browser, the program `BROWSER` or gh's `browser:` names.
 * - `--watch`: `pr checks` polls until every check ends, and never returns while one is pending.
 * - `--jq`, `-q`: gh compiles the query with the process's environment loaded, so `$ENV` and `env` print every secret the daemon holds.
 * - `--template`, `-t`: a Go template over the answer, with functions of its own; `--json` alone gives every field a review reads.
 * - `--repo`, `-R`, an address (`//`): another repository's pull request, by option or in place of the number.
 * - `-c`: `pr view`'s one short boolean but `-w`, after which pflag bundles any short option, so `-cw`, `-cq…`, `-ct…` and `-cR…`
 *   reach the forms above; `--comments` stays open.
 * - an assignment before gh, matched on the part as typed (`deniedPartsOfCall`): `GH_PAGER`, `PAGER`, `BROWSER`, `GH_BROWSER` choose a
 *   program, `GH_CONFIG_DIR`, `XDG_CONFIG_HOME` and `HOME` a config whose `pager:` or `browser:` does, and `GH_REPO` another
 *   repository. Its leading `*=*` reaches a variable no list names, and a first assignment, a `nohup` or a `timeout` before it.
 *
 * A quoted, escaped or brace-split spelling (`--w''eb`) is not here: a Bash rule matches the text as typed, and no deny reaches it.
 */
const GH_REFUSED: Record<string, string[]> = {
  'Bash(gh *--web*)': ['gh pr view 196 --web', 'gh pr checks 196 --web=true'],
  'Bash(gh * -w*)': ['gh pr view 196 -w', 'gh pr checks 196 -w', 'gh pr view 196 -wc'],
  'Bash(gh *--watch*)': ['gh pr checks 196 --watch', 'gh pr checks 196 --fail-fast --watch=true'],
  'Bash(gh *--jq*)': ["gh pr view 196 --json title --jq '$ENV'", 'gh pr checks 196 --json name --jq=env'],
  'Bash(gh * -q*)': ['gh pr view 196 --json title -q env'],
  'Bash(gh *--template*)': ["gh pr view 196 --json title --template '{{.title}}'"],
  'Bash(gh * -t*)': ['gh pr checks 196 --json name -t x'],
  'Bash(gh *--repo*)': ['gh pr view 1 --repo o/r', 'gh pr view 1 --repo=o/r'],
  'Bash(gh * -R*)': ['gh pr checks 1 -R o/r'],
  'Bash(gh *//*)': ['gh pr view https://github.com/o/r/pull/1'],
  'Bash(gh * -c*)': ['gh pr view -cw 196', 'gh pr view 196 -cq env', 'gh pr view 196 -ct x', 'gh pr view 196 -cRo/r'],
  'Bash(*=* gh *)': [
    'GH_PAGER=sh gh pr view 196',
    'PAGER=sh gh pr view 196',
    'BROWSER=sh gh pr view 196',
    'GH_BROWSER=sh gh pr checks 196',
    'GH_CONFIG_DIR=planted gh pr view 196',
    'XDG_CONFIG_HOME=planted gh pr view 196',
    'HOME=planted gh pr view 196',
    'GH_REPO=o/r gh pr view 1',
    'FOO=1 GH_PAGER=sh gh pr view 196',
    'nohup PAGER=sh gh pr view 196',
    'timeout 5 BROWSER=sh gh pr checks 196',
  ],
};

/** The denies beside gh's reads, each read-only agent's, by the rule each is written as. */
const GH_DENIES = Object.keys(GH_REFUSED);

/** Every spelling of gh's reads a read-only step must not run. */
const GH_REFUSED_CALLS: Call[] = Object.values(GH_REFUSED)
  .flat()
  .map((command) => ({ tool: 'Bash', command }));

/** gh's writes, the gh lines of `FENCED`: what an allow of gh wider than the two reads reaches. */
const GH_WRITES: Call[] = FENCED.filter((call) => call.command?.startsWith('gh '));

/** The reviewer with the read set and gh's reads planted, and their denies, or `denies` in place of gh's. */
const ghPlanted = ({ allows = GH_ALLOWS, denies = GH_DENIES }: { allows?: readonly string[]; denies?: readonly string[] } = {}): Step =>
  planted({ allows: [...READ_SET_ALLOWS, ...allows], denies: [...READ_SET_DENIES, ...denies] });

test("a dontAsk step with gh's two reads and their denies planted reads its pull request, and runs no other form of gh", () => {
  const step = ghPlanted();
  assert.deepEqual(runs(step, GH_READS, {}, []), GH_READS.map(shown), 'by its own allow, no settings read');
  assert.deepEqual(runs(step, GH_REFUSED_CALLS, {}, []), []);
  assert.deepEqual(runs(step, GH_WRITES, {}, []), []);
  assert.deepEqual(runs(step, GIT_READS, {}, []), GIT_READS.map(shown), 'and the read set still asks');
  assert.deepEqual(runs(step, TEXT_READS, {}, []), TEXT_READS.map(shown));
});

test("REFUSED: without gh's denies a dontAsk step runs every refused form by the two reads alone, and each deny refuses its own spellings", () => {
  assert.equal(GH_WRITES.length, 12, "FENCED's gh lines are read");
  assert.deepEqual(runs(ghPlanted({ denies: [] }), GH_REFUSED_CALLS, {}, []), GH_REFUSED_CALLS.map(shown));
  for (const [rule, spellings] of Object.entries(GH_REFUSED))
    assert.deepEqual(
      runs(ghPlanted({ denies: less(GH_DENIES, rule) }), GH_REFUSED_CALLS, {}, []),
      spellings.map((command) => `Bash(${command})`),
      rule,
    );
});

test('REFUSED: a deny of a GH_ assignment opening the part, in place of any assignment before gh, misses every other', () => {
  const narrow = ghPlanted({ denies: [...less(GH_DENIES, 'Bash(*=* gh *)'), 'Bash(GH_*)'] });
  assert.deepEqual(runs(narrow, GH_REFUSED_CALLS, {}, []), [
    'Bash(PAGER=sh gh pr view 196)',
    'Bash(BROWSER=sh gh pr view 196)',
    'Bash(XDG_CONFIG_HOME=planted gh pr view 196)',
    'Bash(HOME=planted gh pr view 196)',
    'Bash(FOO=1 GH_PAGER=sh gh pr view 196)',
    'Bash(nohup PAGER=sh gh pr view 196)',
    'Bash(timeout 5 BROWSER=sh gh pr checks 196)',
  ]);
});

test('REFUSED: gh whole in place of the two reads runs every gh write, and gh pr whole every write of a pull request', () => {
  assert.deepEqual(runs(ghPlanted({ allows: ['Bash(gh:*)'] }), GH_WRITES, {}, []), GH_WRITES.map(shown));
  assert.deepEqual(runs(ghPlanted({ allows: ['Bash(gh pr:*)'] }), GH_WRITES, {}, []), [
    'Bash(gh pr create --title x --body y)',
    'Bash(gh pr merge 7 --merge)',
    'Bash(gh pr edit 7 --body x)',
    'Bash(gh pr ready 7)',
    'Bash(gh pr close 7)',
    'Bash(gh pr comment 7 -b x)',
    'Bash(gh pr review 7 --approve)',
  ]);
});

test("the checkout's settings allow no gh, so a read-only step that allows none itself runs no gh", () => {
  const fenced = planted({ denies: [...READ_SET_DENIES, ...GH_DENIES] });
  assert.ok(!(fenced.allowedTools ?? []).some((rule) => rule.startsWith('Bash(gh')), 'the step allows no gh of its own');
  assert.deepEqual(
    SETTINGS_ALLOWS.filter((rule) => rule.startsWith('Bash(gh')),
    [],
    'the settings allow no gh: the reviewer allows its own reads',
  );
  assert.deepEqual(runs(fenced, GH_READS, SETTINGS, []), [], 'no read reaches it');
  assert.deepEqual(runs(planted(), GH_READS, SETTINGS, []), [], 'nor reaches a step without the denies');
});

test("REFUSED: a settings allow of gh's reads reaches every step, so a read-only step that allows none itself runs gh's refused forms without the denies", () => {
  const settings: Settings = { permissions: { ...SETTINGS.permissions, allow: [...SETTINGS_ALLOWS, ...GH_ALLOWS] } };
  const fenced = planted({ denies: [...READ_SET_DENIES, ...GH_DENIES] });
  assert.deepEqual(runs(fenced, GH_READS, settings, []), GH_READS.map(shown), "the settings' reads reach it");
  assert.deepEqual(runs(fenced, GH_REFUSED_CALLS, settings, []), [], 'and its denies fence them');
  assert.deepEqual(runs(planted(), GH_REFUSED_CALLS, settings, []), GH_REFUSED_CALLS.map(shown), 'without them, the settings open each');
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

/** sdlc's role skills, which the nemia factory's steps load. */
const SDLC_SKILLS = path.join(REPO, 'packages', 'templates', 'sdlc', 'skills');

/** The rules of sdlc's skill `skill`, read as a run reads them (`readSkillRules`). */
const sdlcRulesOf = (skill: string) => {
  assert.ok(fs.existsSync(path.join(SDLC_SKILLS, skill, RULES_FILE)), `${skill} declares its rules`);
  return readSkillRules(path.join(SDLC_SKILLS, skill));
};

test("sdlc's read-within-reach rule is broken by a denied Glob, Grep or Read, as nemia stats counts it, and kept by a denied npm", () => {
  const outside = 'Read(/srv/.agent-workflows/runs/r/artifacts/a.md)';
  for (const skill of ['write-a-spec', 'review-a-change']) {
    const declared = new Map([[skill, sdlcRulesOf(skill)]]);
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

/** The compiler options that make `tsc --noEmit` write a build-info file all the same. */
const BUILD_INFO_OPTIONS = ['incremental', 'composite'] as const;

/**
 * Each tsconfig of the checkout `repo`, by its path from it, that sets an option of `BUILD_INFO_OPTIONS`, itself or through what it
 * extends, as TypeScript reads it.
 */
function buildInfoConfigs(repo = REPO): string[] {
  return checkoutFiles(repo)
    .filter((file) => /(?:^|\/)tsconfig[^/]*\.json$/.test(file))
    .filter((file) => {
      const at = path.join(repo, file);
      const read = ts.readConfigFile(at, (file) => ts.sys.readFile(file));
      assert.equal(read.error, undefined, `${file} reads as a tsconfig`);
      const { options } = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(at), undefined, at);
      return BUILD_INFO_OPTIONS.some((option) => options[option] === true);
    });
}

test('no tsconfig of the checkout sets incremental or composite, so a measure with --noEmit writes no build-info file', () => {
  assert.ok(
    checkoutFiles(REPO).some((file) => file.endsWith('tsconfig.json')),
    'the checkout has tsconfigs to read',
  );
  assert.deepEqual(buildInfoConfigs(), []);
});

test('REFUSED: a tsconfig that sets incremental, or extends one that sets composite, is named', () => {
  const repo = scratch('wf-fences-tsconfig-');
  const write = (file: string, config: unknown) => {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    fs.writeFileSync(path.join(repo, file), JSON.stringify(config));
  };
  write('a/tsconfig.json', { compilerOptions: { incremental: true }, files: [] });
  write('b/base.json', { compilerOptions: { composite: true } });
  write('b/tsconfig.json', { extends: './base.json', files: [] });
  write('c/tsconfig.json', { compilerOptions: { strict: true }, files: [] });
  assert.deepEqual(buildInfoConfigs(repo).sort(), ['a/tsconfig.json', 'b/tsconfig.json']);
});

/** Nemia as her keeper files her: her shipped definition, long-lived. */
const nemia = (file?: string): Step => ({ ...readNemia(file), name: 'nemia' });

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
    .flatMap(({ name, class: c }): [string, Verdict][] => {
      const forms = [`nemia ${name}`, `nemia ${name} r-1`];
      if (c === 'none' || c === 'ask') return forms.map((form) => [form, c === 'none' ? 'deny' : 'ask']);
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
  const reclassed = TABLE.map((entry) => (entry.name === 'cancel' ? { ...entry, class: 'act' as const } : entry));
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
    'nemia retry r-1 --round --message m',
    'nemia approve r-1 review --message m',
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
  for (const local of [[], ['Bash(nemia:*)', 'Bash(nemia policy:*)', 'Bash(nemia policy confirm:*)', 'Bash(nemia policy rm:*)']]) {
    const rules = herRules(root, local);
    for (const command of ['nemia policy confirm nemia tries', 'nemia policy rm nemia default'])
      assert.equal(verdictOf(rules, command), 'ask', `${command}, local allows ${local.join(', ')}`);
    assert.equal(verdictOf(rules, 'nemia policy nemia'), 'allow', 'the read is hers');
    assert.equal(verdictOf(rules, 'nemia policy propose nemia --file -'), 'allow', 'so is her proposal');
  }
  assert.equal(fs.existsSync(path.join(root, 'auto')), false, 'denied before the folder is there');
  for (const file of ['nemia.json', 'nemia.proposed.json'])
    assert.equal(editVerdictOf(herRules(root), path.join(root, 'auto', file)), 'deny', file);
});
