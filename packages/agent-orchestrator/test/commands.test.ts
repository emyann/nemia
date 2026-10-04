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
      ['ls', { method: 'GET', path: '/api/runs', status: 200 }],
      ['decide', { method: 'GET', path: '/api/runs/:runId/decision', status: 200 }],
      ['ceilings', { method: 'GET', path: '/api/ceilings', status: 200 }],
      ['agents', { method: 'GET', path: '/api/agents', status: 200 }],
      ['agents card', { method: 'GET', path: '/api/agents/:from/:name/card', status: 200 }],
    ],
  );
});

test('every command the api posts writes, and the api guards it; the five it gets write nothing', () => {
  assert.deepEqual(
    COMMANDS.filter((c) => !c.writes).map((c) => c.name),
    ['ls', 'decide', 'ceilings', 'agents', 'agents card'],
  );
  assert.deepEqual(
    COMMANDS.filter((c) => c.writes !== (c.route?.method === 'POST')).map((c) => c.name),
    [],
  );
});
