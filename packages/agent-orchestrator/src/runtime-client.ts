/**
 * The runtime client: the one file of the package that imports `agent-runtime`, a type included (`test/boundary.test.ts`), as a Go agent
 * SDK reaches its sandbox runtime through one file of its own. It creates the runtime — the harnesses and `engine()` — and names the runtime's types
 * the controllers use (`Engine`, `TaskView`, `Usage`, `Denial`, `nameFor` and `denialText`), which they import from here and never from the runtime.
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
import { claudeDetached, codex, createEngine, type Engine } from 'agent-runtime';
import { CHECK } from './check.ts';
import { HOME } from './store.ts';

export type { Denial, Engine, TaskView, Usage } from 'agent-runtime';
/** The name the engine gives a task's session, which is the name `claude agents` lists it under (`harnessWaitLine`). */
export { nameFor } from 'agent-runtime';
/** A denied call as the runtime words it, and as a permission rule is written: `Skill(look)`, `Bash(pytest)` (`deniedOf`). */
export { denialText } from 'agent-runtime';

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
  const e = createEngine({ root: path.join(HOME, 'engine'), harnesses: HARNESSES });
  return { ...e, file: (spec) => e.file({ ...spec, queued: true }) };
};
