/**
 * What `nemia channel` says when it loses the api and reaches it again (`src/watch/channel-liveness.ts`), on an injected clock: a jump
 * of the channel's own clock during a drop is said as the stretch it did not run, with its two times and no word for a cause; a drop with
 * no jump as no answer since a time; a reconnect says whether the lines written meanwhile hold a `DaemonStarted`, how many there were and
 * from which cursor, and names each run and step among them that waits on a person.
 */
import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { Event } from 'objects';
import { clockOf, downNotice, gapAtLoss, gapOf, lastedOf, RAN_GAP_AFTER_MS, upNotice } from '../src/watch/channel-liveness.ts';

const BASE = 'http://127.0.0.1:7357';
const ZONE = 'America/Montreal';
const AT_0222 = Date.parse('2026-11-27T02:22:00.000Z');
const AT_0252 = Date.parse('2026-11-27T02:52:00.000Z');

/** An Event of the feed written at `at`, about `name` of `kind`, with `reason`, waiting on a person where `waits` says so. */
const eventOf = (at: string, kind: Event['involved']['kind'], name: string, reason: Event['reason'], waits?: 'person') =>
  ({
    apiVersion: 'nemia/v1',
    kind: 'Event',
    metadata: { name: '1', creationTimestamp: at, resourceVersion: '2' },
    involved: { kind, name },
    reason,
    type: 'Normal',
    message: `${name} ${reason}`,
    source: kind === 'Daemon' ? 'daemon' : 'tick',
    ...(waits === undefined ? {} : { waits }),
  }) satisfies Event;

/** The words a cause would take, none of which the channel can see. */
const CAUSES = /asleep|sleep|network|offline|crash|server (is |was )?down|went down/i;

test('a clock jump of 30 min during a drop is said as the stretch the channel did not run, both times local, no cause named', () => {
  const gap = gapOf(AT_0222, AT_0252);
  assert.deepEqual(gap, { from: AT_0222, to: AT_0252 });
  const notice = downNotice({ base: BASE, at: AT_0252, why: 'its watch dropped', every: '1 second', gap, zone: ZONE });
  assert.equal(notice.meta.notice, 'down');
  assert.equal(notice.meta.stopped_from, '2026-11-27T02:22:00.000Z');
  assert.equal(notice.meta.stopped_to, '2026-11-27T02:52:00.000Z');
  assert.ok(notice.content.includes('9:22 PM'), notice.content);
  assert.ok(notice.content.includes('9:52 PM'), notice.content);
  assert.ok(notice.content.includes('30 min'), notice.content);
  assert.match(notice.content, /since 9:52 PM/);
  assert.doesNotMatch(notice.content, CAUSES);
});

test('a loss says the stretch it saw itself, or one the beats kept that ended within the bound, and none older', () => {
  assert.deepEqual(gapAtLoss(AT_0222, undefined, AT_0252), { from: AT_0222, to: AT_0252 }, 'seen by the loss itself');
  const kept = { from: AT_0222, to: AT_0252 };
  const tenAfter = AT_0252 + 10_000;
  assert.deepEqual(gapAtLoss(tenAfter - 1_000, kept, tenAfter), kept, 'kept, ended 10 s before');
  const fiveAfter = AT_0252 + 5 * 60_000;
  assert.equal(gapAtLoss(fiveAfter - 1_000, kept, fiveAfter), undefined, 'kept, ended 5 min before');
  assert.equal(gapAtLoss(AT_0222, undefined, AT_0222 + 1_000), undefined, 'none seen');
});

test('a drop with no clock jump is said as no answer from the api since its time, naming neither network nor server', () => {
  assert.equal(gapOf(AT_0222, AT_0222 + RAN_GAP_AFTER_MS), undefined);
  const notice = downNotice({ base: BASE, at: AT_0222, why: 'ECONNREFUSED', every: '1 second', gap: undefined, zone: ZONE });
  assert.equal(notice.meta.notice, 'down');
  assert.equal(notice.meta.since, '2026-11-27T02:22:00.000Z');
  assert.equal(notice.meta.stopped_from, undefined);
  assert.ok(notice.content.includes(BASE), notice.content);
  assert.ok(notice.content.includes('9:22 PM'), notice.content);
  assert.doesNotMatch(notice.content, CAUSES);
});

test('a time is said in the local zone where the channel knows it, else in UTC, said as UTC', () => {
  assert.equal(clockOf(AT_0222, ZONE), '9:22 PM');
  assert.equal(clockOf(AT_0222, undefined), '02:22 UTC');
  assert.deepEqual([45_000, 30 * 60_000, 125 * 60_000, 120 * 60_000].map(lastedOf), ['45 s', '30 min', '2 h 5 min', '2 h']);
});

test('a reconnect whose missed lines hold a DaemonStarted says the daemon restarted at its time, and how many lines from where', () => {
  const restart = eventOf('2026-11-27T02:40:00.000Z', 'Daemon', '4242', 'DaemonStarted');
  const held = [eventOf('2026-11-27T02:22:00.000Z', 'Run', 'r-1', 'Running'), restart];
  const notice = upNotice({ base: BASE, from: '812', held, restarts: [restart], zone: ZONE });
  assert.equal(notice.meta.notice, 'up');
  assert.equal(notice.meta.restarted, 'yes');
  assert.equal(notice.meta.restarted_at, '2026-11-27T02:40:00.000Z');
  assert.equal(notice.meta.caught_up, '2');
  assert.equal(notice.meta.after, '812');
  assert.ok(notice.content.includes('9:40 PM'), notice.content);
  assert.ok(notice.content.includes('812'), notice.content);
});

test('a reconnect whose missed lines hold no DaemonStarted says the daemon did not restart, and one it could not read says so', () => {
  const held = [eventOf('2026-11-27T02:22:00.000Z', 'Run', 'r-1', 'Running')];
  const none = upNotice({ base: BASE, from: '812', held, restarts: [], zone: ZONE });
  assert.equal(none.meta.restarted, 'no');
  assert.equal(none.meta.restarted_at, undefined);
  assert.equal(none.meta.caught_up, '1');
  assert.match(none.content, /did not restart/);
  assert.doesNotMatch(none.content, CAUSES);
  assert.equal(upNotice({ base: BASE, from: '812', held, restarts: undefined, zone: ZONE }).meta.restarted, 'unknown');
});

test('a reconnect names each run and step among the missed lines whose last line waits on a person, one line each', () => {
  const held = [
    eventOf('2026-11-27T02:22:00.000Z', 'Step', 'r-1/plan', 'AwaitingApproval', 'person'),
    eventOf('2026-11-27T02:23:00.000Z', 'Run', 'r-2', 'AwaitingAnswer', 'person'),
    eventOf('2026-11-27T02:24:00.000Z', 'Step', 'r-3/build', 'AwaitingApproval', 'person'),
    eventOf('2026-11-27T02:25:00.000Z', 'Step', 'r-3/build', 'Running'),
    eventOf('2026-11-27T02:26:00.000Z', 'Run', 'r-4', 'Running'),
  ];
  const lines = upNotice({ base: BASE, from: '0', held, restarts: [], zone: ZONE }).content.split('\n');
  const named = lines.filter((line) => line.startsWith('- '));
  assert.equal(named.length, 2, lines.join('\n'));
  assert.ok(named[0]?.includes('r-1/plan') && named[0].includes('AwaitingApproval'), named[0]);
  assert.ok(named[1]?.includes('r-2') && named[1].includes('AwaitingAnswer'), named[1]);
});
