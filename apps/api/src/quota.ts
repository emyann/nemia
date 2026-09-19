/**
 * The subscription's quota, as the statusline script last wrote it (`statusline/quota.ts`, the file's one writer): read from
 * `$WF_ROOT/quota.json` on each request, and judged against the time of the request. Nothing of it is kept between requests.
 *
 * The numbers are as fresh as the last interactive Claude Code session's last statusline: nothing else on the machine exposes them, and
 * workers draining the subscription never refresh them. So their age is said with them, and past `QUOTA_STALE_MS` they are not shown.
 */
import fs from 'node:fs';
import path from 'node:path';
import { HOME } from 'agent-workflows';

/**
 * A reading older than this is stale, and its numbers are not shown: one five-hour window. Past it, the five-hour number is about a
 * window that has ended, and a reading from yesterday never reads as now.
 */
export const QUOTA_STALE_MS = 5 * 60 * 60 * 1000;

/** A window used this much or more, in percent, is marked. */
export const QUOTA_MARK_PERCENT = 80;

/** Where the statusline script writes. */
export const quotaFile = (home: string = HOME): string => path.join(home, 'quota.json');

/**
 * One limit, as Claude Code reported it. `key` is Claude Code's (`five_hour`, `seven_day`, `spend_limit`, …) and `label` the board's word
 * for it. `resetsAt` is ISO, null when the file gave none. `reset` is whether that time has passed since the reading: the window has
 * begun again, and its number is about the one before. `marked` is whether it is `QUOTA_MARK_PERCENT` used or more.
 */
export type QuotaWindow = { key: string; label: string; usedPercentage: number; resetsAt: string | null; reset: boolean; marked: boolean };

/**
 * The quota as the board is given it:
 *
 *   fresh       a reading with limits, younger than `staleAfterMs`: `windows` are to show
 *   stale       a reading with limits, older than that: `windows` are what it said, not to show as now
 *   none        a reading with no limits: the last session to write had none to report
 *   missing     no file: the statusline script is not installed, or no interactive session has answered since
 *   unreadable  a file that does not read as the script writes it
 *
 * `said` is the plain sentence for every case but `fresh`, with what to do. `writtenAt`, `ageMs` and `version` are the reading's, null
 * where there is none.
 */
export type Quota = {
  state: 'fresh' | 'stale' | 'none' | 'missing' | 'unreadable';
  file: string;
  writtenAt: string | null;
  ageMs: number | null;
  version: string | null;
  windows: QuotaWindow[];
  staleAfterMs: number;
  markAt: number;
  said: string | null;
};

const LABELS: Record<string, string> = { five_hour: '5-hour', seven_day: 'week', seven_day_sonnet: 'week, Sonnet', seven_day_opus: 'week, Opus', spend_limit: 'spend limit' };
/** Claude Code's two windows first, in this order, then whatever else it reported, as it came. */
const ORDER = ['five_hour', 'seven_day'];

const INSTALL = 'add the statusLine block in README.md (The quota on the board) to ~/.claude/settings.json';
const REFRESH = 'send a message in an interactive claude session signed in to the subscription';

/** `4 min`, `3 h`, `2 d`: how old a reading is, in its largest unit. */
export function ageWord(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

/** A time Claude Code gave in Unix seconds — or as an ISO string, should a version write one — as ISO, or null. */
function isoOf(at: unknown): string | null {
  const ms = typeof at === 'number' ? at * 1000 : typeof at === 'string' ? Date.parse(at) : NaN;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function windowsOf(limits: Record<string, unknown>, now: number): QuotaWindow[] {
  const keys = [...ORDER.filter((k) => k in limits), ...Object.keys(limits).filter((k) => !ORDER.includes(k))];
  return keys.flatMap((key) => {
    const w = limits[key] as { used_percentage?: unknown; resets_at?: unknown } | null;
    if (!w || typeof w !== 'object' || typeof w.used_percentage !== 'number' || !Number.isFinite(w.used_percentage)) return [];
    const resetsAt = isoOf(w.resets_at);
    return [{
      key,
      label: LABELS[key] ?? key.replaceAll('_', ' '),
      usedPercentage: w.used_percentage,
      resetsAt,
      reset: resetsAt !== null && Date.parse(resetsAt) <= now,
      marked: w.used_percentage >= QUOTA_MARK_PERCENT,
    }];
  });
}

/**
 * The quota, judged from the file's text — null for no file — at `now`. Pure: `readQuota` reads the file and hands it here.
 */
export function quotaOf(text: string | null, now: number, file: string): Quota {
  const base = { file, writtenAt: null, ageMs: null, version: null, windows: [], staleAfterMs: QUOTA_STALE_MS, markAt: QUOTA_MARK_PERCENT };
  if (text === null) {
    return { ...base, state: 'missing', said: `No quota read yet: nothing has written ${file}. To show it, ${INSTALL}, then ${REFRESH}.` };
  }
  const unreadable = (why: string): Quota => ({
    ...base,
    state: 'unreadable',
    said: `The quota could not be read: ${file} ${why}. The statusline script writes it again when you ${REFRESH}.`,
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return unreadable('is not JSON');
  }
  const r = parsed as { written_at?: unknown; claude_code_version?: unknown; rate_limits?: unknown } | null;
  const written = r && typeof r === 'object' && typeof r.written_at === 'string' ? Date.parse(r.written_at) : NaN;
  if (!r || !Number.isFinite(written)) return unreadable('has no written_at time');
  const limits = r.rate_limits;
  if (limits !== null && (typeof limits !== 'object' || Array.isArray(limits))) return unreadable('has rate_limits that are not an object');
  const ageMs = Math.max(0, now - written);
  const reading = { ...base, writtenAt: new Date(written).toISOString(), ageMs, version: typeof r.claude_code_version === 'string' ? r.claude_code_version : null };
  const windows = limits ? windowsOf(limits as Record<string, unknown>, now) : [];
  const age = ageWord(ageMs);
  if (!windows.length) {
    return {
      ...reading,
      state: 'none',
      said: `No plan limits to show: the last Claude Code session to write the quota, ${age} ago, reported none. An API-key session has none; ${REFRESH} to read them.`,
    };
  }
  if (ageMs > QUOTA_STALE_MS) {
    return {
      ...reading,
      windows,
      state: 'stale',
      said: `The quota was last read ${age} ago, older than ${ageWord(QUOTA_STALE_MS)}, so it is not shown: ${REFRESH} to read it again.`,
    };
  }
  return { ...reading, windows, state: 'fresh', said: null };
}

/** The quota as the file says it now. */
export function readQuota(now: number = Date.now(), file: string = quotaFile()): Quota {
  let text: string | null;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') return { ...quotaOf('', now, file), said: `The quota could not be read: ${file}: ${(err as Error).message}.` };
    text = null;
  }
  return quotaOf(text, now, file);
}
