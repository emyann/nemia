/**
 * The shipped command table: no rule of the table broken against the CLI's own verbs, and each command on the api's path, method and
 * status of today.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS, commandBreaks } from '../src/runner.ts';
import { VERBS } from '../src/cli/main.ts';

test('the shipped table breaks none of its rules against the CLI’s verbs', () => {
  assert.deepEqual(commandBreaks(COMMANDS, [...VERBS.keys()]), []);
});

test('each command is served on the api where it was before the table', () => {
  assert.deepEqual(
    COMMANDS.map((c) => [c.name, c.route]),
    [
      ['retry', { method: 'POST', path: '/api/runs/:runId/steps/:step/retry', status: 202 }],
      ['approve', { method: 'POST', path: '/api/runs/:runId/steps/:step/approve', status: 202 }],
      ['round', { method: 'POST', path: '/api/runs/:runId/round', status: 202 }],
      ['accept', { method: 'POST', path: '/api/runs/:runId/steps/:step/accept', status: 202 }],
      ['say', { method: 'POST', path: '/api/runs/:runId/steps/:step/say', status: 202 }],
    ],
  );
});

test('every command writes, and the api guards it', () => {
  assert.deepEqual(
    COMMANDS.filter((c) => !c.writes).map((c) => c.name),
    [],
  );
});
