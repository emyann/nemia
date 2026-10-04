/**
 * The words the Factory says over its floor when nothing ticks the store (`DaemonLine`), from what the api judged of `daemon.json`
 * (`Daemon`). Pure: the time is handed in, the browser's own on the page, so an age moves between reads.
 */
import type { Daemon } from './api';
import { agoWord } from './quota.ts';

/**
 * The line in three parts, `before` + `command` + `after`, so the page can set the command — the api's `start` — as code and a test can
 * read the sentence whole.
 */
export type DaemonWords = { before: string; command: string; after: string };

/** How long ago the daemon did something, as the line says it: never `just now`, which reads as a daemon that is fine. */
const heard = (at: string | null, now: Date): string => {
  if (!at) return 'at a time its file does not say';
  const ms = now.getTime() - Date.parse(at);
  return ms < 60_000 ? 'under a minute ago' : agoWord(ms);
};

/**
 * Why nothing ticks the store and how to start what does, or null when a daemon ticks it — nothing to say then. The holder is named by
 * its kind as the api answers it (`by`); the daemon is started as the api says (`start`: the api's own process, which serves the board
 * as it ticks), or headless where no board is served. One silent past its stale mark, or a file that does not read, is taken over by the
 * next daemon, and the line says so, since a person would otherwise stop to clear it first.
 */
export function daemonWords(d: Daemon, now: Date): DaemonWords | null {
  if (d.ticking) return null;
  const who = `the ${d.by} of pid ${d.pid}`;
  let why: string;
  switch (d.kind) {
    case 'none':
      why = 'no daemon has held it';
      break;
    case 'unreadable':
      why = 'its daemon.json does not read as a daemon’s';
      break;
    case 'stopped':
      why = `${who} stopped ${heard(d.stoppedAt, now)}`;
      break;
    case 'gone':
      why = `${who} is gone, last heard from ${heard(d.lastHeardAt, now)}`;
      break;
    case 'stalled':
      why = `${who} is alive but silent, last heard from ${heard(d.lastHeardAt, now)}`;
      break;
    case 'ticking':
      return null;
  }
  const takesOver = d.kind === 'stalled' || d.kind === 'unreadable';
  return {
    before: `Nothing ticks this store, so no run moves: ${why}. Start one with `,
    command: d.start,
    after: `${takesOver ? ' — it takes the store over' : ''}, or wf up where no board is served.`,
  };
}

/** The line as one sentence. */
export const daemonSentence = (w: DaemonWords): string => `${w.before}${w.command}${w.after}`;
