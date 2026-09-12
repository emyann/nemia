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
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Observed, Sighting } from './domain.ts';
import { RunnerError, worktreeName, type RunnerOps, type SpawnRequest } from './runner.ts';

/** Everything this engine needs to know about a harness. Add one by writing one of these. */
export type HarnessSpec = {
  name: string;
  /** The command that runs a brief to completion. Exit 0 is success; anything else is failure. */
  command: (r: SpawnRequest, io?: HarnessIO) => { cmd: string; args: string[] };
  /**
   * A regex with one capture group, matched against the harness's output, that finds ITS session
   * id — needed only to resume later. Optional: the name is the key, this is just a handle.
   */
  nativeIdPattern?: string;
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
  /**
   * Directories outside the workspace the harness must be able to write — the git metadata the
   * working directory's commits land in.
   *
   * A worktree's `.git` is a pointer: its index and HEAD live in `<repo>/.git/worktrees/<name>` and
   * its objects in `<repo>/.git`, both outside the worktree. Codex's `workspace-write` sandbox made
   * them read-only, so every review step could write REVIEW.md and never commit it — two real runs,
   * both signing off blocked for that reason alone.
   */
  writableRoots?: string[];
};

/** How long a run file may go unbeaten before `observe` calls it dead. Worker beats every 5s. */
export const STALE_MS = 30_000;

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'ae-worker.ts');
const safe = (name: string) => name.replace(/[^a-zA-Z0-9]+/g, '_');

/** The git directory a commit made in `cwd` writes to, absolute. Undefined outside a repository. */
const gitCommonDir = (cwd: string): string | undefined => {
  try {
    const out = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return path.resolve(cwd, out.trim());
  } catch { return undefined; }
};

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
          fs.mkdirSync(dir, { recursive: true });
          // A re-spawn of the same attempt must not find the previous one's answer waiting for it.
          try { fs.rmSync(closeoutFile(r.name)); } catch { /* nothing to clear */ }
          let io: HarnessIO = {};
          if (r.closeoutSchema) {
            fs.writeFileSync(schemaFile(r.name), JSON.stringify(r.closeoutSchema));
            io = { closeoutSchemaFile: schemaFile(r.name), closeoutFile: closeoutFile(r.name) };
          }
          // Found here rather than in the spec, so a spec stays a pure function of what it is given.
          const gitDir = gitCommonDir(r.cwd);
          if (gitDir) io = { ...io, writableRoots: [gitDir] };
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
          child.unref();
        },
        catch: (cause) => new RunnerError({ verb: 'spawn', message: `${spec.name}: ${String(cause)}` }),
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
        m.set(name, { sessionId: name, state: observedState(run, now), nativeId: run.nativeId, closeout: statementOf(name) });
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
 * Codex, through `codex exec`. Verified against codex-cli 0.154.0:
 *   --json                  JSONL events on stdout
 *   -C <dir>                working root
 *   -s <mode>               sandbox: read-only | workspace-write | danger-full-access
 *   --skip-git-repo-check   allow running outside a git repository
 *   exec resume <id>        continue a previous session
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
      '-s', r.permissionMode === 'bypassPermissions' ? 'danger-full-access' : 'workspace-write',
      ...(r.model ? ['-m', r.model] : []),
      // Codex's worktree flag takes NO value, so it is safe immediately before the prompt —
      // unlike Claude's. The spec is where that difference lives, so the engine never learns
      // that harnesses disagree about anything.
      ...(r.worktree ? ['--worktree'] : []),
      // Where a commit writes. Without it the sandbox lets a step edit files it can never commit —
      // measured twice, on the two review steps that ran in worktrees.
      ...(io?.writableRoots ?? []).flatMap((dir) => ['--add-dir', dir]),
      // The closing statement, when the task asked for one. `--output-schema` makes the final
      // message conform; `-o` writes it where the runner chose, outside the workspace, so it
      // cannot travel into the next step's branch. Verified against 0.154.0, strict schema.
      ...(io?.closeoutFile ? ['--output-schema', io.closeoutSchemaFile!, '-o', io.closeoutFile] : []),
      // `resume` LAST, after every flag: its own usage is `[SESSION_ID] [PROMPT]`, and it rejects
      // `-C`, `-s` and `--add-dir` after the id ("unexpected argument"). The earlier order put the
      // flags after it, so resuming a Codex task never parsed — nothing had ever resumed one.
      ...(r.resumeFrom ? ['resume', r.resumeFrom] : []),
      r.brief,
    ],
  }),
  // Best effort: codex prints a thread/session id in its JSONL. Only needed for resume.
  nativeIdPattern: '"(?:thread_id|session_id|id)"\\s*:\\s*"([0-9a-f-]{16,})"',
};

/** Claude Code run the same way — detached by us rather than by the harness. For comparison. */
export const claudeDetached: HarnessSpec = {
  name: 'claude-detached',
  command: (r) => ({
    cmd: 'claude',
    args: [
      '-p', r.brief,
      '--permission-mode', r.permissionMode ?? 'auto',
      ...(r.model ? ['--model', r.model] : []),
      ...(r.resumeFrom ? ['--resume', r.resumeFrom] : []),
      ...(r.worktree ? ['--worktree', worktreeName(r)] : []),
    ],
  }),
  nativeIdPattern: '"session_id"\\s*:\\s*"([0-9a-f-]{16,})"',
};
