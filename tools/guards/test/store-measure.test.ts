/**
 * The store's measure (`tools/store-measure/`): what it refuses to be called with, the copy it measures on — never the store itself,
 * never a destination inside it, and without the checkouts — the place that answers its reads and refuses every write, the fence that
 * makes it refuse itself where a read spawns anything but a read of git or writes outside its copy, and the report it writes on an
 * empty store: every measure's key, with no run counted.
 *
 * The usage refusals, the refused destination and the empty store's report spawn `report.ts` in a child of its own, under a timeout;
 * the rest are its functions, called here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { argsOf, MEASURES, type StoreMeasure } from '../../store-measure/report.ts';
import { copyStore, destinationRefusal, gitVerdict, installFence, LEFT_OUT, readOnlyPlace } from '../../store-measure/fence.ts';
import type { Place } from 'agent-orchestrator';

const REPORT = path.join(import.meta.dirname, '..', '..', 'store-measure', 'report.ts');

/** `report.ts` run with `args`, under a bound, in an environment of the test's own: no collector, and a home of its own. */
const report = (args: string[], env: NodeJS.ProcessEnv = {}, gc = true) => {
  const { OTEL_EXPORTER_OTLP_ENDPOINT: _otlp, WF_ROOT: _wf, AE_ROOT: _ae, ...rest } = process.env;
  return spawnSync(process.execPath, [...(gc ? ['--expose-gc'] : []), REPORT, ...args], {
    encoding: 'utf8',
    timeout: 240_000,
    killSignal: 'SIGKILL',
    env: { ...rest, HOME: scratch('store-measure-home-'), ...env },
  });
};

test('the measure refuses what it cannot be called with, exit 2, before it copies anything', () => {
  for (const args of [
    ['--bogus'],
    ['stray'],
    ['--repeat'],
    ['--repeat', '0'],
    ['--repeat', 'x'],
    ['--json'],
    ['--from', path.join(scratch('store-measure-none-'), 'not-there')],
  ])
    assert.equal(typeof argsOf(args, {}), 'string', `refused: ${args.join(' ')}`);
  const from = scratch('store-measure-from-');
  const engine = scratch('store-measure-engine-');
  assert.deepEqual(argsOf(['--from', from, '--engine', engine, '--repeat', '3', '--json', 'out.json'], {}), {
    from,
    engine,
    repeat: 3,
    json: path.resolve('out.json'),
    compare: undefined,
  });
  assert.deepEqual(argsOf([], { WF_ROOT: from, AE_ROOT: from, HOME: '/nowhere' }), {
    from,
    engine: from,
    repeat: 5,
    json: undefined,
    compare: undefined,
  });
  assert.equal(report(['--bogus']).status, 2, 'an unknown flag');
  assert.equal(report(['--from', from], {}, false).status, 2, 'a heap measured with no collection to measure it after');
});

test('a destination inside a store the measure copies is refused, exit 2, and nothing is copied into it', () => {
  const from = scratch('store-measure-src-');
  assert.equal(typeof destinationRefusal(path.join(from, 'tmp', 'copy'), [from]), 'string');
  assert.equal(typeof destinationRefusal(from, [from]), 'string');
  assert.equal(destinationRefusal(scratch('store-measure-dst-'), [from]), undefined);
  const inside = path.join(from, 'tmp');
  fs.mkdirSync(inside);
  const engine = scratch('store-measure-ae-');
  const ran = report(['--from', from, '--engine', engine, '--repeat', '1'], { TMPDIR: inside });
  assert.equal(ran.status, 2, 'its temp folder is inside --from');
  assert.deepEqual(fs.readdirSync(inside), [], 'nothing was copied');
});

test('the copy leaves the checkouts, the logs, the daemon file and the holder token out, and keeps what the reads read', () => {
  const from = scratch('store-measure-store-');
  const plant = (file: string, text = 'x') => {
    fs.mkdirSync(path.dirname(path.join(from, file)), { recursive: true });
    fs.writeFileSync(path.join(from, file), text);
  };
  for (const file of [
    'worktrees/r-1/implement/a.ts',
    'runs/r-1.json',
    'runs/r-1/artifacts/a.md',
    'engine/tasks/t-1.jsonl',
    'engine/a2a/holder-token',
    'daemon.json',
    'api.log',
    'feed.jsonl',
  ])
    plant(file);
  const to = path.join(scratch('store-measure-copy-'), 'wf');
  const copied = copyStore(from, to);
  for (const kept of ['runs/r-1.json', 'runs/r-1/artifacts/a.md', 'engine/tasks/t-1.jsonl', 'feed.jsonl'])
    assert.ok(fs.existsSync(path.join(to, kept)), `kept ${kept}`);
  for (const out of ['worktrees', 'engine/a2a', 'daemon.json', 'api.log']) assert.ok(!fs.existsSync(path.join(to, out)), `left ${out} out`);
  assert.ok(LEFT_OUT.some((l) => l.path === 'worktrees'));
  assert.equal(copied.files, 4);
  assert.deepEqual([...copied.leftOut].sort(), ['api.log', 'daemon.json', 'engine/a2a', 'worktrees']);
});

test('the place the measure reads through answers a read and refuses a write, never asking the place under it', () => {
  const asked: string[] = [];
  const under: Place = {
    declared: { say: 'a planted place' } as unknown as Place['declared'],
    ask: () => {
      throw new Error('the planted place is asked off the loop');
    },
    askNow: ((verb: string) => {
      asked.push(verb);
      return { answer: { heads: {}, branches: [] } };
    }) as Place['askNow'],
  };
  const place = readOnlyPlace(under);
  for (const verb of ['make', 'land', 'remove', 'handoff', 'open', 'export', 'seal'] as const)
    assert.ok('refused' in place.askNow(verb, {} as never), `${verb} refused`);
  assert.deepEqual(asked, [], 'no write reached the place under it');
  assert.ok('answer' in place.askNow('standing', {} as never));
  assert.deepEqual(asked, ['standing']);
});

test("the fence tells git's reads from its writes, refuses a spawn but git's reads on a pass, and a write outside the copy", () => {
  for (const args of [
    ['-C', '/r', 'merge-tree', '--write-tree', 'a', 'b'],
    ['for-each-ref', 'refs/heads'],
    ['rev-parse', 'HEAD'],
    ['-c', 'core.quotePath=false', 'diff', '--name-only', 'a...b'],
    ['branch', '--list', 'wf/*'],
    ['worktree', 'list', '--porcelain'],
    ['config', '--get', 'user.name'],
  ])
    assert.equal(gitVerdict(args), 'read', args.join(' '));
  for (const args of [
    ['worktree', 'add', '/w', 'b'],
    ['push'],
    ['branch', '-D', 'x'],
    ['merge', 'b'],
    ['commit', '-m', 'x'],
    ['update-ref', 'refs/heads/x', 'a'],
    ['config', 'user.name', 'x'],
    ['-C', '/r', 'checkout', 'b'],
  ])
    assert.equal(gitVerdict(args), 'write', args.join(' '));
  const copy = scratch('store-measure-fenced-');
  const outside = path.join(scratch('store-measure-outside-'), 'planted');
  const fence = installFence([copy]);
  try {
    fence.arm('pass');
    assert.throws(() => spawnSync('true'), 'a spawn of anything but git on a pass');
    assert.throws(() => spawnSync('git', ['worktree', 'add', '/w']), 'a git write');
    assert.equal(spawnSync('git', ['--version']).status, 0, "a read of git's");
    fs.writeFileSync(path.join(copy, 'in-the-copy'), 'x');
    assert.throws(() => fs.writeFileSync(outside, 'x'), 'a write outside the copy');
    fence.arm('read');
    assert.equal(spawnSync('true').status, 0, 'a read may spawn what it reads with');
    fence.disarm();
  } finally {
    fence.uninstall();
  }
  assert.ok(!fs.existsSync(outside));
  assert.equal(fence.refusals.length, 3);
  assert.deepEqual(
    fence.refusals.map((r) => r.kind),
    ['spawn', 'spawn', 'write'],
  );
  assert.ok(fence.spawned.some((s) => s.verdict === 'other' && s.on === 'read'));
  fs.writeFileSync(outside, 'x');
});

test('on an empty store the report counts no run and holds every measure, the machine, the commit and the date', () => {
  const from = scratch('store-measure-empty-wf-');
  const engine = scratch('store-measure-empty-ae-');
  const json = path.join(scratch('store-measure-out-'), 'report.json');
  const ran = report(['--from', from, '--engine', engine, '--repeat', '1', '--json', json]);
  assert.equal(ran.status, 0, ran.stderr);
  const written = JSON.parse(fs.readFileSync(json, 'utf8')) as StoreMeasure;
  assert.equal(written.counts.runs, 0);
  assert.equal(written.counts.tasks, 0);
  assert.equal(written.counts.invariantRefusals, null, 'not wired until the Run model is');
  assert.deepEqual(Object.keys(written.measures).sort(), [...MEASURES].sort());
  for (const key of ['cpu', 'cores', 'memoryBytes', 'node']) assert.ok(key in written.machine, key);
  assert.match(written.commit, /^[0-9a-f]{40}$/);
  assert.ok(Number.isFinite(Date.parse(written.date)));
  for (const key of ['tickPass', 'runList', 'stats'] as const) {
    const measured = written.measures[key];
    assert.ok(measured !== null && Number.isFinite(measured.cold.ms) && Number.isFinite(measured.warm.ms), key);
  }
  assert.equal(written.measures.finishedRun, null, 'no finished run to read');
  assert.equal(written.measures.openRun, null, 'no open run to read');
  assert.deepEqual(written.refusals, []);
  assert.deepEqual(fs.readdirSync(from), [], 'the store itself was not written');
});
