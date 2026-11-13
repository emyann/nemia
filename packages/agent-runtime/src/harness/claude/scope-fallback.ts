/**
 * Claude Code started behind an unlimited scope's argv (`scopeArgv`), or bare where the scope cannot be made: the process the SDK is
 * handed (`spawnClaudeCodeProcess`) for a held session with no memory limit. The probe (`scopeRefusal`) is asked once a process, so a
 * user manager gone since it passed has `systemd-run` exit before it runs Claude Code, and a session with no limit, which never needed
 * a scope to run, is started again bare rather than failed. Told apart by the first byte on stdout: Claude Code speaks first, its
 * `init` line, and `systemd-run` says nothing there, so a process that ends having printed nothing on stdout, unasked and not by a
 * signal, is the scope refused. A Claude Code that dies before its first line is started again bare once too, and fails there as it
 * would have.
 *
 * What the SDK writes on stdin before the first byte comes is kept and written again to the bare process, so the `initialize` request
 * and the first words reach it. Its `exit` is the process's `close`, once its streams are drained, as the SDK's own spawn delivers it.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { SpawnedProcess, SpawnOptions } from '@anthropic-ai/claude-agent-sdk';

/** What the SDK listens to the process with: its `exit`, or its `error`. */
type Listener = ((code: number | null, signal: NodeJS.Signals | null) => void) | ((error: Error) => void);

/** Where the process handed on stands: the process now, whether it spoke or was asked to end, how it ended, what stdin carried. */
type Held = {
  child?: ChildProcess;
  heard: boolean;
  asked: boolean;
  ended?: { code: number | null; signal: NodeJS.Signals | null };
  stdinEnded: boolean;
  kept: Buffer[];
};

/** The process the SDK is handed: its streams, `events` for its `exit` and `error`, and `held`'s process for the rest. */
const spawnedOf = (stdin: PassThrough, stdout: PassThrough, events: EventEmitter, held: Held): SpawnedProcess => ({
  stdin,
  stdout,
  get killed() {
    return held.asked || held.child?.killed === true;
  },
  get exitCode() {
    return held.ended?.code ?? null;
  },
  get signalCode() {
    return held.ended?.signal ?? null;
  },
  kill: (signal) => {
    held.asked = true;
    return held.child?.kill(signal) ?? false;
  },
  on(event: 'exit' | 'error', listener: Listener) {
    events.on(event, listener);
  },
  once(event: 'exit' | 'error', listener: Listener) {
    events.once(event, listener);
  },
  off(event: 'exit' | 'error', listener: Listener) {
    events.off(event, listener);
  },
});

/**
 * Starts `o.command` behind `scope`, falling back to it bare. `started` is told each process started, scoped then bare, before it is
 * handed on; `bare` is told why, where the scope was refused.
 */
export const scopedOrBare = (
  scope: readonly string[],
  o: SpawnOptions,
  started: (child: ChildProcess) => void,
  bare: (why: string) => void,
): SpawnedProcess => {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const events = new EventEmitter();
  const held: Held = { heard: false, asked: false, stdinEnded: false, kept: [] };

  const start = (argv: readonly string[], scoped: boolean): void => {
    const [command, ...args] = argv;
    const c = spawn(command ?? o.command, args, { cwd: o.cwd, env: o.env, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    held.child = c;
    let said = '';
    c.stdin?.on('error', () => {});
    c.stdout?.on('data', (chunk: Buffer) => {
      held.heard = true;
      held.kept.length = 0;
      stdout.write(chunk);
    });
    c.stderr?.on('data', (chunk: Buffer) => {
      if (scoped && !held.heard) said += chunk.toString('utf8');
    });
    const refused = (why: string): boolean => {
      if (!scoped || held.heard || held.asked || o.signal.aborted) return false;
      bare(why.trim().split('\n').at(-1) || 'the scope program exited before Claude Code printed anything');
      start([o.command, ...o.args], false);
      for (const chunk of held.kept) held.child?.stdin?.write(chunk);
      if (held.stdinEnded) held.child?.stdin?.end();
      return true;
    };
    c.on('error', (e) => {
      if (!refused(e.message)) events.emit('error', e);
    });
    c.on('close', (code, signal) => {
      if (held.child !== c || (signal === null && code !== 0 && refused(said))) return;
      held.ended = { code, signal };
      stdout.end();
      events.emit('exit', code, signal);
    });
    started(c);
  };

  stdin.on('data', (chunk: Buffer) => {
    if (!held.heard) held.kept.push(chunk);
    held.child?.stdin?.write(chunk);
  });
  stdin.on('end', () => {
    held.stdinEnded = true;
    held.child?.stdin?.end();
  });
  start([...scope, o.command, ...o.args], true);
  return spawnedOf(stdin, stdout, events, held);
};
