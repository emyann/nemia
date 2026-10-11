/**
 * The `WF_` environment, read through `Config`: each variable refused by name, exit 2, at shipped defaults, when it is set to what it does
 * not take, and each default and value it takes. Every reader is handed the environment it is judged on, never the process's, so what the
 * shell running the suite sets changes nothing here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { keepsWorktrees, maxConcurrent, maxRuns, metricsHourDays, metricsMinuteDays, verifiesRest, wfRoot, type Env } from './config.store.ts';
import { Invalid } from '../refusal/refusal.ts';

/** That `read` refuses `env` with `Invalid`, exit 2, and exactly `message`. */
function refuses(read: (env: Env) => unknown, env: Env, message: string): void {
  assert.throws(
    () => read(env),
    (err: unknown) => err instanceof Invalid && err.exitCode === 2 && err.message === message,
    JSON.stringify(env),
  );
}

test('REFUSED at shipped defaults: a WF_ROOT that is not an absolute path — relative, dotted, or empty — names the variable and says what it takes', () => {
  for (const value of ['relative/store', './x', ''])
    refuses(
      wfRoot,
      { WF_ROOT: value },
      `WF_ROOT=${value} is not an absolute path. It is the directory where runs and the engine's board live, the same for every process that reads them: WF_ROOT=/srv/wf — or unset, for ~/.agent-workflows.`,
    );
});

test('REFUSED at shipped defaults: WF_MAX_CONCURRENT=-3', () => {
  refuses(
    maxConcurrent,
    { WF_MAX_CONCURRENT: '-3' },
    'WF_MAX_CONCURRENT=-3 is not a count from 1. It is the most sessions at work per pool at once, a whole number: WF_MAX_CONCURRENT=4 — or unset, for 2.',
  );
});

test('REFUSED at shipped defaults: a WF_MAX_CONCURRENT that is not a whole number from 1 — zero, a fraction, a word, hex, an exponent', () => {
  for (const value of ['0', '00', '1.5', 'two', '0x2', '1e3', '2 sessions'])
    refuses(
      maxConcurrent,
      { WF_MAX_CONCURRENT: value },
      `WF_MAX_CONCURRENT=${value} is not a count from 1. It is the most sessions at work per pool at once, a whole number: WF_MAX_CONCURRENT=4 — or unset, for 2.`,
    );
});

test('REFUSED at shipped defaults: a WF_MAX_RUNS that is not a whole count — a word, a negative, a fraction, a unit, hex, an exponent', () => {
  for (const value of ['two', '-1', '1.5', '2 runs', '0x2', '1e3'])
    refuses(
      maxRuns,
      { WF_MAX_RUNS: value },
      `WF_MAX_RUNS=${value} is not a count. It is the most runs in flight at once, a whole number: WF_MAX_RUNS=2 — or 0, or unset, for no cap.`,
    );
});

test('REFUSED at shipped defaults: a WF_VERIFY_REST that is neither 1 nor 0 — a word, true, 2, a padded 1', () => {
  for (const value of ['yes', 'true', '2', ' 1'])
    refuses(
      verifiesRest,
      { WF_VERIFY_REST: value },
      `WF_VERIFY_REST=${value} is neither 1 nor 0. It judges in full each run a pass answers from its memo of runs at rest, which costs all the memo saves: WF_VERIFY_REST=1 — or 0, or unset, for off.`,
    );
});

test('REFUSED at shipped defaults: a WF_KEEP_WORKTREES that is neither 1 nor 0; 1 keeps the worktrees, and 0, empty or unset frees them', () => {
  for (const value of ['yes', 'true', '2', ' 1'])
    refuses(
      keepsWorktrees,
      { WF_KEEP_WORKTREES: value },
      `WF_KEEP_WORKTREES=${value} is neither 1 nor 0. It keeps the worktrees of every finished run, which the daemon otherwise removes: WF_KEEP_WORKTREES=1 — or 0, or unset, to have them freed.`,
    );
  assert.deepEqual(
    [{ WF_KEEP_WORKTREES: '1' }, { WF_KEEP_WORKTREES: '0' }, { WF_KEEP_WORKTREES: '' }, {}].map((env) => keepsWorktrees(env)),
    [true, false, false, false],
  );
});

test('unset, each variable reads its default: the home store, 2 sessions per pool, no cap on runs, and no full judgement at rest', () => {
  assert.deepEqual(
    [wfRoot({}), maxConcurrent({}), maxRuns({}), verifiesRest({})],
    [path.join(os.homedir(), '.agent-workflows'), 2, 0, false],
  );
  assert.deepEqual(
    [wfRoot({ WF_ROOT: undefined }), maxConcurrent({ WF_MAX_CONCURRENT: undefined }), maxRuns({ WF_MAX_RUNS: undefined })],
    [path.join(os.homedir(), '.agent-workflows'), 2, 0],
  );
});

test('empty or blank, a count reads its default, and WF_VERIFY_REST empty is off; WF_ROOT empty is refused above, never read as the home store', () => {
  assert.deepEqual(
    [
      maxConcurrent({ WF_MAX_CONCURRENT: '' }),
      maxConcurrent({ WF_MAX_CONCURRENT: '  ' }),
      maxRuns({ WF_MAX_RUNS: '' }),
      verifiesRest({ WF_VERIFY_REST: '' }),
    ],
    [2, 2, 0, false],
  );
});

test('each variable reads the values it takes', () => {
  assert.equal(wfRoot({ WF_ROOT: '/srv/wf' }), '/srv/wf');
  assert.deepEqual(
    ['1', '3', ' 3 ', '50', '07'].map((value) => maxConcurrent({ WF_MAX_CONCURRENT: value })),
    [1, 3, 3, 50, 7],
  );
  assert.deepEqual(
    ['  ', '0', '2', ' 3 '].map((value) => maxRuns({ WF_MAX_RUNS: value })),
    [0, 0, 2, 3],
  );
  assert.deepEqual(
    ['1', '0'].map((value) => verifiesRest({ WF_VERIFY_REST: value })),
    [true, false],
  );
});

test('a reader given nothing reads the process environment when it is called, not when the module loaded', (t) => {
  const was = process.env.WF_MAX_CONCURRENT;
  t.after(() => {
    if (was === undefined) delete process.env.WF_MAX_CONCURRENT;
    else process.env.WF_MAX_CONCURRENT = was;
  });
  process.env.WF_MAX_CONCURRENT = '7';
  assert.equal(maxConcurrent(), 7);
  process.env.WF_MAX_CONCURRENT = '-3';
  assert.throws(
    () => maxConcurrent(),
    (err: unknown) => err instanceof Invalid && err.message.startsWith('WF_MAX_CONCURRENT=-3 '),
  );
});

test('REFUSED at shipped defaults: a WF_METRICS_MINUTE_DAYS below 2 or not a whole number, and a WF_METRICS_HOUR_DAYS not one from 1', () => {
  for (const value of ['1', 'x', '-3', '0', '2.5'])
    refuses(
      metricsMinuteDays,
      { WF_METRICS_MINUTE_DAYS: value },
      `WF_METRICS_MINUTE_DAYS=${value} is not a whole number from 2. It is how many days of the series' minute lines are kept, two at least so a day's range has yesterday: WF_METRICS_MINUTE_DAYS=30 — or unset, for 30.`,
    );
  for (const value of ['abc', '0', '-1'])
    refuses(
      metricsHourDays,
      { WF_METRICS_HOUR_DAYS: value },
      `WF_METRICS_HOUR_DAYS=${value} is not a whole number from 1. It is how many days of the series' hour lines are kept: WF_METRICS_HOUR_DAYS=365 — or unset, to keep them until you delete them.`,
    );
});

test('the series keep 30 days of minutes and every hour when unset, and the days a value names', () => {
  assert.equal(metricsMinuteDays({}), 30);
  assert.equal(metricsMinuteDays({ WF_METRICS_MINUTE_DAYS: '2' }), 2);
  assert.equal(metricsMinuteDays({ WF_METRICS_MINUTE_DAYS: ' 45 ' }), 45);
  assert.equal(metricsHourDays({}), undefined);
  assert.equal(metricsHourDays({ WF_METRICS_HOUR_DAYS: '1' }), 1);
  assert.equal(metricsHourDays({ WF_METRICS_HOUR_DAYS: '400' }), 400);
});
