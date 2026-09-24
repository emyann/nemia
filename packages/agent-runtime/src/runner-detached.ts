/**
 * A runner for any harness that runs a prompt to completion and exits.
 *
 * `Runner.claude()` leans on `claude agents --json` — a registry somebody else maintains. Most
 * harnesses have no such thing: Codex has `codex exec`, which runs in the foreground and exits.
 * So for those we detach a worker per session and maintain the registry ourselves, as a directory
 * of run files (`src/../bin/ae-worker.ts` writes them).
 *
 * **What this costs, stated plainly**: a heartbeat. A worker that is killed leaves a run file that
 * says `working` forever, and nothing on disk distinguishes that from a session thinking hard. So
 * the worker beats every 5s and `observe` calls a stale beat dead. That is a lease, in the only
 * form a lease has ever taken. It is the price of not having somebody else's registry to read,
 * and therefore the price of running more than one harness.
 *
 * What it buys: this file has no idea what a harness is. It needs a command, a working directory
 * and an exit code — so a new harness is a `HarnessSpec` value, not new code. The two shipped are
 * `codex` (`runner-codex.ts`) and `claudeDetached` (`runner-claude-detached.ts`).
 */
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Denial, Observed, Sighting, Usage } from './domain.ts';
import { RunnerError, type RunnerOps, type SpawnRequest, type TranscriptEvent } from './runner.ts';
import { writeMcpConfig } from './runner-mcp.ts';
import { readTranscript } from './runner-transcript.ts';

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
   * id — needed only to resume later. Optional: the name is the key, this is just a handle.
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
   * The pool this harness's sessions are counted in under the concurrency ceiling: what one rate limit covers, a
   * subscription. Harnesses that name the same pool share one ceiling. Absent: the name the harness is configured
   * under, a pool of its own.
   */
  pool?: string;
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
   * The harness prints a resumed session's cost and API time as totals that carry its parent's on, not as its own:
   * `claude -p --resume` since 2.1.278 (open issue 4). Set, the run file keeps the id it resumed, and `observe` takes the
   * parent's printed totals off — the latest run started before it under that id, as its own output read them. Where
   * there is no such run, or it printed no total, the attempt carries no cost rather than its parent's too.
   */
  resumeCostCarried?: true;
};

/**
 * Where a harness that can take a structured final answer should put it.
 *
 * Chosen by the runner, per run, OUTSIDE the workspace. That is the lesson of the file this
 * replaces: anything written inside a step's worktree travels down its git branch, and the next
 * step was cut a directory that already said it was finished.
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
  /** The harness says it ended the session because it spent its budget. */
  budgetSpent?: true;
  /** The tool calls the harness denied the session, in the order it first did. Absent when none, or when it does not say. */
  denials?: Denial[];
};

/** How long a run file may go unbeaten before `observe` calls it dead. Worker beats every 5s. */
export const STALE_MS = 30_000;

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'ae-worker.ts');
const safe = (name: string) => name.replace(/[^a-zA-Z0-9]+/g, '_');
const isDirectory = (p: string) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const sizeOf = (p: string) => { try { return fs.statSync(p).size; } catch { return 0; } };

/**
 * What the worker writes about one session, and the whole of what a detached harness knows of it.
 *
 * `state` is one of `working | stopped | done | failed` — the four `ae-worker.ts` ever writes. **Never `blocked`**:
 * these harnesses run a process and watch it exit, and a process that is waiting on somebody is, from out here,
 * a process that is running. So no detached session reaches the engine's `needs-human`, and none carries a
 * `Sighting.waitingFor`: there is nothing to carry, not something dropped. Only a harness with a registry that
 * says a session is waiting, and says what for — Claude Code's `claude agents --json` — can fill that field.
 *
 * The file is the session: `stop` finds the worker by it. Removed, alone or with the store it is in, the worker takes it
 * for a stop, ends its harness and exits, and never writes the file again (open issue 30).
 */
type RunFile = {
  name?: string; state: Observed; pid: number; heartbeatAt: string; startedAt?: string;
  nativeId?: string; logFile: string; exitCode?: number;
  /** The harness's own id this run resumed, kept only for a spec whose printed totals carry the parent's. */
  resumeFrom?: string;
  /** For a spec with `input`: what the worker writes on the harness's stdin (`RunInput`). Absent, the run takes no words. */
  input?: RunInput;
  /**
   * How far into the inbox the worker has written on, in bytes: every line before it was handed to the harness, or was
   * about to be — the worker writes this before it writes the line, so a worker started again on this run file never
   * writes one twice. Absent, nothing has been, and the worker starts at `input.from`.
   */
  inputAt?: number;
  /** The harness printed the line that closes its input, and the worker ended its stdin: words said now reach nobody. */
  inputClosed?: true;
};

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
export const detachedFind = (spec: HarnessSpec, root: string) => (name: string): Effect.Effect<{ sessionId: string } | undefined> =>
  Effect.sync(() => {
    try {
      const run = JSON.parse(fs.readFileSync(runFileOf(spec, root, name), 'utf8')) as RunFile;
      return run.name === name ? { sessionId: name } : undefined;
    } catch { return undefined; }
  });

export const detachedOps = (spec: HarnessSpec, root: string): RunnerOps => {
  const dir = path.join(root, 'runs', spec.name);
  const runFile = (name: string) => runFileOf(spec, root, name);
  const logFile = (name: string) => path.join(dir, `${safe(name)}.log`);
  const closeoutFile = (name: string) => path.join(dir, `${safe(name)}.closeout.json`);
  const schemaFile = (name: string) => path.join(dir, `${safe(name)}.schema.json`);
  const mcpFile = (name: string) => path.join(dir, `${safe(name)}.mcp.json`);
  // `.jsonl`, so `readAll` never takes it for a run file.
  const inboxFile = (name: string) => path.join(dir, `${safe(name)}.inbox.jsonl`);

  const readAll = (): Array<{ name: string; run: RunFile }> => {
    if (!fs.existsSync(dir)) return [];
    const out: Array<{ name: string; run: RunFile }> = [];
    for (const f of fs.readdirSync(dir)) {
      // Run files only. A closeout, a schema or an MCP config is also JSON, and a payload that
      // happened to carry a `name` would otherwise be read as a session.
      if (!f.endsWith('.json') || f.endsWith('.closeout.json') || f.endsWith('.schema.json') || f.endsWith('.mcp.json')) continue;
      try {
        const run = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as RunFile;
        if (run.name) out.push({ name: run.name, run });
      } catch { /* a half-written file: the next pass will read it */ }
    }
    return out;
  };

  /** A `working` run whose heartbeat has stopped is not working. This is the whole lease. */
  const observedState = (run: RunFile, now: number): Observed =>
    run.state === 'working' && now - new Date(run.heartbeatAt).getTime() > STALE_MS ? 'failed' : run.state;

  const find = (sessionId: string) => readAll().find(({ name }) => name === sessionId);

  /**
   * The harness's final answer, if it wrote one, with the moment the file was written.
   *
   * The file's clock is not this process's clock, but the distance that matters is minutes: it is
   * written when the harness exits, long after the attempt was journalled. Unparseable text is
   * carried as text — what counts as a valid closeout is the reader's business, not the runner's.
   */
  const statementOf = (name: string): Sighting['closeout'] => {
    const f = closeoutFile(name);
    let text: string;
    let at: number;
    try { text = fs.readFileSync(f, 'utf8'); at = fs.statSync(f).mtimeMs; } catch { return undefined; }
    let payload: unknown = text;
    try { payload = JSON.parse(text); } catch { /* carried as text */ }
    return { payload, at };
  };

  /**
   * What the spec reads in the harness's output, with when that output was last written — the time a
   * statement found there is reported with, as a closeout file's is its own mtime. Read again only
   * when the capture has changed, so a finished run's output is read once per process.
   */
  const outputs = new Map<string, { size: number; mtimeMs: number; read: HarnessOutput }>();
  const outputOf = (name: string): { read: HarnessOutput; at: number } | undefined => {
    if (!spec.readOutput) return undefined;
    let size: number;
    let mtimeMs: number;
    try { ({ size, mtimeMs } = fs.statSync(logFile(name))); } catch { return undefined; }
    let known = outputs.get(name);
    if (!known || known.size !== size || known.mtimeMs !== mtimeMs) {
      let text: string;
      try { text = fs.readFileSync(logFile(name), 'utf8'); } catch { return undefined; }
      known = { size, mtimeMs, read: spec.readOutput(text) };
      outputs.set(name, known);
    }
    return { read: known.read, at: known.mtimeMs };
  };

  /**
   * The conversation, from the harness's own record, found by the harness's own id: the run's `nativeId`,
   * which the worker reads off what the harness prints — so until it has printed one, there is nothing to
   * read. A name with no run file is taken for that id itself: the id an attempt's end was recorded with,
   * which is what the engine asks by once the run file is gone.
   */
  /**
   * What a run's output says it used, as the attempt's own. A resumed run of a spec whose totals carry the parent's
   * has the parent's taken off: the parent is the run under the id it resumed that started last before it — a resume
   * keeps its parent's id, so a later run under that id is a child, never the parent. No parent, a parent that
   * printed no total, or a total that would go below nothing: that measure is dropped, never overcounted.
   */
  const usageOf = (all: Array<{ name: string; run: RunFile }>, run: RunFile, usage: Usage | undefined): Usage | undefined => {
    if (!usage || !spec.resumeCostCarried || !run.resumeFrom) return usage;
    const at = (r: RunFile) => (r.startedAt ? new Date(r.startedAt).getTime() : NaN);
    const parent = all
      .filter((o) => o.run.nativeId === run.resumeFrom && at(o.run) < at(run))
      .sort((a, b) => at(b.run) - at(a.run))[0];
    const carried = parent && outputOf(parent.name)?.read.usage;
    const { costUsd, apiMs, ...own } = usage;
    const less = (mine: number | undefined, theirs: number | undefined) =>
      mine !== undefined && theirs !== undefined && mine >= theirs ? { value: mine - theirs } : undefined;
    const cost = less(costUsd, carried?.costUsd);
    const api = less(apiMs, carried?.apiMs);
    const left: Usage = { ...own, ...(cost ? { costUsd: cost.value } : {}), ...(api ? { apiMs: api.value } : {}) };
    return Object.keys(left).length ? left : undefined;
  };

  const transcriptOf = (reader: NonNullable<HarnessSpec['transcript']>): NonNullable<RunnerOps['transcript']> =>
    (sessionId, after) => Effect.tryPromise({
      try: async () => {
        const hit = find(sessionId);
        const nativeId = hit ? hit.run.nativeId : sessionId;
        return readTranscript(nativeId ? reader.file(nativeId) : undefined, after, reader.events);
      },
      catch: (cause) => new RunnerError({ verb: 'transcript', message: `${spec.name}: ${cause instanceof Error ? cause.message : String(cause)}` }),
    });

  /**
   * Words for a running session, appended to its inbox as the line its harness reads, for its worker to write on. Its own
   * run file alone is read, as `find` reads it. Appended is not read: the worker writes a line on within a second, and one
   * appended in the second before the harness's closing line is never written on (open issue 29). Refused, with nothing
   * appended, where no worker would write the words on: no run under the name; a run its worker started with no input (one
   * started before jobs took words); a run whose harness has printed its closing line; and one that is not working.
   */
  const sayTo = (input: NonNullable<HarnessSpec['input']>): NonNullable<RunnerOps['say']> => (session, text) =>
    Effect.try({
      try: () => {
        const { name } = session;
        let run: RunFile | undefined;
        try { run = JSON.parse(fs.readFileSync(runFile(name), 'utf8')) as RunFile; } catch { /* none, or mid-write: refused below */ }
        if (!run || run.name !== name) throw new Error(`no session \`${name}\` is running to hear anything: there is no run of it.`);
        if (!run.input) throw new Error(`\`${name}\` was started with no way in: its worker writes nothing on its input. Continue its session with a new task that carries the words (\`resumeFrom\`).`);
        if (run.inputClosed) throw new Error(`\`${name}\` has given its result and reads no more words: its input is closed. Continue its session with a new task that carries the words (\`resumeFrom\`).`);
        const state = observedState(run, Date.now());
        if (state !== 'working') throw new Error(`\`${name}\` is \`${state}\`, not running: it takes no more words.`);
        const line = input.line(text);
        // A line with a newline in it would reach the harness as two, or as half a message.
        if (/[\r\n]/.test(line)) throw new Error(`the words make a line with a line break in it, which the harness would read as two. Nothing was said.`);
        fs.appendFileSync(inboxFile(name), `${line}\n`);
      },
      catch: (cause) => new RunnerError({ verb: 'say', message: `${spec.name}: ${cause instanceof Error ? cause.message : String(cause)}` }),
    });

  return {
    spawn: (asked) =>
      Effect.try({
        try: () => {
          // Resolved here, from the process that launches, as `claude --bg`'s cwd is. Relative, the
          // worker started in it and then launched the harness in the same path again, from inside
          // it: `spawn sh ENOENT` for `cwd: 'repo'`. `file` refuses one at both doors; this is a journal written
          // before it did, or by hand, and a caller of the runner itself.
          const r = { ...asked, cwd: path.resolve(asked.cwd) };
          // Checked here because `spawn` does not throw for it: the child emits the error later, and
          // unheard, that event kills the process that launched the worker — the engine.
          if (!isDirectory(r.cwd)) throw new Error(`cwd ${r.cwd} is not a directory`);
          fs.mkdirSync(dir, { recursive: true });
          // A re-spawn of the same attempt must not find the previous one's answer waiting for it.
          try { fs.rmSync(closeoutFile(r.name)); } catch { /* nothing to clear */ }
          // Nor in its output, which a spec that reads one would take the previous answer from.
          fs.rmSync(logFile(r.name), { force: true });
          outputs.delete(r.name);
          let io: HarnessIO = {};
          if (r.closeoutSchema) {
            fs.writeFileSync(schemaFile(r.name), JSON.stringify(r.closeoutSchema));
            io = { closeoutSchemaFile: schemaFile(r.name), closeoutFile: closeoutFile(r.name) };
          }
          // Written, or cleared, on every spawn: a re-spawn is given the servers its task names, no more.
          const mcpConfigFile = writeMcpConfig(mcpFile(r.name), r.config?.mcp);
          if (mcpConfigFile) io = { ...io, mcpConfigFile };
          io = { ...io, ...spec.prepare?.(r) };
          const { cmd, args } = spec.command(r, io);
          // The inbox is never written or cleared here: it is the person's, and a run spawned again under the name starts
          // past what was said to the one before it.
          const input: RunInput | undefined = spec.input && {
            first: spec.input.line(r.brief), inbox: inboxFile(r.name), from: sizeOf(inboxFile(r.name)), closesOn: spec.input.closesOn,
          };
          const plan = {
            name: r.name, cmd, args, cwd: r.cwd, logFile: logFile(r.name),
            nativeIdPattern: spec.nativeIdPattern,
            ...(spec.resumeCostCarried && r.resumeFrom ? { resumeFrom: r.resumeFrom } : {}),
            ...(input ? { input } : {}),
          };
          // Written before the spawn, with no pid: the run is intended, and a crash here leaves
          // a file that says so. The worker overwrites it with its own pid the moment it starts.
          fs.writeFileSync(runFile(r.name), JSON.stringify({ ...plan, state: 'working', pid: 0, heartbeatAt: new Date().toISOString() }));

          // Detached, stdio ignored, unref'd: the worker outlives this process by design.
          const child = spawn(process.execPath, [WORKER, runFile(r.name)], {
            detached: true, stdio: 'ignore', cwd: r.cwd,
          });
          // Heard, so a launch that fails after `spawn` returns never takes the engine down with it;
          // the run file it leaves says working with no pid, and the lease calls that dead.
          child.on('error', () => {});
          child.unref();
        },
        // Everything in `try` runs before the worker is launched, or is the launch: whatever threw,
        // no session is running under the name.
        catch: (cause) => new RunnerError({ verb: 'spawn', message: `${spec.name}: ${String(cause)}`, refused: true }),
      }),

    // The registry is ours: a directory, read fresh every pass. Same shape as `claude agents`.
    observe: Effect.sync(() => {
      const now = Date.now();
      const m = new Map<string, Sighting>();
      // sessionId is the NAME here: our handle. `nativeId` is the harness's own, scraped from its
      // output by the worker — present only once the harness has printed it, which is why resume
      // is best-effort for this kind of harness and exact for one with a registry.
      const all = readAll();
      for (const { name, run } of all) {
        // The file the harness wrote its answer to, when it wrote one; otherwise what its output says.
        const output = outputOf(name);
        const usage = usageOf(all, run, output?.read.usage);
        const printed = output?.read.closeout && { payload: output.read.closeout.payload, at: output.at };
        m.set(name, {
          sessionId: name, state: observedState(run, now), nativeId: run.nativeId, closeout: statementOf(name) ?? printed,
          // The process's own exit code, once it has one. The worker writes -1 when there is none —
          // killed by a signal, or never started — and that is reported as no code, not as a code.
          ...(typeof run.exitCode === 'number' && run.exitCode >= 0 ? { exitCode: run.exitCode } : {}),
          ...(usage ? { usage } : {}),
          ...(output?.read.budgetSpent ? { budgetSpent: true as const } : {}),
          ...(output?.read.denials?.length ? { denials: output.read.denials } : {}),
        });
      }
      return m;
    }),

    stop: (sessionId) =>
      Effect.try({
        try: () => {
          const hit = find(sessionId);
          // `pid > 0` is load-bearing: the run file exists before the worker has written its own
          // pid, and `process.kill(0, ...)` signals OUR ENTIRE PROCESS GROUP. A stop issued in
          // that window simply does nothing, and the next pass issues it again — which is what
          // level-triggering is for. Never a special case, never a wait.
          if (hit && hit.run.pid > 0) {
            // SIGTERM the worker, which kills the harness's process group and writes `stopped`.
            // Not our business to write that state: the worker is the one that saw it happen. It hears
            // SIGTERM from the moment its pid is on disk, so a stop that lands any time after is heard.
            try { process.kill(hit.run.pid, 'SIGTERM'); } catch { /* already gone */ }
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
