/**
 * What a card waits on (`after:`): whether each card it names has released its waiters (`cardReleased`, proved by
 * `contracts/card-release.contract.ts`),
 * following its work through the cards its runs passed it on to (`cardWaitsOf`); a cycle of `after:` lines (`afterCycle`); and whether a
 * wait will never be released without a person (`waitStalled`). Read from the level on every pass and written nowhere. Pure: the listing
 * hands it what the store said (inbox.ts, inbox.verb.ts).
 */
import type { CardState } from 'objects';
import type { CardReleased, CardRelease, WaitedRun, WaitStalled } from '../../contracts/card-release.contract.ts';

export type { CardRelease } from '../../contracts/card-release.contract.ts';

/**
 * Where the work of one card another waits on stands: missing where the store knows nothing of it; released where a run of its own, or a
 * card its runs passed its work on to, has released its waiters (it succeeded, or a person released them); else waiting, at the first
 * card it was passed on to that still waits, else missing by
 * the first that is gone, else at itself.
 * @param card The card: its name, whether the store knows it, and the runs started from it, each with whether it released its waiters.
 * @param onward Where each card its runs passed its work on to stands, already judged by this same decision.
 * @public
 */
export const cardReleased: CardReleased = (card, onward) => {
  if (!card.known) return { kind: 'missing', card: card.name };
  if (card.runs.some((r) => r.released) || onward.some((o) => o.kind === 'released')) return { kind: 'released' };
  const at = onward.find((o) => o.kind === 'waiting');
  if (at !== undefined && at.kind === 'waiting') return { kind: 'waiting', card: at.card };
  const gone = onward.find((o) => o.kind === 'missing');
  if (gone !== undefined && gone.kind === 'missing') return { kind: 'missing', card: gone.card };
  return { kind: 'waiting', card: card.name };
};

/** The states of the card a wait stands at from which nothing the tick does releases it: a run ended without succeeding, or a start
 * refused. */
const ENDED_UNSUCCEEDED: readonly CardState[] = ['failed', 'stopped', 'cancelled', 'refused'];

/**
 * Whether a wait will never be released without a person: a name the store knows nothing of, a cycle, or a card whose run ended without
 * succeeding
 * or whose start was refused.
 * @param wait The wait's kind, and the state of the card it stands at as the inbox lists it (null where not read).
 */
export const waitStalled: WaitStalled = (wait) =>
  wait.kind !== 'waiting' || (wait.state !== null && ENDED_UNSUCCEEDED.includes(wait.state));

/** A card as the walk reads it: whether the store knows it, its runs with whether each released its waiters, and the cards its runs
 * passed work on to. */
export type CardLook = { readonly known: boolean; readonly runs: readonly WaitedRun[]; readonly onward: readonly string[] };

/** A card named in an `after:` that has not released its waiters, and where its work stands (`cardReleased`'s waiting or missing). */
type CardWaitOn = { readonly card: string; readonly release: Exclude<CardRelease, { kind: 'released' }> };

/**
 * The cards of `after` that have not released their waiters, in the order written, each with where its work stands: `cardReleased` asked
 * of each card, and
 * of each card its runs passed its work on to before it, each card read once (`look`) and a hand-off back to a card already on the way
 * passed over, so the walk ends whatever the hand-offs say.
 * @param after The names a card's `after:` gives.
 * @param look What the store and git say of a card, by name.
 */
export function cardWaitsOf(after: readonly string[], look: (name: string) => CardLook) {
  const judged = new Map<string, CardRelease>();
  const looked = new Map<string, CardLook>();
  const lookOnce = (name: string) => {
    const was = looked.get(name);
    if (was !== undefined) return was;
    const now = look(name);
    looked.set(name, now);
    return now;
  };
  const judge = (name: string, way: ReadonlySet<string>) => {
    const was = judged.get(name);
    if (was !== undefined) return was;
    const seen = lookOnce(name);
    const on = new Set([...way, name]);
    const onward: CardRelease[] = seen.onward.filter((o) => !on.has(o)).map((o) => judge(o, on));
    const release: CardRelease = cardReleased({ name, known: seen.known, runs: seen.runs }, onward);
    judged.set(name, release);
    return release;
  };
  return after.flatMap((card) => {
    const release = judge(card, new Set());
    return release.kind === 'released' ? [] : [{ card, release } satisfies CardWaitOn];
  });
}

/**
 * The route of `after:` lines from the card `name` back to itself, the shortest, breadth first — `[name, …, name]` — or undefined where
 * none leads back.
 * @param name The card whose `after:` is followed.
 * @param afterOf The names a card's `after:` gives, by its name; none for a card the inbox does not have.
 */
export function afterCycle(name: string, afterOf: (name: string) => readonly string[]) {
  const cameFrom = new Map<string, string>();
  const queue = [...afterOf(name)];
  for (const next of queue) if (!cameFrom.has(next)) cameFrom.set(next, name);
  for (const at of queue) {
    if (at === name) return routeBack(name, cameFrom);
    const fresh = afterOf(at).filter((next) => !cameFrom.has(next));
    for (const next of fresh) cameFrom.set(next, at);
    queue.push(...fresh);
  }
  return undefined;
}

/** The route from `name` back to itself, `[name, …, name]`, read back through where each card on it was reached from. */
function routeBack(name: string, cameFrom: ReadonlyMap<string, string>) {
  const route = [name];
  for (let back = cameFrom.get(name); back !== undefined && back !== name; back = cameFrom.get(back)) route.unshift(back);
  return [name, ...route];
}
