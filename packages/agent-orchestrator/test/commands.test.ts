/**
 * The shipped command table: no rule of the table broken against the CLI's own verbs and runners, and each command on the CLI alone, on
 * the api alone, or on both and typed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLI_VERBS, TABLE, commandBreaks } from '../src/runner.ts';
import { classBreaks } from '../src/admission/index.ts';
import { COMMAND_WORDS } from 'objects';
import { RUNS, VERBS } from '../src/cli/main.ts';
import { HELD, KEPT } from './held-commands.baseline.ts';

test('the shipped table breaks none of its rules against the CLI’s verbs and runners, nor gives a tool a name its own verbs give', () => {
  assert.deepEqual(commandBreaks(TABLE, [...VERBS.keys()], [...RUNS.keys()], CLI_VERBS, [...KEPT, ...HELD]), []);
});

test('the store verbs this CLI still serves only shrink: each one held is an entry it serves whose words the client does not hold yet', () => {
  const served = TABLE.filter((c) => c.only?.side !== 'api').map((c) => c.name);
  const moved = COMMAND_WORDS.map((w) => w.name);
  assert.deepEqual(
    [...KEPT, ...HELD].filter((name) => !served.includes(name) || moved.includes(name)),
    [],
    'take a name out of test/held-commands.baseline.ts in the change that moves it',
  );
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
      'doctor fix',
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

test("each command is served on the CLI alone, on the api alone, or on both and typed (`input`), which the api calls it by from objects' Api", () => {
  assert.deepEqual(
    TABLE.map((c) => [c.name, c.only?.side ?? ('input' in c && c.input !== undefined ? 'typed' : undefined)]),
    [
      ['start', 'cli'],
      ['concluded', 'typed'],
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
      ['factory attach', 'typed'],
      ['factory detach', 'typed'],
      ['factory hire', 'cli'],
      ['factory fire', 'cli'],
      ['factory schedule', 'cli'],
      ['factory unschedule', 'cli'],
      ['factory servers', 'cli'],
      ['factory server add', 'cli'],
      ['factory server rm', 'cli'],
      ['factory volume add', 'cli'],
      ['factory volume rm', 'cli'],
      ['factory setting set', 'typed'],
      ['factory setting rm', 'typed'],
      ['factory cost-line set', 'typed'],
      ['factory cost-line rm', 'typed'],
      ['factory rules', 'cli'],
      ['factory instruction', 'cli'],
      ['factory instruct', 'cli'],
      ['factory revisions', 'typed'],
      ['factory trust', 'typed'],
      ['factory rm', 'typed'],
      ['template lint', 'cli'],
      ['template export', 'cli'],
      ['template pack', 'cli'],
      ['template unpack', 'cli'],
      ['retry', 'cli'],
      ['approve', 'cli'],
      ['route', 'typed'],
      ['refresh', 'cli'],
      ['say', 'cli'],
      ['ls', 'typed'],
      ['show', 'typed'],
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
      ['cancel', 'typed'],
      ['hold', 'cli'],
      ['wait', 'typed'],
      ['rm', 'cli'],
      ['prune', 'cli'],
      ['pause', 'typed'],
      ['pause-timeout', 'typed'],
      ['resume', 'typed'],
      ['paused', 'api'],
      ['pause now', 'api'],
      ['subscribe', 'typed'],
      ['unsubscribe', 'typed'],
      ['level', 'cli'],
      ['memory', 'cli'],
      ['policy', 'cli'],
      ['policy propose', 'typed'],
      ['policy confirm', 'cli'],
      ['policy rm', 'cli'],
      ['policy reach', 'typed'],
      ['chat speakers', 'typed'],
      ['chat allow', 'typed'],
      ['chat disallow', 'typed'],
      ['service install', 'cli'],
      ['service uninstall', 'cli'],
      ['service status', 'cli'],
      ['service restart', 'cli'],
      ['service addresses', 'cli'],
      ['doctor', 'cli'],
      ['doctor fix', 'cli'],
      ['doctor carry', 'cli'],
      ['readiness', 'cli'],
      ['token add', 'cli'],
      ['token ls', 'cli'],
      ['token rm', 'cli'],
      ['pairings ls', 'cli'],
      ['pairings approve', 'cli'],
      ['board link', 'cli'],
      ['claude-token set', 'cli'],
      ['claude-token status', 'cli'],
      ['claude-token rm', 'cli'],
      ['upgrade', 'cli'],
      ['version', 'cli'],
      ['daemon', 'cli'],
      ['frontmatter rewrite', 'cli'],
      ['workflows write', 'cli'],
      ['workflows rm', 'cli'],
      ['workflows step', 'api'],
      ['tick', 'cli'],
      ['up', 'cli'],
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
      'wait',
      'paused',
      'pause now',
      'memory',
      'policy',
      'policy reach',
      'chat speakers',
      'service status',
      'service addresses',
      'doctor',
      'readiness',
      'token ls',
      'pairings ls',
      'claude-token status',
      'version',
      'workflows step',
      'admit',
    ],
  );
});

test("show is the run's one entry on both sides: its --raw, the record, too, which the api answers on GET /api/runs/:name/record for nemia", () => {
  const show = TABLE.find((c) => c.name === 'show');
  assert.equal(show?.only, undefined);
  assert.equal(show?.spec?.flags.find((f) => f.flag === '--raw')?.only, undefined);
});
