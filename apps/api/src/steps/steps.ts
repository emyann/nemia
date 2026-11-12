/**
 * The `steps` group's handlers (`objects`' `Api`, `StepsGroup`): a run's step's reads — its tries, one try, a try's closeout and what it
 * was told, the run object's sub-resources; the end of its session output, the files it wrote, its conversation read once from a cursor
 * or followed, and its task's path through the runtime's lifecycle. Each calls the orchestrator's entry by its name (`TRIES`, `LOGS`,
 * `STEP_TRANSCRIPT`, …) with its typed input, through the request's services (`inRequest`).
 */
import { type Context, Effect, Queue, Stream } from 'effect';
import { HttpApiBuilder, HttpApiSchema } from 'effect/http-api';
import {
  CLOSEOUT,
  type EngineService,
  LOGS,
  lifecycleGraph,
  phaseOfView,
  refusedName,
  STEP_ARTIFACT,
  STEP_FILE,
  STEP_PATH,
  STEP_TRANSCRIPT,
  tailOf,
  transcriptAskedRead,
  transcriptCursorRead,
  type TranscriptAsked,
  type TaskView,
  TOLD,
  TRIES,
  TRY,
  typeOf,
} from 'agent-orchestrator';
import { filesPrunedWords } from 'agent-orchestrator/run';
import {
  Api,
  BadRequest,
  closeoutNarrowed,
  fieldsNamed,
  Gone,
  Missing,
  ReadFailed,
  type StepLog,
  type StepPath,
  type StepStreamEvent,
  type StepTranscript,
  TRANSCRIPT_PAGE,
  type PageBounds,
} from 'objects';
import { pathToTurn, tryOfStep } from './path.ts';
import type { Followings, Relayed, TranscriptEvent } from './following.ts';
import type { Served, Services } from '../layer.ts';
import { engineRead, taskOfStep } from '../store.ts';
import { answered } from '../objects/refused.ts';

/** How much of a step's output the board is given: the end of it, which is where a running step is. */
const LOG_LINES = 200;

/** The step `step` of the run `id` and its current task (null for one not filed yet), or `Missing` for a run or a step it lacks. */
const stepOf = (s: Served, id: string, step: string) => {
  const found = taskOfStep(id, step, s.home);
  if ('error' in found) throw new Missing({ error: found.error });
  return found;
};

/**
 * The file `name` a step wrote, as the `Api`'s `StepFile` serves it: never cached, never sniffed, and — an agent's text on the board's
 * origin — never run.
 */
const servedFile = (name: string, file: Buffer) =>
  HttpApiSchema.withHeaders({
    body: new Uint8Array(file),
    headers: {
      'content-type': typeOf(name).type,
      'cache-control': 'no-store' as const,
      'x-content-type-options': 'nosniff' as const,
      'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });

/** A request's reads of the engine: the engine, and the request's services a program of the package's runs over. */
type Reader = Pick<Served, 'e' | 'inRequest'>;

/** What a page of a conversation asks (`STEP_TRANSCRIPT`'s `page`): the query's counts and kinds, and the bounds it is cut within. */
type PageAskedOf = TranscriptAsked & { readonly bounds: PageBounds };

/**
 * One read of the conversation of `task`, a task of the step `step` of the run `id`, from `after` (`STEP_TRANSCRIPT`): the engine's whole
 * read after its cursor, or, asked a `page`, the page cut of it, its cursor `<engine cursor>~<n>`.
 */
const transcriptOf = (r: Reader, id: string, step: string, task: string, after?: string, page?: PageAskedOf) =>
  r.inRequest(
    STEP_TRANSCRIPT.handler({ runId: id, step, task, ...(after !== undefined && { after }), ...(page !== undefined && { page }) }),
  );

/** A read as the stream takes it: the engine's events, as the `Api`'s `StepTranscript` serves them, and a cursor always. */
type Read = Omit<StepTranscript, 'events' | 'cursor'> & { events: TranscriptEvent[]; cursor: string };

/** Why a step's conversation was not read, with the status that says whose it is to fix. */
class Unread extends Error {
  readonly status: 400 | 404 | 502;
  constructor(status: 400 | 404 | 502, message: string) {
    super(message);
    this.status = status;
  }
}

/** `err` as the `Api`'s error of its status where it is an `Unread`, as it is otherwise. */
const unreadAs = (err: unknown): unknown =>
  !(err instanceof Unread)
    ? err
    : err.status === 400
      ? new BadRequest({ error: err.message })
      : err.status === 404
        ? new Missing({ error: err.message })
        : new ReadFailed({ error: err.message });

/**
 * One read of a step's conversation from `after`: the events and cursor as the engine's `transcript` gives them, whether the task has not
 * settled (`open`), and whether it is live — pending or running as the run reads it (`phaseOfView`), while something of it runs or is to. A
 * task held open that signed and waits on a person's word, or was closed on it, is not live: nothing of it runs, for hours at a gate,
 * though it is not `settled` until closed. Answered, its next turn is live again under the same id, and the board reads the conversation
 * again.
 *
 * Live is read first. A task that settles between the two reads reads as live once more, and its last lines are read on the
 * next pass; read the other way round, it could read as settled before them. A read costs an observation of every harness
 * (`view`) and, while the attempt runs, one of the task's own harness (`transcript` finds the session through it — an attached
 * session's run file); after the attempt has ended, `transcript` reads by the session's id on the record.
 *
 * Throws `Unread`: 502 when the task or its conversation could not be read; 404 for a task the engine has no record of, or a harness
 * that keeps no conversation it can read; 400 for a cursor none of the engine's reads gave. The engine refuses the last two alike, so a
 * refused read from a cursor is asked again from the start, which refuses only the harness: the words of the engine's refusal are the
 * engine's to change, and are never parsed.
 */
async function readTranscript(
  r: Reader,
  id: string,
  step: string,
  taskId: string,
  after: string | undefined,
  page?: PageAskedOf,
): Promise<Read> {
  let view: TaskView;
  try {
    view = await engineRead('view', r.e.view(taskId));
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    throw new Unread(
      502,
      `Could not read task ${taskId} of step '${step}': ${why}. \`nemia ls\` reads the same record from the command line.`,
    );
  }
  const phase = phaseOfView(view);
  if (phase === 'unknown') {
    throw new Unread(
      404,
      `Step '${step}' of run '${id}' was filed as task ${taskId}, and the engine has no record of it: there is no conversation to read. \`nemia ls\` shows the step unknown.`,
    );
  }
  try {
    const { events, cursor, more } = await transcriptOf(r, id, step, taskId, after, page);
    return {
      events,
      cursor,
      live: phase === 'running' || phase === 'pending',
      open: view.state.settled === null,
      ...(more !== undefined && { more }),
    };
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    if ((err as { exitCode?: unknown }).exitCode !== 2) {
      throw new Unread(
        502,
        `Could not read the conversation of step '${step}' (task ${taskId}): ${why}. \`nemia logs ${id} ${step}\` reads its output from the command line.`,
      );
    }
    if (
      after !== undefined &&
      (await transcriptOf(r, id, step, taskId).then(
        () => true,
        () => false,
      ))
    ) {
      throw new Unread(
        400,
        `\`${after}\` is not a cursor a read of this conversation gave. Pass the \`cursor\` the last read returned as \`after\` — on the stream, the id of the last event, which an EventSource sends back as Last-Event-ID — or none to read from the start.`,
      );
    }
    throw new Unread(
      404,
      `Step '${step}' of run '${id}' has no conversation to read: ${why} GET /api/runs/${id}/steps/${step}/log gives what its session printed.`,
    );
  }
}

/**
 * Where a step's stream writes, as its body is read: each event in turn (`write`, waiting while the reader is behind), whether the reader
 * has gone (`gone`), and a wait of the stream's beat that ends early once it has (`sleep`).
 */
type Writer = {
  readonly gone: AbortSignal;
  readonly write: (event: StepStreamEvent) => Promise<void>;
  readonly sleep: (ms: number) => Promise<void>;
};

/**
 * The body of a step's stream: what `run` writes, as the `Api`'s `StepStreamEvent`s, a few held while the reader is behind; ended once
 * `run` returns, and `run` told the reader has gone (`Writer.gone`) once the response is let go. Its wait (`sleep`) is the beat's alone:
 * `readAgain` is its one caller.
 */
const streamOf = (run: (stream: Writer) => Promise<void>): Stream.Stream<StepStreamEvent> =>
  Stream.callback<StepStreamEvent>(
    (queue) =>
      Effect.gen(function* () {
        const gone = new AbortController();
        yield* Effect.addFinalizer(() => Effect.sync(() => gone.abort()));
        const stream: Writer = {
          gone: gone.signal,
          write: (event) =>
            gone.signal.aborted
              ? Promise.resolve()
              : Effect.runPromise(Queue.offer(queue, event), { signal: gone.signal }).then(
                  () => undefined,
                  () => undefined,
                ),
          sleep: (ms) =>
            new Promise<void>((resolve) => {
              const over = AbortSignal.any([gone.signal, AbortSignal.timeout(ms)]);
              if (over.aborted) resolve();
              else over.addEventListener('abort', () => resolve(), { once: true });
            }),
        };
        yield* Effect.tryPromise(() => run(stream)).pipe(
          Effect.catch((err) => Effect.logError('a step stream stopped on a failure', err.cause)),
          Effect.ensuring(Queue.end(queue)),
          Effect.forkScoped,
        );
      }),
    { bufferSize: 64, strategy: 'suspend' },
  );

/**
 * A read's events on the stream, a `transcript` event each, with the read's cursor as the id of the last.
 *
 * Of the last only: a reader cut off partway through a read keeps the previous read's cursor as its Last-Event-ID, so it
 * reconnects from before the events it did not get and is sent the read again, rather than past them. Sent twice, an event
 * is still one event to a reader: it is unique by its `id` and `kind`.
 */
async function send(stream: Writer, read: Read): Promise<void> {
  for (const [i, event] of read.events.entries()) {
    if (stream.gone.aborted) return;
    const last = i === read.events.length - 1;
    await stream.write({ event: 'transcript', data: event, ...(last ? { id: read.cursor } : {}) });
  }
}

/** The end of the stream of a task that has settled: `read`'s events, then `settled`. */
async function settledFrom(stream: Writer, read: Read): Promise<void> {
  await send(stream, read);
  if (!stream.gone.aborted) await stream.write({ event: 'settled', data: { cursor: read.cursor }, id: read.cursor });
}

/** An event as it is unique: by its `kind` and `id` together. */
const markOf = (event: TranscriptEvent) => `${event.kind} ${event.id}`;

/**
 * What a follower is sent of one moment (`Relayed`), the events `sent` it holds by mark: whether the step's harness streams
 * (`following`), each whole event not sent yet (`transcript`, the cursor the id of the last), a piece of the message being written
 * (`partial`, its text the `delta` added under its block's `key`, `last` once the block is whole), the step's move to another task
 * (`moved`, after which its events are sent again from the start) and the step finished (`settled`). A state, and an upstream that
 * failed (`ended`), are sent nothing: a failed upstream's words are said by the beat that takes over from it (`readAgain`).
 */
function messagesOf(m: Relayed, sent: Set<string>, at: { cursor: string }): StepStreamEvent[] {
  if (m.kind === 'streamed') return [{ event: 'following', data: { streamed: m.yes } }];
  if (m.kind === 'partial') return [{ event: 'partial', data: { key: m.key, delta: m.text, last: m.last } }];
  if (m.kind === 'moved') {
    sent.clear();
    return [{ event: 'moved', data: { taskId: m.taskId } }];
  }
  if (m.kind === 'settled') return [{ event: 'settled', data: { cursor: at.cursor }, id: at.cursor }];
  if (m.kind !== 'events') return [];
  at.cursor = m.cursor;
  const fresh = m.events.filter((ev) => !sent.has(markOf(ev)));
  for (const ev of fresh) sent.add(markOf(ev));
  return fresh.map((ev, i) => ({ event: 'transcript', data: ev, ...(i === fresh.length - 1 ? { id: m.cursor } : {}) }));
}

/**
 * What a step's stream follows and reads with: the app's registry of followings and the request's services it follows over (`context`,
 * which the upstream it opens is forked with), the request's reads, and the step.
 */
type Reading = {
  followings: Followings['Service'];
  context: Context.Context<Services | EngineService>;
  reader: Reader;
  id: string;
  step: string;
  /** How long `readAgain` waits between two reads: the served `Beats.step`, `STEP_BEAT_MS` unless a test gives another. */
  beatMs: number;
};

/** Why a following stopped short of `settled`: the task it was on, and the words of an upstream that failed, null where none did. */
type Stopped = { taskId: string; error: string | null };

/**
 * The step `step` of the run `id` followed on the app's registry (`Followings`), relayed as `messagesOf` says, `read` sent after
 * `following` and what the follower read since (`caught`) after it, and `live` called once the relay is pushed. Interrupted as the reader
 * goes. Answers why the following stopped short of `settled` (`Stopped`) — the step's session not pushed, or its upstream failed — so the
 * stream takes to reading the conversation again on a beat; else `null`: the task settled, or nobody reads.
 */
async function followed(stream: Writer, r: Reading, taskId: string, read: Read, live?: () => Promise<void>): Promise<Stopped | null> {
  const sent = new Set(read.events.map(markOf));
  const at = { cursor: read.cursor };
  let stopped: Stopped | null = null;
  let followedTask = taskId;
  const caught = Effect.tryPromise(() => readTranscript(r.reader, r.id, r.step, taskId, read.cursor)).pipe(
    Effect.map((got): Relayed => ({ kind: 'events', events: got.events, cursor: got.cursor })),
    Effect.orElseSucceed(() => undefined),
  );
  const relayed = r.followings.follow(r.reader.e, { kind: 'step', runId: r.id, step: r.step }, caught).pipe(
    Stream.runForEach((m) =>
      Effect.promise(async () => {
        for (const message of messagesOf(m, sent, at)) if (!stream.gone.aborted) await stream.write(message);
        if (m.kind === 'moved') followedTask = m.taskId;
        if (m.kind === 'ended') stopped = { taskId: followedTask, error: m.error };
        if (m.kind !== 'streamed') return;
        if (m.yes) await live?.();
        if (m.yes) await send(stream, read);
        else stopped = { taskId: followedTask, error: null };
      }),
    ),
  );
  await Effect.runPromiseExitWith(r.context)(relayed, { signal: stream.gone });
  return stopped !== null && !stream.gone.aborted ? stopped : null;
}

/** The words a step's stream says of a session its harness will not push as it is written, read again on the beat instead. */
const unpushedWords = (id: string, step: string) =>
  `Step '${step}' of run '${id}' runs a session its harness does not push as it is written: what it said so far is sent, and it is read again every few seconds.`;

/** How often the conversation of a step no live stream can be had of is read again (`readAgain`) by default: `Beats.step`'s default. */
export const STEP_BEAT_MS = 5_000;

/**
 * The conversation of the step `step` of the run `id` read again every beat (`r.beatMs`, `STEP_BEAT_MS` by default) for as long as a reader
 * is there, once its following stopped short of `settled` (`from`, the task it was on, the cursor to read from and why it stopped): why no
 * live stream can be had, said as `unreadable` with `retrying: true` and again only when those words change; then, each beat, the
 * conversation read afresh from the cursor, its events as `transcript`, `settled` once the task has settled, and the following asked for
 * again, so a harness that starts pushing its session resumes the live relay with `following` true and `readable` clears what was said. A
 * read that fails is the next beat's words. A pass that moved to another task is read from that task's start, and every beat after it from
 * the cursor it reached: the cursor is dropped at the move alone, never again. Ends on a settled task or a reader that has gone, and on
 * nothing else: no road here gives up.
 */
async function readAgain(
  stream: Writer,
  r: Reading,
  from: { task: string; after: string | undefined; error: string | null },
): Promise<void> {
  let task = from.task;
  let after = from.after;
  let words = from.error ?? unpushedWords(r.id, r.step);
  let said: string | null = null;
  const say = async (next: string | null) => {
    if (next === said) return;
    said = next;
    await stream.write(next === null ? { event: 'readable', data: {} } : { event: 'unreadable', data: { error: next, retrying: true } });
  };
  while (!stream.gone.aborted) {
    await say(words);
    let read: Read | undefined;
    try {
      read = await readTranscript(r.reader, r.id, r.step, task, after);
    } catch (err) {
      words = err instanceof Error ? err.message : String(err);
    }
    if (read === undefined) {
      await stream.sleep(r.beatMs);
      continue;
    }
    after = read.cursor;
    if (!read.open) return settledFrom(stream, read);
    await send(stream, read);
    const again = await followed(stream, r, task, read, () => say(null));
    if (again === null) return;
    if (again.taskId !== task) after = undefined;
    task = again.taskId;
    words = again.error ?? unpushedWords(r.id, r.step);
    await stream.sleep(r.beatMs);
  }
}

/** The end of the step's session output (`LOGS`), or `ReadFailed` naming the command that reads it whole. */
const logOf = (runId: string, step: string) =>
  answered(async (s): Promise<StepLog> => {
    const { taskId } = stepOf(s, runId, step);
    try {
      const { output } = await s.inRequest(LOGS.handler({ runId, step }));
      return output === undefined ? { lines: [], truncated: false } : tailOf(output, LOG_LINES);
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      throw new ReadFailed({
        error: `Could not read the output of step '${step}' (task ${taskId}): ${why}. \`nemia logs ${runId} ${step}\` reads it the same way from the command line, with the error in full.`,
      });
    }
  });

/** The file `name` of the step's files directory (`STEP_ARTIFACT`): `BadRequest` for a path, `Gone` once pruned, `Missing` where none. */
const artifactOf = (runId: string, step: string, name: string) =>
  answered(async (s) => {
    const { run } = stepOf(s, runId, step);
    const refused = refusedName(name);
    if (refused) throw new BadRequest({ error: refused });
    const { file } = await s.inRequest(STEP_ARTIFACT.handler({ runId, step, name }));
    const pruned = run.pruned?.artifacts;
    if (!file && pruned) {
      throw new Gone({
        error: `Step '${step}' of run '${runId}' has no file '${name}': ${filesPrunedWords(pruned)}. Its record, its closeouts and its branches are kept; \`nemia decide ${runId}\` reads them.`,
        pruned: pruned.at,
      });
    }
    if (!file) {
      throw new Missing({
        error: `Step '${step}' of run '${runId}' has no file '${name}' in its files directory. GET /api/runs/${runId} gives the \`url\` of each file a step's closeout named that the api serves.`,
      });
    }
    return servedFile(name, file);
  });

/** The file `name` of a folder step's own folder (`STEP_FILE`): `BadRequest` for a path, `Missing` for a branch step or none there. */
const fileOf = (runId: string, step: string, name: string) =>
  answered(async (s) => {
    stepOf(s, runId, step);
    const refused = refusedName(name);
    if (refused) throw new BadRequest({ error: refused });
    const { folder, file } = await s.inRequest(STEP_FILE.handler({ runId, step, name }));
    if (!folder) {
      throw new Missing({
        error: `Step '${step}' of run '${runId}' works on a branch, not in a folder: it has no files to read here. GET /api/runs/${runId} gives the \`url\` of each file its closeout named, under \`artifacts\`.`,
      });
    }
    if (!file) {
      throw new Missing({
        error: `Step '${step}' of run '${runId}' has no file '${name}' in its folder. GET /api/runs/${runId} gives the \`url\` of every file the step's folder holds, under \`files\`.`,
      });
    }
    return servedFile(name, file);
  });

/** The path of the task of the step's try `tried` (`STEP_PATH`), the current one's for none, cut to that try's turn (`pathToTurn`). */
const pathOf = (runId: string, step: string, tried: string | undefined) =>
  answered(async (s): Promise<StepPath> => {
    const { run } = stepOf(s, runId, step);
    const asked = tryOfStep(run, step, tried);
    if ('error' in asked) throw asked.status === 400 ? new BadRequest({ error: asked.error }) : new Missing({ error: asked.error });
    if (!asked.taskId) return { taskId: null, try: asked.try, path: [], lifecycle: lifecycleGraph() };
    try {
      const whole = await s.inRequest(STEP_PATH.handler({ runId: run.id, step, task: asked.taskId }));
      return { taskId: asked.taskId, try: asked.try, path: pathToTurn(whole.path, asked.turn), lifecycle: lifecycleGraph() };
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      throw new ReadFailed({
        error: `Could not read the journal of task ${asked.taskId} (step '${step}', try ${asked.try}): ${why}. \`nemia ls\` reads the same record from the command line.`,
      });
    }
  });

/**
 * A page of the step's conversation read once from `after` (`readTranscript`), as `asked` cuts it within `bounds` (`TRANSCRIPT_PAGE`,
 * unless a test shortens them), nothing for a step not filed yet. A cursor whose count is no whole number from 0, a `limit` or a `last`
 * that is no whole number from 1, both asked, or a kind that is none are `Invalid` (422), refused before anything is read.
 */
export const transcriptAt = (runId: string, step: string, after: string | undefined, asked: TranscriptAsked, bounds = TRANSCRIPT_PAGE) =>
  answered(async (s): Promise<StepTranscript> => {
    const at = transcriptCursorRead(after);
    if (at instanceof Error) throw at;
    const checked = transcriptAskedRead(asked, bounds);
    if (checked instanceof Error) throw checked;
    const { taskId } = stepOf(s, runId, step);
    if (!taskId) return { events: [], cursor: null, live: false, open: false };
    return readTranscript(s, runId, step, taskId, after, { ...asked, bounds }).catch((err: unknown) => Promise.reject(unreadAs(err)));
  });

/** The step's conversation followed from `after`: read once before the stream opens, so its refusals are statuses, then streamed. */
const followedFrom = (runId: string, step: string, after: string | undefined) =>
  answered(async (s) => {
    const { beats, followings } = s;
    const { taskId } = stepOf(s, runId, step);
    if (!taskId) {
      throw new Missing({
        error: `Step '${step}' of run '${runId}' is not filed yet, so it has no session to follow. GET /api/runs/${runId} gives its task once a tick files it.`,
      });
    }
    const read = await readTranscript(s, runId, step, taskId, after).catch((err: unknown) => Promise.reject(unreadAs(err)));
    const context = await s.inRequest(Effect.context<Services | EngineService>());
    const r: Reading = { followings, context, reader: s, id: runId, step, beatMs: beats.step ?? STEP_BEAT_MS };
    const body = streamOf(async (stream) => {
      if (!read.open) return settledFrom(stream, read);
      const stopped = await followed(stream, r, taskId, read);
      if (stopped === null) return;
      const same = stopped.taskId === taskId;
      if (same) await send(stream, read);
      await readAgain(stream, r, { task: stopped.taskId, after: same ? read.cursor : undefined, error: stopped.error });
    });
    return HttpApiSchema.withHeaders({ body, headers: { 'cache-control': 'no-cache' as const } });
  });

/**
 * A run's step's reads. Each answers `Missing` (404) for a run or a step the run does not have.
 *
 * - `tries`, `try`, `closeout`, `told` — the run object's sub-resources: the entries of the same names, off the app's informer; a try
 *   and a closeout asked with `?fields=` answer the closeout narrowly (`objects`' `closeoutNarrowed`).
 * - `log` — the end of the step's session output as text (`LOG_LINES`), read by `nemia logs`' entry (`LOGS`), which reads it whole; empty
 *   for a step not filed yet; `ReadFailed` (502) when the engine could not read it. The board reads the conversation from the transcript.
 * - `artifact` — one file of the step's files directory, by name and never by path (`STEP_ARTIFACT`), as its closeout's `artifacts` link
 *   it; read on each request and never kept, since a step that runs again writes its files again. `BadRequest` (400) for a name that is
 *   not one; `Gone` (410) for a file gone because `nemia prune --artifacts` removed the run's files, leaving its record, closeouts and
 *   branches; `Missing` for a file the directory does not have.
 * - `file` — one file of a folder step's own folder, by name and never by path (`STEP_FILE`), as `files` on the step links it: what the
 *   step made, named in its closeout or not. `BadRequest` for a name that is not one; `Missing` for a step that works on a branch, or a
 *   file the folder does not have.
 * - `transcript` — a page of the step's conversation read once from the cursor `after` (an empty one is none, read from the start): the
 *   engine's events for the step's current task — the first `limit`, or the `last`, of the `kinds` asked, `TRANSCRIPT_PAGE`'s default
 *   page where neither count is asked — whether events are left after the page (`more`), whether it is live and whether it may yet say
 *   more (`open`), read through `STEP_TRANSCRIPT`; its cursor `<engine cursor>~<n>`. A step not filed yet has nothing to read, is neither
 *   live nor open, and nothing of it moves until a tick files it. Refusals are `transcriptAt`'s and `readTranscript`'s.
 * - `transcriptStream` — the same conversation followed, as server-sent events. It starts after the Last-Event-ID an EventSource sends
 *   when it reconnects, else after `after`. The first read is made before the stream opens, so a refused cursor or a lost task is an
 *   answer with a status (`readTranscript`'s), not an event; a step not filed yet is `Missing`.
 *   A step whose task has not settled is followed live on the app's registry (`Followings`), one upstream a step whoever follows it: first
 *   `following` with `streamed`, whether its harness pushes the session; then, pushed, the read's events and each new one as `transcript`,
 *   the message being written as `partial` (`key`, `delta`, `last`: a follower who joins mid-message is handed the text so far as one
 *   `delta`), `moved` with `taskId` when the step goes to another attempt or try, whose history follows from its start, and `settled` once
 *   its task has, and the stream closed; a held task's stream stays open while it waits on a person.
 *   A task already settled is sent once: its events as `transcript`, then `settled`. Where no live stream of a live step can be had — its
 *   session not pushed (`following` with `streamed: false`), or its upstream failed — the stream says why as `unreadable` with
 *   `retrying: true` and reads the conversation again every `STEP_BEAT_MS` (`readAgain`), asking to follow it again each beat, so a
 *   harness that starts pushing resumes the live relay and `readable` clears what was said. It gives up on no step: it ends on a settled
 *   task, or when nobody reads.
 * - `path` — the path of the task of the step's try `try` through the runtime's lifecycle (`StepPath`, through `STEP_PATH`), the current
 *   try's by default: each state its journal says, the entry that moved it and when, from the filing to now, replayed off the journal
 *   alone, so it asks no harness. An earlier try of a task held open, which later tries share, runs to the answer that opened the next
 *   turn (`pathToTurn`). A step not filed yet has an empty path. Each answer carries the lifecycle the path walks, read off the runtime's
 *   code (`lifecycleGraph`), which the board draws it on. Refusals are `tryOfStep`'s; `ReadFailed` when the journal could not be read.
 */
export const stepsHandlers = HttpApiBuilder.group(Api, 'steps', (handlers) =>
  handlers
    .handle('tries', ({ params: { runId, step } }) => answered((s) => s.inRequest(TRIES.handler({ runId, step }))))
    .handle('try', ({ params, query }) =>
      answered(async (s) => {
        const read = await s.inRequest(TRY.handler(params));
        return read.closeout === null || query.fields === undefined
          ? read
          : { ...read, closeout: closeoutNarrowed(read.closeout, fieldsNamed(query.fields)) };
      }),
    )
    .handle('closeout', ({ params, query }) =>
      answered(async (s) => {
        const read = await s.inRequest(CLOSEOUT.handler(params));
        return read.closeout === null || query.fields === undefined
          ? read
          : { ...read, closeout: closeoutNarrowed(read.closeout, fieldsNamed(query.fields)) };
      }),
    )
    .handle('told', ({ params: { runId, step } }) => answered((s) => s.inRequest(TOLD.handler({ runId, step }))))
    .handle('log', ({ params: { runId, step } }) => logOf(runId, step))
    .handle('artifact', ({ params: { runId, step, file } }) => artifactOf(runId, step, file))
    .handle('file', ({ params: { runId, step, file } }) => fileOf(runId, step, file))
    .handle('path', ({ params: { runId, step }, query }) => pathOf(runId, step, query.try))
    .handle('transcript', ({ params: { runId, step }, query: { after, limit, last, kinds } }) =>
      transcriptAt(runId, step, after || undefined, { limit, last, kinds }),
    )
    .handle('transcriptStream', ({ params: { runId, step }, query, headers }) =>
      followedFrom(runId, step, headers['last-event-id'] || query.after || undefined),
    ),
);
