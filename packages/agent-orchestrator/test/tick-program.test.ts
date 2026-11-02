/**
 * The tick as an Effect program (`tickRun`, over `EngineService`): what its pass keeps of its cost — among the recent passes, in the
 * series, beside a reading of the disk it is handed. That its program answers what its plain face answers, a refusal its typed failure
 * and anything else a defect, are the tick's rows of `faces.test.ts`; what it needs and refuses is said in the type by
 * `_tickProgramTypes` below.
 * Walked through the runtime itself, `plainEngine` over an in-memory journal
 * and a harness the test signs by hand, as unreadable-journal.test.ts does.
 *
 * `WF_ROOT` is set before the runner is imported, which reads it as the module loads. `WF_VERIFY_REST=1` judges in full every run a pass
 * answers from its memo, sessions enough are admitted for the one run, and no cap is set on runs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { nameFor, Engine as RuntimeEngine, type Sighting } from 'agent-runtime';
import { asyncStore, type AsyncJournal, asyncOps, type AsyncRunner } from './promised.ts';
import type { Engine } from '../src/runtime-client.ts';
import { Effect } from 'effect';
import type { Effect as EffectOf } from 'effect/Effect';
import type { Refusal } from '../src/refusal/refusal.ts';
import type { EngineService as Service } from '../src/runtime-client.ts';
import type { Pass } from '../src/tick/tick.verb.ts';
import { scratch } from './scratch.ts';
import { plainEngine } from './promised.ts';
import { runGiven, runOver } from './placed.ts';
import { testPlace } from '../place/memory/index.ts';
import type { PlaceService } from '../src/place/place.store.ts';
import type { StoreRoot } from '../src/config/root.store.ts';

const place = testPlace();
const stand = () => place;
const ROOT = scratch('wf-tick-program-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_MAX_CONCURRENT = '10';
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
const { startRun, runWith: runEngine } = await import('../src/runner.ts');
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
const { tickRun } = await import('../src/tick/tick.verb.ts');
const { PHASES, passCost } = await import('../src/meter/meter.ts');
const { recentPasses, recordRecentPass } = await import('../src/daemon/daemon.store.ts');

const REPO = fs.mkdtempSync(path.join(ROOT, 'repo-'));
stand().world.repository(REPO, {});

const FOLDER = fs.mkdtempSync(path.join(ROOT, 'wf-'));
fs.writeFileSync(path.join(FOLDER, 'work.md'), '---\nplace: git\nharness: codex\n---\nwork it\n');

const tasks = new Map<string, Awaited<ReturnType<AsyncJournal['read']>>>();
/** When the journal says each attempt began, in milliseconds, by its session's name: a closeout counts only when made after it. */
const starts = new Map<string, number>();
const journal: AsyncJournal = {
  async append(taskId, event) {
    tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
    if (event.kind === 'starting') starts.set(nameFor(taskId, event.attempt), Date.parse(event.at));
  },
  async read(taskId) {
    return [...(tasks.get(taskId) ?? [])];
  },
  async list() {
    return [...tasks.keys()].sort();
  },
  async feed() {
    return { entries: [], cursor: 0 };
  },
};

const sessions = new Map<string, Sighting>();
const runner: AsyncRunner = {
  async spawn(r) {
    sessions.set(r.name, { sessionId: `s-${sessions.size + 1}`, nativeId: `n-${sessions.size + 1}`, state: 'working', busy: true });
  },
  async observe() {
    return new Map(sessions);
  },
  async stop() {},
  async logs() {
    return '';
  },
};
const e = plainEngine(
  RuntimeEngine.layer({
    root: fs.mkdtempSync(path.join(ROOT, 'engine-')),
    journal: asyncStore(journal),
    harnesses: { claude: asyncOps(runner), codex: asyncOps(runner), check: asyncOps(runner) },
    defaultHarness: 'claude',
  }),
);
const signAll = () => {
  for (const [name, s] of sessions)
    if (s.state === 'working')
      sessions.set(name, {
        ...s,
        state: 'completed',
        busy: false,
        closeout: { payload: { outcome: 'done', summary: 'did it', artifacts: [], needs: null }, at: starts.get(name)! + 1 },
      });
};

/**
 * The tick's program says in its type what it needs and what it refuses: run without the engine, it does not typecheck, and a refusal
 * is its failure. Nothing calls this: the typecheck reads its lines, and an `@ts-expect-error` over code that stops erring is the
 * failure.
 */
function _tickProgramTypes(e: Engine) {
  void (tickRun() satisfies EffectOf<Pass, Refusal, Service | PlaceService | StoreRoot>);
  // @ts-expect-error -- a refusal is its failure, so it is not an Effect that cannot fail
  void (tickRun() satisfies EffectOf<Pass, never, Service | PlaceService | StoreRoot>);
  // @ts-expect-error -- tickRun requires EngineService, and runPromise takes no requirement
  void Effect.runPromise(tickRun());
  // @ts-expect-error -- a program that asks the place is given none: the engine alone does not give it
  void runEngine(e, tickRun());
}

test('a pass whose series cannot be written keeps its own cost and says so: the series are lost, never the pass; the quota read rides on it', async (t) => {
  const old = new Date(Date.now() - 3_600_000).toISOString();
  recordRecentPass(
    passCost({
      at: old,
      ms: 5,
      phases: Object.fromEntries(PHASES.map((p) => [p, { ms: 0, calls: 0, bytes: 0, reads: 0, spawned: 0 }])) as never,
      harnesses: {},
      records: 0,
      overheadMs: 0,
      rested: 0,
      runs: 0,
      tasks: 0,
      queued: 0,
      admitted: 0,
      waitMs: 0,
      load: 0,
    }),
  );
  fs.rmSync(path.join(ROOT, 'metrics'), { recursive: true, force: true });
  fs.writeFileSync(path.join(ROOT, 'metrics'), 'not a folder');
  const said: string[] = [];
  t.mock.method(process.stderr, 'write', (text: string) => said.push(text) > 0);
  const pass = await runWith(e, tickRun({ repo: ROOT, quota: () => ({ h: { w: 12 } }) }));
  t.mock.restoreAll();
  fs.rmSync(path.join(ROOT, 'metrics'), { force: true });
  assert.ok(pass.cost, 'the pass answered with its cost');
  assert.ok(
    said.some((x) => x.startsWith('nemia: the series were not kept on this pass: ')),
    said.join(''),
  );
  const last = recentPasses().at(-1)!;
  assert.deepEqual([last.at, last.quota], [pass.cost.at, { h: { w: 12 } }]);
});

test('a pass handed a reading of the disk keeps it as it is and measures nothing: no phase of its own, no store of the disk imported', async () => {
  const reading = {
    at: '2026-10-12T06:00:00.000Z',
    free: 700,
    size: 1000,
    entries: [
      { part: 'runs' as const, factory: 'nemia', bytes: 40, unread: 0 },
      { part: 'engine' as const, unread: 2 },
    ],
  };
  const pass = await runWith(e, tickRun({ repo: ROOT, disk: () => reading }));
  const kept = recentPasses().at(-1)!;
  assert.deepEqual([kept.at, kept.disk], [pass.cost!.at, reading], 'read back off the store, typed');
  assert.deepEqual(Object.keys(kept.phases), [...PHASES], 'the pass has the phases it had');
  assert.deepEqual(
    PHASES.filter((phase) => /disk/.test(phase)),
    [],
  );
  await runWith(e, tickRun({ repo: ROOT, disk: () => undefined }));
  assert.equal('disk' in recentPasses().at(-1)!, false, 'a pass handed no reading keeps none');
  const source = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'tick', 'tick.verb.ts'), 'utf8');
  const imports = source.slice(0, source.indexOf('export type TickOptions'));
  assert.ok(imports.length > 0 && imports.includes("from '../meter/meter.verb.ts'"), 'the slice holds the imports');
  assert.deepEqual(
    [...imports.matchAll(/from\s*'(\.\.\/(?:disk|prune)\/[^']+)'/g)].map(([, from]) => from),
    ['../disk/disk.ts'],
    'REFUSED: the pass importing the walk or the sweep',
  );
  assert.match(imports, /import\s+type\s*\{\s*DiskReading\s*\}\s*from\s*'\.\.\/disk\/disk\.ts'/);
});

test('a check filed by a pass is kept with its labels among the recent passes, and in the series as check.load', async () => {
  const { keepSeries, seriesRead } = await import('../src/series/series.store.ts');
  const { readRun } = await import('../src/record/record.store.ts');
  const { DEFAULT_FACTORY } = await import('../src/factory/factory.ts');
  const folder = fs.mkdtempSync(path.join(ROOT, 'checked-'));
  fs.writeFileSync(path.join(folder, 'work.md'), '---\nplace: git\nharness: codex\ncheck: node -e 0\n---\nwork it\n');
  const run = await runPlaced(startRun({ brief: 'a checked run', repo: REPO, workflowDir: folder }));
  const before = recentPasses().length;
  for (let k = 0; k < 8 && !readRun(run.id).steps.work?.check; k++) {
    await runWith(e, tickRun({ repo: ROOT }));
    signAll();
  }
  assert.ok(readRun(run.id).steps.work?.check, 'the pass filed the check');
  const labels = { factory: DEFAULT_FACTORY, workflow: path.basename(readRun(run.id).workflowDir), step: 'work', agent: '' };
  const kept = recentPasses().slice(before);
  assert.deepEqual(
    kept.flatMap((p) => p.checks ?? []),
    [labels],
    'the pass that filed it carries its labels',
  );
  const later = Date.now() + 120_000;
  keepSeries(recentPasses(), later);
  assert.deepEqual(
    seriesRead('24h', undefined, later)
      .series.filter((x) => x.s === 'check.load')
      .map((x) => x.l),
    [labels],
  );
});
