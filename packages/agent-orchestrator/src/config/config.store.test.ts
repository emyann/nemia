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
  cgroupParent,
  exposedStore,
  keepsWorktrees,
  maxConcurrent,
  maxRuns,
  memoryLimit,
  memoryRequest,
  memoryReserved,
  metricsHourDays,
  metricsMinuteDays,
  releaseCheck,
  settingsOf,
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
    'WF_MEMORY_LIMIT not a quantity the runtime reads — a spaced unit, a lower-case one, an exponent, thousandths, a fraction, zero': [
      memoryLimit,
      'WF_MEMORY_LIMIT',
      ['8 GB', '8gb', '129e6', '100m', '1.5Gi', '0', '-1Gi', 'lots'],
      'WF_MEMORY_LIMIT=8Gi',
    ],
    'WF_MEMORY_REQUEST not a quantity the runtime reads — a spaced unit, a lower-case one, a fraction, zero': [
      memoryRequest,
      'WF_MEMORY_REQUEST',
      ['2.5 GiB', '2gb', '1.5Gi', '0', 'lots'],
      'WF_MEMORY_REQUEST=2560Mi',
    ],
    'WF_MEMORY_RESERVED not a quantity the runtime reads — a spaced unit, a lower-case one, a fraction, zero': [
      memoryReserved,
      'WF_MEMORY_RESERVED',
      ['2 GiB', '2gb', '1.5Gi', '0', 'lots'],
      'WF_MEMORY_RESERVED=2Gi',
    ],
    'WF_CGROUP_PARENT not a slice — a path, a scope, a bare name, an escape': [
      cgroupParent,
      'WF_CGROUP_PARENT',
      ['/sys/fs/cgroup/x', 'run.scope', 'sessions', 'a/b.slice', '.slice', 'a b.slice'],
      'WF_CGROUP_PARENT=sessions.slice',
    ],
    'NEMIA_RELEASE_CHECK neither on nor off': [releaseCheck, 'NEMIA_RELEASE_CHECK', ['0', 'no', 'OFF', ' off'], 'NEMIA_RELEASE_CHECK=off'],
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

test('REFUSED: WF_MEMORY_REQUEST above WF_MEMORY_LIMIT, which no session could be admitted under, exit 2, naming both', () => {
  for (const env of [
    { WF_MEMORY_REQUEST: '9Gi', WF_MEMORY_LIMIT: '8Gi' },
    { WF_MEMORY_REQUEST: '8193Mi', WF_MEMORY_LIMIT: '8Gi' },
  ])
    assert.throws(
      () => memoryRequest(env),
      (err: unknown) => {
        assert.ok(err instanceof Invalid, String(err));
        assert.equal(err.exitCode, 2);
        names(err.message, `WF_MEMORY_REQUEST=${env.WF_MEMORY_REQUEST} `, 'WF_MEMORY_LIMIT');
        return true;
      },
      JSON.stringify(env),
    );
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
      'WF_EXPOSED: 1 marks the store exposed, and anything else, unset among them, leaves it not',
      () => [{ WF_EXPOSED: '1' }, { WF_EXPOSED: '0' }, { WF_EXPOSED: '' }, { WF_EXPOSED: 'yes' }, {}].map((env) => exposedStore(env)),
      [true, false, false, false, false],
    ],
    [
      'NEMIA_RELEASE_CHECK: off turns the release check off; on, empty or unset leaves it on',
      () =>
        [{ NEMIA_RELEASE_CHECK: 'off' }, { NEMIA_RELEASE_CHECK: 'on' }, { NEMIA_RELEASE_CHECK: '' }, {}].map((env) => releaseCheck(env)),
      [false, true, true, true],
    ],
    [
      'the settings carry the release check',
      () => [settingsOf({ NEMIA_RELEASE_CHECK: 'off' }).releaseCheck, settingsOf({}).releaseCheck],
      [false, true],
    ],
    ['the settings carry it as exposed', () => [settingsOf({ WF_EXPOSED: '1' }).exposed, settingsOf({}).exposed], [true, false]],
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
    [
      'WF_MEMORY_LIMIT and WF_CGROUP_PARENT: unset, empty or blank, no limit and no slice',
      () => [
        memoryLimit({}),
        memoryLimit({ WF_MEMORY_LIMIT: '' }),
        memoryLimit({ WF_MEMORY_LIMIT: '  ' }),
        cgroupParent({}),
        cgroupParent({ WF_CGROUP_PARENT: '' }),
      ],
      [undefined, undefined, undefined, undefined, undefined],
    ],
    [
      'WF_MEMORY_LIMIT a quantity, as written, padding trimmed',
      () => ['8Gi', '512Mi', ' 4G ', '1073741824'].map((value) => memoryLimit({ WF_MEMORY_LIMIT: value })),
      ['8Gi', '512Mi', '4G', '1073741824'],
    ],
    [
      'WF_MEMORY_REQUEST and WF_MEMORY_RESERVED: unset, empty or blank, none — each session asks its limit, and the floor is the default',
      () => [
        memoryRequest({}),
        memoryRequest({ WF_MEMORY_REQUEST: '' }),
        memoryRequest({ WF_MEMORY_REQUEST: '  ' }),
        memoryReserved({}),
        memoryReserved({ WF_MEMORY_RESERVED: ' ' }),
      ],
      [undefined, undefined, undefined, undefined, undefined],
    ],
    [
      'WF_MEMORY_REQUEST a quantity, as written, padding trimmed, at or under WF_MEMORY_LIMIT where it is set',
      () => [
        memoryRequest({ WF_MEMORY_REQUEST: ' 2560Mi ' }),
        memoryRequest({ WF_MEMORY_REQUEST: '8Gi', WF_MEMORY_LIMIT: '8Gi' }),
        memoryRequest({ WF_MEMORY_REQUEST: '2Gi', WF_MEMORY_LIMIT: '7782Mi' }),
      ],
      ['2560Mi', '8Gi', '2Gi'],
    ],
    ['WF_MEMORY_RESERVED a quantity, as written, padding trimmed', () => memoryReserved({ WF_MEMORY_RESERVED: ' 2Gi ' }), '2Gi'],
    [
      'the settings carry the request and the floor',
      () => {
        const set = settingsOf({ WF_MEMORY_REQUEST: '2560Mi', WF_MEMORY_RESERVED: '2Gi' });
        return [set.memoryRequest, set.memoryReserved, settingsOf({}).memoryRequest, settingsOf({}).memoryReserved];
      },
      ['2560Mi', '2Gi', undefined, undefined],
    ],
    [
      'WF_CGROUP_PARENT a slice name, as written',
      () => ['sessions.slice', 'agents.slice', 'a-b.slice'].map((value) => cgroupParent({ WF_CGROUP_PARENT: value })),
      ['sessions.slice', 'agents.slice', 'a-b.slice'],
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
    assert.equal(maxConcurrent(process.env), 7);
    process.env.WF_MAX_CONCURRENT = '-3';
    assert.throws(
      () => maxConcurrent(process.env),
      (err: unknown) => err instanceof Invalid && err.message.startsWith('WF_MAX_CONCURRENT=-3 '),
    );
  });
});
