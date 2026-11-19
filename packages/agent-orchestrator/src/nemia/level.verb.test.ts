/**
 * How `nemia level` says a person reaches her session, off her task's view as the runtime answers it: the attach line, then her web link
 * where its bridge is up, why not where it was asked and is not, nothing more where it was not asked; and nothing at all once her task is
 * settled. Read through `bridgeOf`, which every task's view answers the same. Her task read off the keeper's record, or adopted from an
 * older store's level file; whether she was stopped from outside and whether she rests; and a level set that names no task. On a store
 * of its own at `ROOT`, given as `ENV`.
 */
import { beforeAll, describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import type { TaskView } from 'agent-runtime';
import { scratch } from 'test-kit/scratch';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runOver } from '../../test/placed.ts';
import type { Env } from '../config/config.store.ts';
import { LEVEL } from './level.verb.ts';
import { readLevel, sessionFile, writeLevel, writeSession } from './level.store.ts';
import fs from 'node:fs';
import { bridgeOf } from '../views/views.verb.ts';
import { DEFAULT_HARNESS } from '../harness/harness.ts';
import { engineOf, runWith as runEngine } from '../runtime-client.ts';

const ROOT = scratch('wf-nemia-reach-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT };
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer, ENV);

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

describe("`nemia level`'s reach: the attach line, then her web link off her task's view, or why not, and nothing once she is settled", () => {
  beforeAll(() => {
    writeLevel(ROOT, { level: 'semi-auto', since: '2026-10-06T08:00:00.000Z', task: TASK });
  });
  test('her bridge up: the attach line first, then the link', async () => {
    const up = await levelOver({ url: LINK });
    assert.deepEqual(up.reach, [ATTACH, LINK], 'the attach line first, then the link');
    assert.deepEqual(up.bridge, { url: LINK, why: null });
  });
  test('her bridge asked and not up: why not, never a promise', async () => {
    const down = await levelOver({ url: null, why: 'its bridge is not up yet.' });
    assert.deepEqual(down.reach, [ATTACH, 'her web link is not up: its bridge is not up yet.'], 'why not, never a promise');
    assert.deepEqual(down.bridge, { url: null, why: 'its bridge is not up yet.' });
  });
  test('no bridge asked: the attach line alone', async () => {
    const unasked = await levelOver(undefined);
    assert.deepEqual(unasked.reach, [ATTACH], 'not asked: no web line at all');
    assert.equal(unasked.bridge, null);
  });
  test("a settled task's reach is nothing and its bridge null, whatever its view holds", async () => {
    const ended = await levelOver({ url: LINK }, 'stopped');
    assert.deepEqual(ended.reach, []);
    assert.equal(ended.bridge, null);
  });
  test("`bridgeOf` answers a task's bridge in its own words, and null for a task not filed bridged or not viewed", () => {
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

test("`nemia level` reads her task off the keeper's record, says a stop from outside apart from a rest, and a set names no task", async (t) => {
  writeLevel(ROOT, { level: 'manual', since: '2026-10-06T08:00:00.000Z', task: TASK });
  fs.rmSync(sessionFile(ROOT), { force: true });
  await t.test("an older store's level file names her task: it is hers, with no record of the keeper's", async () => {
    assert.equal((await levelOver(undefined)).task, TASK);
  });
  await t.test('open: neither stopped nor resting', async () => {
    const open = await levelOver(undefined);
    assert.deepEqual([open.stopped, open.rests], [false, false]);
  });
  await t.test("ended with no rest of the keeper's: stopped, at manual too, and resting, so a message starts her", async () => {
    const ended = await levelOver(undefined, 'stopped');
    assert.deepEqual([ended.stopped, ended.rests], [true, true]);
  });
  await t.test('put to rest by the keeper: resting, never stopped', async () => {
    writeSession(ROOT, { tasks: ['nemia-1', TASK], rested: '2026-10-06T09:00:00.000Z' });
    const rested = await levelOver(undefined, 'stopped');
    assert.deepEqual([rested.task, rested.stopped, rested.rests], [TASK, false, true]);
  });
  await t.test('a level set writes when the person set it, and names no task of hers', async () => {
    fs.rmSync(sessionFile(ROOT), { force: true });
    writeLevel(ROOT, { level: 'manual', since: '2026-10-06T08:00:00.000Z' });
    await runWith(engineWith(undefined), LEVEL.handler({ level: 'semi-auto' }));
    const file = readLevel(ROOT);
    assert.equal(file?.level, 'semi-auto');
    assert.ok(file?.asked !== undefined, 'when the person set it');
    assert.equal(file?.task, undefined, 'no task named: the keeper names her tasks');
    assert.equal(fs.existsSync(sessionFile(ROOT)), false, "the keeper's record is the keeper's");
  });
});
