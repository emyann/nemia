/**
 * A chat with her, told as a person's stories on the stage (`story.ts`), over the engine's stand-in and the test place: the person
 * writes — words put in the outbox and refused when empty or too long, kept while her session is down, said once it is up and never
 * twice across a restart between the say and the mark, two entries of one text claiming two saids, a said from before the entry never
 * claimed, a beat the task refuses leaving the rest for the next; the person reads — a history paged across two attempts with the line
 * between them, a stream's read resumed after its cursor, the read mark moved forward only, the turn she is answering stopped, which
 * leaves one Stopped line on her record; she asks — the keeper copies each ask her session holds open into the chat once, the board's
 * answer goes back through the call she holds open and is marked once the call took it, said as words where no call waits any more,
 * answered from the record when a restart asks it again; and her call is cut — closed as cut, asked again, and answered then through
 * the call that holds it now.
 *
 * Each checkpoint that needs a session of its own files one (`filed`), named for it, with a chat folder of its own: what was said,
 * answered or interrupted is read of that task alone. What the chat projects, pages, counts and refuses off fixtures is the table of
 * `src/chat/chat.test.ts`; the chat's files, `src/chat/chat.store.test.ts`; the keeper delivering to her live session,
 * `test/nemia-keeper.test.ts`. `WF_ROOT` is set before `src` is imported, which reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { scratch } from './scratch.ts';
import { staged, story } from './story.ts';
import { names } from './assessed.ts';

process.env.WF_ROOT = scratch('wf-nemia-chat-');
process.env.WF_VERIFY_REST = '1';
const { chatAnswer, chatHistory, chatRead, chatSend, chatSince, chatStop } = await import('../src/chat/chat.verb.ts');
const {
  appendAnswer,
  appendAsk,
  appendOutbox,
  readAnswers,
  readAnswersDone,
  readAsks,
  readAsksClosed,
  readDelivered,
  readOutbox,
  readReadMark,
  readStops,
} = await import('../src/chat/chat.store.ts');
const { answeredBefore, askOf, asksWaiting, framedForHer, presenceOf, projectChat } = await import('../src/chat/chat.ts');
const { answersDue, answersOwed, closesOwed, deliverOutbox, outboxOwed, recordAsks } = await import('../src/chat/deliver.verb.ts');
const { engineOf, runWith } = await import('../src/runtime-client.ts');
/** The CLI's `main`, loaded only if a checkpoint types a command: these stories call the verbs, and its import is the slowest. */
const main: Parameters<typeof staged>[0]['main'] = async (...argv) => (await import('../src/cli/main.ts')).main(...argv);
const stage = staged({ runWith, main, engineOf });

/** `program` over the board's engine, given the test place. */
const run = <A, E>(program: Parameters<typeof stage.runWith<A, E>>[1]) => stage.runWith(stage.board().e, program);

/** A long-lived task of hers filed on the board as `her-<name>`, in `phase` where one is given, and a chat folder of its own. */
const filed = async (name: string, phase?: string) => {
  const b = stage.board();
  const id = await run(b.e.file({ id: `her-${name}`, brief: 'be there', cwd: '/r', restartPolicy: 'Always' }));
  if (phase !== undefined) b.settle(id, phase);
  return { id, dir: scratch('wf-nemia-chat-dir-') };
};

/** What was said to the task `id`, in order. */
const saidTo = (id: string) => stage.board().said.filter((one) => one.taskId === id);
/** Each answer written into a call of the task `id`, in order. */
const answeredIn = (id: string) => stage.board().answered.filter((one) => one.taskId === id);

/** One event of her transcript, her words. */
const event = (id: string, words: string) => ({
  id,
  at: '2026-10-15T12:00:00.000Z',
  role: 'assistant' as const,
  kind: 'text' as const,
  text: words,
});

/** Her task `her-<name>` at work on its second attempt, each attempt's transcript planted, and her chat's place. */
const twoAttempts = async (name: string) => {
  const b = stage.board();
  const { id: task, dir } = await filed(name, 'running (working)');
  b.plantTranscript(task, 1, [event('a', 'One.'), event('b', 'Two.')]);
  b.restart(task);
  b.plantTranscript(task, 2, [event('c', 'Three.')]);
  return { task, dir };
};

/** Each event's words, a session line as a dash. */
const texts = (events: readonly { kind: string; text?: string }[]) => events.map((e) => (e.kind === 'session' ? '—' : e.text));

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
const QUESTION = RAW.questions[0].question;

/** The ask as the chat keeps it, once read off the call the runtime reports (`askOf`). */
const kept = askOf(RAW);

/** The sources of a chat holding the asks and the marks of `dir`, and nothing else. */
const asksOf = (dir: string) =>
  projectChat({
    sessions: [],
    said: [],
    outbox: [],
    delivered: [],
    stops: [],
    asks: readAsks(dir),
    answers: [],
    closed: readAsksClosed(dir),
    phase: 'idle',
  });

test("She is written to: the person's words kept while she is down, said once she is up, and never twice", async (t) => {
  const s = story(t);
  await s.test('REFUSED: a send that is empty or too long puts nothing in the outbox; one that is not is put there once', async () => {
    const place = { task: undefined, dir: scratch('wf-nemia-chat-dir-') };
    await assert.rejects(run(chatSend(place, '  ')), (err: Error) => {
      names(err.message, 'The message is empty');
      return true;
    });
    await assert.rejects(run(chatSend(place, 'x'.repeat(8001))), (err: Error) => {
      names(err.message, 'send at most 8000');
      return true;
    });
    assert.deepEqual(readOutbox(place.dir), []);
    const sent = await run(chatSend(place, 'Go'));
    assert.deepEqual(readOutbox(place.dir), [sent]);
  });
  await s.test('no task filed is a chat with nothing but the outbox, and she is down', async () => {
    const place = { task: undefined, dir: scratch('wf-nemia-chat-dir-') };
    await run(chatSend(place, 'Are you there?'));
    const read = await run(chatHistory(place));
    assert.deepEqual(texts(read.events), ['Are you there?']);
    assert.deepEqual(read.presence, { up: false, answering: false, waitsOnYou: 0, unread: 0 });
  });
  await s.test('a send while the task is down is kept, then said once when it is up, and a second delivery says nothing', async () => {
    const { id, dir } = await filed('down');
    appendOutbox(dir, { id: 'o1', at: new Date().toISOString(), text: 'Hello' });
    assert.deepEqual(await run(deliverOutbox(id, dir)), { marked: [], said: [], left: ['o1'] }, 'not started: nothing hears it');
    assert.equal(outboxOwed(dir), true);
    stage.board().settle(id, 'running (working)');
    assert.deepEqual(await run(deliverOutbox(id, dir)), { marked: [], said: ['o1'], left: [] });
    assert.deepEqual(await run(deliverOutbox(id, dir)), { marked: [], said: [], left: [] });
    assert.deepEqual(saidTo(id), [{ taskId: id, text: framedForHer('Hello') }]);
    assert.equal(outboxOwed(dir), false);
  });
  await s.test('a word written while her turn is over, her session open to hear the next, is said on the next pass', async () => {
    const { id, dir } = await filed('between', 'running (input-required)');
    appendOutbox(dir, { id: 'o1', at: new Date().toISOString(), text: 'Next, the two kit cards' });
    assert.deepEqual(
      await run(deliverOutbox(id, dir)),
      { marked: [], said: ['o1'], left: [] },
      'a long-lived session between turns is up, and hears the words as one in a turn does',
    );
    assert.deepEqual(saidTo(id), [{ taskId: id, text: framedForHer('Next, the two kit cards') }]);
    assert.equal(outboxOwed(dir), false);
  });
  await s.test('REFUSED: a restart between the say and the mark is finished by the mark alone, never said twice', async () => {
    const { id, dir } = await filed('cut-short', 'running (working)');
    appendOutbox(dir, { id: 'o1', at: new Date(Date.now() - 1000).toISOString(), text: 'Ship it' });
    const heard = await run(stage.board().e.say(id, framedForHer('Ship it')));
    assert.deepEqual(await run(deliverOutbox(id, dir)), { marked: ['o1'], said: [], left: [] });
    assert.equal(saidTo(id).length, 1, 'said once, by the delivery cut short');
    assert.deepEqual(readDelivered(dir), [{ id: 'o1', said: heard.at, attempt: 1 }]);
  });
  await s.test('REFUSED: words said before the entry was written are never taken for it', async () => {
    const { id, dir } = await filed('before', 'running (working)');
    await run(stage.board().e.say(id, framedForHer('Again')));
    appendOutbox(dir, { id: 'o1', at: '2999-01-01T00:00:00.000Z', text: 'Again' });
    assert.deepEqual(await run(deliverOutbox(id, dir)), { marked: [], said: ['o1'], left: [] });
    assert.equal(saidTo(id).length, 2);
  });
  await s.test('two entries of one text claim two saids in order, never one twice', async (sub) => {
    sub.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-15T12:00:00.000Z') });
    const { id, dir } = await filed('twice', 'running (working)');
    appendOutbox(dir, { id: 'o1', at: new Date().toISOString(), text: 'yes' });
    appendOutbox(dir, { id: 'o2', at: new Date().toISOString(), text: 'yes' });
    sub.mock.timers.tick(5);
    const first = await run(stage.board().e.say(id, framedForHer('yes')));
    sub.mock.timers.tick(5);
    assert.deepEqual(await run(deliverOutbox(id, dir)), { marked: ['o1'], said: ['o2'], left: [] });
    assert.deepEqual(
      readDelivered(dir).map((m) => [m.id, m.said]),
      [
        ['o1', first.at],
        ['o2', '2026-10-15T12:00:00.010Z'],
      ],
    );
    assert.equal(saidTo(id).length, 2);
  });
  await s.test('REFUSED: a say the task refuses stops the delivery with no mark, and the next delivers', async () => {
    const { id, dir } = await filed('refused', 'running (working)');
    appendOutbox(dir, { id: 'o1', at: new Date().toISOString(), text: 'one' });
    appendOutbox(dir, { id: 'o2', at: new Date().toISOString(), text: 'two' });
    stage.board().refuseSay(1);
    assert.deepEqual(await run(deliverOutbox(id, dir)), { marked: [], said: [], left: ['o1', 'o2'] });
    assert.deepEqual(readDelivered(dir), []);
    assert.deepEqual(await run(deliverOutbox(id, dir)), { marked: [], said: ['o1', 'o2'], left: [] });
    assert.deepEqual(
      saidTo(id).map((one) => one.text),
      [framedForHer('one'), framedForHer('two')],
    );
  });
});

test('Her chat read: a history across two attempts, a stream since its cursor, the read mark moved forward only, and a stopped turn', async (t) => {
  const s = story(t);
  let place = { task: '', dir: '' };
  let cursor = '';
  await s.test('history pages back across two attempts with the line between them, and says where she is', async () => {
    place = await twoAttempts('read');
    const last = await run(chatHistory(place, { limit: 2 }));
    assert.deepEqual(texts(last.events), ['—', 'Three.']);
    assert.deepEqual(last.presence, { up: true, answering: true, waitsOnYou: 0, unread: 3 });
    const older = await run(chatHistory(place, { before: last.before ?? '', limit: 5 }));
    assert.deepEqual([texts(older.events), older.before], [['One.', 'Two.'], null]);
  });
  await s.test('REFUSED: a read from a cursor no read gave', async () => {
    await assert.rejects(run(chatSince(place, '9.0.0.0.0')), (err: Error) => {
      names(err.message, '9.0.0.0.0 is not a cursor a chat read gave');
      return true;
    });
  });
  await s.test('REFUSED: a read mark on an event the chat does not hold', async () => {
    await assert.rejects(run(chatRead(place, 'm:9:z')), (err: Error) => {
      names(err.message, 'm:9:z is no event of this chat');
      return true;
    });
    assert.equal(readReadMark(place.dir), undefined);
  });
  await s.test("a read after the history's cursor gives only what came since, and the person's words once delivered", async () => {
    ({ cursor } = await run(chatHistory(place)));
    assert.deepEqual((await run(chatSince(place, cursor))).events, []);
    const sent = await run(chatSend(place, 'Hi'));
    const pending = await run(chatSince(place, cursor));
    assert.deepEqual(
      pending.events.map((x) => [x.id, x.kind === 'message' && x.delivered]),
      [[`p:${sent.id}`, null]],
    );
    stage.board().plantTranscript(place.task, 2, [event('c', 'Three.'), event('d', 'Four.')]);
    const later = await run(chatSince(place, pending.cursor));
    assert.deepEqual(texts(later.events), ['Four.']);
    assert.equal((await run(chatSince(place, undefined))).events.length, 6);
  });
  await s.test('the read mark moves forward only, and unread follows it', async () => {
    const marked = await twoAttempts('mark');
    await run(chatRead(marked, 'm:2:c'));
    assert.equal((await run(chatHistory(marked))).presence.unread, 0);
    const kept = await run(chatRead(marked, 'm:1:a'));
    assert.equal(kept.through, 'm:2:c', 'a mark behind answers the one kept');
    assert.equal(readReadMark(marked.dir)?.through, 'm:2:c');
    stage.board().plantTranscript(marked.task, 2, [event('c', 'Three.'), event('d', 'Four.')]);
    assert.equal((await run(chatHistory(marked))).presence.unread, 1);
  });
  await s.test('a stop ends her turn through the runtime and leaves one Stopped line on the record', async () => {
    const stopping = await twoAttempts('stop');
    const stop = await run(chatStop(stopping));
    assert.deepEqual(
      stage.board().interrupts.filter((id) => id === stopping.task),
      [stopping.task],
      'the turn was ended through the runtime, and once',
    );
    assert.deepEqual(readStops(stopping.dir), [stop]);
    assert.equal(stop.attempt, 2, 'the attempt that was answering');
    const drawn = (await run(chatHistory(stopping))).events.map((x) => (x.kind === 'message' ? `${x.from}:${x.text}` : x.kind));
    assert.deepEqual(
      drawn.filter((w) => w === 'keeper:Stopped'),
      ['keeper:Stopped'],
    );
  });
  await s.test('REFUSED: a stop with no session of hers filed, and one the runtime will not end, each leaves no line behind', async () => {
    const asked = stage.board().interrupts.length;
    const none = { task: undefined, dir: scratch('wf-nemia-chat-dir-') };
    await assert.rejects(run(chatStop(none)), (err: Error) => {
      names(err.message, 'No session of hers is filed', 'no turn to stop');
      return true;
    });
    assert.equal(stage.board().interrupts.length, asked, 'the runtime was not asked');
    const { id: task, dir } = await filed('unstarted');
    const unstarted = { task, dir };
    await assert.rejects(run(chatStop(unstarted)), (err: Error) => {
      names(err.message, 'has not started an attempt yet', 'no turn to end');
      return true;
    });
    assert.deepEqual(readStops(unstarted.dir), [], 'a turn the runtime did not end is on no record');
  });
});

test('She asks, and the person answers: on the board, back through the call she holds open, as words once it is cut, from the record after a restart', async (t) => {
  const s = story(t);
  let asking = { id: '', dir: '' };
  await s.test('the keeper copies each ask her session holds open into the chat once, and the board reads it after', async () => {
    asking = await filed('asks', 'running (working)');
    stage.board().plantAsk(asking.id, RAW);
    assert.deepEqual(await run(recordAsks(asking.id, asking.dir)), ['call-1']);
    assert.deepEqual(readAsks(asking.dir), [kept], 'the chat keeps the ask as the board draws it, not as the call spelled its labels');
    assert.deepEqual(await run(recordAsks(asking.id, asking.dir)), [], 'an ask already written down is left as it was');
    assert.deepEqual(readAsks(asking.dir), [kept]);
  });
  await s.test('the same question open under a second call of hers is written down once: the person is asked it no twice', async () => {
    stage.board().plantAsk(asking.id, { ...RAW, id: 'call-2' });
    assert.deepEqual(await run(recordAsks(asking.id, asking.dir)), [], 'her second call of the same words is no second ask');
    assert.deepEqual(readAsks(asking.dir), [kept], 'the chat draws the question once, and counts it once as waiting on them');
    assert.deepEqual(answeredIn(asking.id), [], 'and nothing was answered from a record that holds no answer to it');
  });
  let open = { id: '', dir: '' };
  await s.test("the person's answer on the board is a file of their own, which her chat then draws", async () => {
    open = await filed('answered', 'running (working)');
    stage.board().plantAsk(open.id, RAW);
    await run(recordAsks(open.id, open.dir));
    const place = { task: open.id, dir: open.dir };
    const answer = await run(chatAnswer(place, { id: 'call-1', picks: [{ question: QUESTION, labels: ['Cut it on read'] }] }));
    assert.deepEqual(answer.answers, { [QUESTION]: 'Cut it on read' });
    assert.deepEqual(readAnswers(open.dir), [answer]);
    const read = await run(chatHistory(place, { limit: 50 }));
    const drawn = read.events.find((one) => one.kind === 'question');
    assert.equal(drawn?.kind === 'question' && drawn.chose?.[QUESTION], 'Cut it on read');
    assert.equal(read.presence.waitsOnYou, 0, 'and it waits on them no longer');
  });
  await s.test('an answer to a call she still holds open goes back through it, and is marked only once the call has taken it', async () => {
    assert.equal(answersOwed(open.dir), true);
    const first = await run(answersDue(open.id, open.dir));
    assert.deepEqual(first.return, ['call-1']);
    assert.deepEqual(answeredIn(open.id), [{ taskId: open.id, id: 'call-1', answers: { [QUESTION]: 'Cut it on read' } }]);
    assert.deepEqual(readAnswersDone(open.dir), [], 'nothing is marked until the runtime says the call took it');
    const second = await run(answersDue(open.id, open.dir));
    assert.deepEqual(second.mark, ['call-1']);
    assert.deepEqual(saidTo(open.id), [], 'nothing of it was said as words: her call carried it');
    assert.deepEqual(
      readAnswersDone(open.dir).map((m) => [m.id, m.how]),
      [['call-1', 'mark']],
    );
    assert.equal(answersOwed(open.dir), false);
    assert.deepEqual((await run(answersDue(open.id, open.dir))).mark, [], 'and a later beat owes nothing');
  });
  await s.test('REFUSED: an answer to a question the chat does not hold, and to one answered already', async () => {
    const place = { task: open.id, dir: open.dir };
    const picks = [{ question: QUESTION, labels: ['Cut it on read'] }];
    const missing = await run(Effect.flip(chatAnswer(place, { id: 'call-9', picks })));
    assert.equal(missing._tag, 'Missing');
    names(missing.message, 'call-9 is no question of this chat');
    const twice = await run(Effect.flip(chatAnswer(place, { id: 'call-1', picks })));
    assert.equal(twice._tag, 'Conflict');
    assert.match(twice.message, /was answered at .*: read her chat again/);
    assert.equal(readAnswers(open.dir).length, 1, 'and the person is never recorded as answering twice');
    const invalid = await run(Effect.flip(chatAnswer(place, { id: 'call-1', picks: [] })));
    assert.equal(invalid._tag, 'Conflict', 'an ask already answered is refused before its picks are read');
  });
  await s.test('REFUSED: an ask of other words is no answer of the record, and waits on the person itself', async () => {
    const { id, dir } = await filed('other', 'running (working)');
    appendAsk(dir, kept);
    appendAnswer(dir, { id: 'call-1', at: new Date().toISOString(), answers: { [QUESTION]: 'Cut it on read' } });
    const other = { ...RAW, id: 'call-2', questions: [{ ...RAW.questions[0], question: 'And the values?' }] };
    assert.equal(answeredBefore([kept], readAnswers(dir), askOf(other)), undefined);
    assert.deepEqual(answeredBefore([kept], readAnswers(dir), askOf({ ...RAW, id: 'call-2' }))?.answers, { [QUESTION]: 'Cut it on read' });
    stage.board().plantAsk(id, other);
    assert.deepEqual(await run(recordAsks(id, dir)), ['call-2'], 'a question of other words is written down and asked');
    assert.deepEqual(answeredIn(id), [], 'and no answer of the record was written into its call');
  });
  await s.test('an answer whose call was cut is said to her as words, naming the question, exactly once across two beats', async () => {
    const { id, dir } = await filed('words', 'running (working)');
    appendAsk(dir, kept);
    appendAnswer(dir, { id: 'call-1', at: new Date().toISOString(), answers: { [QUESTION]: 'First line as it is' } });
    const first = await run(answersDue(id, dir));
    assert.deepEqual(first.words, ['call-1'], 'no call open, none took it: owed as words');
    assert.equal(saidTo(id).length, 1);
    assert.match(saidTo(id)[0].text, /They answered: First line as it is/);
    assert.deepEqual(
      readAnswersDone(dir).map((m) => m.how),
      ['words'],
    );
    const second = await run(answersDue(id, dir));
    assert.deepEqual(second, { return: [], words: [], mark: [] });
    assert.equal(saidTo(id).length, 1, 'said once: the mark is what finishes it');
    assert.deepEqual(answeredIn(id), [], 'and nothing was written into a call that is gone');
  });
  await s.test('REFUSED: a say the task will not take leaves the answer owed, and the next beat says it', async () => {
    const { id, dir } = await filed('unsaid', 'running (working)');
    appendAsk(dir, kept);
    appendAnswer(dir, { id: 'call-1', at: new Date().toISOString(), answers: { [QUESTION]: 'Cut it on read' } });
    stage.board().refuseSay(1);
    assert.deepEqual(await run(answersDue(id, dir)), { return: [], words: [], mark: [] });
    assert.deepEqual(readAnswersDone(dir), [], 'nothing is marked for an answer she was not told');
    assert.deepEqual((await run(answersDue(id, dir))).words, ['call-1']);
    assert.equal(saidTo(id).length, 1);
  });
  await s.test(
    'the same question asked again after a restart is answered from the record, and put to the person no second time',
    async () => {
      const { id, dir } = await filed('restart', 'running (working)');
      stage.board().plantAsk(id, RAW);
      await run(recordAsks(id, dir));
      appendAnswer(dir, { id: 'call-1', at: new Date().toISOString(), answers: { [QUESTION]: 'Cut it on read' } });
      await run(answersDue(id, dir));
      await run(answersDue(id, dir));
      stage.board().plantAsk(id, { ...RAW, id: 'call-2' });
      assert.deepEqual(await run(recordAsks(id, dir)), [], 'the same words asked afresh are written down as no second ask');
      assert.deepEqual(readAsks(dir), [kept], 'the chat keeps the one ask, so nothing new waits on the person');
      assert.deepEqual(
        answeredIn(id).map((one) => one.id),
        ['call-1', 'call-2'],
        'and the answer on record is written back through the call she holds open now',
      );
      assert.deepEqual(answeredIn(id).at(-1)?.answers, { [QUESTION]: 'Cut it on read' });
      assert.deepEqual(saidTo(id), [], 'nothing of it was said as words: her new call carried it');
    },
  );
});

test('Her call is cut: the ask stops waiting and is drawn as cut, asked again it waits once more, and its answer goes to the call that holds it now', async (t) => {
  const s = story(t);
  let cut = { id: '', dir: '' };
  await s.test(
    'an ask whose call her session no longer holds is closed as cut: it stops waiting on the person, and is drawn as cut',
    async () => {
      cut = await filed('cut', 'running (working)');
      stage.board().plantAsk(cut.id, RAW);
      await run(recordAsks(cut.id, cut.dir));
      assert.equal(asksWaiting(asksOf(cut.dir)), 1);
      assert.equal(closesOwed(cut.dir, []), true, 'a call the session no longer holds is a mark the keeper owes');
      stage.board().cutAsks(cut.id);
      await run(recordAsks(cut.id, cut.dir));
      assert.deepEqual(
        readAsksClosed(cut.dir).map((mark) => [mark.id, mark.how]),
        [['call-1', 'cut']],
      );
      assert.deepEqual(readAsks(cut.dir), [kept], 'and the ask itself is never rewritten: what became of its call is a mark of its own');
      const drawn = asksOf(cut.dir);
      const one = drawn[0];
      assert.equal(one?.kind === 'question' && typeof one.cutAt, 'string', 'the board draws it as a question nobody is holding open');
      assert.equal(asksWaiting(drawn), 0, 'and it counts on nobody: her call did not wait for the answer');
      assert.equal(presenceOf('idle', 2, drawn, undefined).waitsOnYou, 2);
      await run(recordAsks(cut.id, cut.dir));
      assert.equal(readAsksClosed(cut.dir).length, 1, 'a second beat marks it no second time');
      assert.equal(closesOwed(cut.dir, []), false, 'and the keeper owes no mark once what became of the call is marked');
    },
  );
  await s.test('a question cut and then asked again waits on the person once more, and the one ask of it is drawn once', async () => {
    stage.board().plantAsk(cut.id, { ...RAW, id: 'call-2' });
    assert.equal(closesOwed(cut.dir, [{ ...RAW, id: 'call-2' }]), true, 'her words asked afresh are a mark the keeper owes');
    assert.deepEqual(await run(recordAsks(cut.id, cut.dir)), [], 'the same words are written down as no second ask');
    assert.deepEqual(
      readAsksClosed(cut.dir).map((mark) => mark.how),
      ['cut', 'again'],
    );
    const drawn = asksOf(cut.dir);
    assert.deepEqual(
      drawn.map((one) => one.id),
      ['q:call-1'],
      'the chat draws the one question it is, whatever call of hers is holding it',
    );
    assert.equal(asksWaiting(drawn), 1, 'and it waits on the person once, never twice and never nil');
    assert.equal(presenceOf('idle', 0, drawn, undefined).waitsOnYou, 1);
  });
  await s.test(
    'a question cut, asked again, and answered then goes to the call that is waiting for it, and is said to her no second time',
    async () => {
      const { id, dir } = await filed('again', 'running (working)');
      stage.board().plantAsk(id, RAW);
      await run(recordAsks(id, dir));
      stage.board().cutAsks(id);
      await run(recordAsks(id, dir));
      stage.board().plantAsk(id, { ...RAW, id: 'call-2' });
      appendAnswer(dir, { id: 'call-1', at: new Date().toISOString(), answers: { [QUESTION]: 'Cut it on read' } });
      await run(recordAsks(id, dir));
      assert.deepEqual(
        readAsksClosed(dir).map((mark) => [mark.how, mark.call]),
        [
          ['cut', undefined],
          ['again', 'call-2'],
        ],
        'the mark that says her words are asked again names the call asking them',
      );
      assert.deepEqual(
        answeredIn(id).map((one) => one.id),
        ['call-2'],
        'the answer the person gave the first call is written into the call holding the question now',
      );
      const carried = await run(answersDue(id, dir));
      assert.deepEqual(carried.mark, ['call-1'], 'and the beat after finds that call took it: nothing is owed her but the mark');
      assert.deepEqual(saidTo(id), [], 'nothing of it is said as words: her call did wait for the person, under its own id');
      assert.deepEqual(
        readAnswersDone(dir).map((m) => [m.id, m.how]),
        [['call-1', 'mark']],
      );
      assert.equal(answersOwed(dir), false);
    },
  );
  await s.test('her words asked under a call no mark of them names are marked as asked again, cut or not', async () => {
    const { id, dir } = await filed('unseen', 'running (working)');
    stage.board().plantAsk(id, RAW);
    await run(recordAsks(id, dir));
    stage.board().cutAsks(id);
    stage.board().plantAsk(id, { ...RAW, id: 'call-2' });
    assert.equal(closesOwed(dir, [{ ...RAW, id: 'call-2' }]), true, 'a beat that never saw the cut still owes the mark of the new call');
    await run(recordAsks(id, dir));
    assert.deepEqual(
      readAsksClosed(dir).map((mark) => [mark.how, mark.call]),
      [['again', 'call-2']],
    );
    assert.equal(closesOwed(dir, [{ ...RAW, id: 'call-2' }]), false, 'and once the mark names the call, nothing more is owed');
    assert.equal(asksWaiting(asksOf(dir)), 1);
  });
  await s.test(
    'REFUSED: a harness that cannot say what its session holds open closes nothing, nor does a look that read no session',
    async () => {
      const { id, dir } = await filed('unsaid-asks', 'running (working)');
      appendAsk(dir, kept);
      assert.equal(closesOwed(dir, undefined), false, 'an absence read off a harness that does not report asks is no absence');
      await run(recordAsks(id, dir));
      assert.deepEqual(readAsksClosed(dir), [], 'her task says nothing of its asks, so nothing of the person’s question is closed');
      assert.equal(asksWaiting(asksOf(dir)), 1);
    },
  );
});
