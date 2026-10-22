/**
 * `nemia show`, `nemia logs` and `nemia stats` as entries of the table: what each refuses of a command line before anything is read,
 * each matched by the facts it names and the fix it gives, and how `nemia stats` prints what it read.
 *
 * `WF_ROOT` is set before the import, since the store's modules read it as they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scratch } from '../../test/scratch.ts';
import { statsLine, statsLines } from '../stats/index.ts';
import { statsOf } from '../stats/stats.ts';
import { parseArgv, type CommandSpec } from './command.ts';

process.env.WF_ROOT = scratch('wf-reads-');
const { LOGS, SHOW, STATS } = await import('./reads.verb.ts');

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

/** That `command` refuses `argv` (exit 2 where it throws), naming each of `tokens`: what it refused and the fix it gives. */
function refusesNaming(command: CommandSpec, argv: readonly string[], ...tokens: string[]): void {
  const said = refusedBy(command, argv);
  assert.ok(said !== null && tokens.every((token) => said.includes(token)), `${argv.join(' ')}: ${said}`);
}

test('nemia show takes one run and nemia logs one run and one step, and each refuses a word more by naming it', () => {
  assert.equal(refusedBy(SHOW, ['r']), null);
  assert.equal(refusedBy(SHOW, ['--x']), "nemia show takes one run's id: not --x.");
  assert.equal(refusedBy(SHOW, ['r', 'extra']), "nemia show takes one run's id: not extra.");
  assert.equal(refusedBy(LOGS, ['r', 's']), null);
  refusesNaming(LOGS, ['r', 's', 'extra'], 'nemia logs', "one run's id and one step's name", 'not extra.');
  refusesNaming(LOGS, ['r', 's', '--tail'], 'nemia logs', "one run's id and one step's name", 'not --tail.');
});

test('nemia stats refuses a value left out, empty or given as a flag in what the flag takes', () => {
  const from = '--from takes a day, YYYY-MM-DD in UTC: the first day counted';
  assert.equal(refusedBy(STATS, ['--from']), from);
  assert.equal(refusedBy(STATS, ['--from', '--to']), from);
  assert.equal(refusedBy(STATS, ['--from', '--to', '2026-09-30']), from);
  assert.equal(refusedBy(STATS, ['--from', '']), from);
  assert.equal(refusedBy(STATS, ['--agent=']), "--agent takes an agent's name: only the steps it fills");
  refusesNaming(STATS, ['--by=--line'], '--by', 'agent, step, factory, workflow, repo');
});

test('nemia stats refuses a flag given twice, and one it does not take, by name', () => {
  assert.equal(refusedBy(STATS, ['--by', 'agent', '--by', 'step']), 'nemia stats takes --by once.');
  assert.equal(refusedBy(STATS, ['--line', '--line']), null);
  const flags = ['--from', '--to', '--by', '--agent', '--step', '--factory', '--workflow', '--repo', '--line', '--json'];
  refusesNaming(STATS, ['--nope'], 'nemia stats does not take --nope.', ...flags);
  refusesNaming(STATS, ['stray'], 'nemia stats does not take stray.', ...flags);
});

test("nemia stats refuses what the query does not take in its flags' names: a key, a day, and days out of order", () => {
  refusesNaming(STATS, ['--by', 'colour'], '--by', 'agent, step, factory, workflow, repo', 'not "colour"');
  refusesNaming(STATS, ['--to', '2026-13-40'], '--to', 'YYYY-MM-DD', 'UTC', 'not "2026-13-40"');
  refusesNaming(STATS, ['--from', '2026-09-30', '--to', '2026-09-01'], '--from 2026-09-30', '--to 2026-09-01', 'earlier day first');
  assert.equal(refusedBy(STATS, ['--from', '2026-09-01', '--to', '2026-09-30', '--by', 'agent', '--repo', '/r']), null);
});

test('nemia stats prints JSON with --json, one line with --line, and its tiles and rows with neither', () => {
  const s = statsOf({ tries: [], runs: [], frozen: [] }, {}, new Date('2026-10-04T12:00:00Z'));
  assert.deepEqual(STATS.print?.(s, { json: true }), [JSON.stringify(s, null, 2)]);
  assert.deepEqual(STATS.print?.(s, { line: true }), [statsLine(s)]);
  assert.deepEqual(STATS.print?.(s, {}), statsLines(s));
});
