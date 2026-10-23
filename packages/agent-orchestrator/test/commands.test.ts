/**
 * The shipped command table: no rule of the table broken against the CLI's own verbs and runners, and each command on the api's path,
 * method and status of today, or on the CLI alone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TABLE, commandBreaks, routeList, type Route } from '../src/runner.ts';
import { classBreaks } from '../src/admission/index.ts';
import { RUNS, VERBS } from '../src/cli/main.ts';

test('the shipped table breaks none of its rules against the CLI’s verbs and runners', () => {
  assert.deepEqual(commandBreaks(TABLE, [...VERBS.keys()], [...RUNS.keys()]), []);
});

test('the commands whose work waits on the next pass tick, and no read, nor up, tick or watch, does', () => {
  assert.deepEqual(
    TABLE.filter((c) => c.ticks === true)
      .map((c) => c.name)
      .sort(),
    [
      'accept',
      'agents try',
      'approve',
      'cancel',
      'factory resolve',
      'factory upgrade',
      'inbox queue',
      'merge',
      'plan',
      'refresh',
      'resume',
      'retry',
      'round',
      'start',
    ],
  );
  assert.deepEqual(
    TABLE.filter((c) => c.ticks === true && (!c.writes || ['up', 'tick', 'watch'].includes(c.name))).map((c) => c.name),
    [],
  );
});

test('every shipped command is classed once, and no class breaks its rules', () => {
  assert.deepEqual(classBreaks(TABLE), []);
});

/** A route as the pins say it: a route the api writes by hand (`hand`) marked so, its why left to the entry. */
const pinned = (r: Route) => (r.hand === undefined ? r : { ...r, hand: true });

test('each command is served on the api where it was before the table, the lift of a hold, a removal and a prune where their routes were', () => {
  assert.deepEqual(
    TABLE.map((c) => [c.name, Array.isArray(c.route) ? c.route.map(pinned) : c.route ? pinned(c.route as Route) : c.only?.side]),
    [
      ['start', { method: 'POST', path: '/api/runs', status: 201, hand: true }],
      ['plan', 'cli'],
      ['concluded', { method: 'GET', path: '/api/runs/:runId/concluded', status: 200 }],
      ['inbox', { method: 'GET', path: '/api/inbox', status: 200 }],
      ['inbox add', { method: 'POST', path: '/api/inbox', status: 201, hand: true }],
      [
        'inbox queue',
        [
          { method: 'POST', path: '/api/inbox/:name/queue', status: 200, sets: { off: false } },
          { method: 'DELETE', path: '/api/inbox/:name/queue', status: 200, sets: { off: true } },
        ],
      ],
      [
        'inbox from',
        [
          { method: 'PUT', path: '/api/inbox/:name/from', status: 200, sets: { off: false } },
          { method: 'DELETE', path: '/api/inbox/:name/from', status: 200, sets: { off: true } },
        ],
      ],
      ['inbox rm', { method: 'DELETE', path: '/api/inbox/:name', status: 200 }],
      ['inbox card', { method: 'GET', path: '/api/inbox/:name', status: 200 }],
      ['factory', { method: 'GET', path: '/api/factories', status: 200 }],
      ['factory ls', 'cli'],
      ['factory add', 'cli'],
      ['factory apply', 'cli'],
      ['factory plan', 'cli'],
      ['factory upgrade', 'cli'],
      ['factory resolve', 'cli'],
      ['factory attach', 'cli'],
      ['factory detach', 'cli'],
      ['factory hire', { method: 'PUT', path: '/api/factories/:factory/hires/:step', status: 200 }],
      ['factory fire', { method: 'DELETE', path: '/api/factories/:factory/hires/:step', status: 200 }],
      ['factory schedule', { method: 'PUT', path: '/api/factories/:factory/schedules/:workflow', status: 200 }],
      ['factory unschedule', { method: 'DELETE', path: '/api/factories/:factory/schedules/:workflow', status: 200 }],
      ['factory servers', { method: 'GET', path: '/api/factories/:factory/servers', status: 200 }],
      ['factory server add', { method: 'PUT', path: '/api/factories/:factory/servers/:server', status: 200 }],
      ['factory server rm', { method: 'DELETE', path: '/api/factories/:factory/servers/:server', status: 200 }],
      [
        'factory rules',
        [
          { method: 'GET', path: '/api/factories/:factory/rules', status: 200, hand: true },
          { method: 'PUT', path: '/api/factories/:factory/rules', status: 200, sets: { clear: false } },
          { method: 'DELETE', path: '/api/factories/:factory/rules', status: 200, sets: { clear: true } },
        ],
      ],
      [
        'factory instruction',
        [
          { method: 'GET', path: '/api/factories/:factory/instruction', status: 200, hand: true },
          { method: 'PUT', path: '/api/factories/:factory/instruction', status: 200, sets: { clear: false } },
          { method: 'DELETE', path: '/api/factories/:factory/instruction', status: 200, sets: { clear: true } },
        ],
      ],
      [
        'factory instruct',
        [
          { method: 'PUT', path: '/api/factories/:factory/instruction/words', status: 200, sets: { clear: false } },
          { method: 'DELETE', path: '/api/factories/:factory/instruction/words', status: 200, sets: { clear: true } },
        ],
      ],
      ['factory trust', 'cli'],
      ['factory rm', 'cli'],
      ['template check', 'cli'],
      ['template export', 'cli'],
      ['template pack', 'cli'],
      ['template unpack', 'cli'],
      ['retry', { method: 'POST', path: '/api/runs/:runId/steps/:step/retry', status: 202 }],
      ['approve', { method: 'POST', path: '/api/runs/:runId/steps/:step/approve', status: 202 }],
      ['round', { method: 'POST', path: '/api/runs/:runId/round', status: 202 }],
      ['refresh', { method: 'POST', path: '/api/runs/:runId/refresh', status: 202 }],
      ['accept', { method: 'POST', path: '/api/runs/:runId/steps/:step/accept', status: 202 }],
      ['merge', { method: 'POST', path: '/api/runs/:runId/merge', status: 202 }],
      ['say', { method: 'POST', path: '/api/runs/:runId/steps/:step/say', status: 202 }],
      ['ls', 'cli'],
      ['show', 'cli'],
      ['logs', { method: 'GET', path: '/api/runs/:runId/steps/:step/log', status: 200 }],
      ['stats', { method: 'GET', path: '/api/stats', status: 200 }],
      ['runs', { method: 'GET', path: '/api/runs', status: 200 }],
      ['runs open', { method: 'GET', path: '/api/runs-open', status: 200 }],
      ['runs finished', { method: 'GET', path: '/api/runs-finished', status: 200 }],
      ['run', { method: 'GET', path: '/api/runs/:id', status: 200 }],
      ['step artifact', { method: 'GET', path: '/api/runs/:id/steps/:step/artifacts/:name', status: 200 }],
      ['step file', { method: 'GET', path: '/api/runs/:id/steps/:step/files/:name', status: 200 }],
      ['step path', { method: 'GET', path: '/api/runs/:id/steps/:step/path', status: 200 }],
      ['step transcript', { method: 'GET', path: '/api/runs/:id/steps/:step/transcript', status: 200 }],
      ['decide', { method: 'GET', path: '/api/runs/:runId/decision', status: 200 }],
      ['merges', 'api'],
      ['ceilings', { method: 'GET', path: '/api/ceilings', status: 200 }],
      ['passes', { method: 'GET', path: '/api/passes', status: 200 }],
      ['series', { method: 'GET', path: '/api/series', status: 200 }],
      ['agents', { method: 'GET', path: '/api/agents', status: 200 }],
      ['agents card', { method: 'GET', path: '/api/agents/:from/:name/card', status: 200 }],
      ['agents sources', { method: 'GET', path: '/api/agents/sources', status: 200, hand: true }],
      [
        'agents custom',
        [
          { method: 'GET', path: '/api/custom-instructions/:name', status: 200, hand: true },
          { method: 'PUT', path: '/api/custom-instructions/:name', status: 200, sets: { clear: false } },
          { method: 'DELETE', path: '/api/custom-instructions/:name', status: 200, sets: { clear: true } },
        ],
      ],
      [
        'agents write',
        [
          { method: 'POST', path: '/api/agents/:from', status: 201, hand: true },
          { method: 'PUT', path: '/api/agents/:from/:name', status: 200, hand: true },
        ],
      ],
      ['agents copy', { method: 'POST', path: '/api/agents/yours/copy', status: 200 }],
      ['agents remove', { method: 'DELETE', path: '/api/agents/:from/:name', status: 200, hand: true }],
      ['agents try', { method: 'POST', path: '/api/agents/:from/:name/try', status: 201, hand: true }],
      ['agents read', { method: 'GET', path: '/api/agents/:from/:name', status: 200 }],
      ['skills list', { method: 'GET', path: '/api/skills', status: 200 }],
      ['skills read', { method: 'GET', path: '/api/skills/:from/:name', status: 200 }],
      [
        'skills write',
        [
          { method: 'POST', path: '/api/skills/:from', status: 201, hand: true },
          { method: 'PUT', path: '/api/skills/:from/:name', status: 200, hand: true },
        ],
      ],
      ['cancel', 'cli'],
      [
        'hold',
        [
          { method: 'POST', path: '/api/runs/:runId/hold', status: 200, sets: { off: false } },
          { method: 'DELETE', path: '/api/runs/:runId/hold', status: 200, sets: { off: true } },
        ],
      ],
      ['rm', { method: 'DELETE', path: '/api/runs/:runId', status: 200 }],
      ['prune', { method: 'POST', path: '/api/runs/:runId/prune', status: 200, sets: { yes: true } }],
      ['pause', { method: 'POST', path: '/api/pause', status: 200, sets: { yes: true } }],
      ['resume', { method: 'DELETE', path: '/api/pause', status: 200 }],
      ['paused', { method: 'GET', path: '/api/pause', status: 200 }],
      ['pause now', { method: 'GET', path: '/api/pause/now', status: 200 }],
      ['subscribe', { method: 'POST', path: '/api/subscriptions/:name', status: 201 }],
      ['unsubscribe', { method: 'DELETE', path: '/api/subscriptions/:name', status: 200 }],
      [
        'level',
        [
          { method: 'GET', path: '/api/level', status: 200, hand: true },
          { method: 'PUT', path: '/api/level', status: 200 },
        ],
      ],
      [
        'memory',
        [
          { method: 'GET', path: '/api/nemia/memory', status: 200 },
          { method: 'GET', path: '/api/nemia/memory/:fact', status: 200 },
        ],
      ],
      ['auto', { method: 'GET', path: '/api/auto/:name', status: 200 }],
      ['auto propose', 'cli'],
      ['auto confirm', { method: 'PUT', path: '/api/auto/:name/rules/:id', status: 200 }],
      ['auto drop', { method: 'DELETE', path: '/api/auto/:name/rules/:id', status: 200 }],
      ['service install', 'cli'],
      ['service uninstall', 'cli'],
      ['service status', 'cli'],
      ['service restart', 'cli'],
      ['upgrade', 'cli'],
      ['version', 'cli'],
      ['frontmatter rewrite', 'cli'],
      [
        'workflows write',
        [
          { method: 'POST', path: '/api/workflows/:from', status: 201, hand: true },
          { method: 'PUT', path: '/api/workflows/:from/:name', status: 200, hand: true },
        ],
      ],
      ['workflows remove', { method: 'DELETE', path: '/api/workflows/:from/:name', status: 200, hand: true }],
      ['workflows list', { method: 'GET', path: '/api/workflows', status: 200 }],
      ['workflows step', { method: 'GET', path: '/api/workflows/:from/:name/:step', status: 200 }],
      ['tick', 'cli'],
      ['up', 'cli'],
      ['watch', 'cli'],
      ['admit', 'cli'],
    ],
  );
});

test('every command the api posts or deletes on writes, and the api guards it; the reads write nothing', () => {
  assert.deepEqual(
    TABLE.filter((c) => !c.writes).map((c) => c.name),
    [
      'concluded',
      'inbox',
      'inbox card',
      'factory',
      'factory ls',
      'factory plan',
      'factory servers',
      'template check',
      'ls',
      'show',
      'logs',
      'stats',
      'runs',
      'runs open',
      'runs finished',
      'run',
      'step artifact',
      'step file',
      'step path',
      'step transcript',
      'decide',
      'merges',
      'ceilings',
      'passes',
      'series',
      'agents',
      'agents card',
      'agents sources',
      'agents read',
      'skills list',
      'skills read',
      'paused',
      'pause now',
      'memory',
      'auto',
      'service status',
      'version',
      'workflows list',
      'workflows step',
      'watch',
      'admit',
    ],
  );
  assert.deepEqual(
    TABLE.filter((c) => routeList(c).some((r) => r.hand === undefined && c.writes !== (r.method !== 'GET'))).map((c) => c.name),
    [],
  );
});
