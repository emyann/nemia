/**
 * A harness as an A2A agent (`src/a2a/handler.ts`), called directly with a `ServerCallContext`, over a driver a test
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
  ExtendedAgentCardNotConfiguredError,
  PushNotificationNotSupportedError,
  RequestMalformedError,
  TaskNotCancelableError,
  TaskNotFoundError,
  UnsupportedOperationError,
} from '@a2a-js/sdk/errors';
import { HarnessFailed, HarnessHandler, OPEN_LISTINGS, type TranscriptRequest } from '../src/a2a/handler.ts';
import { closeoutOf, followUpOf, messageOf, RUNTIME_EXTENSION, sightingOf, wordsOf } from '../src/a2a/map.ts';
import type { Event, Sighting } from '../src/core/domain.ts';
import { RunnerError, type ExpectedSession, type RunnerOps, type SpawnRequest } from '../src/harness/seam.ts';

const ctx = new ServerCallContext();

/**
 * A harness a test moves by hand, what it was asked, and a journal in memory, behind one handler. It has every verb a
 * driver may have — `find`, `release`, `quota`, `say`, `output`, `transcript`, `observeFor`, `forget`, `kept`, `compact` — unless
 * `bare`, which leaves
 * it the four every driver has; `noFind` takes `find` alone away. `acted` is what the harness was asked, reads left out.
 */
const harness = (
  o: {
    spawnFails?: unknown;
    stopFails?: string;
    observeFails?: string;
    sayFails?: string;
    findFails?: unknown;
    transcriptFails?: unknown;
    bare?: boolean;
    noFind?: boolean;
  } = {},
) => {
  const sessions = new Map<string, Sighting>();
  const unread = new Set<string>();
  const asked: Array<[string, unknown]> = [];
  const journal = new Map<string, Event[]>();
  let n = 0;
  const ops: RunnerOps = {
    spawn: (r: SpawnRequest) =>
      Effect.suspend(() => {
        asked.push(['spawn', r]);
        if (o.spawnFails instanceof RunnerError) return Effect.fail(o.spawnFails);
        if (o.spawnFails) return Effect.die(o.spawnFails);
        sessions.set(r.name, { sessionId: `s-${++n}`, state: 'working', busy: true });
        return Effect.void;
      }),
    observe: Effect.suspend(() => {
      asked.push(['observe', undefined]);
      return o.observeFails
        ? Effect.fail(new RunnerError({ verb: 'observe', message: o.observeFails }))
        : Effect.succeed(new Map(sessions));
    }),
    stop: (id) =>
      Effect.suspend(() => {
        asked.push(['stop', id]);
        if (o.stopFails) return Effect.fail(new RunnerError({ verb: 'stop', message: o.stopFails }));
        for (const [name, s] of sessions) if (s.sessionId === id) sessions.set(name, { ...s, state: 'canceled', busy: false });
        return Effect.void;
      }),
    logs: (id) =>
      Effect.suspend(() => {
        asked.push(['logs', id]);
        return Effect.succeed(`logs of ${id}`);
      }),
    ...(o.bare || o.noFind
      ? {}
      : {
          find: (name: string) =>
            Effect.suspend(() => {
              asked.push(['find', name]);
              if (o.findFails) return Effect.die(o.findFails);
              const s = sessions.get(name);
              return Effect.succeed(s ? { sessionId: s.sessionId } : undefined);
            }),
        }),
    ...(o.bare
      ? {}
      : {
          release: (session: Sighting, task: { worktree?: string | boolean }) =>
            Effect.suspend(() => {
              asked.push(['release', [session, task]]);
              return Effect.succeed(session.state === 'completed' ? { turns: 3, costUsd: 0.25 } : undefined);
            }),
          quota: Effect.suspend(() => {
            asked.push(['quota', undefined]);
            return Effect.succeed({ kind: 'no-plan' as const });
          }),
          say: (session: { name: string; sessionId: string }, text: string) =>
            Effect.suspend(() => {
              asked.push(['say', [session, text]]);
              return o.sayFails ? Effect.fail(new RunnerError({ verb: 'say', message: o.sayFails })) : Effect.void;
            }),
          /**
           * Told what is expected, it lists those alone: what a driver that reads less when told looks like. A name it was
           * told to leave unread (`unread`) it leaves unread, as a driver whose registry could not be read leaves one.
           */
          output: (name: string, stream: 'stdout' | 'stderr', lastBytes?: number) =>
            Effect.suspend(() => {
              asked.push(['output', [name, stream, lastBytes]]);
              return Effect.succeed(sessions.has(name) ? `${stream} of ${name}` : undefined);
            }),
          observeFor: (expected: readonly ExpectedSession[]) =>
            Effect.suspend(() => {
              asked.push(['observeFor', expected]);
              const seen = new Map([...sessions].filter(([name]) => expected.some((e) => e.name === name)));
              return Effect.succeed({ seen, unread: new Set(expected.map((e) => e.name).filter((name) => unread.has(name))) });
            }),
          forget: (session: { name: string; nativeId?: string }, options: { dry: boolean }) =>
            Effect.suspend(() => {
              asked.push(['forget', [session, options]]);
              return Effect.succeed({ files: [`/runs/${session.name}.json`], left: options.dry ? ['kept elsewhere'] : [] });
            }),
          kept: (sessions: readonly { name: string; nativeId?: string }[]) =>
            Effect.suspend(() => {
              asked.push(['kept', [sessions]]);
              return Effect.succeed(Object.fromEntries(sessions.map((s) => [s.name, { files: [`/runs/${s.name}.json`], records: [] }])));
            }),
          compact: (options: { dry: boolean }) =>
            Effect.suspend(() => {
              asked.push(['compact', options]);
              return Effect.succeed({ captures: 2, compacted: 1, before: 900, after: 300, left: [{ name: 'a.log', why: 'at work' }] });
            }),
          transcript: (sessionId: string, after?: string) =>
            Effect.suspend(() => {
              asked.push(['transcript', [sessionId, after]]);
              if (o.transcriptFails instanceof RunnerError) return Effect.fail(o.transcriptFails);
              if (o.transcriptFails) return Effect.die(o.transcriptFails);
              return Effect.succeed({
                events: [
                  {
                    id: 'e-1',
                    at: '2026-09-23T10:00:00.000Z',
                    role: 'assistant' as const,
                    kind: 'text' as const,
                    text: `said in ${sessionId}`,
                  },
                ],
                cursor: `${sessionId}@${after ?? 0}+1`,
              });
            }),
        }),
  };
  const handler = new HarnessHandler('fake', ops, async (id) => journal.get(id) ?? []);
  const acted = () => asked.filter(([verb]) => verb !== 'observe');
  return { handler, sessions, unread, asked, acted, journal };
};

const spawn = (
  name = 'ae/t-1/1',
  change: Partial<Message> = {},
  configuration: SendMessageRequest['configuration'] = {
    acceptedOutputModes: [],
    taskPushNotificationConfig: undefined,
    returnImmediately: true,
  },
): SendMessageRequest => ({
  tenant: '',
  message: { ...messageOf({ name, brief: 'do it', cwd: '/repo', harness: 'fake', config: { model: 'opus' } }, 'm-1'), ...change },
  configuration,
  metadata: undefined,
});

/** Words said to a session, as a client sends them: a follow-up on its Task, returnImmediately. */
const said = (name = 'ae/t-1/1', text = 'look at the tests again', change: Partial<Message> = {}): SendMessageRequest => ({
  tenant: '',
  message: { ...followUpOf(name, text, 'm-2'), ...change },
  configuration: { acceptedOutputModes: [], taskPushNotificationConfig: undefined, returnImmediately: true },
  metadata: undefined,
});

const listing = (
  change: { pageSize?: number; pageToken?: string; contextId?: string; status?: TaskState; statusTimestampAfter?: string } = {},
) => ({
  tenant: '',
  contextId: '',
  status: TaskState.TASK_STATE_UNSPECIFIED,
  pageToken: '',
  statusTimestampAfter: undefined,
  ...change,
});

/** Refused with `kind`, in exactly `words`. */
const refusedWith = (kind: new (...a: never[]) => Error, words: string) => (e: Error) => {
  assert.ok(e instanceof kind, `refused with ${e.name}: ${e.message}`);
  assert.equal(e.message, words);
  return true;
};

type H = ReturnType<typeof harness>;
type Setup = Parameters<typeof harness>[0];
const REFUSALS: Array<[string, (h: H) => Promise<unknown>, (e: Error) => boolean, Setup?]> = [
  [
    'a spawn not sent returnImmediately',
    (h) =>
      h.handler.sendMessage(
        spawn('ae/t-1/1', {}, { acceptedOutputModes: [], taskPushNotificationConfig: undefined, returnImmediately: false }),
        ctx,
      ),
    refusedWith(UnsupportedOperationError, 'this agent answers once the session starts: send returnImmediately and poll getTask.'),
  ],
  [
    'a spawn with no configuration',
    (h) => h.handler.sendMessage({ ...spawn(), configuration: undefined }, ctx),
    refusedWith(UnsupportedOperationError, 'this agent answers once the session starts: send returnImmediately and poll getTask.'),
  ],
  [
    'a spawn with no message',
    (h) => h.handler.sendMessage({ ...spawn(), message: undefined }, ctx),
    refusedWith(RequestMalformedError, 'the request has no message: a spawn is one user message.'),
  ],
  [
    'a spawn that names no task',
    (h) => h.handler.sendMessage(spawn('ae/t-1/1', { taskId: '' }), ctx),
    refusedWith(RequestMalformedError, 'the message names no task: send the session name, `ae/<task>/<n>`, as its taskId.'),
  ],
  [
    'a spawn under a name that is not a session name',
    (h) => h.handler.sendMessage(spawn('ae/t-1/0', { contextId: '' }), ctx),
    refusedWith(RequestMalformedError, '`ae/t-1/0` is not a session name: a session is named `ae/<task>/<n>`, n from 1.'),
  ],
  [
    'a spawn said by the agent',
    (h) => h.handler.sendMessage(spawn('ae/t-1/1', { role: Role.ROLE_AGENT }), ctx),
    refusedWith(RequestMalformedError, 'a spawn is a message from the user: its role is ROLE_USER.'),
  ],
  [
    'a spawn with no text part',
    (h) =>
      h.handler.sendMessage(
        spawn('ae/t-1/1', {
          parts: [{ content: { $case: 'data', value: { brief: 'do it' } }, metadata: undefined, filename: '', mediaType: '' }],
        }),
        ctx,
      ),
    refusedWith(RequestMalformedError, 'the brief is one text part, and this message has one part that is not text.'),
  ],
  [
    'a spawn with two parts',
    (h) =>
      h.handler.sendMessage(
        spawn('ae/t-1/1', {
          parts: [0, 1].map(() => ({
            content: { $case: 'text' as const, value: 'do it' },
            metadata: undefined,
            filename: '',
            mediaType: '',
          })),
        }),
        ctx,
      ),
    refusedWith(RequestMalformedError, 'the brief is one text part, and this message has 2 parts.'),
  ],
  [
    'a spawn with no cwd',
    (h) => h.handler.sendMessage(spawn('ae/t-1/1', { metadata: { harness: 'fake' } }), ctx),
    refusedWith(RequestMalformedError, "the message's metadata has no `cwd`: say where the session works."),
  ],
  [
    'a page of none',
    (h) => h.handler.listTasks(listing({ pageSize: 0 }), ctx),
    refusedWith(RequestMalformedError, '`pageSize: 0` is not a page: give a whole number from 1 to 100, or none for 50.'),
  ],
  [
    'a page of 101',
    (h) => h.handler.listTasks(listing({ pageSize: 101 }), ctx),
    refusedWith(RequestMalformedError, '`pageSize: 101` is not a page: give a whole number from 1 to 100, or none for 50.'),
  ],
  [
    'a page of 1.5',
    (h) => h.handler.listTasks(listing({ pageSize: 1.5 }), ctx),
    refusedWith(RequestMalformedError, '`pageSize: 1.5` is not a page: give a whole number from 1 to 100, or none for 50.'),
  ],
  [
    'a page of a listing never made',
    (h) => h.handler.listTasks(listing({ pageToken: '1:1' }), ctx),
    refusedWith(RequestMalformedError, '`pageToken: 1:1` is not a page of a listing still open: list again from the first page.'),
  ],
  [
    'a page token that is no token',
    (h) => h.handler.listTasks(listing({ pageToken: 'next' }), ctx),
    refusedWith(RequestMalformedError, '`pageToken: next` is not a page of a listing still open: list again from the first page.'),
  ],
  [
    'a listing since a time',
    (h) => h.handler.listTasks(listing({ statusTimestampAfter: '2026-09-23T00:00:00Z' }), ctx),
    refusedWith(
      UnsupportedOperationError,
      'this agent cannot filter by `statusTimestampAfter`: a session carries no time of its state. List without it.',
    ),
  ],
  [
    'a session nobody knows',
    (h) => h.handler.getTask({ tenant: '', id: 'ae/t-9/1' }, ctx),
    refusedWith(TaskNotFoundError, 'no session `ae/t-9/1`: the `fake` harness lists none, and no attempt was journalled under it.'),
  ],
  [
    'a session under no session name',
    (h) => h.handler.getTask({ tenant: '', id: 'fake-1' }, ctx),
    refusedWith(TaskNotFoundError, 'no session `fake-1`: the `fake` harness lists none, and no attempt was journalled under it.'),
  ],
  [
    'a stop of a session nobody lists',
    (h) => h.handler.cancelTask({ tenant: '', id: 'ae/t-9/1', metadata: undefined }, ctx),
    refusedWith(TaskNotFoundError, 'no session `ae/t-9/1` for the `fake` harness to stop: it lists none.'),
  ],
  [
    'a stop of a session that is done',
    (h) => {
      h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'completed' });
      return h.handler.cancelTask({ tenant: '', id: 'ae/t-1/1', metadata: undefined }, ctx);
    },
    refusedWith(TaskNotCancelableError, 'session `ae/t-1/1` has ended (done): there is nothing to stop.'),
  ],
  [
    'a stop of a session that failed',
    (h) => {
      h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'failed' });
      return h.handler.cancelTask({ tenant: '', id: 'ae/t-1/1', metadata: undefined }, ctx);
    },
    refusedWith(TaskNotCancelableError, 'session `ae/t-1/1` has ended (failed): there is nothing to stop.'),
  ],
  [
    'a stream',
    (h) => h.handler.sendMessageStream(spawn(), ctx).next(),
    refusedWith(UnsupportedOperationError, 'this agent does not stream: send the message with returnImmediately and poll getTask.'),
  ],
  [
    'a resubscription',
    (h) => h.handler.resubscribe({ tenant: '', id: 'ae/t-1/1' }, ctx).next(),
    refusedWith(UnsupportedOperationError, 'this agent does not stream: poll getTask.'),
  ],
  [
    'a push config set',
    (h) =>
      h.handler.createTaskPushNotificationConfig(
        { tenant: '', id: 'p', taskId: 'ae/t-1/1', url: 'http://x', token: '', authentication: undefined },
        ctx,
      ),
    refusedWith(PushNotificationNotSupportedError, 'the `fake` harness sends no notifications: poll getTask.'),
  ],
  [
    'a push config read',
    (h) => h.handler.getTaskPushNotificationConfig({ tenant: '', taskId: 'ae/t-1/1', id: 'p' }, ctx),
    refusedWith(PushNotificationNotSupportedError, 'the `fake` harness sends no notifications: poll getTask.'),
  ],
  [
    'a push config listing',
    (h) => h.handler.listTaskPushNotificationConfigs({ tenant: '', taskId: 'ae/t-1/1', pageSize: 1, pageToken: '' }, ctx),
    refusedWith(PushNotificationNotSupportedError, 'the `fake` harness sends no notifications: poll getTask.'),
  ],
  [
    'a push config deleted',
    (h) => h.handler.deleteTaskPushNotificationConfig({ tenant: '', taskId: 'ae/t-1/1', id: 'p' }, ctx),
    refusedWith(PushNotificationNotSupportedError, 'the `fake` harness sends no notifications: poll getTask.'),
  ],
  [
    'an extended card',
    (h) => h.handler.getAuthenticatedExtendedAgentCard({ tenant: '' }, ctx),
    refusedWith(ExtendedAgentCardNotConfiguredError, 'the `fake` harness has no extended card: its card is the whole of it.'),
  ],
  [
    'a message with no mark and no task: a new task, which only a spawn starts',
    (h) => h.handler.sendMessage(said('ae/t-1/1', 'hi', { taskId: '' }), ctx),
    refusedWith(
      RequestMalformedError,
      'a message with no taskId asks for a new task, and a session is started only by a spawn, marked `urn:agent-runtime:session:v1`: to speak to a running session, send its name, `ae/<task>/<n>`, as the taskId.',
    ),
  ],
  [
    'a spawn with its mark taken off: words to a session it names',
    (h) => h.handler.sendMessage(spawn('ae/t-1/1', { extensions: [] }), ctx),
    refusedWith(TaskNotFoundError, 'no session `ae/t-1/1` for the `fake` harness to hear anything: it lists none.'),
  ],
  [
    'words to a name that is not a session name',
    (h) => h.handler.sendMessage(said('fake-1'), ctx),
    refusedWith(RequestMalformedError, '`fake-1` is not a session name: a session is named `ae/<task>/<n>`, n from 1.'),
  ],
  [
    "words in a context that is not their session's",
    (h) => {
      h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'working', nativeId: 'conv-a' });
      return h.handler.sendMessage(said('ae/t-1/1', 'hi', { contextId: 'conv-b' }), ctx);
    },
    refusedWith(
      RequestMalformedError,
      "the message's contextId `conv-b` is not the context of session `ae/t-1/1`, `conv-a`: send that, or none.",
    ),
  ],
  [
    'words in a context, to a session none is known for yet',
    (h) => {
      h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'working' });
      return h.handler.sendMessage(said('ae/t-1/1', 'hi', { contextId: 't-1' }), ctx);
    },
    refusedWith(
      RequestMalformedError,
      "the message's contextId `t-1` is not the context of session `ae/t-1/1`, which has none known yet: send none.",
    ),
  ],
  [
    'words said by the agent',
    (h) => h.handler.sendMessage(said('ae/t-1/1', 'hi', { role: Role.ROLE_AGENT }), ctx),
    refusedWith(RequestMalformedError, 'words said to a session are a message from the user: its role is ROLE_USER.'),
  ],
  [
    'words that are not text',
    (h) =>
      h.handler.sendMessage(
        said('ae/t-1/1', 'hi', {
          parts: [{ content: { $case: 'data', value: { text: 'hi' } }, metadata: undefined, filename: '', mediaType: '' }],
        }),
        ctx,
      ),
    refusedWith(RequestMalformedError, 'words said to a session are one text part, and this message has one part that is not text.'),
  ],
  [
    'words in two parts',
    (h) =>
      h.handler.sendMessage(
        said('ae/t-1/1', 'hi', {
          parts: [0, 1].map(() => ({ content: { $case: 'text' as const, value: 'hi' }, metadata: undefined, filename: '', mediaType: '' })),
        }),
        ctx,
      ),
    refusedWith(RequestMalformedError, 'words said to a session are one text part, and this message has 2 parts.'),
  ],
  [
    'empty words',
    (h) => h.handler.sendMessage(said('ae/t-1/1', '  \n'), ctx),
    refusedWith(RequestMalformedError, 'the words are empty: give the words the session should hear.'),
  ],
  [
    'words not sent returnImmediately',
    (h) => h.handler.sendMessage({ ...said(), configuration: undefined }, ctx),
    refusedWith(UnsupportedOperationError, 'this agent answers once the session starts: send returnImmediately and poll getTask.'),
  ],
  [
    'words to a harness with no channel into a session',
    (h) => {
      h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'working' });
      return h.handler.sendMessage(said(), ctx);
    },
    refusedWith(
      UnsupportedOperationError,
      "the `fake` harness has no channel into a running session: it takes no words once a session has started. Once this session has ended, go on with its conversation by spawning a session of its own — a message marked `urn:agent-runtime:session:v1` — in this session's contextId.",
    ),
    { bare: true },
  ],
  [
    'words to a session nobody lists',
    (h) => h.handler.sendMessage(said('ae/t-9/1'), ctx),
    refusedWith(TaskNotFoundError, 'no session `ae/t-9/1` for the `fake` harness to hear anything: it lists none.'),
  ],
  [
    'words to a session that is done',
    (h) => {
      h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'completed' });
      return h.handler.sendMessage(said(), ctx);
    },
    refusedWith(UnsupportedOperationError, 'session `ae/t-1/1` has ended (done): it takes no more words.'),
  ],
  [
    'words to a session that failed',
    (h) => {
      h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'failed' });
      return h.handler.sendMessage(said(), ctx);
    },
    refusedWith(UnsupportedOperationError, 'session `ae/t-1/1` has ended (failed): it takes no more words.'),
  ],
  [
    'words to a session that was stopped',
    (h) => {
      h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'canceled' });
      return h.handler.sendMessage(said(), ctx);
    },
    refusedWith(UnsupportedOperationError, 'session `ae/t-1/1` has ended (stopped): it takes no more words.'),
  ],
  [
    'a find on a harness that cannot find',
    (h) => h.handler.findSession({ name: 'ae/t-1/1' }, ctx),
    refusedWith(UnsupportedOperationError, 'the `fake` harness cannot find a session by name: list its sessions (listTasks).'),
    { bare: true },
  ],
  [
    'a find of a name that is not a session name',
    (h) => h.handler.findSession({ name: 'ae/t-1/0' }, ctx),
    refusedWith(RequestMalformedError, '`ae/t-1/0` is not a session name: a session is named `ae/<task>/<n>`, n from 1.'),
  ],
  [
    'the logs of no session',
    (h) => h.handler.sessionLogs({ sessionId: '' }, ctx),
    refusedWith(RequestMalformedError, 'the request names no session: send the id its harness lists it under as `sessionId`.'),
  ],
  [
    'the output of a session on a harness that keeps no stream whole',
    (h) => h.handler.sessionOutput({ name: 'ae/t-1/1', stream: 'stdout' }, ctx),
    refusedWith(
      UnsupportedOperationError,
      "the `fake` harness keeps no stream whole: its session's logs are what it printed (sessionLogs).",
    ),
    { bare: true },
  ],
  [
    'the output of a name that is not a session name',
    (h) => h.handler.sessionOutput({ name: 'ae/t-1/0', stream: 'stdout' }, ctx),
    refusedWith(RequestMalformedError, '`ae/t-1/0` is not a session name: a session is named `ae/<task>/<n>`, n from 1.'),
  ],
  [
    'the output of a stream that is neither stdout nor stderr',
    (h) => h.handler.sessionOutput({ name: 'ae/t-1/1', stream: 'both' as never }, ctx),
    refusedWith(RequestMalformedError, '`both` is not a stream: ask for `stdout` or `stderr`.'),
  ],
  [
    'the output of no bytes',
    (h) => h.handler.sessionOutput({ name: 'ae/t-1/1', stream: 'stdout', lastBytes: 0 }, ctx),
    refusedWith(RequestMalformedError, '`lastBytes: 0` is not a count of bytes: give a whole number above 0, or none.'),
  ],
  [
    'a release on a harness with nothing to let go of',
    (h) => h.handler.releaseSession({ session: { sessionId: 's-1', state: 'completed' }, task: {} }, ctx),
    refusedWith(UnsupportedOperationError, 'the `fake` harness has nothing to let go of: its registry is the record.'),
    { bare: true },
  ],
  [
    'a forget on a harness that keeps nothing of a session',
    (h) => h.handler.forgetSession({ session: { name: 'ae/t-1/1' }, dry: true }, ctx),
    refusedWith(UnsupportedOperationError, 'the `fake` harness keeps nothing of a session to forget.'),
    { bare: true },
  ],
  [
    'a kept on a harness that says nothing of where it keeps a session',
    (h) => h.handler.sessionKept({ sessions: [{ name: 'ae/t-1/1' }] }, ctx),
    refusedWith(UnsupportedOperationError, "the `fake` harness says nothing of where it keeps a session's files."),
    { bare: true },
  ],
  [
    'a kept of a name that is not a session name',
    (h) => h.handler.sessionKept({ sessions: [{ name: 'ae/t-1/1' }, { name: 'elsewhere' }] }, ctx),
    refusedWith(
      RequestMalformedError,
      'the request names no sessions: send `{ sessions: [{ name }] }`, each name `ae/<task>/<n>`, n from 1.',
    ),
  ],
  [
    'a compact on a harness that keeps every capture whole',
    (h) => h.handler.compactSessions({ dry: true }, ctx),
    refusedWith(UnsupportedOperationError, 'the `fake` harness keeps every capture whole: it has none to compact.'),
    { bare: true },
  ],
  [
    'a compact not told whether to rewrite',
    (h) => h.handler.compactSessions({ dry: 'no' as never }, ctx),
    refusedWith(RequestMalformedError, '`dry: no` is not a yes or no: send `dry: true` to count, `false` to rewrite.'),
  ],
  [
    'a forget of a name that is not a session name',
    (h) => h.handler.forgetSession({ session: { name: 'ae/t-1/0' }, dry: true }, ctx),
    refusedWith(RequestMalformedError, 'the request names no session: send `{ session: { name } }`, the name `ae/<task>/<n>`, n from 1.'),
  ],
  [
    'a forget not told whether to remove',
    (h) => h.handler.forgetSession({ session: { name: 'ae/t-1/1' }, dry: 'no' as never }, ctx),
    refusedWith(RequestMalformedError, '`dry: no` is not a yes or no: send `dry: true` to list, `false` to remove.'),
  ],
  [
    'a release of no session',
    (h) => h.handler.releaseSession({ session: undefined as unknown as Sighting, task: {} }, ctx),
    refusedWith(RequestMalformedError, 'the request names no session: send the session as the last listing saw it.'),
  ],
  [
    'a transcript on a harness that keeps none',
    (h) => {
      h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'working' });
      return h.handler.sessionTranscript({ name: 'ae/t-1/1' }, ctx);
    },
    refusedWith(
      UnsupportedOperationError,
      "the `fake` harness keeps no conversation to read: its session's logs are what it printed (sessionLogs).",
    ),
    { bare: true },
  ],
  [
    'a transcript for a name that is not a session name',
    (h) => {
      h.sessions.set('fake-1', { sessionId: 's-1', state: 'working' });
      return h.handler.sessionTranscript({ name: 'fake-1' }, ctx);
    },
    refusedWith(RequestMalformedError, '`fake-1` is not a session name: a session is named `ae/<task>/<n>`, n from 1.'),
  ],
  [
    'a transcript for no name at all',
    (h) => h.handler.sessionTranscript({ name: undefined as unknown as string }, ctx),
    refusedWith(RequestMalformedError, '`undefined` is not a session name: a session is named `ae/<task>/<n>`, n from 1.'),
  ],
  [
    'a transcript by an empty id',
    (h) => h.handler.sessionTranscript({ sessionId: '' }, ctx),
    refusedWith(
      RequestMalformedError,
      'the request names no session: send the id its harness lists it under as `sessionId`, or its name as `name`.',
    ),
  ],
  [
    'a transcript by an id that is no string',
    (h) => h.handler.sessionTranscript({ sessionId: 7 as unknown as string }, ctx),
    refusedWith(
      RequestMalformedError,
      'the request names no session: send the id its harness lists it under as `sessionId`, or its name as `name`.',
    ),
  ],
  [
    'a transcript that names its session twice',
    (h) => {
      h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'working' });
      return h.handler.sessionTranscript({ name: 'ae/t-1/1', sessionId: 's-1' } as unknown as TranscriptRequest, ctx);
    },
    refusedWith(RequestMalformedError, 'the request names the session twice, by `name` and by `sessionId`: send one.'),
  ],
  [
    'a transcript by id on a harness that keeps none',
    (h) => h.handler.sessionTranscript({ sessionId: 's-1' }, ctx),
    refusedWith(
      UnsupportedOperationError,
      "the `fake` harness keeps no conversation to read: its session's logs are what it printed (sessionLogs).",
    ),
    { bare: true },
  ],
];

test('the handler refuses what it cannot serve, at shipped defaults, and asks the harness for nothing', async (t) => {
  for (const [what, ask, says, setup] of REFUSALS) {
    await t.test(`the handler refuses ${what}, and asks the harness for nothing`, async () => {
      const h = harness(setup);
      await assert.rejects(ask(h), says);
      assert.deepEqual(h.acted(), []);
    });
  }
});

test("the card and the runtime's extension: each method offered as the driver has it, and answered as the driver does", async (t) => {
  await t.test("a session's output is what its harness keeps of the stream asked, and null for a session it keeps none of", async () => {
    const h = harness();
    h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'completed' });
    assert.deepEqual(await h.handler.sessionOutput({ name: 'ae/t-1/1', stream: 'stderr', lastBytes: 5 }, ctx), {
      output: 'stderr of ae/t-1/1',
    });
    assert.deepEqual(await h.handler.sessionOutput({ name: 'ae/t-2/1', stream: 'stdout' }, ctx), { output: null });
    assert.deepEqual(h.acted(), [
      ['output', ['ae/t-1/1', 'stderr', 5]],
      ['output', ['ae/t-2/1', 'stdout', undefined]],
    ]);
  });

  await t.test("the harness's card: its name, no streaming, no notifications, text in and out, and the runtime's extension", async () => {
    const card = await harness().handler.getAgentCard();
    assert.equal(card.name, 'fake');
    const { extensions, ...rest } = card.capabilities!;
    assert.deepEqual(rest, { streaming: false, pushNotifications: false, extendedAgentCard: false });
    assert.deepEqual(
      extensions.map((e) => [e.uri, e.required, e.params]),
      [
        [
          RUNTIME_EXTENSION,
          false,
          {
            methods: [
              'findSession',
              'sessionLogs',
              'sessionOutput',
              'releaseSession',
              'sessionTranscript',
              'observeSessions',
              'harnessQuota',
              'forgetSession',
              'sessionKept',
              'compactSessions',
            ],
            say: true,
          },
        ],
      ],
    );
    assert.deepEqual([card.defaultInputModes, card.defaultOutputModes], [['text/plain'], ['text/plain']]);
  });

  await t.test('REFUSED on the card: a verb the driver lacks is not offered, and logs, which every driver has, always is', async () => {
    const card = await harness({ bare: true }).handler.getAgentCard();
    assert.deepEqual(
      card.capabilities!.extensions.map((e) => e.params),
      [{ methods: ['sessionLogs'], say: false }],
    );
  });

  await t.test("compactSessions hands the driver's compact whether to rewrite, and answers what it found", async () => {
    const h = harness();
    assert.deepEqual(await h.handler.compactSessions({ dry: true }, ctx), {
      captures: 2,
      compacted: 1,
      before: 900,
      after: 300,
      left: [{ name: 'a.log', why: 'at work' }],
    });
    await h.handler.compactSessions({ dry: false }, ctx);
    assert.deepEqual(h.acted(), [
      ['compact', { dry: true }],
      ['compact', { dry: false }],
    ]);
  });

  await t.test("sessionKept hands the driver's kept every session at once, and answers where each is kept", async () => {
    const h = harness();
    const sessions = [{ name: 'ae/t-1/1', nativeId: 'n-1' }, { name: 'ae/t-2/1' }];
    assert.deepEqual(await h.handler.sessionKept({ sessions }, ctx), {
      'ae/t-1/1': { files: ['/runs/ae/t-1/1.json'], records: [] },
      'ae/t-2/1': { files: ['/runs/ae/t-2/1.json'], records: [] },
    });
    assert.deepEqual(h.acted(), [['kept', [sessions]]]);
  });

  await t.test("forgetSession hands the driver's forget the session and whether to remove, and answers what it removed", async () => {
    const h = harness();
    assert.deepEqual(await h.handler.forgetSession({ session: { name: 'ae/t-1/1', nativeId: 'n-1' }, dry: true }, ctx), {
      files: ['/runs/ae/t-1/1.json'],
      left: ['kept elsewhere'],
    });
    assert.deepEqual(await h.handler.forgetSession({ session: { name: 'ae/t-1/2' }, dry: false }, ctx), {
      files: ['/runs/ae/t-1/2.json'],
      left: [],
    });
    assert.deepEqual(h.acted(), [
      ['forget', [{ name: 'ae/t-1/1', nativeId: 'n-1' }, { dry: true }]],
      ['forget', [{ name: 'ae/t-1/2' }, { dry: false }]],
    ]);
  });

  await t.test("harnessQuota answers the driver's quota; REFUSED on a driver without one, which is asked nothing", async () => {
    const h = harness();
    assert.deepEqual(await h.handler.harnessQuota({}, ctx), { kind: 'no-plan' });
    assert.deepEqual(h.acted(), [['quota', undefined]]);
    const bare = harness({ bare: true });
    await assert.rejects(
      bare.handler.harnessQuota({}, ctx),
      refusedWith(UnsupportedOperationError, "the `fake` harness reports no quota: no subscription's use can be asked of it."),
    );
    assert.deepEqual(bare.asked, []);
  });

  await t.test('observeSessions hands the driver what is expected, and answers what it listed as Tasks', async () => {
    const h = harness();
    h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'working', busy: true });
    h.sessions.set('ae/t-2/1', { sessionId: 's-2', state: 'completed' });
    const expected = [{ name: 'ae/t-1/1', harness: 'fake' }];
    const { tasks, unread } = await h.handler.observeSessions({ expected }, ctx);
    assert.deepEqual(
      tasks.map((t) => [t.id, t.status!.state]),
      [['ae/t-1/1', TaskState.TASK_STATE_WORKING]],
    );
    assert.deepEqual(unread, []);
    assert.deepEqual(h.acted(), [['observeFor', expected]]);
  });

  await t.test('observeSessions answers the names the driver could not read, beside the Tasks it listed', async () => {
    const h = harness();
    h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'working', busy: true });
    h.unread.add('ae/t-2/1');
    const expected = [
      { name: 'ae/t-1/1', harness: 'fake' },
      { name: 'ae/t-2/1', harness: 'fake' },
    ];
    const answered = await h.handler.observeSessions({ expected }, ctx);
    assert.deepEqual(
      answered.tasks.map((t) => t.id),
      ['ae/t-1/1'],
    );
    assert.deepEqual(answered.unread, ['ae/t-2/1']);
  });

  await t.test('REFUSED: observeSessions on a driver without the verb, and with a list that names no session', async () => {
    const bare = harness({ bare: true });
    await assert.rejects(
      bare.handler.observeSessions({ expected: [] }, ctx),
      refusedWith(UnsupportedOperationError, 'the `fake` harness lists its sessions in full, told nothing: list them (listTasks).'),
    );
    const h = harness();
    const malformed = '`expected` is not a list of sessions: send `[{ name }]`, each name `ae/<task>/<n>`, n from 1.';
    for (const expected of [undefined, 'ae/t-1/1', [{ name: 'ae/t-1/0' }], [{ name: 7 }], [null]]) {
      await assert.rejects(h.handler.observeSessions({ expected } as never, ctx), refusedWith(RequestMalformedError, malformed));
    }
    assert.deepEqual([...bare.asked, ...h.asked], [], 'a refused list asks the harness nothing');
  });

  await t.test('the extension answers as the driver does: a session found or none, its logs, what a release read', async () => {
    const h = harness();
    h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'working' });
    assert.deepEqual(await h.handler.findSession({ name: 'ae/t-1/1' }, ctx), { sessionId: 's-1' });
    assert.equal(await h.handler.findSession({ name: 'ae/t-1/2' }, ctx), null);
    assert.deepEqual(await h.handler.sessionLogs({ sessionId: 's-1' }, ctx), { logs: 'logs of s-1' });
    const done: Sighting = { sessionId: 's-1', state: 'completed' };
    assert.deepEqual(await h.handler.releaseSession({ session: done, task: { worktree: true } }, ctx), {
      usage: { turns: 3, costUsd: 0.25 },
    });
    assert.deepEqual(await h.handler.releaseSession({ session: { sessionId: 's-2', state: 'canceled' }, task: {} }, ctx), { usage: null });
    assert.deepEqual(
      h.asked,
      [
        ['find', 'ae/t-1/1'],
        ['find', 'ae/t-1/2'],
        ['logs', 's-1'],
        ['release', [done, { worktree: true }]],
        ['release', [{ sessionId: 's-2', state: 'canceled' }, {}]],
      ],
      'each asked once, and no listing made for any',
    );
  });
});

test('listings overlap: each is paged from the listing its token names, whatever was listed since', async () => {
  const h = harness();
  for (let i = 1; i <= 3; i++) h.sessions.set(`ae/t-${i}/1`, { sessionId: `s-${i}`, state: 'working' });
  const first = await h.handler.listTasks(listing({ pageSize: 2 }), ctx);
  assert.equal(first.nextPageToken, '1:2');
  h.sessions.set('ae/t-4/1', { sessionId: 's-4', state: 'working' });
  const second = await h.handler.listTasks(listing({ pageSize: 2 }), ctx);
  assert.equal(second.nextPageToken, '2:2');
  const rest = await h.handler.listTasks(listing({ pageSize: 2, pageToken: first.nextPageToken }), ctx);
  assert.deepEqual(
    rest.tasks.map((t) => t.id),
    ['ae/t-3/1'],
    'the first listing, as it was when it was made',
  );
  assert.equal(rest.nextPageToken, '');
  const theirs = await h.handler.listTasks(listing({ pageSize: 2, pageToken: second.nextPageToken }), ctx);
  assert.deepEqual(
    theirs.tasks.map((t) => t.id),
    ['ae/t-3/1', 'ae/t-4/1'],
    'the second listing, made while the first was being paged, sees the harness that moved',
  );
  assert.equal(h.asked.filter(([verb]) => verb === 'observe').length, 2, 'one observe a listing');
});

test('listTasks in pages: sorted by name, one observe a listing, filtered, and a page refused once its listing is not open', async (t) => {
  await t.test('REFUSED: a page of a listing whose last page was served, of one dropped, of other filters, or past its end', async () => {
    const h = harness();
    for (let i = 1; i <= 3; i++) h.sessions.set(`ae/t-${i}/1`, { sessionId: `s-${i}`, state: 'working' });
    const refused = (token: string) =>
      refusedWith(RequestMalformedError, `\`pageToken: ${token}\` is not a page of a listing still open: list again from the first page.`);

    const done = await h.handler.listTasks(listing({ pageSize: 2 }), ctx);
    await h.handler.listTasks(listing({ pageSize: 2, pageToken: done.nextPageToken }), ctx);
    await assert.rejects(
      h.handler.listTasks(listing({ pageSize: 2, pageToken: done.nextPageToken }), ctx),
      refused(done.nextPageToken),
      'served to its end: its pages are gone with it',
    );

    const tokens: string[] = [];
    for (let i = 0; i <= OPEN_LISTINGS; i++) tokens.push((await h.handler.listTasks(listing({ pageSize: 1 }), ctx)).nextPageToken);
    await assert.rejects(
      h.handler.listTasks(listing({ pageSize: 1, pageToken: tokens[0] }), ctx),
      refused(tokens[0]),
      'left part-way, then outnumbered: the oldest of more than OPEN_LISTINGS open is dropped',
    );
    assert.equal(
      (await h.handler.listTasks(listing({ pageSize: 1, pageToken: tokens[1] }), ctx)).tasks.length,
      1,
      'and the rest still served',
    );
    assert.equal((await h.handler.listTasks(listing({ pageSize: 1, pageToken: tokens.at(-1) }), ctx)).tasks.length, 1, 'the newest too');

    const open = await h.handler.listTasks(listing({ pageSize: 1 }), ctx);
    await assert.rejects(
      h.handler.listTasks(listing({ pageSize: 1, pageToken: open.nextPageToken, contextId: 't-2' }), ctx),
      refusedWith(
        RequestMalformedError,
        'a page is asked for with other filters than its listing: ask every page with the filters of the first.',
      ),
    );
    const past = open.nextPageToken.replace(/:[0-9]+$/, ':4');
    await assert.rejects(h.handler.listTasks(listing({ pageSize: 1, pageToken: past }), ctx), refused(past));
  });

  await t.test('listing 250 sessions: sorted by name, in pages, every sighting whole, and filtered by context and by state', async () => {
    const h = harness();
    const names: string[] = [];
    for (let i = 250; i >= 1; i--) {
      const name = `ae/t-${String(i).padStart(3, '0')}/${i % 2 ? 1 : 2}`;
      names.push(name);
      h.sessions.set(name, {
        sessionId: `s-${i}`,
        state: i % 5 === 0 ? 'input-required' : 'working',
        nativeId: `n-${i}`,
        usage: { turns: i },
      });
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

    const one = await h.handler.listTasks(listing({ contextId: 'n-7' }), ctx);
    assert.deepEqual(
      one.tasks.map((t) => t.id),
      ['ae/t-007/1'],
    );
    const blocked = await h.handler.listTasks(listing({ status: TaskState.TASK_STATE_INPUT_REQUIRED }), ctx);
    assert.equal(blocked.totalSize, 50);
    assert.equal(blocked.tasks.length, 50, 'no pageSize is a page of 50');
    assert.equal(blocked.nextPageToken, '');
  });

  await t.test('a listing the harness could not make throws its words, unchanged', async () => {
    const h = harness({ observeFails: 'fake agents: registry unreachable (exit 7)' });
    await assert.rejects(h.handler.listTasks(listing(), ctx), refusedWith(HarnessFailed, 'fake agents: registry unreachable (exit 7)'));
  });
});

test('sendMessage as a spawn: the request reaches the harness whole, and a refusal, a failure or a defect comes back as the harness said it', async (t) => {
  await t.test(
    'a spawn the harness takes: the request reaches it whole, and the Task is working, with the message that asked',
    async () => {
      const h = harness();
      const asked = spawn('ae/t-1/1');
      const t = await h.handler.sendMessage(asked, ctx);
      assert.deepEqual(h.acted(), [
        [
          'spawn',
          {
            name: 'ae/t-1/1',
            brief: 'do it',
            cwd: '/repo',
            harness: 'fake',
            config: { model: 'opus' },
            restartPolicy: undefined,
            closeoutSchema: undefined,
            resumeFrom: undefined,
            resource: undefined,
            traceparent: undefined,
          },
        ],
      ]);
      assert.ok('status' in t);
      assert.equal(t.id, 'ae/t-1/1');
      assert.equal(t.contextId, '', 'no context until the harness lists the session with an id');
      assert.equal(t.status!.state, TaskState.TASK_STATE_WORKING);
      assert.deepEqual(t.history, [asked.message]);
    },
  );

  await t.test('a spawn the harness refused is REJECTED in its words; one that failed otherwise is SUBMITTED in its words', async () => {
    const refused = harness({
      spawnFails: new RunnerError({ verb: 'spawn', message: 'fake: no binary called `fake` on PATH', refused: true }),
    });
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

  await t.test('a spawn whose driver threw a defect lets it through as it is: a bug is not a harness speaking', async () => {
    const defect = new TypeError('cannot read properties of undefined');
    const h = harness({ spawnFails: defect });
    await assert.rejects(h.handler.sendMessage(spawn(), ctx), (e) => e === defect);
  });

  await t.test('a spawn that continues a session carries it as its context, and the harness is handed it as `resumeFrom`', async () => {
    const h = harness();
    await h.handler.sendMessage(spawn('ae/t-1/2', { contextId: 'conv-a' }), ctx);
    assert.equal((h.acted()[0][1] as SpawnRequest).resumeFrom, 'conv-a');
    await h.handler.sendMessage(spawn('ae/t-2/1', { contextId: '' }), ctx);
    assert.equal((h.acted()[1][1] as SpawnRequest).resumeFrom, undefined, 'no context is a cold start');
  });
});

test('getTask and listTasks answer a session as the harness sees it, and else as the journal has its attempt', async (t) => {
  await t.test('a session is answered as the harness sees it, and else as the journal has its attempt', async () => {
    const h = harness();
    h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'input-required', waitingFor: 'permission prompt' });
    const live = await h.handler.getTask({ tenant: '', id: 'ae/t-1/1' }, ctx);
    assert.equal(live.status!.state, TaskState.TASK_STATE_INPUT_REQUIRED);
    assert.deepEqual(sightingOf(live), { sessionId: 's-1', state: 'input-required', waitingFor: 'permission prompt' });

    const at = '2026-09-23T10:00:00.000Z';
    const filed: Event = { kind: 'filed', at, brief: 'b', cwd: '/r' };
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
    assert.equal(open.contextId, '', 'an attempt with no id recorded is in no context');
    await assert.rejects(answer('ae/t-2/5'), TaskNotFoundError);
    assert.deepEqual(h.acted(), []);
  });

  await t.test("a listing by context is every attempt that continued the conversation, whatever the runtime's task", async () => {
    const h = harness();
    h.sessions.set('ae/t-2/1', { sessionId: 'job-3', state: 'working', nativeId: 'conv-a' });
    h.sessions.set('ae/t-1/2', { sessionId: 'job-2', state: 'completed', nativeId: 'conv-a' });
    h.sessions.set('ae/t-1/1', { sessionId: 'job-1', state: 'completed', nativeId: 'conv-b' });
    h.sessions.set('ae/t-1/3', { sessionId: 'job-4', state: 'working' });
    const a = await h.handler.listTasks(listing({ contextId: 'conv-a' }), ctx);
    assert.deepEqual(
      a.tasks.map((t) => [t.id, t.contextId]),
      [
        ['ae/t-1/2', 'conv-a'],
        ['ae/t-2/1', 'conv-a'],
      ],
      "filed in the opposite order to the names, so a listing that kept the harness's order or sorted by id alone would differ",
    );
    assert.deepEqual(
      (await h.handler.listTasks(listing({ contextId: 'conv-b' }), ctx)).tasks.map((t) => t.id),
      ['ae/t-1/1'],
    );
    assert.deepEqual((await h.handler.listTasks(listing({ contextId: 't-1' }), ctx)).tasks, [], "the runtime's task is no context");
  });

  await t.test(
    'a listing carries what each session closed with only when it asks for artifacts; a read of one session always does',
    async () => {
      const h = harness();
      const closeout = { payload: { outcome: 'done' }, at: 1790000000000 };
      h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'completed', nativeId: 'conv-a', closeout });
      h.sessions.set('ae/t-2/1', { sessionId: 's-2', state: 'working' });
      const bare = await h.handler.listTasks(listing(), ctx);
      assert.deepEqual(
        bare.tasks.map((t) => t.artifacts),
        [[], []],
        "A2A's default: no artifacts",
      );
      assert.deepEqual(sightingOf(bare.tasks[0])?.closeout, closeout, 'the sighting, which the engine reads, is whole either way');
      const full = await h.handler.listTasks({ ...listing(), includeArtifacts: true }, ctx);
      assert.deepEqual(
        full.tasks.map((t) => t.artifacts.map((a) => a.artifactId)),
        [['closeout'], []],
      );
      assert.deepEqual(closeoutOf(full.tasks[0]), { outcome: 'done' });
      const first = await h.handler.listTasks({ ...listing({ pageSize: 1 }), includeArtifacts: true }, ctx);
      assert.equal(first.tasks[0].artifacts.length, 1, 'paged: each page asks for itself');
      const rest = await h.handler.listTasks({ ...listing({ pageSize: 1, pageToken: first.nextPageToken }) }, ctx);
      assert.deepEqual(
        rest.tasks.map((t) => t.id),
        ['ae/t-2/1'],
      );
      assert.equal(closeoutOf(await h.handler.getTask({ tenant: '', id: 'ae/t-1/1' }, ctx)) !== undefined, true);
    },
  );

  await t.test(
    'a signed session its task holds open is INPUT_REQUIRED on a read, listed by its harness or let go; a listing says what the harness does',
    async () => {
      const listed = harness();
      listed.journal.set('t-h', held());
      const job: Sighting = {
        sessionId: 'job-1',
        state: 'completed',
        nativeId: 'conv-h',
        closeout: { payload: { outcome: 'done' }, at: 1790000000000 },
      };
      listed.sessions.set('ae/t-h/1', job);
      const read = await listed.handler.getTask({ tenant: '', id: 'ae/t-h/1' }, ctx);
      assert.deepEqual(
        [read.status!.state, read.contextId, closeoutOf(read)],
        [TaskState.TASK_STATE_INPUT_REQUIRED, 'conv-h', { outcome: 'done' }],
      );
      assert.equal(sightingOf(read), undefined, "a Task whose state is not its sighting's carries none to read");
      const inList = (await listed.handler.listTasks(listing(), ctx)).tasks;
      assert.deepEqual(
        inList.map((t) => t.status!.state),
        [TaskState.TASK_STATE_COMPLETED],
        'a Claude Code job is never let go: its harness lists it done while its task waits',
      );
      assert.deepEqual(sightingOf(inList[0]), job, 'observe reads the harness, unchanged');

      const gone = harness();
      gone.journal.set('t-h', held());
      const off = await gone.handler.getTask({ tenant: '', id: 'ae/t-h/1' }, ctx);
      assert.deepEqual(
        [off.status!.state, off.contextId, closeoutOf(off)],
        [TaskState.TASK_STATE_INPUT_REQUIRED, 'conv-h', { outcome: 'done' }],
      );
      assert.deepEqual(listed.acted().concat(gone.acted()), [], 'a read, and nothing asked of the harness');
    },
  );

  await t.test(
    "REFUSED: a held task answered or closed waits on nobody, and a task not held open never did — each read COMPLETED; the answer's turn, signed, waits again",
    async () => {
      const at = '2026-09-23T10:06:00.000Z';
      const cases: Array<[string, Event[]]> = [
        ['answered, its next turn not begun', held([{ kind: 'input', at, text: 'go on' }])],
        ['closed', held([{ kind: 'closed', at }])],
        ['not held open', held().map((e) => (e.kind === 'filed' ? { ...e, holdOpen: undefined } : e))],
      ];
      for (const [what, events] of cases) {
        for (const listedDone of [true, false]) {
          const h = harness();
          h.journal.set('t-h', events);
          if (listedDone) h.sessions.set('ae/t-h/1', { sessionId: 'job-1', state: 'completed', nativeId: 'conv-h' });
          assert.equal(
            (await h.handler.getTask({ tenant: '', id: 'ae/t-h/1' }, ctx)).status!.state,
            TaskState.TASK_STATE_COMPLETED,
            `${what}, ${listedDone ? 'listed done' : 'let go'}`,
          );
        }
      }
      const h = harness();
      h.journal.set(
        't-h',
        held([
          { kind: 'input', at, text: 'go on' },
          { kind: 'starting', at, attempt: 2, resumeFrom: 'conv-h' },
          { kind: 'spawned', at, attempt: 2 },
          { kind: 'ended', at, attempt: 2, sessionId: 'job-2', observed: 'done', reason: 'harness', nativeId: 'conv-h' },
        ]),
      );
      const states = await Promise.all(['ae/t-h/1', 'ae/t-h/2'].map((id) => h.handler.getTask({ tenant: '', id }, ctx)));
      assert.deepEqual(
        states.map((t) => [t.status!.state, t.contextId]),
        [
          [TaskState.TASK_STATE_COMPLETED, 'conv-h'],
          [TaskState.TASK_STATE_INPUT_REQUIRED, 'conv-h'],
        ],
        'two turns of one conversation, one context',
      );
    },
  );
});

/** A task held open whose first attempt signed: waiting on a person, `ae/t-h/1` its session. */
const held = (after: Event[] = []): Event[] => [
  { kind: 'filed', at: '2026-09-23T10:00:00.000Z', brief: 'b', cwd: '/r', holdOpen: true },
  { kind: 'starting', at: '2026-09-23T10:00:00.000Z', attempt: 1 },
  { kind: 'spawned', at: '2026-09-23T10:00:01.000Z', attempt: 1 },
  {
    kind: 'ended',
    at: '2026-09-23T10:05:00.000Z',
    attempt: 1,
    sessionId: 'job-1',
    observed: 'done',
    reason: 'harness',
    nativeId: 'conv-h',
    closeout: { outcome: 'done' },
  },
  ...after,
];

test('a running session told words and stopped: the harness asked once, with the id it lists, its failures in its words', async (t) => {
  await t.test(
    'a stop: a live session is stopped and CANCELED, one already stopped is CANCELED again, and the harness asked once',
    async () => {
      const h = harness();
      h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'working', busy: true });
      h.sessions.set('ae/t-2/1', { sessionId: 's-2', state: 'input-required' });
      const cancel = (id: string) => h.handler.cancelTask({ tenant: '', id, metadata: undefined }, ctx);
      assert.equal((await cancel('ae/t-1/1')).status!.state, TaskState.TASK_STATE_CANCELED);
      assert.equal((await cancel('ae/t-2/1')).status!.state, TaskState.TASK_STATE_CANCELED);
      assert.equal(h.sessions.get('ae/t-1/1')!.state, 'canceled');
      assert.equal((await cancel('ae/t-1/1')).status!.state, TaskState.TASK_STATE_CANCELED, 'a repeat cancel answers as the first');
      assert.deepEqual(h.acted(), [
        ['stop', 's-1'],
        ['stop', 's-2'],
      ]);
    },
  );

  await t.test(
    'a stop of a session listed done whose process its harness still holds stops it and is CANCELED; one let go is refused',
    async () => {
      const h = harness();
      h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'completed', busy: false, held: true });
      h.sessions.set('ae/t-2/1', { sessionId: 's-2', state: 'completed', busy: false, held: false });
      const cancel = (id: string) => h.handler.cancelTask({ tenant: '', id, metadata: undefined }, ctx);
      assert.equal((await cancel('ae/t-1/1')).status!.state, TaskState.TASK_STATE_CANCELED);
      await assert.rejects(
        cancel('ae/t-2/1'),
        refusedWith(TaskNotCancelableError, 'session `ae/t-2/1` has ended (done): there is nothing to stop.'),
      );
      assert.deepEqual(h.acted(), [['stop', 's-1']]);
    },
  );

  await t.test("a stop the harness failed throws the harness's words, unchanged", async () => {
    const h = harness({ stopFails: 'fake stop s-1: no such session (exit 1)' });
    h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'working' });
    await assert.rejects(
      h.handler.cancelTask({ tenant: '', id: 'ae/t-1/1', metadata: undefined }, ctx),
      refusedWith(HarnessFailed, 'fake stop s-1: no such session (exit 1)'),
    );
  });

  await t.test('words to a running session reach the harness with the id it lists, and the Task answers as it was seen', async () => {
    const h = harness();
    h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'working', busy: true });
    h.sessions.set('ae/t-2/1', { sessionId: 's-2', state: 'input-required', waitingFor: 'permission prompt' });
    const working = await h.handler.sendMessage(said('ae/t-1/1', 'look at the tests again'), ctx);
    assert.ok('status' in working);
    assert.equal(working.status!.state, TaskState.TASK_STATE_WORKING);
    const waiting = await h.handler.sendMessage(said('ae/t-2/1', 'go on', { contextId: '' }), ctx);
    assert.ok('status' in waiting);
    assert.equal(waiting.status!.state, TaskState.TASK_STATE_INPUT_REQUIRED, 'a session waiting on a person still takes words');
    assert.deepEqual(h.acted(), [
      ['say', [{ name: 'ae/t-1/1', sessionId: 's-1' }, 'look at the tests again']],
      ['say', [{ name: 'ae/t-2/1', sessionId: 's-2' }, 'go on']],
    ]);
  });

  await t.test(
    'words to a session listed done whose process its harness still holds reach it, as an open session; one let go is refused',
    async () => {
      const h = harness();
      h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'completed', busy: false, held: true });
      h.sessions.set('ae/t-2/1', { sessionId: 's-2', state: 'completed', busy: false, held: false });
      const open = await h.handler.sendMessage(said('ae/t-1/1', 'next'), ctx);
      assert.ok('status' in open);
      assert.equal(open.status!.state, TaskState.TASK_STATE_COMPLETED, 'answered as the harness lists it');
      await assert.rejects(
        h.handler.sendMessage(said('ae/t-2/1', 'next', { contextId: '' }), ctx),
        refusedWith(UnsupportedOperationError, 'session `ae/t-2/1` has ended (done): it takes no more words.'),
      );
      assert.deepEqual(h.acted(), [['say', [{ name: 'ae/t-1/1', sessionId: 's-1' }, 'next']]]);
    },
  );

  await t.test('words the harness could not deliver throw its words, unchanged', async () => {
    const h = harness({ sayFails: 'fake message s-1: inbox closed (exit 3)' });
    h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'working' });
    await assert.rejects(h.handler.sendMessage(said(), ctx), refusedWith(HarnessFailed, 'fake message s-1: inbox closed (exit 3)'));
  });
});

const at = '2026-09-23T10:00:00.000Z';
const filed: Event = { kind: 'filed', at, brief: 'b', cwd: '/r' };

test('sessionTranscript: read by the id the record names, found or observed in flight, none when unnamed, by id as asked, its failures as the harness said them', async (t) => {
  await t.test(
    'a transcript is read by the id the journal ended its attempt with, and no registry is asked, whatever it lists now',
    async () => {
      const h = harness();
      h.journal.set('t-1', [
        filed,
        { kind: 'starting', at, attempt: 1 },
        { kind: 'spawned', at, attempt: 1 },
        { kind: 'ended', at, attempt: 1, sessionId: 's-old', observed: 'done', reason: 'harness', nativeId: 's-old' },
      ]);
      h.sessions.set('ae/t-1/1', { sessionId: 's-new', state: 'working' });
      const read = await h.handler.sessionTranscript({ name: 'ae/t-1/1', after: 'c-7' }, ctx);
      assert.deepEqual(
        read?.cursor,
        's-old@c-7+1',
        "the harness lists another session under the name: the record's id is read, not the listing's",
      );
      assert.deepEqual(h.asked, [['transcript', ['s-old', 'c-7']]], 'no find, no listing');

      h.journal.set('t-2', [filed, { kind: 'starting', at, attempt: 1 }, { kind: 'settled', at, outcome: 'failed', nativeId: 's-left' }]);
      h.sessions.set('ae/t-2/1', { sessionId: 's-other', state: 'working' });
      assert.equal(
        (await h.handler.sessionTranscript({ name: 'ae/t-2/1' }, ctx))?.cursor,
        's-left@0+1',
        "a task settled with its attempt open carries the session's id too",
      );
      assert.deepEqual(h.asked.slice(1), [['transcript', ['s-left', undefined]]]);
    },
  );

  await t.test(
    'a transcript of an attempt in flight: found by name when the harness can find, with no listing; observed when it cannot',
    async () => {
      const flight: Event[] = [filed, { kind: 'starting', at, attempt: 1 }, { kind: 'spawned', at, attempt: 1 }];
      const finds = harness();
      finds.journal.set('t-1', flight);
      finds.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'working' });
      assert.equal((await finds.handler.sessionTranscript({ name: 'ae/t-1/1' }, ctx))?.cursor, 's-1@0+1');
      assert.deepEqual(finds.asked, [
        ['find', 'ae/t-1/1'],
        ['transcript', ['s-1', undefined]],
      ]);

      const lists = harness({ noFind: true });
      lists.journal.set('t-1', flight);
      lists.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'input-required' });
      assert.equal((await lists.handler.sessionTranscript({ name: 'ae/t-1/1' }, ctx))?.cursor, 's-1@0+1');
      assert.deepEqual(lists.asked, [
        ['observe', undefined],
        ['transcript', ['s-1', undefined]],
      ]);
    },
  );

  await t.test(
    'a transcript whose session its harness cannot name this time is none, and the harness is not asked to read one',
    async () => {
      const flight: Event[] = [filed, { kind: 'starting', at, attempt: 1 }, { kind: 'spawned', at, attempt: 1 }];
      const early = harness();
      early.journal.set('t-1', flight);
      assert.equal(
        await early.handler.sessionTranscript({ name: 'ae/t-1/1' }, ctx),
        null,
        'not registered yet: found as none, then listed as none',
      );
      assert.deepEqual(early.asked, [
        ['find', 'ae/t-1/1'],
        ['observe', undefined],
      ]);

      const broken = harness({ findFails: new TypeError('the registry file is torn'), observeFails: 'fake ls: exit 3' });
      broken.journal.set('t-1', flight);
      broken.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'working' });
      assert.equal(
        await broken.handler.sessionTranscript({ name: 'ae/t-1/1' }, ctx),
        null,
        "a find that fails is nothing found; a listing that fails is nothing listed. Neither is the caller's error",
      );
      assert.deepEqual(broken.asked, [
        ['find', 'ae/t-1/1'],
        ['observe', undefined],
      ]);

      const listed = harness({ findFails: new RunnerError({ verb: 'find', message: 'fake: no registration file' }) });
      listed.journal.set('t-1', flight);
      listed.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'working' });
      assert.equal(
        (await listed.handler.sessionTranscript({ name: 'ae/t-1/1' }, ctx))?.cursor,
        's-1@0+1',
        'a find that fails, and a listing that names it: read',
      );
    },
  );

  await t.test(
    'a transcript of an ended attempt with no id on the record, or of a name no attempt is journalled under yet, is observed',
    async () => {
      const h = harness();
      h.journal.set('t-1', [
        filed,
        { kind: 'starting', at, attempt: 1 },
        { kind: 'spawned', at, attempt: 1 },
        { kind: 'ended', at, attempt: 1, sessionId: 's-1', observed: 'done', reason: 'harness' },
      ]);
      h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'completed' });
      assert.equal((await h.handler.sessionTranscript({ name: 'ae/t-1/1' }, ctx))?.cursor, 's-1@0+1');
      assert.deepEqual(
        h.asked,
        [
          ['observe', undefined],
          ['transcript', ['s-1', undefined]],
        ],
        'an `ended` with no id, as an older runtime wrote one: no find, which reads only what is in flight — the listing',
      );

      h.sessions.set('ae/t-9/1', { sessionId: 's-9', state: 'working' });
      assert.equal(
        (await h.handler.sessionTranscript({ name: 'ae/t-9/1' }, ctx))?.cursor,
        's-9@0+1',
        'a session is listed before its spawn is written: a name with no attempt on the record is asked of the harness',
      );
      assert.deepEqual(h.asked.slice(2), [
        ['find', 'ae/t-9/1'],
        ['transcript', ['s-9', undefined]],
      ]);
    },
  );

  await t.test('a transcript by id is read as asked: no journal, no find, no listing, whatever the harness lists', async () => {
    const h = harness();
    h.journal.set('t-1', [filed, { kind: 'starting', at, attempt: 1 }, { kind: 'settled', at, outcome: 'failed', nativeId: 's-left' }]);
    h.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'working' });
    assert.equal((await h.handler.sessionTranscript({ sessionId: 's-9', after: 'c-3' }, ctx))?.cursor, 's-9@c-3+1');
    assert.deepEqual(h.asked, [['transcript', ['s-9', 'c-3']]]);
  });

  await t.test(
    "a transcript the harness could not read throws its words, unchanged; a driver's defect is let through as it is",
    async () => {
      const words = harness({
        transcriptFails: new RunnerError({ verb: 'transcript', message: 'fake: transcript s-1 unreadable (EACCES)' }),
      });
      words.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'working' });
      await assert.rejects(
        words.handler.sessionTranscript({ name: 'ae/t-1/1' }, ctx),
        refusedWith(HarnessFailed, 'fake: transcript s-1 unreadable (EACCES)'),
      );
      const boom = new TypeError('the reader fell over');
      const defect = harness({ transcriptFails: boom });
      defect.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'working' });
      await assert.rejects(defect.handler.sessionTranscript({ name: 'ae/t-1/1' }, ctx), (e) => e === boom);
    },
  );
});
