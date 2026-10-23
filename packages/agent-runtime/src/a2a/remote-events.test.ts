/**
 * A remote agent's Task as a transcript, and a subscription's answers as the moments a follow gives (`a2a/remote-events.ts`): pure, so
 * each order, each id given once and each cursor is one case here, with no agent behind it. The agent itself is
 * `test/remote-follow.test.ts`'s.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Role, TaskState, type Artifact, type Message, type Part, type StreamResponse, type Task } from '@a2a-js/sdk';
import { followedOfRemote, relayOf, relayOver, remoteCursorOf, transcriptOfTask } from './remote-events.ts';
import type { Followed } from '../harness/index.ts';

const SENT = '2026-10-07T10:00:00.000Z';
const AT = '2026-10-07T10:00:05.000Z';

const text = (value: string): Part => ({ content: { $case: 'text', value }, metadata: undefined, filename: '', mediaType: '' });
const message = (messageId: string, words: string, role = Role.ROLE_AGENT): Message => ({
  messageId,
  contextId: 'c-1',
  taskId: 't-1',
  role,
  parts: [text(words)],
  metadata: undefined,
  extensions: [],
  referenceTaskIds: [],
});
const artifact = (artifactId: string, name: string, ...words: string[]): Artifact => ({
  artifactId,
  name,
  description: '',
  parts: words.map(text),
  metadata: undefined,
  extensions: [],
});
const task = (state: TaskState, history: Message[], artifacts: Artifact[] = [], status?: Message): Task => ({
  id: 't-1',
  contextId: 'c-1',
  status: { state, message: status, timestamp: AT },
  artifacts,
  history,
  metadata: undefined,
});
const asked = message('m-0', 'review this', Role.ROLE_USER);

const ofTask = (t: Task): StreamResponse => ({ payload: { $case: 'task', value: t } });
const status = (state: TaskState, said?: Message): StreamResponse => ({
  payload: {
    $case: 'statusUpdate',
    value: { taskId: 't-1', contextId: 'c-1', status: { state, message: said, timestamp: AT }, metadata: undefined },
  },
});
const chunk = (artifactId: string, words: string, append: boolean, lastChunk: boolean): StreamResponse => ({
  payload: {
    $case: 'artifactUpdate',
    value: { taskId: 't-1', contextId: 'c-1', artifact: artifact(artifactId, 'result', words), append, lastChunk, metadata: undefined },
  },
});

/** Each moment as a line a reader can compare: its kind, then what it carries. */
const shown = (ms: Followed[]): string[] =>
  ms.map((m) =>
    m.kind === 'state'
      ? `state ${m.state}`
      : m.kind === 'partial'
        ? `partial ${m.key} ${JSON.stringify(m.text)}${m.append ? ' +' : ''}${m.last ? ' last' : ''}`
        : `events ${m.events.map((e) => `${e.role} ${e.id} ${JSON.stringify(e.text)}`).join(', ')}`,
  );

/** Each row: one reading of a Task, or one follow of it, and what it gives. Rows share nothing: each builds its own relay. */
const ROWS: Array<{ name: string; run: () => void }> = [
  {
    name: 'a Task as a transcript: its messages in order, its status message where the history lacks it, and its artifacts once the turn is over',
    run: () => {
      const working = task(TaskState.TASK_STATE_WORKING, [asked, message('m-1', 'reading')], [artifact('a-1', 'result', 'half')]);
      const read = transcriptOfTask(working, SENT, 0);
      assert.deepEqual(
        read.events.map((e) => [e.id, e.role, e.text, e.at]),
        [
          ['m-0', 'user', 'review this', AT],
          ['m-1', 'assistant', 'reading', AT],
        ],
        'an artifact of the turn at work is not whole yet: it is no event',
      );
      const done = task(
        TaskState.TASK_STATE_COMPLETED,
        [asked, message('m-1', 'reading')],
        [artifact('a-1', 'transcript', 'all ', 'good')],
        message('m-2', 'done'),
      );
      assert.deepEqual(
        transcriptOfTask(done, SENT, 0).events.map((e) => [e.id, e.text]),
        [
          ['m-0', 'review this'],
          ['m-1', 'reading'],
          ['m-2', 'done'],
          ['artifact:a-1', 'all good'],
        ],
        "the status message after the history, then the artifact whole, its parts joined: one named `transcript` is the agent's words",
      );
      const noTime = { ...done, status: { ...done.status!, timestamp: '' } };
      assert.equal(transcriptOfTask(noTime, SENT, 0).events[0].at, SENT, 'no status time: when the message was sent');
    },
  },
  {
    name: 'a cursor reads only what follows it; an unknown cursor, or one past a message the Task lacks, reads from the start',
    run: () => {
      const first = task(TaskState.TASK_STATE_INPUT_REQUIRED, [asked, message('m-1', 'which file?')], [artifact('a-1', 'result', 'plan')]);
      const read = transcriptOfTask(first, SENT, 0);
      assert.equal(read.cursor, remoteCursorOf('m-1', 1));
      const next = task(
        TaskState.TASK_STATE_WORKING,
        [asked, message('m-1', 'which file?'), message('m-2', 'main.ts', Role.ROLE_USER)],
        [artifact('a-1', 'result', 'plan'), artifact('a-2', 'result', 'half')],
      );
      const later = transcriptOfTask(next, SENT, 1, read.cursor);
      assert.deepEqual(
        later.events.map((e) => e.id),
        ['m-2'],
        'the next turn: only its message; the plan was given, and the artifact it writes is not whole yet',
      );
      assert.equal(later.cursor, remoteCursorOf('m-2', 1));
      assert.deepEqual(
        transcriptOfTask(next, SENT, 1).events.map((e) => e.id),
        ['m-0', 'm-1', 'm-2', 'artifact:a-1'],
        'from the start, at work: the artifact an earlier turn wrote is whole, the one this turn writes is not',
      );
      for (const after of ['0.0000000000000000', 'remote.0.bm8tc3VjaA', 'garbage'])
        assert.deepEqual(
          transcriptOfTask(first, SENT, 0, after).events.map((e) => e.id),
          ['m-0', 'm-1', 'artifact:a-1'],
          `${after}: from the start`,
        );
      assert.deepEqual(transcriptOfTask(first, SENT, 0, remoteCursorOf('', 0)).events.length, 3, 'the cursor before any message');
    },
  },
  {
    name: 'a followed Task in order: its state, the pieces of an artifact as sent, the artifact whole at its last chunk, a status message, the end; each once',
    run: () => {
      const r = relayOf(SENT);
      const said: Followed[] = [];
      const answers: StreamResponse[] = [
        ofTask(task(TaskState.TASK_STATE_WORKING, [asked])),
        chunk('a-1', 'Hel', false, false),
        chunk('a-1', 'lo', true, false),
        chunk('a-1', '!', true, true),
        status(TaskState.TASK_STATE_WORKING, message('m-1', 'wrote it')),
        status(TaskState.TASK_STATE_WORKING, message('m-1', 'wrote it')),
        chunk('a-1', 'again', true, true),
        status(TaskState.TASK_STATE_COMPLETED),
      ];
      for (const [i, a] of answers.entries()) said.push(...followedOfRemote(r, a, i === 0));
      assert.deepEqual(shown(said), [
        'state working',
        'partial artifact:a-1 "Hel"',
        'partial artifact:a-1 "lo" +',
        'partial artifact:a-1 "!" + last',
        'events assistant artifact:a-1 "Hello!"',
        'events assistant m-1 "wrote it"',
        'state completed',
      ]);
      assert.ok(relayOver(r), 'the turn is over: nothing more to follow');
      const cursors = said.flatMap((m) => (m.kind === 'events' ? [m.cursor] : []));
      assert.deepEqual(cursors, [remoteCursorOf('m-0', 1), remoteCursorOf('m-1', 1)], 'each events moment carries the cursor after it');
    },
  },
  {
    name: "the first Task is the transcript's: its state first, its messages and whole artifacts counted said, an artifact being written its text so far",
    run: () => {
      const r = relayOf(SENT, 1);
      const t = task(
        TaskState.TASK_STATE_WORKING,
        [asked, message('m-1', 'on it')],
        [artifact('a-0', 'result', 'earlier'), artifact('a-1', 'result', 'Hel')],
      );
      assert.deepEqual(shown(followedOfRemote(r, ofTask(t), true)), ['state working', 'partial artifact:a-1 "Hel"']);
      assert.deepEqual(shown(followedOfRemote(r, chunk('a-1', 'lo', true, true))), [
        'partial artifact:a-1 "lo" + last',
        'events assistant artifact:a-1 "Hello"',
      ]);
      assert.deepEqual(followedOfRemote(r, ofTask(t)), [], 'the same Task read again gives nothing: each id once');
    },
  },
  {
    name: 'a Task read after a drop gives what the drop missed: a message, the open artifact whole so far, the state; then the rest whole at the end',
    run: () => {
      const r = relayOf(SENT);
      followedOfRemote(r, ofTask(task(TaskState.TASK_STATE_WORKING, [asked])), true);
      followedOfRemote(r, chunk('a-1', 'He', false, false));
      const missed = task(
        TaskState.TASK_STATE_INPUT_REQUIRED,
        [asked, message('m-1', 'which file?')],
        [artifact('a-1', 'result', 'Hello')],
      );
      const atWork = task(TaskState.TASK_STATE_WORKING, [asked, message('m-1', 'reading')], [artifact('a-1', 'result', 'Hell')]);
      assert.deepEqual(
        shown(followedOfRemote(r, ofTask(atWork))),
        ['partial artifact:a-1 "Hell"', 'events assistant m-1 "reading"'],
        'at work: the artifact whole so far, the message missed',
      );
      const r2 = relayOf(SENT);
      followedOfRemote(r2, ofTask(task(TaskState.TASK_STATE_WORKING, [asked])), true);
      followedOfRemote(r2, chunk('a-1', 'He', false, false));
      assert.deepEqual(
        shown(followedOfRemote(r2, ofTask(missed))),
        ['events assistant m-1 "which file?", assistant artifact:a-1 "Hello"', 'state input-required'],
        'the turn over: the artifact whole, after the message the drop missed, then the state',
      );
      assert.ok(relayOver(r2));
    },
  },
];

test('transcriptOfTask and followedOfRemote: a Task read whole or followed gives each message and whole artifact once, in order, from its cursor', async (t) => {
  for (const row of ROWS) await t.test(row.name, () => row.run());
});
