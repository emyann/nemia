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
 * and an exit code — so a new harness is a `HarnessSpec` value, not new code.
 */
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Observed, Sighting, Usage } from './domain.ts';
import {
  CLAUDE_CONTEXT_TOKENS, CLAUDE_POOL, checkoutMcpConfig, claudeMcpArgs, claudeRefuses, claudeTranscriptEvents, claudeTranscriptFile, isoTime, readTranscript, RunnerError,
  worktreeName, writeMcpConfig, type McpServer, type RunnerOps, type SpawnRequest, type TranscriptEvent,
} from './runner.ts';

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
   * do instead. This runner has no `say` — a harness that runs a prompt and exits takes nothing in the
   * meantime — so `say` refuses every task of a spec with this sentence, and a spec without one with the
   * engine's.
   */
  noChannel?: string;
  /**
   * The context windows this harness can be given, in tokens, both ends included: a task's `contextTokens` is handed to
   * `command`, and `file()` refuses one outside the range. Absent: the harness has no such knob, and `file()` refuses a
   * task that sets one rather than let it run on a window it did not ask for.
   */
  contextTokens?: { least: number; most: number };
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
};

/** How long a run file may go unbeaten before `observe` calls it dead. Worker beats every 5s. */
export const STALE_MS = 30_000;

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'ae-worker.ts');
const safe = (name: string) => name.replace(/[^a-zA-Z0-9]+/g, '_');
const isDirectory = (p: string) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

type RunFile = {
  name?: string; state: Observed; pid: number; heartbeatAt: string;
  nativeId?: string; logFile: string; exitCode?: number;
};

export const detachedOps = (spec: HarnessSpec, root: string): RunnerOps => {
  const dir = path.join(root, 'runs', spec.name);
  const runFile = (name: string) => path.join(dir, `${safe(name)}.json`);
  const logFile = (name: string) => path.join(dir, `${safe(name)}.log`);
  const closeoutFile = (name: string) => path.join(dir, `${safe(name)}.closeout.json`);
  const schemaFile = (name: string) => path.join(dir, `${safe(name)}.schema.json`);
  const mcpFile = (name: string) => path.join(dir, `${safe(name)}.mcp.json`);

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
  const transcriptOf = (reader: NonNullable<HarnessSpec['transcript']>): NonNullable<RunnerOps['transcript']> =>
    (sessionId, after) => Effect.tryPromise({
      try: async () => {
        const hit = find(sessionId);
        const nativeId = hit ? hit.run.nativeId : sessionId;
        return readTranscript(nativeId ? reader.file(nativeId) : undefined, after, reader.events);
      },
      catch: (cause) => new RunnerError({ verb: 'transcript', message: `${spec.name}: ${cause instanceof Error ? cause.message : String(cause)}` }),
    });

  return {
    spawn: (asked) =>
      Effect.try({
        try: () => {
          // Resolved here, from the process that launches, as `claude --bg`'s cwd is. Relative, the
          // worker started in it and then launched the harness in the same path again, from inside
          // it: `spawn sh ENOENT` for `cwd: 'repo'`. `file()` refuses one; this is the Effect door.
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
          const mcpConfigFile = writeMcpConfig(mcpFile(r.name), r.mcp);
          if (mcpConfigFile) io = { ...io, mcpConfigFile };
          io = { ...io, ...spec.prepare?.(r) };
          const { cmd, args } = spec.command(r, io);
          const plan = {
            name: r.name, cmd, args, cwd: r.cwd, logFile: logFile(r.name),
            nativeIdPattern: spec.nativeIdPattern,
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
      // sessionId is the NAME here: our handle, since this harness's own id may never appear.
      // sessionId is the NAME here: our handle. `nativeId` is the harness's own, scraped from its
      // output by the worker — present only once the harness has printed it, which is why resume
      // is best-effort for this kind of harness and exact for one with a registry.
      for (const { name, run } of readAll()) {
        // The file the harness wrote its answer to, when it wrote one; otherwise what its output says.
        const output = outputOf(name);
        const printed = output?.read.closeout && { payload: output.read.closeout.payload, at: output.at };
        m.set(name, {
          sessionId: name, state: observedState(run, now), nativeId: run.nativeId, closeout: statementOf(name) ?? printed,
          // The process's own exit code, once it has one. The worker writes -1 when there is none —
          // killed by a signal, or never started — and that is reported as no code, not as a code.
          ...(typeof run.exitCode === 'number' && run.exitCode >= 0 ? { exitCode: run.exitCode } : {}),
          ...(output?.read.usage ? { usage: output.read.usage } : {}),
          ...(output?.read.budgetSpent ? { budgetSpent: true as const } : {}),
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
            // Not our business to write that state: the worker is the one that saw it happen.
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
  };
};

// ─── the harnesses ──────────────────────────────────────────────────────────

/**
 * The project paths a Codex config trusts.
 *
 * Reads only `[projects."<path>"]` tables holding `trust_level = "trusted"` — the shape Codex writes
 * itself — not TOML in general. A config it cannot read trusts nothing.
 */
export const trustedProjects = (toml: string): Set<string> => {
  const trusted = new Set<string>();
  let current: string | undefined;
  for (const raw of toml.split('\n')) {
    const line = raw.trim();
    const table = /^\[projects\."((?:[^"\\]|\\.)*)"\]$/.exec(line);
    if (table) { current = table[1]; continue; }
    if (line.startsWith('[')) { current = undefined; continue; }
    if (current !== undefined && /^trust_level\s*=\s*"trusted"$/.test(line)) trusted.add(current);
  }
  return trusted;
};

/**
 * The MCP server names a Codex config gives, as `codex mcp add` writes them: `[mcp_servers.<name>]`
 * tables and the tables under them. Not TOML in general — an inline `mcp_servers = {…}` is not read —
 * so a name it misses meets Codex's own merge, which is where a task stood before this was read.
 */
export const codexMcpServerNames = (toml: string): Set<string> => {
  const names = new Set<string>();
  for (const raw of toml.split('\n')) {
    const table = /^\[mcp_servers\.(?:"((?:[^"\\]|\\.)*)"|([\w-]+))(?:\.[^\]]*)?\]$/.exec(raw.trim());
    if (table) names.add(table[1] ?? table[2]!);
  }
  return names;
};

/** The repository a directory's commits land in: the parent of its git common dir. */
const repositoryOf = (cwd: string): string | undefined => {
  try {
    const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return path.dirname(path.resolve(cwd, common));
  } catch { return undefined; }
};

/**
 * Codex's sandboxes, which a task names as its `permissionMode`. `bypassPermissions`, Claude's
 * word, is also taken, as the widest, because the spec has always emitted it that way.
 */
export const CODEX_SANDBOXES: readonly string[] = ['read-only', 'workspace-write', 'danger-full-access'];

/** The tools that change files. Codex has no tool list — one shell, three sandboxes — so these decide. */
const WRITES: readonly string[] = ['Bash', 'Write', 'Edit'];

/**
 * The sandbox a task runs in: the one it named, `workspace-write` when it named none — and
 * `read-only` whenever its `tools` has none of Bash, Write or Edit, whatever it named, because the
 * narrower of two fences is the one that was asked for. A list that has one of them does not
 * narrow Codex at all: Codex cannot take its shell away and leave its edits.
 *
 * A word that is not a sandbox never arrives through `file()`, which refuses it; a direct caller
 * gets the default.
 */
const sandboxOf = (r: SpawnRequest): string => {
  if (r.tools && !r.tools.some((t) => WRITES.includes(t))) return 'read-only';
  const asked = r.permissionMode === 'bypassPermissions' ? 'danger-full-access' : r.permissionMode;
  return asked !== undefined && CODEX_SANDBOXES.includes(asked) ? asked : 'workspace-write';
};

/**
 * The reasoning efforts the Codex API names (codex-cli 0.154.0, its default model). Codex checks
 * none itself: a bad one is sent, refused by the API, and the session exits 1 — so `file()` refuses
 * it first.
 */
export const CODEX_EFFORTS: readonly string[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

/** A TOML basic string. JSON's escapes are TOML's; TOML also wants DEL escaped. */
const tomlString = (s: string) => JSON.stringify(s).replace(/\x7f/g, '\\u007f');
const tomlTable = (entries: ReadonlyArray<readonly [string, string | undefined]>) =>
  `{${entries.flatMap(([k, v]) => (v === undefined ? [] : [`${tomlString(k)}=${v}`])).join(',')}}`;
const tomlStrings = (m: Record<string, string> | undefined) =>
  m === undefined ? undefined : tomlTable(Object.entries(m).map(([k, v]) => [k, tomlString(v)] as const));

/**
 * A task's `mcp` as Codex's `mcp_servers` table, inline: `command`, `args`, `env`, or `url` with its
 * headers as `http_headers`. One value with every name quoted, because a dotted `-c` key is split on
 * every dot, quotes or none ("invalid transport in `mcp_servers."a`", 0.154.0).
 */
export const codexMcpServers = (mcp: Record<string, McpServer>): string =>
  tomlTable(Object.entries(mcp).map(([name, s]) => [name, 'command' in s
    ? tomlTable([['command', tomlString(s.command)], ['args', s.args && `[${s.args.map((a) => tomlString(a)).join(',')}]`], ['env', tomlStrings(s.env)]])
    : tomlTable([['url', tomlString(s.url)], ['http_headers', tomlStrings(s.headers)]])] as const));

/**
 * The item types a Codex `exec --json` stream was seen to carry (0.154.0, seventeen runs): two that
 * are tool calls and one that is said. Any other type cannot be counted either way, so a stream that
 * has one reports no count of tool calls rather than a guessed one.
 */
const CODEX_CALL_ITEMS: readonly string[] = ['command_execution', 'file_change'];
const CODEX_SAID_ITEMS: readonly string[] = ['agent_message'];

/**
 * What a Codex session consumed, read from its `exec --json` stream — measured or absent, never zeros.
 *
 * Tokens come from `turn.completed`, one per prompt run to completion, and only when every turn that
 * started completed with them: a session killed mid-turn has not reported its last one. Nothing is
 * added to `input_tokens` or `output_tokens`: in every run seen, `cached_input_tokens` was below the
 * first and `reasoning_output_tokens` below the second, so each is a part of its total, not beside it.
 * `cache_write_input_tokens` was 0 in every one, so whether `input_tokens` counts it is unknown, and a
 * stream where it is not 0 gives no input count. Tool calls are the call items, counted once by id.
 * No `turns` — it counts model responses, which the stream does not report — and no cost.
 */
export const codexOutput = (output: string): HarnessOutput => {
  let started = 0;
  const completed: Array<{ input?: number; output: number } | null> = [];
  const calls = new Set<string>();
  let uncounted = false;
  for (const line of output.split('\n')) {
    if (!line.includes('"type"')) continue;
    let event: { type?: unknown; usage?: Record<string, unknown>; item?: { id?: unknown; type?: unknown } };
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type === 'turn.started') started++;
    else if (event.type === 'turn.completed') {
      const count = (key: string) => (typeof event.usage?.[key] === 'number' ? (event.usage[key] as number) : undefined);
      const input = count('input_tokens');
      const out = count('output_tokens');
      completed.push(input === undefined || out === undefined ? null : { input: count('cache_write_input_tokens') ? undefined : input, output: out });
    } else if (event.type === 'item.started' || event.type === 'item.completed') {
      const { id, type } = event.item ?? {};
      if (typeof id !== 'string' || typeof type !== 'string') continue;
      if (CODEX_CALL_ITEMS.includes(type)) calls.add(id);
      else if (!CODEX_SAID_ITEMS.includes(type)) uncounted = true;
    }
  }
  if (started === 0 && completed.length === 0) return {};
  const turns = completed.length === started && completed.every((c) => c !== null)
    ? (completed as Array<{ input?: number; output: number }>) : undefined;
  const usage: Usage = {
    ...(uncounted ? {} : { toolCalls: calls.size }),
    ...(turns?.every((t) => t.input !== undefined) ? { inputTokens: turns.reduce((n, t) => n + t.input!, 0) } : {}),
    ...(turns ? { outputTokens: turns.reduce((n, t) => n + t.output, 0) } : {}),
  };
  return Object.keys(usage).length ? { usage } : {};
};

/**
 * A Codex thread's rollout, where Codex keeps its own record of the conversation:
 * `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-<local time>-<thread id>.jsonl` (0.154.0). Found by the thread
 * id — the `thread_id` of `exec --json`'s first event, which the worker keeps as the run's `nativeId` —
 * newest day first, and remembered once found.
 */
const rollouts = new Map<string, string>();
export const codexRolloutFile = (threadId: string): string | undefined => {
  // An id, not a path: nothing but what a thread id is made of goes into a file name.
  if (!/^[0-9a-f-]+$/.test(threadId)) return undefined;
  const known = rollouts.get(threadId);
  if (known && fs.existsSync(known)) return known;
  const sessions = path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'sessions');
  const newestFirst = (...dir: string[]) => { try { return fs.readdirSync(path.join(sessions, ...dir)).sort().reverse(); } catch { return []; } };
  for (const y of newestFirst()) for (const m of newestFirst(y)) for (const d of newestFirst(y, m)) {
    const name = newestFirst(y, m, d).find((f) => f.startsWith('rollout-') && f.endsWith(`-${threadId}.jsonl`));
    if (name) {
      const file = path.join(sessions, y, m, d, name);
      rollouts.set(threadId, file);
      return file;
    }
  }
  return undefined;
};

/** The text of a list of content blocks, as far as each has any. */
const textsOf = (blocks: unknown): string[] =>
  Array.isArray(blocks)
    ? blocks.map((b) => (typeof b === 'string' ? b : (b as { text?: unknown } | null)?.text)).filter((t): t is string => typeof t === 'string')
    : [];

/**
 * One record of a Codex rollout as events.
 *
 * A rollout says most things twice: once as the model was given them (`response_item`) and once as the
 * thread items Codex itself shows (`event_msg` / `item_completed`). The items are read, because they are
 * what a person would be shown (measured on the 34 rollouts on this machine, codex-cli 0.154.0):
 *
 * - `UserMessage` is the prompt alone. As the model is given it, it comes among instructions and context
 *   Codex injects — developer messages, plugin lists — which are no more the conversation than Claude
 *   Code's system prompt, which its transcript does not hold either.
 * - `CommandExecution` is the command that ran, with its exit code and status. The model's own call is an
 *   `exec` tool whose input is a script that runs commands, and its output says "Script completed" when a
 *   command in it exited 2 — so it could not say whether a result was an error.
 * - `FileChange` is the files a patch changed, with its status.
 *
 * What the records do not allow, and so is not given: the text of any thinking (reasoning is written
 * encrypted, and every summary was empty), and when a command or a change began — an item is written once
 * it has completed, so its call and its result carry that one time, and one still running is not there.
 * `task_complete` is a system event, its error's message when it has one. An item of a type not measured
 * is a system event naming it, rather than nothing. A record with no time gives nothing; none was seen.
 */
export const codexRolloutEvents = (entry: unknown, offset: number): TranscriptEvent[] => {
  const record = entry as { timestamp?: unknown; type?: unknown; payload?: { type?: unknown; item?: unknown; turn_id?: unknown; error?: unknown } | null } | null;
  const at = isoTime(record?.timestamp);
  const payload = record?.payload;
  if (!at || record?.type !== 'event_msg' || !payload) return [];
  if (payload.type === 'task_complete') {
    const error = (payload.error as { message?: unknown } | null | undefined)?.message;
    return [{
      id: typeof payload.turn_id === 'string' ? `${payload.turn_id}:complete` : `@${offset}`, at, role: 'system', kind: 'system',
      text: typeof error === 'string' ? error : 'task_complete',
    }];
  }
  const item = payload.type === 'item_completed' ? payload.item as Record<string, unknown> | null | undefined : undefined;
  if (!item) return [];
  const id = typeof item.id === 'string' && item.id ? item.id : `@${offset}`;
  switch (item.type) {
    case 'UserMessage':
      return [{ id, at, role: 'user', kind: 'text', text: textsOf(item.content).join('\n') }];
    case 'AgentMessage':
      return [{ id, at, role: 'assistant', kind: 'text', text: textsOf(item.content).join('\n') }];
    case 'Reasoning': {
      const text = [...textsOf(item.summary_text), ...textsOf(item.raw_content)].join('\n');
      return [{ id, at, role: 'assistant', kind: 'thinking', ...(text ? { text } : {}) }];
    }
    case 'CommandExecution':
      return [
        { id, at, role: 'assistant', kind: 'tool_use', tool: { name: 'CommandExecution', input: { command: item.command, cwd: item.cwd } } },
        {
          id, at, role: 'user', kind: 'tool_result',
          result: { text: typeof item.aggregated_output === 'string' ? item.aggregated_output : '', isError: !(item.status === 'completed' && item.exit_code === 0) },
        },
      ];
    case 'FileChange':
      return [
        { id, at, role: 'assistant', kind: 'tool_use', tool: { name: 'FileChange', input: { changes: item.changes } } },
        {
          id, at, role: 'user', kind: 'tool_result',
          result: { text: [item.stdout, item.stderr].filter((s): s is string => typeof s === 'string' && s !== '').join('\n'), isError: item.status !== 'completed' },
        },
      ];
    default:
      return [{ id, at, role: 'system', kind: 'system', text: `[${String(item.type)}]` }];
  }
};

/**
 * Codex, through `codex exec`. Verified against codex-cli 0.154.0:
 *   --json                  JSONL events on stdout
 *   -C <dir>                working root
 *   -s <mode>               sandbox: read-only | workspace-write | danger-full-access
 *   --skip-git-repo-check   allow running outside a git repository
 *   exec resume <id>        continue a previous session
 *   -c key="value"          a config override: `model_reasoning_effort`, project trust, `mcp_servers`
 */
export const codex: HarnessSpec = {
  name: 'codex',
  command: (r, io) => ({
    cmd: 'codex',
    args: [
      'exec',
      '--json',
      '--skip-git-repo-check',
      '-C', r.cwd,
      // The sandbox the task named, as itself. `read-only` used to fall through to `workspace-write`,
      // so a task that asked for a reviewer that cannot write got one that could.
      '-s', sandboxOf(r),
      ...(r.model ? ['-m', r.model] : []),
      // Codex's worktree flag takes NO value, so it is safe immediately before the prompt —
      // unlike Claude's. The spec is where that difference lives, so the engine never learns
      // that harnesses disagree about anything.
      ...(r.worktree ? ['--worktree'] : []),
      // The closing statement, when the task asked for one. `--output-schema` makes the final
      // message conform; `-o` writes it where the runner chose, outside the workspace, so it
      // cannot travel into the next step's branch. Verified against 0.154.0, strict schema.
      ...(io?.closeoutFile ? ['--output-schema', io.closeoutSchemaFile!, '-o', io.closeoutFile] : []),
      // Effort is a config override: `codex exec` has no flag for it.
      ...(r.effort ? ['-c', `model_reasoning_effort="${r.effort}"`] : []),
      // MCP servers, as one override of the whole table. Merged into the operator's own
      // `mcp_servers`, never put in their place — `-c mcp_servers={}` leaves every one of them
      // loaded (0.154.0) — so unlike Claude Code, a Codex task still has the operator's servers.
      ...(r.mcp && Object.keys(r.mcp).length ? ['-c', `mcp_servers=${codexMcpServers(r.mcp)}`] : []),
      // Trust, as found by `prepare`: what lets a repository's own `.codex/rules` load in a worktree.
      ...(io?.trustedDirs ?? []).flatMap((dir) => ['-c', `projects."${dir}".trust_level="trusted"`]),
      // `resume` LAST, after every flag: its own usage is `[SESSION_ID] [PROMPT]`, and it rejects
      // `-C`, `-s` and `--add-dir` after the id ("unexpected argument"). The earlier order put the
      // flags after it, so resuming a Codex task never parsed — nothing had ever resumed one.
      ...(r.resumeFrom ? ['resume', r.resumeFrom] : []),
      r.brief,
    ],
  }),
  refuses: (task) => {
    if (task.permissionMode !== undefined && task.permissionMode !== 'bypassPermissions' && !CODEX_SANDBOXES.includes(task.permissionMode)) {
      return `\`permissionMode: ${task.permissionMode}\` is not a sandbox Codex has. Its modes are: ${CODEX_SANDBOXES.join(', ')} (and bypassPermissions, meaning danger-full-access).`;
    }
    if (task.effort !== undefined && !CODEX_EFFORTS.includes(task.effort)) {
      return `\`effort: ${task.effort}\` is not a reasoning effort Codex has. Its efforts are: ${CODEX_EFFORTS.join(', ')}.`;
    }
    // A deny list would be dropped without a word: Codex has no tool to take away, only a sandbox.
    if (task.disallowedTools?.length) {
      return `\`disallowedTools: ${JSON.stringify(task.disallowedTools)}\` is a deny list, and Codex has no tool list to take from: one shell, fenced by its sandbox. The sandbox is \`permissionMode\` — \`read-only\` runs commands and writes nothing. Leave \`disallowedTools\` off a Codex task, and name the sandbox.`;
    }
    // A cap would be dropped without a word: `codex exec --help` (0.154.0) has no spend cap, and its stream counts tokens,
    // not dollars — its config's budgets are token budgets.
    if (task.budgetUsd !== undefined) {
      return `\`budgetUsd: ${task.budgetUsd}\` is a spend cap in dollars, and \`codex exec\` has none: 0.154.0 has no such flag, and reports no cost to cap. Leave \`budgetUsd\` off a Codex task, or file it on \`claude-detached\`, which ends a session at its cap.`;
    }
    const sse = Object.entries(task.mcp ?? {}).find(([, s]) => 'url' in s && s.type === 'sse');
    if (sse) {
      return `\`mcp.${sse[0]}\` is an SSE server, and Codex connects only to stdio and streamable HTTP servers. Give \`type: "http"\` if the server speaks it, or leave the server off a Codex task.`;
    }
    return undefined;
  },
  // What it consumed, from the same JSONL: tokens from `turn.completed`, tool calls by item.
  readOutput: codexOutput,
  // The conversation, from Codex's own rollout of the thread rather than the stream: the rollout dates
  // every record, and `exec --json` dates none.
  transcript: { file: codexRolloutFile, events: codexRolloutEvents },
  noChannel: "`codex exec` reads its prompt once and takes nothing while it runs: there is no channel into a running Codex session. Continue its thread with a new task that carries the words (`resumeFrom`), as `wf retry --message` does.",
  // Best effort: codex prints a thread/session id in its JSONL. Only needed for resume.
  nativeIdPattern: '"(?:thread_id|session_id|id)"\\s*:\\s*"([0-9a-f-]{16,})"',
  /**
   * Trust is extended, never granted.
   *
   * Codex keeps `.git` read-only inside its sandbox on purpose, so a step can only commit its own
   * work when a rule lets `git add`/`git commit` run outside it — and Codex loads a project's rules
   * only when the project is trusted. The one configuration measured to work had the repository AND
   * the worktree trusted; a worktree is a new path, so it is never trusted on its own.
   *
   * So a worktree whose repository you already trust in your own Codex config is trusted for the
   * run, and nothing else is. Trusting a repository you never trusted would also load whatever other
   * Codex settings it ships, and that is not a decision this engine gets to make for you.
   *
   * The same config is read for the MCP servers it names. Codex merges a task's `mcp_servers` into
   * the operator's, so a task server with one of their names becomes a mix of the two — the task's
   * command with the operator's args and env, measured on 0.154.0 — or fails to load when the
   * transports differ. Such a task is refused here, at spawn, where the config is read as it is now.
   */
  prepare: (r) => {
    const config = path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'config.toml');
    let toml: string;
    try { toml = fs.readFileSync(config, 'utf8'); } catch { return {}; }
    const operators = codexMcpServerNames(toml);
    const taken = Object.keys(r.mcp ?? {}).filter((name) => operators.has(name));
    if (taken.length) {
      throw new Error(`${taken.map((n) => `\`mcp.${n}\``).join(', ')}: ${config} already has a server by that name, and Codex merges a task's server into the operator's — keeping the operator's args and env beside the task's — rather than replacing it. Give the task's server another name.`);
    }
    const repo = repositoryOf(r.cwd);
    if (!repo) return {};
    return trustedProjects(toml).has(repo) ? { trustedDirs: [...new Set([repo, r.cwd])] } : {};
  },
};

/**
 * What `claude -p --output-format json` says in its one `result` object. The last result line is taken and every other
 * line skipped — the worker captures stderr beside it.
 *
 * The final answer is its `structured_output`, which Claude Code fills when it was given `--json-schema` and the session
 * answered in that shape. No result, a result without the field, or one whose field is `null`, is no answer.
 *
 * What the session cost is its `total_cost_usd`, and the time it waited on the API its `duration_api_ms` (2.1.272). The
 * cost is the process's own: a `claude -p --resume` printed $0.0042 of its own where the session it continued had
 * spent $0.018 — so it is the attempt's own, as the Claude runner's difference is. The result counts no tool time, and
 * its turns and tokens are not read here: its `usage` said 0 tokens beside a `modelUsage` that counted thousands.
 *
 * A session that stopped at its `--max-budget-usd` says so as its `subtype`, `error_max_budget_usd` — measured on 2.1.272
 * at a $0.01 cap: exit 1, `is_error`, `terminal_reason: budget_exhausted`, "Reached maximum budget ($0.01)", and a
 * `total_cost_usd` of $0.018, since the cap is checked after the response that crosses it.
 */
export const claudeResultOutput = (output: string): HarnessOutput => {
  let result: { type?: unknown; subtype?: unknown; structured_output?: unknown; total_cost_usd?: unknown; duration_api_ms?: unknown } | undefined;
  for (const line of output.split('\n')) {
    if (!line.includes('"result"')) continue;
    try {
      const parsed = JSON.parse(line) as typeof result;
      if (parsed?.type === 'result') result = parsed;
    } catch { /* not the result line */ }
  }
  if (!result) return {};
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
  const [costUsd, apiMs] = [n(result.total_cost_usd), n(result.duration_api_ms)];
  const usage: Usage = { ...(costUsd !== undefined ? { costUsd } : {}), ...(apiMs !== undefined ? { apiMs } : {}) };
  return {
    ...(result.structured_output != null ? { closeout: { payload: result.structured_output } } : {}),
    ...(Object.keys(usage).length ? { usage } : {}),
    ...(result.subtype === 'error_max_budget_usd' ? { budgetSpent: true as const } : {}),
  };
};

/** Claude Code run the same way — detached by us rather than by the harness. For comparison. */
export const claudeDetached: HarnessSpec = {
  name: 'claude-detached',
  command: (r, io) => ({
    cmd: 'claude',
    args: [
      '-p', r.brief,
      // One JSON object when it exits, which `readOutput` reads the final answer from — text output
      // prints only the answer's prose — and which carries the session id `nativeIdPattern` looks for.
      '--output-format', 'json',
      // Variadic, and ended by the flag after it, as for `claude --bg`.
      ...(r.tools ? ['--tools', r.tools.join(',')] : []),
      ...(r.disallowedTools?.length ? ['--disallowedTools', r.disallowedTools.join(',')] : []),
      '--permission-mode', r.permissionMode ?? 'auto',
      // Strict on every spawn, as for `claude --bg`: the checkout's `.mcp.json` and the task's own.
      ...claudeMcpArgs([io?.checkoutMcpConfig, io?.mcpConfigFile]),
      ...(r.model ? ['--model', r.model] : []),
      ...(r.effort ? ['--effort', r.effort] : []),
      // The context window, as for `claude --bg`: `claude -p` compacts past it and still gives its `structured_output` (2.1.278).
      ...(r.contextTokens !== undefined ? ['--autocompact', String(r.contextTokens)] : []),
      // The closing statement's shape, as for `claude --bg`; the answer comes back as the result's
      // `structured_output`. It used to be dropped, so a task on this harness never gave a closeout.
      ...(r.closeoutSchema ? ['--json-schema', JSON.stringify(r.closeoutSchema)] : []),
      ...(r.resumeFrom ? ['--resume', r.resumeFrom] : []),
      ...(r.worktree ? ['--worktree', worktreeName(r)] : []),
      // The spend cap: `claude -p` ends the session once a response takes it past, and says so in its result.
      ...(r.budgetUsd !== undefined ? ['--max-budget-usd', String(r.budgetUsd)] : []),
    ],
  }),
  readOutput: claudeResultOutput,
  nativeIdPattern: '"session_id"\\s*:\\s*"([0-9a-f-]{16,})"',
  // The same transcript `claude --bg` writes, read the same way — but only once the session has exited:
  // its id is in the one object `--output-format json` prints, and that is printed last.
  transcript: { file: claudeTranscriptFile, events: claudeTranscriptEvents },
  noChannel: "`claude -p` listens for messages, but this harness learns its session's id only from what it prints as it exits, so nothing can be addressed to one while it runs. File the task on `claude` to be able to tell it something, or continue its session with a new task that carries the words (`resumeFrom`).",
  /** The checkout's `.mcp.json`, found on disk here so that `command` stays a function of what it is given. */
  prepare: (r) => {
    const found = checkoutMcpConfig(r.cwd);
    return found ? { checkoutMcpConfig: found } : {};
  },
  refuses: claudeRefuses,
  contextTokens: CLAUDE_CONTEXT_TOKENS,
  // Claude Code, as `claude --bg` is: one subscription, one ceiling, whatever either harness is called.
  pool: CLAUDE_POOL,
};
