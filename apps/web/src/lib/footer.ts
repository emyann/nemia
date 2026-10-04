/**
 * The words of the frame's bottom bar (`FrameFooter`): what is at work, the daemon's dot, whether the board follows the feed, the quota in
 * short, and which of them a phone keeps. Each short form fits the bar's one line, and its whole sentence is its `title`. Pure: the time is
 * handed in, the browser's own on the page.
 */
import type { Daemon, Quota, RunSummary } from './api';
import { daemonSentence, daemonWords } from './daemon.ts';
import { inFlight } from './factory.ts';
import type { FeedStatus } from './feed.ts';
import { lastWords, quotaTitle, type WindowWords, windowWords } from './quota.ts';
import { stepState } from './status.ts';

/** What is at work across every factory: the runs in flight, and the sessions working or checking. */
export type AtWork = { runs: number; sessions: number };

/**
 * What is at work in `runs`, every factory's: the runs in flight (`inFlight`), and the steps of every run not called off whose state is
 * `working` or `checking` — a session at work, or the run's check of one. A step that asks a person (`needs-human`) waits on them, and is
 * not counted: the bell counts what waits on you. A held run's step keeps its state (`stepState`), so a session a hold did not stop counts.
 */
export function atWork(runs: readonly RunSummary[]): AtWork {
  let sessions = 0;
  for (const run of runs) {
    if (run.cancelledAt) continue;
    for (const step of run.steps) {
      const state = stepState(step.status, false, run.holding != null);
      if (state === 'working' || state === 'checking') sessions += 1;
    }
  }
  return { runs: runs.filter(inFlight).length, sessions };
}

/** `count` and its noun, singular for one. */
const counted = (count: number, one: string): string => `${count} ${one}${count === 1 ? '' : 's'}`;

/** What is at work, in short (`2 runs · 3 sessions`) and as a sentence. */
export const atWorkWords = (work: AtWork): { text: string; title: string } => ({
  text: `${counted(work.runs, 'run')} · ${counted(work.sessions, 'session')}`,
  title: `${counted(work.runs, 'run')} in flight, and ${counted(work.sessions, 'session')} working or checking, across every factory.`,
});

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
 * own line while one does, and why the read failed when it did.
 */
export function daemonDot(daemon: Daemon | undefined, error: Error | null, now: Date): DaemonDot {
  if (error) {
    return { kind: 'error', tone: 'down', word: 'unread', title: `Whether a daemon ticks this store could not be read: ${error.message}` };
  }
  if (!daemon) return { kind: 'reading', tone: 'reading', word: 'reading', title: 'Reading whether a daemon ticks this store.' };
  const words = daemonWords(daemon, now);
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

/** Each state with no windows to show, in a word. */
const QUOTA_WORDS: Record<Quota['state'], string> = {
  fresh: 'fresh',
  asking: 'asking',
  'no-plan': 'no plan',
  unanswered: 'unanswered',
  'no-claude': 'no Claude',
  timeout: 'timed out',
  failed: 'failed',
  unknown: 'unknown',
};

/** Windows in short: `5-hour 82% · week 40%`. */
const windowsText = (windows: readonly WindowWords[]): string => windows.map((w) => `${w.label} ${w.used}`).join(' · ');

/**
 * The quota in short: each window's label and percentage — `marked` when one is used past the mark and not reset since — and the hover's
 * sentence (`quotaTitle`). A state with nothing to show now gives the last good reading, `stale`, or its word when there is none, the api's
 * sentence first in the title. A read that failed is the word `unread`.
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
  if (last) return { text: windowsText(last.windows), marked: false, stale: true, title: `${said} Last read ${last.asOf}.` };
  return { text: QUOTA_WORDS[quota.state], marked: false, stale: false, title: said };
}

/** A group of the bottom bar. */
export type FooterPart = 'daemon' | 'feed' | 'work' | 'quota' | 'version';

/** The groups the bar shows, left to right: all five, and on a `narrow` screen the daemon's dot and the quota alone. */
export const footerParts = (narrow: boolean): readonly FooterPart[] =>
  narrow ? ['daemon', 'quota'] : ['daemon', 'feed', 'work', 'quota', 'version'];

/**
 * Each place in `source` that sizes a page as the screen less the header alone (`100svh-3rem`), a line break inside or not: under the
 * bottom bar a page is the screen less both, `100svh-5rem`.
 */
export const staleFrameHeights = (source: string): string[] => [...source.matchAll(/h-\[calc\(100svh-\s*3rem\)\]/g)].map((m) => m[0]);
