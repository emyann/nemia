/**
 * `GET /api/inbox` lists the cards still in play (inbox.ts): a started card's `state` is its run's phase, judged through the app's
 * informer each time the inbox is read and never written on the card, so a run that moves moves its card; a card whose run ended is
 * listed with `?all=true` alone, and any other `all` is refused.
 *
 * On the stand-ins: the runtime's test engine, its tasks filed and settled by hand, and the test place, under the records this file seeds.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { Informer, informerMemo } from 'agent-orchestrator';
import type { InboxEntry } from './inbox.ts';
import { appOver, eachTest, engineFor } from '../../test/placed.ts';
import { names } from '../../test/named.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const engine = () => engineFor(standIn());
const informer = eachTest(() => informerMemo());
const app = eachTest(() => appOver(standIn(), stand(), Layer.succeed(Informer)(informer())));

const CARD = 'cache-the-views-k2q9';
const RUN = 'r-from-card';
const PARKED = 'parked-idea-a1b2';

fs.mkdirSync(path.join(root, 'inbox'), { recursive: true });
fs.writeFileSync(path.join(root, 'inbox', `${CARD}.md`), 'Cache the views between passes.\n');
fs.writeFileSync(path.join(root, 'inbox', `${PARKED}.md`), 'An idea not yet started.\n');
fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'runs', `${RUN}.json`),
  JSON.stringify({
    id: RUN,
    repo: '/code/app',
    workspace: '/code/app',
    baseRef: 'abc123',
    branch: 'main',
    isolate: true,
    brief: 'Cache the views between passes.',
    workflowDir: path.join(root, 'no-such-workflow'),
    createdAt: '2026-11-04T06:00:00.000Z',
    workflow: [{ name: 'implement', after: [], body: 'Implement it.', harness: 'claude' }],
    steps: { implement: { taskId: `t-${RUN}` } },
    from: { inbox: CARD },
  }),
);

/** The cards `GET /api/inbox` lists, as name and state, by name; with `?all=true` where `all` is set. */
const listed = async (all = false): Promise<[string, string][]> => {
  const res = await app().request(`/api/inbox${all ? '?all=true' : ''}`);
  assert.equal(res.status, 200, await res.clone().text());
  return ((await res.json()) as InboxEntry[]).map((e): [string, string] => [e.name, e.state]).sort(([a], [b]) => a.localeCompare(b));
};

const cardText = () => fs.readFileSync(path.join(root, 'inbox', `${CARD}.md`), 'utf8');

test("a started card reads its run's phase, read now: in play while its run works, and behind ?all=true once it ended, with nothing written on the card", async () => {
  Effect.runSync(engine().file({ id: `t-${RUN}`, brief: 'Do it.', cwd: '/code/app', harness: 'claude' }));
  standIn().settle(`t-${RUN}`, 'working');
  const before = cardText();
  assert.deepEqual(await listed(), [
    [CARD, 'running'],
    [PARKED, 'filed'],
  ]);

  standIn().settle(`t-${RUN}`, 'failed', { exitCode: 1 });
  assert.deepEqual(await listed(), [[PARKED, 'filed']], 'its run ended: out of the cards in play');
  assert.deepEqual(
    await listed(true),
    [
      [CARD, 'failed'],
      [PARKED, 'filed'],
    ],
    "and listed with ?all=true, in its run's phase",
  );
  assert.equal(cardText(), before, 'the card is not written: its state is read from its run');
});

test('REFUSED: `all` with any value but true is a 422 that names ?all=true', async () => {
  const res = await app().request('/api/inbox?all=yes');
  assert.equal(res.status, 422);
  names(((await res.json()) as { error: string }).error, '?all=true');
});
