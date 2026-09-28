/** A step's own reads: its session output, the files it wrote, and its conversation, read once from a cursor or followed. */
import { Hono } from 'hono';
import { type SSEStreamingApi, streamSSE } from 'hono/streaming';
import { phaseOfView } from 'agent-orchestrator';
import { filesPrunedWords } from 'agent-orchestrator/run';
import { readArtifactFile, readFolderFile, refusedName } from './artifacts.ts';
import { type StepLog, tailOf } from './logs.ts';
import { e, taskOfStep, type TaskView, workFolderOf } from './store.ts';

/** How much of a step's output the board is given: the end of it, which is where a running step is. */
const LOG_LINES = 200;

/** How a file a step wrote is served: never cached, never sniffed, and — an agent's text on the board's origin — never run. */
const served = (type: string) => ({
  'Content-Type': type,
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  // An SVG or an HTML file opened in a tab runs no script of its.
  'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
});

/** One of the engine's events in a session's conversation, as `transcript` gives it (`TranscriptEvent` in agent-runtime). */
export type TranscriptEvent = Awaited<ReturnType<typeof e.transcript>>['events'][number];

/** A read of a step's conversation: the engine's events from the cursor asked with, where to ask again, and whether more may come. */
export type StepTranscript = {
  events: TranscriptEvent[];
  /** The engine's cursor, to pass as `after` on the next read. Null for a step with no task to read. */
  cursor: string | null;
  /** Whether the step's task is not settled yet. */
  live: boolean;
};

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
 * One read of a step's conversation from `after`: the events and cursor as the engine's `transcript` gives them, and whether
 * the task is live — pending or running as the run reads it (`phaseOfView`), which a task held open and signed is not.
 *
 * Live is read first. A task that settles between the two reads reads as live once more, and its last lines are read on the
 * next pass; read the other way round, it could read as settled before them. A read costs an observation of every harness
 * (`view`, a `claude agents` call among them, ~0.2 s here) and, while the attempt runs, one of the task's own harness
 * (`transcript` finds the session through it); once the attempt has ended, `transcript` reads by the session's id on the record.
 */
async function readTranscript(id: string, step: string, taskId: string, after: string | undefined): Promise<Read> {
  let view: TaskView;
  try {
    view = await e.view(taskId);
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    throw new Unread(502, `Could not read task ${taskId} of step '${step}': ${why}. \`wf ls\` reads the same record from the command line.`);
  }
  const phase = phaseOfView(view);
  if (phase === 'unknown') {
    throw new Unread(404, `Step '${step}' of run '${id}' was filed as task ${taskId}, and the engine has no record of it: there is no conversation to read. \`wf ls\` shows the step unknown.`);
  }
  try {
    const { events, cursor } = await e.transcript(taskId, after);
    // Live while something runs or is to: not a task held open that signed and waits on a person's word, or was closed on it — nothing
    // runs of it, for hours at a gate, and it is not `settled` until closed (`phaseOfView` reads it as it signed). Answered, its next turn
    // is live again, under the same id: the board reads the conversation again when the step stops waiting on a person.
    return { events, cursor, live: phase === 'running' || phase === 'pending' };
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    if ((err as { exitCode?: unknown }).exitCode !== 2) {
      throw new Unread(502, `Could not read the conversation of step '${step}' (task ${taskId}): ${why}. \`wf logs ${id} ${step}\` reads its output from the command line.`);
    }
    // Refused. The engine refuses a cursor none of its reads gave, and a harness that keeps no conversation it can read — and
    // asked again from the start, only the second. The words of the refusal are the engine's to change; this is not.
    if (after !== undefined && (await e.transcript(taskId).then(() => true, () => false))) {
      throw new Unread(400, `\`${after}\` is not a cursor a read of this conversation gave. Pass the \`cursor\` the last read returned as \`after\` — on the stream, the id of the last event, which an EventSource sends back as Last-Event-ID — or none to read from the start.`);
    }
    throw new Unread(404, `Step '${step}' of run '${id}' has no conversation to read: ${why} GET /api/runs/${id}/steps/${step}/log gives what its session printed.`);
  }
}

/** How often the stream reads a live step's conversation again: once a second, as the plan asks (§4 S). */
const STREAM_EVERY_MS = 1_000;

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

export const steps = new Hono()
  // A step's session output as text, for `wf logs` parity. The board reads the conversation from the transcript routes below.
  .get('/api/runs/:id/steps/:step/log', async (c) => {
    const id = c.req.param('id');
    const step = c.req.param('step');
    const found = taskOfStep(id, step);
    if ('error' in found) return c.json({ error: found.error }, 404);
    const { taskId } = found;
    if (!taskId) return c.json({ lines: [], truncated: false } satisfies StepLog);
    try {
      return c.json(tailOf(await e.logs(taskId), LOG_LINES));
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      return c.json({
        error: `Could not read the output of step '${step}' (task ${taskId}): ${why}. \`wf logs ${id} ${step}\` reads it the same way from the command line, with the error in full.`,
      }, 502);
    }
  })
  // One file of a step's files directory, by name and never by path (artifacts.ts), as its closeout's `artifacts` link it. Read on
  // each request and never kept: a step that runs again writes its files again.
  .get('/api/runs/:id/steps/:step/artifacts/:name', (c) => {
    const id = c.req.param('id');
    const step = c.req.param('step');
    const name = c.req.param('name');
    const found = taskOfStep(id, step);
    if ('error' in found) return c.json({ error: found.error }, 404);
    const refused = refusedName(name);
    if (refused) return c.json({ error: refused }, 400);
    const file = readArtifactFile(found.run, step, name);
    // Gone, not missing: `wf prune --artifacts` removed the run's files, and its record, closeouts and branches are what is left.
    const pruned = found.run.pruned?.artifacts;
    if (!file && pruned) {
      return c.json({
        error: `Step '${step}' of run '${id}' has no file '${name}': ${filesPrunedWords(pruned)}. Its record, its closeouts and its branches are kept; \`wf decide ${id}\` reads them.`,
        pruned: pruned.at,
      }, 410);
    }
    if (!file) {
      return c.json({
        error: `Step '${step}' of run '${id}' has no file '${name}' in its files directory. GET /api/runs/${id} gives the \`url\` of each file a step's closeout named that the api serves.`,
      }, 404);
    }
    return c.body(new Uint8Array(file.body), 200, served(file.type));
  })
  // One file of a folder step's own folder, by name and never by path, as `files` on the step links it: what the step made,
  // named in its closeout or not. Read on each request and never kept — the folder is the step's, and it may write in it again.
  .get('/api/runs/:id/steps/:step/files/:name', (c) => {
    const id = c.req.param('id');
    const step = c.req.param('step');
    const name = c.req.param('name');
    const found = taskOfStep(id, step);
    if ('error' in found) return c.json({ error: found.error }, 404);
    const refused = refusedName(name);
    if (refused) return c.json({ error: refused }, 400);
    const dir = workFolderOf(found.run, step);
    if (!dir) {
      return c.json({
        error: `Step '${step}' of run '${id}' works on a branch, not in a folder: it has no files to read here. GET /api/runs/${id} gives the \`url\` of each file its closeout named, under \`artifacts\`.`,
      }, 404);
    }
    const file = readFolderFile(dir, name);
    if (!file) {
      return c.json({
        error: `Step '${step}' of run '${id}' has no file '${name}' in its folder. GET /api/runs/${id} gives the \`url\` of every file the step's folder holds, under \`files\`.`,
      }, 404);
    }
    return c.body(new Uint8Array(file.body), 200, served(file.type));
  })
  // A step's conversation, read once from a cursor: the engine's events for the step's current task, and whether it is live.
  .get('/api/runs/:id/steps/:step/transcript', async (c) => {
    const id = c.req.param('id');
    const step = c.req.param('step');
    const found = taskOfStep(id, step);
    if ('error' in found) return c.json({ error: found.error }, 404);
    // Not filed yet: nothing to read, and nothing of it moves until a tick files it.
    if (!found.taskId) return c.json({ events: [], cursor: null, live: false } satisfies StepTranscript);
    try {
      // An empty `after` is none: a reader with no cursor yet, read from the start.
      return c.json((await readTranscript(id, step, found.taskId, c.req.query('after') || undefined)) satisfies StepTranscript);
    } catch (err) {
      if (err instanceof Unread) return c.json({ error: err.message }, err.status);
      throw err;
    }
  })
  // The same conversation followed, as server-sent events: read again every second while the task is live, each new event sent
  // as `transcript`, then `settled` once the task is, or is held open and signed and so waits on a person, and the stream closed. A
  // reconnect resumes from its Last-Event-ID.
  .get('/api/runs/:id/steps/:step/transcript/stream', async (c) => {
    const id = c.req.param('id');
    const step = c.req.param('step');
    const found = taskOfStep(id, step);
    if ('error' in found) return c.json({ error: found.error }, 404);
    const { taskId } = found;
    if (!taskId) {
      return c.json({ error: `Step '${step}' of run '${id}' is not filed yet, so it has no session to follow. GET /api/runs/${id} gives its task once a tick files it.` }, 404);
    }
    // An EventSource that reconnects sends the id of the last event it was sent; a first connection can say where to start.
    const after = c.req.header('Last-Event-ID') || c.req.query('after') || undefined;
    let read: Read;
    try {
      // Read before the stream opens, so a refused cursor or a lost task is an answer with a status, not an event.
      read = await readTranscript(id, step, taskId, after);
    } catch (err) {
      if (err instanceof Unread) return c.json({ error: err.message }, err.status);
      throw err;
    }
    return streamSSE(c, async (stream) => {
      await send(stream, read);
      // Whether the last read failed. A failure is said once, and cleared with `readable` by the first read that works.
      let failing = false;
      while (read.live) {
        await stream.sleep(STREAM_EVERY_MS);
        // Nobody is reading: stop asking the engine. Each read observes the harnesses.
        if (stream.aborted) return;
        try {
          read = await readTranscript(id, step, taskId, read.cursor);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          // An answer about the conversation — its task gone from the engine's record — ends the stream: no read will change it.
          if (err instanceof Unread && err.status !== 502) {
            await stream.writeSSE({ event: 'unreadable', data: JSON.stringify({ error, retrying: false }) });
            return;
          }
          // Anything else is this read, not the conversation: a journal or a transcript that could not be opened this second
          // most likely can be the next. Read again on the next beat, from the same cursor, as a tick would.
          if (!failing) await stream.writeSSE({ event: 'unreadable', data: JSON.stringify({ error, retrying: true }) });
          failing = true;
          continue;
        }
        if (failing) await stream.writeSSE({ event: 'readable', data: '{}' });
        failing = false;
        await send(stream, read);
      }
      if (!stream.aborted) await stream.writeSSE({ event: 'settled', data: JSON.stringify({ cursor: read.cursor }), id: read.cursor });
    });
  });
