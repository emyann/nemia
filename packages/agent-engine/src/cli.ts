/**
 * The verbs — and the first consumer of the engine's own public API.
 *
 * This file imports `createEngine` and nothing else from the engine's internals. That is
 * deliberate and it is a test: if the Promise API were not enough to write the CLI with, it would
 * not be enough for anyone else either.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createEngine, type Engine, type Event, type ResumePolicy } from './facade.ts';

/** A brief is a markdown file: optional `key: value` frontmatter, body is the prompt. */
export function parseBrief(text: string, fallbackCwd: string) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  const meta: Record<string, string> = {};
  if (m) for (const line of m[1]!.split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return {
    brief: (m ? text.slice(m[0].length) : text).trim(),
    cwd: meta.cwd ? path.resolve(meta.cwd) : fallbackCwd,
    model: meta.model,
    permissionMode: meta.permissionMode,
    harness: meta.harness,
    maxAttempts: meta.maxAttempts ? Number(meta.maxAttempts) : 1,
    deadlineSeconds: meta.deadlineSeconds ? Number(meta.deadlineSeconds) : undefined,
    resume: meta.resume as ResumePolicy | undefined,
    // Which session to CONTINUE, as opposed to `resume` which is the retry policy between
    // attempts of this task. Two different questions that the same English word answers.
    resumeFrom: meta.resumeFrom,
    // `worktree: true` lets the harness name it; any other value names it yourself.
    worktree: meta.worktree === undefined ? undefined : meta.worktree === 'true' ? true : meta.worktree,
  };
}

const line = (v: { id: string; phase: string; state: { harness?: string; attempts: unknown[]; maxAttempts: number; brief: string }; costUsd?: number; turns?: number }) => {
  const meter = v.costUsd !== undefined ? ` $${v.costUsd.toFixed(3)}/${v.turns ?? 0}t` : '';
  return `${v.id}  ${(v.state.harness ?? 'claude').padEnd(9)} ${v.phase.padEnd(18)} ${v.state.attempts.length}/${v.state.maxAttempts}${meter}  ${v.state.brief.split('\n')[0]!.slice(0, 44)}`;
};

/**
 * One journal entry, for a person. Shared by `feed`, `show` and `watch` so the same event does not
 * read three different ways depending on which verb printed it.
 */
const KINDS: Record<string, string> = {
  filed: 'filed', starting: 'starting', spawned: 'started',
  ended: 'ended', settled: 'SETTLED', 'stop-requested': 'stop asked',
};

const entryLine = (taskId: string, event: Event) => {
  const extra = event.kind === 'settled' ? `  ${event.outcome}`
    : event.kind === 'ended' ? `  ${event.observed}${event.reason === 'lost' ? ' (lost)' : ''}`
    : '';
  return `${event.at.slice(11, 19)}  ${taskId.padEnd(34)} ${(KINDS[event.kind] ?? event.kind).padEnd(10)}${extra}`;
};

const HELP = `ae — an engine for agent sessions

  ae start <brief.md|"text">   file a task
  ae tick                      one reconcile pass
  ae up [ms]                   reconcile on a timer
  ae ls                        every task, desired vs observed
  ae show <id>                 the journal, line by line
  ae logs <id>                 the session's output
  ae stop <id>                 ask it to stop
  ae feed [cursor]             what happened, since a cursor — the upper layer's API
  ae watch [cursor]            the same, followed

  a brief is markdown with optional frontmatter:
    cwd, model, maxAttempts, permissionMode
    harness          claude (default) | codex | claude-detached
    deadlineSeconds  wall clock across all attempts
    resume           interrupted (default) | always | never — the RETRY policy
    resumeFrom       a session id to continue, instead of starting cold
    worktree         true, or a name — the harness cuts it

  AE_ROOT            a different board, the way a kubeconfig points at a different cluster
  AE_MAX_CONCURRENT  sessions per harness at once (default 3)`;

export async function main(argv: string[]): Promise<void> {
  const [verb, arg] = argv;
  const engine: Engine = createEngine({
    root: process.env.AE_ROOT ?? path.join(os.homedir(), '.agent-engine'),
    maxConcurrent: Number(process.env.AE_MAX_CONCURRENT) || undefined,
  });

  switch (verb) {
    case 'start': {
      if (!arg) return console.log(HELP);
      const text = fs.existsSync(arg) ? fs.readFileSync(arg, 'utf8') : arg;
      const spec = parseBrief(text, process.cwd());
      const id = await engine.file(spec);
      console.log(`${id}  filed → ${spec.cwd}`);
      console.log(`run 'ae tick' (or 'ae up') to start it`);
      return;
    }

    case 'ls': {
      const views = await engine.list();
      if (!views.length) return console.log('no tasks');
      for (const v of views) console.log(line(v));
      return;
    }

    case 'show': {
      if (!arg) return console.log(HELP);
      const v = await engine.view(arg);
      if (!v.state.brief && !v.state.attempts.length) return console.log(`no such task: ${arg}`);
      const { entries } = await engine.feed(0);
      for (const e of entries.filter((x) => x.taskId === arg)) console.log(entryLine(e.taskId, e.event));
      console.log(`\ncwd: ${v.state.cwd}\nbrief: ${v.state.brief.slice(0, 200)}`);
      return;
    }

    case 'logs':
      if (!arg) return console.log(HELP);
      return console.log(await engine.logs(arg));

    case 'stop':
      if (!arg) return console.log(HELP);
      await engine.stop(arg);
      return console.log(`${arg}  stop requested`);

    case 'tick': {
      const r = await engine.tick();
      const load = Object.entries(r.running).map(([h, n]) => `${h}:${n}`).join(' ') || 'idle';
      return console.log(`${r.actions} action(s) over ${r.tasks} task(s)  [${load}]`);
    }

    case 'feed': {
      const { entries, cursor } = await engine.feed(Number(arg) || 0);
      for (const e of entries) console.log(entryLine(e.taskId, e.event));
      return console.log(`cursor: ${cursor}`);
    }

    // `engine.watch`, not a poll loop of `engine.feed`. The store PUSHES (the file journal watches
    // the feed), the timer is only the backstop for a store that cannot or an OS event that got
    // dropped, and a drain guard keeps "at-least-once, in order" true when a push and a tick land
    // together. All of that already exists behind one method; re-implementing the easy half of it
    // here is how a CLI ends up being the worst consumer of its own API.
    case 'watch': {
      const from = Number(arg) || 0;
      console.log(`watching from ${from}, ^C to stop`);
      await new Promise<void>(() => {
        engine.watch({
          from,
          onEntry: ({ taskId, event }) => console.log(entryLine(taskId, event)),
          onError: (e) => console.error(String(e)),
        });
      });
      return;
    }

    case 'up': {
      const every = Number(arg) || 3_000;
      console.log(`up — ticking every ${every}ms, ^C to stop`);
      await new Promise<void>(() => {
        engine.start({
          intervalMs: every,
          onTick: (r) => {
            if (!r.actions) return;
            const load = Object.entries(r.running).map(([h, n]) => `${h}:${n}`).join(' ');
            console.log(`${new Date().toISOString().slice(11, 19)}  ${r.actions} action(s) over ${r.tasks} task(s)  [${load}]`);
          },
          onError: (e) => console.error(String(e)),
        });
      });
      return;
    }

    default:
      return console.log(HELP);
  }
}
