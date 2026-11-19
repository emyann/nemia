/**
 * The try each drawn step shows, and the address that keeps it (`?try=<step>:<n>,<step>:<n>`): `tryShown` decides the try (proved by
 * `contracts/try-shown.contract.ts`), `triesOf` and `triesPrinted` read and write the address's value, `trySearch` validates it at the
 * root beside `bar`, and `setTry` changes one step's choice and keeps the others'. Pure.
 */
import type { TryShown } from '../../contracts/try-shown.contract.ts';

/** Whether `n` is one of `tries`. */
const has = (tries: readonly number[], n: number) => tries.some((t) => t === n);

/**
 * The try a step shows, of its tries' numbers: the one the address asks where the step has it, else its current, else its last; none for
 * a step with no try.
 * @param tries The numbers of the step's tries, in order.
 * @param current The step's current try, or null where it has none.
 * @param asked The try the address asks for the step, or null where it asks none.
 */
export const tryShown: TryShown = (tries, current, asked) => {
  if (asked !== null && has(tries, asked)) return asked;
  if (current !== null && has(tries, current)) return current;
  return tries.at(tries.length - 1) ?? null;
};

/** Each step's chosen try, by the step's name. */
export type TryChoices = Readonly<Record<string, number>>;

/** A try's number as the address writes it: a whole number from 1, in digits. */
const TRY = /^[1-9]\d*$/;

/**
 * The choices `value` names, `<step>:<n>` joined by `,`, each split at its last `:` (a step's name may hold one); an entry with no step,
 * or whose try is not a whole number from 1, is dropped, and a step named twice keeps its last. None for anything but a string.
 * @param value The address's `try` value, as the router hands it.
 */
export function triesOf(value: unknown) {
  if (typeof value !== 'string') return {};
  const choices: Record<string, number> = {};
  for (const entry of value.split(',')) {
    const at = entry.lastIndexOf(':');
    const n = entry.slice(at + 1);
    if (at > 0 && TRY.test(n)) choices[entry.slice(0, at)] = Number(n);
  }
  return choices;
}

/**
 * How `choices` is written in the address, which `triesOf` reads back; '' for none.
 * @param choices Each step's chosen try, by the step's name.
 */
export const triesPrinted = (choices: TryChoices) =>
  Object.entries(choices)
    .map(([step, n]) => `${step}:${n}`)
    .join(',');

/**
 * The root route's `try`: the choices it names, written again without what was dropped; none where it names none.
 * @param search The root route's search, as the router hands it.
 */
export function trySearch(search: Record<string, unknown>) {
  const printed = triesPrinted(triesOf(search.try));
  return (printed ? { try: printed } : {}) satisfies { try?: string } as { try?: string };
}

/**
 * `search` with the step `step` showing try `n`, in its place among the choices, or its choice taken back where `n` is null, every other
 * step's choice kept and every other key of the search too; `try` left out once no step has a choice.
 * @param search The page's search.
 * @param step The step's name.
 * @param n The try the step shows, or null to take its choice back.
 */
export function setTry<S extends { try?: string }>(search: S, step: string, n: number | null) {
  const choices = triesOf(search.try);
  const { [step]: _was, ...others } = choices;
  const printed = triesPrinted(n === null ? others : { ...choices, [step]: n });
  const { try: _try, ...rest } = search;
  return (printed ? { ...rest, try: printed } : rest) as S;
}
