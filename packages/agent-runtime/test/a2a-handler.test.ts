/**
 * A harness as an A2A agent (`src/a2a-handler.ts`), called directly with a `ServerCallContext`, over a driver a test
 * moves by hand and a journal in memory.
 *
 * Every refusal is made to refuse here, at shipped defaults, and asked of a harness that must then have been asked for
 * nothing: a refusal that still spawned would pass a test that only read the error.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { Role, TaskState, type Message, type SendMessageRequest } from '@a2a-js/sdk';
import { ServerCallContext } from '@a2a-js/sdk/server';
import {
  ExtendedAgentCardNotConfiguredError, PushNotificationNotSupportedError, RequestMalformedError, TaskNotCancelableError,
  TaskNotFoundError, UnsupportedOperationError,
} from '@a2a-js/sdk/errors';
import { HarnessFailed, HarnessHandler, OPEN_LISTINGS } from '../src/a2a-handler.ts';
import { messageOf, sightingOf, wordsOf } from '../src/a2a-map.ts';
import type { Event, Sighting } from '../src/domain.ts';
import { RunnerError, type RunnerOps, type SpawnRequest } from '../src/runner.ts';

const ctx = new ServerCallContext();

/** A harness a test moves by hand, what it was asked, and a journal in memory, behind one handler. */
const harness = (o: { spawnFails?: unknown; stopFails?: string; observeFails?: string } = {}) => {
  const sessions = new Map<string, Sighting>();
  const asked: Array<[string, unknown]> = [];
  const journal = new Map<string, Event[]>();
  let n = 0;
  const ops: RunnerOps = {
    spawn: (r: SpawnRequest) => Effect.suspend(() => {
      asked.push(['spawn', r]);
      if (o.spawnFails instanceof RunnerError) return Effect.fail(o.spawnFails);
      if (o.spawnFails) return Effect.die(o.spawnFails);
      sessions.set(r.name, { sessionId: `s-${++n}`, state: 'working', busy: true });
      return Effect.void;
    }),
    observe: Effect.suspend(() => {
      asked.push(['observe', undefined]);
      return o.observeFails ? Effect.fail(new RunnerError({ verb: 'observe', message: o.observeFails })) : Effect.succeed(new Map(sessions));
    }),
    stop: (id) => Effect.suspend(() => {
      asked.push(['stop', id]);
      if (o.stopFails) return Effect.fail(new RunnerError({ verb: 'stop', message: o.stopFails }));
      for (const [name, s] of sessions) if (s.sessionId === id) sessions.set(name, { ...s, state: 'stopped', busy: false });
      return Effect.void;
    }),
    logs: () => Effect.succeed(''),
  };
  const handler = new HarnessHandler('fake', ops, async (id) => journal.get(id) ?? []);
  /** What the harness was asked, reads left out. */
  const acted = () => asked.filter(([verb]) => verb !== 'observe');
  return { handler, sessions, asked, acted, journal };
};

const spawn = (name = 'ae/t-1/1', change: Partial<Message> = {}, configuration: SendMessageRequest['configuration'] = {
  acceptedOutputModes: [], taskPushNotificationConfig: undefined, returnImmediately: true,
}): SendMessageRequest => ({
  tenant: '', message: { ...messageOf({ name, brief: 'do it', cwd: '/repo', harness: 'fake', config: { model: 'opus' } }, 'm-1'), ...change },
  configuration, metadata: undefined,
});

const listing = (change: { pageSize?: number; pageToken?: string; contextId?: string; status?: TaskState; statusTimestampAfter?: string } = {}) => ({
  tenant: '', contextId: '', status: TaskState.TASK_STATE_UNSPECIFIED, pageToken: '', statusTimestampAfter: undefined, ...change,
});

/** Refused with `kind`, in exactly `words`. */
const refusedWith = (kind: new (...a: never[]) => Error, words: string) => (e: Error) => {
  assert.ok(e instanceof kind, `refused with ${e.name}: ${e.message}`);
  assert.equal(e.message, words);
  return true;
};

type H = ReturnType<typeof harness>;
const REFUSALS: Array<[string, (h: H) => Promise<unknown>, (e: Error) => boolean]> = [
  ['a spawn not sent returnImmediately', (h) => h.handler.sendMessage(spawn('ae/t-1/1', {}, { acceptedOutputModes: [], taskPushNotificationConfig: undefined, returnImmediately: false }), ctx),
    refusedWith(UnsupportedOperationError, 'this agent answers once the session starts: send returnImmediately and poll getTask.')],
  ['a spawn with no configuration', (h) => h.handler.sendMessage({ ...spawn(), configuration: undefined }, ctx),
    refusedWith(UnsupportedOperationError, 'this agent answers once the session starts: send returnImmediately and poll getTask.')],
  ['a spawn with no message', (h) => h.handler.sendMessage({ ...spawn(), message: undefined }, ctx),
    refusedWith(RequestMalformedError, 'the request has no message: a spawn is one user message.')],
  ['a spawn that names no task', (h) => h.handler.sendMessage(spawn('ae/t-1/1', { taskId: '' }), ctx),
    refusedWith(RequestMalformedError, 'the message names no task: send the session name, `ae/<task>/<n>`, as its taskId.')],
  ['a spawn under a name that is not a session name', (h) => h.handler.sendMessage(spawn('ae/t-1/0', { contextId: '' }), ctx),
    refusedWith(RequestMalformedError, '`ae/t-1/0` is not a session name: a session is named `ae/<task>/<n>`, n from 1.')],
  ["a spawn whose context is not its name's task", (h) => h.handler.sendMessage(spawn('ae/t-1/1', { contextId: 't-2' }), ctx),
    refusedWith(RequestMalformedError, "the message's contextId `t-2` is not the task its name carries, `t-1`: send that, or none.")],
  ['a spawn said by the agent', (h) => h.handler.sendMessage(spawn('ae/t-1/1', { role: Role.ROLE_AGENT }), ctx),
    refusedWith(RequestMalformedError, 'a spawn is a message from the user: its role is ROLE_USER.')],
  ['a spawn with no text part', (h) => h.handler.sendMessage(spawn('ae/t-1/1', {
    parts: [{ content: { $case: 'data', value: { brief: 'do it' } }, metadata: undefined, filename: '', mediaType: '' }],
  }), ctx), refusedWith(RequestMalformedError, 'the brief is one text part, and this message has one part that is not text.')],
  ['a spawn with two parts', (h) => h.handler.sendMessage(spawn('ae/t-1/1', {
    parts: [0, 1].map(() => ({ content: { $case: 'text' as const, value: 'do it' }, metadata: undefined, filename: '', mediaType: '' })),
  }), ctx), refusedWith(RequestMalformedError, 'the brief is one text part, and this message has 2 parts.')],
  ['a spawn with no cwd', (h) => h.handler.sendMessage(spawn('ae/t-1/1', { metadata: { harness: 'fake' } }), ctx),
    refusedWith(RequestMalformedError, "the message's metadata has no `cwd`: say where the session works.")],
  ['a page of none', (h) => h.handler.listTasks(listing({ pageSize: 0 }), ctx),
    refusedWith(RequestMalformedError, '`pageSize: 0` is not a page: give a whole number from 1 to 100, or none for 50.')],
  ['a page of 101', (h) => h.handler.listTasks(listing({ pageSize: 101 }), ctx),
    refusedWith(RequestMalformedError, '`pageSize: 101` is not a page: give a whole number from 1 to 100, or none for 50.')],
  ['a page of 1.5', (h) => h.handler.listTasks(listing({ pageSize: 1.5 }), ctx),
    refusedWith(RequestMalformedError, '`pageSize: 1.5` is not a page: give a whole number from 1 to 100, or none for 50.')],
  ['a page of a listing never made', (h) => h.handler.listTasks(listing({ pageToken: '1:1' }), ctx),
    refusedWith(RequestMalformedError, '`pageToken: 1:1` is not a page of a listing still open: list again from the first page.')],
  ['a page token that is no token', (h) => h.handler.listTasks(listing({ pageToken: 'next' }), ctx),
    refusedWith(RequestMalformedError, '`pageToken: next` is not a page of a listing still open: list again from the first page.')],
  ['a listing since a time', (h) => h.handler.listTasks(listing({ statusTimestampAfter: '2026-09-23T00:00:00Z' }), ctx),
    refusedWith(UnsupportedOperationError, 'this agent cannot filter by `statusTimestampAfter`: a session carries no time of its state. List without it.')],
  ['a session nobody knows', (h) => h.handler.getTask({ tenant: '', id: 'ae/t-9/1' }, ctx),
    refusedWith(TaskNotFoundError, 'no session `ae/t-9/1`: the `fake` harness lists none, and no attempt was journalled under it.')],
  ['a session under no session name', (h) => h.handler.getTask({ tenant: '', id: 'fake-1' }, ctx),
    refusedWith(TaskNotFoundError, 'no session `fake-1`: the `fake` harness lists none, and no attempt was journalled under it.')],
  ['a stop of a session nobody lists', (h) => h.handler.cancelTask({ tenant: '', id: 'ae/t-9/1', metadata: undefined }, ctx),
    refusedWith(TaskNotFoundError, 'no session `ae/t-9/1` for the `fake` harness to stop: it lists none.')],
  ['a stop of a session that is done', (h) => { h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'done' }); return h.handler.cancelTask({ tenant: '', id: 'ae/t-1/1', metadata: undefined }, ctx); },
    refusedWith(TaskNotCancelableError, 'session `ae/t-1/1` has ended (done): there is nothing to stop.')],
  ['a stop of a session that failed', (h) => { h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'failed' }); return h.handler.cancelTask({ tenant: '', id: 'ae/t-1/1', metadata: undefined }, ctx); },
    refusedWith(TaskNotCancelableError, 'session `ae/t-1/1` has ended (failed): there is nothing to stop.')],
  ['a stream', (h) => h.handler.sendMessageStream(spawn(), ctx).next(),
    refusedWith(UnsupportedOperationError, 'this agent does not stream: send the message with returnImmediately and poll getTask.')],
  ['a resubscription', (h) => h.handler.resubscribe({ tenant: '', id: 'ae/t-1/1' }, ctx).next(),
    refusedWith(UnsupportedOperationError, 'this agent does not stream: poll getTask.')],
  ['a push config set', (h) => h.handler.createTaskPushNotificationConfig({ tenant: '', id: 'p', taskId: 'ae/t-1/1', url: 'http://x', token: '', authentication: undefined }, ctx),
    refusedWith(PushNotificationNotSupportedError, 'the `fake` harness sends no notifications: poll getTask.')],
  ['a push config read', (h) => h.handler.getTaskPushNotificationConfig({ tenant: '', taskId: 'ae/t-1/1', id: 'p' }, ctx),
    refusedWith(PushNotificationNotSupportedError, 'the `fake` harness sends no notifications: poll getTask.')],
  ['a push config listing', (h) => h.handler.listTaskPushNotificationConfigs({ tenant: '', taskId: 'ae/t-1/1', pageSize: 1, pageToken: '' }, ctx),
    refusedWith(PushNotificationNotSupportedError, 'the `fake` harness sends no notifications: poll getTask.')],
  ['a push config deleted', (h) => h.handler.deleteTaskPushNotificationConfig({ tenant: '', taskId: 'ae/t-1/1', id: 'p' }, ctx),
    refusedWith(PushNotificationNotSupportedError, 'the `fake` harness sends no notifications: poll getTask.')],
  ['an extended card', (h) => h.handler.getAuthenticatedExtendedAgentCard({ tenant: '' }, ctx),
    refusedWith(ExtendedAgentCardNotConfiguredError, 'the `fake` harness has no extended card: its card is the whole of it.')],
];

for (const [what, ask, says] of REFUSALS) {
  test(`the handler refuses ${what}, and asks the harness for nothing`, async () => {
    const h = harness();
    await assert.rejects(ask(h), says);
    assert.deepEqual(h.acted(), []);
  });
}

test('listings overlap: each is paged from the listing its token names, whatever was listed since', async () => {
  const h = harness();
  for (let i = 1; i <= 3; i++) h.sessions.set(`ae/t-${i}/1`, { sessionId: `s-${i}`, state: 'working' });
  const first = await h.handler.listTasks(listing({ pageSize: 2 }), ctx);
  assert.equal(first.nextPageToken, '1:2');
  // A second listing, made while the first is still being paged, sees a harness that moved.
  h.sessions.set('ae/t-4/1', { sessionId: 's-4', state: 'working' });
  const second = await h.handler.listTasks(listing({ pageSize: 2 }), ctx);
  assert.equal(second.nextPageToken, '2:2');
  const rest = await h.handler.listTasks(listing({ pageSize: 2, pageToken: first.nextPageToken }), ctx);
  assert.deepEqual(rest.tasks.map((t) => t.id), ['ae/t-3/1'], 'the first listing, as it was when it was made');
  assert.equal(rest.nextPageToken, '');
  const theirs = await h.handler.listTasks(listing({ pageSize: 2, pageToken: second.nextPageToken }), ctx);
  assert.deepEqual(theirs.tasks.map((t) => t.id), ['ae/t-3/1', 'ae/t-4/1']);
  assert.equal(h.asked.filter(([verb]) => verb === 'observe').length, 2, 'one observe a listing');
});

test('REFUSED: a page of a listing whose last page was served, of one dropped, of other filters, or past its end', async () => {
  const h = harness();
  for (let i = 1; i <= 3; i++) h.sessions.set(`ae/t-${i}/1`, { sessionId: `s-${i}`, state: 'working' });
  const refused = (token: string) => refusedWith(RequestMalformedError, `\`pageToken: ${token}\` is not a page of a listing still open: list again from the first page.`);

  // Served to its end: its pages are gone with it.
  const done = await h.handler.listTasks(listing({ pageSize: 2 }), ctx);
  await h.handler.listTasks(listing({ pageSize: 2, pageToken: done.nextPageToken }), ctx);
  await assert.rejects(h.handler.listTasks(listing({ pageSize: 2, pageToken: done.nextPageToken }), ctx), refused(done.nextPageToken));

  // Left part-way, then outnumbered: the oldest of more than OPEN_LISTINGS open is dropped, and the rest still served.
  const tokens: string[] = [];
  for (let i = 0; i <= OPEN_LISTINGS; i++) tokens.push((await h.handler.listTasks(listing({ pageSize: 1 }), ctx)).nextPageToken);
  await assert.rejects(h.handler.listTasks(listing({ pageSize: 1, pageToken: tokens[0] }), ctx), refused(tokens[0]!));
  assert.equal((await h.handler.listTasks(listing({ pageSize: 1, pageToken: tokens[1] }), ctx)).tasks.length, 1);
  assert.equal((await h.handler.listTasks(listing({ pageSize: 1, pageToken: tokens.at(-1) }), ctx)).tasks.length, 1);

  const open = await h.handler.listTasks(listing({ pageSize: 1 }), ctx);
  await assert.rejects(h.handler.listTasks(listing({ pageSize: 1, pageToken: open.nextPageToken, contextId: 't-2' }), ctx),
    refusedWith(RequestMalformedError, 'a page is asked for with other filters than its listing: ask every page with the filters of the first.'));
  const past = open.nextPageToken.replace(/:[0-9]+$/, ':4');
  await assert.rejects(h.handler.listTasks(listing({ pageSize: 1, pageToken: past }), ctx), refused(past));
});

test('a spawn the harness takes: the request reaches it whole, and the Task is working, with the message that asked', async () => {
  const h = harness();
  const asked = spawn('ae/t-1/1');
  const t = await h.handler.sendMessage(asked, ctx);
  assert.deepEqual(h.acted(), [['spawn', {
    name: 'ae/t-1/1', brief: 'do it', cwd: '/repo', harness: 'fake', config: { model: 'opus' },
    closeoutSchema: undefined, budgetUsd: undefined, resumeFrom: undefined,
  }]]);
  assert.ok('status' in t);
  assert.equal(t.id, 'ae/t-1/1');
  assert.equal(t.contextId, 't-1');
  assert.equal(t.status!.state, TaskState.TASK_STATE_WORKING);
  assert.deepEqual(t.history, [asked.message]);
});

test('a spawn the harness refused is REJECTED in its words; one that failed otherwise is SUBMITTED in its words', async () => {
  const refused = harness({ spawnFails: new RunnerError({ verb: 'spawn', message: 'fake: no binary called `fake` on PATH', refused: true }) });
  const r = await refused.handler.sendMessage(spawn(), ctx);
  assert.ok('status' in r);
  assert.equal(r.status!.state, TaskState.TASK_STATE_REJECTED);
  assert.equal(wordsOf(r), 'fake: no binary called `fake` on PATH');

  const ambiguous = harness({ spawnFails: new RunnerError({ verb: 'spawn', message: 'fake: the launcher lost its acknowledgement' }) });
  const a = await ambiguous.handler.sendMessage(spawn(), ctx);
  assert.ok('status' in a);
  assert.equal(a.status!.state, TaskState.TASK_STATE_SUBMITTED);
  assert.equal(wordsOf(a), 'fake: the launcher lost its acknowledgement');
});

test('a spawn whose driver threw a defect lets it through as it is: a bug is not a harness speaking', async () => {
  const defect = new TypeError('cannot read properties of undefined');
  const h = harness({ spawnFails: defect });
  await assert.rejects(h.handler.sendMessage(spawn(), ctx), (e) => e === defect);
});

test('listing 250 sessions: sorted by name, in pages, every sighting whole, and filtered by context and by state', async () => {
  const h = harness();
  const names: string[] = [];
  for (let i = 250; i >= 1; i--) {
    const name = `ae/t-${String(i).padStart(3, '0')}/${i % 2 ? 1 : 2}`;
    names.push(name);
    h.sessions.set(name, { sessionId: `s-${i}`, state: i % 5 === 0 ? 'blocked' : 'working', nativeId: `n-${i}`, usage: { turns: i } });
  }
  const seen: string[] = [];
  const sizes: number[] = [];
  let token = '';
  do {
    const page = await h.handler.listTasks(listing({ pageSize: 100, pageToken: token }), ctx);
    sizes.push(page.tasks.length);
    assert.equal(page.totalSize, 250);
    for (const t of page.tasks) {
      seen.push(t.id);
      assert.deepEqual(sightingOf(t), h.sessions.get(t.id));
    }
    token = page.nextPageToken;
  } while (token);
  assert.deepEqual(sizes, [100, 100, 50]);
  assert.deepEqual(seen, [...names].sort());
  assert.equal(h.asked.filter(([verb]) => verb === 'observe').length, 1, 'one observe for the whole listing');

  const one = await h.handler.listTasks(listing({ contextId: 't-007' }), ctx);
  assert.deepEqual(one.tasks.map((t) => t.id), ['ae/t-007/1']);
  const blocked = await h.handler.listTasks(listing({ status: TaskState.TASK_STATE_INPUT_REQUIRED }), ctx);
  assert.equal(blocked.totalSize, 50);
  assert.equal(blocked.tasks.length, 50, 'no pageSize is a page of 50');
  assert.equal(blocked.nextPageToken, '');
});

test('a listing the harness could not make throws its words, unchanged', async () => {
  const h = harness({ observeFails: 'fake agents: registry unreachable (exit 7)' });
  await assert.rejects(h.handler.listTasks(listing(), ctx), refusedWith(HarnessFailed, 'fake agents: registry unreachable (exit 7)'));
});

test('a session is answered as the harness sees it, and else as the journal has its attempt', async () => {
  const h = harness();
  h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'blocked', waitingFor: 'permission prompt' });
  const live = await h.handler.getTask({ tenant: '', id: 'ae/t-1/1' }, ctx);
  assert.equal(live.status!.state, TaskState.TASK_STATE_INPUT_REQUIRED);
  assert.deepEqual(sightingOf(live), { sessionId: 's-1', state: 'blocked', waitingFor: 'permission prompt' });

  const at = '2026-09-23T10:00:00.000Z';
  const filed: Event = { kind: 'filed', at, brief: 'b', cwd: '/r', maxAttempts: 4 };
  h.journal.set('t-2', [
    filed,
    { kind: 'starting', at, attempt: 1 },
    { kind: 'ended', at, attempt: 1, sessionId: '(never started)', observed: 'failed', reason: 'unstartable', error: 'fake: no binary' },
    { kind: 'starting', at, attempt: 2 },
    { kind: 'spawned', at, attempt: 2 },
    { kind: 'ended', at, attempt: 2, sessionId: 's-2', observed: 'done', reason: 'harness' },
    { kind: 'starting', at, attempt: 3 },
    { kind: 'spawned', at, attempt: 3 },
    { kind: 'ended', at, attempt: 3, sessionId: 's-3', observed: 'stopped', reason: 'operator' },
    { kind: 'starting', at, attempt: 4 },
  ]);
  const answer = async (id: string) => h.handler.getTask({ tenant: '', id }, ctx);
  const unstartable = await answer('ae/t-2/1');
  assert.equal(unstartable.status!.state, TaskState.TASK_STATE_REJECTED);
  assert.equal(wordsOf(unstartable), 'fake: no binary');
  assert.equal((await answer('ae/t-2/2')).status!.state, TaskState.TASK_STATE_COMPLETED);
  assert.equal((await answer('ae/t-2/3')).status!.state, TaskState.TASK_STATE_CANCELED);
  const open = await answer('ae/t-2/4');
  assert.equal(open.status!.state, TaskState.TASK_STATE_SUBMITTED);
  assert.equal(open.contextId, 't-2');
  await assert.rejects(answer('ae/t-2/5'), TaskNotFoundError);
  assert.deepEqual(h.acted(), []);
});

test('a stop: a live session is stopped and CANCELED, one already stopped is CANCELED again, and the harness asked once', async () => {
  const h = harness();
  h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'working', busy: true });
  h.sessions.set('ae/t-2/1', { sessionId: 's-2', state: 'blocked' });
  const cancel = (id: string) => h.handler.cancelTask({ tenant: '', id, metadata: undefined }, ctx);
  assert.equal((await cancel('ae/t-1/1')).status!.state, TaskState.TASK_STATE_CANCELED);
  assert.equal((await cancel('ae/t-2/1')).status!.state, TaskState.TASK_STATE_CANCELED);
  assert.equal(h.sessions.get('ae/t-1/1')!.state, 'stopped');
  assert.equal((await cancel('ae/t-1/1')).status!.state, TaskState.TASK_STATE_CANCELED, 'a repeat cancel answers as the first');
  assert.deepEqual(h.acted(), [['stop', 's-1'], ['stop', 's-2']]);
});

test("a stop the harness failed throws the harness's words, unchanged", async () => {
  const h = harness({ stopFails: 'fake stop s-1: no such session (exit 1)' });
  h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'working' });
  await assert.rejects(h.handler.cancelTask({ tenant: '', id: 'ae/t-1/1', metadata: undefined }, ctx),
    refusedWith(HarnessFailed, 'fake stop s-1: no such session (exit 1)'));
});

test("the harness's card: its name, no streaming, no notifications, text in and out", async () => {
  const card = await harness().handler.getAgentCard();
  assert.equal(card.name, 'fake');
  assert.deepEqual(card.capabilities, { streaming: false, pushNotifications: false, extensions: [], extendedAgentCard: false });
  assert.deepEqual([card.defaultInputModes, card.defaultOutputModes], [['text/plain'], ['text/plain']]);
});
