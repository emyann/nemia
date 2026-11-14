/**
 * An approval taken back (agent-orchestrator, src/gate/gate.ts): `takeBackStop`, what of a step refuses `nemia approve <run> <step>
 * --off`. A person who approved a gate may take the approval back while nothing it approved has been filed — an ending waiting on the
 * checkout, held, or not yet ticked — and the step then waits at its gate again. `takeBackJudged` words the stop it decides; the verb
 * (`takeBackRun`, gate.verb.ts) moves the approval's file into the run's `.asks/done/`, as the pass moves a spent one.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * What of a step a take-back is judged from, read off the run before anything is moved. `known`: the run and its workflow have the step.
 * `approved`: a person's approval of the try it is on stands (`approvalOf`), written with the work it approved named or by older code
 * with none. `filed`: anything of the step has a task — its session or its check.
 */
export type TakeBackPut = { known: boolean; approved: boolean; filed: boolean };

/** What of the step refuses the take-back, in the order `takeBackJudged` says it: the first that is so is the one said. */
export type TakeBackStop = 'unknown' | 'unapproved' | 'handed-on';

const takeBackStopSpec = spec<(p: TakeBackPut) => TakeBackStop | null>({
  ensures: {
    takenExactlyWhenApprovedAndNothingFiled: {
      description: 'An approval is taken back exactly when the step is known, stands approved, and nothing of it has been filed',
      condition: ({ input: [p], output }) => (output === null) === (p.known && p.approved && !p.filed),
    },
    anUnknownStepIsSaidFirst: {
      description: 'A step the run does not have is refused as unknown, whatever else is so of it',
      condition: ({ input: [p], output }) => p.known || output === 'unknown',
    },
    aGateNotApprovedHasNothingToTakeBack: {
      description: 'A known step that does not stand approved is refused as not approved, filed or not',
      condition: ({ input: [p], output }) => !p.known || p.approved || output === 'unapproved',
    },
    anApprovedStepFiledHasHandedOn: {
      description: 'A known step that stands approved and has anything filed has handed on: what it approved has run',
      condition: ({ input: [p], output }) => !(p.known && p.approved && p.filed) || output === 'handed-on',
    },
  },
});

/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type TakeBackStopOf = Implementation<typeof takeBackStopSpec>;
