/**
 * The subscription's quota as the board shows it, read off the engine's `quota` verb (`Engine.quota`), which asks Claude Code itself: the
 * `claude` on the api's PATH, sent its `get_usage` control request (packages/agent-orchestrator/docs/features.md, *the quota on the
 * board*). This file starts no process.
 *
 * Nothing asks unless a board asks. A read (`makeQuota`) answers from the last ask while it is younger than `QUOTA_KEEP_MS`, counted from
 * when the ask began; otherwise from an ask begun within the keep of the read — the one in flight, or one started after it, one at a time —
 * and waits for it at most `QUOTA_WAIT_MS` before it says `asking`.
 * An answer in which Anthropic's usage service gave Claude Code nothing (`unanswered`) is kept longer, and longer again each time in a row
 * (`backoffOf`), until a good reading. What it holds is in the asker's memory (`QuotaAsker`, one for an app) and nowhere else, judged
 * against the time of each request: a restart costs one ask. Every age it decides on — a keep, a wait, whether a read joins the ask in
 * flight — is measured on the process's monotonic clock, which no step of the wall clock moves; what a person reads (`askedAt`, `ageMs`,
 * `againAt`, `last`) is on the wall clock.
 */
import { Context, Layer } from 'effect';
import type { HarnessQuota, QuotaLimit } from 'agent-orchestrator';

/**
 * How long an ask's outcome is kept, a failure's as much as a good reading's: ten minutes, six asks an hour while a board is open. The
 * windows are five hours and a week long, and a number read ten minutes ago says as much about them as one read three minutes ago; the
 * usage endpoint behind `get_usage` is reported to refuse an account that asks in bursts, for hours, and every board open on this api
 * shares one ask. `HKB_QUOTA_KEEP_MS` sets it (the e2e's 0 asks on every read).
 */
export const QUOTA_KEEP_MS = 10 * 60 * 1000;

/**
 * How long an `unanswered` outcome is kept the first time in a row: twenty minutes, twice the keep, so that a service limiting how often it
 * is asked is asked half as often at once; each such answer in a row doubles the wait, to `QUOTA_BACKOFF_CEILING_MS`, and a good reading
 * begins it again (`backoffOf`). `HKB_QUOTA_BACKOFF_MS` sets it (the e2e's 0 asks on every read).
 */
export const QUOTA_BACKOFF_MS = 20 * 60 * 1000;

/**
 * The longest an `unanswered` outcome is kept: four hours — 20, 40, 80 and 160 minutes, then four hours for as long as it lasts, five asks
 * in the first five hours and six a day after. Longer, and a service that answers again is not read for most of a five-hour window.
 */
export const QUOTA_BACKOFF_CEILING_MS = 4 * 60 * 60 * 1000;

/**
 * How long the last good reading is shown, dimmed, beside a state that has no windows of its own: six hours. Past that its five-hour window
 * is certainly one that has begun again, and the week's number is more than a day of steady use behind; it goes.
 */
export const QUOTA_LAST_MS = 6 * 60 * 60 * 1000;

/**
 * How long a request waits for an ask before it answers `asking`: the Factory's loader waits on a slow harness this long, no longer.
 * `HKB_QUOTA_WAIT_MS` sets it: with a keep shorter than an ask lasts, a wait shorter than the ask leaves every read `asking`.
 */
export const QUOTA_WAIT_MS = 2_000;

/** A window used this much or more, in percent, is marked. */
export const QUOTA_MARK_PERCENT = 80;

/**
 * One limit, as Claude Code reported it. `key` is Claude Code's (`five_hour`, `seven_day`, …) and `label` the board's word for it.
 * `resetsAt` is ISO, null when none was given. `reset` is whether that time has passed since the reading: the window has begun again, and
 * its number is about the one before. `marked` is whether it is `QUOTA_MARK_PERCENT` used or more.
 */
export type QuotaWindow = { key: string; label: string; usedPercentage: number; resetsAt: string | null; reset: boolean; marked: boolean };

/**
 * The quota as the board is given it:
 *
 *   fresh      the plan's windows, from an answer younger than `keepMs`: `windows` are to show
 *   asking     no answer held, and one asked for: said so, and read again soon
 *   no-plan    Claude Code here has no plan limits: it is not signed in to a Claude subscription
 *   unanswered Claude Code is signed in to a subscription, and Anthropic's usage service gave it nothing: `rate_limits_available` true and
 *              `rate_limits` null. Claude Code 2.1.278 answers so when the service's body is an error ("Usage fetch returned a fieldless or
 *              non-object body (in-band error)" in its --debug log), which may be the service limiting how often it is asked: kept by
 *              `backoffOf`, not the keep
 *   no-claude  there is no `claude` on the api's PATH
 *   timeout    Claude Code did not answer in time
 *   failed     Claude Code ended before it answered, or the engine would not ask it (`rejected`), each said in its own words
 *   unknown    it answered in a shape this code does not read: an error for the request, or no window it can read
 *
 * `said` is the plain sentence for every case but `fresh`, with what to do. `askedAt` and `ageMs` are the held ask's, null while none is;
 * `againAt` is when a read will next ask, null while none is held. `last` is the last answer that had windows, when the state is not
 * `fresh` and it is younger than `QUOTA_LAST_MS`: shown dimmed, with its time, and never as now.
 */
export type Quota = {
  state: 'fresh' | 'asking' | 'no-plan' | 'unanswered' | 'no-claude' | 'timeout' | 'failed' | 'unknown';
  askedAt: string | null;
  ageMs: number | null;
  againAt: string | null;
  subscription: string | null;
  windows: QuotaWindow[];
  last: { askedAt: string; windows: QuotaWindow[] } | null;
  keepMs: number;
  markAt: number;
  said: string | null;
};

const LABELS: Record<string, string> = {
  five_hour: '5-hour',
  seven_day: 'week',
  seven_day_sonnet: 'week, Sonnet',
  seven_day_opus: 'week, Opus',
};
/**
 * The windows the board shows, in this order: the plan's own. Claude Code's answer holds many more keys, most null and some named for no
 * one (`nimbus_quill`, at 0% with no reset), so a key it does not know is not shown.
 */
const ORDER = Object.keys(LABELS);

const SEE = 'get_usage is experimental: see README.md, The quota on the board';

/** `15 s`, `4 min`, `3 h`, `1 h 20 min`, `2 d`: how long — a part of a second is a second, and minutes beside hours under two days. */
export function ageWord(ms: number): string {
  const sec = Math.ceil(Math.max(0, ms) / 1000);
  if (sec < 60) return `${sec} s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h >= 48) return `${Math.floor(h / 24)} d`;
  return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
}

/**
 * The windows the board shows, of the plan's `limits`, at `now`: in the board's order, each with its label, a key it does not know left
 * out.
 */
function windowsOf(limits: readonly QuotaLimit[], now: number): QuotaWindow[] {
  return Object.entries(LABELS).flatMap(([key, label]) => {
    const limit = limits.find((l) => l.key === key);
    if (!limit) return [];
    const at = limit.resetsAt === null ? NaN : Date.parse(limit.resetsAt);
    return [
      {
        key,
        label,
        usedPercentage: limit.usedPercentage,
        resetsAt: limit.resetsAt,
        reset: Number.isFinite(at) && at <= now,
        marked: limit.usedPercentage >= QUOTA_MARK_PERCENT,
      },
    ];
  });
}

/** What an outcome says to the board: its state, its sentence but for when it is asked again (null when `fresh`), its windows and plan. */
export type Read = Pick<Quota, 'state' | 'subscription' | 'windows'> & { said: string | null };

/** An answer in a shape the board does not read, `what` saying what it found. */
const unknownRead = (what: string): Read => ({
  state: 'unknown',
  subscription: null,
  windows: [],
  said: `Claude Code answered the usage request in a shape this board does not read: ${what}. ${SEE}.`,
});

/** What the api holds of an ask: the engine's answer, or the words the engine rejected the ask with. */
export type Asked = HarnessQuota | { kind: 'rejected'; said: string };

/**
 * What the engine's answer says to the board, judged at `now` for the windows' resets: the plan's windows (`fresh`), or why there are none,
 * with what to do. Pure. A plan none of whose limits is a window the board shows is `unknown`.
 */
export function readOf(asked: Asked, now: number): Read {
  const none = { subscription: null, windows: [] };
  switch (asked.kind) {
    case 'missing':
      return {
        ...none,
        state: 'no-claude',
        said: "The quota cannot be asked for: there is no claude on the api's PATH. Install Claude Code, or start the api from a shell where claude runs.",
      };
    case 'timeout':
      return {
        ...none,
        state: 'timeout',
        said: `Claude Code did not answer the usage request within ${ageWord(asked.ms)}: run claude -p in a shell where the api runs to see why.`,
      };
    case 'failed': {
      const how = asked.code !== null ? `exit ${asked.code}` : asked.signal ? `killed by ${asked.signal}` : 'it did not start';
      return {
        ...none,
        state: 'failed',
        said: `Claude Code stopped before it answered the usage request (${how}${asked.said ? `: ${asked.said}` : ''}). Run claude -p in a shell where the api runs to see why.`,
      };
    }
    case 'rejected':
      return {
        ...none,
        state: 'failed',
        said: `The api's engine would not ask Claude Code for the quota (${asked.said}): this is the engine refusing, not Claude Code failing, so running claude will not show why. Restart the api; if the board says it again, the engine the api runs has no claude harness that answers a quota: see README.md, The quota on the board.`,
      };
    case 'no-plan':
      return {
        ...none,
        state: 'no-plan',
        said: "No plan limits to show: the Claude Code the api runs is not signed in to a Claude subscription (an API key, or another provider). Run claude, then /login with the subscription's account, under the api's CLAUDE_CONFIG_DIR.",
      };
    case 'unanswered':
      return {
        ...none,
        state: 'unanswered',
        subscription: asked.subscription,
        said: `Claude Code is signed in to a subscription${asked.subscription ? ` (${asked.subscription})` : ''}, but Anthropic's usage service gave it nothing this time. The service may be limiting how often it is asked, so the board waits longer before each ask until it answers.`,
      };
    case 'unknown':
      return unknownRead(asked.what);
    case 'windows': {
      const windows = windowsOf(asked.limits, now);
      if (!windows.length) return unknownRead(`none of its rate_limits (${ORDER.join(', ')}) has a numeric utilization`);
      return { state: 'fresh', subscription: asked.subscription, windows, said: null };
    }
  }
}

/**
 * An ask's outcome, and when its ask began: the ms since the epoch. `keptMs` is how long it is kept when that is not the keep: an
 * `unanswered` outcome's wait (`backoffOf`).
 */
export type Held = { asked: Asked; at: number; keptMs?: number };

/**
 * How long the `streak`th `unanswered` outcome in a row is kept: `firstMs`, doubled for each one before it in the row, never past
 * `QUOTA_BACKOFF_CEILING_MS` — nor under `firstMs`, should it be set higher than the ceiling.
 */
export function backoffOf(streak: number, firstMs: number = QUOTA_BACKOFF_MS): number {
  return Math.min(firstMs * 2 ** Math.max(0, streak - 1), Math.max(firstMs, QUOTA_BACKOFF_CEILING_MS));
}

/**
 * The quota, judged at `now` from the ask held — null while none is, and one is being asked — and the last answer that had windows, shown
 * while younger than `QUOTA_LAST_MS`. Pure: a quota asker (`makeQuota`) holds both and hands them here.
 */
export function quotaOf(held: Held | null, last: Held | null, now: number, keepMs: number = QUOTA_KEEP_MS): Quota {
  const lastRead = last && now - last.at <= QUOTA_LAST_MS ? readOf(last.asked, now) : null;
  const keptMs = held?.keptMs ?? keepMs;
  const base = {
    askedAt: held && new Date(held.at).toISOString(),
    ageMs: held && Math.max(0, now - held.at),
    againAt: held && new Date(held.at + keptMs).toISOString(),
    last: last && lastRead?.state === 'fresh' ? { askedAt: new Date(last.at).toISOString(), windows: lastRead.windows } : null,
    keepMs,
    markAt: QUOTA_MARK_PERCENT,
  };
  if (!held) return { ...base, state: 'asking', subscription: null, windows: [], said: 'Asking Claude Code for the quota…' };
  const read = readOf(held.asked, now);
  if (read.state === 'fresh') return { ...base, ...read, last: null };
  const left = held.at + keptMs - now;
  return {
    ...base,
    ...read,
    said: `${read.said} ${left >= 60_000 ? `Asked again in ${ageWord(left)}.` : 'Asked again on the next read.'}`,
  };
}

/** A length of time from `env[name]`, in ms: a number 0 or more, or `fallback` for anything else. */
const msOf = (env: NodeJS.ProcessEnv, name: string, fallback: number): number => {
  const value = env[name];
  const ms = Number(value);
  return value !== undefined && value !== '' && Number.isFinite(ms) && ms >= 0 ? ms : fallback;
};

/**
 * A read of the quota: how the quota is asked (`ask`, the engine's `quota` in the api), of which harness (`harness`: each is held apart,
 * one ask at a time each, and a read that names none shares one of its own), and what the read is judged against: the environment its
 * keeps and its wait are read from (`env`, `HKB_QUOTA_KEEP_MS`, `HKB_QUOTA_BACKOFF_MS` and `HKB_QUOTA_WAIT_MS` on each read), how long it
 * waits for an ask (`waitMs`, else `HKB_QUOTA_WAIT_MS`), the wall clock a person reads the times on (`now`), and the monotonic clock every
 * age the asker decides on is measured on (`mono`, `performance.now()` unless given).
 */
export type ReadQuota = (opts: {
  ask: () => Promise<HarnessQuota>;
  harness?: string;
  waitMs?: number;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  mono?: () => number;
}) => Promise<Quota>;

/** An ask that rejected, as the board holds it: `rejected`, with what it rejected with. */
const rejected = (e: unknown): Asked => ({ kind: 'rejected', said: e instanceof Error ? e.message : String(e) });

/**
 * An ask of the quota, as an asker holds it: when it began on the monotonic clock — when the harness was started, and read the world it
 * answers about — null while it waits behind the one in flight; whether it has come back; and what settles once it has.
 */
type Flight = { began: number | null; done: boolean; settled: Promise<void> };

/** The two clocks an ask is stamped with: the wall clock a person reads (`now`), and the monotonic one its age is judged on (`mono`). */
type Clocks = { now: () => number; mono: () => number };

/** Waits for `settled` at most `ms`. */
const waitFor = async (settled: Promise<void>, ms: number): Promise<void> => {
  let wait: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      settled,
      new Promise((r) => {
        wait = setTimeout(r, ms);
      }),
    ]);
  } finally {
    clearTimeout(wait);
  }
};

/** An ask's outcome as an asker holds it: `began` is when its ask began on the monotonic clock, which its keep is counted from. */
type Kept = Held & { began: number };

/**
 * A quota asker with nothing held, as a fresh api has, one for each harness a read names (`ReadQuota`'s `harness`): what it holds is the
 * last ask's outcome, the last with windows, how many `unanswered` outcomes in a row since it, the ask in flight and the one queued behind
 * it, in its own memory and nobody's file. Every age it judges is on the monotonic clock (`mono`): a wall clock stepped back makes no held
 * answer younger, nor an ask begun before a read one begun after it.
 *
 * Its read says the quota as the request should: from what is held while it is younger than its keep — the keep, or an `unanswered`
 * outcome's wait — counted from when its ask began; otherwise from an ask begun within the keep of the read (with a keep of 0, only one
 * begun after it), waited for at most `waitMs`, and `asking` past that. That ask is the one in flight when it began within the keep,
 * else the one queued behind it, else one started now, or queued behind the one in flight: one ask at a time, and the reads that come
 * while it waits share it. A reading with windows begins the backoff again; each `unanswered` one in a row lengthens it (`backoffOf`);
 * another failure between two `unanswered` answers neither ends it nor adds to it.
 */
export function makeQuota(): ReadQuota {
  const each = new Map<string, ReadQuota>();
  return (opts) => {
    const key = opts.harness ?? '';
    const read = each.get(key) ?? oneQuota();
    each.set(key, read);
    return read(opts);
  };
}

/** One harness's asker, as `makeQuota` describes it. */
function oneQuota(): ReadQuota {
  let held: Kept | null = null;
  let good: Held | null = null;
  let unanswered = 0;
  let running: Flight | null = null;
  let queued: Flight | null = null;
  const hold = (asked: Asked, at: number, began: number, backoffMs: number) => {
    const read = readOf(asked, at).state;
    if (read === 'fresh') unanswered = 0;
    if (read === 'unanswered') unanswered += 1;
    held = read === 'unanswered' ? { asked, at, began, keptMs: backoffOf(unanswered, backoffMs) } : { asked, at, began };
    if (read === 'fresh') good = held;
  };
  const begin = (flight: Flight, ask: () => Promise<HarnessQuota>, clocks: Clocks, backoffMs: number): Promise<void> => {
    const at = clocks.now();
    const began = clocks.mono();
    flight.began = began;
    running = flight;
    return ask()
      .catch(rejected)
      .then((asked) => hold(asked, at, began, backoffMs))
      .finally(() => {
        flight.done = true;
        if (running === flight) running = null;
      });
  };
  const flightFor = (started: number, keepMs: number, go: (flight: Flight) => Promise<void>): Flight => {
    if (running !== null && running.began !== null && started - running.began < keepMs) return running;
    if (queued !== null) return queued;
    const flight: Flight = { began: null, done: false, settled: Promise.resolve() };
    const before = running;
    if (before === null) flight.settled = go(flight);
    else {
      queued = flight;
      const start = () => {
        queued = null;
        return go(flight);
      };
      flight.settled = before.settled.then(start, start);
    }
    return flight;
  };
  return async ({
    ask,
    env = process.env,
    waitMs = msOf(env, 'HKB_QUOTA_WAIT_MS', QUOTA_WAIT_MS),
    now = () => Date.now(),
    mono = () => performance.now(),
  }) => {
    const keepMs = msOf(env, 'HKB_QUOTA_KEEP_MS', QUOTA_KEEP_MS);
    const backoffMs = msOf(env, 'HKB_QUOTA_BACKOFF_MS', QUOTA_BACKOFF_MS);
    if (held === null || mono() - held.began >= (held.keptMs ?? keepMs)) {
      const flight = flightFor(mono(), keepMs, (f) => begin(f, ask, { now, mono }, backoffMs));
      await waitFor(flight.settled, waitMs);
      if (!flight.done) return quotaOf(null, good, now(), keepMs);
    }
    return quotaOf(held, good, now(), keepMs);
  };
}

/**
 * How long the daemon's read waits for its ask: thirty seconds, past the fifteen the runtime gives `get_usage` before it answers
 * `timeout`, so the daemon is told what the ask came to rather than `asking`, which it would record nothing of.
 */
export const QUOTA_DAEMON_WAIT_MS = 30_000;

/**
 * A board's quota as the runtime words an answer: a `fresh` one's windows, as the board shows them, keys the board does not know left out;
 * any other state an answer with no windows, which the daemon records nothing of. Pure.
 */
export function harnessQuotaOf(q: Quota): HarnessQuota {
  if (q.state !== 'fresh') return { kind: 'unknown', what: `the board's quota is ${q.state}` };
  const limits = q.windows.map(({ key, usedPercentage, resetsAt }) => ({ key, usedPercentage, resetsAt }));
  return { kind: 'windows', limits, subscription: q.subscription };
}

/**
 * The daemon's ask of `harness`'s quota, through `read`, the asker the boards read (`QuotaAsker`), so a board and the daemon reading the
 * same harness share one keep, one backoff and one ask in flight: `ask` reaches the engine only when the asker would for a board, and
 * its read waits `QUOTA_DAEMON_WAIT_MS`.
 */
export const daemonQuota =
  (read: ReadQuota, harness: string, ask: () => Promise<HarnessQuota>) =>
  (env: NodeJS.ProcessEnv = process.env): Promise<HarnessQuota> =>
    read({ ask, harness, env, waitMs: QUOTA_DAEMON_WAIT_MS }).then(harnessQuotaOf);

/** The quota asker every board's read shares, one for an app (`live`, a fresh `makeQuota`): a test gives its own with `layer`. */
export class QuotaAsker extends Context.Service<QuotaAsker, ReadQuota>()('api/QuotaAsker') {
  static readonly live: Layer.Layer<QuotaAsker> = Layer.sync(QuotaAsker)(makeQuota);
  static readonly layer = (read: ReadQuota): Layer.Layer<QuotaAsker> => Layer.succeed(QuotaAsker)(read);
}
