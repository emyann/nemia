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

test('the commands whose work waits on the next pass tick, and the start itself (daemon), and no read, nor up, tick or watch, does', () => {
  assert.deepEqual(
    TABLE.filter((c) => c.ticks === true)
      .map((c) => c.name)
      .sort(),
    [
      'agents run',
      'approve',
      'cancel',
      'daemon',
      'factory resolve',
      'factory upgrade',
      'inbox queue',
      'refresh',
      'resume',
      'retry',
      'route',
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

test("each command is served on the api where it was before the table, a run's named actions and its start by objects' Api alone", () => {
  assert.deepEqual(
    TABLE.map((c) => [c.name, Array.isArray(c.route) ? c.route.map(pinned) : c.route ? pinned(c.route as Route) : c.only?.side]),
    [
      ['start', 'cli'],
      ['concluded', { method: 'GET', path: '/api/runs/:runId/concluded', status: 200 }],
      ['inbox', 'cli'],
      ['inbox add', 'cli'],
      ['inbox queue', 'cli'],
      ['inbox from', 'cli'],
      ['inbox rm', 'cli'],
      ['label run', 'cli'],
      ['label inbox', 'cli'],
      ['factory', 'cli'],
      ['factory ls', 'cli'],
      ['factory add', 'cli'],
      ['factory apply', 'cli'],
      ['factory adopt', 'cli'],
      ['factory diff', 'cli'],
      ['factory upgrade', 'cli'],
      ['factory resolve', 'cli'],
      ['factory attach', 'cli'],
      ['factory detach', 'cli'],
      ['factory hire', 'cli'],
      ['factory fire', 'cli'],
      ['factory schedule', 'cli'],
      ['factory unschedule', 'cli'],
      ['factory servers', 'cli'],
      ['factory server add', 'cli'],
      ['factory server rm', 'cli'],
      ['factory volume add', 'cli'],
      ['factory volume rm', 'cli'],
      ['factory setting set', 'cli'],
      ['factory setting rm', 'cli'],
      ['factory rules', 'cli'],
      ['factory instruction', 'cli'],
      ['factory instruct', 'cli'],
      ['factory revisions', 'cli'],
      ['factory trust', 'cli'],
      ['factory rm', 'cli'],
      ['template lint', 'cli'],
      ['template export', 'cli'],
      ['template pack', 'cli'],
      ['template unpack', 'cli'],
      ['retry', 'cli'],
      ['approve', 'cli'],
      ['route', 'cli'],
      ['refresh', 'cli'],
      ['say', 'cli'],
      [
        'ls',
        [
          { method: 'GET', path: '/api/listing', status: 200 },
          { method: 'GET', path: '/api/listing/:runId', status: 200 },
        ],
      ],
      ['show', { method: 'GET', path: '/api/runs/:runId', status: 200 }],
      ['closeout', 'cli'],
      ['tries', 'api'],
      ['try', 'api'],
      ['told', 'api'],
      ['logs', 'cli'],
      ['stats', { method: 'GET', path: '/api/stats', status: 200 }],
      ['step artifact', 'api'],
      ['step file', 'api'],
      ['step path', 'api'],
      ['step transcript', 'api'],
      ['ceilings', { method: 'GET', path: '/api/ceilings', status: 200 }],
      ['passes', { method: 'GET', path: '/api/passes', status: 200 }],
      ['series', { method: 'GET', path: '/api/series', status: 200 }],
      ['agents', 'cli'],
      ['agents card', 'cli'],
      ['agents sources', { method: 'GET', path: '/api/agents/sources', status: 200, hand: true }],
      [
        'agents custom',
        [
          { method: 'GET', path: '/api/custom-instructions/:name', status: 200, hand: true },
          { method: 'PUT', path: '/api/custom-instructions/:name', status: 200, sets: { clear: false } },
          { method: 'DELETE', path: '/api/custom-instructions/:name', status: 200, sets: { clear: true } },
        ],
      ],
      ['agents write', 'cli'],
      ['agents copy', { method: 'POST', path: '/api/agents/yours/copy', status: 200 }],
      ['agents rm', 'cli'],
      ['agents run', 'cli'],
      ['agents read', 'api'],
      ['skills', 'api'],
      ['skills show', 'api'],
      ['skills write', 'cli'],
      ['cancel', 'cli'],
      ['hold', 'cli'],
      ['rm', 'cli'],
      ['prune', 'cli'],
      ['pause', { method: 'POST', path: '/api/pause', status: 200, sets: { yes: true } }],
      ['pause-timeout', 'cli'],
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
      ['policy', { method: 'GET', path: '/api/policy/:name', status: 200 }],
      ['policy propose', 'cli'],
      ['policy confirm', { method: 'PUT', path: '/api/policy/:name/rules/:id', status: 200 }],
      ['policy rm', { method: 'DELETE', path: '/api/policy/:name/rules/:id', status: 200 }],
      ['policy reach', 'cli'],
      ['chat speakers', 'cli'],
      ['chat allow', 'cli'],
      ['chat disallow', 'cli'],
      ['service install', 'cli'],
      ['service uninstall', 'cli'],
      ['service status', 'cli'],
      ['service restart', 'cli'],
      ['upgrade', 'cli'],
      ['version', 'cli'],
      ['daemon', 'cli'],
      ['frontmatter rewrite', 'cli'],
      ['workflows write', 'cli'],
      ['workflows rm', 'cli'],
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
      'factory',
      'factory ls',
      'factory diff',
      'factory servers',
      'template lint',
      'ls',
      'show',
      'closeout',
      'tries',
      'try',
      'told',
      'logs',
      'stats',
      'step artifact',
      'step file',
      'step path',
      'step transcript',
      'ceilings',
      'passes',
      'series',
      'agents',
      'agents card',
      'agents sources',
      'agents read',
      'skills',
      'skills show',
      'paused',
      'pause now',
      'memory',
      'policy',
      'policy reach',
      'chat speakers',
      'service status',
      'version',
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

test("show is the run's one entry on both sides: its --raw, the record, too, which the api answers on GET /api/runs/:name/record for nemia", () => {
  const show = TABLE.find((c) => c.name === 'show');
  assert.equal(show?.only, undefined);
  assert.equal(show?.spec?.flags.find((f) => f.flag === '--raw')?.only, undefined);
});
