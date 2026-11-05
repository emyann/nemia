/**
 * `GET /api/cards` lists every card (objects/cards.ts): a started card's `state` is its run's phase, judged through the app's informer each
 * time the inbox is read and never written on the card, so a run that moves moves its card, and one whose run ended reads its run's end —
 * which cards are still in play is the reader's to keep by that state (`nemia inbox`, the board).
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
import type { CardList } from 'objects';
import { appOver, eachTest, engineFor } from '../../test/placed.ts';

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

/** The cards `GET /api/cards` lists, as name and state, by name. */
const listed = async (): Promise<[string, string][]> => {
  const res = await app().request('/api/cards');
  assert.equal(res.status, 200, await res.clone().text());
  return ((await res.json()) as CardList).items
    .map((c): [string, string] => [c.metadata.name, c.status.state])
    .sort(([a], [b]) => a.localeCompare(b));
};

const cardText = () => fs.readFileSync(path.join(root, 'inbox', `${CARD}.md`), 'utf8');

test("a started card reads its run's phase, read now: running while its run works, and its run's end once it ended, with nothing written on the card", async () => {
  Effect.runSync(engine().file({ id: `t-${RUN}`, brief: 'Do it.', cwd: '/code/app', harness: 'claude' }));
  standIn().settle(`t-${RUN}`, 'working');
  const before = cardText();
  assert.deepEqual(await listed(), [
    [CARD, 'running'],
    [PARKED, 'filed'],
  ]);

  standIn().settle(`t-${RUN}`, 'failed', { exitCode: 1 });
  assert.deepEqual(
    await listed(),
    [
      [CARD, 'failed'],
      [PARKED, 'filed'],
    ],
    "its run ended: listed in its run's phase, which a reader keeps out of the cards in play",
  );
  assert.equal(cardText(), before, 'the card is not written: its state is read from its run');
});
