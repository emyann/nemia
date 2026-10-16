/** A throwaway measurement of what a list read costs on a fixture store: not run by the suite, removed before the change lands. */
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from '../../test/scratch.ts';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runGiven, runOver } from '../../test/placed.ts';

const ROOT = scratch('wf-measure-');
const RUNS_DIR = path.join(ROOT, 'runs');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { RUNS, RUNS_FINISHED, RUNS_OPEN } = await import('../command/pages.verb.ts');
const { advanceRun, startRun, runWith: runEngine } = await import('../runner.ts');
const { readRun } = await import('../record/record.store.ts');
const { engineOf } = await import('../runtime-client.ts');
const { metered } = await import('../meter/tally.store.ts');
const { restingMemo } = await import('../rest/resting.verb.ts');

const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
const engine = eachTest(testEngine);
const e = () => engineOf(engine().layer);

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
const OFF = { ...process.env, WF_VERIFY_REST: '0' };

const folder = (steps: Record<string, string | null>): string => {
  const dir = scratch('wf-measure-team-');
  for (const [name, after] of Object.entries(steps))
    fs.writeFileSync(path.join(dir, `${name}.md`), `---\n${after ? `after: ${after}\n` : ''}place: git\n---\n${name} it\n`);
  return dir;
};

const started = async (steps: Record<string, string | null>, gates: string[] = []) => {
  const repo = scratch('wf-measure-repo-');
  stand().world.repository(repo, {});
  const run = await runPlaced(startRun({ brief: 'list me', repo, workflowDir: folder(steps), isolate: false, gates }));
  await runWith(e(), advanceRun(readRun(run.id)));
  return run.id;
};

const aFinished = async () => {
  const id = await started({ work: null });
  engine().settle(`${id}-work`, 'succeeded', { closeout: SIGNED });
  await runWith(e(), advanceRun(readRun(id)));
  return id;
};

const aWaiting = async () => {
  const id = await started({ plan: null, build: 'plan' }, ['plan']);
  engine().settle(`${id}-plan`, 'succeeded', { closeout: SIGNED });
  await runWith(e(), advanceRun(readRun(id)));
  return id;
};

const anInFlight = async () => {
  const id = await started({ work: null });
  engine().settle(`${id}-work`, 'running');
  return id;
};

/** `copies` more finished runs, each a copy of the model's record under its own id, sharing the model's settled task. */
const copied = (model: string, copies: number): void => {
  const text = fs.readFileSync(path.join(RUNS_DIR, `${model}.json`), 'utf8');
  for (let n = 0; n < copies; n++) {
    const id = `cp${String(n).padStart(4, '0')}`;
    const record = JSON.parse(text) as { id: string; steps: Record<string, { taskId?: string }> };
    record.id = id;
    fs.writeFileSync(path.join(RUNS_DIR, `${id}.json`), `${JSON.stringify(record, null, 2)}\n`);
  }
};

const say = (what: string, r: { ms: number; tallies?: { records: number } }) =>
  console.log(`  ${what.padEnd(34)} ${r.ms.toFixed(0).padStart(7)} ms  ${String(r.tallies?.records ?? '-').padStart(5)} records`);

test('measure', async () => {
  const finished = await aFinished();
  await aWaiting();
  await aWaiting();
  await anInFlight();
  await anInFlight();
  const copies = Number(process.env.MEASURE_COPIES ?? '776');
  copied(finished, copies);
  console.log(`\n${copies + 1} finished runs, 4 open runs, in ${RUNS_DIR}`);

  for (const [what, call] of [
    ['runs open', (kept: object) => RUNS_OPEN.handler({}, OFF, ROOT, kept)],
    ['runs finished?page=1&size=9', (kept: object) => RUNS_FINISHED.handler({ page: '1', size: '9' }, OFF, ROOT, kept)],
    ['runs (the chat read)', (kept: object) => RUNS.handler({}, OFF, ROOT, kept)],
  ] as const) {
    const kept = { runs: restingMemo(), filings: { filed: new Map(), cursor: 0 } };
    say(`${what} cold`, await metered(() => runWith(e(), call(kept) as never)));
    await metered(() => runWith(e(), call(kept) as never));
    say(`${what} warm`, await metered(() => runWith(e(), call(kept) as never)));
  }
});
