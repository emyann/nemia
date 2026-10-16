/**
 * `nemia subscribe` and `nemia unsubscribe` over an engine of the test's: a long-lived task given a subscription from the feed's end, its
 * command line read, and each refusal — a task never filed, one not long-lived, one settled, a name taken, a name that is none, a selector
 * the feed's grammar refuses, a flag retired with the wake words, minutes not above zero, and Nemia's own name given or taken away by
 * hand. A store of its own, since `WF_ROOT` is read as the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import type { TaskView } from 'agent-runtime';
import { scratch } from '../../test/scratch.ts';
import { testEngine } from 'agent-runtime/testing';

const ROOT = scratch('wf-subscribe-');
process.env.WF_ROOT = ROOT;
const { SUBSCRIBE, UNSUBSCRIBE } = await import('./subscription.verb.ts');
const { dropSubscription, listSubscriptions, putSubscription, readDelivery, writeDelivery } = await import('./subscription.store.ts');
const { DEFAULT_SELECTORS } = await import('./subscription.ts');
const { parseArgv } = await import('../command/command.ts');
const { engineOf, runWith } = await import('../runtime-client.ts');

/** The tasks the engine has filed, each by its state as the runtime folds it. */
const TASKS: Record<string, Partial<TaskView['state']>> = {
  nemia: { filedAt: '2026-10-05T10:00:00.000Z', restartPolicy: 'Always', settled: null },
  job: { filedAt: '2026-10-05T10:00:00.000Z', settled: null },
  ended: { filedAt: '2026-10-05T10:00:00.000Z', restartPolicy: 'Always', settled: 'stopped' },
};

/** An engine whose `view` answers `TASKS`, and a task never filed with no `filedAt`, as the fold of an empty journal has none. */
const e = {
  ...engineOf(testEngine().layer),
  view: (id: string) => Effect.succeed({ id, phase: 'pending', state: { settled: null, ...TASKS[id] } } as unknown as TaskView),
};

/** The command line `argv` read as `spec` reads it, refused as the CLI refuses it, then handed to its handler over `e`. */
const typed = async <D extends object>(command: typeof SUBSCRIBE | typeof UNSUBSCRIBE, argv: string[]): Promise<D> => {
  const args = parseArgv(command.spec, argv);
  assert.ok(args, `${argv.join(' ')} reads`);
  const refused = command.check?.(args);
  if (refused) throw Object.assign(new Error(refused), { exitCode: 2 });
  return (await runWith(e, command.handler(args) as never)) as D;
};

/** The message `f` refuses with, at exit 2. */
const refusal = async (f: () => Promise<unknown>): Promise<string> => {
  try {
    await f();
  } catch (err) {
    assert.equal((err as { exitCode?: number }).exitCode, 2, String(err));
    return (err as Error).message;
  }
  assert.fail('no refusal');
};

const feed = path.join(ROOT, 'feed.jsonl');

test("a long-lived task is subscribed from the feed's end, told by the default selector every 60 minutes unless told otherwise", async () => {
  fs.writeFileSync(feed, '{"at":"2026-10-05T10:00:00.000Z","run":"r-1","word":"running"}\n');
  const asked = await typed<{ name: string; subscription: object }>(SUBSCRIBE, ['watch', 'nemia']);
  assert.deepEqual(asked, {
    name: 'watch',
    subscription: { task: 'nemia', selectors: [...DEFAULT_SELECTORS], digestEvery: 60, from: fs.statSync(feed).size },
  });
  await typed(SUBSCRIBE, ['own', 'nemia', '-l', 'reason=CheckPassed', '-l', 'agent=ada,type=Warning', '--digest-every', '15']);
  assert.deepEqual(listSubscriptions().find((s) => s.name === 'own')?.subscription, {
    task: 'nemia',
    selectors: ['reason=CheckPassed', 'agent=ada,type=Warning'],
    digestEvery: 15,
    from: fs.statSync(feed).size,
  });
  assert.deepEqual(SUBSCRIBE.print(asked as never, {}), [
    'subscribed watch: nemia is told at once of a line taken by waits=person, and of the rest in a digest every 60 minutes with no wake.',
  ]);
  await typed(UNSUBSCRIBE, ['watch']);
  await typed(UNSUBSCRIBE, ['own']);
});

test('a subscription given a floor is scoped by it; REFUSED: a floor that is no level, before anything is put', async () => {
  await typed(SUBSCRIBE, ['floored', 'nemia', '--at-least', 'semi-auto']);
  assert.deepEqual(listSubscriptions().find((s) => s.name === 'floored')?.subscription.scope, { atLeast: 'semi-auto' });
  await typed(UNSUBSCRIBE, ['floored']);
  assert.match(await refusal(() => typed(SUBSCRIBE, ['n', 'nemia', '--at-least', 'on'])), /^--at-least takes a level/);
  assert.deepEqual(listSubscriptions(), [], 'nothing put');
});

test('REFUSED: a task never filed, one not long-lived and one settled, each naming how a long-lived task is filed', async () => {
  assert.match(
    await refusal(() => typed(SUBSCRIBE, ['a', 'nowhere'])),
    /^no task nowhere is filed on the store's engine: file it long-lived/,
  );
  assert.match(await refusal(() => typed(SUBSCRIBE, ['a', 'job'])), /^the task job is not long-lived.*restartPolicy: Always/);
  assert.match(await refusal(() => typed(SUBSCRIBE, ['a', 'ended'])), /^the task ended has settled \(stopped\)/);
  assert.deepEqual(listSubscriptions(), [], 'nothing put');
});

test('REFUSED: a name taken, a name that is none, a selector the feed has no key for and minutes not above zero, before anything is put', async () => {
  await typed(SUBSCRIBE, ['taken', 'nemia']);
  assert.match(await refusal(() => typed(SUBSCRIBE, ['taken', 'nemia'])), /already named taken: nemia unsubscribe taken/);
  assert.match(await refusal(() => typed(SUBSCRIBE, ['../up', 'nemia'])), /is no subscription's name/);
  assert.match(await refusal(() => typed(UNSUBSCRIBE, ['../up'])), /is no subscription's name/);
  assert.match(await refusal(() => typed(SUBSCRIBE, ['n', 'nemia', '-l', 'message=boom'])), /is no key of a feed line/);
  assert.match(await refusal(() => typed(SUBSCRIBE, ['n', 'nemia', '-l', ' '])), /is no selector: it holds no clause/);
  assert.match(await refusal(() => typed(SUBSCRIBE, ['n', 'nemia', '--digest-every', '0'])), /^--digest-every takes the minutes a digest/);
  assert.match(await refusal(() => typed(SUBSCRIBE, ['n', 'nemia', '--digest-every', 'soon'])), /^--digest-every takes the minutes/);
  await typed(UNSUBSCRIBE, ['taken']);
});

test("an unsubscribe removes the subscription, not its deliverer's file; a name with none is refused, naming nemia subscribe", async () => {
  await typed(SUBSCRIBE, ['gone', 'nemia']);
  writeDelivery('gone', { of: { task: 'nemia', from: 0 }, cursor: 0, digest: [] });
  assert.deepEqual(await typed(UNSUBSCRIBE, ['gone']), { name: 'gone' });
  assert.equal(readDelivery('gone')?.cursor, 0, "the deliverer's file is its own to drop");
  assert.deepEqual(listSubscriptions(), []);
  assert.match(await refusal(() => typed(UNSUBSCRIBE, ['gone'])), /^no subscription is named gone: nemia subscribe gone <task>/);
});

test("REFUSED: the name nemia, Nemia's own, given or taken away by hand, naming nemia level; her keeper's stays", async () => {
  assert.match(await refusal(() => typed(SUBSCRIBE, ['nemia', 'nemia'])), /^the subscription nemia is Nemia's own.*nemia level semi-auto/);
  assert.deepEqual(listSubscriptions(), [], 'nothing put');
  putSubscription('nemia', { task: 'nemia', selectors: [...DEFAULT_SELECTORS], digestEvery: 1440, from: 0 });
  assert.match(await refusal(() => typed(UNSUBSCRIBE, ['nemia'])), /^the subscription nemia is Nemia's own.*nemia level manual/);
  assert.deepEqual(
    listSubscriptions().map((s) => s.name),
    ['nemia'],
  );
  dropSubscription('nemia');
});

test('REFUSED: each flag retired with the wake words, by name, naming the selector to type', async () => {
  for (const argv of [
    ['n', 'nemia', '--wake'],
    ['n', 'nemia', '--wake-word', 'blocked'],
    ['n', 'nemia', '--wake-word=blocked'],
  ]) {
    const said = await refusal(() => typed(SUBSCRIBE, argv));
    assert.match(said, /^nemia subscribe no longer takes --wake/, argv.join(' '));
    assert.match(said, /-l waits=person/);
  }
  assert.deepEqual(listSubscriptions(), [], 'nothing put');
});
