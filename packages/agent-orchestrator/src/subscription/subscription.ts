/**
 * A subscription to the feed: a long-lived task the daemon tells what the feed says, at once for a line that needs judgement (a wake line)
 * and as one digest for routine news, said with the next wake or once `digestEvery` minutes have passed with none.
 *
 * Pure: what a line means for a subscriber (`sortLine`), the words it is told (`messageOf`, `digestOf`), when a digest falls due
 * (`digestDue`), and the refusals of a subscription asked for (`subscribeRefusalOf`). The person's file and the deliverer's are
 * `subscription.store.ts`'s, the deliverer is `deliver.verb.ts`, and the commands are `subscription.verb.ts`.
 */
import { feedLineWords, type FeedLine } from '../feed/feed.ts';
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

/** The routine lines said under a heading, one a line with its time, and how many there are. */
const digestLines = (lines: readonly FeedLine[]): string[] => [
  `${lines.length} routine line${lines.length === 1 ? '' : 's'} of the feed:`,
  ...lines.map((l) => `  ${feedLineWords(l)}`),
];

/**
 * What a subscriber is told of a wake line: the line, and under it the digest that rides it, when it holds any line. Pure.
 */
export const messageOf = (line: FeedLine, digest: readonly FeedLine[]): string =>
  [
    'The feed needs your judgement:',
    `  ${feedLineWords(line)}`,
    ...(digest.length ? ['', 'Since your last news:', ...digestLines(digest)] : []),
  ].join('\n');

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
