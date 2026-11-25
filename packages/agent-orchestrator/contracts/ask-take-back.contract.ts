/**
 * An ask taken back (agent-orchestrator, src/take-back/take-back.ts): `askTakeBackStop`, what refuses a person's take-back of an ask
 * that is not an approval — a try (`nemia retry <run> <step> --off`), a round (`nemia retry <run> [<step>] --round --off`), a merge of
 * the base (`nemia refresh <run> [<step>] --base --off`) and a loop's acceptance (`nemia approve <run> <step> --off` of a loop out of
 * rounds) — and a record at a gate's key that does not read as an approval. An approval standing is `take-back.contract.ts`'s. The verb
 * (`takeBackAsk`, take-back.verb.ts) sets the record at the ask's key aside under the run's asks' `done/`, never deleting it, as the
 * pass sets a spent one aside.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * Which ask is taken back, by the kind its key names: `try` (`retry-…`), `round` (`round-…`), `base` (`merge-…`), `loop`
 * (`accept-…`), and `gate` (`approve-…`) for a record there that does not read as an approval.
 */
export type AskTakenOf = 'try' | 'round' | 'base' | 'loop' | 'gate';

/** What waits at the ask's key: an ask of its kind, a record that does not read as one (a stray), or nothing. */
export type AskHeld = 'ask' | 'stray' | 'none';

/**
 * What a take-back is judged from, read off the run and its asks before anything is moved. `of`: the kind of ask. `known`: the run and its
 * workflow have the step. `looping`: the step closes a loop (`loop:`), which a round, a merge and an acceptance are asked of. `held`: what
 * waits at the key the ask is written at — the step's next try, the loop's next round, the target's next try that merges, the looping
 * step's current try accepted, the step's current try approved. `handedOn`: of an acceptance, a step waiting on the looping step has a
 * task, so what it let on has run; false for every other kind, whose ask is spent in the very write that files what it asked.
 */
export type AskTakeBackPut = { of: AskTakenOf; known: boolean; looping: boolean; held: AskHeld; handedOn: boolean };

/** What refuses the take-back, in the order the verb says it: the first that is so is the one said. */
export type AskTakeBackStop = 'unknown' | 'loopless' | 'unasked' | 'handed-on';

/** Whether the kind is asked of a loop alone: a round, a merge of the base, an acceptance. */
const ofALoop = (of: AskTakenOf) => of === 'round' || of === 'base' || of === 'loop';

/** Whether the step can hold an ask of the kind: a known step, closing a loop where the kind is a loop's. */
const askable = (p: AskTakeBackPut) => p.known && (!ofALoop(p.of) || p.looping);

const askTakeBackStopSpec = spec<(p: AskTakeBackPut) => AskTakeBackStop | null>({
  requires: ({ input: [p] }) => (p.of === 'loop' || !p.handedOn) && (p.of !== 'gate' || p.held !== 'ask'),
  ensures: {
    takenExactlyWhenSomethingWaitsAndNothingRan: {
      description:
        'An ask is taken back exactly when its step can hold it, something waits at its key, and it is not an acceptance whose waiting steps have run',
      condition: ({ input: [p], output }) =>
        (output === null) === (askable(p) && p.held !== 'none' && !(p.held === 'ask' && p.handedOn)),
    },
    anUnknownStepIsSaidFirst: {
      description: 'A step the run does not have is refused as unknown, whatever else is so of it',
      condition: ({ input: [p], output }) => p.known || output === 'unknown',
    },
    aLoopsAskOfAStepClosingNoLoopIsLoopless: {
      description: 'A round, a merge or an acceptance taken back of a known step that closes no loop is refused as loopless',
      condition: ({ input: [p], output }) => !p.known || !ofALoop(p.of) || p.looping || output === 'loopless',
    },
    nothingAtTheKeyIsUnasked: {
      description: 'Where the step can hold the ask and nothing waits at its key, there is nothing to take back',
      condition: ({ input: [p], output }) => !askable(p) || p.held !== 'none' || output === 'unasked',
    },
    anAcceptanceHandedOnStays: {
      description: 'An acceptance whose waiting steps have a task has handed on, and is refused as handed on',
      condition: ({ input: [p], output }) => !(askable(p) && p.held === 'ask' && p.handedOn) || output === 'handed-on',
    },
    aStrayIsAlwaysSetAside: {
      description: 'A record at the key that reads as no ask of its kind is set aside wherever the step can hold the ask',
      condition: ({ input: [p], output }) => !(askable(p) && p.held === 'stray') || output === null,
    },
  },
});

/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type AskTakeBackStopOf = Implementation<typeof askTakeBackStopSpec>;
