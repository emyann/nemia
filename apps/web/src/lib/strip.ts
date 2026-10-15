/**
 * The numbers of the Overview's strip (`OverviewStrip`): the factories' day, what is at work against the machine's caps, the agents at
 * work and when the quota runs out. Pure: the instant, the day's start and the time zone are handed in, the browser's own on the page.
 */
import type { Ceilings, Factory, QuotaWindow, RunSummary } from './api';
import { keptBy } from './factories.ts';
import { inFlight, titleOf, waitsOnYou } from './factory.ts';
import { clockWord } from './quota.ts';
import { stepState } from './status.ts';

/** The rows of agents at work the strip shows before it says how many more there are. */
export const ROWS_SHOWN = 3;

/** One step at work by an agent: who, which step of which run, and since when, in whole minutes and in words. */
export type AgentRow = { agent: string; step: string; run: string; title: string; minutes: number; atWork: string };

/**
 * The strip's numbers. `waitsOnYou` and `inFlight` are the open runs, a run that waits on a person counted with the waiting alone;
 * `landed` and `failed` the runs whose work stopped since the day began; `spentUsd` what every run worked today cost, whole;
 * `perLanding` the mean cost of a landing today whose cost was measured, null before the first. `runs` and `sessions` are at work against their caps, null where
 * the machine has none. `agents` are the agents at work against those hired in the factories in view, `hired` null where none is; `rows`
 * the steps at work, longest first, the first `ROWS_SHOWN`, and `more` how many are left out.
 */
export type Strip = {
  waitsOnYou: number;
  inFlight: number;
  landed: number;
  failed: number;
  spentUsd: number;
  perLanding: number | null;
  runs: { count: number; cap: number | null };
  sessions: { count: number; cap: number | null };
  agents: { count: number; hired: number | null };
  rows: AgentRow[];
  more: number;
};

/** What the strip reads: the whole list, the factories, the caps, now and the day's start in epoch ms, and the factory in view if any. */
export type StripIn = {
  runs: readonly RunSummary[];
  factories: readonly Factory[];
  ceilings: Ceilings | undefined;
  now: number;
  dayStart: number;
  factory?: string;
};

/** The start of the day `now` is in, midnight in the time zone the process runs in: the browser's on the page. */
export const dayStartOf = (now: number): number => {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
};

/** When a finished run's work stopped: the later of its last task's end and its cancellation, else its creation (the api's own rule). */
export const finishedAtOf = (run: Pick<RunSummary, 'atWork' | 'cancelledAt' | 'createdAt'>): string => {
  const ends = [run.atWork?.endedAt ?? null, run.cancelledAt].filter((at): at is string => at !== null);
  return ends.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? run.createdAt;
};

/** How a finished run ended (the api's own rule): called off, its result undecided, landed, or failed. */
export const outcomeOf = (
  run: Pick<RunSummary, 'cancelledAt' | 'toDecide' | 'status'>,
): 'cancelled' | 'undecided' | 'succeeded' | 'failed' => {
  if (run.cancelledAt) return 'cancelled';
  if (run.toDecide?.kind === 'result') return 'undecided';
  return run.status === 'succeeded' ? 'succeeded' : 'failed';
};

/** Minutes at work in words: `17m`, `2h 5m`. */
export const minutesWord = (minutes: number): string =>
  minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`;

/** A cap as the readout says it: none where it is zero or unknown. */
const capOf = (cap: number | null | undefined): number | null => (cap ? cap : null);

/** A run's whole cost, nothing where none was measured. */
const usdOf = (run: RunSummary): number => run.cost?.usd ?? 0;

/** Whether an open run was worked since the day began: a task of it runs, or its last one ended today. */
const workedToday = (run: RunSummary, dayStart: number): boolean =>
  Boolean(run.atWork?.since) || (run.atWork?.endedAt != null && Date.parse(run.atWork.endedAt) >= dayStart);

/** The distinct agents hired in the factories in view, every factory where none is; null where none is hired. */
const hiredIn = (factories: readonly Factory[], factory: string | undefined): number | null => {
  const names = new Set(factories.filter((f) => factory === undefined || f.name === factory).flatMap((f) => Object.values(f.hires)));
  return names.size || null;
};

/** Whether a step of `run` is at work: a session working or the run's check of it, as the board draws its state (`stepState`). */
const working = (run: RunSummary, step: RunSummary['steps'][number]): boolean => {
  const state = stepState(step.status, false, run.holding != null);
  return state === 'working' || state === 'checking';
};

/** The steps of `open` at work by an agent, longest first. */
const rowsOf = (open: readonly RunSummary[], now: number): AgentRow[] =>
  open
    .flatMap((run) =>
      run.steps.flatMap((step) => {
        if (step.agent === null || step.since === null || !working(run, step)) return [];
        const minutes = Math.max(0, Math.floor((now - Date.parse(step.since)) / 60_000));
        return [{ agent: step.agent, step: step.name, run: run.id, title: titleOf(run), minutes, atWork: minutesWord(minutes) }];
      }),
    )
    .sort((a, b) => b.minutes - a.minutes || a.run.localeCompare(b.run) || a.step.localeCompare(b.step));

/** The sessions at work in `open`: each step working or checking, a held run's that a hold did not stop among them. */
const sessionsOf = (open: readonly RunSummary[]): number =>
  open.reduce((n, run) => n + run.steps.filter((step) => working(run, step)).length, 0);

/**
 * The strip's numbers off what the page reads (`StripIn`), of the factory in view (`keptBy`): a run called off is in no open count, and
 * counts in Spent alone once its work stopped today.
 */
export function stripOf(given: StripIn): Strip {
  const runs = given.runs.filter(keptBy(given.factory));
  const waiting = runs.filter((run) => waitsOnYou(run));
  const flying = runs.filter((run) => !run.cancelledAt && !waitsOnYou(run) && inFlight(run));
  const finishedToday = runs.filter((run) => !waitsOnYou(run) && !inFlight(run) && Date.parse(finishedAtOf(run)) >= given.dayStart);
  const landed = finishedToday.filter((run) => outcomeOf(run) === 'succeeded');
  const priced = landed.filter((run) => run.cost !== null);
  const open = [...waiting, ...flying];
  const worked = [...open.filter((run) => workedToday(run, given.dayStart)), ...finishedToday];
  const rows = rowsOf(open, given.now);
  return {
    waitsOnYou: waiting.length,
    inFlight: flying.length,
    landed: landed.length,
    failed: finishedToday.filter((run) => outcomeOf(run) === 'failed').length,
    spentUsd: worked.reduce((sum, run) => sum + usdOf(run), 0),
    perLanding: priced.length ? priced.reduce((sum, run) => sum + usdOf(run), 0) / priced.length : null,
    runs: { count: flying.length, cap: capOf(given.ceilings?.cap) },
    sessions: { count: sessionsOf(open), cap: capOf(given.ceilings?.last?.sessions) },
    agents: { count: new Set(rows.map((row) => row.agent)).size, hired: hiredIn(given.factories, given.factory) },
    rows: rows.slice(0, ROWS_SHOWN),
    more: Math.max(0, rows.length - ROWS_SHOWN),
  };
}

/**
 * An amount in dollars as a sticker says it, never more than four figures wide below $10,000, so the six stickers keep one line: whole from
 * $10, to the cent below; `—` for none.
 */
export const dollars = (usd: number | null): string => (usd === null ? '—' : usd >= 10 ? `$${Math.round(usd)}` : `$${usd.toFixed(2)}`);

/** The readout of what is at work: `5 OF 7 RUNS · 2 OF 50 SESSIONS`, a part with no cap said without its `OF`. */
export const readoutOf = ({ runs, sessions }: Pick<Strip, 'runs' | 'sessions'>): string => {
  const part = (count: number, cap: number | null, noun: string) => `${count}${cap === null ? '' : ` OF ${cap}`} ${noun}`;
  return `${part(runs.count, runs.cap, 'RUNS')} · ${part(sessions.count, sessions.cap, 'SESSIONS')}`;
};

/** How long each window of the quota lasts, by Claude Code's key: the five hours, and the weeks. */
const WINDOW_MS: ReadonlyArray<readonly [RegExp, number]> = [
  [/^five_hour$/, 5 * 3_600_000],
  [/^seven_day/, 7 * 86_400_000],
];

/**
 * When a window is used up at the pace it has been used so far, in epoch ms: from its length (`WINDOW_MS`) and its reset, the time it
 * has run; null for a window of no known length, with no reset, unused, reset since the reading, or that resets before it runs out.
 */
export const runsOutAt = (w: QuotaWindow, now: number): number | null => {
  const length = WINDOW_MS.find(([key]) => key.test(w.key))?.[1];
  if (length === undefined || w.resetsAt === null || w.reset || w.usedPercentage <= 0) return null;
  const resets = Date.parse(w.resetsAt);
  const ran = length - (resets - now);
  if (!(ran > 0)) return null;
  const out = now + ((100 - w.usedPercentage) * ran) / w.usedPercentage;
  return out < resets ? out : null;
};

/**
 * The quota's line under its meters: when it runs out, if a window would before it resets — the soonest — and when that window resets;
 * else when the window used most resets. Null where no window says when it resets.
 */
export function quotaLineOf(
  windows: readonly QuotaWindow[],
  now: number,
  timeZone?: string,
): { runsOut: string | null; resets: string } | null {
  const at = (ms: number) => clockWord(new Date(ms), new Date(now), timeZone);
  const out = windows
    .map((w) => ({ w, out: runsOutAt(w, now) }))
    .filter((x): x is { w: QuotaWindow; out: number } => x.out !== null)
    .sort((a, b) => a.out - b.out)[0];
  if (out) return { runsOut: `Runs out about ${at(out.out)}`, resets: `resets ${at(Date.parse(out.w.resetsAt!))}` };
  const most = [...windows].filter((w) => w.resetsAt !== null).sort((a, b) => b.usedPercentage - a.usedPercentage)[0];
  return most ? { runsOut: null, resets: `${most.reset ? 'reset' : 'resets'} ${at(Date.parse(most.resetsAt!))}` } : null;
}
