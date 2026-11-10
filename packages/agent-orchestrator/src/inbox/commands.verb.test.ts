/**
 * `nemia inbox from` (`INBOX_FROM`), on the command line alone, and its print. And `nemia inbox` (`INBOX`): the cards in play
 * by default, every card with `--all`, each started card in its run's phase. `WF_ROOT` is set before the import, since the store
 * reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runOver } from '../../test/placed.ts';
import { heldUnasked } from '../../test/unasked.ts';
import { Effect } from 'effect';

const ROOT = scratch('wf-inbox-card-');
process.env.WF_ROOT = ROOT;
const { INBOX, INBOX_FROM } = await import('./commands.verb.ts');
const { runWith: runEngine } = await import('../runtime-client.ts');
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);

const { engineOf } = await import('../runtime-client.ts');
const engine = eachTest(testEngine);
heldUnasked(engine);

const CARD = '---\nworkflow: dev\n---\nCache the engine views.\n';
fs.mkdirSync(path.join(ROOT, 'inbox'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'inbox', 'notes'), 'a stray file, no card\n');
fs.writeFileSync(path.join(ROOT, 'inbox', 'notes.md'), CARD);

test("`INBOX_FROM`: the command line's alone, the api writing `from:` as the Card's update; its print unchanged", () => {
  assert.equal(INBOX_FROM.only?.side, 'cli');
  const card = { name: 'notes', file: 'notes.md', body: 'Cache the engine views.' };
  assert.deepEqual(
    INBOX_FROM.print({ card: { ...card, from: ['r-1'] }, file: '/root/inbox/notes.md', was: [], name: 'notes', from: ['r-1'] }, {}),
    ['notes  from: r-1 — its run is handed what each concluded, as context, and waits on none (/root/inbox/notes.md)'],
  );
  assert.deepEqual(INBOX_FROM.print({ card, file: '/root/inbox/notes.md', was: ['r-1'], name: 'notes', from: [] }, {}), [
    'notes  from: taken off (was r-1)',
  ]);
});

/** A run's record of one step, `implement`, its task `t-<id>`, started from the card `card`. */
const runFrom = (id: string, card: string) =>
  fs.writeFileSync(
    path.join(ROOT, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo: '/code/app',
      workspace: '/code/app',
      baseRef: 'abc123',
      branch: 'main',
      isolate: true,
      brief: 'From a card',
      workflowDir: path.join(ROOT, 'no-such-workflow'),
      createdAt: '2026-11-04T06:00:00.000Z',
      workflow: [{ name: 'implement', after: [], body: 'Implement it.', harness: 'claude' }],
      steps: { implement: { taskId: `t-${id}` } },
      from: { inbox: card },
    }),
  );

test("`INBOX`: the cards in play by default — a card whose run ended left out and counted — every card with --all, each in its run's phase; -l composes with both; a stray file that is no card is listed beside the card of its name, never hidden", async () => {
  fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'inbox', 'at-work-a1b2.md'), '---\nlabels: { team: core }\n---\nAt work.\n');
  fs.writeFileSync(path.join(ROOT, 'inbox', 'ended-c3d4.md'), '---\nlabels: { team: core }\n---\nEnded.\n');
  runFrom('r-at-work', 'at-work-a1b2');
  runFrom('r-ended', 'ended-c3d4');
  const own = testEngine();
  const e = engineOf(own.layer);
  for (const id of ['r-at-work', 'r-ended'])
    await Effect.runPromise(e.file({ id: `t-${id}`, brief: 'Do it.', cwd: '/code/app', harness: 'claude' }));
  own.settle('t-r-at-work', 'working');
  own.settle('t-r-ended', 'failed', { exitCode: 1 });
  const listed = async (args: Parameters<typeof INBOX.handler>[0]) => {
    const { cards, ended } = await runWith(e, INBOX.handler(args));
    return { cards: cards.map((c) => [c.name, c.state]), ended };
  };
  try {
    assert.deepEqual(await listed({}), {
      cards: [
        ['at-work-a1b2', 'running'],
        ['notes', 'filed'],
        ['notes', 'filed'],
      ],
      ended: 1,
    });
    assert.deepEqual((await listed({ all: true })).cards, [
      ['at-work-a1b2', 'running'],
      ['ended-c3d4', 'failed'],
      ['notes', 'filed'],
      ['notes', 'filed'],
    ]);
    assert.deepEqual(await listed({ selector: ['team=core'] }), { cards: [['at-work-a1b2', 'running']], ended: 1 });
    assert.deepEqual(await listed({ selector: ['team=core'], all: true }), {
      cards: [
        ['at-work-a1b2', 'running'],
        ['ended-c3d4', 'failed'],
      ],
      ended: 0,
    });
  } finally {
    for (const name of ['at-work-a1b2', 'ended-c3d4']) fs.rmSync(path.join(ROOT, 'inbox', `${name}.md`));
    for (const id of ['r-at-work', 'r-ended']) fs.rmSync(path.join(ROOT, 'runs', `${id}.json`));
  }
});
