/**
 * The runtime's words in A2A's, and back: pure, so every mapping the seam makes is one function a test can round-trip.
 *
 * A session is an A2A Task whose id is the session's name, `ae/<task>/<n>`, and whose `contextId` is the harness's own id
 * for the conversation, its `nativeId` — what `--resume` takes — or the empty string until something has seen it. So
 * attempts that continued one conversation share a context where the harness keeps its id on a resume (a Claude Code job,
 * a Codex thread), and a `claude --bg` resume, which starts under a new id, is a context of its own. A spawn is a user
 * Message: the brief its one text part, the session it continues its `contextId` — A2A's meaning for a message sent in a
 * context, that it continues it — and the rest of the request in its metadata, `config` whole and never opened. What a
 * harness sees of a session — the `Sighting` — rides whole in the Task's metadata, and its state is also the Task's,
 * mapped below. What the workload said when it finished is the Task's one Artifact, `closeout`.
 *
 * A spawn is marked with the runtime's extension, `RUNTIME_EXTENSION`: it names a Task that does not exist yet, which a
 * plain A2A message may not (a message with a `taskId` continues that task). A message without the mark is plain A2A —
 * words said to a session that runs, a follow-up on its Task.
 *
 * Nothing here is stored. A Task is built from a sighting or from the journal each time it is asked for
 * (`a2a/handler.ts`), which is why a restarted runtime answers at once.
 */
import { Role, TaskState, type Artifact, type Message, type Part, type Task } from '@a2a-js/sdk';
import { nameParts, type Attempt, type Sighting, type SessionState } from '../core/index.ts';
import type { SpawnRequest } from '../harness/index.ts';

/**
 * The runtime's A2A extension. On a message, it marks a spawn: a session started under the name the message gives. On a
 * card, it says which of the runtime's own methods the agent answers (`SESSION_METHODS`) and whether a running session
 * takes words (`say`).
 */
export const RUNTIME_EXTENSION = 'urn:agent-runtime:session:v1';

/**
 * The extension's methods, beside A2A's: a session found by name, a session's logs, one of its streams kept whole, a session
 * let go of, a session's conversation read from a cursor, and the sessions listed as `listTasks` lists them, told which the
 * journal expects. Each keeps its own key — a name, a session id, the sighting — since none of them is a Task's to answer: a
 * transcript is a history read with a cursor, of a session that may have ended, where A2A's `SubscribeToTask` is a live stream
 * refused on a Task in a terminal state. One is no session's at all: `harnessQuota`, what the harness's subscription has left,
 * asked of the harness itself. `forgetSession` removes what the harness keeps of a settled session, or, dry, lists it.
 * `sessionKept` names where the harness keeps what it has of many sessions at once, and removes nothing. `compactSessions` rewrites
 * the captures of every ended session to what their readers read, or, dry, counts them.
 */
export const SESSION_METHODS = [
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
] as const;
export type SessionMethod = (typeof SESSION_METHODS)[number];

/**
 * A session's state is A2A's, by name: each of the runtime's names is the protocol's `TaskState` of the same word. The
 * table is the whole mapping, both ways; `UNSPECIFIED` has no name, and nothing else is left out.
 */
const STATES: Record<SessionState, TaskState> = {
  submitted: TaskState.TASK_STATE_SUBMITTED,
  working: TaskState.TASK_STATE_WORKING,
  'input-required': TaskState.TASK_STATE_INPUT_REQUIRED,
  'auth-required': TaskState.TASK_STATE_AUTH_REQUIRED,
  completed: TaskState.TASK_STATE_COMPLETED,
  failed: TaskState.TASK_STATE_FAILED,
  canceled: TaskState.TASK_STATE_CANCELED,
  rejected: TaskState.TASK_STATE_REJECTED,
};

/** A session's state as A2A's `TaskState`: the same word. */
export const stateOf = (state: SessionState): TaskState => STATES[state];

/** The runtime's name for an A2A state, or `undefined` for one it has no name for (`UNSPECIFIED`, or one a later A2A adds). */
export const nameOf = (state: TaskState): SessionState | undefined =>
  (Object.keys(STATES) as SessionState[]).find((o) => STATES[o] === state);

/** An object with its `undefined` keys left out, as JSON would carry it: metadata must survive a transport that serialises. */
const clean = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

const textPart = (text: string): Part => ({ content: { $case: 'text', value: text }, metadata: undefined, filename: '', mediaType: '' });

/** A message the agent says about a task: the words a harness gave, carried in `status.message`. */
const agentSays = (messageId: string, name: string, contextId: string, text: string): Message => ({
  messageId,
  contextId,
  taskId: name,
  role: Role.ROLE_AGENT,
  parts: [textPart(text)],
  metadata: undefined,
  extensions: [],
  referenceTaskIds: [],
});

/**
 * A spawn, as the user Message that asks for it. The name is the Task's id; the session it continues, `resumeFrom`, its
 * `contextId`, empty for a spawn that starts cold; `config` travels whole, unopened.
 */
export const messageOf = (r: SpawnRequest, messageId: string): Message => ({
  messageId,
  contextId: r.resumeFrom ?? '',
  taskId: r.name,
  role: Role.ROLE_USER,
  parts: [textPart(r.brief)],
  metadata: clean({
    cwd: r.cwd,
    harness: r.harness,
    config: r.config,
    closeoutSchema: r.closeoutSchema,
    resource: r.resource,
    traceparent: r.traceparent,
  }),
  extensions: [RUNTIME_EXTENSION],
  referenceTaskIds: [],
});

/**
 * Words said to a running session, as A2A's follow-up: a user Message on the session's Task, one text part, no mark, and
 * no context, which the Task already has.
 */
export const followUpOf = (name: string, text: string, messageId: string): Message => ({
  messageId,
  contextId: '',
  taskId: name,
  role: Role.ROLE_USER,
  parts: [textPart(text)],
  metadata: undefined,
  extensions: [],
  referenceTaskIds: [],
});

/**
 * Why a message's taskId is not a session's, in words — or `undefined`. Asked of a spawn and of a follow-up alike. A
 * spawn's `contextId` is the session it continues, any the harness took; a follow-up's is judged against the session
 * the harness lists (`contextRefusal`), which only the handler has.
 */
const sessionRefusal = (taskId: string): string | undefined =>
  nameParts(taskId) ? undefined : `\`${taskId}\` is not a session name: a session is named \`ae/<task>/<n>\`, n from 1.`;

/**
 * Why words sent in `contextId` are not for the session `name` the harness lists as `s`, in words — or `undefined`. A
 * follow-up sends no context, or the session's own: A2A reads a context as the conversation a message belongs to, and
 * words for another conversation are not this session's to hear.
 */
export const contextRefusal = (name: string, contextId: string, s: Sighting): string | undefined => {
  if (!contextId || contextId === s.nativeId) return undefined;
  return s.nativeId
    ? `the message's contextId \`${contextId}\` is not the context of session \`${name}\`, \`${s.nativeId}\`: send that, or none.`
    : `the message's contextId \`${contextId}\` is not the context of session \`${name}\`, which has none known yet: send none.`;
};

/** Why a message cannot be read as a spawn, in words — or `undefined`. What `spawnOf` reads, it has checked here. */
export const messageRefusal = (m: Message): string | undefined => {
  if (!m.taskId) return 'the message names no task: send the session name, `ae/<task>/<n>`, as its taskId.';
  const named = sessionRefusal(m.taskId);
  if (named) return named;
  if (m.role !== Role.ROLE_USER) return 'a spawn is a message from the user: its role is ROLE_USER.';
  if (m.parts.length !== 1 || m.parts[0].content?.$case !== 'text') {
    return `the brief is one text part, and this message has ${m.parts.length === 1 ? 'one part that is not text' : `${m.parts.length} parts`}.`;
  }
  if (typeof m.metadata?.cwd !== 'string' || !m.metadata.cwd) return "the message's metadata has no `cwd`: say where the session works.";
  return undefined;
};

/**
 * Why a message cannot be read as words said to a session, in words — or `undefined`. A message with no taskId asks
 * A2A for a new Task, and this agent starts a session only on a spawn, which carries the mark.
 */
export const followUpRefusal = (m: Message): string | undefined => {
  if (!m.taskId) {
    return `a message with no taskId asks for a new task, and a session is started only by a spawn, marked \`${RUNTIME_EXTENSION}\`: to speak to a running session, send its name, \`ae/<task>/<n>\`, as the taskId.`;
  }
  const named = sessionRefusal(m.taskId);
  if (named) return named;
  if (m.role !== Role.ROLE_USER) return 'words said to a session are a message from the user: its role is ROLE_USER.';
  if (m.parts.length !== 1 || m.parts[0].content?.$case !== 'text') {
    return `words said to a session are one text part, and this message has ${m.parts.length === 1 ? 'one part that is not text' : `${m.parts.length} parts`}.`;
  }
  if (!m.parts[0].content.value.trim()) return 'the words are empty: give the words the session should hear.';
  return undefined;
};

/** The words a message `followUpRefusal` passed says. */
export const followUpText = (m: Message): string => (m.parts[0].content as { $case: 'text'; value: string }).value;

/**
 * The spawn a message asks for, every key of the request present, as the engine builds it: a harness is handed the same
 * object whether it is reached directly or through this seam. Read only a message `messageRefusal` passed.
 */
export const spawnOf = (m: Message): SpawnRequest => {
  const md = m.metadata ?? {};
  const brief = m.parts[0].content as { $case: 'text'; value: string };
  return {
    name: m.taskId,
    brief: brief.value,
    cwd: md.cwd,
    harness: md.harness,
    config: md.config,
    closeoutSchema: md.closeoutSchema,
    resumeFrom: m.contextId || undefined,
    resource: md.resource,
    traceparent: md.traceparent,
  };
};

/**
 * What the workload said when it finished, as the Task's Artifact: named `closeout`, one part — the payload as `data`, or
 * as `text/plain` when it is a string, as Codex's prose arrives — and, when the harness said when it was given, `at`
 * (milliseconds) in its metadata. A resumed session can carry its parent's statement; `at` is how a reader tells.
 */
export const closeoutArtifact = (payload: unknown, at?: number): Artifact => ({
  artifactId: 'closeout',
  name: 'closeout',
  description: '',
  parts: [
    typeof payload === 'string'
      ? { content: { $case: 'text', value: payload }, metadata: undefined, filename: '', mediaType: 'text/plain' }
      : { content: { $case: 'data', value: payload }, metadata: undefined, filename: '', mediaType: '' },
  ],
  metadata: at === undefined ? undefined : { at },
  extensions: [],
});

/** What a closeout Artifact carries, or `undefined` for a Task with none. The payload as it was given, string or not. */
export const closeoutOf = (t: Task): unknown => {
  const content = t.artifacts.find((a) => a.artifactId === 'closeout')?.parts[0]?.content;
  return content?.$case === 'text' || content?.$case === 'data' ? content.value : undefined;
};

type Fill = { message?: Message; history?: Message[]; metadata?: Record<string, unknown>; artifacts?: Artifact[] };

const task = (name: string, contextId: string, state: TaskState, fill: Fill = {}): Task => ({
  id: name,
  contextId,
  status: { state, message: fill.message, timestamp: undefined },
  artifacts: fill.artifacts ?? [],
  history: fill.history ?? [],
  metadata: fill.metadata,
});

/**
 * A session the harness sees, as a Task: its state mapped, its context the harness's id for it, what it closed with its
 * Artifact, and the whole sighting in `metadata.sighting`. `state` is for the one Task whose state is not its sighting's —
 * a signed session its task holds open for a person (`INPUT_REQUIRED`) — which then carries no sighting `sightingOf` reads.
 */
export const taskOfSighting = (name: string, s: Sighting, state = stateOf(s.state)): Task =>
  task(name, s.nativeId ?? '', state, {
    metadata: { sighting: s },
    ...(s.closeout ? { artifacts: [closeoutArtifact(s.closeout.payload, s.closeout.at)] } : {}),
  });

/** What a harness saw of a session, off a Task `taskOfSighting` built — or `undefined` for a Task that carries none. */
export const sightingOf = (t: Task): Sighting | undefined => {
  const s = t.metadata?.sighting as Sighting | undefined;
  return s && nameOf(t.status?.state ?? TaskState.TASK_STATE_UNSPECIFIED) === s.state ? s : undefined;
};

/** A spawn the harness took: working, with the message that asked for it, in no context known until the harness lists it. */
export const startedTask = (name: string, asked: Message): Task => task(name, '', TaskState.TASK_STATE_WORKING, { history: [asked] });

/**
 * A spawn that failed, in the harness's words. `REJECTED` when the harness vouched nothing started — final, as the engine
 * ends the attempt `unstartable` — and `SUBMITTED` when a session may still exist: A2A's terminal states are final, and
 * this one may yet be adopted in the grace window.
 */
export const failedSpawnTask = (name: string, asked: Message, words: string, refused: boolean, messageId: string): Task =>
  task(name, '', refused ? TaskState.TASK_STATE_REJECTED : TaskState.TASK_STATE_SUBMITTED, {
    message: agentSays(messageId, name, '', words),
    history: [asked],
  });

/** A session stopped, as A2A answers a cancel, in the context the harness listed it under. */
export const canceledTask = (name: string, s: Sighting): Task => task(name, s.nativeId ?? '', TaskState.TASK_STATE_CANCELED);

/** The words of a Task's status message, or `undefined` when it has none. */
export const wordsOf = (t: Task): string | undefined => {
  const part = t.status?.message?.parts.find((p) => p.content?.$case === 'text');
  return part?.content?.$case === 'text' ? part.content.value : undefined;
};

/**
 * An attempt the harness no longer lists, as the journal records it: open → `SUBMITTED`; ended `unstartable` →
 * `REJECTED`; ended done → `COMPLETED`, or `INPUT_REQUIRED` when its task is held open waiting on a person (`waiting`),
 * stopped → `CANCELED`, anything else → `FAILED`. Its context is the id the attempt was recorded with, what it closed with
 * its Artifact; the reason and the rest of the attempt ride in `metadata.attempt`, and a refusal's words in `status.message`.
 */
export const taskOfAttempt = (name: string, a: Attempt, messageId: string, waiting = false): Task => {
  const state =
    a.ended === null
      ? TaskState.TASK_STATE_SUBMITTED
      : a.reason === 'unstartable'
        ? TaskState.TASK_STATE_REJECTED
        : a.ended === 'done'
          ? waiting
            ? TaskState.TASK_STATE_INPUT_REQUIRED
            : TaskState.TASK_STATE_COMPLETED
          : a.ended === 'stopped'
            ? TaskState.TASK_STATE_CANCELED
            : TaskState.TASK_STATE_FAILED;
  const contextId = a.nativeId ?? '';
  return task(name, contextId, state, {
    ...(a.error ? { message: agentSays(messageId, name, contextId, a.error) } : {}),
    ...(a.closeout !== undefined ? { artifacts: [closeoutArtifact(a.closeout)] } : {}),
    metadata: { attempt: clean(a) },
  });
};

/** What a remote agent's Task, one the runtime did not make, waits for in an interrupted state, in A2A's word for it. */
const WAITS: ReadonlyMap<TaskState, string> = new Map([
  [TaskState.TASK_STATE_INPUT_REQUIRED, 'input'],
  [TaskState.TASK_STATE_AUTH_REQUIRED, 'authentication'],
]);

/**
 * What a remote agent's Task says of its session, as a sighting. Its id is the session's, and its context the
 * conversation's (`nativeId`), which a later turn continues. Its state is the Task's, passed through by name (`nameOf`):
 * the lifecycle reads A2A's words, so there is nothing to translate. `INPUT_REQUIRED` and `AUTH_REQUIRED` wait on the
 * caller, and `waitingFor` says for what, in A2A's word for it. A state no version of A2A this runtime knows gives,
 * `UNSPECIFIED` among them, says nothing has ended, and reads as `working`: the deadline bounds it.
 *
 * The closing statement is the data part of the last Artifact that has one, and only on a Task that `COMPLETED`: an
 * agent may publish an Artifact while it works, and a statement read then would end the attempt early (`closedOut`).
 * It has no time: the Task was made by this attempt's message, so nothing on it was said before the attempt began,
 * and the engine keeps it whatever the clock says. None, and the end is recorded `stated: false`.
 */
export const sightingOfTask = (t: Task): Sighting => {
  const state = t.status?.state ?? TaskState.TASK_STATE_UNSPECIFIED;
  const named = nameOf(state) ?? 'working';
  const waiting = WAITS.get(state);
  const payload = named === 'completed' ? statementOf(t.artifacts) : undefined;
  return {
    sessionId: t.id,
    state: named,
    ...(t.contextId ? { nativeId: t.contextId } : {}),
    ...(waiting ? { waitingFor: waiting } : {}),
    ...(payload !== undefined ? { closeout: { payload } } : {}),
  };
};

/** The data part of the last Artifact that carries one, or `undefined`. */
const statementOf = (artifacts: readonly Artifact[]): unknown => {
  for (const a of [...artifacts].reverse()) {
    const data = [...a.parts].reverse().find((p) => p.content?.$case === 'data');
    if (data?.content?.$case === 'data') return data.content.value;
  }
  return undefined;
};

/**
 * A spawn, as the message a remote agent is sent: the brief its one text part, and in the context of the session it
 * continues, `resumeFrom`, when it continues one. No `taskId`: under A2A a message that names a task continues it, and the
 * agent names a new one itself. The closing statement's schema rides in the metadata under the runtime's extension, for an
 * agent that reads it; the message is not marked with the extension (`messageOf`'s spawn by name), and carries nothing of
 * the local harnesses' (`cwd`, `config`), which a remote agent has no use for.
 */
export const remoteMessageOf = (r: SpawnRequest, messageId: string): Message => ({
  messageId,
  contextId: r.resumeFrom ?? '',
  taskId: '',
  role: Role.ROLE_USER,
  parts: [textPart(r.brief)],
  metadata: r.closeoutSchema === undefined ? undefined : { [RUNTIME_EXTENSION]: { closeoutSchema: r.closeoutSchema } },
  extensions: [],
  referenceTaskIds: [],
});

/** Words for a remote Task that waits on its caller, as A2A's follow-up: a user message on that Task, in its context. */
export const remoteFollowUpOf = (taskId: string, contextId: string, text: string, messageId: string): Message => ({
  messageId,
  contextId,
  taskId,
  role: Role.ROLE_USER,
  parts: [textPart(text)],
  metadata: undefined,
  extensions: [],
  referenceTaskIds: [],
});

/** A part as a line of text: its words, its data as JSON, or what a file part is called. */
const partText = (p: Part): string => {
  const c = p.content;
  if (c?.$case === 'text') return c.value;
  if (c?.$case === 'data') return JSON.stringify(c.value);
  return `(${c?.$case ?? 'empty'} part${p.filename ? ` ${p.filename}` : ''})`;
};

/** What a remote Task holds, as text a person reads: its messages in order, its state and status words, and its Artifacts. */
export const logsOfTask = (t: Task): string => {
  const said = (m: Message) => `${m.role === Role.ROLE_AGENT ? 'agent' : 'user'}: ${m.parts.map(partText).join(' ')}`;
  const state = TaskState[t.status?.state ?? TaskState.TASK_STATE_UNSPECIFIED].replace(/^TASK_STATE_/, '');
  return [
    ...t.history.map(said),
    `${state}${t.status?.message ? ` — ${t.status.message.parts.map(partText).join(' ')}` : ''}`,
    ...t.artifacts.map((a) => `artifact ${a.name || a.artifactId}: ${a.parts.map(partText).join(' ')}`),
  ].join('\n');
};
