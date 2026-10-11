/**
 * What a pass at rest traces as the store grows: on a store of 2 finished runs and of 200, beside three in flight, the third pass at rest
 * makes the same spans — what is in flight sets them. A run answered from the memo of runs at rest makes no span (`advanceResting` is
 * untraced; a run judged in full is `advancePass`), nor does a settled task of the runtime with nothing to release; the pass says how many
 * runs it listed and answered from memory on its own span (`runs`, `rested`). The fixture is rest-reads.test.ts's: the runtime over its own
 * journal on disk, and a fake harness whose sessions work until `signAll` signs them, here letting a session go by forgetting it.
 *
 * The counted passes are judged with `verifyRest: false`: with it, every run the memo answered is judged in full as well (`verified`),
 * which is work, and traced. Every other pass judges them again, and throws where the two differ.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Engine, type Sighting } from 'agent-runtime';
import { Effect, Tracer } from 'effect';
import { asyncOps, plainEngine, type AsyncRunner } from '../../test/promised.ts';
import type { Run } from '../run.ts';
import type { PassCost } from '../meter/meter.ts';
import { scratch } from '../../test/scratch.ts';
import { testPlace } from '../../place/memory/index.ts';
import { runGiven } from '../../test/placed.ts';

const ROOT = scratch('wf-rest-spans-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
process.env.WF_MAX_CONCURRENT = '10000';
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
const { startRun, tickRun } = await import('../runner.ts');
const place = testPlace();
const stand = () => place;
const runPlaced = runGiven(() => stand().layer);
const { listRuns } = await import('../record/record.store.ts');
const { EngineService } = await import('../runtime-client.ts');
const { freshRestMemo } = await import('./tick.verb.ts');

const REPO = fs.mkdtempSync(path.join(ROOT, 'repo-'));
stand().world.repository(REPO, {});
const ONE = fs.mkdtempSync(path.join(ROOT, 'wf-'));
fs.writeFileSync(path.join(ONE, 'work.md'), '---\nplace: git\nharness: codex\n---\nwork it\n');

/**
 * The runtime over its own journal on disk, with a harness whose sessions work until `signAll` signs all but those of `keep`, take what
 * they are said, and are let go by being forgotten. A statement is stamped a moment after its attempt began, as the journal says: the
 * runtime drops one stamped no later, which a wall clock stepped back between the two would make.
 */
const engine = () => {
  const sessions = new Map<string, Sighting>();
  let n = 0;
  const runner: AsyncRunner = {
    async spawn(r) {
      n++;
      sessions.set(r.name, { sessionId: `s-${n}`, nativeId: `native-${n}`, state: 'working', busy: true });
    },
    async observe() {
      return new Map(sessions);
    },
    async stop() {},
    async logs() {
      return '';
    },
    async say() {},
  };
  const release = (s: Sighting) =>
    Effect.sync(() => {
      for (const [name, listed] of sessions) if (listed.sessionId === s.sessionId) sessions.delete(name);
    });
  const e = plainEngine(
    Engine.layer({
      root: fs.mkdtempSync(path.join(ROOT, 'engine-')),
      harnesses: { codex: { ...asyncOps(runner), release } },
      defaultHarness: 'codex',
    }),
  );
  const begun = async (name: string) => {
    const [, task, attempt] = /^ae\/(.+)\/(\d+)$/.exec(name)!;
    const { state } = await Effect.runPromise(e.view(task));
    return Date.parse(state.attempts.find((a) => a.n === Number(attempt))?.startedAt ?? '');
  };
  const signAll = async (keep: readonly Run[]) => {
    for (const [name, s] of sessions)
      if (s.state === 'working' && !keep.some((r) => name.startsWith(`ae/${r.id}-`)))
        sessions.set(name, {
          ...s,
          state: 'completed',
          busy: false,
          closeout: { payload: { outcome: 'done', summary: 'did it', artifacts: [], needs: null }, at: (await begun(name)) + 1 },
        });
  };
  return { e, signAll, sessions };
};

const h = engine();
const MEMO = freshRestMemo();
const inFlight: Run[] = [];
for (let k = 0; k < 3; k++)
  inFlight.push(await runPlaced(startRun({ brief: `in flight ${k}`, repo: REPO, workflowDir: ONE, isolate: false })));

/** A pass of the store, its rest judged again or not (`verifyRest`): what it cost, and the spans it made. */
const traced = async (verifyRest: boolean): Promise<{ cost: PassCost; spans: Tracer.NativeSpan[] }> => {
  const spans: Tracer.NativeSpan[] = [];
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  const pass = await runPlaced(
    tickRun({ repo: ROOT, memo: MEMO, verifyRest }).pipe(Effect.provide(EngineService.layer(h.e)), Effect.withTracer(tracer)),
  );
  return { cost: pass.cost!, spans };
};

/** A word said to the task of each run in flight, which the runtime appends to its journal. */
const saidToInFlight = async () => {
  for (const run of listRuns().filter((r) => inFlight.some((f) => f.id === r.id)))
    await Effect.runPromise(h.e.say(run.steps.work.taskId!, 'Keep going.'));
};

/**
 * `n` runs more, passed until every run but those in flight is answered from memory; then, each run in flight said a word, the third
 * pass at rest, traced.
 */
const atRest = async (n: number) => {
  for (let k = 0; k < n; k++) await runPlaced(startRun({ brief: `run ${k}`, repo: REPO, workflowDir: ONE, isolate: false }));
  for (let k = 0; k < 12; k++) {
    await traced(true);
    await h.signAll(inFlight);
    if ((await traced(false)).cost.rested === listRuns().length - inFlight.length) {
      await traced(false);
      await saidToInFlight();
      return traced(false);
    }
  }
  assert.fail('the store did not come to rest in twelve passes');
};

/** The names of `spans`, sorted: what a pass traced, whatever order its fibers ended in. */
const namesOf = (spans: readonly Tracer.NativeSpan[]): string[] => spans.map((s) => s.name).sort();

test('a pass at rest makes as many spans over 200 finished runs as over 2: what is in flight sets it', async () => {
  const two = await atRest(2);
  const twoHundred = await atRest(198);
  const said = ({ spans }: { spans: Tracer.NativeSpan[] }) => {
    const pass = spans.find((s) => s.name === 'pass');
    return [pass?.attributes.get('runs'), pass?.attributes.get('rested')];
  };
  assert.deepEqual(
    [said(two), said(twoHundred)],
    [
      [2 + inFlight.length, 2],
      [200 + inFlight.length, 200],
    ],
    'the pass says how many runs it listed and answered from memory',
  );
  assert.deepEqual(namesOf(twoHundred.spans), namesOf(two.spans), 'as many spans, and the same, over 200 runs at rest as over 2');
  assert.deepEqual(
    namesOf(two.spans).filter((name) => name === 'advanceResting' || name === 'releaseFinished'),
    [],
    'no span for a run answered from memory, nor for a settled task with nothing to release',
  );
  const advanced = twoHundred.spans.filter((s) => s.name === 'advancePass').map((s) => String(s.attributes.get('run')));
  assert.deepEqual(advanced.sort(), inFlight.map((r) => r.id).sort(), 'a run judged in full is a run in flight');
});

test("a pass that lets a finished run's session go traces the release, with its task", async () => {
  const run = await runPlaced(startRun({ brief: 'one more', repo: REPO, workflowDir: ONE, isolate: false }));
  const released: string[] = [];
  for (let k = 0; k < 12 && !released.length; k++) {
    const { spans } = await traced(true);
    released.push(...spans.filter((s) => s.name === 'releaseFinished').map((s) => String(s.attributes.get('task'))));
    await h.signAll(inFlight);
  }
  const taskId = listRuns().find((r) => r.id === run.id)?.steps.work.taskId;
  assert.deepEqual(released, [taskId], "the release of the run's session is traced, on the pass that let it go");
  assert.equal(
    [...h.sessions.keys()].some((name) => name.startsWith(`ae/${run.id}-`)),
    false,
    'and its session was let go',
  );
});
