/**
 * A remote A2A agent as a harness: the runtime's session verbs as A2A calls to an agent another party runs, over HTTP,
 * by the SDK's client. The in-process seam (`a2a/client.ts`) speaks to a handler the
 * runtime built over its own driver; here nothing of the runtime stands on the other side, so the only words exchanged are
 * A2A's own — SendMessage, GetTask, CancelTask — and the runtime extension's methods are never asked.
 *
 * **The registry** is the driver's, and the record of what it sent: `<root>/remote/<session name>.json`, one file per
 * session, written whole to a temporary file and renamed. The intent — the name, the harness, the message's id, when, and
 * the process sending it with the time it gives up (`sending`) — is on disk before the message is sent, and the Task's id
 * and context are written as the answer comes back. So a spawn asked again for a name that has a file never sends twice:
 * with a Task recorded, it adopts it; with a send still under way in a process that lives, it leaves it to that process;
 * otherwise whether a Task started is not known, and the spawn fails in words that are no refusal, which the engine's grace
 * window reads `lost`. A crash between the agent's answer and that write leaves a Task nothing owns. A
 * session let go of (`release`) moves to `remote/done/`, where `find` and `logs` still read it and `observe` does not.
 *
 * **The send leaves the pass.** A spawn runs inside the runtime's pass, which runs task by task, so a send awaited
 * there would hold every other task's pass as long. What can refuse — the card, the auth — is still read in
 * the pass, and a spawn waits for the answer `SPAWN_WAIT_MS` at most, so an agent that answers at once is recorded before
 * the spawn returns and its refusal is still a spawn refused. An agent that has not answered by then is left to answer
 * within `SEND_MS`, in this process: until it does, a pass reads its entry, in any process, as a Task `submitted` while the
 * sending process lives, and the answer's writes are those of an answer in the pass — its Task, or its reply ended. A refusal that comes
 * after the spawn has returned is written as a session ended `rejected`, its words in the entry and on `logs`; a send that
 * fails on the way, or is not answered within `SEND_MS`, or whose process died, is in doubt, as above, and never sent twice.
 *
 * **A pass** is one GetTask per open entry — not ListTasks, which on an agent others use lists theirs too. A Task that has
 * ended is written into its entry and read from there, with no call, until the engine lets it go. A GetTask that fails
 * reads the entry as it was last seen, since an agent unreachable for a moment is not a session gone, and a deadline
 * bounds one gone for good; a Task the agent says it does not have is not listed, and the engine reads that as it reads a
 * session no harness lists.
 *
 * **Auth** is what the card declares: its requirements, the first one whose every scheme can be met, each secret asked of
 * the caller's `credentials` on every request and sent as a header. Nothing a secret is written to — the task's filing, the
 * journal, the registry, the feed — ever holds one. A card whose every requirement asks what this runtime cannot send, or
 * a secret `credentials` does not give, refuses the spawn before anything is sent. A request goes only where the harness
 * says: to an agent given by its URL, only on an interface of that URL's origin, whatever the card it serves names; and
 * a redirect is never followed, since a header that carries a key is not dropped on the way to another origin.
 *
 * **Every request is bounded** (`REQUEST_MS`), since a pass waits on every harness's observe and an agent that holds a
 * request would hold the runtime: a GetTask not answered in time reads the session as last seen, and a card not read is a
 * spawn refused. The send alone is bounded by `SEND_MS`, since it holds no pass.
 *
 * What the client learns of the card and the binding it chose is kept in memory, a view dropped at the first failure and
 * read again: the registry is the record.
 */
import { Effect } from 'effect';
import type { Message, Task } from '@a2a-js/sdk';
import { TaskNotCancelableError, TaskNotFoundError } from '@a2a-js/sdk/errors';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import type { SessionState, Sighting } from '../core/index.ts';
import { RunnerError, type SpawnRequest, type TranscriptCursor } from '../harness/index.ts';
import { instantNow } from '../core/engine/now.ts';
import { entryVerbsOf, readEntry, registryOf, type Entry } from './entry.ts';
import { logsOfTask, remoteFollowUpOf, remoteMessageOf, sightingOfTask } from './map.ts';
import { turnOver } from './remote-events.ts';
import type { SeamOps } from './client.ts';
import { pacesOf, remoteFollowOf, remoteTranscriptByName, remoteTranscriptOf, type FollowDeps } from './remote-follow.ts';
import { authOf, connectionOf, type Credentials, type MissingCredential, type RemoteAgent } from './remote-client.ts';
import { alive, sendHeld } from './sending.ts';
import { Doubt, late, Refusal, sendRefused, untaken, wordsOf } from './said.ts';

export type { Credentials, MissingCredential, RemoteAgent } from './remote-client.ts';

/** How long a request to a remote agent is waited on, the card's included, before it is read as not answered. */
export const REQUEST_MS = 10_000;

/** How long a send is waited on, off the pass, before it is read as not answered: a Task in doubt, never sent twice. */
export const SEND_MS = 15 * 60_000;

/** How long a spawn waits, in the pass, for its send's answer before it leaves the send to go on without it. */
export const SPAWN_WAIT_MS = 1_000;

/** Why a task cannot be filed on a remote agent, or `undefined`: a remote agent takes no harness arguments. */
export const remoteRefuses =
  (harness: string) =>
  (task: Omit<SpawnRequest, 'name'>): string | undefined => {
    const keys = Object.keys(task.config ?? {});
    return keys.length
      ? `the \`${harness}\` harness is a remote A2A agent, which runs as its operator configured it, and takes no harness arguments: take ${keys.map((k) => `\`${k}\``).join(', ')} out of \`config\`.`
      : undefined;
  };

/** What a send came to: the agent's answer, its refusal, a failure on the way, or a stop that cut it. */
type Answer = { task: Task } | { message: Message } | { refused: string } | { failed: unknown } | { canceled: true };

const TERMINAL: ReadonlySet<SessionState> = new Set(['completed', 'failed', 'canceled', 'rejected']);

/** The bounds of a send and of a subscription, and the words for a secret not given: each has its shipped default. */
export type RemoteOptions = {
  sendMs?: number;
  spawnWaitMs?: number;
  missingCredential?: MissingCredential;
  quietMs?: number;
  resubscribeMs?: number;
  readEveryMs?: number;
};

/**
 * A remote A2A agent's `SeamOps`, under `harness`, its registry beneath `root`. `credentials` answers for the card's
 * schemes; absent, only an agent that asks for no authentication is reached. `requestMs` bounds each request but the send,
 * which `sendMs` bounds; `spawnWaitMs` is how long a spawn waits in the pass for its answer; `quietMs` how long a subscription may
 * say nothing, `resubscribeMs` the first wait before a dropped one is made again, and `readEveryMs` how often a Task not subscribed
 * to is read (`a2a/remote-follow.ts`).
 *
 * What the client knows of the agent — its card, the interface chosen and the SDK's client — is a view (`connectionOf`):
 * `ask` drops it at any failure, and the next call reads the card again. A refusal of the auth was said before the send.
 *
 * The verbs:
 * - `spawn`, in order: a name whose entry has a Task adopts it, and nothing is sent again; one being sent by a process
 *   that lives (`sendingLive`, with `inFlight` the sends of this one) is read `submitted` until it answers; any other
 *   entry is a send in doubt, never sent twice. Then the card's auth is met or the spawn refused, the intent is written,
 *   and the send (`sendOf`) raced against `spawnWaitMs`. Answered in time, `record` writes it in the pass; else the pass
 *   goes on and the answer is recorded when it comes, and a root removed meanwhile has no entry to write, which nothing
 *   reads.
 * - `record` writes what a send came to, in this order: an entry let go of while it was sent (its attempt ended on its
 *   deadline, or stopped) goes to `remote/done/`, where `observe` does not read it, and a Task it made is cancelled, since
 *   nothing waits on it; a Task is written; a Message is the whole session, ended `completed`, since the agent made no
 *   Task; a refusal while the spawn waits removes the intent and is thrown, nothing started under the name, and after it
 *   is written as the session ended `rejected`; a send stopped on its way is ended `canceled`, and a Task the agent made
 *   before the cut is not known here; a failure is written as the doubt, and thrown while the spawn waits.
 * - `observe` reads each open entry (`open`: at the top of the registry, sent through this harness) — one ended from the
 *   registry, else by a GetTask; one not reached this time as it was last seen, which a deadline bounds; one the agent
 *   does not have is not listed — and a send under way as a Task `submitted`.
 * - `stop` cancels the Task; a reply or a refusal is no Task and nothing runs; a send still under way is cut if this
 *   process makes it, and one another process makes is its to answer, a Task it brings back cancelled on the next stop.
 *   A Task that has ended, or that the agent does not have, has nothing to stop.
 * - `logs` reads the Task's history, or the entry's words when there is no Task.
 * - `stop` and `logs` read an entry open or let go of (`bySession`): by the Task's id, the message's id, or
 *   its context — the id a settled task's attempt records for a remote agent, what a later turn continues — read as the
 *   latest Task sent in it. A registry folder not yet made is read as empty.
 * - `release` runs once the engine has written the attempt's end: a send under way is cut and whatever answers is let
 *   go of; a Task still running is cancelled, since an attempt ends so only on its deadline or a stop; and the entry leaves
 *   the open registry, so no later pass asks the agent about it.
 * - `say` sends words to a Task that waits on its caller, as A2A's follow-up on it; the engine's `say` refuses them to a Task
 *   at work.
 * - `forget` removes the session's entry, open or let go of, and names the Task the remote party keeps, which is not ours.
 * - `kept` names each session's entry, open or let go of, and no record: the Task is the remote party's.
 * - `follow`, `transcript` and `transcriptOf` are `remoteFollowOf`'s, `remoteTranscriptOf`'s and `remoteTranscriptByName`'s.
 */
export const remoteOps = (
  harness: string,
  agent: RemoteAgent,
  root: string,
  credentials?: Credentials,
  requestMs = REQUEST_MS,
  o: RemoteOptions = {},
): SeamOps => {
  const sendMs = o.sendMs ?? SEND_MS;
  const spawnWaitMs = o.spawnWaitMs ?? SPAWN_WAIT_MS;
  const inFlight = new Map<string, AbortController>();
  const sendingLive = (e: Entry): boolean =>
    e.sending !== undefined &&
    sendHeld(e, instantNow(), sendMs) &&
    (inFlight.has(e.name) || (e.sending.pid !== process.pid && alive(e.sending.pid)));
  const { dir, done, fileOf, write, open, bySession } = registryOf(harness, root);

  const connection = connectionOf(harness, agent, credentials, requestMs, sendMs);
  const { client, ask, sends } = connection;

  const failure =
    (verb: string) =>
    (cause: unknown): RunnerError =>
      cause instanceof RunnerError
        ? cause
        : cause instanceof Refusal
          ? new RunnerError({ verb, message: `the \`${harness}\` harness: ${cause.message}`, refused: true })
          : new RunnerError({ verb, message: `the \`${harness}\` harness: ${wordsOf(cause)}` });

  const sendOf = async (r: SpawnRequest, intent: Entry, stop: AbortSignal): Promise<Answer> => {
    const signal = AbortSignal.any([stop]);
    sends.add(signal);
    try {
      const answer = await ask((c) =>
        c.sendMessage(
          {
            tenant: '',
            message: remoteMessageOf(r, intent.messageId),
            metadata: undefined,
            configuration: { acceptedOutputModes: [], taskPushNotificationConfig: undefined, returnImmediately: true },
          },
          { signal },
        ),
      );
      return 'status' in answer ? { task: answer } : { message: answer };
    } catch (e) {
      if (stop.aborted) return { canceled: true };
      if (sendRefused(e)) return { refused: `${wordsOf(e)}${untaken(e) ? '' : ' Nothing was started.'}` };
      return { failed: e };
    }
  };

  const doubtOf = (name: string, e: unknown): string =>
    late(e)
      ? `the agent did not answer the send of \`${name}\` within ${sendMs / 1000} s`
      : `the send of \`${name}\` failed on the way (${wordsOf(e)})`;
  const NOT_TWICE = 'whether the agent made a Task of it is not known, and it is not sent twice.';

  const record = (intent: Entry, answer: Answer, inPass: boolean): void => {
    const { sending: _, ...sent } = intent;
    const released = !inPass && !fs.existsSync(fileOf(intent.name));
    if (released) {
      const task = 'task' in answer ? answer.task : undefined;
      if (task) void cancel(task.id).catch(() => undefined);
      write({ ...sent, ...(task ? { taskId: task.id, contextId: task.contextId } : {}), ended: true }, done);
      return;
    }
    if ('task' in answer) {
      write({ ...sent, taskId: answer.task.id, contextId: answer.task.contextId });
      return;
    }
    if ('message' in answer) {
      const m = answer.message;
      const text = m.parts
        .map((p) => (p.content?.$case === 'text' ? p.content.value : p.content?.$case === 'data' ? JSON.stringify(p.content.value) : ''))
        .join('\n');
      const data = m.parts.find((p) => p.content?.$case === 'data');
      write({
        ...sent,
        taskId: m.messageId,
        contextId: m.contextId,
        reply: text,
        ended: true,
        seen: {
          sessionId: m.messageId,
          state: 'completed',
          ...(m.contextId ? { nativeId: m.contextId } : {}),
          ...(data?.content?.$case === 'data' ? { closeout: { payload: data.content.value } } : {}),
        },
      });
      return;
    }
    if ('refused' in answer) {
      if (inPass) {
        fs.rmSync(fileOf(intent.name), { force: true });
        throw new Refusal(answer.refused);
      }
      write({
        ...sent,
        taskId: intent.messageId,
        ended: true,
        refused: answer.refused,
        seen: { sessionId: intent.messageId, state: 'rejected' },
      });
      return;
    }
    if ('canceled' in answer) {
      write({ ...sent, taskId: intent.messageId, ended: true, seen: { sessionId: intent.messageId, state: 'canceled' } });
      return;
    }
    const doubt = doubtOf(intent.name, answer.failed);
    write({ ...sent, doubt });
    if (inPass) throw new Doubt(`${doubt}: ${NOT_TWICE}`, { cause: answer.failed });
  };

  const spawn = (r: SpawnRequest): Effect.Effect<void, RunnerError> =>
    Effect.tryPromise({
      catch: failure('spawn'),
      try: async () => {
        const recorded = readEntry(fileOf(r.name));
        if (recorded?.taskId) return;
        if (recorded && sendingLive(recorded)) return;
        if (recorded) {
          throw new Doubt(
            `\`${r.name}\` was sent at ${recorded.sentAt} and its answer was never recorded, since ${recorded.doubt ?? 'the process sending it stopped first'}: ${NOT_TWICE}`,
          );
        }
        const { card, agentUrl } = await client();
        const auth = authOf(card, agentUrl, harness, credentials, o.missingCredential);
        if ('refusal' in auth) throw new Refusal(auth.refusal);
        const { at, mono } = instantNow();
        const intent: Entry = {
          name: r.name,
          agent: harness,
          messageId: randomUUID(),
          ...(r.resumeFrom ? { contextId: r.resumeFrom } : {}),
          sentAt: new Date(at).toISOString(),
          sending: { pid: process.pid, until: new Date(at + sendMs).toISOString(), ...(mono ? { mono } : {}) },
        };
        write(intent);
        const stop = new AbortController();
        inFlight.set(r.name, stop);
        const answered = sendOf(r, intent, stop.signal);
        let timer: NodeJS.Timeout | undefined;
        const waited = new Promise<'waited'>((resolve) => {
          timer = setTimeout(() => resolve('waited'), spawnWaitMs);
        });
        const first = await Promise.race([answered, waited]);
        clearTimeout(timer);
        if (first === 'waited') {
          void answered.then((a) => {
            try {
              record(intent, a, false);
            } catch {
            } finally {
              inFlight.delete(r.name);
            }
          });
          return;
        }
        try {
          record(intent, first, true);
        } finally {
          inFlight.delete(r.name);
        }
      },
    });

  const sightingOf = async (e: Entry & { taskId: string }): Promise<Sighting | undefined> => {
    if (e.ended && e.seen) return e.seen;
    let task: Task;
    try {
      task = await ask((c) => c.getTask({ tenant: '', id: e.taskId, historyLength: 0 }));
    } catch (err) {
      if (err instanceof TaskNotFoundError) return undefined;
      return e.seen ?? { sessionId: e.taskId, state: 'working', ...(e.contextId ? { nativeId: e.contextId } : {}) };
    }
    const s = sightingOfTask(task);
    const whole = turnOver(s.state) ? task.artifacts.length : e.whole;
    const kept = whole === undefined ? {} : { whole };
    if (TERMINAL.has(s.state)) write({ ...e, seen: s, ended: true, ...kept });
    else if (s.state !== e.seen?.state || s.waitingFor !== e.seen?.waitingFor || s.nativeId !== e.seen?.nativeId || whole !== e.whole)
      write({ ...e, seen: s, ...kept });
    return s;
  };

  const submittedOf = (e: Entry): Sighting => ({
    sessionId: e.messageId,
    state: 'submitted',
    ...(e.contextId ? { nativeId: e.contextId } : {}),
  });

  const observe: Effect.Effect<Map<string, Sighting>, RunnerError> = Effect.tryPromise({
    catch: failure('observe'),
    try: async () => {
      const all = open();
      const entries = all.filter((e): e is Entry & { taskId: string } => e.taskId !== undefined);
      const seen = await Promise.all(entries.map(async (e) => [e.name, await sightingOf(e)] as const));
      const sending = all.filter(sendingLive).map((e) => [e.name, submittedOf(e)] as const);
      return new Map([...seen, ...sending].filter((pair): pair is readonly [string, Sighting] => pair[1] !== undefined));
    },
  });

  const cancel = (taskId: string) =>
    ask((c) => c.cancelTask({ tenant: '', id: taskId, metadata: undefined })).then(
      () => undefined,
      (e) => {
        if (e instanceof TaskNotCancelableError || e instanceof TaskNotFoundError) return undefined;
        throw e;
      },
    );

  const stop = (sessionId: string): Effect.Effect<void, RunnerError> =>
    Effect.tryPromise({
      catch: failure('stop'),
      try: async () => {
        const e = bySession(sessionId);
        if (e?.reply !== undefined || e?.refused !== undefined) return;
        if (e && e.taskId === undefined) {
          inFlight.get(e.name)?.abort();
          return;
        }
        await cancel(e?.taskId ?? sessionId);
      },
    });

  const logs = (sessionId: string): Effect.Effect<string, RunnerError> =>
    Effect.tryPromise({
      catch: failure('logs'),
      try: async () => {
        const e = bySession(sessionId);
        if (e?.reply !== undefined) return `agent: ${e.reply}`;
        if (e?.refused !== undefined) return `REJECTED — ${e.refused}`;
        if (e && e.seen?.state === 'canceled' && e.taskId === e.messageId)
          return `CANCELED — stopped while it was being sent, before the agent answered`;
        if (e && e.taskId === undefined) {
          return sendingLive(e)
            ? `SUBMITTED — sent at ${e.sentAt}; the agent has not answered yet`
            : `sent at ${e.sentAt}, and its answer was never recorded${e.doubt ? `: ${e.doubt}` : ''}`;
        }
        const taskId = e?.taskId ?? sessionId;
        try {
          return logsOfTask(await ask((c) => c.getTask({ tenant: '', id: taskId, historyLength: undefined })));
        } catch (err) {
          if (err instanceof TaskNotFoundError) return `(the agent no longer has the Task \`${taskId}\`)`;
          throw err;
        }
      },
    });

  const find = (name: string): Effect.Effect<{ sessionId: string } | undefined, RunnerError> =>
    Effect.try({
      catch: failure('find'),
      try: () => {
        const e = readEntry(fileOf(name)) ?? readEntry(fileOf(name, done));
        return e?.agent === harness && e.taskId ? { sessionId: e.taskId } : undefined;
      },
    });

  const release = (session: Sighting): Effect.Effect<void, RunnerError> =>
    Effect.tryPromise({
      catch: failure('release'),
      try: async () => {
        const e = open().find((o) => o.taskId === session.sessionId || (o.taskId === undefined && o.messageId === session.sessionId));
        if (!e) return;
        if (e.taskId === undefined) inFlight.get(e.name)?.abort();
        else if (!e.ended && e.reply === undefined && e.refused === undefined) await cancel(session.sessionId);
        fs.mkdirSync(done, { recursive: true });
        fs.renameSync(fileOf(e.name), fileOf(e.name, done));
      },
    });

  const say = (session: { name: string; sessionId: string }, text: string): Effect.Effect<void, RunnerError> =>
    Effect.tryPromise({
      catch: failure('say'),
      try: async () => {
        const e = readEntry(fileOf(session.name));
        await ask((c) =>
          c.sendMessage({
            tenant: '',
            message: remoteFollowUpOf(session.sessionId, e?.contextId ?? '', text, randomUUID()),
            metadata: undefined,
            configuration: { acceptedOutputModes: [], taskPushNotificationConfig: undefined, returnImmediately: true },
          }),
        );
      },
    });

  const followed: FollowDeps = {
    harness,
    entryOf: (name) => readEntry(fileOf(name)) ?? readEntry(fileOf(name, done)),
    bySession,
    sendingLive,
    connection,
    ...pacesOf(o),
  };
  const read = remoteTranscriptOf(followed);
  const transcript = (sessionId: string, after?: TranscriptCursor) =>
    Effect.tryPromise({ catch: failure('transcript'), try: () => read(sessionId, after) });
  const readByName = remoteTranscriptByName(followed);
  const transcriptOf = (name: string, after?: TranscriptCursor) =>
    Effect.tryPromise({ catch: failure('transcript'), try: () => readByName(name, after) });

  return {
    spawn,
    observe,
    find,
    stop,
    logs,
    release,
    say,
    follow: remoteFollowOf(followed),
    transcript,
    transcriptOf,
    ...entryVerbsOf(harness, dir),
    refuses: remoteRefuses(harness),
  };
};
