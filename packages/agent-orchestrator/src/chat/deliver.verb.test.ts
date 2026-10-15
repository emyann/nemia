/**
 * The delivery of the person's words to a long-lived task on the engine's stand-in: kept while the task is down and said once it is up,
 * never twice across a restart between the say and the mark, two entries of one text claiming two saids, a said from before the entry
 * never claimed, and a beat the task refuses leaving the rest for the next.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from '../../test/scratch.ts';
import { eachTest } from '../../test/placed.ts';
import { engineOf, runWith } from '../runtime-client.ts';
import { appendOutbox, readDelivered } from './chat.store.ts';
import { framedForHer } from './chat.ts';
import { deliverOutbox, outboxOwed } from './deliver.verb.ts';

const engine = eachTest(testEngine);

/** A long-lived task filed on the stand-in, and the chat folder it is delivered from. */
const filed = async () => {
  const e = engineOf(engine().layer);
  const id = await runWith(e, e.file({ id: 'her', brief: 'be there', cwd: '/r', restartPolicy: 'Always' }));
  return { e, id, dir: scratch('wf-chat-deliver-') };
};

const delivered = (e: ReturnType<typeof engineOf>, id: string, dir: string) => runWith(e, deliverOutbox(id, dir));

test('a send while the task is down is kept, then said once when it is up, and a second delivery says nothing', async () => {
  const { e, id, dir } = await filed();
  appendOutbox(dir, { id: 'o1', at: new Date().toISOString(), text: 'Hello' });
  assert.deepEqual(await delivered(e, id, dir), { marked: [], said: [], left: ['o1'] }, 'not started: nothing hears it');
  assert.equal(outboxOwed(dir), true);
  engine().settle(id, 'running (working)');
  assert.deepEqual(await delivered(e, id, dir), { marked: [], said: ['o1'], left: [] });
  assert.deepEqual(await delivered(e, id, dir), { marked: [], said: [], left: [] });
  assert.deepEqual(engine().said, [{ taskId: id, text: framedForHer('Hello') }]);
  assert.equal(outboxOwed(dir), false);
});

test('REFUSED: a restart between the say and the mark is finished by the mark alone, never said twice', async () => {
  const { e, id, dir } = await filed();
  engine().settle(id, 'running (working)');
  appendOutbox(dir, { id: 'o1', at: new Date(Date.now() - 1000).toISOString(), text: 'Ship it' });
  const heard = await runWith(e, e.say(id, framedForHer('Ship it')));
  assert.deepEqual(await delivered(e, id, dir), { marked: ['o1'], said: [], left: [] });
  assert.equal(engine().said.length, 1, 'said once, by the delivery cut short');
  assert.deepEqual(readDelivered(dir), [{ id: 'o1', said: heard.at, attempt: 1 }]);
});

test('REFUSED: words said before the entry was written are never taken for it', async () => {
  const { e, id, dir } = await filed();
  engine().settle(id, 'running (working)');
  await runWith(e, e.say(id, framedForHer('Again')));
  appendOutbox(dir, { id: 'o1', at: new Date(Date.now() + 1000).toISOString(), text: 'Again' });
  assert.deepEqual(await delivered(e, id, dir), { marked: [], said: ['o1'], left: [] });
  assert.equal(engine().said.length, 2);
});

test('two entries of one text claim two saids in order, never one twice', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-15T12:00:00.000Z') });
  const { e, id, dir } = await filed();
  engine().settle(id, 'running (working)');
  appendOutbox(dir, { id: 'o1', at: new Date().toISOString(), text: 'yes' });
  appendOutbox(dir, { id: 'o2', at: new Date().toISOString(), text: 'yes' });
  t.mock.timers.tick(5);
  const first = await runWith(e, e.say(id, framedForHer('yes')));
  t.mock.timers.tick(5);
  assert.deepEqual(await delivered(e, id, dir), { marked: ['o1'], said: ['o2'], left: [] });
  assert.deepEqual(
    readDelivered(dir).map((m) => [m.id, m.said]),
    [
      ['o1', first.at],
      ['o2', '2026-10-15T12:00:00.010Z'],
    ],
  );
  assert.equal(engine().said.length, 2);
});

test('REFUSED: a say the task refuses stops the delivery with no mark, and the next delivers', async () => {
  const { e, id, dir } = await filed();
  engine().settle(id, 'running (working)');
  appendOutbox(dir, { id: 'o1', at: new Date().toISOString(), text: 'one' });
  appendOutbox(dir, { id: 'o2', at: new Date().toISOString(), text: 'two' });
  engine().refuseSay(1);
  assert.deepEqual(await delivered(e, id, dir), { marked: [], said: [], left: ['o1', 'o2'] });
  assert.deepEqual(readDelivered(dir), []);
  assert.deepEqual(await delivered(e, id, dir), { marked: [], said: ['o1', 'o2'], left: [] });
  assert.deepEqual(
    engine().said.map((s) => s.text),
    [framedForHer('one'), framedForHer('two')],
  );
});
