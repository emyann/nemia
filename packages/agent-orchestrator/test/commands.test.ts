/**
 * The shipped command table: no rule of the table broken against the CLI's own verbs and runners, and each command on the api's path,
 * method and status of today, or on the CLI alone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TABLE, commandBreaks, routeList, type Route } from '../src/runner.ts';
import { RUNS, VERBS } from '../src/cli/main.ts';

test('the shipped table breaks none of its rules against the CLI’s verbs and runners', () => {
  assert.deepEqual(commandBreaks(TABLE, [...VERBS.keys()], [...RUNS.keys()]), []);
});

/** A route as the pins say it: a route the api writes by hand (`hand`) marked so, its why left to the entry. */
const pinned = (r: Route) => (r.hand === undefined ? r : { ...r, hand: true });

test('each command is served on the api where it was before the table, the lift of a hold, a removal and a prune where their routes were', () => {
  assert.deepEqual(
    TABLE.map((c) => [c.name, Array.isArray(c.route) ? c.route.map(pinned) : c.route ? pinned(c.route as Route) : c.only?.side]),
    [
      ['start', { method: 'POST', path: '/api/runs', status: 201, hand: true }],
      ['plan', 'cli'],
      ['inbox', { method: 'GET', path: '/api/inbox', status: 200 }],
      ['inbox add', { method: 'POST', path: '/api/inbox', status: 201, hand: true }],
      [
        'inbox queue',
        [
          { method: 'POST', path: '/api/inbox/:name/queue', status: 200, sets: { off: false } },
          { method: 'DELETE', path: '/api/inbox/:name/queue', status: 200, sets: { off: true } },
        ],
      ],
      ['inbox rm', { method: 'DELETE', path: '/api/inbox/:name', status: 200 }],
      ['factory', { method: 'GET', path: '/api/factories', status: 200 }],
      ['factory ls', 'cli'],
      ['factory add', 'cli'],
      ['factory attach', 'cli'],
      ['factory detach', 'cli'],
      ['factory hire', 'cli'],
      ['factory fire', 'cli'],
      ['factory rm', 'cli'],
      ['retry', { method: 'POST', path: '/api/runs/:runId/steps/:step/retry', status: 202 }],
      ['approve', { method: 'POST', path: '/api/runs/:runId/steps/:step/approve', status: 202 }],
      ['round', { method: 'POST', path: '/api/runs/:runId/round', status: 202 }],
      ['accept', { method: 'POST', path: '/api/runs/:runId/steps/:step/accept', status: 202 }],
      ['say', { method: 'POST', path: '/api/runs/:runId/steps/:step/say', status: 202 }],
      ['ls', { method: 'GET', path: '/api/runs', status: 200 }],
      ['show', 'cli'],
      ['logs', { method: 'GET', path: '/api/runs/:runId/steps/:step/log', status: 200 }],
      ['feed', 'cli'],
      ['stats', { method: 'GET', path: '/api/stats', status: 200 }],
      ['decide', { method: 'GET', path: '/api/runs/:runId/decision', status: 200 }],
      ['ceilings', { method: 'GET', path: '/api/ceilings', status: 200 }],
      ['agents', { method: 'GET', path: '/api/agents', status: 200 }],
      ['agents card', { method: 'GET', path: '/api/agents/:from/:name/card', status: 200 }],
      [
        'agents custom',
        [
          { method: 'GET', path: '/api/custom-instructions/:name', status: 200, hand: true },
          { method: 'PUT', path: '/api/custom-instructions/:name', status: 200, sets: { clear: false } },
          { method: 'DELETE', path: '/api/custom-instructions/:name', status: 200, sets: { clear: true } },
        ],
      ],
      ['cancel', 'cli'],
      ['hold', { method: 'DELETE', path: '/api/runs/:runId/hold', status: 200, sets: { off: true } }],
      ['rm', { method: 'DELETE', path: '/api/runs/:runId', status: 200 }],
      ['prune', { method: 'POST', path: '/api/runs/:runId/prune', status: 200, sets: { yes: true } }],
      ['cordon', { method: 'POST', path: '/api/cordon', status: 200 }],
      ['uncordon', { method: 'DELETE', path: '/api/cordon', status: 200 }],
      ['cordoned', { method: 'GET', path: '/api/cordon', status: 200 }],
      ['tick', 'cli'],
      ['up', 'cli'],
      ['watch', 'cli'],
    ],
  );
});

test('every command the api posts or deletes on writes, and the api guards it; the reads write nothing', () => {
  assert.deepEqual(
    TABLE.filter((c) => !c.writes).map((c) => c.name),
    [
      'inbox',
      'factory',
      'factory ls',
      'ls',
      'show',
      'logs',
      'feed',
      'stats',
      'decide',
      'ceilings',
      'agents',
      'agents card',
      'cordoned',
      'watch',
    ],
  );
  assert.deepEqual(
    TABLE.filter((c) => routeList(c).some((r) => r.hand === undefined && c.writes !== (r.method !== 'GET'))).map((c) => c.name),
    [],
  );
});
