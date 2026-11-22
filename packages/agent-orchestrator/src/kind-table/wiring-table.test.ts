/**
 * A page of a factory's wiring or of the feed as a table (wiring-table.ts): per kind, a row per item with as many cells as columns,
 * each a line of text, a boolean or a number as its column's type says, the item's metadata alone beside them, and the page's `continue`
 * carried. Cells are asserted as the values a planted object gives them.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import type { Delegation, Event, Hire, LibraryAdd, Schedule, Subscription, Table, Trigger, Volume } from 'objects';
import {
  delegationTable,
  eventTable,
  hireTable,
  libraryAddTable,
  scheduleTable,
  subscriptionTable,
  triggerTable,
  volumeTable,
} from './wiring-table.ts';

const meta = (name: string) => ({ name, namespace: 'mill', creationTimestamp: '2026-11-01T00:00:00Z', resourceVersion: '1' });

const page = <K extends string, I>(kind: K, items: readonly I[], cont?: string) => ({
  apiVersion: 'nemia/v1' as const,
  kind,
  metadata: cont === undefined ? {} : { continue: cont },
  items,
});

/** That every row of `table` has a cell per column, each of its column's type and of one line, and its item's metadata alone. */
const wellFormed = (table: Table, names: readonly string[]) => {
  assert.equal(table.kind, 'Table');
  assert.deepEqual(
    table.rows.map((row) => (row.object as { metadata: { name: string } }).metadata.name),
    names,
  );
  for (const row of table.rows) {
    assert.equal(row.cells.length, table.columnDefinitions.length);
    assert.deepEqual(Object.keys(row.object as object).sort(), ['apiVersion', 'kind', 'metadata']);
    assert.equal((row.object as { kind: string }).kind, 'PartialObjectMetadata');
    row.cells.forEach((cell, at) => {
      const type = table.columnDefinitions[at]?.type;
      if (type === 'boolean') assert.equal(typeof cell, 'boolean');
      else if (type === 'integer') assert.equal(typeof cell, 'number');
      else {
        assert.equal(typeof cell, 'string');
        assert.ok(!String(cell).includes('\n'), String(cell));
      }
    });
  }
};

/** The cell of `table`'s first row under the column `name`. */
const cell = (table: Table, name: string) => table.rows[0]?.cells[table.columnDefinitions.findIndex((c) => c.name === name)];

test('a schedule prints its cron, next fire and last run, its brief cut at its first line; the page carries its continue', () => {
  const schedule = {
    apiVersion: 'nemia/v1',
    kind: 'Schedule',
    metadata: meta('build'),
    spec: { cron: '0 9 * * 1', brief: 'Build it.\nAnd more.' },
    status: { since: '2026-11-01T00:00:00Z', next: '2026-11-02T09:00:00Z', last: { run: 'r-1', at: '2026-11-01T09:00:00Z' } },
  } satisfies Schedule;
  const table = scheduleTable(page('ScheduleList', [schedule], 'c'));
  wellFormed(table, ['build']);
  assert.equal(table.metadata.continue, 'c');
  assert.equal(cell(table, 'Cron'), '0 9 * * 1');
  assert.equal(cell(table, 'Last run'), 'r-1 at 2026-11-01T09:00:00Z');
  assert.equal(cell(table, 'Brief'), 'Build it.');
});

test('a trigger prints when it fires and what it does now: a cards one its queue, a time one its next fire', () => {
  const status = { since: '', from: 'factory', quota: 'free' } as const;
  const cards = {
    apiVersion: 'nemia/v1',
    kind: 'Trigger',
    metadata: meta('on-cards'),
    spec: { when: { kind: 'cards', labelSelector: 'team=core' }, target: { kind: 'Workflow', name: 'build' } },
    status: { ...status, queued: ['a', 'b'], clashes: [{ card: 'c', with: ['on-cards', 'other'] }] },
  } satisfies Trigger;
  const time = {
    apiVersion: 'nemia/v1',
    kind: 'Trigger',
    metadata: meta('nightly'),
    spec: { when: { kind: 'time', cron: '0 0 * * *', brief: 'b' }, target: { kind: 'Workflow', name: 'janitor' } },
    status: { ...status, next: '2026-11-02T00:00:00Z' },
  } satisfies Trigger;
  const table = triggerTable(page('TriggerList', [cards, time]));
  wellFormed(table, ['on-cards', 'nightly']);
  assert.deepEqual(table.rows[0]?.cells.slice(1, 5), ['cards team=core', 'build', 'free', 'queues 2']);
  assert.deepEqual(table.rows[1]?.cells.slice(1, 5), ['cron 0 0 * * *', 'janitor', 'free', 'next 2026-11-02T00:00:00Z']);
  assert.equal(cell(table, 'Clashes'), 'c');
});

test('a hire prints the agent that fills its step and its model; a library add its item and state; a volume its folder', () => {
  const setting = { from: 'default' } as const;
  const hire = {
    apiVersion: 'nemia/v1',
    kind: 'Hire',
    metadata: meta('build.design'),
    spec: { workflow: 'build', step: 'design', agent: 'seldon' },
    status: {
      filled: 'factory',
      agent: 'seldon',
      settings: {
        model: { value: 'opus', from: 'agent' },
        effort: setting,
        context: setting,
        harness: setting,
        permissionMode: setting,
        allowedTools: { value: ['Read', 'Bash'], from: 'step' },
        disallowedTools: setting,
        skills: setting,
        mcp: setting,
      },
    },
  } satisfies Hire;
  const hires = hireTable(page('HireList', [hire]));
  wellFormed(hires, ['build.design']);
  assert.deepEqual(hires.rows[0]?.cells, ['build.design', 'seldon', 'factory', '', 'opus', '']);

  const add = {
    apiVersion: 'nemia/v1',
    kind: 'LibraryAdd',
    metadata: meta('Agent.grace'),
    spec: { kind: 'Agent', name: 'grace' },
    status: { state: 'missing', recorded: true, message: 'Add it.\nThen again.' },
  } satisfies LibraryAdd;
  const adds = libraryAddTable(page('LibraryAddList', [add]));
  wellFormed(adds, ['Agent.grace']);
  assert.deepEqual(adds.rows[0]?.cells, ['Agent.grace', 'Agent', 'grace', 'missing', '', '', 'Add it.']);

  const volume = {
    apiVersion: 'nemia/v1',
    kind: 'Volume',
    metadata: meta('repo'),
    spec: { path: '/repo', readOnly: true },
    status: { present: false, refused: 'It is gone.', runs: ['r-1', 'r-2'] },
  } satisfies Volume;
  const volumes = volumeTable(page('VolumeList', [volume]));
  wellFormed(volumes, ['repo']);
  assert.deepEqual(volumes.rows[0]?.cells, ['repo', '/repo', true, false, 'It is gone.', 2]);
});

test("a delegation prints its rules' verbs and resources once each; a subscription its task and pending lines; an event its line", () => {
  const delegation = {
    apiVersion: 'nemia/v1',
    kind: 'Delegation',
    metadata: meta('agora'),
    spec: {
      rules: [
        { resources: ['workflows'], resourceNames: [], verbs: ['update'] },
        { resources: ['agents', 'workflows'], resourceNames: [], verbs: ['update', 'create'] },
      ],
    },
  } satisfies Delegation;
  const delegations = delegationTable(page('DelegationList', [delegation]));
  wellFormed(delegations, ['agora']);
  assert.deepEqual(delegations.rows[0]?.cells, ['agora', 2, 'update, create', 'workflows, agents']);

  const subscription = {
    apiVersion: 'nemia/v1',
    kind: 'Subscription',
    metadata: meta('nemia'),
    spec: { task: 'nemia', selectors: ['reason=Failed', 'type=Warning'], digestEvery: 30 },
    status: { from: 0, cursor: 120, pending: 3 },
  } satisfies Subscription;
  const subscriptions = subscriptionTable(page('SubscriptionList', [subscription]));
  wellFormed(subscriptions, ['nemia']);
  assert.deepEqual(subscriptions.rows[0]?.cells, ['nemia', 'nemia', 'reason=Failed, type=Warning', 3, '', 30, 120]);

  const event = {
    apiVersion: 'nemia/v1',
    kind: 'Event',
    metadata: meta('e-1'),
    involved: { kind: 'Run', name: 'r-1' },
    reason: 'Failed',
    type: 'Warning',
    message: 'The check refused.\nIts log follows.',
    source: 'tick',
  } satisfies Event;
  const events = eventTable(page('EventList', [event]));
  wellFormed(events, ['e-1']);
  assert.deepEqual(events.rows[0]?.cells.slice(0, 5), ['2026-11-01T00:00:00Z', 'Warning', 'Failed', 'Run/r-1', 'The check refused.']);
});

test('an empty page is a table with its columns and no row', () => {
  const table = volumeTable(page('VolumeList', []));
  assert.deepEqual(table.rows, []);
  assert.ok(table.columnDefinitions.length > 0);
});
