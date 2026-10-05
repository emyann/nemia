/**
 * An agent of yours tried on a short brief, from its page: a hidden one-step folder team of the store's own,
 * `tries/<agent>/try.md`, started as any folder run is — with no repository, in folders the run makes under `runs/<id>/`, and a budget of
 * a dollar. Its step names the agent and fences it to its folder, never wider than the agent's own (`directoryFence`): `dontAsk`, or the
 * agent's mode where narrower, allowed `Edit(**)` over an agent whose mode writes unasked and otherwise only the agent's own rules inside
 * its folder — so every read outside its folder is denied and nothing it writes lands outside the run.
 *
 * The folder is not among the workflows the board lists (`tries/` is no place of them), and a run of it is a try by where it was started
 * from (`tryOf`), read off the record alone: nothing new is written on it.
 */
import path from 'node:path';
import { tryDir, writeTryFolder } from 'agent-orchestrator';
import { AGENTS_FOLDER, directoryFence, isRemoteHarness, SKILLS_FOLDER } from 'agent-orchestrator/workflow';
import { Invalid } from 'agent-orchestrator/effect';
import { quoted } from './skills.ts';

/** The cap on a try, in dollars: what its step's `budget:` says. */
export const TRY_BUDGET = 1;

/** What the step's frontmatter records the agent's version under: a comment, which the parser skips. */
const VERSION_LINE = '# version ';

/** An agent's keys the try's fence is read from, as its file writes them. */
type FencedKeys = { permissionMode?: string; allowedTools?: string };

/** The fence a try writes: its permission mode and allow rules. */
type TryFence = { permissionMode: string; allowedTools: string[] };

/**
 * The fence a try of agent `name`, whose keys are `keys`, writes (`directoryFence`), or why it has none: the agent's mode asks first and
 * every one of its allow rules reaches outside the try's folder, so a step that narrows it to the folder cannot be written.
 */
function tryFence(name: string, keys: FencedKeys): TryFence | string {
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
    'workspace: folder',
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
  return `An agent named \`${name}\` cannot be tried from the board: its try's folder would be ${tryDir(name, home)}, where every try looks for its ${name} first, and a folder named \`${name}\` is not a workflow. Rename the agent to try it.`;
}

/** Where your agents are, in the store the api reads: what a copy into yours copies into. */
export const yourAgentsDir = (home: string): string => path.join(home, 'workflows', AGENTS_FOLDER);

/** The harnesses a try's fence is written for: Claude Code's `permissionMode:`, which no other takes. No `harness:` line is `claude`. */
const FENCED_HARNESSES: readonly string[] = ['claude', 'claude-detached'];

/**
 * Why an agent cannot be tried from the board, and the command that makes it one that can when a copy does (the repository's), or null when
 * nothing here refuses it. The one writer of both, so the try's route and the agent's page say the same: the route refuses on it before it
 * writes anything, and the page draws it in place of the button. Read off the agent's file alone — its place, its name and its keys as
 * written — so it holds for a file that does not read too.
 */
export type Untried = { why: string; copy: string | null };

export function untriedOf(
  agent: {
    from: 'repo' | 'yours';
    name: string;
    file: string;
    keys: { harness?: string; remote?: string } & FencedKeys;
    schemaFile: string | null;
  },
  home: string,
): Untried | null {
  if (agent.from === 'repo') {
    const into = yourAgentsDir(home);
    const files = [agent.file, ...(agent.schemaFile ? [path.join(path.dirname(agent.file), agent.schemaFile)] : [])];
    return {
      why: "Only an agent of yours can be tried — a try runs with no repository, in a folder of its own, and finds no agent of the repository's. Copy it to yours to try it.",
      copy: `mkdir -p ${quoted(into)} && cp ${files.map(quoted).join(' ')} ${quoted(`${into}/`)}`,
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
      why: `${agent.name} says \`remote: true\`, which bridges a background session to claude.ai, and a try runs as a job (\`claude -p\`), which is never bridged. Delete \`remote: true\` to try it.`,
      copy: null,
    };
  }
  const fence = tryFence(agent.name, agent.keys);
  return typeof fence === 'string' ? { why: fence, copy: null } : null;
}

/**
 * The try folder of an agent whose keys are `keys`, written by the package (`writeTryFolder`) with its step file (`tryText`); answers the
 * folder. Refuses (`Invalid`) an agent the try cannot fence (`tryFence`), and the package refuses a folder or a step file that is a link.
 */
export function tryFolder(name: string, version: string, keys: FencedKeys, home: string): string {
  const fence = tryFence(name, keys);
  if (typeof fence === 'string') throw new Invalid({ message: fence });
  return writeTryFolder(name, tryText(name, version, fence), home);
}
