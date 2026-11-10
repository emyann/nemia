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

test("each command is served on the api where it was before the table — or typed (`input`), which the api calls it by from objects' Api — the lift of a hold, a removal and a prune where their routes were, a run's named actions in its namespace", () => {
  assert.deepEqual(
    TABLE.map((c) => [
      c.name,
      Array.isArray(c.route)
        ? c.route.map(pinned)
        : c.route
          ? pinned(c.route as Route)
          : (c.only?.side ?? ('input' in c && c.input !== undefined ? 'typed' : undefined)),
    ]),
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
      ['stats', 'typed'],
      ['step artifact', 'api'],
      ['step file', 'api'],
      ['step path', 'api'],
      ['step transcript', 'api'],
      ['ceilings', 'api'],
      ['passes', 'typed'],
      ['series', 'typed'],
      ['agents', 'cli'],
      ['agents card', 'cli'],
      ['agents sources', 'cli'],
      ['agents custom', 'cli'],
      ['agents write', 'cli'],
      ['agents copy', 'cli'],
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
      ['pause', 'typed'],
      ['pause-timeout', 'cli'],
      ['resume', 'typed'],
      ['paused', 'api'],
      ['pause now', 'api'],
      ['subscribe', 'typed'],
      ['unsubscribe', 'typed'],
      ['level', 'cli'],
      ['memory', 'cli'],
      ['policy', 'cli'],
      ['policy propose', 'cli'],
      ['policy confirm', 'cli'],
      ['policy rm', 'cli'],
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
      ['workflows step', 'api'],
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
