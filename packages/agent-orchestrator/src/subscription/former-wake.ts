/**
 * The subscription record's former key, `wake`, converted to selectors on every read, and the refusal of the flags that typed one.
 *
 * A subscription's filter was once a list of words, and a line woke it where one of them was found in the line's word or led a part of
 * its note, whatever the case: the prose a line's word and note were matched on, which no selector reads. Eight such words were ever
 * shipped — the seven of the package's own default and `denied:` beside them in Nemia's — and `FORMER_WAKE` says what each was really
 * selecting: a reason of the feed's closed table (`reason.ts`), or the `waits` a note carried. A stored list is turned into selectors
 * every time it is read (`subscription.store.ts`), never rewritten, as the package turns a v0 feed line (`upgraded`) and a renamed step
 * key (`FORMER_KEYS`).
 *
 * **The conversion never selects fewer lines, and for two words selects more.** `waiting on you:` and `needs:` read a note's prose, which
 * no selector does: they convert to `waits=person`, which takes every line the tick writes a wait on a person for — the two words' own
 * lines among them, and the lines of a waiting reason besides. `src/feed/reason.test.ts` holds that as a superset over every word the
 * package writes.
 *
 * A word this table does not know is a person's own prose, which selects nothing a line's keys can name: it converts to nothing, the rest
 * of its list still converts, and the store says the dropped word once (the owner's decision at this slice's gate).
 *
 * Pure, and this folder's: it goes the day no store holds a `wake` key.
 */
import { waitsOf, type Reason } from '../feed/index.ts';
import { SELECTOR_FORM } from '../watch/selector.ts';

/** What one shipped wake word was really selecting: the reasons whose lines its prose found, or the wait a note it led carried. */
type Selecting = { readonly reasons?: readonly Reason[]; readonly waits?: true };

/**
 * Every wake word the package ever shipped, and what it selected. Typed by `Reason`, so a reason renamed in the feed's table fails the
 * typecheck here rather than leaving a stored subscription quoting a code the feed no longer names.
 *
 * `failed` names two reasons: it was a substring of a word, so it found `failed` and `failed ✗ check (exit 1)` alike.
 */
export const FORMER_WAKE: Readonly<Record<string, Selecting>> = {
  'awaiting approval': { reasons: ['AwaitingApproval'] },
  'rounds exhausted': { reasons: ['RoundsExhausted'] },
  'needs-human': { reasons: ['NeedsHuman'] },
  blocked: { reasons: ['Blocked'] },
  failed: { reasons: ['Failed', 'CheckFailed'] },
  'waiting on you:': { waits: true },
  'needs:': { waits: true },
  'denied:': { reasons: ['ToolDenied'] },
};

/** The words in the order the table names them, which is the order a converted reason selector lists its reasons in. */
const WORDS: readonly string[] = Object.keys(FORMER_WAKE);

/** The wake list a subscription held when it named none of its own: the seven words of the package's own default. */
export const FORMER_DEFAULT_WAKE: readonly string[] = [
  'awaiting approval',
  'rounds exhausted',
  'needs-human',
  'blocked',
  'failed',
  'waiting on you:',
  'needs:',
];

/** The wake list Nemia's keeper put: the package's seven, and a step's calls denied. */
export const FORMER_NEMIA_WAKE: readonly string[] = [...FORMER_DEFAULT_WAKE, 'denied:'];

/** `reasons` as one selector of the feed's lines: `reason=X` for one of them, `reason in (X,Y)` for several. */
const reasonSelector = (reasons: readonly Reason[]): string =>
  reasons.length === 1 ? `reason=${reasons[0]}` : `reason in (${reasons.join(',')})`;

/** The word as the table keys one, whatever the case and the spaces a person typed it with: the prose match folded both. */
const asKeyed = (word: string): string => word.trim().toLowerCase();

/**
 * The selectors a stored wake list `wake` comes to, and the words of it none names (`unconverted`): `waits=person` where a word of it read
 * a note that waits, and one reason selector for the reasons the rest named, in table order and each once, less every reason that waits
 * where `waits=person` is already there — which is what makes the seven shipped words exactly `['waits=person']` and Nemia's eight exactly
 * her two selectors.
 *
 * A list no word of which converts comes to no selector at all, which the store reads as a subscription to leave out: an empty list of
 * selectors takes every line, where an empty wake list took none.
 */
export function selectorsOfWake(wake: readonly string[]): { selectors: string[]; unconverted: string[] } {
  const asked = wake.map(asKeyed);
  const named = WORDS.filter((word) => asked.includes(word));
  const waits = named.some((word) => FORMER_WAKE[word].waits === true);
  const reasons: Reason[] = [];
  for (const word of named) for (const reason of FORMER_WAKE[word].reasons ?? []) if (!reasons.includes(reason)) reasons.push(reason);
  const kept = waits ? reasons.filter((reason) => !waitsOf(reason)) : reasons;
  return {
    selectors: [...(waits ? ['waits=person'] : []), ...(kept.length ? [reasonSelector(kept)] : [])],
    unconverted: wake.filter((word) => FORMER_WAKE[asKeyed(word)] === undefined),
  };
}

/** The flags retired with the wake words, each refused by name wherever it was typed. */
const RETIRED: readonly string[] = ['--wake', '--wake-word'];

/**
 * Why `arg`, typed to `command` (`nemia watch`, `nemia subscribe`), is a flag that no longer exists — or undefined where it is none of
 * them. A line's prose is no longer matched: the message names the selector to type for the lines that wait on a person, and the keys a
 * selector takes. Pure, and asked first by the command's `unknown`.
 */
export function retiredWakeRefusal(command: string, arg: string): string | undefined {
  const flag = arg.split('=')[0];
  if (!RETIRED.includes(flag)) return undefined;
  return (
    `${command} no longer takes ${flag}: the feed's lines are no longer matched on their prose but selected by the keys they name — ` +
    `type -l waits=person for the lines that wait on a person, or -l reason=<code> for one reason. ${SELECTOR_FORM}`
  );
}
