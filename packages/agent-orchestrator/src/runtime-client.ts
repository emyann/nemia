/**
 * The runtime client: the one file of the package that imports `agent-runtime`, a type included (`test/boundary.test.ts`), as a Go agent
 * SDK reaches its sandbox runtime through one file of its own. It creates the runtime — the harnesses and `engine()` — and names the runtime's types
 * the controllers use (`Engine`, `TaskView`, `Usage`, `Denial`, `RefusedMove`, `nameFor`, `denialText` and `refusedText`), which they import from here and never from the runtime.
 *
 * It passes the runtime's surface through, and wraps one method of it: `file`, so that every task the orchestrator files is `queued` and
 * starts only once the tick admits it (`admission.ts`). What the orchestrator does with the runtime — file a task, view one, tick, admit,
 * stop one, read its logs, say something to it, read the feed — are already the methods of the runtime's `Engine`, which every controller
 * takes as it is and every test hands a fake of. A wrapper would be a second surface to keep in step with the first, and a place for
 * behaviour to grow; this file holds none but that one.
 *
 * It uses `agent-runtime` — the Promise API — not `agent-runtime/effect`. Nothing here imports Effect, which is the point: a consumer of
 * the engine should need to learn three functions, not a library.
 */
import path from 'node:path';
import { claudeDetached, codex, createEngine, remoteConfigRefusal, type Credentials, type Engine, type MissingCredential, type RemoteAgent } from 'agent-runtime';
import { envNameOf, readRemoteAgents, remoteAgentsFile } from './a2a-agents.ts';
import { CHECK } from './check.ts';
import { HOME } from './store.ts';
import { REMOTE_PREFIX, remoteNameOf } from './workflow.ts';

export type { ClaudeFlags, Denial, Engine, RefusedMove, TaskView, Usage } from 'agent-runtime';
/** The name the engine gives a task's session, which is the name `claude agents` lists it under (`harnessWaitLine`). */
export { nameFor } from 'agent-runtime';
/** A denied call as the runtime words it, and as a permission rule is written: `Skill(look)`, `Bash(pytest)` (`deniedOf`). */
export { denialText } from 'agent-runtime';
/** A move the runtime's lifecycle had no edge for, as a person reads it in `wf up`'s log (`refusalLines`). */
export { refusedText } from 'agent-runtime';

/**
 * The engine, with one harness of the run's own beside the three it ships.
 *
 * `check` runs a step's `check:` command (`src/check.ts`). Passing `harnesses` REPLACES the engine's
 * default map rather than adding to it, so the defaults are named again here — leaving them out would
 * quietly send every `claude` step to whichever harness came first.
 *
 * A `claude` step runs on the engine's `claude`: a job (`claude -p`), which ends on its own, asks nobody in any mode, and keeps a spend
 * cap; a step that says `background: true` is filed with `config.background` and runs as a background session (`claude --bg`), which
 * a person can talk to and bridge to claude.ai. It ran every step on `claude-bg` until stage 2 of the thin runtime
 * (`docs/eval-thin-runtime.md`).
 */
export const HARNESSES = {
  claude: 'claude',
  codex,
  'claude-detached': claudeDetached,
  check: CHECK,
} as const;

/**
 * The engine the controllers use. How many sessions run at once is the orchestrator's to say (`toAdmit`, under `ceilings().sessions`, which
 * reads `WF_MAX_CONCURRENT`): every filing goes out `queued`, so the runtime starts nothing the tick has not admitted. The runtime keeps no
 * ceiling of its own since thin runtime stage 4c part 2, and refuses a `maxConcurrent` handed to it.
 */
export const engine = (): Engine => {
  const remote = Object.fromEntries([...remoteAgents()].map(([name, agent]) => [`${REMOTE_PREFIX}${name}`, agent]));
  const e = createEngine({ root: path.join(HOME, 'engine'), harnesses: { ...HARNESSES, ...remote }, credentials, missingCredential });
  return { ...e, file: (spec) => e.file({ ...spec, queued: true }) };
};

/**
 * The remote A2A agents the store's `a2a-agents.json` declares, by name (`a2a-agents.ts`), each address judged by the runtime's own rule
 * (`remoteConfigRefusal`) and refused in the file's words, naming the file: what `engine()` gives the engine as `a2a:<name>` harnesses, what
 * `wf start` checks a step's name against, and what the api offers a step. Read afresh on each call.
 */
export function remoteAgents(): ReadonlyMap<string, RemoteAgent> {
  const file = remoteAgentsFile(HOME);
  const agents = readRemoteAgents(file);
  for (const [name, agent] of agents) {
    const refused = remoteConfigRefusal(`${REMOTE_PREFIX}${name}`, agent);
    if (refused) throw Object.assign(new Error(`${file}: \`${name}\`: ${refused}`), { exitCode: 2 });
  }
  return agents as ReadonlyMap<string, RemoteAgent>;
}

/**
 * The secret for a scheme a remote agent's card asks for: the environment's `WF_A2A_<NAME>_<SCHEME>` (`envNameOf`), read on every request, so a
 * variable set for a running `wf up` is not seen until it restarts, and none is ever on disk. An empty one is none. None for a local harness.
 */
export const credentials: Credentials = (scheme, _agentUrl, harness) => {
  const name = remoteNameOf(harness);
  return name === undefined ? undefined : process.env[envNameOf(name, scheme)] || undefined;
};

/** What a spawn refused for a secret not given says to do: set the variable, where the run's processes read it. */
export const missingCredential: MissingCredential = (scheme, _agentUrl, harness) => {
  const name = remoteNameOf(harness) ?? harness;
  return `set ${envNameOf(name, scheme)} to the secret for the scheme \`${scheme}\` ${name}'s card declares, in the environment of \`wf up\` (and of the api, which reads a run through the same engine), and restart it; then \`wf retry\` the step. The secret is read from there on every request, and never written to disk.`;
};
