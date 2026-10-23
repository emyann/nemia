/**
 * A chat projected from fixtures, as tables of its pure functions: `projectChat` — the agent's words and tool calls, the session line
 * between attempts, the keeper's words as markers and the person's as their own once a mark claims the said, a stopped turn — a page
 * across the session line and the pages it refuses (`chatPage`), the stream's cursor and the cursors it refuses (`readChatCursor`,
 * `sourcesAt`, `changedSince`), the presence in each state and in several at once (`presenceOf`); and her asks — what an ask is and
 * which board draws it (`askOf`, `drawnAsk`, `askEvent`), the answer its held call takes and the picks it refuses (`answerFor`), and
 * what an answer is owed (`askDue`, `askWords`). The chat on the engine's stand-in, written to, read and carried by the keeper, is told
 * in `test/nemia-chat.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { names } from '../../test/assessed.ts';
import {
  answerFor,
  askDue,
  askEvent,
  askOf,
  askWords,
  asksWaiting,
  changedSince,
  chatCursor,
  chatPage,
  cursorOf,
  drawnAsk,
  framedForHer,
  presenceOf,
  projectChat,
  readChatCursor,
  sourcesAt,
  type AskQuestion,
  type ChatEvent,
  type ChatSources,
  type SourceEvent,
} from './chat.ts';

const at = (s: number) => new Date(Date.UTC(2026, 9, 15, 12, 0, s)).toISOString();

const text = (id: string, s: number, words: string, role: SourceEvent['role'] = 'assistant'): SourceEvent => ({
  id,
  at: at(s),
  role,
  kind: 'text',
  text: words,
});
const use = (id: string, s: number, name: string, input: unknown): SourceEvent => ({
  id,
  at: at(s),
  role: 'assistant',
  kind: 'tool_use',
  tool: { name, input },
});
const result = (id: string, s: number, isError = false): SourceEvent => ({
  id,
  at: at(s),
  role: 'user',
  kind: 'tool_result',
  result: { text: 'out', isError },
});

/** Two sessions: the first says hello, runs a command and fails one; the second answers after a restart. */
const twoSessions = (over: Partial<ChatSources> = {}): ChatSources => ({
  sessions: [
    {
      attempt: 1,
      startedAt: at(0),
      events: [
        text('a1', 1, 'Hello.'),
        use('u1', 2, 'Bash', { command: 'nemia ls' }),
        result('u1', 4),
        use('u2', 5, 'Read', { file_path: '/x' }),
        result('u2', 5, true),
        text('h1', 6, 'the person wrote this', 'user'),
      ],
    },
    { attempt: 2, startedAt: at(10), events: [text('a2', 11, 'Back.')] },
  ],
  said: [],
  outbox: [],
  delivered: [],
  stops: [],
  asks: [],
  answers: [],
  closed: [],
  phase: 'idle',
  ...over,
});

const shape = (events: readonly ChatEvent[]) =>
  events.map((e) => (e.kind === 'message' ? `${e.from}:${e.text}` : e.kind === 'step' ? `step:${e.state}:${e.sentence}` : e.kind));

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
  closed: [],
  phase: 'idle',
  ...over,
});

/** That `f` refuses (`Invalid`), naming each of `facts`. */
const refusedBy = (f: () => unknown, ...facts: string[]) =>
  assert.throws(f, (err: Error & { _tag?: string }) => {
    assert.equal(err._tag, 'Invalid', err.message);
    names(err.message, ...facts);
    return true;
  });

test("`projectChat`: what the board draws of her sessions, the keeper's words and the person's", async (t) => {
  await t.test("history across two sessions: the agent's words and steps, a line between them, newest last, and no user line", () => {
    assert.deepEqual(shape(projectChat(twoSessions())), [
      'agent:Hello.',
      'step:done:Bash: nemia ls',
      'step:error:Read: /x',
      'session',
      'agent:Back.',
    ]);
    const three = twoSessions();
    three.sessions = [...three.sessions, { attempt: 3, startedAt: at(20), events: [] }];
    assert.equal(projectChat(three).filter((e) => e.kind === 'session').length, 2, 'three sessions, two lines');
  });
  await t.test('a step done carries its duration; the last one open is running, or waits where the task needs the person', () => {
    const done = projectChat(twoSessions()).find((e) => e.kind === 'step');
    assert.equal(done?.kind === 'step' && done.fact, '2.0 s');
    const open = (phase: string) =>
      projectChat({
        ...twoSessions(),
        sessions: [{ attempt: 1, startedAt: at(0), events: [use('u9', 1, 'Bash', {}), use('u8', 2, 'Bash', {})] }],
        phase,
      }).map((e) => (e.kind === 'step' ? e.state : ''));
    assert.deepEqual(open('running (working)'), ['pending', 'running']);
    assert.deepEqual(open('needs-human'), ['pending', 'waits']);
  });
  await t.test("the words the person's text is framed in are the approved sentence, to the letter", () => {
    assert.equal(framedForHer('Merge it.'), 'The person writes from the board: Merge it.');
    assert.equal(framedForHer(''), 'The person writes from the board: ');
  });
  await t.test(
    "the keeper's words are a marker after the event they followed; a said a mark claims is the person's message with their text",
    () => {
      const framed = framedForHer('Merge it.');
      const said = [
        { at: at(3), attempt: 1, text: 'Woken: gate on 473Y\nmore lines', after: { kind: 'tool_use', id: 'u1' } },
        { at: at(12), attempt: 2, text: framed, after: { kind: 'text', id: 'a2' } },
      ];
      const outbox = [{ id: 'o1', at: at(11), text: 'Merge it.' }];
      const claimed = projectChat(twoSessions({ said, outbox, delivered: [{ id: 'o1', said: at(12), attempt: 2 }] }));
      assert.deepEqual(shape(claimed), [
        'agent:Hello.',
        'step:done:Bash: nemia ls',
        'keeper:Woken: gate on 473Y',
        'step:error:Read: /x',
        'session',
        'agent:Back.',
        'person:Merge it.',
      ]);
      assert.equal(claimed.at(-1)?.kind === 'message' && claimed.at(-1)?.id, 'p:o1');
      const swapped = projectChat(twoSessions({ said, outbox, delivered: [{ id: 'o1', said: at(3), attempt: 1 }] }));
      assert.deepEqual(
        shape(swapped).filter((s) => !s.startsWith('step') && s !== 'session'),
        ['agent:Hello.', 'person:Merge it.', 'agent:Back.', `keeper:${framed}`],
      );
    },
  );
  await t.test("an outbox entry no said carries yet is the person's, undelivered, last", () => {
    const events = projectChat(twoSessions({ outbox: [{ id: 'o2', at: at(30), text: 'Are you there?' }] }));
    assert.deepEqual(events.at(-1), { kind: 'message', id: 'p:o2', at: at(30), from: 'person', text: 'Are you there?', delivered: null });
  });
  await t.test("a turn the person stopped is the keeper's quiet marker, in its place in time, and no new kind of event", () => {
    const stopped = twoSessions({ stops: [{ at: at(3), attempt: 1 }] });
    assert.deepEqual(shape(projectChat(stopped)), [
      'agent:Hello.',
      'step:done:Bash: nemia ls',
      'keeper:Stopped',
      'step:error:Read: /x',
      'session',
      'agent:Back.',
    ]);
    const marker = projectChat(stopped).find((e) => e.kind === 'message' && e.from === 'keeper');
    assert.deepEqual(marker, { kind: 'message', id: 'x:1:' + at(3), at: at(3), from: 'keeper', text: 'Stopped' });
    assert.deepEqual(
      [...new Set(projectChat(stopped).map((e) => e.kind))].sort(),
      ['message', 'session', 'step'],
      'no sixth kind of chat event appears',
    );
    const later = twoSessions({ stops: [{ at: at(12), attempt: 2 }] });
    assert.deepEqual(shape(projectChat(later)).at(-1), 'keeper:Stopped', "a stop after a session's last event stands at its end");
  });
  await t.test('words a person wrote into her own face are drawn as theirs; words the host pushed on her input are not drawn twice', () => {
    const face = twoSessions();
    const [first, second] = face.sessions;
    face.sessions = [
      first,
      { ...second, events: [{ ...text('p1', 12, 'from my phone', 'user'), origin: { kind: 'human' } }, ...second.events] },
    ];
    assert.ok(shape(projectChat(face)).includes('person:from my phone'), 'the board reads as one conversation');
    const pushed = twoSessions({ outbox: [{ id: 'o1', at: at(11), text: 'Hi' }] });
    const [one, two] = pushed.sessions;
    pushed.sessions = [one, { ...two, events: [...two.events, text('p2', 12, 'Hi', 'user')] }];
    assert.deepEqual(
      shape(projectChat(pushed)).filter((w) => w === 'person:Hi'),
      ['person:Hi'],
      'one sent message is one bubble',
    );
  });
});

test('`chatPage`: a page across the session line, and the pages it refuses', async (t) => {
  await t.test('a page across the session line holds the line, and gives the id of the page before it; the first page has none', () => {
    const events = projectChat(twoSessions());
    const last = chatPage(events, undefined, 2);
    assert.deepEqual(shape(last.events), ['session', 'agent:Back.']);
    const older = chatPage(events, last.before ?? undefined, 10);
    assert.deepEqual(shape(older.events), ['agent:Hello.', 'step:done:Bash: nemia ls', 'step:error:Read: /x']);
    assert.equal(older.before, null);
  });
  await t.test('REFUSED: a page of a size that is none, or before an id the chat does not hold', () => {
    const events = projectChat(twoSessions());
    for (const limit of [0, 201, 1.5]) refusedBy(() => chatPage(events, undefined, limit), `limit ${String(limit)} is no page size`);
    refusedBy(() => chatPage(events, 'nope', 5), 'nope is no event of this chat', '`before`');
  });
});

test("the chat's cursor: it round-trips, says what changed since it, reads an older one, and refuses one no read gave", async (t) => {
  await t.test('a cursor round-trips, and what changed since it is the new events and those whose delivery changed', () => {
    const outbox = [{ id: 'o1', at: at(11), text: 'Hi' }];
    const before = twoSessions({ outbox });
    const cursor = chatCursor(cursorOf(before));
    assert.equal(cursor, '2.1.0.1.0.0.0.0.0');
    assert.deepEqual(readChatCursor(cursor), cursorOf(before));
    const now = twoSessions({
      outbox,
      said: [{ at: at(13), attempt: 2, text: framedForHer('Hi'), after: { kind: 'text', id: 'a2' } }],
      delivered: [{ id: 'o1', said: at(13), attempt: 2 }],
    });
    const [first, second] = now.sessions;
    now.sessions = [first, { attempt: 2, startedAt: at(10), events: [...(second?.events ?? []), text('a3', 14, 'Hello again.')] }];
    const changed = changedSince(projectChat(sourcesAt(now, readChatCursor(cursor), cursor)), projectChat(now));
    assert.deepEqual(shape(changed), ['person:Hi', 'agent:Hello again.']);
    assert.equal(changed[0]?.kind === 'message' && changed[0].delivered, at(13));
  });
  await t.test(
    'a cursor of fewer counts than today, which a tab open across the deploy still carries, reads as one that had seen none of the rest',
    () => {
      const none = { said: 0, delivered: 0, stops: 0, asks: 0, answers: 0, closed: 0 };
      assert.deepEqual(readChatCursor('2.1.0.1.0'), { attempts: 2, events: 1, outbox: 1, ...none });
      assert.deepEqual(readChatCursor('2.1.0.1.0.0'), { attempts: 2, events: 1, outbox: 1, ...none });
      assert.deepEqual(readChatCursor('2.1.0.1.0.0.3.2'), { attempts: 2, events: 1, outbox: 1, ...none, asks: 3, answers: 2 });
      assert.deepEqual(readChatCursor('2.1.0.1.0.0.3.2.1'), {
        attempts: 2,
        events: 1,
        outbox: 1,
        ...none,
        asks: 3,
        answers: 2,
        closed: 1,
      });
    },
  );
  await t.test('a reader at a cursor taken before a stop is sent the Stopped line once, and not again', () => {
    const now = twoSessions({ stops: [{ at: at(3), attempt: 1 }] });
    const before = chatCursor({ ...cursorOf(now), stops: 0 });
    const changed = changedSince(projectChat(sourcesAt(now, readChatCursor(before), before)), projectChat(now));
    assert.deepEqual(shape(changed), ['keeper:Stopped']);
    const after = chatCursor(cursorOf(now));
    assert.deepEqual(changedSince(projectChat(sourcesAt(now, readChatCursor(after), after)), projectChat(now)), []);
  });
  for (const bad of ['', '1.2.3', 'a.b.c.d.e', '1.2.3.4.-1', '01.0.0.0.0', '1.0.0.0.0.0.0.0.0.0', '1.0.0.0.0.x'])
    await t.test(`REFUSED: ${JSON.stringify(bad)} is no cursor, naming the fix`, () => {
      refusedBy(() => readChatCursor(bad), `${bad} is not a cursor a chat read gave`, '`cursor`');
    });
  for (const [why, sources, cursor] of [
    ['counting more events than the chat holds', twoSessions(), '2.9.0.0.0'],
    ['counting more attempts than the chat holds', twoSessions(), '3.0.0.0.0'],
    ['counting a stop the chat does not hold', twoSessions({ stops: [] }), '2.1.0.0.0.1'],
    ['counting a mark of an ask’s call the chat does not hold', twoSessions(), '2.1.0.1.0.1.0.0.1'],
  ] as const)
    await t.test(`REFUSED: a cursor ${why}`, () => {
      refusedBy(() => sourcesAt(sources, readChatCursor(cursor), cursor), `${cursor} is not a cursor a chat read gave`);
    });
});

test('`presenceOf`: down, up and idle, answering, waits on you, and unread after the mark, alone and at once', async (t) => {
  await t.test('presence in each state: down, up and idle, answering, waits on you, unread after the mark', () => {
    const events = projectChat(twoSessions());
    const none = { up: false, answering: false, waitsOnYou: 0, unread: 2 };
    assert.deepEqual(presenceOf(undefined, 0, events, undefined), none, 'no task: down');
    assert.deepEqual(presenceOf('succeeded', 0, events, undefined), none, 'settled: down');
    assert.deepEqual(presenceOf('pending', 0, events, undefined), none, 'not started: down');
    assert.deepEqual(presenceOf('idle', 0, events, { through: 'm:2:a2', at: at(40) }), { ...none, up: true, unread: 0 });
    assert.equal(presenceOf('running (working)', 0, events, undefined).answering, true);
    assert.equal(presenceOf('working (quiescent)', 0, events, undefined).answering, true);
    assert.equal(presenceOf('idle', 0, events, undefined).answering, false);
    assert.equal(presenceOf('idle', 3, events, undefined).waitsOnYou, 3);
    assert.equal(presenceOf('idle', 0, events, { through: 'm:1:a1', at: at(40) }).unread, 1, 'one of hers after the mark');
  });
  await t.test("unread counts her messages alone: a keeper's marker and the person's own words after the mark are not unread", () => {
    const events = projectChat(
      twoSessions({
        said: [{ at: at(12), attempt: 2, text: 'Woken: gate on 473Y', after: { kind: 'text', id: 'a2' } }],
        outbox: [{ id: 'o1', at: at(30), text: 'Are you there?' }],
      }),
    );
    assert.deepEqual(shape(events).slice(-3), ['agent:Back.', 'keeper:Woken: gate on 473Y', 'person:Are you there?']);
    assert.equal(
      presenceOf('idle', 0, events, { through: 'm:1:a1', at: at(40) }).unread,
      1,
      'three messages follow the mark, one of them hers',
    );
  });
  await t.test(
    'unread survives a said drawn again under another id: the mark on a marker a delivery claimed counts from its own moment',
    () => {
      const said = [{ at: at(12), attempt: 2, text: framedForHer('Merge it.'), after: { kind: 'text' as const, id: 'a2' } }];
      const outbox = [{ id: 'o1', at: at(11), text: 'Merge it.' }];
      const mark = { through: `k:2:${at(12)}`, at: at(13) };
      const marker = projectChat(twoSessions({ said, outbox }));
      assert.ok(
        marker.some((e) => e.id === mark.through),
        "unmarked, her words are drawn as the keeper's marker",
      );
      assert.equal(presenceOf('idle', 0, marker, mark).unread, 0, 'the person read through the marker');
      const claimed = projectChat(twoSessions({ said, outbox, delivered: [{ id: 'o1', said: at(12), attempt: 2 }] }));
      assert.ok(
        !claimed.some((e) => e.id === mark.through) && claimed.some((e) => e.id === 'p:o1'),
        "the delivery draws the same said as the person's message, under another id",
      );
      assert.equal(presenceOf('idle', 0, claimed, mark).unread, 0, 'the marked id is gone: count her messages after the mark was set');
    },
  );
  await t.test('presence in several states at once: answering, waits on you and unread', () => {
    const events = projectChat(twoSessions());
    assert.deepEqual(presenceOf('running (working)', 2, events, { through: 't:1:u1', at: at(40) }), {
      up: true,
      answering: true,
      waitsOnYou: 2,
      unread: 1,
    });
  });
});

test('her asks: what an ask is and which board draws it, the answer its held call takes, and what an answer is owed', async (t) => {
  await t.test('an ask is read off the call as she asked it, each choice’s recommendation out of its label', () => {
    const ask = askOf(RAW);
    assert.deepEqual(ask.questions[0]?.options, [
      { label: 'Cut it on read', description: 'The first line, cut at a word to 120 characters.', recommended: true },
      { label: 'First line as it is', description: 'The board cuts it by its layout.', recommended: false },
    ]);
    assert.equal(ask.id, 'call-1');
    assert.equal(ask.questions[0]?.header, 'Summary');
  });
  await t.test(
    'which board draws an ask: her actions for one question that explains nothing, the form for one that does, the tabs for several',
    () => {
      assert.equal(drawnAsk(askOf(ACTIONS)), 'actions');
      assert.equal(drawnAsk(askOf(RAW)), 'form', 'one choice carrying an explanation is the form, not her two buttons');
      assert.equal(drawnAsk(askOf(MANY)), 'many');
      assert.equal(askEvent(askOf(ACTIONS), undefined).kind, 'proposal');
      assert.equal(askEvent(askOf(RAW), undefined).kind, 'question');
      assert.equal(askEvent(askOf(MANY), undefined).kind, 'question');
    },
  );
  await t.test('an ask is drawn in the chat with the person’s choice once they gave it, and before it with none', () => {
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
  const question = RAW.questions[0].question;
  await t.test('the answer a held call takes is keyed by the question’s own words, a multi-select joined and own words carried', () => {
    assert.deepEqual(answerFor(askOf(RAW), [{ question, labels: ['Cut it on read'] }]), { [question]: 'Cut it on read' });
    assert.deepEqual(answerFor(askOf(RAW), [{ question, words: 'Neither: cut it on write' }]), { [question]: 'Neither: cut it on write' });
    const multi: AskQuestion = { ...askOf(RAW).questions[0], multiSelect: true };
    assert.deepEqual(answerFor({ questions: [multi] }, [{ question, labels: ['Cut it on read', 'First line as it is'] }]), {
      [question]: 'Cut it on read, First line as it is',
    });
  });
  for (const [why, picks, facts] of [
    ['a question left out', [], ['is not answered', 'answer every question']],
    ['no choice', [{ question, labels: [] }], ['is not answered', 'pick a choice, or answer in your own words']],
    ['a stray label', [{ question, labels: ['Something else'] }], ['`Something else` is no choice of']],
    ['blank words', [{ question, words: '   ' }], ['are empty', 'write something, or pick a choice']],
    ['two for one', [{ question, labels: ['Cut it on read', 'First line as it is'] }], ['takes one choice, and 2 were picked']],
  ] as const)
    await t.test(`REFUSED: picks that do not answer the ask: ${why}`, () => {
      refusedBy(() => answerFor(askOf(RAW), picks), ...facts);
    });
  await t.test('REFUSED: picks that leave a question of several out, naming it', () => {
    refusedBy(() => answerFor(askOf(MANY), [{ question, labels: ['Cut it on read'] }]), 'And the values?');
  });
  await t.test('what an answer is owed: back through a call still open, as words where none is, and nothing where its call took it', () => {
    assert.equal(askDue(true, false), 'return');
    assert.equal(askDue(false, false), 'words');
    assert.equal(askDue(true, true), 'mark', 'a call that took the answer is owed nothing, whatever else is open');
    assert.equal(askDue(false, true), 'mark');
    assert.match(askWords(askOf(RAW), { [question]: 'Cut it on read' }), /You asked: .+ They answered: Cut it on read/);
  });
});
