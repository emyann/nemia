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
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Observed, Sighting } from './domain.ts';
import { RunnerError, worktreeName, type RunnerOps, type SpawnRequest } from './runner.ts';

/** Everything this engine needs to know about a harness. Add one by writing one of these. */
export type HarnessSpec = {
  name: string;
  /** The command that runs a brief to completion. Exit 0 is success; anything else is failure. */
  command: (r: SpawnRequest) => { cmd: string; args: string[] };
  /**
   * A regex with one capture group, matched against the harness's output, that finds ITS session
   * id — needed only to resume later. Optional: the name is the key, this is just a handle.
   */
  nativeIdPattern?: string;
};

/** How long a run file may go unbeaten before `observe` calls it dead. Worker beats every 5s. */
export const STALE_MS = 30_000;

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'ae-worker.ts');
const safe = (name: string) => name.replace(/[^a-zA-Z0-9]+/g, '_');

type RunFile = {
  name?: string; state: Observed; pid: number; heartbeatAt: string;
  nativeId?: string; logFile: string; exitCode?: number;
};

export const detachedOps = (spec: HarnessSpec, root: string): RunnerOps => {
  const dir = path.join(root, 'runs', spec.name);
  const runFile = (name: string) => path.join(dir, `${safe(name)}.json`);
  const logFile = (name: string) => path.join(dir, `${safe(name)}.log`);

  const readAll = (): Array<{ name: string; run: RunFile }> => {
    if (!fs.existsSync(dir)) return [];
    const out: Array<{ name: string; run: RunFile }> = [];
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
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

  return {
    spawn: (r) =>
      Effect.try({
        try: () => {
          fs.mkdirSync(dir, { recursive: true });
          const { cmd, args } = spec.command(r);
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
      for (const { name, run } of readAll()) m.set(name, { sessionId: name, state: observedState(run, now), nativeId: run.nativeId });
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
  command: (r) => ({
    cmd: 'codex',
    args: [
      'exec',
      ...(r.resumeFrom ? ['resume', r.resumeFrom] : []),
      '--json',
      '--skip-git-repo-check',
      '-C', r.cwd,
      '-s', r.permissionMode === 'bypassPermissions' ? 'danger-full-access' : 'workspace-write',
      ...(r.model ? ['-m', r.model] : []),
      // Codex's worktree flag takes NO value, so it is safe immediately before the prompt —
      // unlike Claude's. The spec is where that difference lives, so the engine never learns
      // that harnesses disagree about anything.
      ...(r.worktree ? ['--worktree'] : []),
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
