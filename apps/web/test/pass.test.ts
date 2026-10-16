/**
 * What the last pass cost, as the Factory says it beside the cap (`lib/pass.ts`): the line, and the breakdown in its title, worded as
 * `nemia up --stats` words it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { PassCost } from '../src/lib/api.ts';
import { bytesWord, msWord, PASS_PHASES, passLine, passTitle, seenWords } from '../src/lib/pass.ts';
import { REPO } from './e2e/world.ts';
import { scratch } from './scratch.ts';

const phase = (ms: number, over: Partial<PassCost['phases']['act']> = {}) => ({ ms, calls: 1, bytes: 0, reads: 0, spawned: 0, ...over });

const PASS: PassCost = {
  at: '2026-09-25T10:00:00.000Z',
  ms: 212,
  records: 12,
  bytes: 812_000,
  spawned: 1,
  overheadMs: 0.4,
  rested: 0,
  phases: {
    records: phase(20, { calls: 12, bytes: 12_000, reads: 12 }),
    asks: phase(5),
    journals: phase(40, { calls: 30, bytes: 800_000 }),
    revisions: phase(6, { calls: 4 }),
    observe: phase(120, { spawned: 1 }),
    runtime: phase(8),
    place: phase(0, { calls: 0 }),
    assess: phase(15, { calls: 0 }),
    act: phase(3),
  },
  harnesses: { claude: { calls: 1, ms: 118, listed: 3, spawned: 1 }, check: { calls: 1, ms: 2, listed: 40, spawned: 0 } },
};

test("the line says what a pass takes, in the package's rounding", () => {
  assert.equal(passLine(PASS), 'a pass takes 212 ms');
  assert.equal(passLine({ ms: 38.24 }), 'a pass takes 38.2 ms');
  assert.equal(passLine({ ms: 4.216 }), 'a pass takes 4.22 ms');
  assert.equal(msWord(99.96), '100.0');
  assert.deepEqual([bytesWord(812), bytesWord(14_200), bytesWord(3_100_000)], ['812 B', '14.2 kB', '3.1 MB']);
});

test("the title is the breakdown: the pass, every phase in the package's order, each harness, and what measuring took", () => {
  const now = new Date('2026-09-25T10:05:00.000Z');
  const lines = passTitle(PASS, now, 'UTC').split('\n');
  assert.equal(lines[0], "The daemon's last pass, at 10:00 AM: 212 ms, 12 run records read, 812.0 kB read, 1 process started.");
  assert.deepEqual(
    lines.slice(1, 9).map((l) => l.split(':')[0]),
    [...PASS_PHASES],
  );
  assert.equal(lines[1], 'records: 20.0 ms, 12 calls, 12.0 kB read, 0 processes started');
  assert.equal(lines[4], 'observe: 120 ms, 1 call, 0 B read, 1 process started');
  assert.equal(lines[9], 'Observed, by harness (at once, so their times overlap):');
  assert.deepEqual(lines.slice(10, 12), [
    'check: 1 observe, 2.00 ms, 40 sessions or run files listed, 0 processes started',
    'claude: 1 observe, 118 ms, 3 sessions or run files listed, 1 process started',
  ]);
  assert.equal(lines.at(-1), 'Measuring it took 0.40 ms.');
  assert.ok(!lines.some((l) => l.startsWith('It saw')), 'a pass from before the tick said what it saw says nothing of it');
  assert.ok(passTitle({ ...PASS, harnesses: {} }, now, 'UTC').includes('\nNo harness was observed.\n'));
  assert.match(
    passTitle(PASS, new Date('2026-09-26T10:05:00.000Z'), 'UTC'),
    /^The daemon's last pass, at Fri 10:00 AM: /,
    'a pass of another day says its day',
  );
});

test('the title says what the pass saw, before what measuring took, where the pass says it', () => {
  const lines = passTitle({ ...PASS, runs: 43, tasks: 3, queued: 1, admitted: 2 }, new Date('2026-09-25T10:05:00.000Z'), 'UTC').split('\n');
  assert.deepEqual(lines.slice(-2), [
    'It saw 43 runs in the store, 3 tasks not settled, 1 queued and 2 admitted.',
    'Measuring it took 0.40 ms.',
  ]);
});

test('what a pass saw is said in words, one run in the singular', () => {
  assert.equal(
    seenWords({ runs: 1, tasks: 3, queued: 0, admitted: 2 }),
    '1 run in the store, 3 tasks not settled, 0 queued and 2 admitted',
  );
});

/**
 * The phases as the package words them: `nemia up --stats` over a store holding this pass, its CLI. The web imports nothing of the package,
 * and reaching into its `src` is refused (`packages/agent-orchestrator/test/contract.test.ts`), so it is asked as a person asks it. A phase
 * the package added is missing from this pass, which the package then does not read as one; a phase it dropped or moved is a row gone or
 * moved.
 */
function packagePhases(pass: PassCost): string[] {
  const store = scratch('web-pass-');
  fs.writeFileSync(path.join(store, 'tick-stats.json'), JSON.stringify(pass));
  const out = execFileSync(process.execPath, [path.join(REPO, 'packages', 'agent-orchestrator', 'bin', 'nemia.ts'), 'up', '--stats'], {
    env: { ...process.env, WF_ROOT: store },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const lines = out.split('\n');
  const head = lines.findIndex((l) => /^ {2}phase +ms +calls/.test(l));
  assert.ok(head > 0, `nemia up --stats read the pass as one: ${out}`);
  const rows = lines.slice(head + 1);
  return rows
    .slice(
      0,
      rows.findIndex((l) => !l.startsWith('  ')),
    )
    .map((l) => l.trim().split(/ +/)[0]);
}

test("the phases are the package's, in its order: a phase added there is drawn here", () => {
  assert.deepEqual(packagePhases(PASS), [...PASS_PHASES]);
});
