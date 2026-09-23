/**
 * The runtime's words in A2A's, and back: pure, so every mapping the seam makes is one function a test can round-trip.
 *
 * A session is an A2A Task whose id is the session's name, `ae/<task>/<n>`, and whose `contextId` is the runtime's task
 * id, so every attempt of one task, resumes included, shares one context. A spawn is a user Message: the brief its one
 * text part, and the rest of the request in its metadata, `config` whole and never opened. What a harness sees of a
 * session — the `Sighting` — rides whole in the Task's metadata, and its state is also the Task's, mapped below.
 *
 * Nothing here is stored. A Task is built from a sighting or from the journal each time it is asked for
 * (`a2a-handler.ts`), which is why a restarted runtime answers at once.
 */
import { Role, TaskState, type Message, type Part, type Task } from '@a2a-js/sdk';
import { nameFor, type Attempt, type Observed, type Sighting } from './domain.ts';
import type { SpawnRequest } from './runner.ts';

/** The runtime's task and the attempt a session name carries, or `undefined` for a name that is not `ae/<task>/<n>`. */
export const nameParts = (name: string): { taskId: string; n: number } | undefined => {
  const m = /^ae\/(.+)\/([1-9][0-9]*)$/.exec(name);
  if (!m) return undefined;
  const parts = { taskId: m[1]!, n: Number(m[2]) };
  return nameFor(parts.taskId, parts.n) === name ? parts : undefined;
};

const STATES: Record<Observed, TaskState> = {
  working: TaskState.TASK_STATE_WORKING,
  blocked: TaskState.TASK_STATE_INPUT_REQUIRED,
  done: TaskState.TASK_STATE_COMPLETED,
  failed: TaskState.TASK_STATE_FAILED,
  stopped: TaskState.TASK_STATE_CANCELED,
};

/** A session's state as A2A's. Blocked is waiting on a person: A2A's `INPUT_REQUIRED`, an interrupted state, not a final one. */
export const stateOf = (observed: Observed): TaskState => STATES[observed];

/** The session's state an A2A state stands for, or `undefined` for one no sighting maps to (`SUBMITTED`, `REJECTED`, …). */
export const observedOf = (state: TaskState): Observed | undefined =>
  (Object.keys(STATES) as Observed[]).find((o) => STATES[o] === state);

/** An object with its `undefined` keys left out, as JSON would carry it: metadata must survive a transport that serialises. */
const clean = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

const textPart = (text: string): Part => ({ content: { $case: 'text', value: text }, metadata: undefined, filename: '', mediaType: '' });

/** A message the agent says about a task: the words a harness gave, carried in `status.message`. */
const agentSays = (messageId: string, name: string, text: string): Message => ({
  messageId, contextId: nameParts(name)?.taskId ?? '', taskId: name, role: Role.ROLE_AGENT,
  parts: [textPart(text)], metadata: undefined, extensions: [], referenceTaskIds: [],
});

/** A spawn, as the user Message that asks for it. The name is the Task's id; `config` travels whole, unopened. */
export const messageOf = (r: SpawnRequest, messageId: string): Message => ({
  messageId, contextId: nameParts(r.name)?.taskId ?? '', taskId: r.name, role: Role.ROLE_USER,
  parts: [textPart(r.brief)],
  metadata: clean({
    cwd: r.cwd, harness: r.harness, config: r.config, resumeFrom: r.resumeFrom, closeoutSchema: r.closeoutSchema, budgetUsd: r.budgetUsd,
  }),
  extensions: [], referenceTaskIds: [],
});

/** Why a message cannot be read as a spawn, in words — or `undefined`. What `spawnOf` reads, it has checked here. */
export const messageRefusal = (m: Message): string | undefined => {
  if (!m.taskId) return 'the message names no task: send the session name, `ae/<task>/<n>`, as its taskId.';
  const parts = nameParts(m.taskId);
  if (!parts) return `\`${m.taskId}\` is not a session name: a session is named \`ae/<task>/<n>\`, n from 1.`;
  if (m.contextId && m.contextId !== parts.taskId) {
    return `the message's contextId \`${m.contextId}\` is not the task its name carries, \`${parts.taskId}\`: send that, or none.`;
  }
  if (m.role !== Role.ROLE_USER) return 'a spawn is a message from the user: its role is ROLE_USER.';
  if (m.parts.length !== 1 || m.parts[0]!.content?.$case !== 'text') {
    return `the brief is one text part, and this message has ${m.parts.length === 1 ? 'one part that is not text' : `${m.parts.length} parts`}.`;
  }
  if (typeof m.metadata?.cwd !== 'string' || !m.metadata.cwd) return "the message's metadata has no `cwd`: say where the session works.";
  return undefined;
};

/**
 * The spawn a message asks for, every key of the request present, as the engine builds it: a harness is handed the same
 * object whether it is reached directly or through this seam. Read only a message `messageRefusal` passed.
 */
export const spawnOf = (m: Message): SpawnRequest => {
  const md = m.metadata ?? {};
  const brief = m.parts[0]!.content as { $case: 'text'; value: string };
  return {
    name: m.taskId, brief: brief.value, cwd: md.cwd, harness: md.harness,
    config: md.config, closeoutSchema: md.closeoutSchema, budgetUsd: md.budgetUsd, resumeFrom: md.resumeFrom,
  };
};

const task = (name: string, state: TaskState, fill: { message?: Message; history?: Message[]; metadata?: Record<string, unknown> } = {}): Task => ({
  id: name, contextId: nameParts(name)?.taskId ?? '',
  status: { state, message: fill.message, timestamp: undefined },
  artifacts: [], history: fill.history ?? [], metadata: fill.metadata,
});

/** A session the harness sees, as a Task: its state mapped, and the whole sighting in `metadata.sighting`. */
export const taskOfSighting = (name: string, s: Sighting): Task => task(name, stateOf(s.state), { metadata: { sighting: s } });

/** What a harness saw of a session, off a Task `taskOfSighting` built — or `undefined` for a Task that carries none. */
export const sightingOf = (t: Task): Sighting | undefined => {
  const s = t.metadata?.sighting as Sighting | undefined;
  return s && observedOf(t.status?.state ?? TaskState.TASK_STATE_UNSPECIFIED) === s.state ? s : undefined;
};

/** A spawn the harness took: working, with the message that asked for it. */
export const startedTask = (name: string, asked: Message): Task => task(name, TaskState.TASK_STATE_WORKING, { history: [asked] });

/**
 * A spawn that failed, in the harness's words. `REJECTED` when the harness vouched nothing started — final, as the engine
 * ends the attempt `unstartable` — and `SUBMITTED` when a session may still exist: A2A's terminal states are final, and
 * this one may yet be adopted in the grace window.
 */
export const failedSpawnTask = (name: string, asked: Message, words: string, refused: boolean, messageId: string): Task =>
  task(name, refused ? TaskState.TASK_STATE_REJECTED : TaskState.TASK_STATE_SUBMITTED, { message: agentSays(messageId, name, words), history: [asked] });

/** A session stopped, as A2A answers a cancel. */
export const canceledTask = (name: string): Task => task(name, TaskState.TASK_STATE_CANCELED);

/** The words of a Task's status message, or `undefined` when it has none. */
export const wordsOf = (t: Task): string | undefined => {
  const part = t.status?.message?.parts.find((p) => p.content?.$case === 'text');
  return part?.content?.$case === 'text' ? part.content.value : undefined;
};

/**
 * An attempt the harness no longer lists, as the journal records it: open → `SUBMITTED`; ended `unstartable` →
 * `REJECTED`; ended done → `COMPLETED`, stopped → `CANCELED`, anything else → `FAILED`. The reason and the rest of the
 * attempt ride in `metadata.attempt`, and a refusal's words in `status.message`.
 */
export const taskOfAttempt = (name: string, a: Attempt, messageId: string): Task => {
  const state = a.ended === null ? TaskState.TASK_STATE_SUBMITTED
    : a.reason === 'unstartable' ? TaskState.TASK_STATE_REJECTED
    : a.ended === 'done' ? TaskState.TASK_STATE_COMPLETED
    : a.ended === 'stopped' ? TaskState.TASK_STATE_CANCELED
    : TaskState.TASK_STATE_FAILED;
  return task(name, state, {
    ...(a.error ? { message: agentSays(messageId, name, a.error) } : {}),
    metadata: { attempt: clean(a) },
  });
};
