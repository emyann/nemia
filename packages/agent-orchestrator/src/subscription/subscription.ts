/**
 * A subscription to the feed: a long-lived task the daemon tells what the feed says, at once for a line that needs judgement (a wake line)
 * and as one digest for routine news, said with the next wake or once `digestEvery` minutes have passed with none. The wake lines of one
 * read of the feed are told in one message.
 *
 * Pure: how `nemia watch` prints a line (`watchedLine`, `bookmarkLine` and the one cadence a silent watch says where it is at,
 * `BOOKMARK_EVERY`), what one read of the feed comes to (`readDelivered`), the words it is told (`messageOf`, `digestOf`), when a digest
 * falls due (`digestDue`), and the refusals of a subscription asked for (`subscribeRefusalOf`). What a line means for a subscriber is the
 * feed's one selector grammar (`selects`, `watch/selector.ts`), over the selectors its record holds; the conversion of a record that still
 * holds the former `wake` key is `former-wake.ts`.
 * The person's file and the deliverer's are `subscription.store.ts`'s, the deliverer is `deliver.verb.ts`, and the commands are
 * `subscription.verb.ts`.
 */
import { feedLineWords, type FeedLine } from '../feed/index.ts';
import { selectorsRefusal, selects, type Selectors } from '../watch/selector.ts';
import { elapsedMs, type Instant } from '../daemon/daemon.ts';
import { LEVELS, type Level } from '../level/level.ts';

/**
 * A subscription as a person asked for it: the task told (`task`), the selectors that wake it (`selectors`, the text a person typed, one
 * of which must take a line — never empty, which would take every line), the minutes a digest waits for a wake (`digestEvery`), the byte
 * of the feed its news starts from (`from`), the feed's size when it was asked for, and its `scope`: the level a run's factory is at least
 * at for its lines to be carried, absent where every line is.
 */
export type Subscription = { task: string; selectors: string[]; digestEvery: number; from: number; scope?: { atLeast: Level } };

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
 * What wakes a subscriber that names no selector of its own: the lines that wait on a person. One selector, over the key the tick stamps
 * off the feed's reason table (`waitsOf`), so the waking set is exactly the set the table says waits — the guarantee the seven wake words
 * carried, now held by `src/feed/reason.test.ts` over the conversion of them.
 */
export const DEFAULT_SELECTORS: readonly string[] = ['waits=person'];

/** The minutes a digest waits for a wake when the subscription names none. */
export const DEFAULT_DIGEST_EVERY = 60;

/** How `nemia watch` prints the feed: as JSON (`--json`), else in words. Which lines it prints is its selectors' (`selects`). */
export type Watched = { json?: boolean };

/**
 * A line of the feed as `nemia watch` prints it, `cursor` the byte just after it: in words (`feedLineWords`), or one JSON object, the line
 * whole with its cursor. Pure. Every line given is printed: a line its selectors do not take never reaches here.
 */
export const watchedLine = (line: FeedLine, cursor: number, how: Watched): string =>
  how.json === true ? JSON.stringify({ ...line, cursor }) : feedLineWords(line);

/**
 * How often a watch that has fallen silent says where it is: one cadence, read by every surface that follows the feed, so a watcher
 * resumes within this much of the feed wherever it watched from. Thirty seconds — a `--json` log gains two lines a minute while nothing
 * happens, and a watcher re-reads at most that much of a silent feed after a crash.
 */
export const BOOKMARK_EVERY = '30 seconds';

/**
 * The bookmark a silent watch prints at `cursor`: under `--json`, a line of its own carrying the cursor and nothing else — no `word`, so
 * a reader that filters the feed's words skips it; in words, nothing at all, since a person reading a still feed is told nothing by a
 * number. Pure.
 */
export const bookmarkLine = (cursor: number, how: Watched): string | undefined =>
  how.json === true ? JSON.stringify({ cursor }) : undefined;

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
 * feed order. Where one wakes (`selects`, over the subscription's parsed selectors), every wake line is said in one message, with the digest and every routine line of the read
 * riding it, and the digest is emptied; else each routine line is folded into the digest, begun at `now` where it was empty. Pure.
 */
export function readDelivered(
  at: Delivery,
  carried: readonly FeedLine[],
  selectors: Selectors,
  cursor: number,
  now: Instant,
): ReadDelivered {
  const wakes = carried.filter((l) => selects(selectors, l));
  const routine = carried.filter((l) => !selects(selectors, l));
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
export const SUBSCRIBE_FORM = 'nemia subscribe <name> <task> [-l <selector>]... [--digest-every <minutes>] [--at-least <level>]';

/** Why `name` is no subscription's name, or undefined where it is one. Pure. */
export const subscriptionNameRefusal = (name: string): string | undefined =>
  NAME.test(name)
    ? undefined
    : `${JSON.stringify(name)} is no subscription's name, which names its files: a letter or a digit, then letters, digits, - and _: ` +
      `${SUBSCRIBE_FORM}.`;

/**
 * Why a subscription asked for is refused before anything is read: a name that is none (`subscriptionNameRefusal`), a selector the feed's
 * grammar does not take (`selectorsRefusal`), minutes not above zero, or a floor that is no level — or undefined. Pure.
 */
export function subscribeRefusalOf({
  name,
  selectors,
  digestEvery,
  atLeast,
}: {
  name: string;
  selectors: readonly string[];
  digestEvery?: number;
  atLeast?: string;
}): string | undefined {
  const named = subscriptionNameRefusal(name);
  if (named) return named;
  const selected = selectorsRefusal(selectors);
  if (selected) return selected;
  if (digestEvery !== undefined && !(Number.isFinite(digestEvery) && digestEvery > 0))
    return `--digest-every takes the minutes a digest waits for a wake, above zero, and ${digestEvery} is not: ${SUBSCRIBE_FORM}.`;
  if (atLeast !== undefined && !(LEVELS as readonly string[]).includes(atLeast))
    return `--at-least takes a level, one of ${LEVELS.join(', ')}, and ${JSON.stringify(atLeast)} is none: ${SUBSCRIBE_FORM}.`;
  return undefined;
}
