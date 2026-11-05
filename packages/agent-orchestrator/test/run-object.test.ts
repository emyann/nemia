/**
 * The run as one object (`runObject`), on runs started and advanced over the stand-ins in several phases: it decodes through
 * `RunObject.Run`; its status's judged fields are the list's row's for the same run, from the one function both call (`judgedFields`);
 * and each step's current try is the short of what the try's own entry answers (`TRY`, `tryShort`). Then the sub-resources of a run's
 * step through their entries of the command table — its tries, one try, its closeout (`nemia closeout`) and what it was told — and an
 * unknown step or try refused by its kind, exit 2. And `nemia show`: the object by default, the record with `--raw`.
 *
 * `WF_ROOT` is set before the package is imported, since the store reads it as it loads; each test empties the store's runs first.
 */
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from './scratch.ts';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-run-object-');
const RUNS_DIR = path.join(ROOT, 'runs');
process.env.WF_ROOT = ROOT;
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { RUNS } = await import('../src/command/pages.verb.ts');
const { SHOW, TRIES, TRY, CLOSEOUT, TOLD } = await import('../src/command/reads.verb.ts');
const { advanceRun, startRun, runWith: runEngine, RunObject, runObject } = await import('../src/runner.ts');
const { tryShort } = await import('../src/object/run.verb.ts');
const { readRun } = await import('../src/record/record.store.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { Missing } = await import('../src/refusal/refusal.ts');
const { StoreRoot } = await import('../src/config/root.store.ts');
const { Effect } = await import('effect');
type RunSummary = import('../src/summary/summary.verb.ts').RunSummary;
type StepTry = import('../src/resource/tries.verb.ts').StepTry;

const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
const engine = eachTest(testEngine);
const e = () => engineOf(engine().layer);

beforeEach(() => {
  fs.rmSync(RUNS_DIR, { recursive: true, force: true });
  fs.mkdirSync(RUNS_DIR, { recursive: true });
});

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/** A workflow folder of the steps named, each after those `after` gives it. */
const folder = (steps: Record<string, string | null>): string => {
  const dir = scratch('wf-run-object-team-');
  for (const [name, after] of Object.entries(steps))
    fs.writeFileSync(path.join(dir, `${name}.md`), `---\n${after ? `after: ${after}\n` : ''}place: git\n---\n${name} it\n`);
  return dir;
};

/** A run started in a repository of its own and advanced one pass, so its roots are filed. */
const started = async (steps: Record<string, string | null>, gates: string[] = []) => {
  const repo = scratch('wf-run-object-repo-');
  stand().world.repository(repo, {});
  const run = await runPlaced(startRun({ brief: 'object me', repo, workflowDir: folder(steps), gates }));
  await runWith(e(), advanceRun(readRun(run.id)));
  return run.id;
};

const advanced = (id: string) => runWith(e(), advanceRun(readRun(id)));

/** Runs in three phases: in flight, finished, and waiting at a gate. */
const threeRuns = async () => {
  const flight = await started({ work: null });
  engine().settle(`${flight}-work`, 'working');
  const done = await started({ work: null });
  engine().settle(`${done}-work`, 'succeeded', { closeout: SIGNED });
  await advanced(done);
  const gated = await started({ plan: null, build: 'plan' }, ['plan']);
  engine().settle(`${gated}-plan`, 'succeeded', { closeout: SIGNED });
  await advanced(gated);
  return [flight, done, gated];
};

/** The object of the run `id`, given the store's root. */
const object = async (id: string) =>
  await runWith(
    e(),
    Effect.provideService(runObject(readRun(id), { memo: { filings: { filed: new Map(), cursor: 0 }, said: new Map() } }), StoreRoot, ROOT),
  );

const handled = <D>(entry: { handler: (...a: never[]) => unknown }, args: Record<string, string>): Promise<D> =>
  runWith(e(), (entry.handler as (a: Record<string, string>, env: NodeJS.ProcessEnv, home: string) => never)(args, process.env, ROOT));

/** What a promise rejects with. */
const refusal = async (p: Promise<unknown>): Promise<{ exitCode?: number }> => {
  try {
    await p;
  } catch (err) {
    return err as { exitCode?: number };
  }
  assert.fail('it answered where it should have refused');
};

test('runObject: the run as one object, its status the list’s judged fields, its current tries the TRY entry’s', async () => {
  const ids = await threeRuns();
  const rows = (await runWith(e(), RUNS.handler({}, process.env, ROOT) as never)) as RunSummary[];
  const phases = new Set<string>();
  let compared = 0;
  for (const id of ids) {
    const answer = await object(id);
    assert.ok(!('unjudged' in answer), `${id} is judged`);
    const run = Schema.decodeUnknownSync(RunObject.Run)(answer);
    assert.deepEqual(run, answer, `${id}: the object decodes whole, no field outside its Schema`);
    assert.equal(run.apiVersion, 'nemia/v1');
    assert.equal(run.kind, 'Run');
    assert.equal(run.metadata.name, id);
    assert.equal(run.metadata.namespace, run.metadata.labels.factory, `${id}: its namespace is its factory, default for none`);
    const row = rows.find((r) => r.id === id);
    assert.ok(row);
    for (const step of row.steps)
      assert.equal(
        run.spec.steps.find((s) => s.name === step.name)?.agent ?? null,
        step.agent,
        `${id}: ${step.name}'s agent, as the row says it`,
      );
    const keys = [
      'status',
      'phase',
      'reason',
      'on',
      'via',
      'moving',
      'cost',
      'atWork',
      'tokens',
      'waiting',
      'holding',
      'toDecide',
    ] as const;
    for (const key of keys) assert.deepEqual(run.status[key], row[key], `${id}: ${key} as the list says it`);
    phases.add(run.status.phase);
    for (const step of run.status.steps) {
      if (step.current === null) continue;
      compared++;
      const one = await handled<StepTry>(TRY, { runId: id, step: step.name, try: String(step.current.try) });
      assert.deepEqual(step.current, tryShort(one), `${id}/${step.name}: the current try is the TRY entry's`);
    }
  }
  assert.equal(phases.size, 3, 'three runs in three phases');
  assert.ok(compared >= 3, 'a current try compared on each run');
});

test('the sub-resources of a step: its tries, one, its closeout and what it was told; an unknown step or try refused', async () => {
  const id = await started({ work: null });
  engine().settle(`${id}-work`, 'succeeded', { closeout: SIGNED });
  await advanced(id);
  const tries = await handled<{ tries: StepTry[] }>(TRIES, { runId: id, step: 'work' });
  assert.deepEqual(
    tries.tries.map((t) => t.try),
    [1],
  );
  const closeout = await handled<{ try: number; closeout: { summary: string } | null }>(CLOSEOUT, { runId: id, step: 'work' });
  assert.equal(closeout.try, 1, 'the latest try by default');
  assert.equal(closeout.closeout?.summary, 'did it');
  const told = await handled<{ told: string | null; body: string | null }>(TOLD, { runId: id, step: 'work' });
  assert.equal(typeof told.told, 'string');
  assert.ok(told.body?.includes('work it'), 'what it was told carries its own body in the workflow');
  const one = await handled<StepTry>(TRY, { runId: id, step: 'work' });
  for (const [answer, schema, name] of [
    [tries, RunObject.StepTries, 'StepTries'],
    [one, RunObject.StepTry, 'StepTry'],
    [closeout, RunObject.TryCloseout, 'TryCloseout'],
    [told, RunObject.StepTold, 'StepTold'],
  ] as const) {
    assert.deepEqual(Schema.decodeUnknownSync(schema)(answer), answer, `the answer decodes whole through ${name}`);
  }
  for (const asked of [
    handled(TRIES, { runId: id, step: 'ghost' }),
    handled(TRY, { runId: id, step: 'work', try: '9' }),
    handled(CLOSEOUT, { runId: id, step: 'work', try: '9' }),
    handled(TOLD, { runId: id, step: 'ghost' }),
  ]) {
    const err = await refusal(asked);
    assert.ok(err instanceof Missing, 'refused as missing');
    assert.equal(err.exitCode, 2);
  }
});

test('nemia show prints the object and points to --raw; show --raw prints the record', async () => {
  const id = await started({ work: null });
  const shown = await handled<object>(SHOW, { runId: id });
  const lines = SHOW.print(shown as never, { runId: id });
  const printed = JSON.parse(lines.join('\n')) as { apiVersion: string; kind: string };
  assert.deepEqual([printed.apiVersion, printed.kind], ['nemia/v1', 'Run']);
  assert.equal(SHOW.note?.(shown as never, { runId: id }).length, 1, 'a line on stderr points to --raw');
  const raw = await handled<object>(SHOW, { runId: id, raw: true } as never);
  const record = JSON.parse(SHOW.print(raw as never, { runId: id, raw: true }).join('\n')) as { id: string; steps: object };
  assert.equal(record.id, id);
  assert.ok('steps' in record);
  assert.deepEqual(SHOW.note?.(raw as never, { runId: id, raw: true }), [], 'none with --raw');
});
