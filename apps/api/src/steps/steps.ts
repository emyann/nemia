/**
 * A step's own reads: its session output, the files it wrote, its conversation, read once from a cursor or followed, and its task's path
 * through the runtime's lifecycle.
 */
import { Effect, Stream } from 'effect';
import { Hono } from 'hono';
import { type SSEMessage, type SSEStreamingApi, streamSSE } from 'hono/streaming';
import { COMMANDS, LOGS, phaseOfView, type TaskView } from 'agent-orchestrator';
import { filesPrunedWords } from 'agent-orchestrator/run';
import { refusedName, typeOf } from './artifacts.ts';
import { type StepLog, tailOf } from './logs.ts';
import { type LifecycleStep, pathToTurn, type StepPath, tryOfStep } from './path.ts';
import type { Followings, Relayed } from './following.ts';
import { type ApiEnv, type ApiRuntime, served } from '../layer.ts';
import { engineRead, type Engine, taskOfStep, runPlaced } from '../store.ts';
import type { PlaceService } from 'agent-orchestrator';

/**
 * The board's reads of a step in the package's table, each served on the api alone: a file of its files directory (`step artifact`) and of
 * its own folder (`step file`), the path of one of its tasks (`step path`), and a read of its conversation (`step transcript`).
 */
const ARTIFACT = COMMANDS.find((c) => c.name === 'step artifact')!;
const FILE = COMMANDS.find((c) => c.name === 'step file')!;
const PATH = COMMANDS.find((c) => c.name === 'step path')!;
const TRANSCRIPT = COMMANDS.find((c) => c.name === 'step transcript')!;

/** One read of the conversation of `task`, a task of the step `step` of the run `id`, from `after` (`step transcript`). */
const transcriptOf = async (
  e: Engine['Service'],
  placeService: PlaceService['Service'],
  id: string,
  step: string,
  task: string,
  after?: string,
) =>
  (await runPlaced(placeService, e, TRANSCRIPT.handler({ id, step, task, ...(after !== undefined && { after }) }))) as Omit<Read, 'live'>;

/** How much of a step's output the board is given: the end of it, which is where a running step is. */
const LOG_LINES = 200;

/** How a file a step wrote is served: never cached, never sniffed, and — an agent's text on the board's origin — never run. */
const servedAs = (type: string) => ({
  'Content-Type': type,
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  /** An SVG or an HTML file opened in a tab runs no script of its own. */
  'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
});

/** One of the engine's events in a session's conversation, as `transcript` gives it (`TranscriptEvent` in agent-runtime). */
export type TranscriptEvent = Effect.Success<ReturnType<Engine['Service']['transcript']>>['events'][number];

/**
 * A read of a step's conversation: the engine's events from the cursor asked with, where to ask again, whether something of the task runs
 * or is to (`live`), and whether it may yet say more (`open`).
 */
export type StepTranscript = {
  events: TranscriptEvent[];
  /** The engine's cursor, to pass as `after` on the next read. Null for a step with no task to read. */
  cursor: string | null;
  /** Whether something of the step's task runs or is to, so the conversation is being written while it is read. */
  live: boolean;
  /**
   * Whether the task has not settled — one held open on a person's word among them — so it may yet say more. A settled task says
   * nothing ever again, and the stream of one is a request nobody is served by: a reader follows an open task alone.
   */
  open: boolean;
};

/** A read as the stream takes it: a cursor always. */
type Read = StepTranscript & { cursor: string };

/** Why a step's conversation was not read, with the status that says whose it is to fix. */
class Unread extends Error {
  readonly status: 400 | 404 | 502;
  constructor(status: 400 | 404 | 502, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * One read of a step's conversation from `after`: the events and cursor as the engine's `transcript` gives them, whether the task has not
 * settled (`open`), and whether it is live — pending or running as the run reads it (`phaseOfView`), while something of it runs or is to. A
 * task held open that signed and waits on a person's word, or was closed on it, is not live: nothing of it runs, for hours at a gate,
 * though it is not `settled` until closed. Answered, its next turn is live again under the same id, and the board reads the conversation
 * again.
 *
 * Live is read first. A task that settles between the two reads reads as live once more, and its last lines are read on the
 * next pass; read the other way round, it could read as settled before them. A read costs an observation of every harness
 * (`view`, a `claude agents` call among them) and, while the attempt runs, one of the task's own harness (`transcript` finds the
 * session through it); after the attempt has ended, `transcript` reads by the session's id on the record.
 *
 * Throws `Unread`: 502 when the task or its conversation could not be read; 404 for a task the engine has no record of, or a harness
 * that keeps no conversation it can read; 400 for a cursor none of the engine's reads gave. The engine refuses the last two alike, so a
 * refused read from a cursor is asked again from the start, which refuses only the harness: the words of the engine's refusal are the
 * engine's to change, and are never parsed.
 */
async function readTranscript(
  e: Engine['Service'],
  placeService: PlaceService['Service'],
  id: string,
  step: string,
  taskId: string,
  after: string | undefined,
): Promise<Read> {
  let view: TaskView;
  try {
    view = await engineRead('view', e.view(taskId));
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
    const { events, cursor } = await transcriptOf(e, placeService, id, step, taskId, after);
    return { events, cursor, live: phase === 'running' || phase === 'pending', open: view.state.settled === null };
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
      (await transcriptOf(e, placeService, id, step, taskId).then(
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
 * A read's events on the stream, an SSE `transcript` event each, with the read's cursor as the id of the last.
 *
 * Of the last only: a reader cut off partway through a read keeps the previous read's cursor as its Last-Event-ID, so it
 * reconnects from before the events it did not get and is sent the read again, rather than past them. Sent twice, an event
 * is still one event to a reader: it is unique by its `id` and `kind`.
 */
async function send(stream: SSEStreamingApi, read: Read): Promise<void> {
  for (const [i, event] of read.events.entries()) {
    if (stream.aborted) return;
    const last = i === read.events.length - 1;
    await stream.writeSSE({ event: 'transcript', data: JSON.stringify(event), ...(last ? { id: read.cursor } : {}) });
  }
}

/** The end of the stream of a task that has settled: `read`'s events, then `settled`. */
async function settledFrom(stream: SSEStreamingApi, read: Read): Promise<void> {
  await send(stream, read);
  if (!stream.aborted) await stream.writeSSE({ event: 'settled', data: JSON.stringify({ cursor: read.cursor }), id: read.cursor });
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
function messagesOf(m: Relayed, sent: Set<string>, at: { cursor: string }): SSEMessage[] {
  if (m.kind === 'streamed') return [{ event: 'following', data: JSON.stringify({ streamed: m.yes }) }];
  if (m.kind === 'partial') return [{ event: 'partial', data: JSON.stringify({ key: m.key, delta: m.text, last: m.last }) }];
  if (m.kind === 'moved') {
    sent.clear();
    return [{ event: 'moved', data: JSON.stringify({ taskId: m.taskId }) }];
  }
  if (m.kind === 'settled') return [{ event: 'settled', data: JSON.stringify({ cursor: at.cursor }), id: at.cursor }];
  if (m.kind !== 'events') return [];
  at.cursor = m.cursor;
  const fresh = m.events.filter((ev) => !sent.has(markOf(ev)));
  for (const ev of fresh) sent.add(markOf(ev));
  return fresh.map((ev, i) => ({ event: 'transcript', data: JSON.stringify(ev), ...(i === fresh.length - 1 ? { id: m.cursor } : {}) }));
}

/**
 * What a step's stream follows and reads with: the app's runtime and its registry of followings, the engine and its place, and the step.
 */
type Reading = {
  runtime: ApiRuntime;
  followings: Followings['Service'];
  e: Engine['Service'];
  placeService: PlaceService['Service'];
  id: string;
  step: string;
};

/** Why a following stopped short of `settled`: the task it was on, and the words of an upstream that failed, null where none did. */
type Stopped = { taskId: string; error: string | null };

/**
 * The step `step` of the run `id` followed on the app's registry (`Followings`), relayed as `messagesOf` says, `read` sent after
 * `following` and what the follower read since (`caught`) after it, and `live` called once the relay is pushed. Run on the app's
 * `runtime`, interrupted as the reader goes. Answers why the following stopped short of `settled` (`Stopped`) — the step's session not
 * pushed, or its upstream failed — so the stream takes to reading the conversation again on a beat; else `null`: the task settled, or
 * nobody reads.
 */
async function followed(
  stream: SSEStreamingApi,
  r: Reading,
  taskId: string,
  read: Read,
  live?: () => Promise<void>,
): Promise<Stopped | null> {
  const gone = new AbortController();
  stream.onAbort(() => gone.abort());
  if (stream.aborted) gone.abort();
  const sent = new Set(read.events.map(markOf));
  const at = { cursor: read.cursor };
  let stopped: Stopped | null = null;
  let followedTask = taskId;
  const caught = Effect.tryPromise(() => readTranscript(r.e, r.placeService, r.id, r.step, taskId, read.cursor)).pipe(
    Effect.map((got): Relayed => ({ kind: 'events', events: got.events, cursor: got.cursor })),
    Effect.orElseSucceed(() => undefined),
  );
  const relayed = r.followings.follow(r.e, r.id, r.step, caught).pipe(
    Stream.runForEach((m) =>
      Effect.promise(async () => {
        for (const message of messagesOf(m, sent, at)) if (!stream.aborted) await stream.writeSSE(message);
        if (m.kind === 'moved') followedTask = m.taskId;
        if (m.kind === 'ended') stopped = { taskId: followedTask, error: m.error };
        if (m.kind !== 'streamed') return;
        if (m.yes) await live?.();
        if (m.yes) await send(stream, read);
        else stopped = { taskId: followedTask, error: null };
      }),
    ),
  );
  await r.runtime.runPromiseExit(relayed, { signal: gone.signal });
  return stopped !== null && !stream.aborted ? stopped : null;
}

/** The words a step's stream says of a session its harness will not push as it is written, read again on the beat instead. */
const unpushedWords = (id: string, step: string) =>
  `Step '${step}' of run '${id}' runs a session its harness does not push as it is written: what it said so far is sent, and it is read again every few seconds.`;

/** How often the conversation of a step no live stream can be had of is read again (`readAgain`). */
export const STEP_BEAT_MS = 5_000;

/**
 * The conversation of the step `step` of the run `id` read again every `STEP_BEAT_MS` for as long as a reader is there, once its
 * following stopped short of `settled` (`from`, the task it was on, the cursor to read from and why it stopped): why no live stream can
 * be had, said as `unreadable` with `retrying: true` and again only when those words change; then, each beat, the conversation read
 * afresh from the cursor, its events as `transcript`, `settled` once the task has settled, and the following asked for again, so a
 * harness that starts pushing its session resumes the live relay with `following` true and `readable` clears what was said. A read
 * that fails is the next beat's words. A pass that moved to another task is read from that task's start, and every beat after it from
 * the cursor it reached: the cursor is dropped at the move alone, never again. Ends on a settled task or a reader that has gone, and on
 * nothing else: no road here gives up.
 */
async function readAgain(
  stream: SSEStreamingApi,
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
    const data = next === null ? '{}' : JSON.stringify({ error: next, retrying: true });
    await stream.writeSSE({ event: next === null ? 'readable' : 'unreadable', data });
  };
  while (!stream.aborted) {
    await say(words);
    let read: Read | undefined;
    try {
      read = await readTranscript(r.e, r.placeService, r.id, r.step, task, after);
    } catch (err) {
      words = err instanceof Error ? err.message : String(err);
    }
    if (read === undefined) {
      await stream.sleep(STEP_BEAT_MS);
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
    await stream.sleep(STEP_BEAT_MS);
  }
}

/**
 * A step's own reads. Each answers 404 for a run or a step the run does not have.
 *
 * - `GET /api/runs/:runId/steps/:step/log` — the end of the step's session output as text (`LOG_LINES`), read by `nemia logs`' entry
 *   (`LOGS`), which reads it whole; empty for a step not filed yet; 502 when the engine could not read it. The board reads the
 *   conversation from the transcript routes.
 * - `GET /api/runs/:id/steps/:step/artifacts/:name` — one file of the step's files directory, by name and never by path (`step artifact`),
 *   as its closeout's `artifacts` link it; read on each request and never kept, since a step that runs again writes its files again.
 *   400 for a name that is not one; 410 for a file gone because `nemia prune --artifacts` removed the run's files, leaving its record,
 *   closeouts and branches; 404 for a file the directory does not have.
 * - `GET /api/runs/:id/steps/:step/files/:name` — one file of a folder step's own folder, by name and never by path (`step file`), as
 *   `files` on the step links it: what the step made, named in its closeout or not. Read on each request and never kept: the folder is
 *   the step's, and it may write in it again. 400 for a name that is not one; 404 for a step that works on a branch, or a file the folder
 *   does not have.
 * - `GET /api/runs/:id/steps/:step/transcript` — the step's conversation read once from the cursor `after` (an empty one is none, read
 *   from the start): the engine's events for the step's current task, whether it is live and whether it may yet say more (`open`), read
 *   through `step transcript`. A step not filed yet has nothing to read, is neither live nor open, and nothing of it moves until a tick
 *   files it. Refusals are `readTranscript`'s.
 * - `GET /api/runs/:id/steps/:step/transcript/stream` — the same conversation followed, as server-sent events. It starts after the
 *   Last-Event-ID an EventSource sends when it reconnects, else after `after`. The first read is made before the stream opens, so a refused
 *   cursor or a lost task is an answer with a status (`readTranscript`'s), not an event; a step not filed yet is 404.
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
 * - `GET /api/runs/:id/steps/:step/path` — the path of the task of the step's try `try` through the runtime's lifecycle (`StepPath`,
 *   through `step path`), the current try's by default: each state its journal says, the entry that moved it and when, from the filing to
 *   now, replayed off the journal alone, so it asks no harness. An earlier try of a task held open, which later tries share, runs to the
 *   answer that opened the next turn (`pathToTurn`). A step not filed yet has an empty path. Refusals are `tryOfStep`'s; 502 when the
 *   journal could not be read.
 */
export const steps = new Hono<ApiEnv>()
  .get('/api/runs/:runId/steps/:step/log', (c) =>
    served(c, async ({ e, placeService, env, home }) => {
      const id = c.req.param('runId');
      const step = c.req.param('step');
      const found = taskOfStep(id, step, home);
      if ('error' in found) return c.json({ error: found.error }, 404);
      const { taskId } = found;
      try {
        const { output } = await runPlaced(placeService, e, LOGS.handler({ runId: id, step }, env, home));
        return c.json(output === undefined ? ({ lines: [], truncated: false } satisfies StepLog) : tailOf(output, LOG_LINES));
      } catch (err) {
        const why = err instanceof Error ? err.message : String(err);
        return c.json(
          {
            error: `Could not read the output of step '${step}' (task ${taskId}): ${why}. \`nemia logs ${id} ${step}\` reads it the same way from the command line, with the error in full.`,
          },
          502,
        );
      }
    }),
  )
  .get('/api/runs/:id/steps/:step/artifacts/:name', (c) =>
    served(c, async ({ e, placeService, home }) => {
      const id = c.req.param('id');
      const step = c.req.param('step');
      const name = c.req.param('name');
      const found = taskOfStep(id, step, home);
      if ('error' in found) return c.json({ error: found.error }, 404);
      const refused = refusedName(name);
      if (refused) return c.json({ error: refused }, 400);
      const { file } = (await runPlaced(placeService, e, ARTIFACT.handler({ id, step, name }))) as { file: Buffer | null };
      const pruned = found.run.pruned?.artifacts;
      if (!file && pruned) {
        return c.json(
          {
            error: `Step '${step}' of run '${id}' has no file '${name}': ${filesPrunedWords(pruned)}. Its record, its closeouts and its branches are kept; \`nemia decide ${id}\` reads them.`,
            pruned: pruned.at,
          },
          410,
        );
      }
      if (!file) {
        return c.json(
          {
            error: `Step '${step}' of run '${id}' has no file '${name}' in its files directory. GET /api/runs/${id} gives the \`url\` of each file a step's closeout named that the api serves.`,
          },
          404,
        );
      }
      return c.body(new Uint8Array(file), 200, servedAs(typeOf(name).type));
    }),
  )
  .get('/api/runs/:id/steps/:step/files/:name', (c) =>
    served(c, async ({ e, placeService, home }) => {
      const id = c.req.param('id');
      const step = c.req.param('step');
      const name = c.req.param('name');
      const found = taskOfStep(id, step, home);
      if ('error' in found) return c.json({ error: found.error }, 404);
      const refused = refusedName(name);
      if (refused) return c.json({ error: refused }, 400);
      const { folder, file } = (await runPlaced(placeService, e, FILE.handler({ id, step, name }))) as {
        folder: string | null;
        file: Buffer | null;
      };
      if (!folder) {
        return c.json(
          {
            error: `Step '${step}' of run '${id}' works on a branch, not in a folder: it has no files to read here. GET /api/runs/${id} gives the \`url\` of each file its closeout named, under \`artifacts\`.`,
          },
          404,
        );
      }
      if (!file) {
        return c.json(
          {
            error: `Step '${step}' of run '${id}' has no file '${name}' in its folder. GET /api/runs/${id} gives the \`url\` of every file the step's folder holds, under \`files\`.`,
          },
          404,
        );
      }
      return c.body(new Uint8Array(file), 200, servedAs(typeOf(name).type));
    }),
  )
  .get('/api/runs/:id/steps/:step/path', (c) =>
    served(c, async ({ e, placeService, home }) => {
      const step = c.req.param('step');
      const found = taskOfStep(c.req.param('id'), step, home);
      if ('error' in found) return c.json({ error: found.error }, 404);
      const asked = tryOfStep(found.run, step, c.req.query('try'));
      if ('error' in asked) return c.json({ error: asked.error }, asked.status);
      if (!asked.taskId) return c.json({ taskId: null, try: asked.try, path: [] } satisfies StepPath);
      try {
        const whole = (await runPlaced(placeService, e, PATH.handler({ id: found.run.id, step, task: asked.taskId }))) as {
          path: LifecycleStep[];
        };
        const path = pathToTurn(whole.path, asked.turn);
        return c.json({ taskId: asked.taskId, try: asked.try, path } satisfies StepPath);
      } catch (err) {
        const why = err instanceof Error ? err.message : String(err);
        return c.json(
          {
            error: `Could not read the journal of task ${asked.taskId} (step '${step}', try ${asked.try}): ${why}. \`nemia ls\` reads the same record from the command line.`,
          },
          502,
        );
      }
    }),
  )
  .get('/api/runs/:id/steps/:step/transcript', (c) =>
    served(c, async ({ e, placeService, home }) => {
      const id = c.req.param('id');
      const step = c.req.param('step');
      const found = taskOfStep(id, step, home);
      if ('error' in found) return c.json({ error: found.error }, 404);
      if (!found.taskId) return c.json({ events: [], cursor: null, live: false, open: false } satisfies StepTranscript);
      try {
        const read = await readTranscript(e, placeService, id, step, found.taskId, c.req.query('after') || undefined);
        return c.json(read satisfies StepTranscript);
      } catch (err) {
        if (err instanceof Unread) return c.json({ error: err.message }, err.status);
        throw err;
      }
    }),
  )
  .get('/api/runs/:id/steps/:step/transcript/stream', (c) =>
    served(c, async ({ e, placeService, home, followings }) => {
      const id = c.req.param('id');
      const step = c.req.param('step');
      const found = taskOfStep(id, step, home);
      if ('error' in found) return c.json({ error: found.error }, 404);
      const { taskId } = found;
      if (!taskId) {
        return c.json(
          {
            error: `Step '${step}' of run '${id}' is not filed yet, so it has no session to follow. GET /api/runs/${id} gives its task once a tick files it.`,
          },
          404,
        );
      }
      const after = c.req.header('Last-Event-ID') || c.req.query('after') || undefined;
      let read: Read;
      try {
        read = await readTranscript(e, placeService, id, step, taskId, after);
      } catch (err) {
        if (err instanceof Unread) return c.json({ error: err.message }, err.status);
        throw err;
      }
      return streamSSE(c, async (stream) => {
        if (!read.open) return settledFrom(stream, read);
        const r: Reading = { runtime: c.var.runtime, followings, e, placeService, id, step };
        const stopped = await followed(stream, r, taskId, read);
        if (stopped === null) return;
        const same = stopped.taskId === taskId;
        if (same) await send(stream, read);
        await readAgain(stream, r, { task: stopped.taskId, after: same ? read.cursor : undefined, error: stopped.error });
      });
    }),
  );
