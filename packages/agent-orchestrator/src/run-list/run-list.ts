/**
 * The pure parts of a run's list on the generic path: a run's namespace (`runNamespace`, proved by contracts/run-namespace.contract.ts),
 * the factory its record names, `default` for one that names none, as a card's is; the list's `?fieldSelector=`, one term on
 * `status.state` (`runStateSelector`, proved by contracts/run-state-selector.contract.ts); and the order of the finished runs a list
 * asked by `status.state=finished` answers (`finishedBefore`, proved by contracts/finished-order.contract.ts), with the `continue` token
 * that names a place in it (`finishedToken`, `finishedAfter`) and the page it cuts (`finishedPageOf`).
 */
import { DEFAULT_NAMESPACE, LIST_PAGE, type PageBounds, RUN_STATES, type RunState } from 'objects';
import type { FinishedBefore, FinishedKey } from '../../contracts/finished-order.contract.ts';
import type { RunNamespace } from '../../contracts/run-namespace.contract.ts';
import type { RunStateSelector, RunStateSelectorOf } from '../../contracts/run-state-selector.contract.ts';
import { badLimit, listPage, type PageAsked, type Paged } from '../object/page.ts';
import { Invalid } from '../refusal/refusal.ts';
import { nameFirst } from './name-order.ts';

export type { FinishedKey, RunStateSelector };

/** The namespace of a run whose record names `factory`: that factory, or `default` for none. */
export const runNamespace: RunNamespace = (factory) => factory ?? DEFAULT_NAMESPACE;

/** The field a run's list is selected by. */
const FIELD = 'status.state';

/** `word` as a run's state, or null where it is none. */
const stateOf = (word: string): RunState | null => RUN_STATES.find((s) => s === word) ?? null;

/** The selector `text` spells (`RunStateSelector`): `status.state`, then `==`, `!=` or `=`, then a run's state; null for anything else. */
export const runStateSelector: RunStateSelectorOf = (text) => {
  if (!text.startsWith(FIELD)) return null;
  const rest = text.slice(FIELD.length);
  const operator = rest.startsWith('==') ? '==' : rest.startsWith('!=') ? '!=' : rest.startsWith('=') ? '=' : null;
  if (operator === null) return null;
  const state = stateOf(rest.slice(operator.length));
  return state === null ? null : { state, equal: operator !== '!=' };
};

/** Whether the finished run at `a` comes before the one at `b`: newest first by when its work stopped, two together by name. */
export const finishedBefore: FinishedBefore = (a, b) =>
  a.finishedMs !== b.finishedMs ? a.finishedMs > b.finishedMs : nameFirst(a.name, b.name);

/** A finished run's place in its list: its name, and when its work stopped (ISO), as its status says `finishedAt`. */
export type Finished = { readonly name: string; readonly finishedAt: string };

/** The finished order's mark on a `continue` token: a name-order token is base64url alone, which holds no `.`. */
const FINISHED_MARK = 'f.';

/** Where `run` stands in the finished order (`FinishedKey`). */
const keyOf = (run: Finished): FinishedKey => ({ finishedMs: Date.parse(run.finishedAt), name: run.name });

/** The `continue` token that asks for the finished runs after `run`: `f.`, then the base64url of `[finishedAt, name]` as JSON. */
export const finishedToken = (run: Finished): string =>
  FINISHED_MARK + Buffer.from(JSON.stringify([run.finishedAt, run.name]), 'utf8').toString('base64url');

/** The token's refusal: it names the fix. */
const badFinishedToken = (token: string): Invalid =>
  new Invalid({
    message: `continue ${JSON.stringify(token)} is no token of the finished runs' list (fieldSelector=status.state=finished): pass the continue its last page's metadata answered, as it is, or leave continue out to read from the newest`,
  });

/** The place `token` was made of (`finishedToken`), or `Invalid` where it is none: a name-order token among them. */
export const finishedAfter = (token: string): Finished | Invalid => {
  const body = token.slice(FINISHED_MARK.length);
  if (!token.startsWith(FINISHED_MARK) || !/^[A-Za-z0-9_-]+$/.test(body)) return badFinishedToken(token);
  let read: unknown;
  try {
    read = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return badFinishedToken(token);
  }
  if (!Array.isArray(read) || read.length !== 2) return badFinishedToken(token);
  const [finishedAt, name]: unknown[] = read;
  if (typeof finishedAt !== 'string' || typeof name !== 'string' || !Number.isFinite(Date.parse(finishedAt)))
    return badFinishedToken(token);
  const place = { name, finishedAt };
  return finishedToken(place) === token ? place : badFinishedToken(token);
};

/**
 * The page `asked` cuts of `sorted`, the finished runs in their order (`finishedBefore`): it starts at the first run the token's place
 * comes before, so the next page holds what followed the last one answered though that one is gone, and is cut by `listPage` within
 * `bounds` (`LIST_PAGE` unless a test shortens them). `Invalid` for a limit `listPage` refuses or a token that is no finished token.
 */
export const finishedPageOf = <T extends Finished>(
  sorted: readonly T[],
  asked: PageAsked,
  bounds: PageBounds = LIST_PAGE,
): Paged<T> | Invalid => {
  const after = asked.continue === undefined ? undefined : finishedAfter(asked.continue);
  if (after instanceof Invalid) return after;
  const found = after === undefined ? 0 : sorted.findIndex((run) => finishedBefore(keyOf(after), keyOf(run)));
  const start = found === -1 ? sorted.length : found;
  const cut = listPage(sorted.length, start, asked.limit, bounds);
  if ('refused' in cut) return badLimit(asked.limit);
  const items = sorted.slice(cut.from, cut.to);
  const last = items.at(-1);
  return {
    items,
    remainingItemCount: cut.remainingItemCount,
    ...(cut.more && last !== undefined ? { continue: finishedToken(last) } : {}),
  };
};

/** `a` before `b` in the finished order, as a sort's comparator reads it. */
export const byFinishedPlace = (a: Finished, b: Finished): number =>
  finishedBefore(keyOf(a), keyOf(b)) ? -1 : finishedBefore(keyOf(b), keyOf(a)) ? 1 : 0;
