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

test('each command is served on the api where it was before the table, the lift of a hold, a removal and a prune where their routes were', () => {
  assert.deepEqual(
    TABLE.map((c) => [c.name, Array.isArray(c.route) ? c.route.map(pinned) : c.route ? pinned(c.route as Route) : c.only?.side]),
    [
      ['start', { method: 'POST', path: '/api/runs', status: 201, hand: true }],
      ['concluded', { method: 'GET', path: '/api/runs/:runId/concluded', status: 200 }],
      ['inbox', 'cli'],
      ['inbox add', 'cli'],
      ['inbox queue', 'cli'],
      [
        'inbox from',
        [
          { method: 'PUT', path: '/api/inbox/:name/from', status: 200, sets: { off: false } },
          { method: 'DELETE', path: '/api/inbox/:name/from', status: 200, sets: { off: true } },
        ],
      ],
      ['inbox rm', 'cli'],
      ['inbox show', { method: 'GET', path: '/api/inbox/:name', status: 200 }],
      ['label run', { method: 'POST', path: '/api/runs/:runId/labels', status: 200 }],
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
      ['retry', { method: 'POST', path: '/api/runs/:runId/steps/:step/retry', status: 202 }],
      ['approve', { method: 'POST', path: '/api/runs/:runId/steps/:step/approve', status: 202 }],
      ['route', 'cli'],
      ['refresh', { method: 'POST', path: '/api/runs/:runId/refresh', status: 202 }],
      ['say', { method: 'POST', path: '/api/runs/:runId/steps/:step/say', status: 202 }],
      [
        'ls',
        [
          { method: 'GET', path: '/api/listing', status: 200 },
          { method: 'GET', path: '/api/listing/:runId', status: 200 },
        ],
      ],
      ['show', { method: 'GET', path: '/api/runs/:runId', status: 200 }],
      ['closeout', { method: 'GET', path: '/api/runs/:runId/steps/:step/tries/:try/closeout', status: 200 }],
      ['tries', { method: 'GET', path: '/api/runs/:runId/steps/:step/tries', status: 200 }],
      ['try', { method: 'GET', path: '/api/runs/:runId/steps/:step/tries/:try', status: 200 }],
      ['told', { method: 'GET', path: '/api/runs/:runId/steps/:step/told', status: 200 }],
      ['logs', { method: 'GET', path: '/api/runs/:runId/steps/:step/log', status: 200 }],
      ['stats', { method: 'GET', path: '/api/stats', status: 200 }],
      ['runs', { method: 'GET', path: '/api/runs', status: 200 }],
      ['runs open', { method: 'GET', path: '/api/runs-open', status: 200 }],
      ['runs finished', { method: 'GET', path: '/api/runs-finished', status: 200 }],
      ['step artifact', { method: 'GET', path: '/api/runs/:id/steps/:step/artifacts/:name', status: 200 }],
      ['step file', { method: 'GET', path: '/api/runs/:id/steps/:step/files/:name', status: 200 }],
      ['step path', { method: 'GET', path: '/api/runs/:id/steps/:step/path', status: 200 }],
      ['step transcript', { method: 'GET', path: '/api/runs/:id/steps/:step/transcript', status: 200 }],
      ['decide', { method: 'GET', path: '/api/runs/:runId/decision', status: 200 }],
      ['merges', 'api'],
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
      ['workflows', 'api'],
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
      'inbox show',
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
      'runs',
      'runs open',
      'runs finished',
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
      'skills',
      'skills show',
      'paused',
      'pause now',
      'memory',
      'policy',
      'policy reach',
      'service status',
      'version',
      'workflows',
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

test("show is the run's one entry on both sides: its --raw, the record, too, which the api answers on ?raw=true for nemia", () => {
  const show = TABLE.find((c) => c.name === 'show');
  assert.equal(show?.only, undefined);
  assert.equal(show?.spec?.flags.find((f) => f.flag === '--raw')?.only, undefined);
});
