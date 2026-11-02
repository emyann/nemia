/**
 * The run's command lines (`runLines`): the run's own two and each frozen step's three, each built off the table (`COMMANDS`) through
 * `commandLine`, and where the run came from, null for a run started from no card.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideLine, refreshLine, runLines } from './lines.verb.ts';
import { commandLine } from '../command/command.ts';
import { COMMANDS } from '../command/commands.verb.ts';
import { aRun } from '../../test/run-walks.ts';

/** The table's entry named `name`. */
const entry = (name: string) => {
  const found = COMMANDS.find((c) => c.name === name);
  assert.ok(found, `the table has a ${name}`);
  return found;
};

test("runLines answers each frozen step's approve, retry and say, and the run's decide and refresh, off the table", () => {
  const run = {
    ...aRun('r-lines'),
    workflow: [
      { name: 'a', after: [], body: 'do it', harness: 'claude' as const },
      { name: 'b', after: ['a'], body: 'read it', harness: 'claude' as const },
    ],
    steps: { a: { taskId: null }, b: { taskId: null } },
  };
  const lines = runLines(run);
  assert.deepEqual(Object.keys(lines.steps), ['a', 'b']);
  for (const step of ['a', 'b']) {
    assert.deepEqual(lines.steps[step], {
      approve: commandLine(entry('approve'), { runId: 'r-lines', step }),
      retry: commandLine(entry('retry'), { runId: 'r-lines', step }),
      say: commandLine(entry('say'), { runId: 'r-lines', step }),
    });
  }
  assert.equal(lines.decide, commandLine(entry('decide'), { runId: 'r-lines' }));
  assert.equal(lines.decide, decideLine('r-lines'));
  assert.equal(lines.refresh, refreshLine('r-lines'));
  assert.match(lines.refresh, /refresh r-lines$/);
  assert.equal(lines.fromNote, null);
});

test('runLines says the card a run was started from', () => {
  const lines = runLines({ ...aRun('r-from'), from: { inbox: 'card-1' } });
  assert.equal(lines.fromNote, 'from inbox card card-1');
  assert.deepEqual(Object.keys(lines.steps), ['implement', 'review']);
});
