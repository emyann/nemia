/**
 * The words of the machine's gauges (`GaugesButton`, `GaugesBar`): what is at work, the daemon's dot, whether the board follows the feed,
 * the quota in short; the pause says its own (`pauseWords`). Each short form fits one line, and its whole sentence is its `title`. Pure:
 * the time is handed in, the browser's own on the page.
 */
import type { Daemon, OpenRuns, Quota, Version } from './api';
import { daemonSentence, daemonWords } from './daemon.ts';
import { openRows } from './factory.ts';
import type { FeedStatus } from './feed.ts';
import { lastWords, quotaTitle, type WindowWords, windowWords } from './quota.ts';
import { stepState } from './status.ts';

/** What is at work across every factory: the runs in flight, and the sessions working or checking. */
export type AtWork = { runs: number; sessions: number };

/**
 * What is at work in `open`, the light answer of every factory: the runs in flight by the api's own count (`counts.inFlight`), which counts
 * a run that waits on a person among the waiting alone, as the rail's Runs count does; and the steps of every run of it not called off
 * whose state is `working` or `checking` — a session at work, or the run's check of one — a waiting run's among them. A step that asks a
 * person (`needs-human`) waits on them, and is not counted. A held run's step keeps its state (`stepState`), so a session a hold did not
 * stop counts.
 */
export function atWork(open: Pick<OpenRuns, 'counts' | 'waiting' | 'inFlight'>): AtWork {
  let sessions = 0;
  for (const run of openRows(open)) {
    if (run.cancelledAt) continue;
    for (const step of run.steps) {
      const state = stepState(step, false, run.holding != null);
      if (state === 'working' || state === 'checking') sessions += 1;
    }
  }
  return { runs: open.counts.inFlight, sessions };
}

/** `count` and its noun, singular for one. */
const counted = (count: number, one: string): string => `${count} ${one}${count === 1 ? '' : 's'}`;

/** What is at work, in short (`2 runs · 3 sessions`) and as a sentence. */
export const atWorkWords = (work: AtWork): { text: string; title: string } => ({
  text: `${counted(work.runs, 'run')} · ${counted(work.sessions, 'session')}`,
  title: `${counted(work.runs, 'run')} in flight, and ${counted(work.sessions, 'session')} working or checking, across every factory.`,
});

/**
 * The version and the code serving the board, in short — `v1.0.0 · v1.2.0` for an install of that tag, `v1.0.0 · checkout` for a
 * checkout, the version alone where the api says neither — and as a sentence naming the folder it runs from.
 */
export function versionWords(version: Version): { text: string; title: string } {
  const named = `Nemia's orchestrator, version ${version.version}`;
  const release = version.release;
  if (release === undefined) return { text: `v${version.version}`, title: named };
  if (release.kind === 'checkout')
    return { text: `v${version.version} · checkout`, title: `${named}, run from the checkout at ${release.root}` };
  const tag = release.tag ?? 'install';
  const commit = release.commit ? ` (${release.commit.slice(0, 7)})` : '';
  return { text: `v${version.version} · ${tag}`, title: `${named}, the installed release ${tag}${commit} at ${release.root}` };
}

/** How the daemon's dot is drawn: it ticks, it may be taken over, nothing ticks, or nothing is read yet. */
export type DaemonTone = 'ok' | 'warn' | 'down' | 'reading';

/** The daemon's dot: what it stands for (`kind`, `error` for a read that failed), its tone, its word, and its whole sentence. */
export type DaemonDot = { kind: Daemon['kind'] | 'error' | 'reading'; tone: DaemonTone; word: string; title: string };

/** Each standing's tone: one alive but silent, or a file that does not read, is taken over by the next daemon, so it warns. */
const TONES: Record<Daemon['kind'], DaemonTone> = {
  ticking: 'ok',
  stalled: 'warn',
  unreadable: 'warn',
  none: 'down',
  stopped: 'down',
  gone: 'down',
};

/** Each standing's word in the bar. */
const DAEMON_WORDS: Record<Daemon['kind'], string> = {
  ticking: 'ticking',
  stalled: 'stalled',
  unreadable: 'unreadable',
  none: 'none',
  stopped: 'stopped',
  gone: 'gone',
};

/**
 * The daemon's dot from what the api judged (`GET /api/daemon`, the api's own standing as the store's daemon), or from the read's `error`:
 * down then, and `unread`, never a daemon that ticks. Its title is the floor's whole sentence when nothing ticks (`daemonWords`), the api's
 * own line while one does, and why the read failed when it did. A daemon that ticks while its last pass could not read a harness
 * (`unobserved`) warns, `ticking, harness unread`, its title the line and then each reason on a line of its own.
 */
export function daemonDot(daemon: Daemon | undefined, error: Error | null, now: Date): DaemonDot {
  if (error) {
    return { kind: 'error', tone: 'down', word: 'unread', title: `Whether a daemon ticks this store could not be read: ${error.message}` };
  }
  if (!daemon) return { kind: 'reading', tone: 'reading', word: 'reading', title: 'Reading whether a daemon ticks this store.' };
  const words = daemonWords(daemon, now);
  if (daemon.ticking && daemon.unobserved.length > 0) {
    return { kind: daemon.kind, tone: 'warn', word: 'ticking, harness unread', title: [daemon.line, ...daemon.unobserved].join('\n') };
  }
  return {
    kind: daemon.kind,
    tone: TONES[daemon.kind],
    word: DAEMON_WORDS[daemon.kind],
    title: words ? daemonSentence(words) : daemon.line,
  };
}

/** Whether the board follows the workflow feed, as a word and a sentence. */
export function feedWords(feed: FeedStatus): { word: string; title: string } {
  switch (feed) {
    case 'open':
      return { word: 'live', title: 'The board follows the workflow feed: what moves is read again at once.' };
    case 'connecting':
      return { word: 'connecting', title: 'The board is opening the workflow feed.' };
    case 'down':
      return { word: 'polling', title: 'The board cannot follow the workflow feed, and reads the runs again every few seconds.' };
  }
}

/** Windows in short: `5-hour 82% · week 40%`. */
const windowsText = (windows: readonly WindowWords[]): string => windows.map((w) => `${w.label} ${w.used}`).join(' · ');

/**
 * The quota in short: each window's label and percentage — `marked` when one is used past the mark and not reset since — and the hover's
 * sentence (`quotaTitle`). A state with nothing to show now gives the last good reading, `stale` and marked as the gauges mark it, or the
 * api's word for its state when there is none, the api's sentence first in the title. A read that failed is the word `unread`.
 */
export function quotaShort(
  quota: Quota | undefined,
  error: Error | null,
  now: Date,
): { text: string; marked: boolean; stale: boolean; title: string } {
  if (error) return { text: 'unread', marked: false, stale: false, title: `The quota could not be read: ${error.message}` };
  if (!quota) return { text: 'reading', marked: false, stale: false, title: 'Reading the quota.' };
  const title = quotaTitle(quota, now);
  if (quota.state === 'fresh') {
    const windows = quota.windows.map((w) => windowWords(w, now));
    return { text: windowsText(windows), marked: windows.some((w) => w.marked), stale: false, title };
  }
  const said = quota.said ? `${quota.said} ${title}` : title;
  const last = lastWords(quota, now);
  if (last) {
    return {
      text: windowsText(last.windows),
      marked: last.windows.some((w) => w.marked),
      stale: true,
      title: `${said} Last read ${last.asOf}.`,
    };
  }
  return { text: quota.state.replace('-', ' '), marked: false, stale: false, title: said };
}

/**
 * Each place in `source` that sizes a page as the screen less the old header (`100svh-3rem`), a line break inside or not: under the top
 * bar a page is the screen less its height, `100svh-var(--frame-top)`.
 */
export const staleFrameHeights = (source: string): string[] => [...source.matchAll(/h-\[calc\(100svh-\s*3rem\)\]/g)].map((m) => m[0]);
