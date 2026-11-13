/**
 * Which try a drawn step shows (`tryShown`, src/lib/tryAddress.ts). Each step of a run keeps its own choice: it opens on its current try,
 * and a try chosen in its picker, or set by a packet or a finding that points at it, is kept in the address (`?try=<step>:<n>,…`) and
 * shown wherever the step is drawn. A try the address names that the step does not have (a stale link, a pruned run) is no choice, and
 * the step shows its current try, or its last where the record names none current.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** Whether `n` is one of the step's tries (`===`, as the board compares numbers). */
const has = (tries: readonly number[], n: number): boolean => tries.some((t) => t === n);

const tryShownSpec = spec<(tries: readonly number[], current: number | null, asked: number | null) => number | null>({
  /** A try's number is a whole number, as the api counts tries: never NaN, which no try equals. */
  requires: ({ input: [tries] }) => tries.every((t) => Number.isInteger(t)),
  ensures: {
    noneWithoutTries: {
      description: 'A step with no try shows none',
      condition: ({ input: [tries], output }) => tries.length > 0 || output === null,
    },
    oneOfItsTries: {
      description: 'A step with tries shows one of them',
      condition: ({ input: [tries], output }) => tries.length === 0 || (output !== null && has(tries, output)),
    },
    theAddressKeepsTheChoice: {
      description: 'A try the address names that the step has is the one shown',
      condition: ({ input: [tries, , asked], output }) => asked === null || !has(tries, asked) || output === asked,
    },
    currentFirst: {
      description: 'With no choice it has, the step shows its current try',
      condition: ({ input: [tries, current, asked], output }) =>
        (asked !== null && has(tries, asked)) || current === null || !has(tries, current) || output === current,
    },
    elseItsLast: {
      description: 'With no choice it has and no current try among its tries, the step shows its last',
      condition: ({ input: [tries, current, asked], output }) =>
        (asked !== null && has(tries, asked)) ||
        (current !== null && has(tries, current)) ||
        tries.length === 0 ||
        output === tries.at(tries.length - 1),
    },
  },
});

/** `tryShown`'s type, which src/lib/tryAddress.ts takes. */
export type TryShown = Implementation<typeof tryShownSpec>;
