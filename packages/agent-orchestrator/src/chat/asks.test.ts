/**
 * The questions of a long-lived task's session that wait on the person, and their answers: what an ask is and which board draws it
 * (`askOf`, `drawnAsk`), the answer its held call takes (`answerFor`), what an answer is owed (`askDue`), the count her face shows
 * (`asksWaiting`), and the keeper's carry of them on the engine's stand-in (`recordAsks`, `answersDue`) — returned through the call she
 * holds open, said as words where no call of it is waiting any more, and each exactly once across a beat cut between the two.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from '../../test/scratch.ts';
import { eachTest } from '../../test/placed.ts';
import { engineOf, runWith } from '../runtime-client.ts';
import { appendAnswer, appendAsk, readAnswersDone, readAsks } from './chat.store.ts';
import {
  answerFor,
  askDue,
  askEvent,
  askOf,
  askWords,
  asksWaiting,
  drawnAsk,
  projectChat,
  presenceOf,
  type Ask,
  type AskQuestion,
  type ChatSources,
} from './chat.ts';
import { answersDue, answersOwed, recordAsks } from './deliver.verb.ts';

const engine = eachTest(testEngine);

/** One question as the runtime says her call asked it: a recommended choice marked in its label, as the question tool asks. */
const RAW = {
  id: 'call-1',
  at: '2026-10-16T18:02:00.000Z',
  questions: [
    {
      question: 'What does the board show as an old closeout’s one line?',
      header: 'Summary',
      options: [
        { label: 'Cut it on read (Recommended)', description: 'The first line, cut at a word to 120 characters.' },
        { label: 'First line as it is', description: 'The board cuts it by its layout.' },
      ],
      multiSelect: false,
    },
  ],
};

/** The same question with no explanation on either choice: her proposal's two actions. */
const ACTIONS = {
  ...RAW,
  questions: [{ ...RAW.questions[0], options: RAW.questions[0].options.map((o) => ({ ...o, description: '' })) }],
};

/** One ask of several questions, as her several-question ask arrives. */
const MANY = { ...RAW, questions: [RAW.questions[0], { ...RAW.questions[0], question: 'And the values?', header: 'Values' }] };

/** The sources of a chat holding nothing but `over`. */
const sources = (over: Partial<ChatSources> = {}): ChatSources => ({
  sessions: [],
  said: [],
  outbox: [],
  delivered: [],
  stops: [],
  asks: [],
  answers: [],
  phase: 'idle',
  ...over,
});

test('an ask is read off the call as she asked it, each choice’s recommendation out of its label', () => {
  const ask = askOf(RAW);
  assert.deepEqual(ask.questions[0]?.options, [
    { label: 'Cut it on read', description: 'The first line, cut at a word to 120 characters.', recommended: true },
    { label: 'First line as it is', description: 'The board cuts it by its layout.', recommended: false },
  ]);
  assert.equal(ask.id, 'call-1');
  assert.equal(ask.questions[0]?.header, 'Summary');
});

test('which board draws an ask: her actions for one question that explains nothing, the form for one that does, the tabs for several', () => {
  assert.equal(drawnAsk(askOf(ACTIONS)), 'actions');
  assert.equal(drawnAsk(askOf(RAW)), 'form', 'one choice carrying an explanation is the form, not her two buttons');
  assert.equal(drawnAsk(askOf(MANY)), 'many');
  assert.equal(askEvent(askOf(ACTIONS), undefined).kind, 'proposal');
  assert.equal(askEvent(askOf(RAW), undefined).kind, 'question');
  assert.equal(askEvent(askOf(MANY), undefined).kind, 'question');
});

test('an ask is drawn in the chat with the person’s choice once they gave it, and before it with none', () => {
  const ask = askOf(RAW);
  const waiting = projectChat(sources({ asks: [ask] }));
  assert.deepEqual(
    waiting.map((e) => [e.kind, e.id]),
    [['question', 'q:call-1']],
  );
  assert.equal(asksWaiting(waiting), 1);
  assert.equal(presenceOf('idle', 2, waiting, undefined).waitsOnYou, 3, 'an unanswered ask joins the runs waiting on the person');
  const answered = projectChat(
    sources({
      asks: [ask],
      answers: [{ id: 'call-1', at: '2026-10-16T18:05:00.000Z', answers: { [RAW.questions[0].question]: 'Cut it on read' } }],
    }),
  );
  const drawn = answered[0];
  assert.equal(drawn?.kind === 'question' && drawn.chose?.[RAW.questions[0].question], 'Cut it on read');
  assert.equal(drawn?.kind === 'question' && drawn.choseAt, '2026-10-16T18:05:00.000Z');
  assert.equal(asksWaiting(answered), 0);
  assert.equal(presenceOf('idle', 2, answered, undefined).waitsOnYou, 2);
});

test('the answer a held call takes is keyed by the question’s own words, a multi-select joined and own words carried', () => {
  const question = RAW.questions[0].question;
  assert.deepEqual(answerFor(askOf(RAW), [{ question, labels: ['Cut it on read'] }]), { [question]: 'Cut it on read' });
  assert.deepEqual(answerFor(askOf(RAW), [{ question, words: 'Neither: cut it on write' }]), { [question]: 'Neither: cut it on write' });
  const multi: AskQuestion = { ...askOf(RAW).questions[0], multiSelect: true };
  assert.deepEqual(answerFor({ questions: [multi] }, [{ question, labels: ['Cut it on read', 'First line as it is'] }]), {
    [question]: 'Cut it on read, First line as it is',
  });
});

test('REFUSED: picks that do not answer the ask — a question left out, no choice, a stray label, blank words, two for one', () => {
  const ask = askOf(RAW);
  const question = RAW.questions[0].question;
  const refused = (picks: Parameters<typeof answerFor>[1], words: RegExp) =>
    assert.throws(
      () => answerFor(ask, picks),
      (err: Error) => words.test(err.message),
      words.source,
    );
  refused([], /is not answered: answer every question of the ask/);
  refused([{ question, labels: [] }], /pick a choice, or answer in your own words/);
  refused([{ question, labels: ['Something else'] }], /`Something else` is no choice of/);
  refused([{ question, words: '   ' }], /are empty: write something, or pick a choice/);
  refused([{ question, labels: ['Cut it on read', 'First line as it is'] }], /takes one choice, and 2 were picked/);
  assert.throws(() => answerFor(askOf(MANY), [{ question, labels: ['Cut it on read'] }]), /And the values\?/);
});

test('what an answer is owed: back through a call still open, as words where none is, and nothing where its call took it', () => {
  assert.equal(askDue(true, false), 'return');
  assert.equal(askDue(false, false), 'words');
  assert.equal(askDue(true, true), 'mark', 'a call that took the answer is owed nothing, whatever else is open');
  assert.equal(askDue(false, true), 'mark');
  assert.match(askWords(askOf(RAW), { [RAW.questions[0].question]: 'Cut it on read' }), /You asked: .+ They answered: Cut it on read/);
});

/** A long-lived task filed on the stand-in, and the chat folder its asks are kept in. */
const filed = async () => {
  const e = engineOf(engine().layer);
  const id = await runWith(e, e.file({ id: 'her', brief: 'be there', cwd: '/r', restartPolicy: 'Always' }));
  engine().settle(id, 'running (working)');
  return { e, id, dir: scratch('wf-chat-asks-') };
};

/** The ask as the chat keeps it, once read off the call the runtime reports (`askOf`). */
const kept: Ask = askOf(RAW);

test('the keeper copies each ask her session holds open into the chat once, and the board reads it after', async () => {
  const { e, id, dir } = await filed();
  engine().plantAsk(id, RAW);
  assert.deepEqual(await runWith(e, recordAsks(id, dir)), ['call-1']);
  assert.deepEqual(readAsks(dir), [kept], 'the chat keeps the ask as the board draws it, not as the call spelled its labels');
  assert.deepEqual(await runWith(e, recordAsks(id, dir)), [], 'an ask already written down is left as it was');
  assert.deepEqual(readAsks(dir), [kept]);
});

test('an answer to a call she still holds open goes back through it, and is marked only once the call has taken it', async () => {
  const { e, id, dir } = await filed();
  engine().plantAsk(id, RAW);
  await runWith(e, recordAsks(id, dir));
  appendAnswer(dir, { id: 'call-1', at: new Date().toISOString(), answers: { [RAW.questions[0].question]: 'Cut it on read' } });
  assert.equal(answersOwed(dir), true);
  const first = await runWith(e, answersDue(id, dir));
  assert.deepEqual(first.return, ['call-1']);
  assert.deepEqual(engine().answered, [{ taskId: id, id: 'call-1', answers: { [RAW.questions[0].question]: 'Cut it on read' } }]);
  assert.deepEqual(readAnswersDone(dir), [], 'nothing is marked until the runtime says the call took it');
  const second = await runWith(e, answersDue(id, dir));
  assert.deepEqual(second.mark, ['call-1']);
  assert.deepEqual(engine().said, [], 'nothing of it was said as words: her call carried it');
  assert.deepEqual(
    readAnswersDone(dir).map((m) => [m.id, m.how]),
    [['call-1', 'mark']],
  );
  assert.equal(answersOwed(dir), false);
  assert.deepEqual((await runWith(e, answersDue(id, dir))).mark, [], 'and a later beat owes nothing');
});

test('an answer whose call was cut is said to her as words, naming the question, exactly once across two beats', async () => {
  const { e, id, dir } = await filed();
  appendAsk(dir, kept);
  appendAnswer(dir, { id: 'call-1', at: new Date().toISOString(), answers: { [RAW.questions[0].question]: 'First line as it is' } });
  const first = await runWith(e, answersDue(id, dir));
  assert.deepEqual(first.words, ['call-1'], 'no call of it is open and none took it: the answer is owed as words');
  assert.equal(engine().said.length, 1);
  assert.match(engine().said[0].text, /They answered: First line as it is/);
  assert.deepEqual(
    readAnswersDone(dir).map((m) => m.how),
    ['words'],
  );
  const second = await runWith(e, answersDue(id, dir));
  assert.deepEqual(second, { return: [], words: [], mark: [] });
  assert.equal(engine().said.length, 1, 'said once: the mark is what finishes it');
  assert.deepEqual(engine().answered, [], 'and nothing was written into a call that is gone');
});

test('REFUSED: a say the task will not take leaves the answer owed, and the next beat says it', async () => {
  const { e, id, dir } = await filed();
  appendAsk(dir, kept);
  appendAnswer(dir, { id: 'call-1', at: new Date().toISOString(), answers: { [RAW.questions[0].question]: 'Cut it on read' } });
  engine().refuseSay(1);
  assert.deepEqual(await runWith(e, answersDue(id, dir)), { return: [], words: [], mark: [] });
  assert.deepEqual(readAnswersDone(dir), [], 'nothing is marked for an answer she was not told');
  assert.deepEqual((await runWith(e, answersDue(id, dir))).words, ['call-1']);
  assert.equal(engine().said.length, 1);
});
