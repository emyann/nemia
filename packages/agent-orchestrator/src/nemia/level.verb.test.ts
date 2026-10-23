/**
 * How `nemia level` says a person reaches her session, off her task's view as the runtime answers it: the attach line, then her web link
 * where its bridge is up, why not where it was asked and is not, nothing more where it was not asked; and nothing at all once her task is
 * settled. Read through `bridgeOf`, which every task's view answers the same. A store of its own, since `WF_ROOT` is read as the module
 * loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import type { TaskView } from 'agent-runtime';
import { scratch } from '../../test/scratch.ts';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runOver } from '../../test/placed.ts';

process.env.WF_ROOT = scratch('wf-nemia-reach-');
const { LEVEL } = await import('./level.verb.ts');
const { writeLevel } = await import('./level.store.ts');
const { bridgeOf } = await import('../views/views.verb.ts');
const { DEFAULT_HARNESS } = await import('../harness/harness.ts');
const { engineOf, runWith: runEngine } = await import('../runtime-client.ts');
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);

const TASK = 'nemia-20261006T080000Z';
const LINK = 'https://example.test/code/session_0123';
const ATTACH = `${DEFAULT_HARNESS} attach 01234567`;

/** An engine whose view of her task is filed, settled where `settled`, with the bridge `bridge` where one is given. */
const engineWith = (bridge: TaskView['bridge'], settled: string | null = null) => ({
  ...engineOf(testEngine().layer),
  view: (id: string) =>
    Effect.succeed({
      id,
      phase: settled ?? 'running',
      sessionId: '0123456789abcdef',
      state: { filedAt: '2026-10-06T08:00:00.000Z', settled, stopRequested: false, attempts: [] },
      ...(bridge === undefined ? {} : { bridge }),
    } as unknown as TaskView),
});

/** `nemia level`, bare, over `engineWith(bridge, settled)`. */
const levelOver = (bridge: TaskView['bridge'], settled: string | null = null) => runWith(engineWith(bridge, settled), LEVEL.handler({}));

test("`nemia level`'s reach: the attach line, then her web link off her task's view, or why not, and nothing once she is settled", async (t) => {
  writeLevel({ level: 'semi-auto', since: '2026-10-06T08:00:00.000Z', task: TASK });
  await t.test('her bridge up: the attach line first, then the link, printed under "reach her:"', async () => {
    const up = await levelOver({ url: LINK });
    assert.deepEqual(up.reach, [ATTACH, LINK], 'the attach line first, then the link');
    assert.deepEqual(up.bridge, { url: LINK, why: null });
    assert.ok(LEVEL.print(up, {}).includes(`  ${LINK}`), 'printed under "reach her:"');
  });
  await t.test('her bridge asked and not up: why not, never a promise', async () => {
    const down = await levelOver({ url: null, why: 'its bridge is not up yet.' });
    assert.deepEqual(down.reach, [ATTACH, 'her web link is not up: its bridge is not up yet.'], 'why not, never a promise');
    assert.deepEqual(down.bridge, { url: null, why: 'its bridge is not up yet.' });
  });
  await t.test('no bridge asked: the attach line alone', async () => {
    const unasked = await levelOver(undefined);
    assert.deepEqual(unasked.reach, [ATTACH], 'not asked: no web line at all');
    assert.equal(unasked.bridge, null);
  });
  await t.test("a settled task's reach is nothing and its bridge null, whatever its view holds", async () => {
    const ended = await levelOver({ url: LINK }, 'stopped');
    assert.deepEqual(ended.reach, []);
    assert.equal(ended.bridge, null);
  });
  await t.test("`bridgeOf` answers a task's bridge in its own words, and null for a task not filed bridged or not viewed", () => {
    const views = new Map<string, TaskView>([
      ['up', { bridge: { url: LINK } } as unknown as TaskView],
      ['down', { bridge: { url: null, why: 'not yet.' } } as unknown as TaskView],
      ['unasked', {} as unknown as TaskView],
    ]);
    const of = bridgeOf(views);
    assert.deepEqual(of('up'), { url: LINK, why: null });
    assert.deepEqual(of('down'), { url: null, why: 'not yet.' });
    assert.equal(of('unasked'), null);
    assert.equal(of('unviewed'), null);
  });
});
