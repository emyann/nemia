/**
 * The run as one object (`runObject`), on runs started and advanced over the stand-ins in several phases: it decodes through
 * `RunObject.Run`; its status's judged fields are the list's row's for the same run, from the one function both call (`judgedFields`);
 * and each step's current try is the short of what the try's own entry answers (`TRY`, `tryShort`). Then the sub-resources of a run's
 * step through their entries of the command table — its tries, one try, its closeout (`nemia closeout`) and what it was told — and an
 * unknown step or try refused by its kind, exit 2. And `nemia show`: the object by default, the record with `--raw`.
 *
 * The store is the file's own, at `ROOT`, given as `ENV`; each test empties the store's runs first.
 */
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Schema } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from 'test-kit/scratch';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runGiven, runOver } from './placed.ts';
import { howOf } from '../src/summary/how.verb.ts';
import { runsSummarized, type RunSummary } from '../src/summary/summary.verb.ts';
import { EngineService as RunsEngine, engineOf } from '../src/runtime-client.ts';
import { SHOW, TRIES, TRY, CLOSEOUT, TOLD } from '../src/object/commands.verb.ts';
import { advanceRun, startRun, runWith as runEngine, RunObject, runObject } from '../src/runner.ts';
import { tryShort } from '../src/object/run.verb.ts';
import { artifactsDir, runRecord } from '../src/record/record.store.ts';
import { Missing } from '../src/refusal/refusal.ts';
import { StoreRoot } from '../src/config/root.store.ts';
import type { StepTry } from '../src/resource/tries.verb.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-run-object-');
const RUNS_DIR = path.join(ROOT, 'runs');
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_DEFAULT_FACTORY_STARTS: '1', WF_MAX_CONCURRENT: undefined, WF_MAX_RUNS: undefined };
/** Every run's summary, as the whole list judges it (`runsSummarized`), read through the informer and filings `kept` hands. */
const RUNS = {
  handler: (_args: object, kept?: Parameters<typeof howOf>[0]) =>
    Effect.gen(function* () {
      return yield* runsSummarized(yield* RunsEngine, yield* howOf(kept));
    }),
};

const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer, ENV);
const runPlaced = runGiven(() => stand().layer, ENV);
const engine = eachTest(testEngine);
const e = () => engineOf(engine().layer);

beforeEach(() => {
  fs.rmSync(RUNS_DIR, { recursive: true, force: true });
  fs.mkdirSync(RUNS_DIR, { recursive: true });
});

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/** The step's status on the run's object `id`. */
const statusOf = async (id: string, step: string) => {
  const answer = await object(id);
  assert.ok(!('unjudged' in answer), `${id} is judged`);
  const status = answer.status.steps.find((s) => s.name === step);
  assert.ok(status, `${id} has ${step}`);
  return status;
};

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
  await runWith(e(), advanceRun(runRecord(ROOT, run.id)));
  return run.id;
};

const advanced = (id: string) => runWith(e(), advanceRun(runRecord(ROOT, id)));

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
  await runWith(e(), Effect.provideService(runObject(runRecord(ROOT, id), { memo: { said: new Map() } }), StoreRoot, ROOT));

const handled = <D>(entry: { handler: (...a: never[]) => unknown }, args: Record<string, string>): Promise<D> =>
  runWith(e(), (entry.handler as (a: Record<string, string>, env: Env, home: string) => never)(args, ENV, ROOT));

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
  const rows = (await runWith(e(), RUNS.handler({}) as never)) as RunSummary[];
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
    assert.ok(
      typeof run.metadata.resourceVersion === 'string' && run.metadata.resourceVersion !== '',
      `${id}: it carries a resourceVersion`,
    );
    const again = await object(id);
    assert.ok(!('unjudged' in again));
    assert.equal(again.metadata.resourceVersion, run.metadata.resourceVersion, `${id}: read again unchanged, the same resourceVersion`);
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

test("nemia show's handler answers the object, nemia/v1's Run; with raw, the record", async () => {
  const id = await started({ work: null });
  const shown = await handled<object>(SHOW, { runId: id });
  assert.deepEqual([(shown as { apiVersion?: string }).apiVersion, (shown as { kind?: string }).kind], ['nemia/v1', 'Run']);
  const raw = await handled<object>(SHOW, { runId: id, raw: true } as never);
  assert.equal((raw as { id?: string }).id, id);
  assert.ok('steps' in raw);
});

test("a git run's step lists every file of its artifacts folder, named or not, under its artifacts route; one unread says why", async () => {
  const id = await started({ work: null, after: 'work' });
  const dir = artifactsDir(ROOT, { id }, 'work');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'notes.md'), 'named');
  fs.writeFileSync(path.join(dir, 'shot.png'), 'unnamed');
  fs.writeFileSync(path.join(dir, 'closeout.json'), '{}');
  engine().settle(`${id}-work`, 'succeeded', { closeout: { ...SIGNED, artifacts: [path.join(dir, 'notes.md')] } });
  await advanced(id);
  const listed = (await statusOf(id, 'work')).artifactsFolder;
  assert.equal(listed?.error, null);
  assert.deepEqual(
    listed?.files.map((f) => ('url' in f ? f.url : f.path)),
    ['notes.md', 'shot.png'].map((name) => `/api/runs/${id}/steps/work/artifacts/${name}`),
    "both files, the run's own closeout.json left out",
  );
  assert.deepEqual((await statusOf(id, 'after')).artifactsFolder?.files ?? [], [], 'a step not filed yet lists none');
  fs.chmodSync(dir, 0o100);
  try {
    const unread = (await statusOf(id, 'work')).artifactsFolder;
    assert.deepEqual(unread?.files, [], 'a folder that cannot be listed lists nothing');
    assert.equal(typeof unread?.error, 'string', 'and says why');
  } finally {
    fs.chmodSync(dir, 0o755);
  }
});

test("a run's spec says each step's declared fields in order, with their shapes, and the closeout serves the shapes", async () => {
  const dir = scratch('wf-run-object-shaped-');
  fs.writeFileSync(path.join(dir, 'work.md'), '---\nplace: git\noutput: work.schema.json\n---\nwork it\n');
  const properties = { pr: { 'x-shape': 'link' }, notes: { type: 'string' }, head: { 'x-shape': 'commit' } };
  const schema = { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
  fs.writeFileSync(path.join(dir, 'work.schema.json'), JSON.stringify(schema));
  const repo = scratch('wf-run-object-repo-');
  stand().world.repository(repo, {});
  const { id } = await runPlaced(startRun({ brief: 'shape me', repo, workflowDir: dir }));
  await advanced(id);
  const answer = await object(id);
  assert.ok(!('unjudged' in answer));
  assert.deepEqual(answer.spec.steps.find((s) => s.name === 'work')?.fields, [
    { name: 'pr', shape: 'link' },
    { name: 'notes', shape: null },
    { name: 'head', shape: 'commit' },
  ]);
  engine().settle(`${id}-work`, 'succeeded', { closeout: { ...SIGNED, pr: 'https://x.test/pr/1', notes: 'n', head: null } });
  await advanced(id);
  const closeout = await handled<{ closeout: { shapes?: object } | null }>(CLOSEOUT, { runId: id, step: 'work' });
  assert.deepEqual(closeout.closeout?.shapes, { pr: 'link', head: 'commit' });
});
