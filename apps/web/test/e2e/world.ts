/**
 * Where the e2e's things are, and what a worker (worker.ts) sets up for the pages it visits to read: the store its api serves, the
 * environment it runs in, whether the page being visited is pictured, and what draft's stand-in inbox has heard. Each worker is a process
 * of its own, so each has its own. Set only by the worker, through `setStore`, `setApiEnv` and `setPhotographing`; a page reads them when
 * it is visited, never as it is imported, when the worker has set up nothing yet.
 */
import { execFileSync } from 'node:child_process';
import { MessageChannel, receiveMessageOnPort, Worker, type MessagePort } from 'node:worker_threads';
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
 * The script a worker's helper runs, in a process of the api's package on the api's environment: each line on its stdin a request, a
 * function's body and what it is given, run with `agent-orchestrator/testing` as `t`, the store's root as `root` and the request's `input`,
 * and each answer a line on its fd 3, what the body returned or what it threw. Its own stdout and stderr are the worker's.
 */
const HELPER = `import * as t from 'agent-orchestrator/testing';
import fs from 'node:fs';
import readline from 'node:readline';
const Body = (async () => {}).constructor;
for await (const line of readline.createInterface({ input: process.stdin })) {
  const { body, input } = JSON.parse(line);
  let answer;
  try {
    answer = { out: String((await new Body('t', 'root', 'input', body)(t, process.env.WF_ROOT, input)) ?? '') };
  } catch (err) {
    answer = { error: String(err instanceof Error ? (err.stack ?? err.message) : err) };
  }
  fs.writeSync(3, JSON.stringify(answer) + '\\n');
}`;

/**
 * The thread that holds the helper: it starts it, passes each request on, and hands each answer back on `port`, raising `signal` for the
 * page waiting on it. It loads no package.
 */
const RELAY = `const { workerData } = require('node:worker_threads');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const { port, signal, cwd, env, script } = workerData;
const helper = spawn(process.execPath, ['--input-type=module', '--eval', script], { cwd, env, stdio: ['pipe', 'inherit', 'inherit', 'pipe'] });
const answer = (said) => { port.postMessage(said); Atomics.store(signal, 0, 1); Atomics.notify(signal, 0); };
readline.createInterface({ input: helper.stdio[3] }).on('line', (line) => answer(JSON.parse(line)));
helper.on('exit', (code, by) => answer({ error: 'the e2e helper in the api package ended (' + (by ?? code) + ')' }));
port.on('message', (asked) => helper.stdin.write(JSON.stringify(asked) + '\\n'));`;

/**
 * The worker's helper, started on the first request for the store it serves, and started again for another store, or once it has ended:
 * a word from it that nobody asked for is its end.
 */
let helper: { root: string | undefined; port: MessagePort; signal: Int32Array; thread: Worker } | undefined;

/** How long a page waits on one answer of the helper before it gives up on it. */
const HELPER_WAIT_MS = 120_000;

/**
 * What `body` returns, as text, run by the worker's helper in a process of the api's package on the api's environment, with
 * `agent-orchestrator/testing` as `t`, the store's root as `root` and `input` as given: how the e2e, which imports no package, reads and
 * writes a run's record, a record of the store's keyspace. One process for the worker's life, not one per call, since each loads the
 * package anew.
 * @param body The body of an async function of `t`, `root` and `input`.
 * @param input What the body is given as `input`.
 */
const inApi = (body: string, input: unknown = '') => {
  const at = helperNow();
  Atomics.store(at.signal, 0, 0);
  at.port.postMessage({ body, input });
  if (Atomics.wait(at.signal, 0, 0, HELPER_WAIT_MS) === 'timed-out')
    throw new Error(`the e2e helper in the api package gave no answer in ${HELPER_WAIT_MS / 1000} s: read its stderr above`);
  const said = receiveMessageOnPort(at.port)?.message as { out: string } | { error: string } | undefined;
  if (said === undefined || 'error' in said) throw new Error(said?.error ?? 'the e2e helper in the api package answered nothing');
  return said.out;
};

/** The worker's helper for the store the api serves now, started where there is none for it or the one there has ended. */
function helperNow() {
  const ended = helper !== undefined && receiveMessageOnPort(helper.port) !== undefined;
  if (helper !== undefined && !ended && helper.root === apiEnv.WF_ROOT) return helper;
  void helper?.thread.terminate();
  const { port1, port2 } = new MessageChannel();
  const signal = new Int32Array(new SharedArrayBuffer(4));
  const thread = new Worker(RELAY, {
    eval: true,
    workerData: { port: port2, signal, cwd: API, env: apiEnv, script: HELPER },
    transferList: [port2],
  });
  thread.unref();
  port1.unref();
  const made = { root: apiEnv.WF_ROOT, port: port1, signal, thread };
  helper = made;
  return made;
}

/**
 * The text of the record of the run `id` in the seeded store, as the tick wrote it: what a page keeps to put back. Throws where there is
 * none.
 * @param id The run's id.
 */
export function storedRecordText(id: string) {
  const text = inApi("return t.recordText(root, t.runKey(input)) ?? '';", id);
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
  inApi('t.plantRecord(root, t.runKey(input.id), input.text);', { id, text });
}

/**
 * The record of the run `id` taken out of the seeded store, there or not: a run removed as `nemia rm` leaves its key.
 * @param id The run's id.
 */
export function dropStoredRecord(id: string) {
  inApi('t.dropRecord(root, t.runKey(input));', id);
}

/** Every kind's files the seed wrote as a store before the keyspace taken up into its records, as each door's first read would. */
export function storeTakenUp() {
  inApi('t.kindsTakenUp(root);');
}

/**
 * The keys under `prefix` in the seeded store: what a page reads the records it added by, to take them back.
 * @param prefix The keys' prefix, `/registry/persontokens/` say.
 */
export function storedKeys(prefix: string) {
  return JSON.parse(inApi('return JSON.stringify(t.keysUnder(root, input));', prefix)) as string[];
}

/**
 * `text` planted at `key` of the store `root`, over what is there: a record a page writes as no verb would, and takes back by its key.
 * @param root The store's root folder.
 * @param key The record's key.
 * @param text What it holds.
 */
export function storeRecordAt(root: string, key: string, text: string) {
  inApi('t.plantRecord(input.root, input.key, input.text);', { root, key, text });
}

/**
 * The record at `key` taken out of the seeded store, there or not.
 * @param key The record's key.
 */
export function dropStoredKey(key: string) {
  inApi('t.dropRecord(root, input);', key);
}

/**
 * The text of the card `name` in the seeded store, as the Card door reads it (a card file dropped into its inbox taken up first), or null
 * where it holds none: what a page reads a card filed or written back by, now that a card is a record and no file.
 * @param name The card's name.
 */
export function storedCard(name: string) {
  return JSON.parse(inApi('return JSON.stringify(t.cardText(root, input));', name)) as string | null;
}

/** The names of the cards the seeded store holds, sorted, as the Card door lists them. */
export function storedCardNames() {
  return JSON.parse(inApi('return JSON.stringify(t.cardNames(root));')) as string[];
}

/**
 * The card `name` in the seeded store as its record holds it, its text and when it was filed (an ISO time), or null where it holds none:
 * what a page keeps to put a card back as it was, its filing time with it, and reads to see a write kept that time.
 * @param name The card's name.
 */
export function storedCardFiled(name: string) {
  return JSON.parse(
    inApi(
      "return JSON.stringify(t.cardText(root, input) === null ? null : JSON.parse(t.recordText(root, t.cardKey(input)) ?? 'null'));",
      name,
    ),
  ) as { text: string; filedAt: string } | null;
}

/**
 * The card `name` in the seeded store written as `text`, over the one there or none: what a page plants or changes by hand.
 * @param name The card's name.
 * @param text The card's text.
 * @param filedAt When it was filed, an ISO time: now where none is given.
 */
export function storeCard(name: string, text: string, filedAt?: string) {
  inApi('t.plantCard(root, input.name, input.text, input.filedAt);', { name, text, filedAt });
}

/**
 * The card `name` taken out of the seeded store, there or not: a card dropped as `nemia inbox rm` drops it.
 * @param name The card's name.
 */
export function dropStoredCard(name: string) {
  inApi('t.dropRecord(root, t.cardKey(input));', name);
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
    inApi("return JSON.stringify(t.keysUnder(root, t.runKey('')).map((key) => key.slice(t.runKey('').length)));"),
  ) as string[];
}

/** The record of every run in the seeded store, read in one go: what a page reads to place a run of its own among them. */
export function storedRecords() {
  return (
    JSON.parse(inApi("return JSON.stringify(t.keysUnder(root, t.runKey('')).map((key) => t.recordText(root, key) ?? ''));")) as string[]
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
      "return JSON.stringify(Object.fromEntries(t.askNames(root, input).map((name) => [name, t.askText(root, input, name) ?? ''])));",
      id,
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
  inApi('t.plantAsk(root, input.id, input.name, input.text);', { id, name, text });
}

/**
 * Every ask of the run `id` taken out of the seeded store, waiting and spent, there or not: what a page that asked takes back.
 * @param id The run's id.
 */
export function dropStoredAsks(id: string) {
  inApi('for (const name of t.askNames(root, input)) t.dropAsk(root, input, name);', id);
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
      "return JSON.stringify(Object.fromEntries(input.flatMap((prefix) => t.keysUnder(root, prefix)).map((key) => [key, t.recordText(root, key) ?? ''])));",
      RUN_PREFIXES,
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
    'for (const key of input.prefixes.flatMap((prefix) => t.keysUnder(root, prefix))) if (!(key in input.before)) t.dropRecord(root, key); for (const [key, text] of Object.entries(input.before)) if (t.recordText(root, key) !== text) t.plantRecord(root, key, text);',
    { prefixes: RUN_PREFIXES, before },
  );
}

/**
 * The run `id` taken out of the seeded store, its record and every ask of it, there or not: what a page that wrote a run takes back.
 * @param id The run's id.
 */
export function dropStoredRun(id: string) {
  inApi('for (const name of t.askNames(root, input)) t.dropAsk(root, input, name); t.dropRecord(root, t.runKey(input));', id);
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
    "const ids = new Set(input); for (const key of t.keysUnder(root, t.claimKey(''))) { try { if (ids.has(JSON.parse(t.recordText(root, key) ?? '{}').run ?? '')) t.dropRecord(root, key); } catch {} } for (const id of ids) { for (const name of t.askNames(root, id)) t.dropAsk(root, id, name); t.dropRecord(root, t.runKey(id)); }",
    made,
  );
  const runsDir = path.join(store!, 'runs');
  for (const file of fs.existsSync(runsDir) ? fs.readdirSync(runsDir) : [])
    if (made.some((id) => file === id || file.startsWith(`${id}.`))) fs.rmSync(path.join(runsDir, file), { recursive: true, force: true });
}
