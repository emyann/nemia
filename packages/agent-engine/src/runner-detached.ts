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
import type { Observed, Sighting } from './domain.ts';
import { claudeRefuses, RunnerError, worktreeName, type RunnerOps, type SpawnRequest } from './runner.ts';

/** Everything this engine needs to know about a harness. Add one by writing one of these. */
export type HarnessSpec = {
  name: string;
  /** The command that runs a brief to completion. Exit 0 is success; anything else is failure. */
  command: (r: SpawnRequest, io?: HarnessIO) => { cmd: string; args: string[] };
  /**
   * What this harness needs to know about the machine before it runs — read from disk, from git —
   * kept out of `command` so that stays a pure function of what it is given. Merged into the `io`
   * the command receives.
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

  const readAll = (): Array<{ name: string; run: RunFile }> => {
    if (!fs.existsSync(dir)) return [];
    const out: Array<{ name: string; run: RunFile }> = [];
    for (const f of fs.readdirSync(dir)) {
      // Run files only. A closeout or a schema is also JSON, and a payload that happened to carry
      // a `name` would otherwise be read as a session.
      if (!f.endsWith('.json') || f.endsWith('.closeout.json') || f.endsWith('.schema.json')) continue;
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

  return {
    spawn: (r) =>
      Effect.try({
        try: () => {
          // Checked here because `spawn` does not throw for it: the child emits the error later, and
          // unheard, that event kills the process that launched the worker — the engine.
          if (!isDirectory(r.cwd)) throw new Error(`cwd ${r.cwd} is not a directory`);
          fs.mkdirSync(dir, { recursive: true });
          // A re-spawn of the same attempt must not find the previous one's answer waiting for it.
          try { fs.rmSync(closeoutFile(r.name)); } catch { /* nothing to clear */ }
          let io: HarnessIO = {};
          if (r.closeoutSchema) {
            fs.writeFileSync(schemaFile(r.name), JSON.stringify(r.closeoutSchema));
            io = { closeoutSchemaFile: schemaFile(r.name), closeoutFile: closeoutFile(r.name) };
          }
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
        m.set(name, {
          sessionId: name, state: observedState(run, now), nativeId: run.nativeId, closeout: statementOf(name),
          // The process's own exit code, once it has one. The worker writes -1 when there is none —
          // killed by a signal, or never started — and that is reported as no code, not as a code.
          ...(typeof run.exitCode === 'number' && run.exitCode >= 0 ? { exitCode: run.exitCode } : {}),
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

/**
 * Codex, through `codex exec`. Verified against codex-cli 0.154.0:
 *   --json                  JSONL events on stdout
 *   -C <dir>                working root
 *   -s <mode>               sandbox: read-only | workspace-write | danger-full-access
 *   --skip-git-repo-check   allow running outside a git repository
 *   exec resume <id>        continue a previous session
 *   -c key="value"          a config override: `model_reasoning_effort`, project trust
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
    return undefined;
  },
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
   */
  prepare: (r) => {
    const repo = repositoryOf(r.cwd);
    if (!repo) return {};
    const config = path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'config.toml');
    let trusted: Set<string>;
    try { trusted = trustedProjects(fs.readFileSync(config, 'utf8')); } catch { return {}; }
    return trusted.has(repo) ? { trustedDirs: [...new Set([repo, r.cwd])] } : {};
  },
};

/** Claude Code run the same way — detached by us rather than by the harness. For comparison. */
export const claudeDetached: HarnessSpec = {
  name: 'claude-detached',
  command: (r) => ({
    cmd: 'claude',
    args: [
      '-p', r.brief,
      // Variadic, and ended by the flag after it, as for `claude --bg`.
      ...(r.tools ? ['--tools', r.tools.join(',')] : []),
      '--permission-mode', r.permissionMode ?? 'auto',
      ...(r.model ? ['--model', r.model] : []),
      ...(r.effort ? ['--effort', r.effort] : []),
      ...(r.resumeFrom ? ['--resume', r.resumeFrom] : []),
      ...(r.worktree ? ['--worktree', worktreeName(r)] : []),
    ],
  }),
  nativeIdPattern: '"session_id"\\s*:\\s*"([0-9a-f-]{16,})"',
  refuses: claudeRefuses,
};
