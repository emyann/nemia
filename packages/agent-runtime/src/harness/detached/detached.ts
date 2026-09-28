/**
 * A runner for any harness that runs a prompt to completion and exits.
 *
 * `Runner.claude()` leans on `claude agents --json` — a registry somebody else maintains. Most
 * harnesses have no such thing: Codex has `codex exec`, which runs in the foreground and exits.
 * So for those we detach a worker per session and maintain the registry ourselves, as a directory
 * of run files (`bin/ae-worker.ts` writes them).
 *
 * **What this costs, stated plainly**: a heartbeat. A worker that is killed leaves a run file that
 * says `working` forever, and nothing on disk distinguishes that from a session thinking hard. So
 * the worker beats every 5s and `observe` calls a stale beat dead. That is a lease, in the only
 * form a lease has ever taken. It is the price of not having somebody else's registry to read,
 * and therefore the price of running more than one harness.
 *
 * What it buys: this file has no idea what a harness is. It needs a command, a working directory
 * and an exit code — so a new harness is a `HarnessSpec` value, not new code. The two shipped are
 * `codex` (`harness/codex/codex.ts`) and `claudeDetached` (`harness/claude/code.ts`).
 */
import { Effect, Result, Schema, SchemaIssue } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Denial, Sighting, Usage, SessionState } from '../../core/index.ts';
import { RunnerError, type RunnerOps, type SpawnRequest, type TranscriptEvent } from '../seam.ts';
import { writeMcpConfig } from '../mcp.ts';
import { readTranscript } from '../transcript.ts';
import { countSpawn, readText } from '../../core/engine/tally.ts';

/** Everything this engine needs to know about a harness. Add one by writing one of these. */
export type HarnessSpec = {
  name: string;
  /** The command that runs a brief to completion. Exit 0 is success; anything else is failure. */
  command: (r: SpawnRequest, io?: HarnessIO) => { cmd: string; args: string[] };
  /**
   * What this harness needs to know about the machine before it runs — read from disk, from git —
   * kept out of `command` so that stays a pure function of what it is given. Merged into the `io`
   * the command receives. A throw refuses the spawn: nothing has run, and the attempt ends
   * `unstartable` in its words.
   */
  prepare?: (r: SpawnRequest) => Partial<HarnessIO>;
  /**
   * A regex with one capture group, matched against the harness's output, that finds ITS session
   * id — what a later task resumes, and what `transcript.file` is given. Optional: the name is the key,
   * this is just a handle.
   */
  nativeIdPattern?: string;
  /**
   * What this harness cannot be asked for, as a sentence that names what to write instead — or
   * `undefined` when it can do what the task says. Permission modes and efforts are its own words,
   * so the check lives on the spec, and `file()` asks it before anything is journalled. A spec
   * without one is asked nothing.
   */
  refuses?: (task: Omit<SpawnRequest, 'name'>) => string | undefined;
  /**
   * What the harness says in its own output, for one that prints its final answer rather than
   * writing it where the runner chose. Handed the worker's capture of the harness's stdout and
   * stderr whenever it has changed, and returns what it found there — nothing it did not. A pure
   * function of the text, as `command` is of the request.
   */
  readOutput?: (output: string) => HarnessOutput;
  /**
   * Where the harness keeps its own record of a session's conversation, and what one line of it says —
   * for a harness that keeps one. `file` is given the harness's own session id, the run's `nativeId`,
   * and may read the disk to find it, as `prepare` does; `events` is pure, given the line parsed and the
   * byte offset it starts at. Absent, the runner has no `transcript`, and `logs` is what it gives.
   */
  transcript?: {
    file: (nativeId: string) => string | undefined;
    events: (entry: unknown, offset: number) => TranscriptEvent[];
  };
  /**
   * Why a session of this harness cannot be told anything while it runs, in its own words and saying what to
   * do instead. A spec without `input` has no `say` — a harness that runs a prompt and exits takes nothing in the
   * meantime — so `say` refuses every task of it with this sentence, and a spec without one with the engine's.
   */
  noChannel?: string;
  /**
   * A harness that reads its messages as lines on its stdin, and so can be told something while it runs: `claudeJob`
   * (`claude -p --input-format stream-json`). Set, `command` leaves the brief out, and the worker writes it as the first
   * line on the harness's stdin; each word a person says after it is appended by `say` to the run's inbox — a file of
   * lines beside its run file, the person's, which the worker only reads — and the worker writes it on. At the first line
   * of the harness's output that closes (`closesOn`) the worker ends stdin: a harness that reads its stdin for more waits
   * for its end before it exits, and words said after it are refused.
   */
  input?: {
    /** The one line a message is written as — the brief, then each word said. Pure, and holds no newline. */
    line: (text: string) => string;
    /**
     * The line of the harness's output after which it takes no more words: one that parses as a JSON object whose own
     * `key` is `value`. Read as data, never as a prefix: Claude Code prints its result's `type` far down the line.
     */
    closesOn: { key: string; value: string };
  };
  /**
   * The context windows this harness can be given, in tokens, both ends included: a task's `contextTokens` is handed to
   * `command`, and `file()` refuses one outside the range. Absent: the harness has no such knob, and `file()` refuses a
   * task that sets one rather than let it run on a window it did not ask for.
   */
  contextTokens?: { least: number; most: number };
  /**
   * The harness is Claude Code, and `command` hands a task's `config.claude` to it as flags (`claudeFlagsOf`). Absent: the
   * harness has no such flags, and `file()` refuses a task that carries any rather than start a session without them.
   */
  claudeFlags?: true;
  /**
   * The harness prints a resumed session's cost and API time as totals that carry its parent's on, not as its own:
   * `claude -p --resume` does. Set, the run file keeps the id it resumed, and `observe` takes the
   * parent's printed totals off — the latest run started before it under that id, as its own output read them. Where
   * there is no such run, or it printed no total, the attempt carries no cost rather than its parent's too.
   */
  resumeCostCarried?: true;
};

/**
 * Where a harness that can take a structured final answer should put it.
 *
 * Chosen by the runner, per run, OUTSIDE the workspace: anything written inside a step's worktree
 * travels down its git branch, and the next step would be cut a directory that already says it is
 * finished.
 */
export type HarnessIO = {
  /** Present when the task asked for a closeout: its JSON Schema, written to a file. */
  closeoutSchemaFile?: string;
  /** Where the harness should write the final answer that satisfies the schema. */
  closeoutFile?: string;
  /** Directories to treat as trusted for this run. Codex loads a project's rules only when trusted. */
  trustedDirs?: string[];
  /** Present when the task named MCP servers: its `mcp`, written as an MCP config (`{"mcpServers": …}`). */
  mcpConfigFile?: string;
  /** The checkout's own `.mcp.json`, when there is one. Found by a spec's `prepare`, which reads the disk. */
  checkoutMcpConfig?: string;
};

/** What a harness's output said, as its spec's `readOutput` found it. Each part absent when it does not say. */
export type HarnessOutput = {
  /** The final answer, wrapped so that an answer is told apart from none by presence, not by value. */
  closeout?: { payload: unknown };
  /** What the session consumed, as far as the output says: every field a measurement, absent when not. */
  usage?: Usage;
  /** A limit its configuration set that the harness says it ended the session at — `budget`, its spend cap. */
  limit?: string;
  /** The tool calls the harness denied the session, in the order it first did. Absent when none, or when it does not say. */
  denials?: Denial[];
};

/** How long a run file may go unbeaten before `observe` calls it dead. The worker beats every 5s. */
export const STALE_MS = 30_000;

/** The worker a detached run is spawned with, `bin/ae-worker.ts`, found from this file's own folder. */
export const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'bin', 'ae-worker.ts');
const safe = (name: string) => name.replace(/[^a-zA-Z0-9]+/g, '_');
const isDirectory = (p: string) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};
const sizeOf = (p: string) => {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
};

/** What the detached worker writes of its harness's process: its own words, which a run file on disk keeps. */
type WorkerState = 'working' | 'done' | 'failed' | 'stopped';

/**
 * A run file's state in A2A's names — the one place this runner translates, since codex, the check and claude-detached all
 * run under the worker:
 *
 *   working, heartbeat fresh  → working    the worker is at work
 *   working, heartbeat stale  → failed     the worker is gone, and its process with it: the whole lease
 *   done                      → completed  the harness exited 0
 *   failed                    → failed     it exited otherwise, or the worker could not start it
 *   stopped                   → canceled   a stop ended it
 *
 * No run is waiting on a person: a harness the worker runs has no registry that says so (`Sighting.waitingFor`).
 */
const WORKER_STATES: Record<WorkerState, SessionState> = { working: 'working', done: 'completed', failed: 'failed', stopped: 'canceled' };

/** A `working` run whose heartbeat has stopped is not working: `failed`. In the worker's words. */
const leased = (run: { state: string; heartbeatAt: string }, now: number): string =>
  run.state === 'working' && now - new Date(run.heartbeatAt).getTime() > STALE_MS ? 'failed' : run.state;

/** A run file's state as a sighting says it. A word no worker writes is `failed`, as a lease gone is. */
export const detachedStateOf = (run: { state: string; heartbeatAt: string }, now: number): SessionState => {
  const word = leased(run, now);
  return Object.hasOwn(WORKER_STATES, word) ? WORKER_STATES[word as WorkerState] : 'failed';
};

/**
 * A run file as the worker (`bin/ae-worker.ts`) and the spawn write it: what the worker writes about one session, and the
 * whole of what a detached harness knows of it.
 *
 * Its `state` is the worker's own word, kept on disk as it is — one of `working | stopped | done | failed`, the four
 * `ae-worker.ts` writes: `detachedStateOf` translates it, and reads a word no worker writes as `failed`, so the schema takes
 * any text there. **Never `blocked`**: these harnesses run a process and watch it exit, and a process that is waiting on
 * somebody is, from out here, a process that is running. So no detached session reaches the engine's `needs-human`, and
 * none carries a `Sighting.waitingFor`: there is nothing to carry, not something dropped. Only a harness with a registry
 * that says a session is waiting, and says what for — Claude Code's `claude agents --json` — can fill that field.
 *
 * The file is the session: `stop` finds the worker by it. Removed, alone or with the store it is in, the worker takes it
 * for a stop, ends its harness and exits, and never writes the file again.
 */
const RunFileSchema = Schema.StructWithRest(
  Schema.Struct({
    name: Schema.optional(Schema.String),
    state: Schema.String,
    pid: Schema.Finite,
    heartbeatAt: Schema.String,
    startedAt: Schema.optional(Schema.String),
    nativeId: Schema.optional(Schema.String),
    logFile: Schema.String,
    exitCode: Schema.optional(Schema.Finite),
    /** The harness's own id this run resumed, kept only for a spec whose printed totals carry the parent's. */
    resumeFrom: Schema.optional(Schema.String),
    /** For a spec with `input`: what the worker writes on the harness's stdin (`RunInput`). Absent, the run takes no words. */
    input: Schema.optional(
      Schema.Struct({
        first: Schema.String,
        inbox: Schema.String,
        from: Schema.Finite,
        closesOn: Schema.Struct({ key: Schema.String, value: Schema.String }),
      }),
    ),
    /**
     * How far into the inbox the worker has written on, in bytes: every line before it was handed to the harness, or was
     * about to be — the worker writes this before it writes the line, so a worker started again on this run file never
     * writes one twice. Absent, nothing has been, and the worker starts at `input.from`.
     */
    inputAt: Schema.optional(Schema.Finite),
    /** The harness printed the line that closes its input, and the worker ended its stdin: words said now reach nobody. */
    inputClosed: Schema.optional(Schema.Literal(true)),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

type RunFile = typeof RunFileSchema.Type;

const isRunFile = Schema.is(RunFileSchema);

/**
 * The run file in `text`, or why it is none: the first field a worker would have written otherwise. JSON that does not parse
 * is none too — a worker rewriting it is caught mid-write, and the next read finds it whole.
 */
const runFileIn = (text: string): RunFile | string => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return `it is not JSON yet (${e instanceof Error ? e.message : String(e)})`;
  }
  if (isRunFile(parsed)) return parsed;
  const decoded = Schema.decodeUnknownResult(RunFileSchema)(parsed);
  if (Result.isSuccess(decoded)) return decoded.success;
  const [first] = formatter(decoded.failure.issue).issues;
  const key = first?.path?.map((p) => (typeof p === 'object' && p !== null && 'key' in p ? String(p.key) : String(p))).join('.');
  return key ? `its \`${key}\` is not what a worker writes (${first?.message ?? 'refused'})` : 'it is no run file a worker writes';
};

const formatter = SchemaIssue.makeFormatterStandardSchemaV1();

/**
 * What the worker is given to write on a harness's stdin: the brief's line first; then each line of the inbox from `from`
 * on — the inbox's size when the run was spawned, so a run spawned again under a name finds no words said to the one
 * before it — until a line of the harness's output `closesOn`.
 */
export type RunInput = { first: string; inbox: string; from: number; closesOn: { key: string; value: string } };

const runFileOf = (spec: HarnessSpec, root: string, name: string) => path.join(root, 'runs', spec.name, `${safe(name)}.json`);

/**
 * A run found by its name, from its own run file alone: no other run is read, and no output. A detached run's handle
 * is its name, so that is the id found. A file whose name is not this one — `safe` folds two names into one path — is
 * not this run, and a file that cannot be read yet is not found, as `observe` skips it.
 */
export const detachedFind =
  (spec: HarnessSpec, root: string) =>
  (name: string): Effect.Effect<{ sessionId: string } | undefined> =>
    Effect.sync(() => {
      try {
        const run = runFileIn(readText(runFileOf(spec, root, name)));
        return typeof run !== 'string' && run.name === name ? { sessionId: name } : undefined;
      } catch {
        return undefined;
      }
    });

/**
 * The runner of a detached harness: a worker per session (`bin/ae-worker.ts`), and the directory `runs/<spec's name>`
 * under `root` as its registry, read fresh every pass, the same shape as `claude agents`. Beside each run file: the
 * harness's output (`.log`), its closeout and the closeout's schema, its MCP config, its inbox (`.inbox.jsonl`, so never
 * read as a run file), and a stop asked of it (`.stop`: a file of its own, so the run file keeps one writer, the worker,
 * and not `.json`, so never a run file).
 *
 * Run files are read (`readAll`) by their name alone: a closeout, a schema or an MCP config is also JSON, and a payload
 * that carried a `name` would otherwise be read as a session. A half-written file, one in no shape a worker writes, or one
 * gone between the listing and the read, is skipped: the next pass reads it whole.
 *
 * What a run said, as a sighting carries it:
 *
 * - `statementOf`: the harness's final answer, if it wrote one, with the moment the file was written. The file's clock is
 *   not this process's clock, but the distance that matters is minutes: it is written when the harness exits, long after
 *   the attempt was journalled. Text that does not parse is carried as text — what counts as a valid closeout is the
 *   reader's business, not the runner's.
 * - `outputOf`: what the spec reads in the harness's output, with when that output was last written — the time a statement
 *   found there is reported with, as a closeout file's is its own mtime. Read again only when the capture has changed, so
 *   a finished run's output is read once per process.
 * - `usageOf`: what a run's output says it used, as the attempt's own. A resumed run of a spec whose totals carry the
 *   parent's (`resumeCostCarried`) has the parent's taken off: the parent is the run under the id it resumed that started
 *   last before it — a resume keeps its parent's id, so a later run under that id is a child, never the parent. No
 *   parent, a parent that printed no total, or a total that would go below nothing: that measure is dropped, never
 *   overcounted.
 *
 * - `spawn`, in order:
 *   1. Resolves the task's `cwd` from the process that launches, as `claude --bg`'s is: relative, the worker would start in
 *      it and launch the harness in the same path again, from inside it (`spawn sh ENOENT` for `cwd: 'repo'`). `file`
 *      refuses one at both doors; this is for a journal written otherwise, or by hand, and a caller of the runner itself.
 *   2. Refuses a `cwd` that is not a directory, because `spawn` does not throw for it: the child emits the error later,
 *      and, unheard, that event kills the process that launched the worker — the engine.
 *   3. Clears the previous attempt's closeout, output and stop: a re-spawn of the same attempt must not find the previous
 *      one's answer waiting for it, in its file or in the output a spec reads one from, nor a stop asked of it, which its
 *      worker would read as asked of this one and start nothing.
 *   4. Writes the closeout's schema, and writes or clears the MCP config: a re-spawn is given the servers its task names,
 *      no more. The inbox is never written or cleared: it is the person's, and a run spawned again under the name starts
 *      past what was said to the one before it (`RunInput.from`).
 *   5. Writes the run file before the launch, with no pid: the run is intended, and a crash here leaves a file that says
 *      so. The worker overwrites it with its own pid the moment it starts.
 *   6. Launches the worker detached, stdio ignored, unref'd: it outlives this process by design. Its `error` event is
 *      heard, so a launch that fails after `spawn` returns never takes the engine down with it; the run file it leaves
 *      says working with no pid, and the lease calls that dead.
 *
 *   Every step runs before the worker is launched, or is the launch: whatever threw, no session is running under the
 *   name, and the spawn is refused.
 * - `observe`: a sighting per run file, whose `sessionId` is the run's name, this runner's handle. `nativeId` is the
 *   harness's own, scraped from its output by the worker — present only once the harness has printed it, which is why
 *   resume is best-effort for this kind of harness and exact for one with a registry. The closeout is the file the harness
 *   wrote its answer to, when it wrote one (`statementOf`), otherwise what its output says (`outputOf`). The exit code is
 *   the process's own, once it has one: the worker writes -1 when there is none — killed by a signal, or never started —
 *   and that is reported as no code, not as a code.
 * - `stop`, in order, for a run that is working:
 *   1. Leaves the stop on disk (`.stop`). The run file exists before the worker has written its own pid, and a stop in
 *      that window has no process to signal; the worker reads the stop once its pid is published, before it starts the
 *      harness, writes `stopped` and starts nothing.
 *   2. Reads the run file again, and sends SIGTERM to a working worker whose pid is above 0: `process.kill(0, …)` signals
 *      this process's entire process group. The worker kills the harness's process group and writes `stopped` — that
 *      state is the worker's to write, as the one that saw it happen. It hears SIGTERM from the moment its pid is on
 *      disk, and a worker already gone is no error.
 *
 *   Whichever came first, one of the two sees the other — a worker that read no stop published its pid before the stop
 *   was written, so the second read finds it — and a stop that lands at any moment is heard, on the pass that sends it.
 * - `logs`: the last 8000 characters of the harness's output.
 * - `transcript` (a spec with `transcript`): the conversation, from the harness's own record, found by the harness's own
 *   id — the run's `nativeId`, which the worker reads off what the harness prints, so until it has printed one there is
 *   nothing to read. A name with no run file is taken for that id itself: the id an attempt's end was recorded with,
 *   which is what the engine asks by once the run file is gone.
 * - `say` (a spec with `input`): words for a running session, appended to its inbox as the line its harness reads, for
 *   its worker to write on. Its own run file alone is read, as `find` reads it. Appended is not read: the worker writes a
 *   line on within a second, and one appended in the second before the harness's closing line is never written on.
 *   Refused, with nothing appended, where no worker would write the words on: no run under the name, or a run file that
 *   cannot be read; a run its worker started with no input; a run whose harness has printed its closing line; one that is
 *   not working; and words whose line holds a line break, which would reach the harness as two, or as half a message.
 */
export const detachedOps = (spec: HarnessSpec, root: string): RunnerOps => {
  const dir = path.join(root, 'runs', spec.name);
  const runFile = (name: string) => runFileOf(spec, root, name);
  const logFile = (name: string) => path.join(dir, `${safe(name)}.log`);
  const closeoutFile = (name: string) => path.join(dir, `${safe(name)}.closeout.json`);
  const schemaFile = (name: string) => path.join(dir, `${safe(name)}.schema.json`);
  const mcpFile = (name: string) => path.join(dir, `${safe(name)}.mcp.json`);
  const inboxFile = (name: string) => path.join(dir, `${safe(name)}.inbox.jsonl`);
  const stopFile = (name: string) => path.join(dir, `${safe(name)}.stop`);

  const readAll = (): Array<{ name: string; run: RunFile }> => {
    if (!fs.existsSync(dir)) return [];
    const out: Array<{ name: string; run: RunFile }> = [];
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json') || f.endsWith('.closeout.json') || f.endsWith('.schema.json') || f.endsWith('.mcp.json')) continue;
      try {
        const run = runFileIn(readText(path.join(dir, f)));
        if (typeof run !== 'string' && run.name) out.push({ name: run.name, run });
      } catch {}
    }
    return out;
  };

  const find = (sessionId: string) => readAll().find(({ name }) => name === sessionId);

  const statementOf = (name: string): Sighting['closeout'] => {
    const f = closeoutFile(name);
    let text: string;
    let at: number;
    try {
      text = readText(f);
      at = fs.statSync(f).mtimeMs;
    } catch {
      return undefined;
    }
    let payload: unknown = text;
    try {
      payload = JSON.parse(text);
    } catch {}
    return { payload, at };
  };

  const outputs = new Map<string, { size: number; mtimeMs: number; read: HarnessOutput }>();
  const outputOf = (name: string): { read: HarnessOutput; at: number } | undefined => {
    if (!spec.readOutput) return undefined;
    let size: number;
    let mtimeMs: number;
    try {
      ({ size, mtimeMs } = fs.statSync(logFile(name)));
    } catch {
      return undefined;
    }
    let known = outputs.get(name);
    if (!known || known.size !== size || known.mtimeMs !== mtimeMs) {
      let text: string;
      try {
        text = readText(logFile(name));
      } catch {
        return undefined;
      }
      known = { size, mtimeMs, read: spec.readOutput(text) };
      outputs.set(name, known);
    }
    return { read: known.read, at: known.mtimeMs };
  };

  const usageOf = (all: Array<{ name: string; run: RunFile }>, run: RunFile, usage: Usage | undefined): Usage | undefined => {
    if (!usage || !spec.resumeCostCarried || !run.resumeFrom) return usage;
    const at = (r: RunFile) => (r.startedAt ? new Date(r.startedAt).getTime() : NaN);
    const parent = all.filter((o) => o.run.nativeId === run.resumeFrom && at(o.run) < at(run)).sort((a, b) => at(b.run) - at(a.run))[0];
    const carried = parent && outputOf(parent.name)?.read.usage;
    const { costUsd, apiMs, ...own } = usage;
    const less = (mine: number | undefined, theirs: number | undefined) =>
      mine !== undefined && theirs !== undefined && mine >= theirs ? { value: mine - theirs } : undefined;
    const cost = less(costUsd, carried?.costUsd);
    const api = less(apiMs, carried?.apiMs);
    const left: Usage = { ...own, ...(cost ? { costUsd: cost.value } : {}), ...(api ? { apiMs: api.value } : {}) };
    return Object.keys(left).length ? left : undefined;
  };

  const transcriptOf =
    (reader: NonNullable<HarnessSpec['transcript']>): NonNullable<RunnerOps['transcript']> =>
    (sessionId, after) =>
      Effect.tryPromise({
        try: async () => {
          const hit = find(sessionId);
          const nativeId = hit ? hit.run.nativeId : sessionId;
          return readTranscript(nativeId ? reader.file(nativeId) : undefined, after, reader.events);
        },
        catch: (cause) =>
          new RunnerError({ verb: 'transcript', message: `${spec.name}: ${cause instanceof Error ? cause.message : String(cause)}` }),
      });

  const sayTo =
    (input: NonNullable<HarnessSpec['input']>): NonNullable<RunnerOps['say']> =>
    (session, text) =>
      Effect.try({
        try: () => {
          const { name } = session;
          let run: RunFile | string | undefined;
          try {
            run = runFileIn(fs.readFileSync(runFile(name), 'utf8'));
          } catch {}
          if (typeof run === 'string')
            throw new Error(
              `\`${name}\` cannot be told anything: its run file, ${runFile(name)}, is unreadable — ${run}. Its worker writes that file; if it is being written, say it again in a moment. Nothing was said.`,
            );
          if (!run || run.name !== name) throw new Error(`no session \`${name}\` is running to hear anything: there is no run of it.`);
          if (!run.input)
            throw new Error(
              `\`${name}\` was started with no way in: its worker writes nothing on its input. Continue its session with a new task that carries the words (\`resumeFrom\`).`,
            );
          if (run.inputClosed)
            throw new Error(
              `\`${name}\` has given its result and reads no more words: its input is closed. Continue its session with a new task that carries the words (\`resumeFrom\`).`,
            );
          const state = leased(run, Date.now());
          if (state !== 'working') throw new Error(`\`${name}\` is \`${state}\`, not running: it takes no more words.`);
          const line = input.line(text);
          if (/[\r\n]/.test(line))
            throw new Error(`the words make a line with a line break in it, which the harness would read as two. Nothing was said.`);
          fs.appendFileSync(inboxFile(name), `${line}\n`);
        },
        catch: (cause) =>
          new RunnerError({ verb: 'say', message: `${spec.name}: ${cause instanceof Error ? cause.message : String(cause)}` }),
      });

  return {
    spawn: (asked) =>
      Effect.try({
        try: () => {
          const r = { ...asked, cwd: path.resolve(asked.cwd) };
          if (!isDirectory(r.cwd)) throw new Error(`cwd ${r.cwd} is not a directory`);
          fs.mkdirSync(dir, { recursive: true });
          try {
            fs.rmSync(closeoutFile(r.name));
          } catch {}
          fs.rmSync(logFile(r.name), { force: true });
          fs.rmSync(stopFile(r.name), { force: true });
          outputs.delete(r.name);
          let io: HarnessIO = {};
          if (r.closeoutSchema) {
            fs.writeFileSync(schemaFile(r.name), JSON.stringify(r.closeoutSchema));
            io = { closeoutSchemaFile: schemaFile(r.name), closeoutFile: closeoutFile(r.name) };
          }
          const mcpConfigFile = writeMcpConfig(mcpFile(r.name), r.config?.mcp);
          if (mcpConfigFile) io = { ...io, mcpConfigFile };
          io = { ...io, ...spec.prepare?.(r) };
          const { cmd, args } = spec.command(r, io);
          const input: RunInput | undefined = spec.input && {
            first: spec.input.line(r.brief),
            inbox: inboxFile(r.name),
            from: sizeOf(inboxFile(r.name)),
            closesOn: spec.input.closesOn,
          };
          const plan = {
            name: r.name,
            cmd,
            args,
            cwd: r.cwd,
            logFile: logFile(r.name),
            stopFile: stopFile(r.name),
            nativeIdPattern: spec.nativeIdPattern,
            ...(spec.resumeCostCarried && r.resumeFrom ? { resumeFrom: r.resumeFrom } : {}),
            ...(input ? { input } : {}),
          };
          fs.writeFileSync(runFile(r.name), JSON.stringify({ ...plan, state: 'working', pid: 0, heartbeatAt: new Date().toISOString() }));

          const child = spawn(process.execPath, [WORKER, runFile(r.name)], {
            detached: true,
            stdio: 'ignore',
            cwd: r.cwd,
          });
          child.on('error', () => {});
          child.unref();
          countSpawn();
        },
        catch: (cause) => new RunnerError({ verb: 'spawn', message: `${spec.name}: ${String(cause)}`, refused: true }),
      }),

    observe: Effect.sync(() => {
      const now = Date.now();
      const m = new Map<string, Sighting>();
      const all = readAll();
      for (const { name, run } of all) {
        const output = outputOf(name);
        const usage = usageOf(all, run, output?.read.usage);
        const printed = output?.read.closeout && { payload: output.read.closeout.payload, at: output.at };
        m.set(name, {
          sessionId: name,
          state: detachedStateOf(run, now),
          nativeId: run.nativeId,
          closeout: statementOf(name) ?? printed,
          ...(typeof run.exitCode === 'number' && run.exitCode >= 0 ? { exitCode: run.exitCode } : {}),
          ...(usage ? { usage } : {}),
          ...(output?.read.limit ? { limit: output.read.limit } : {}),
          ...(output?.read.denials?.length ? { denials: output.read.denials } : {}),
        });
      }
      return m;
    }),

    stop: (sessionId) =>
      Effect.try({
        try: () => {
          const hit = find(sessionId);
          if (!hit || hit.run.state !== 'working') return;
          fs.writeFileSync(stopFile(sessionId), '');
          const now = find(sessionId);
          if (now && now.run.state === 'working' && now.run.pid > 0) {
            try {
              process.kill(now.run.pid, 'SIGTERM');
            } catch {}
          }
        },
        catch: (cause) => new RunnerError({ verb: 'stop', message: String(cause) }),
      }),

    logs: (sessionId) =>
      Effect.try({
        try: () => {
          const f = logFile(sessionId);
          return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').slice(-8000) : '(no output yet)';
        },
        catch: (cause) => new RunnerError({ verb: 'logs', message: String(cause) }),
      }),

    ...(spec.transcript ? { transcript: transcriptOf(spec.transcript) } : {}),
    ...(spec.input ? { say: sayTo(spec.input) } : {}),
  };
};
