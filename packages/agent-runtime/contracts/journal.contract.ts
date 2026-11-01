/**
 * The Task door's rules for one append (agent-runtime, src/core/engine/append-refusal.ts, `appendRefusal`): what `Journal.layer`
 * asks before any store is written. A task is opened by its filing alone, once, under an id a file can be named by, and its attempts
 * number from 1 with no gap (the model's `Task`, `model.ts`). The laws speak of the task as the door holds it, never of the code.
 *
 * Whether the id can name a file is given as `taskIdRefusal`'s answer (`model.ts`), which the door passes: the verifier cannot read
 * that function's byte count, so the decider is handed its words rather than trusting it. The walk `append.malformed-id`
 * (`test/journal-walks.ts`) holds that the door passes them.
 */
import { spec, type Implementation } from '@emyann/tsverify';
import type { AppendRefusalReason } from '../src/core/engine/append-refusal.ts';

/** The most attempts a task may count, past which a count plus one would round: `Number.MAX_SAFE_INTEGER`. */
const MOST_STARTS = 9_007_199_254_740_991;

/** What the door holds of the task before the append: whether it has a journal, and how many attempts it started. */
type Held = { readonly journal: boolean; readonly started: number };
/** The append, as the door reads it: its kind, and its attempt where it has one. */
type Appended = { readonly kind: string; readonly attempt?: number };

const appendSpec = spec<
  (
    idRefusal: string | undefined,
    event: Appended,
    held: Held,
  ) => { readonly reason: AppendRefusalReason; readonly message: string } | undefined
>({
  requires: ({ input: [_idRefusal, _event, held] }) =>
    held.started >= 0 && held.started < MOST_STARTS && Number.isInteger(held.started) && (held.journal || held.started === 0),
  ensures: {
    idCheckedOnFiling: {
      description: 'A filing is refused malformed-id exactly when its id is not one a file can be named by',
      condition: ({ input: [idRefusal, event], output }) =>
        event.kind === 'filed' ? (idRefusal !== undefined) === (output?.reason === 'malformed-id') : true,
    },
    filedOnce: {
      description: 'A filing under a good id, to a task that already has a journal, is refused filed-twice',
      condition: ({ input: [idRefusal, event, held], output }) =>
        event.kind === 'filed' && held.journal && idRefusal === undefined ? output?.reason === 'filed-twice' : true,
    },
    filingOpens: {
      description: 'A filing under a good id, to a task with no journal, is taken',
      condition: ({ input: [idRefusal, event, held], output }) =>
        event.kind === 'filed' && !held.journal && idRefusal === undefined ? output === undefined : true,
    },
    onlyFilingOpens: {
      description: 'Any entry but a filing, to a task with no journal, is refused not-filed',
      condition: ({ input: [_idRefusal, event, held], output }) =>
        event.kind !== 'filed' && !held.journal ? output?.reason === 'not-filed' : true,
    },
    attemptsInOrder: {
      description: 'A start to a filed task is refused attempt-out-of-order exactly when it is not numbered the count of starts plus one',
      condition: ({ input: [_idRefusal, event, held], output }) =>
        event.kind === 'starting' && held.journal
          ? (event.attempt !== held.started + 1) === (output?.reason === 'attempt-out-of-order')
          : true,
    },
    otherwiseTaken: {
      description: 'An entry but a filing or a start, to a filed task, is taken',
      condition: ({ input: [_idRefusal, event, held], output }) =>
        event.kind !== 'filed' && event.kind !== 'starting' && held.journal ? output === undefined : true,
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type AppendRefusal = Implementation<typeof appendSpec>;
