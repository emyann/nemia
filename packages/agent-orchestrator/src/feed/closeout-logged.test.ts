/**
 * A step's closeout in the daemon's logs (`emitFeed`), held on the log records a test logger keeps: one record per try's closeout, its
 * message the closeout as JSON, annotated with the step's labels, its try and its outcome, at Info for `done` and Warning for `blocked`
 * or a closeout the run could not read — and nothing more on a second pass, nor on a fold of the feed made afresh, as a restarted daemon
 * makes one.
 *
 * A file of its own, since the feed is the store's one file and a run another test file's passes do not name would be said `removed`
 * there. `WF_ROOT` is read as the module loads, so it is set before the import.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Layer, Logger, References } from 'effect';
import { StoreRoot } from '../config/root.store.ts';
import { parseCloseout } from '../closeout/closeout.ts';
import type { FeedCloseout, FeedWords } from './feed.ts';
import { scratch } from '../../test/scratch.ts';

const ROOT = scratch('wf-closeout-logged-');
process.env.WF_ROOT = ROOT;
const { emitFeed } = await import('./feed.verb.ts');
const { freshFeedMemo } = await import('./feed.store.ts');

/** One log record as the test logger kept it: its level, its message, and the annotations it was written under. */
type Kept = { level: string; message: unknown; annotations: Record<string, unknown> };

/** A program's log records, as it ran over a logger that keeps every record. */
async function logsOf<A>(program: Effect.Effect<A, unknown>): Promise<Kept[]> {
  const logs: Kept[] = [];
  const keeper = Logger.make(({ message, logLevel, fiber }) => {
    logs.push({
      level: logLevel,
      message: Array.isArray(message) && message.length === 1 ? message[0] : message,
      annotations: { ...fiber.getRef(References.CurrentLogAnnotations) },
    });
  });
  await Effect.runPromise(program.pipe(Effect.provide(Layer.merge(Logger.layer([keeper]), StoreRoot.layer(ROOT)))));
  return logs;
}

const LABELS = { run: 'r-c', factory: 'default', workflow: 'build' };
const SAID_DONE = { apiVersion: 'nemia/v1', outcome: 'done', summary: 'built it', body: 'the long body', artifacts: [], plan: 'a plan' };
const SAID_BLOCKED = { apiVersion: 'nemia/v1', outcome: 'blocked', summary: 'stuck', artifacts: [], needs: 'a name' };
const SAID_UNREAD = 'not json {';

/** What a pass read of one run: its three steps, each having given a closeout — done, blocked, and one the run cannot read. */
const closeouts: FeedCloseout[] = [
  { step: 'implement', try: 2, said: SAID_DONE, read: parseCloseout(SAID_DONE) },
  { step: 'review', try: 1, said: SAID_BLOCKED, read: parseCloseout(SAID_BLOCKED) },
  { step: 'land', try: 1, said: SAID_UNREAD, read: parseCloseout(SAID_UNREAD) },
];
const judged: ReadonlyMap<string, FeedWords> = new Map([
  [
    'r-c',
    {
      run: { word: 'running' },
      labels: LABELS,
      steps: closeouts.map((c) => ({ name: c.step, word: 'running', labels: { ...LABELS, step: c.step, agent: 'ada' } })),
      closeouts,
    },
  ],
]);

/** The records of `logs` a `closed out` line was logged as. */
const closedOut = (logs: readonly Kept[]) => logs.filter((l) => l.annotations.reason === 'ClosedOut');

test('each closeout a pass reads is one log record, its message the closeout as JSON, annotated with its step, try and outcome, and logged once', async (t) => {
  let first: Kept[] = [];
  await t.test('one record per try’s closeout, and no second record of the same line', async () => {
    first = await logsOf(emitFeed(judged));
    assert.equal(closedOut(first).length, 3);
    assert.equal(first.filter((l) => l.annotations.word === 'closed out').length, 3, 'the closeout’s record is its line’s one record');
  });
  await t.test('its message parses back to the closeout as the run read it', () => {
    const [done, blocked] = closedOut(first);
    assert.equal(typeof done.message, 'string');
    assert.deepEqual(JSON.parse(done.message as string), JSON.parse(JSON.stringify(closeouts[0].read)));
    assert.deepEqual(JSON.parse(blocked.message as string), JSON.parse(JSON.stringify(closeouts[1].read)));
    assert.equal(JSON.parse(done.message as string).output.plan, 'a plan', 'a declared output field rides with it');
  });
  await t.test('its annotations name the step’s labels, its try and its outcome', () => {
    const [done, blocked] = closedOut(first);
    assert.deepEqual(
      { ...done.annotations },
      {
        ...LABELS,
        step: 'implement',
        agent: 'ada',
        reason: 'ClosedOut',
        type: 'Normal',
        try: 2,
        word: 'closed out',
        outcome: 'done',
      },
    );
    assert.deepEqual([blocked.annotations.step, blocked.annotations.try, blocked.annotations.outcome], ['review', 1, 'blocked']);
  });
  await t.test('Info for done, Warn for blocked and for a closeout the run cannot read', () => {
    assert.deepEqual(
      closedOut(first).map((l) => [l.annotations.step, l.level]),
      [
        ['implement', 'Info'],
        ['review', 'Warn'],
        ['land', 'Warn'],
      ],
    );
  });
  await t.test('one the run cannot read says what came back, and why it was refused', () => {
    const unread = closedOut(first)[2];
    const parsed = JSON.parse(unread.message as string);
    assert.equal(parsed.said, SAID_UNREAD);
    assert.equal(parsed.error, (closeouts[2].read as { error: string }).error);
    assert.equal(unread.annotations.outcome, undefined, 'it gave no outcome the run could read');
  });
  await t.test('REFUSED: the feed’s file holds the line alone, never the closeout', () => {
    const feed = fs.readFileSync(path.join(ROOT, 'feed.jsonl'), 'utf8');
    assert.equal(feed.includes('the long body'), false);
    assert.equal(feed.includes(SAID_UNREAD), false);
  });
  await t.test('REFUSED: a second pass logs no closeout again', async () => {
    assert.deepEqual(closedOut(await logsOf(emitFeed(judged))), []);
  });
  await t.test('REFUSED: nor does a fold of the feed made afresh, as a restarted daemon makes one', async () => {
    assert.deepEqual(closedOut(await logsOf(emitFeed(judged, { memo: freshFeedMemo() }))), []);
  });
});
