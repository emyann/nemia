/**
 * The `WF_` environment, read through `Config`, as two tables: each variable refused, at shipped defaults, when it is set to what it
 * does not take — `Invalid`, exit 2, naming the variable as set and the value its fix gives — and each default and value it takes.
 * Every reader but one row's is handed the environment it is judged on, never the process's, so what the shell running the suite sets
 * changes nothing here. What the tick and `nemia up` make of a refused ceiling is `test/queue-store.test.ts`'s.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {
  keepsWorktrees,
  maxConcurrent,
  maxRuns,
  metricsHourDays,
  metricsMinuteDays,
  verifiesRest,
  wfRoot,
  type Env,
} from './config.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import { names } from '../../test/assessed.ts';

/** A reader, the variable it reads, the values it refuses, and the value its refusal names as the fix. */
type Refused = [reader: (env: Env) => unknown, variable: string, values: readonly string[], fix: string];

test('REFUSED at shipped defaults: each WF_ variable set to what it does not take, by name, exit 2, naming the fix', async (t) => {
  const rows: Record<string, Refused> = {
    'WF_ROOT not an absolute path — relative, dotted, or empty': [wfRoot, 'WF_ROOT', ['relative/store', './x', ''], 'WF_ROOT=/srv/wf'],
    'WF_MAX_CONCURRENT not a whole number from 1 — negative, zero, a fraction, a word, hex, an exponent': [
      maxConcurrent,
      'WF_MAX_CONCURRENT',
      ['-3', '0', '00', '1.5', 'two', '0x2', '1e3', '2 sessions'],
      'WF_MAX_CONCURRENT=4',
    ],
    'WF_MAX_RUNS not a whole count — a word, a negative, a fraction, a unit, hex, an exponent': [
      maxRuns,
      'WF_MAX_RUNS',
      ['two', '-1', '1.5', '2 runs', '0x2', '1e3'],
      'WF_MAX_RUNS=2',
    ],
    'WF_VERIFY_REST neither 1 nor 0 — a word, true, 2, a padded 1': [
      verifiesRest,
      'WF_VERIFY_REST',
      ['yes', 'true', '2', ' 1'],
      'WF_VERIFY_REST=1',
    ],
    'WF_KEEP_WORKTREES neither 1 nor 0': [keepsWorktrees, 'WF_KEEP_WORKTREES', ['yes', 'true', '2', ' 1'], 'WF_KEEP_WORKTREES=1'],
    'WF_METRICS_MINUTE_DAYS below 2 or not a whole number': [
      metricsMinuteDays,
      'WF_METRICS_MINUTE_DAYS',
      ['1', 'x', '-3', '0', '2.5'],
      'WF_METRICS_MINUTE_DAYS=30',
    ],
    'WF_METRICS_HOUR_DAYS not a whole number from 1': [
      metricsHourDays,
      'WF_METRICS_HOUR_DAYS',
      ['abc', '0', '-1'],
      'WF_METRICS_HOUR_DAYS=365',
    ],
  };
  for (const [name, [read, variable, values, fix]] of Object.entries(rows))
    await t.test(name, () => {
      for (const value of values)
        assert.throws(
          () => read({ [variable]: value }),
          (err: unknown) => {
            assert.ok(err instanceof Invalid, String(err));
            assert.equal(err.exitCode, 2);
            names(err.message, `${variable}=${value} `, fix);
            return true;
          },
          JSON.stringify(value),
        );
    });
});

test('each WF_ variable reads its default unset, empty or blank, and the values it takes', async (t) => {
  const home = path.join(os.homedir(), '.agent-workflows');
  const rows: Array<[string, () => unknown, unknown]> = [
    [
      'unset: the home store, 2 sessions per pool, no cap on runs, no full judgement at rest',
      () => [wfRoot({}), maxConcurrent({}), maxRuns({}), verifiesRest({})],
      [home, 2, 0, false],
    ],
    [
      'set to undefined reads as unset',
      () => [wfRoot({ WF_ROOT: undefined }), maxConcurrent({ WF_MAX_CONCURRENT: undefined }), maxRuns({ WF_MAX_RUNS: undefined })],
      [home, 2, 0],
    ],
    [
      'empty or blank, a count reads its default, and WF_VERIFY_REST empty is off (WF_ROOT empty is refused, never the home store)',
      () => [
        maxConcurrent({ WF_MAX_CONCURRENT: '' }),
        maxConcurrent({ WF_MAX_CONCURRENT: '  ' }),
        maxRuns({ WF_MAX_RUNS: '' }),
        verifiesRest({ WF_VERIFY_REST: '' }),
      ],
      [2, 2, 0, false],
    ],
    ['WF_ROOT an absolute path', () => wfRoot({ WF_ROOT: '/srv/wf' }), '/srv/wf'],
    [
      'WF_MAX_CONCURRENT a whole number from 1, padded or not',
      () => ['1', '3', ' 3 ', '50', '07'].map((value) => maxConcurrent({ WF_MAX_CONCURRENT: value })),
      [1, 3, 3, 50, 7],
    ],
    ['WF_MAX_RUNS a whole count', () => ['  ', '0', '2', ' 3 '].map((value) => maxRuns({ WF_MAX_RUNS: value })), [0, 0, 2, 3]],
    ['WF_VERIFY_REST 1 or 0', () => ['1', '0'].map((value) => verifiesRest({ WF_VERIFY_REST: value })), [true, false]],
    [
      'WF_KEEP_WORKTREES: 1 keeps the worktrees, and 0, empty or unset frees them',
      () => [{ WF_KEEP_WORKTREES: '1' }, { WF_KEEP_WORKTREES: '0' }, { WF_KEEP_WORKTREES: '' }, {}].map((env) => keepsWorktrees(env)),
      [true, false, false, false],
    ],
    [
      'the series keep 30 days of minutes when unset, and the days a value names',
      () => [
        metricsMinuteDays({}),
        metricsMinuteDays({ WF_METRICS_MINUTE_DAYS: '2' }),
        metricsMinuteDays({ WF_METRICS_MINUTE_DAYS: ' 45 ' }),
      ],
      [30, 2, 45],
    ],
    [
      'the series keep every hour when unset, and the days a value names',
      () => [metricsHourDays({}), metricsHourDays({ WF_METRICS_HOUR_DAYS: '1' }), metricsHourDays({ WF_METRICS_HOUR_DAYS: '400' })],
      [undefined, 1, 400],
    ],
  ];
  for (const [name, got, want] of rows) await t.test(name, () => assert.deepEqual(got(), want));

  await t.test('a reader given nothing reads the process environment when it is called, not when the module loaded', (sub) => {
    const was = process.env.WF_MAX_CONCURRENT;
    sub.after(() => {
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
});
