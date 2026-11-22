/**
 * What a card waits on (`after:`): whether each card it names has landed (`cardLanded`, proved by `contracts/card-landing.contract.ts`),
 * following its work through the cards its runs passed it on to (`cardWaitsOf`); a cycle of `after:` lines (`afterCycle`); and whether a
 * wait will never be released without a person (`waitStuck`). Read from the level on every pass and written nowhere. Pure: the listing
 * hands it what the store and git said (inbox.ts, inbox.verb.ts).
 */
import type { CardState } from 'objects';
import type { CardLanded, CardLanding, WaitedRun, WaitStuck } from '../../contracts/card-landing.contract.ts';

export type { CardLanding, ListedWait, WaitedCard, WaitedRun } from '../../contracts/card-landing.contract.ts';

/**
 * Where the work of one card another waits on stands: missing where the store knows nothing of it; landed where a run of its own, or a
 * card its runs passed its work on to, has landed; else waiting, at the first card it was passed on to that still waits, else missing by
 * the first that is gone, else at itself.
 * @param card The card: its name, whether the store knows it, and the runs started from it, each with whether it landed.
 * @param onward Where each card its runs passed its work on to stands, already judged by this same decision.
 */
export const cardLanded: CardLanded = (card, onward) => {
  if (!card.known) return { kind: 'missing', card: card.name };
  if (card.runs.some((r) => r.landed) || onward.some((o) => o.kind === 'landed')) return { kind: 'landed' };
  const at = onward.find((o) => o.kind === 'waiting');
  if (at !== undefined && at.kind === 'waiting') return { kind: 'waiting', card: at.card };
  const gone = onward.find((o) => o.kind === 'missing');
  if (gone !== undefined && gone.kind === 'missing') return { kind: 'missing', card: gone.card };
  return { kind: 'waiting', card: card.name };
};

/** The states of the card a wait stands at from which nothing the tick does lands it: a run ended unlanded, or a start refused. */
const ENDED_UNLANDED: readonly CardState[] = ['succeeded', 'failed', 'stopped', 'cancelled', 'refused'];

/**
 * Whether a wait will never be released without a person: a name the store knows nothing of, a cycle, or a card whose run ended unlanded
 * or whose start was refused.
 * @param wait The wait's kind, and the state of the card it stands at as the inbox lists it (null where not read).
 */
export const waitStuck: WaitStuck = (wait) => wait.kind !== 'waiting' || (wait.state !== null && ENDED_UNLANDED.includes(wait.state));

/** A card as the walk reads it: whether the store knows it, its runs with whether each landed, and the cards its runs passed work on to. */
export type CardLook = { readonly known: boolean; readonly runs: readonly WaitedRun[]; readonly onward: readonly string[] };

/** A card named in an `after:` that has not landed, and where its work stands (`cardLanded`'s waiting or missing). */
export type CardWaitOn = { readonly card: string; readonly landing: Exclude<CardLanding, { kind: 'landed' }> };

/**
 * The cards of `after` that have not landed, in the order written, each with where its work stands: `cardLanded` asked of each card, and
 * of each card its runs passed its work on to before it, each card read once (`look`) and a hand-off back to a card already on the way
 * passed over, so the walk ends whatever the hand-offs say.
 * @param after The names a card's `after:` gives.
 * @param look What the store and git say of a card, by name.
 */
export function cardWaitsOf(after: readonly string[], look: (name: string) => CardLook) {
  const judged = new Map<string, CardLanding>();
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
    const onward: CardLanding[] = seen.onward.filter((o) => !on.has(o)).map((o) => judge(o, on));
    const landing: CardLanding = cardLanded({ name, known: seen.known, runs: seen.runs }, onward);
    judged.set(name, landing);
    return landing;
  };
  return after.flatMap((card) => {
    const landing = judge(card, new Set());
    return landing.kind === 'landed' ? [] : [{ card, landing } satisfies CardWaitOn];
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
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i];
    if (at === undefined) break;
    if (at === name) {
      const route = [name];
      for (let back = cameFrom.get(name); back !== undefined && back !== name; back = cameFrom.get(back)) route.unshift(back);
      route.unshift(name);
      return route;
    }
    for (const next of afterOf(at)) {
      if (cameFrom.has(next)) continue;
      cameFrom.set(next, at);
      queue.push(next);
    }
  }
  return undefined;
}
