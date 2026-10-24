/**
 * Where the e2e's things are, and what a worker (worker.ts) sets up for the pages it visits to read: the store its api serves, the
 * environment it runs in, whether the page being visited is pictured, and what draft's stand-in inbox has heard. Each worker is a process
 * of its own, so each has its own. Set only by the worker, through `setStore`, `setApiEnv` and `setPhotographing`; a page reads them when
 * it is visited, never as it is imported, when the worker has set up nothing yet.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const WEB = path.resolve(import.meta.dirname, '..', '..');
export const REPO = path.resolve(WEB, '..', '..');
export const API = path.join(REPO, 'apps', 'api');
export const OUT = path.resolve(process.env.WF_ARTIFACTS || path.join(REPO, '.e2e'));

/** `text` without the colour codes a terminal reads. */
// oxlint-disable-next-line no-control-regex -- a terminal colour code starts with ESC, which is what this strips
export const plain = (text: string): string => text.replace(/\x1b\[[0-9;]*m/g, '');

/** A package's file, from the nearest node_modules above the web app — where a worktree's link leads. */
export function fromNodeModules(file: string): string {
  for (let dir = WEB; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', file);
    if (fs.existsSync(candidate)) return candidate;
    if (dir === path.dirname(dir)) throw new Error(`no node_modules/${file} above ${WEB}. Run \`npm install\` in the repository.`);
  }
}

/** The seeded store, a temporary WF_ROOT, while the e2e runs. */
export let store: string | undefined;
export function setStore(to: string | undefined): void {
  store = to;
}
/** The environment the api runs in — its store, its `claude`, where sessions register — for a `wf` a page runs on the same store. */
export let apiEnv: NodeJS.ProcessEnv = {};
export function setApiEnv(to: NodeJS.ProcessEnv): void {
  apiEnv = to;
}
/**
 * Whether the page being visited is pictured: `photograph` takes no picture while it is false, but a failure's. Set by `visitAll`, page by
 * page, from the run's plan (`planOf`): false unless the e2e was run with `--photos`.
 */
export let photographing = false;
export function setPhotographing(to: boolean): void {
  photographing = to;
}
/**
 * Whether what is pictured is measured too: `photograph` writes each picture's text pairs beside it while it is true (`measure`,
 * contrast.ts). Set by `visitAll` from the run's plan: false unless the e2e was run with `--photos --contrast`.
 */
export let measuring = false;
export function setMeasuring(to: boolean): void {
  measuring = to;
}
/** Every line said to draft's session (SAYING), off its say file, in order: what the `say` page holds its words to. */
export const heard: unknown[] = [];

/** A pass's read of where the store's branches stand, as the tick's pass reads it and writes it down (`passStanding`). */
const PASS =
  "import { engine, passStanding, runStore, runWith, builtin } from 'agent-orchestrator'; await runWith(engine(), builtin(passStanding(runStore.runs.list())));";

/**
 * Where the store's result branches stand, read now and written to its `standing.json` as the tick's pass writes it, in a process of the
 * api's package on the api's environment: the api ticks nothing in the e2e (`--no-tick`), and the board's list reads where a run's result
 * stands off that file alone. Throws, with what the process printed, where the pass failed.
 */
export function standingPass(): void {
  try {
    execFileSync(process.execPath, ['--input-type=module', '--eval', PASS], { cwd: API, env: apiEnv, stdio: 'pipe' });
  } catch (err) {
    const { stdout, stderr } = err as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(`a pass over the e2e's store did not read where its branches stand:\n${String(stdout ?? '')}${String(stderr ?? '')}`, {
      cause: err,
    });
  }
}

/**
 * The run `id` as a wait or a hold names it where its place did not read where it stands: the run, with the words the e2e's pass wrote to
 * the store's `standing.json` for its repository (`standingPass`) — a repository the seed names and no machine has, never said to be on
 * the base or not. Throws where the pass read that repository, or did not ask it.
 */
export function unreadName(id: string): string {
  const { repo } = JSON.parse(fs.readFileSync(path.join(store!, 'runs', `${id}.json`), 'utf8')) as { repo: string };
  const { places } = JSON.parse(fs.readFileSync(path.join(store!, 'standing.json'), 'utf8')) as {
    places: { repo: string; unread?: string }[];
  };
  const unread = places.find((p) => p.repo === repo)?.unread;
  if (unread === undefined) throw new Error(`the e2e's pass read where ${repo} stands, or did not ask it: ${id} is not unread`);
  return `${id} (where it stands is unread: ${unread})`;
}
