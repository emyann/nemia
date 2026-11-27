/**
 * What `nemia channel` says of its own liveness, from what it observed and nothing more: a stretch its own process did not run (the
 * time since its last beat far past its reconnect interval, a wall-clock jump), no answer from the api while it ran, and, once the watch
 * is open again, what the lines written meanwhile show (a `DaemonStarted` among them or none, how many, and those that wait on a person).
 * It names no cause it cannot see: never asleep, the network or the server down. Pure: each time is handed in, so a test injects the clock.
 */
import type { Event } from 'objects';

/** How far past its last beat the channel must be before it says its own process did not run: far longer than `RECONNECT_EVERY`. */
export const RAN_GAP_AFTER_MS = 60_000;

/** A stretch the channel's process did not run: its last beat before, and the first after, in milliseconds since the epoch. */
export type Gap = { readonly from: number; readonly to: number };

/**
 * The stretch the channel did not run between two beats, none where the second came within `RAN_GAP_AFTER_MS` of the first.
 * @param lastRan When the channel last beat.
 * @param now When it beats now.
 */
export const gapOf = (lastRan: number, now: number) =>
  now - lastRan > RAN_GAP_AFTER_MS ? ({ from: lastRan, to: now } satisfies Gap) : undefined;

/** The zones whose clock is UTC's, said as UTC. */
const UTC_ZONES = new Set(['UTC', 'Etc/UTC', 'Etc/GMT', 'GMT', 'Etc/Universal', 'Etc/Zulu']);

/** The person's time zone as this process resolves it, none where it is UTC or unknown. */
export const zoneOf = () => {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zone === undefined || zone === '' || UTC_ZONES.has(zone) ? undefined : zone;
};

/**
 * `ms` as a person reads a time: in `zone` where the channel knows it ("9:22 PM"), else UTC, said as UTC ("02:22 UTC").
 * @param ms The instant, in milliseconds since the epoch.
 * @param zone The person's time zone, none where it is unknown or UTC.
 */
export function clockOf(ms: number, zone: string | undefined) {
  if (zone === undefined) return `${new Date(ms).toISOString().slice(11, 16)} UTC`;
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: zone }).format(ms);
}

/**
 * A length of time as a person reads it: "45 s", "30 min", "2 h 5 min".
 * @param ms The length, in milliseconds.
 */
export function lastedOf(ms: number) {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return `${Math.round(ms / 1000)} s`;
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest === 0 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 60)} h ${rest} min`;
}

/** What a notice of the channel carries: its words, and its attributes. */
export type LivenessNotice = { readonly content: string; readonly meta: Readonly<Record<string, string>> };

/** What the channel observed when it lost the api. */
export type Lost = {
  readonly base: string;
  readonly at: number;
  readonly why: string;
  readonly every: string;
  readonly gap: Gap | undefined;
  readonly zone: string | undefined;
};

/**
 * The `down` notice: where the channel's own process did not run (`gap`), that stretch with its two times; else that it has had no
 * answer from the api since `at`. Either way what the request came to, and that it tries again.
 * @param lost What the channel observed: the api's url, when, what the request came to, its interval, a gap, the person's zone.
 */
export function downNotice(lost: Lost) {
  const { base, at, why, every, gap, zone } = lost;
  const again = `It tries again every ${every}, and sends what was written meanwhile.`;
  const since = { notice: 'down', base, since: new Date(at).toISOString() };
  const stopped: Readonly<Record<string, string>> =
    gap === undefined ? {} : { stopped_from: new Date(gap.from).toISOString(), stopped_to: new Date(gap.to).toISOString() };
  const meta: Readonly<Record<string, string>> = { ...since, ...stopped };
  const content =
    gap === undefined
      ? `The channel has had no answer from ${base} since ${clockOf(at, zone)} (${why}). ${again}`
      : `The channel did not run from ${clockOf(gap.from, zone)} to ${clockOf(gap.to, zone)} (its clock jumped ${lastedOf(gap.to - gap.from)}), ` +
        `and has had no answer from ${base} since (${why}). ${again}`;
  return { content, meta } satisfies LivenessNotice;
}

/** What the channel read once the api answered again. */
export type Found = {
  readonly base: string;
  readonly from: string;
  readonly held: readonly Event[];
  readonly restarts: readonly Event[] | undefined;
  readonly zone: string | undefined;
};

/** What the `DaemonStarted` lines written meanwhile show: the times the daemon restarted, that it did not, or that they were not read. */
function restartsSaid(restarts: readonly Event[] | undefined, zone: string | undefined) {
  if (restarts === undefined) return "The channel could not read whether the server's daemon restarted in that time.";
  if (restarts.length === 0) return "The server's daemon did not restart in that time.";
  const times = restarts.map((e) => clockOf(Date.parse(e.metadata.creationTimestamp), zone));
  return `The server's daemon restarted at ${times.join(', ')}.`;
}

/** Each run and step among `held` whose last line waits on a person, one line each, in the order they were written. */
function waitingSaid(held: readonly Event[]) {
  const last = new Map<string, Event>();
  for (const e of held) {
    last.delete(e.involved.name);
    last.set(e.involved.name, e);
  }
  const waiting = [...last.values()].filter((e) => e.waits === 'person');
  if (waiting.length === 0) return 'None of them waits on a person.';
  return ['Waiting on a person:', ...waiting.map((e) => `- ${e.involved.kind} ${e.involved.name} (${e.reason}): ${e.message}`)].join('\n');
}

/**
 * The `up` notice: the api answers again; how many lines were written meanwhile and from which cursor; whether the daemon restarted, as
 * the `DaemonStarted` lines of that stretch show; and each run and step among those lines that waits on a person.
 * @param found What the channel read: the api's url, the cursor it went on from, the lines held, the daemon's starts, the person's zone.
 */
export function upNotice(found: Found) {
  const { base, from, held, restarts, zone } = found;
  const lines = held.length === 1 ? '1 line was' : `${held.length} lines were`;
  const content = [
    `${base} answers again. ${lines} written meanwhile, after resourceVersion ${from}. ${restartsSaid(restarts, zone)}`,
    ...(held.length === 0 ? [] : [waitingSaid(held)]),
  ].join('\n');
  const restarted = restarts === undefined ? 'unknown' : restarts.length === 0 ? 'no' : 'yes';
  const last = restarts?.at(-1);
  const meta: Readonly<Record<string, string>> = {
    notice: 'up',
    base,
    after: from,
    caught_up: String(held.length),
    restarted,
    ...(last === undefined ? {} : { restarted_at: last.metadata.creationTimestamp }),
  };
  return { content, meta } satisfies LivenessNotice;
}
