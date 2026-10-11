/**
 * The board's card page as an entry of the table (`INBOX_CARD`), served on the api alone: a card found among the entries the inbox lists,
 * the card before a stray file of the same name, with its file as written; and a name with no card refused in `noCardLine`'s words whole.
 * `WF_ROOT` is set before the import, since the store reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runOver } from '../../test/placed.ts';
import { heldUnasked } from '../../test/unasked.ts';

const ROOT = scratch('wf-inbox-card-');
process.env.WF_ROOT = ROOT;
const { INBOX_CARD } = await import('./commands.verb.ts');
const { runWith: runEngine } = await import('../runtime-client.ts');
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);

const { engineOf } = await import('../runtime-client.ts');
const engine = eachTest(testEngine);
heldUnasked(engine);

/** The engine of this test: the stand-in, which no command here files on, stops, says to or forgets from (`heldUnasked`). */
const noEngine = () => engineOf(engine().layer);

const CARD = '---\nworkflow: dev\n---\nCache the engine views.\n';
fs.mkdirSync(path.join(ROOT, 'inbox'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'inbox', 'notes'), 'a stray file, no card\n');
fs.writeFileSync(path.join(ROOT, 'inbox', 'notes.md'), CARD);

test('a card is read for its page by its name, before a stray file of the same name, with its file as written', async () => {
  const { card, source } = await runWith(noEngine(), INBOX_CARD.handler({ name: 'notes' }));
  assert.equal(card.file, 'notes.md');
  assert.equal(card.workflow, 'dev');
  assert.equal(source, CARD);
});

test("REFUSED: a name the inbox has no card of, a Missing in noCardLine's words whole, naming the cards there are", async () => {
  await assert.rejects(runWith(noEngine(), INBOX_CARD.handler({ name: 'nowhere' })), (err: Error & { _tag?: string }) => {
    assert.equal(err._tag, 'Missing');
    assert.equal(err.message, 'no card nowhere in the inbox. Its cards are: notes.');
    return true;
  });
});
