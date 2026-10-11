/**
 * `nemia show`, `nemia logs`, `nemia feed` and `nemia stats` as entries of the table: what each refuses of a command line before anything
 * is read, matched whole in the words `nemia` has always said them; what `nemia feed` reads of a store of its own, and how it and `nemia
 * stats` print it.
 *
 * `WF_ROOT` is set before the import, since the store's modules read it as they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { cursorTakes, feedLineWords, type FeedLine } from '../feed/feed.ts';
import { pausedWords } from '../pause/pause.ts';

/** The store's pause as read while none stands. */
const NONE = { pause: null, finishing: [], staged: [], held: [] };
import { statsLine, statsLines } from '../stats/index.ts';
import { statsOf } from '../stats/stats.ts';
import { parseArgv, type CommandSpec } from './command.ts';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runOver } from '../../test/placed.ts';

const ROOT = scratch('wf-reads-');
process.env.WF_ROOT = ROOT;
const { FEED, LOGS, SHOW, STATS } = await import('./reads.verb.ts');
const { resumePause, putPause } = await import('../pause/pause.store.ts');
const { engineOf, runWith: runEngine } = await import('../runtime-client.ts');
const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
const runWith = runOver(runEngine, () => stand().layer);

/** What `command` refuses of `argv` before anything is read, its parser's words or its check's; null where it takes it. */
function refusedBy(command: CommandSpec, argv: readonly string[]): string | null {
  try {
    const args = parseArgv(command.spec, argv);
    assert.ok(args, `nemia ${command.name} ${argv.join(' ')} is given too little`);
    return command.check?.(args) ?? null;
  } catch (err) {
    assert.equal((err as { exitCode?: number }).exitCode, 2);
    return (err as Error).message;
  }
}

test('nemia feed takes one cursor of digits or none, and refuses anything else with what a cursor is', () => {
  assert.equal(refusedBy(FEED, []), null);
  assert.equal(refusedBy(FEED, ['12']), null);
  for (const argv of [['1', '2'], ['--x'], ['-5'], ['a'], ['1.5']]) {
    assert.equal(refusedBy(FEED, argv), cursorTakes('feed'), `nemia feed ${argv.join(' ')}`);
  }
});

test('nemia show takes one run and nemia logs one run and one step, and each refuses a word more by naming it', () => {
  assert.equal(refusedBy(SHOW, ['r']), null);
  assert.equal(refusedBy(SHOW, ['--x']), "nemia show takes one run's id: not --x.");
  assert.equal(refusedBy(SHOW, ['r', 'extra']), "nemia show takes one run's id: not extra.");
  assert.equal(refusedBy(LOGS, ['r', 's']), null);
  assert.equal(refusedBy(LOGS, ['r', 's', 'extra']), "nemia logs takes one run's id and one step's name: not extra.");
  assert.equal(refusedBy(LOGS, ['r', 's', '--tail']), "nemia logs takes one run's id and one step's name: not --tail.");
});

test('nemia stats refuses a value left out, empty or given as a flag in what the flag takes', () => {
  const from = '--from takes a day, YYYY-MM-DD in UTC: the first day counted';
  assert.equal(refusedBy(STATS, ['--from']), from);
  assert.equal(refusedBy(STATS, ['--from', '--to']), from);
  assert.equal(refusedBy(STATS, ['--from', '--to', '2026-09-30']), from);
  assert.equal(refusedBy(STATS, ['--from', '']), from);
  assert.equal(refusedBy(STATS, ['--agent=']), "--agent takes an agent's name: only the steps it fills");
  assert.equal(refusedBy(STATS, ['--by=--line']), '--by takes what the rows go by: agent, step, factory, workflow, repo');
});

test('nemia stats refuses a flag given twice, and one it does not take, by name', () => {
  assert.equal(refusedBy(STATS, ['--by', 'agent', '--by', 'step']), 'nemia stats takes --by once.');
  assert.equal(refusedBy(STATS, ['--line', '--line']), null);
  assert.equal(
    refusedBy(STATS, ['--nope']),
    'nemia stats does not take --nope. It takes --from, --to, --by, --agent, --step, --factory, --workflow, --repo, and --line or --json.',
  );
  assert.equal(
    refusedBy(STATS, ['stray']),
    'nemia stats does not take stray. It takes --from, --to, --by, --agent, --step, --factory, --workflow, --repo, and --line or --json.',
  );
});

test("nemia stats refuses what the query does not take in its flags' names: a key, a day, and days out of order", () => {
  assert.equal(refusedBy(STATS, ['--by', 'colour']), '--by takes one of agent, step, factory, workflow, repo, not "colour".');
  assert.equal(refusedBy(STATS, ['--to', '2026-13-40']), '--to takes a day as YYYY-MM-DD, in UTC, such as 2026-09-30 — not "2026-13-40".');
  assert.equal(
    refusedBy(STATS, ['--from', '2026-09-30', '--to', '2026-09-01']),
    '--from 2026-09-30 is after --to 2026-09-01: give the earlier day first.',
  );
  assert.equal(refusedBy(STATS, ['--from', '2026-09-01', '--to', '2026-09-30', '--by', 'agent', '--repo', '/r']), null);
});

test('nemia stats prints JSON with --json, one line with --line, and its tiles and rows with neither', () => {
  const s = statsOf({ tries: [], runs: [], frozen: [] }, {}, new Date('2026-10-04T12:00:00Z'));
  assert.deepEqual(STATS.print?.(s, { json: true }), [JSON.stringify(s, null, 2)]);
  assert.deepEqual(STATS.print?.(s, { line: true }), [statsLine(s)]);
  assert.deepEqual(STATS.print?.(s, {}), statsLines(s));
});

test("nemia feed reads the store's feed from a cursor, and prints the pause first while one stands, then the lines and the cursor", async () => {
  const first: FeedLine = { at: '2026-10-04T12:00:00.000Z', run: 'r-1', word: 'running' };
  const second: FeedLine = { at: '2026-10-04T12:01:00.000Z', run: 'r-1', step: 'implement', word: 'succeeded' };
  const head = `${JSON.stringify(first)}\n`;
  const whole = `${head}${JSON.stringify(second)}\n`;
  fs.writeFileSync(path.join(ROOT, 'feed.jsonl'), whole);
  const end = Buffer.byteLength(whole);
  const e = engineOf(engine().layer);

  assert.deepEqual(await runWith(e, FEED.handler({})), { lines: [first, second], cursor: end, pause: NONE });
  const after = await runWith(e, FEED.handler({ cursor: String(Buffer.byteLength(head)) }));
  assert.deepEqual(after, { lines: [second], cursor: end, pause: NONE });
  assert.deepEqual(FEED.print(after, {}), [feedLineWords(second), `cursor: ${end}`]);

  const pause = putPause({ why: 'merging by hand', by: 'ann' });
  try {
    const paused = await runWith(e, FEED.handler({ cursor: String(Buffer.byteLength(head)) }));
    assert.deepEqual(FEED.print(paused, {}), [
      pausedWords({ pause, finishing: [], staged: [], held: [] }),
      feedLineWords(second),
      `cursor: ${end}`,
    ]);
  } finally {
    resumePause();
  }
});
