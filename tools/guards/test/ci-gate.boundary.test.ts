/**
 * The gate's own verdict: the `ci` context is green only when every job it needs read success.
 *
 * A boundary test, and the real thing is its whole subject — the gate is a shell script, and a stand-in for the shell would decide
 * nothing. So it is run as GitHub runs it, `bash -e` over a file with the results in the environment, against every result GitHub can
 * hand it and three it cannot. Matching the script's text would prove nothing: a list of the words that mean failure and a check that
 * every word means success read alike to a pattern, and differ exactly on the result nobody foresaw, where one reports a landing green
 * that nothing tested.
 *
 * Where the gate's step is, and how the workflow parses, is `ci-workflow.ts`; the file's agreement with the repository is held next door
 * in `ci-workflow.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { gateSteps, readWorkflow } from './ci-workflow.ts';
import { scratch } from './scratch.ts';

/** The gate's script, run as GitHub runs it: `bash -e` over a file, with the results in the environment and nothing else of the run's. */
function verdictOf(run: string, results: string): { status: number; said: string } {
  const file = path.join(scratch('ci-gate-'), 'gate.sh');
  fs.writeFileSync(file, run);
  const ran = spawnSync('bash', ['-e', file], {
    env: { PATH: process.env.PATH, RESULTS: results },
    encoding: 'utf8',
    timeout: 30_000,
  });
  return { status: ran.status ?? -1, said: `${ran.stdout}${ran.stderr}` };
}

/** The results GitHub hands the gate, as `toJSON(needs)` writes them: a result per needed job. */
const resultsOf = (results: Record<string, string>): string =>
  JSON.stringify(Object.fromEntries(Object.entries(results).map(([job, result]) => [job, { result, outputs: {} }])), undefined, 2);

test('the gate reports the ci context green only when every job it needs read success', () => {
  const steps = gateSteps(readWorkflow());
  assert.equal(steps.length, 1, 'the gate has one step that runs a command today');
  const run = steps[0].run ?? '';

  const green = verdictOf(run, resultsOf({ test: 'success', lint: 'success', typecheck: 'success' }));
  assert.equal(green.status, 0, `every job succeeded, so the gate passes: ${green.said}`);

  for (const result of ['failure', 'cancelled', 'skipped', 'neutral', 'timed_out']) {
    const red = verdictOf(run, resultsOf({ test: 'success', lint: result, typecheck: 'success' }));
    assert.equal(red.status, 1, `a job that read ${result} is not a success: ${red.said}`);
    assert.match(red.said, /read that job's log/, `the gate says what to do next about ${result}: ${red.said}`);
  }

  for (const [why, results] of [
    ['empty', ''],
    ['no job at all', '{}'],
    ['another shape', '[{"state":"ok"}]'],
  ] as const) {
    const red = verdictOf(run, results);
    assert.equal(red.status, 1, `results that are ${why} say nothing was checked, which is a failure: ${red.said}`);
    assert.match(red.said, /read no job result out of needs/, `the gate says what to set when the results are ${why}: ${red.said}`);
  }
});
