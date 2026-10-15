/**
 * A chat projected from fixtures: the agent's words and tool calls, the session line between attempts, the keeper's words as markers
 * and the person's as their own once a mark claims the said, a page across the session line, the stream's cursor, and the presence in
 * each state and in several at once.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  changedSince,
  chatCursor,
  chatPage,
  cursorOf,
  framedForHer,
  presenceOf,
  projectChat,
  readChatCursor,
  sourcesAt,
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
  phase: 'idle',
  ...over,
});

const shape = (events: readonly ChatEvent[]) =>
  events.map((e) => (e.kind === 'message' ? `${e.from}:${e.text}` : e.kind === 'step' ? `step:${e.state}:${e.sentence}` : e.kind));

test("history across two sessions: the agent's words and steps, a line between them, newest last, and no user line", () => {
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

test('a step done carries its duration; the last one open is running, or waits where the task needs the person', () => {
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

test("the keeper's words are a marker after the event they followed; a said a mark claims is the person's message with their text", () => {
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
});

test("an outbox entry no said carries yet is the person's, undelivered, last", () => {
  const events = projectChat(twoSessions({ outbox: [{ id: 'o2', at: at(30), text: 'Are you there?' }] }));
  assert.deepEqual(events.at(-1), { kind: 'message', id: 'p:o2', at: at(30), from: 'person', text: 'Are you there?', delivered: null });
});

test('a page across the session line holds the line, and gives the id of the page before it; the first page has none', () => {
  const events = projectChat(twoSessions());
  const last = chatPage(events, undefined, 2);
  assert.deepEqual(shape(last.events), ['session', 'agent:Back.']);
  const older = chatPage(events, last.before ?? undefined, 10);
  assert.deepEqual(shape(older.events), ['agent:Hello.', 'step:done:Bash: nemia ls', 'step:error:Read: /x']);
  assert.equal(older.before, null);
});

test('REFUSED: a page of a size that is none, or before an id the chat does not hold', () => {
  const events = projectChat(twoSessions());
  for (const limit of [0, 201, 1.5])
    assert.throws(
      () => chatPage(events, undefined, limit),
      (err: Error) => /is no page size/.test(err.message),
    );
  assert.throws(
    () => chatPage(events, 'nope', 5),
    (err: Error) => err.message.startsWith('nope is no event of this chat'),
  );
});

test('a cursor round-trips, and what changed since it is the new events and those whose delivery changed', () => {
  const outbox = [{ id: 'o1', at: at(11), text: 'Hi' }];
  const before = twoSessions({ outbox });
  const cursor = chatCursor(cursorOf(before));
  assert.equal(cursor, '2.1.0.1.0');
  assert.deepEqual(readChatCursor(cursor), cursorOf(before));
  const now = twoSessions({
    outbox,
    said: [{ at: at(13), attempt: 2, text: framedForHer('Hi'), after: { kind: 'text', id: 'a2' } }],
    delivered: [{ id: 'o1', said: at(13), attempt: 2 }],
  });
  now.sessions[1] = { ...now.sessions[1]!, events: [...now.sessions[1]!.events, text('a3', 14, 'Hello again.')] };
  const changed = changedSince(projectChat(sourcesAt(now, readChatCursor(cursor), cursor)), projectChat(now));
  assert.deepEqual(shape(changed), ['person:Hi', 'agent:Hello again.']);
  assert.equal(changed[0]?.kind === 'message' && changed[0].delivered, at(13));
});

test('REFUSED: a cursor that is not five counts, or counts more than the chat holds, naming the fix', () => {
  for (const bad of ['', '1.2.3', 'a.b.c.d.e', '1.2.3.4.-1', '01.0.0.0.0'])
    assert.throws(
      () => readChatCursor(bad),
      (err: Error) => err.message.includes('is not a cursor a chat read gave: pass the `cursor`'),
    );
  assert.throws(
    () => sourcesAt(twoSessions(), readChatCursor('2.9.0.0.0'), '2.9.0.0.0'),
    (err: Error) => err.message.startsWith('2.9.0.0.0 is not a cursor a chat read gave'),
  );
  assert.throws(
    () => sourcesAt(twoSessions(), readChatCursor('3.0.0.0.0'), '3.0.0.0.0'),
    (err: Error) => /not a cursor/.test(err.message),
  );
});

test('presence in each state: down, up and idle, answering, waits on you, unread after the mark', () => {
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

test('presence in several states at once: answering, waits on you and unread', () => {
  const events = projectChat(twoSessions());
  assert.deepEqual(presenceOf('running (working)', 2, events, { through: 't:1:u1', at: at(40) }), {
    up: true,
    answering: true,
    waitsOnYou: 2,
    unread: 1,
  });
});
