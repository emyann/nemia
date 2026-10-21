/**
 * An agent of yours tried on a short brief: a hidden one-step folder team of the store's own, `tries/<agent>/try.md`, started as any
 * folder run is — with no repository, in folders the run makes under `runs/<id>/`, and a budget of a dollar. Its step names the agent and
 * fences it to its folder, never wider than the agent's own (`directoryFence`): `dontAsk`, or the agent's mode where narrower, allowed
 * `Edit(**)` over an agent whose mode writes unasked and otherwise only the agent's own rules inside its folder — so every read outside
 * its folder is denied and nothing it writes lands outside the run. Pure: where the folder is, what its step says, and why an agent cannot
 * be tried; the store writes the folder (`tryFolder`).
 */
import path from 'node:path';
import { isRemoteHarness } from '../harness/harness.ts';
import { AGENTS_FOLDER, SKILLS_FOLDER } from '../step/step.ts';
import { directoryFence } from '../workflow/index.ts';

/** The cap on a try, in dollars: what its step's `budget:` says. */
export const TRY_BUDGET = 1;

/** Where every try's folder is: `tries/` in the store `home`, beside `workflows/`. */
export const triesDir = (home: string): string => path.join(home, 'tries');

/** The folder the agent `name`'s try is started from. */
export const tryDir = (name: string, home: string): string => path.join(triesDir(home), name);

/** Where your agents are, in the store `home`: what a copy into yours copies into, and the one place an agent is tried from. */
export const yourAgentsDir = (home: string): string => path.join(home, 'workflows', AGENTS_FOLDER);

/** What the step's frontmatter records the agent's version under: a comment, which the parser skips. */
const VERSION_LINE = '# version ';

/** An agent's keys the try's fence is read from, as its file writes them. */
export type FencedKeys = { permissionMode?: string; allowedTools?: string };

/** The fence a try writes: its permission mode and allow rules. */
export type TryFence = { permissionMode: string; allowedTools: string[] };

/** `text` quoted for a POSIX shell, as a command a person pastes says a path. */
export const shellQuoted = (text: string): string => `'${text.replace(/'/g, `'\\''`)}'`;

/**
 * The fence a try of agent `name`, whose keys are `keys`, writes (`directoryFence`), or why it has none: the agent's mode asks first and
 * every one of its allow rules reaches outside the try's folder, so a step that narrows it to the folder cannot be written.
 */
export function tryFence(name: string, keys: FencedKeys): TryFence | string {
  return (
    directoryFence(keys.permissionMode, keys.allowedTools) ??
    `${name} allows \`${keys.allowedTools}\` in a mode that asks first (\`${keys.permissionMode}\`), and a try runs in a folder of its own, fenced no wider than its agent: none of those rules is inside the folder, and a step cannot allow nothing, so the try would run with them all. To try it, allow it an edit inside its folder — \`Edit(**)\` — or give it a mode that edits unasked, \`acceptEdits\`.`
  );
}

/** The try's step file: the agent, the cap, the agent's version it was written at, and the try's fence `fence` (`tryFence`). */
export const tryText = (name: string, version: string, fence: TryFence): string =>
  [
    '---',
    `${VERSION_LINE}${version}`,
    'place: folder',
    `agent: ${name}`,
    `budget: ${TRY_BUDGET}`,
    `permissionMode: ${fence.permissionMode}`,
    ...(fence.allowedTools.length ? [`allowedTools: ${fence.allowedTools.join(', ')}`] : []),
    '---',
    'A rehearsal of the brief: work in this folder, and write what you make here.',
    '',
  ].join('\n');

/**
 * Why an agent's try cannot be started from `tries/<name>`, or null. A try's folder is one level under `tries/`, so `tries/` is its root,
 * where a start looks for `agents/` and `skills/` before the store's (`lookupRoots`): a folder named either is no workflow
 * (`agentsFolderRefusal`), and one agent's try would stand where every other try looks for agents or skills.
 */
export function tryNameRefusal(name: string, home: string): string | null {
  if (name !== AGENTS_FOLDER && name !== SKILLS_FOLDER) return null;
  return `An agent named \`${name}\` cannot be tried: its try's folder would be ${tryDir(name, home)}, where every try looks for its ${name} first, and a folder named \`${name}\` is not a workflow. Rename the agent to try it.`;
}

/** The harnesses a try's fence is written for: Claude Code's `permissionMode:`, which no other takes. No `harness:` line is `claude`. */
const FENCED_HARNESSES: readonly string[] = ['claude', 'claude-detached'];

/**
 * Why an agent cannot be tried, and the command that makes it one that can when a copy does (the repository's), or null when nothing here
 * refuses it: the one writer of both, so the try's refusal and the agent's page say the same. Read off the agent's file alone — its place,
 * its name and its keys as written — so it holds for a file that does not read too.
 */
export type Untried = { why: string; copy: string | null };

/**
 * The agent `untriedOf` judges: its place, its name, its file, its keys as written, its `mcp:` line as written, and the result schema's
 * file beside it.
 */
export type TriedAgent = {
  from: 'repo' | 'yours';
  name: string;
  file: string;
  keys: { harness?: string; remote?: string } & FencedKeys;
  mcp?: string | null;
  schemaFile: string | null;
};

/** Why the agent `name`, whose `mcp:` line is written `line`, cannot be tried: a try has no checkout to load a server from. */
const serversUntried = (name: string, line: string): string =>
  `${name} names MCP servers (\`mcp: ${line}\`), which a session loads from its checkout's \`.mcp.json\`, and a try runs with no repository, in a folder of its own, which has none. Delete the line to try it, and name the server on the step that needs it: a step's own \`mcp:\` adds to its agent's.`;

/**
 * Why the agent cannot be tried (`Untried`) in the store `home`, or null: an agent of the repository's, a reserved name, a harness or a
 * mode a try cannot fence, a bridged session, or MCP servers it names (`mcp`), which a try has no checkout to load from.
 */
export function untriedOf(agent: TriedAgent, home: string): Untried | null {
  if (agent.from === 'repo') {
    const into = yourAgentsDir(home);
    const files = [agent.file, ...(agent.schemaFile ? [path.join(path.dirname(agent.file), agent.schemaFile)] : [])];
    return {
      why: "Only an agent of yours can be tried — a try runs with no repository, in a folder of its own, and finds no agent of the repository's. Copy it to yours to try it.",
      copy: `mkdir -p ${shellQuoted(into)} && cp ${files.map(shellQuoted).join(' ')} ${shellQuoted(`${into}/`)}`,
    };
  }
  const reserved = tryNameRefusal(agent.name, home);
  if (reserved) return { why: reserved, copy: null };
  const harness = agent.keys.harness;
  if (isRemoteHarness(harness)) {
    return {
      why: `${agent.name} is a remote agent (\`harness: ${harness}\`), which another party runs: a try is fenced by Claude Code's permission mode and capped at $${TRY_BUDGET}, and neither reaches it. Only an agent on Claude Code is tried here.`,
      copy: null,
    };
  }
  if (harness !== undefined && !FENCED_HARNESSES.includes(harness)) {
    return {
      why: `${agent.name} runs on \`${harness}\`, and a try is fenced by Claude Code's permission mode — \`dontAsk\` with \`Edit(**)\`, in a folder of its own — which ${harness} does not take. Only an agent on Claude Code is tried here: no \`harness:\` line, \`claude\` or \`claude-detached\`.`,
      copy: null,
    };
  }
  if (agent.keys.remote === 'true') {
    return {
      why: `${agent.name} says \`remote: true\`, which bridges a background session to claude.ai, and a try runs as a job, which is never bridged. Delete \`remote: true\` to try it.`,
      copy: null,
    };
  }
  if (agent.mcp) return { why: serversUntried(agent.name, agent.mcp), copy: null };
  const fence = tryFence(agent.name, agent.keys);
  return typeof fence === 'string' ? { why: fence, copy: null } : null;
}

/**
 * The command a person runs to copy the skill folder `dir` into the skills folder `into`, as `into/<name>/`. `cp -r dir into/` makes `into`
 * itself the copy when `into` is not there yet — a repository with a `.claude/` and no `skills/` would get `skills/SKILL.md` — so it makes
 * `into` first; and each path is quoted, for a home with a space in it.
 */
export const skillCopyCommand = (dir: string, into: string): string =>
  `mkdir -p ${shellQuoted(into)} && cp -r ${shellQuoted(dir)} ${shellQuoted(`${into}/`)}`;

/**
 * Why the agent `name` cannot be tried while it gives skills only the repository has (`theirs`, each its folder), which a try that runs
 * with no repository does not find, with the command that copies each into your library (`library`); null for none.
 */
export function repoSkillsRefusal(name: string, theirs: ReadonlyArray<{ name: string; dir: string }>, library: string): string | null {
  if (!theirs.length) return null;
  const copies = theirs.map((skill) => `\`${skillCopyCommand(skill.dir, library)}\``).join(', ');
  return `${name} gives ${theirs.map((skill) => `\`${skill.name}\``).join(', ')}, which only the repository has, and a try runs with no repository. Copy ${theirs.length === 1 ? 'it' : 'them'} into your library to try it: ${copies}.`;
}
