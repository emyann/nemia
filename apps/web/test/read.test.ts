/**
 * The board's reads decode the api's answers where they enter (`get`, src/lib/api/read.ts): an answer that does not decode is refused with
 * the route, the first wrong key, what was there and the fix; a key the board does not know is dropped; a refusal of the api's stays in its
 * words. The reads not yet decoded call `getUndecoded`, from a list of files that only shrinks, and no schema leaves through the barrel.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as api from '../src/lib/api.ts';
import { ReadRefusal, UnreadAnswer } from '../src/lib/api/read.ts';
import { runsQuery, type RunSummary } from '../src/lib/api/runs.ts';

const DIR = path.resolve(import.meta.dirname, '../src/lib/api');

/** The files under src/lib/api/ whose reads are not decoded yet. A file leaves the list when its reads are; none joins it. */
const UNDECODED = [
  'agents.ts',
  'builder.ts',
  'capabilities.ts',
  'ceilings.ts',
  'daemon.ts',
  'inbox.ts',
  'machines.ts',
  'quota.ts',
  'skills.ts',
  'workflows.ts',
] as const;

/** Every read answering `body` as JSON, with `status`, for the length of the test. */
function answering(t: { after: (fn: () => void) => void }, body: unknown, status = 200) {
  const before = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  t.after(() => {
    globalThis.fetch = before;
  });
}

/** A row of `GET /api/runs` as the api answers it: every key the board reads, each shape the unions have. */
const row = (extra: object = {}): RunSummary => ({
  id: 'r-1',
  repo: '/work/repo',
  place: 'git',
  work: null,
  brief: 'Decode the reads',
  workflowDir: '/work/workflows/build',
  try: null,
  createdAt: '2026-09-30T05:00:00.000Z',
  startedAt: null,
  cancelledAt: null,
  pruned: { said: 'removed 2 worktrees' },
  after: ['r-0'],
  waiting: {
    runs: [{ run: 'r-0', missing: false, cancelledAt: null, gone: [] }],
    word: 'waiting on r-0',
    advice: 'wait',
    onYou: false,
  },
  heldUntil: [],
  holding: {
    at: '2026-09-30T05:00:00.000Z',
    runs: [{ run: 'r-0', missing: false, cancelledAt: null, gone: [], shipped: false }],
    word: 'held until r-0 ships',
    advice: 'wf hold r-1 --off',
    onYou: true,
  },
  status: 'running',
  moving: true,
  cost: { usd: 4.2, measured: 1, unmeasured: 0, said: '$4.20' },
  steps: [
    {
      name: 'implement',
      taskId: 't-1',
      branch: 'wf/r-1/implement',
      status: 'blocked',
      note: 'try 1',
      needs: 'a decision',
      blockedByHarness: false,
      waitingFor: { words: 'a permission', advice: 'answer it' },
      approve: null,
      denied: { words: 'denied: Skill(look)', calls: ['Skill(look)'] },
    },
  ],
  graph: {
    roots: ['implement'],
    edges: [
      { from: 'implement', to: 'review', kind: 'after' },
      { from: 'review', to: 'implement', kind: 'loop', rounds: 3 },
    ],
  },
  waitingOnYou: ['implement'],
  onYou: ['implement'],
  toDecide: {
    kind: 'approve',
    step: 'ship',
    says: null,
    filed: false,
    back: ['implement'],
    onto: 'main',
    said: 'approve ship',
    command: 'wf approve r-1 ship',
  },
  unreadable: null,
  ...extra,
});

const readRuns = runsQuery.queryFn as unknown as () => Promise<RunSummary[]>;

/** Whether `err` is an `UnreadAnswer` whose message names the route, `at`, what was found there and the fix. */
const unread = (at: string, found: string) => (err: unknown) => {
  assert.ok(err instanceof UnreadAnswer, String(err));
  assert.ok(err.message.startsWith('GET /api/runs answered what this board does not read'), err.message);
  assert.ok(err.message.includes(`at ${at}, `), err.message);
  assert.ok(err.message.includes(found), err.message);
  assert.ok(
    err.message.endsWith('restart the api (npm run dev) and rebuild the board (npm run build), then reload the page.'),
    err.message,
  );
  assert.equal(err.route, 'GET /api/runs');
  return true;
};

test('the Runs list decodes an answer the api gives, each union in its every shape', async (t) => {
  const git = row({ toDecide: { kind: 'git', branches: ['wf/r-1/implement'], said: 'merge', command: 'git merge' } });
  answering(t, [row(), git, row({ place: 'folder', waiting: null, holding: null, cost: null, toDecide: null, pruned: null })]);
  const runs = await readRuns();
  assert.equal(runs.length, 3);
  assert.deepEqual(runs[0], row());
  assert.deepEqual(runs[1], git);
});

test('REFUSED: a row without its status, naming the route, the key, what was there and the fix', async (t) => {
  const { status: _, ...without } = row();
  answering(t, [without]);
  await assert.rejects(readRuns(), unread('[0].status', 'is missing'));
});

test('REFUSED: a row whose status is no word the board knows', async (t) => {
  answering(t, [row(), row({ status: 'nonsense' })]);
  await assert.rejects(
    readRuns(),
    unread('[1].status', '"nonsense", where the board reads "running" | "succeeded" | "failed" | "cancelled"'),
  );
});

test('REFUSED: a row whose steps are not an array', async (t) => {
  answering(t, [row({ steps: { implement: 'blocked' } })]);
  await assert.rejects(readRuns(), unread('[0].steps', '{"implement":"blocked"}, where the board reads array'));
});

test('REFUSED: a step without a key the board reads, and a value quoted to 60 characters', async (t) => {
  const [step] = row().steps;
  const { blockedByHarness: _, ...without } = step;
  answering(t, [row({ steps: [without] })]);
  await assert.rejects(readRuns(), unread('[0].steps[0].blockedByHarness', 'is missing'));

  answering(t, [row({ brief: 7 })]);
  await assert.rejects(readRuns(), unread('[0].brief', '7, where'));
  answering(t, [row({ graph: 'x'.repeat(100) })]);
  await assert.rejects(readRuns(), unread('[0].graph', `"${'x'.repeat(58)}…, where`));
});

test('REFUSED: an answer that is no list at all is refused at the answer itself', async (t) => {
  answering(t, { runs: [] });
  await assert.rejects(readRuns(), unread('the answer', '{"runs":[]}, where the board reads array'));
});

test('a key the board does not know is dropped, not refused', async (t) => {
  answering(t, [row({ colour: 'blue', steps: [{ ...row().steps[0], mood: 'calm' }] })]);
  const [run] = await readRuns();
  assert.equal(Object.hasOwn(run, 'colour'), false);
  assert.equal(Object.hasOwn(run.steps[0], 'mood'), false);
  assert.deepEqual(run, row());
});

test("a read the api refused still rejects in the api's words and status, not as an answer unread", async (t) => {
  answering(t, { error: 'no run x' }, 404);
  const err: unknown = await readRuns().then(
    () => assert.fail('a 404 was read'),
    (e: unknown) => e,
  );
  assert.ok(err instanceof ReadRefusal && !(err instanceof UnreadAnswer), String(err));
  assert.equal(err.status, 404);
  assert.equal(err.message, 'no run x');
});

/** What the list of undecoded files gets wrong, given each file's text: one line a fault, each saying what to do. */
export function undecodedFaults(texts: ReadonlyMap<string, string>, listed: readonly string[]): string[] {
  const calling = [...texts].filter(([f, text]) => f !== 'read.ts' && /\bgetUndecoded\b\s*[<(]/.test(text)).map(([f]) => f);
  return [
    ...calling
      .filter((f) => !listed.includes(f))
      .map((f) => `${f} calls getUndecoded: decode the read with a schema beside its type and \`get\`, which the list only shrinks for`),
    ...listed
      .filter((f) => !calling.includes(f))
      .map((f) => `${f} no longer calls getUndecoded: strike it from UNDECODED in test/read.test.ts`),
  ];
}

test('REFUSED: a file calling getUndecoded off the list, with a type argument or without, and a listed file that no longer calls it', () => {
  const texts = new Map([
    ['read.ts', 'export async function getUndecoded<T>(path: string) {}'],
    ['runs.ts', "queryFn: () => getUndecoded<RunSummary[]>('/api/runs'),"],
    ['steps.ts', "queryFn: () => getUndecoded('/api/runs/r-1/steps/plan/path'),"],
    ['quota.ts', "queryFn: () => get('/api/quota', QuotaSchema),"],
  ]);
  assert.deepEqual(undecodedFaults(texts, ['quota.ts']), [
    'runs.ts calls getUndecoded: decode the read with a schema beside its type and `get`, which the list only shrinks for',
    'steps.ts calls getUndecoded: decode the read with a schema beside its type and `get`, which the list only shrinks for',
    'quota.ts no longer calls getUndecoded: strike it from UNDECODED in test/read.test.ts',
  ]);
});

test('the files whose reads are not decoded are the list, and it only shrinks', () => {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.ts'));
  assert.ok(files.includes('runs.ts') && files.includes('read.ts'), files.join(', '));
  const texts = new Map(files.map((f) => [f, fs.readFileSync(path.join(DIR, f), 'utf8')]));
  assert.deepEqual(undecodedFaults(texts, UNDECODED), []);
});

test('the barrel hands out no schema: the mirror stays types, queries and writes', () => {
  const names = Object.keys(api);
  assert.ok(names.includes('runsQuery') && names.includes('UnreadAnswer') && names.includes('ReadRefusal'), names.join(', '));
  assert.deepEqual(
    names.filter((n) => n.endsWith('Schema')),
    [],
    'export the file with `export type *` in src/lib/api.ts: a component reads a type, never a schema',
  );
});
