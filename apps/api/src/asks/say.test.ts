/**
 * A person's words to a step's running session over HTTP: POST /api/runs/:id/steps/:step/say, which calls the package's `sayRun` —
 * `nemia say`'s own — and the `said` on the step's detail, read back off the engine.
 *
 * On the stand-ins: the runtime's test engine, its tasks filed and moved by hand, and the test place, under the run records this file
 * seeds. One engine for the file, since its runs are seeded as it loads and its tests read them in turn. The tasks: `t-implement`, at
 * work; `t-settled`, ran once and signed off; and `t-cancelled`, the cancelled run's step, at work: only the run's mark refuses it. What
 * the harness does with the words — the session's inbox, and the 502 when it cannot be given them — is `say.boundary.test.ts`'s.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import type { Said } from 'agent-orchestrator';
import { appOver, engineFor, runOver } from '../../test/placed.ts';
import type { RunDetail } from '../detail/detail.ts';
import { list, runStore, sayRun, type RunSummary } from 'agent-orchestrator';

const stand = testPlace();
const standIn = testEngine();
const engine = () => engineFor(standIn);
const runWith = runOver(stand.layer);
const app = appOver(standIn, stand);

const T0 = Date.parse('2026-09-14T06:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** A Claude Code task filed and left in `phase`, with `closeout` where it ended. */
const task = (taskId: string, phase: string, closeout?: object) => {
  Effect.runSync(engine().file({ id: taskId, brief: 'Do it.', cwd: '/code/app', harness: 'claude' }));
  standIn.settle(taskId, phase, closeout ? { exitCode: 0, closeout } : undefined);
};

const R = 'r-say';
const C = 'r-say-cancelled';
task('t-implement', 'running (working)');
task('t-settled', 'succeeded', { outcome: 'done', summary: 'Done.', needs: null, artifacts: [] });
task('t-cancelled', 'running (working)');

const record = (id: string, steps: Record<string, { taskId: string | null }>) =>
  write(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo: '/code/app',
      workspace: '/code/app',
      baseRef: 'abc123',
      branch: 'main',
      isolate: true,
      brief: 'Say something to it',
      workflowDir: path.join(root, 'no-such-workflow'),
      createdAt: at(0),
      workflow: Object.keys(steps).map((name) => ({ name, after: [], body: `${name} it.` })),
      steps,
    }),
  );
record(R, { implement: { taskId: 't-implement' }, settled: { taskId: 't-settled' }, review: { taskId: null } });
record(C, { implement: { taskId: 't-cancelled' } });
write(path.join(root, 'runs', `${C}.cancelled`), at(5));

/** What the board sends, through vite's proxy: JSON, same-origin, and Host rewritten to the api's. */
const BOARD = {
  'content-type': 'application/json',
  'sec-fetch-site': 'same-origin',
  origin: 'http://localhost:5173',
  host: '127.0.0.1:8787',
};

const sayTo = (step: string, body: unknown, headers: Record<string, string> = BOARD, run = R) =>
  app.request(`/api/runs/${run}/steps/${step}/say`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

/** Every file the api could have written, the runs' records and marks, and every word the engine was asked to say. */
const written = () => ({
  files: Object.fromEntries(
    fs
      .readdirSync(path.join(root, 'runs'))
      .sort()
      .map((f) => [f, fs.readFileSync(path.join(root, 'runs', f), 'utf8')]),
  ),
  said: [...standIn.said],
});

/** What the package's `sayRun` refuses the words for, word for word: what `nemia say` prints. */
const sayRefuses = async (step: string, text: string, run = R): Promise<string> => {
  try {
    await runWith(engine(), sayRun(run, step, text));
  } catch (err) {
    return (err as Error).message;
  }
  return assert.fail(`say() took ${JSON.stringify(text)} for ${run} ${step}, and should have refused`);
};

const detailSteps = async (id = R): Promise<RunDetail['steps']> =>
  ((await (await app.request(`/api/runs/${id}`)).json()) as RunDetail).steps;

test('REFUSED at shipped defaults: JSON that is not the words (400): nothing said, nothing written', async () => {
  const before = written();
  const bodies: Array<[unknown, RegExp]> = [
    ['Widen the scope to apps/api too.', /^POST …\/say takes a JSON body: `\{ "text": "<words>" \}`\.$/],
    [['Widen the scope'], /^POST …\/say takes a JSON object: /],
    [{}, /^`text` is the words to hand the step's session[\s\S]*This request's was left out/],
    [{ text: 42 }, /^`text` is the words to hand the step's session[\s\S]*This request's was 42/],
    [{ message: 'Widen the scope' }, /^`text` is the words[\s\S]*was left out/],
  ];
  for (const [sent, words] of bodies) {
    const res = await sayTo('implement', sent);
    assert.equal(res.status, 400, JSON.stringify(sent));
    assert.match(((await res.json()) as { error: string }).error, words);
  }
  assert.deepEqual(written(), before, 'nothing written');
});

test("REFUSED at shipped defaults: empty words (the engine's sentence), a settled step, a step not filed, a cancelled run — 409s in the package's words and the engine's, verbatim, as `nemia say` prints them — and no such run or step, 404: nothing said, nothing written", async () => {
  const before = written();
  const cases: Array<[string, string, string, RegExp]> = [
    [R, 'implement', '', /^say: `text` is empty\. Give the words the session should hear\.$/],
    [R, 'implement', ' \n\t', /^say: `text` is empty\. Give the words the session should hear\.$/],
    [
      R,
      'settled',
      'Widen the scope.',
      /^settled is not running: try 1's task settled `succeeded`, so no session of it is there to hear anything\. .*: nemia retry r-say settled --message "<words>"\.$/,
    ],
    [R, 'review', 'Look at the parser first.', /^review has not been filed yet, so there is no session to hear anything\./],
    [
      C,
      'implement',
      'Widen the scope.',
      /^r-say-cancelled was cancelled at 2026-09-14T06:00:05\.000Z: its sessions are being stopped, not steered/,
    ],
  ];
  for (const [run, step, text, words] of cases) {
    const res = await sayTo(step, { text }, BOARD, run);
    assert.equal(res.status, 409, `${run} ${step} ${JSON.stringify(text)}`);
    const { error } = (await res.json()) as { error: string };
    assert.match(error, words);
    assert.equal(error, await sayRefuses(step, text, run), "the package's words, as `nemia say` prints them");
  }
  const noRun = await sayTo('implement', { text: 'Widen the scope.' }, BOARD, 'r-nope');
  assert.equal(noRun.status, 404);
  assert.match(((await noRun.json()) as { error: string }).error, /^No run 'r-nope' in this store/);
  const noStep = await sayTo('deploy', { text: 'Ship it.' });
  assert.equal(noStep.status, 404);
  assert.match(((await noStep.json()) as { error: string }).error, /^Run 'r-say' has no step 'deploy'/);
  assert.deepEqual(written(), before, 'nothing written');
});

test("words as the board sends them are the package's `sayRun`: 202 with the engine's entry — `at`, `attempt`, `text`, `after` — the words handed to the engine as given, the entry on the task, and on the step's detail and in its note, as `nemia ls` words it; nothing else written", async () => {
  const records = written().files;
  const words = 'Widen the scope to apps/api too.\n\nAnd keep `--flag` as it is.';
  const res = await sayTo('implement', { text: words });
  assert.equal(res.status, 202, await res.clone().text());
  const said = (await res.json()) as Said;
  assert.deepEqual(Object.keys(said).sort(), ['after', 'at', 'attempt', 'text']);
  assert.deepEqual(
    [said.attempt, said.text, said.after],
    [1, words, null],
    'no transcript is planted for the session: no event to stand after',
  );
  assert.equal(new Date(said.at).toISOString(), said.at, 'the time the package recorded, an ISO time');

  assert.deepEqual(standIn.said, [{ taskId: 't-implement', text: words }], "the words handed to the engine's say, as given, once");
  assert.deepEqual((await Effect.runPromise(engine().view('t-implement'))).state.said, [said], "the engine's record of the task");
  const steps = await detailSteps();
  const implement = steps.find((s) => s.name === 'implement')!;
  assert.deepEqual([implement.said, implement.note], [[said], 'said to 1×']);
  for (const other of steps.filter((s) => s.name !== 'implement'))
    assert.deepEqual(other.said, [], `${other.name}: nobody told it anything`);
  assert.equal(
    (await runWith(engine(), list(engine(), runStore.runs.read(R)))).steps.find((s) => s.name === 'implement')!.note,
    'said to 1×',
    "`nemia ls`'s words",
  );
  const summary = ((await (await app.request('/api/runs')).json()) as RunSummary[]).find((r) => r.id === R)!;
  assert.equal(summary.steps.find((s) => s.name === 'implement')!.note, 'said to 1×', 'and on the list');
  assert.deepEqual(written().files, records, "the runs' records untouched, and no file of the api's");
});
