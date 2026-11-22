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
export const plain = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, '');

/** A package's file, from the nearest node_modules above the web app — where a worktree's link leads. */
export function fromNodeModules(file: string) {
  for (let dir = WEB; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', file);
    if (fs.existsSync(candidate)) return candidate;
    if (dir === path.dirname(dir)) throw new Error(`no node_modules/${file} above ${WEB}. Run \`npm install\` in the repository.`);
  }
}

/** The seeded store, a temporary WF_ROOT, while the e2e runs. */
export let store: string | undefined;
export function setStore(to: string | undefined) {
  store = to;
}
/**
 * The person's token the seeded store keeps (`seatToken`, served.ts): every api route asks for one, so each browser context a page opens
 * on the worker's seat is given it as the board's cookie (`seated`), and a request a page makes from Node presents it as its bearer.
 */
export let seatToken: string | undefined;
export function setSeatToken(to: string | undefined) {
  seatToken = to;
}
/** The environment the api runs in — its store, its `claude`, where sessions register — for a `wf` a page runs on the same store. */
export let apiEnv: NodeJS.ProcessEnv = {};
export function setApiEnv(to: NodeJS.ProcessEnv) {
  apiEnv = to;
}
/**
 * Whether the page being visited is pictured: `photograph` takes no picture while it is false, but a failure's. Set by `visitAll`, page by
 * page, from the run's plan (`planOf`): false unless the e2e was run with `--photos`.
 */
export let photographing = false;
export function setPhotographing(to: boolean) {
  photographing = to;
}
/**
 * Whether what is pictured is measured too: `photograph` writes each picture's text pairs beside it while it is true (`measure`,
 * contrast.ts). Set by `visitAll` from the run's plan: false unless the e2e was run with `--photos --contrast`.
 */
export let measuring = false;
export function setMeasuring(to: boolean) {
  measuring = to;
}
/** Every line said to draft's session (SAYING), off its say file, in order: what the `say` page holds its words to. */
export const heard: unknown[] = [];

/** A pass's read of where the store's branches stand, as the tick's pass reads it and writes it down (`passStanding`). */
const PASS =
  "import { engine, passStanding, RunDoor, runWith, builtin, storeConfigLayer } from 'agent-orchestrator'; import { Effect } from 'effect'; await runWith(engine(process.env), builtin(Effect.provide(Effect.flatMap(Effect.flatMap(RunDoor, (door) => door.runs.list()), (runs) => passStanding(runs)), storeConfigLayer(process.env))));";

/**
 * What `script` prints, run in a process of the api's package on the api's environment, given `input` on its stdin: how the e2e, which
 * imports no package, reads and writes a run's record, a record of the store's keyspace (`agent-orchestrator/testing`).
 */
const inApi = (script: string, input = '') =>
  execFileSync(process.execPath, ['--input-type=module', '--eval', script], { cwd: API, env: apiEnv, input, encoding: 'utf8' });

/**
 * The text of the record of the run `id` in the seeded store, as the tick wrote it: what a page keeps to put back. Throws where there is
 * none.
 * @param id The run's id.
 */
export function storedRecordText(id: string) {
  const text = inApi(
    `import { recordText, runKey } from 'agent-orchestrator/testing'; process.stdout.write(recordText(process.env.WF_ROOT, runKey(${JSON.stringify(id)})) ?? '');`,
  );
  if (!text) throw new Error(`the seeded store holds no record of run ${id}: seed it first`);
  return text;
}

/**
 * The record of the run `id` in the seeded store, as the tick wrote it: what a page reads to change it. Throws where there is none.
 * @param id The run's id.
 */
export function storedRecord(id: string) {
  return JSON.parse(storedRecordText(id)) as Record<string, unknown>;
}

/**
 * The record of the run `id` in the seeded store written as `text`, over the one there or none: what a page plants or changes.
 * @param id The run's id.
 * @param text The record's text.
 */
export function storeRecord(id: string, text: string) {
  inApi(
    `import { plantRecord, runKey } from 'agent-orchestrator/testing'; import fs from 'node:fs'; plantRecord(process.env.WF_ROOT, runKey(${JSON.stringify(id)}), fs.readFileSync(0, 'utf8'));`,
    text,
  );
}

/**
 * The record of the run `id` taken out of the seeded store, there or not: a run removed as `nemia rm` leaves its key.
 * @param id The run's id.
 */
export function dropStoredRecord(id: string) {
  inApi(`import { dropRecord, runKey } from 'agent-orchestrator/testing'; dropRecord(process.env.WF_ROOT, runKey(${JSON.stringify(id)}));`);
}

/**
 * Where the store's result branches stand, read now and written to its `standing.json` as the tick's pass writes it, in a process of the
 * api's package on the api's environment: the api ticks nothing in the e2e (`--no-tick`), and the board's list reads where a run's result
 * stands off that file alone. Throws, with what the process printed, where the pass failed.
 */
export function standingPass() {
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
export function unreadName(id: string) {
  const { repo } = storedRecord(id) as { repo: string };
  const { places } = JSON.parse(fs.readFileSync(path.join(store!, 'standing.json'), 'utf8')) as {
    places: { repo: string; unread?: string }[];
  };
  const unread = places.find((p) => p.repo === repo)?.unread;
  if (unread === undefined) throw new Error(`the e2e's pass read where ${repo} stands, or did not ask it: ${id} is not unread`);
  return `${id} (where it stands is unread: ${unread})`;
}

/** The ids of the runs whose records the seeded store holds: what a page reads before it starts one, to take back what it started. */
export function storedRuns() {
  return JSON.parse(
    inApi(
      "import { keysUnder, runKey } from 'agent-orchestrator/testing'; process.stdout.write(JSON.stringify(keysUnder(process.env.WF_ROOT, runKey('')).map((key) => key.slice(runKey('').length))));",
    ),
  ) as string[];
}

/** The record of every run in the seeded store, read in one go: what a page reads to place a run of its own among them. */
export function storedRecords() {
  return (
    JSON.parse(
      inApi(
        "import { keysUnder, recordText, runKey } from 'agent-orchestrator/testing'; const root = process.env.WF_ROOT; process.stdout.write(JSON.stringify(keysUnder(root, runKey('')).map((key) => recordText(root, key) ?? '')));",
      ),
    ) as string[]
  ).map((text) => JSON.parse(text) as Record<string, unknown>);
}

/**
 * What the seeded store holds of its runs, sorted: `record <id>` for each run whose record it holds, and the name of each file under
 * `runs/`: what a page compares before and after a refusal that writes nothing.
 */
export function runsHeld() {
  const runsDir = path.join(store!, 'runs');
  return [...storedRuns().map((id) => `record ${id}`), ...(fs.existsSync(runsDir) ? fs.readdirSync(runsDir) : [])].sort();
}

/**
 * The asks of the run `id` in the seeded store, each ask's text by its name: a waiting one by its name (`approve-plan-1`), a spent one as
 * `done/<name>`. Empty where the run has none.
 * @param id The run's id.
 */
export function storedAsks(id: string) {
  return JSON.parse(
    inApi(
      `import { askNames, askText } from 'agent-orchestrator/testing'; const id = ${JSON.stringify(id)}; process.stdout.write(JSON.stringify(Object.fromEntries(askNames(process.env.WF_ROOT, id).map((name) => [name, askText(process.env.WF_ROOT, id, name) ?? '']))));`,
    ),
  ) as Record<string, string>;
}

/**
 * The ask `name` of the run `id` written in the seeded store as `text`, over the one there or none: what a page plants as a person's ask.
 * @param id The run's id.
 * @param name The ask's name (`approve-plan-1`), a spent one as `done/<name>`.
 * @param text What it holds.
 */
export function storeAsk(id: string, name: string, text: string) {
  inApi(
    `import { plantAsk } from 'agent-orchestrator/testing'; import fs from 'node:fs'; plantAsk(process.env.WF_ROOT, ${JSON.stringify(id)}, ${JSON.stringify(name)}, fs.readFileSync(0, 'utf8'));`,
    text,
  );
}

/**
 * Every ask of the run `id` taken out of the seeded store, waiting and spent, there or not: what a page that asked takes back.
 * @param id The run's id.
 */
export function dropStoredAsks(id: string) {
  inApi(
    `import { askNames, dropAsk } from 'agent-orchestrator/testing'; const id = ${JSON.stringify(id)}; for (const name of askNames(process.env.WF_ROOT, id)) dropAsk(process.env.WF_ROOT, id, name);`,
  );
}

/** Where the keyspace keeps every run's record and every run's asks (`runKey`, `askKeyOf`). */
const RUN_PREFIXES = ['/registry/runs/', '/registry/asks/'];

/**
 * Every run's record and every ask of the seeded store, each text by its key: what a page that lets the api write to many runs keeps, to
 * put back (`restoreRunKeys`).
 */
export function storedRunKeys() {
  return JSON.parse(
    inApi(
      `import { keysUnder, recordText } from 'agent-orchestrator/testing'; const root = process.env.WF_ROOT; process.stdout.write(JSON.stringify(Object.fromEntries(${JSON.stringify(RUN_PREFIXES)}.flatMap((prefix) => keysUnder(root, prefix)).map((key) => [key, recordText(root, key) ?? '']))));`,
    ),
  ) as Record<string, string>;
}

/**
 * The seeded store's runs' records and asks put back as `before` held them: each key written since taken out, and each one changed or
 * taken out written again.
 * @param before What `storedRunKeys` read before the page wrote.
 */
export function restoreRunKeys(before: Record<string, string>) {
  inApi(
    `import { dropRecord, keysUnder, plantRecord, recordText } from 'agent-orchestrator/testing'; import fs from 'node:fs'; const root = process.env.WF_ROOT; const before = JSON.parse(fs.readFileSync(0, 'utf8')); for (const key of ${JSON.stringify(RUN_PREFIXES)}.flatMap((prefix) => keysUnder(root, prefix))) if (!(key in before)) dropRecord(root, key); for (const [key, text] of Object.entries(before)) if (recordText(root, key) !== text) plantRecord(root, key, text);`,
    JSON.stringify(before),
  );
}

/**
 * The run `id` taken out of the seeded store, its record and every ask of it, there or not: what a page that wrote a run takes back.
 * @param id The run's id.
 */
export function dropStoredRun(id: string) {
  inApi(
    `import { askNames, dropAsk, dropRecord, runKey } from 'agent-orchestrator/testing'; const id = ${JSON.stringify(id)}; for (const name of askNames(process.env.WF_ROOT, id)) dropAsk(process.env.WF_ROOT, id, name); dropRecord(process.env.WF_ROOT, runKey(id));`,
  );
}

/**
 * The runs a page started since it read `before` (`storedRuns`) taken back by hand: each one's record, its asks, the claim of the card it
 * was started from where that claim names it, and each of its files under `runs/` (its folder and its marks): what `nemia rm` removes of
 * a run.
 * @param before The ids of the runs the store held before the page started any.
 */
export function takeBackRuns(before: readonly string[]) {
  const made = storedRuns().filter((id) => !before.includes(id));
  if (!made.length) return;
  inApi(
    `import { askNames, claimKey, dropAsk, dropRecord, keysUnder, recordText, runKey } from 'agent-orchestrator/testing'; import fs from 'node:fs'; const root = process.env.WF_ROOT; const ids = new Set(JSON.parse(fs.readFileSync(0, 'utf8'))); for (const key of keysUnder(root, claimKey(''))) { try { if (ids.has(JSON.parse(recordText(root, key) ?? '{}').run ?? '')) dropRecord(root, key); } catch {} } for (const id of ids) { for (const name of askNames(root, id)) dropAsk(root, id, name); dropRecord(root, runKey(id)); }`,
    JSON.stringify(made),
  );
  const runsDir = path.join(store!, 'runs');
  for (const file of fs.existsSync(runsDir) ? fs.readdirSync(runsDir) : [])
    if (made.some((id) => file === id || file.startsWith(`${id}.`))) fs.rmSync(path.join(runsDir, file), { recursive: true, force: true });
}
