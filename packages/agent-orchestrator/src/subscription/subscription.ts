/**
 * A subscription to the feed: a long-lived task the daemon tells what the feed says, at once for a line that needs judgement (a wake line)
 * and as one digest for routine news, said with the next wake or once `digestEvery` minutes have passed with none. The wake lines of one
 * read of the feed are told in one message.
 *
 * Pure: what a line means for a subscriber (`sortLine`) and for `nemia watch` (`wakeOf`, `watchedLine`), what one read of the feed comes
 * to (`readDelivered`), the words it is told (`messageOf`, `digestOf`), when a digest falls due (`digestDue`), and the refusals of a
 * subscription asked for (`subscribeRefusalOf`).
 * The person's file and the deliverer's are `subscription.store.ts`'s, the deliverer is `deliver.verb.ts`, and the commands are
 * `subscription.verb.ts`.
 */
import type { Args } from '../command/command.ts';
import { feedLineWords, type FeedLine } from '../feed/index.ts';
import { elapsedMs, type Instant } from '../daemon/daemon.ts';
import { LEVELS, type Level } from '../level/level.ts';

/**
 * A subscription as a person asked for it: the task told (`task`), the words that wake it (`wake`), the minutes a digest waits for a wake
 * (`digestEvery`), the byte of the feed its news starts from (`from`), the feed's size when it was asked for, and its `scope`: the level
 * a run's factory is at least at for its lines to be carried, absent where every line is.
 */
export type Subscription = { task: string; wake: string[]; digestEvery: number; from: number; scope?: { atLeast: Level } };

/**
 * Where the deliverer is with a subscription: the byte of the feed it has delivered or folded every line before (`cursor`), the routine
 * lines folded and not yet said (`digest`), and when the first of them was folded (`since`), absent while the digest is empty.
 */
export type Delivery = { cursor: number; digest: FeedLine[]; since?: Instant };

/** The deliverer's file: where it is (`Delivery`), and the task and the `from` of the subscription it was written for (`of`). */
export type KeptDelivery = Delivery & { of: { task: string; from: number } };

/**
 * Where the deliverer starts a subscription: where its file says, when the file was written for this subscription; else from its `from`,
 * as a file left by another of the same name, a deliverer's that had not yet stopped, is none of its.
 */
export const resumedAt = (kept: KeptDelivery | undefined, sub: Subscription): Delivery =>
  kept && kept.of.task === sub.task && kept.of.from === sub.from
    ? { cursor: kept.cursor, digest: kept.digest, ...(kept.since ? { since: kept.since } : {}) }
    : { cursor: sub.from, digest: [] };

/**
 * The words that wake a subscriber when it names none: each word of the feed for a line that waits on a person. A step at its
 * gate (`awaiting approval`), a loop out of rounds (`rounds exhausted`), a session waiting on its harness's prompt (`needs-human`), a step
 * or run that signed off or stopped blocked (`blocked`) or failed (`failed`), and the notes of a run that waits on a person
 * (`waiting on you:`) and of a blocked sign-off (`needs:`).
 */
export const DEFAULT_WAKE: readonly string[] = [
  'awaiting approval',
  'rounds exhausted',
  'needs-human',
  'blocked',
  'failed',
  'waiting on you:',
  'needs:',
];

/** The minutes a digest waits for a wake when the subscription names none. */
export const DEFAULT_DIGEST_EVERY = 60;

/**
 * Whether `line` wakes a subscriber woken by `wake`, or joins its digest: a wake word found in the line's word, or leading one of the parts
 * of its note (` · ` between them), whatever their case. Pure.
 */
export function sortLine(line: FeedLine, wake: readonly string[]): 'wake' | 'routine' {
  const word = line.word.toLowerCase();
  const notes = (line.note ?? '').split(' · ').map((part) => part.trim().toLowerCase());
  const woken = wake.map((w) => w.toLowerCase()).some((w) => word.includes(w) || notes.some((part) => part.startsWith(w)));
  return woken ? 'wake' : 'routine';
}

/** How `nemia watch` prints the feed: as JSON (`--json`), and only the lines a wake word in `wake` finds (`--wake`, `--wake-word`). */
export type Watched = { json?: boolean; wake?: readonly string[] };

/**
 * The wake words of `nemia watch`'s arguments: `DEFAULT_WAKE` for `--wake`, and each `--wake-word` beside them — or undefined for
 * neither, where every line is printed.
 */
export function wakeOf(args: Args): readonly string[] | undefined {
  const words = [...(args.wake === true ? DEFAULT_WAKE : []), ...((args.wakeWord as readonly string[] | undefined) ?? [])];
  return words.length > 0 ? words : undefined;
}

/**
 * A line of the feed as `nemia watch` prints it, `cursor` the byte just after it: in words (`feedLineWords`), or one JSON object, the line
 * whole with its cursor — or undefined where the watch keeps the wake lines and a wake word finds none in it (`sortLine`). Pure.
 */
export function watchedLine(line: FeedLine, cursor: number, how: Watched): string | undefined {
  if (how.wake !== undefined && sortLine(line, how.wake) !== 'wake') return undefined;
  return how.json === true ? JSON.stringify({ ...line, cursor }) : feedLineWords(line);
}

/** The routine lines said under a heading, one a line with its time, and how many there are. */
const digestLines = (lines: readonly FeedLine[]): string[] => [
  `${lines.length} routine line${lines.length === 1 ? '' : 's'} of the feed:`,
  ...lines.map((l) => `  ${feedLineWords(l)}`),
];

/**
 * What a subscriber is told of the wake lines of one read: each line in the order given, and under them the digest that rides them, when it
 * holds any line. Pure.
 */
export const messageOf = (lines: readonly FeedLine[], digest: readonly FeedLine[]): string =>
  [
    'The feed needs your judgement:',
    ...lines.map((l) => `  ${feedLineWords(l)}`),
    ...(digest.length ? ['', 'Since your last news:', ...digestLines(digest)] : []),
  ].join('\n');

/** What one read of the feed comes to: its message, where a line wakes, the wake lines it holds, and where the deliverer is next. */
export type ReadDelivered = { message?: string; wakes: number; next: Delivery };

/**
 * What one read of the feed, ending at `cursor`, comes to for a subscriber at `at`, given the lines it carries of that read (`carried`), in
 * feed order. Where one wakes (`sortLine`), every wake line is said in one message, with the digest and every routine line of the read
 * riding it, and the digest is emptied; else each routine line is folded into the digest, begun at `now` where it was empty. Pure.
 */
export function readDelivered(
  at: Delivery,
  carried: readonly FeedLine[],
  wake: readonly string[],
  cursor: number,
  now: Instant,
): ReadDelivered {
  const wakes = carried.filter((l) => sortLine(l, wake) === 'wake');
  const routine = carried.filter((l) => sortLine(l, wake) === 'routine');
  const digest = [...at.digest, ...routine];
  if (wakes.length) return { message: messageOf(wakes, digest), wakes: wakes.length, next: { cursor, digest: [] } };
  if (!routine.length) return { wakes: 0, next: { ...at, cursor } };
  return { wakes: 0, next: { cursor, digest, since: at.since ?? now } };
}

/** What a subscriber is told of routine news with no wake to ride: the digest, one line each, and its count. Pure. */
export const digestOf = (lines: readonly FeedLine[]): string =>
  ['News from the feed, nothing waiting on you:', ...digestLines(lines)].join('\n');

/**
 * Whether a digest begun at `since` is due at `now`, `everyMinutes` minutes after it (`elapsedMs`): never while it is empty (no `since`).
 * Pure.
 */
export const digestDue = (since: Instant | undefined, everyMinutes: number, now: Instant): boolean =>
  since !== undefined && elapsedMs(since, now) >= everyMinutes * 60_000;

/** A subscription's name: what its files are named after, a letter or digit first, then letters, digits, `-` and `_`. */
const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** The usage the refusals of a subscription end on. */
export const SUBSCRIBE_FORM = 'nemia subscribe <name> <task> [--wake <word>]... [--digest-every <minutes>] [--at-least <level>]';

/** Why `name` is no subscription's name, or undefined where it is one. Pure. */
export const subscriptionNameRefusal = (name: string): string | undefined =>
  NAME.test(name)
    ? undefined
    : `${JSON.stringify(name)} is no subscription's name, which names its files: a letter or a digit, then letters, digits, - and _: ` +
      `${SUBSCRIBE_FORM}.`;

/**
 * Why a subscription asked for is refused before anything is read: a name that is none (`subscriptionNameRefusal`), a wake word empty,
 * minutes not above zero, or a floor that is no level — or undefined. Pure.
 */
export function subscribeRefusalOf({
  name,
  wake,
  digestEvery,
  atLeast,
}: {
  name: string;
  wake: readonly string[];
  digestEvery?: number;
  atLeast?: string;
}): string | undefined {
  const named = subscriptionNameRefusal(name);
  if (named) return named;
  if (wake.some((w) => !w.trim())) return `--wake takes a word that wakes the subscriber, and one given is empty: ${SUBSCRIBE_FORM}.`;
  if (digestEvery !== undefined && !(Number.isFinite(digestEvery) && digestEvery > 0))
    return `--digest-every takes the minutes a digest waits for a wake, above zero, and ${digestEvery} is not: ${SUBSCRIBE_FORM}.`;
  if (atLeast !== undefined && !(LEVELS as readonly string[]).includes(atLeast))
    return `--at-least takes a level, one of ${LEVELS.join(', ')}, and ${JSON.stringify(atLeast)} is none: ${SUBSCRIBE_FORM}.`;
  return undefined;
}
