/**
 * What becomes of an approved proposal on a pass (agent-orchestrator, src/proposal/apply.ts, `proposalApply`), read again each time and
 * carrying nothing between passes: it applies at approval, or at the proposing run's successful end where it says so, and is dropped where
 * that run is called off or fails; it is checked again as it applies — an object no longer at the revision the proposal read makes it
 * stale, never applied, and an agent's approval that no longer holds (its delegation taken back, its rule dropped, the factory off auto:
 * `proposalApproval` asked again) sends it back to the person. What was applied stands, and is undone by applying an earlier revision as a
 * new one. Pure.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** When an approved proposal applies: at approval, or at the proposing run's successful end. */
export type ApplyAt = 'approval' | 'run-end';

/** The proposing run, as the pass reads it: still going, ended well, ended otherwise (failed or called off), or none (the person's). */
export type ProposingRun = 'going' | 'succeeded' | 'ended' | 'none';

/**
 * An approved proposal as the pass reads it: when it applies, its run, who approved it, whether every object is still at the revision it
 * read (`current`), and whether an agent's approval still holds (`stillApproved`, `proposalApproval` asked again; true for the person's).
 */
export type ApplyFacts = {
  readonly at: ApplyAt;
  readonly run: ProposingRun;
  readonly approvedBy: 'person' | 'rule';
  readonly current: boolean;
  readonly stillApproved: boolean;
};

/** What the pass does: applies it, leaves it waiting on its run, marks it stale, sends it back to the person, or drops it. */
export type ApplyAction = 'apply' | 'wait' | 'stale' | 'back-to-person' | 'drop';

/** Whether the proposal is due to apply: at approval, or its run ended well, or it has no run (the person's). */
const due = (f: ApplyFacts): boolean => f.at === 'approval' || f.run === 'succeeded' || f.run === 'none';

const proposalApplySpec = spec<(facts: ApplyFacts) => ApplyAction>({
  ensures: {
    staleNeverApplies: {
      description: 'A proposal whose objects moved since it read them is never applied',
      condition: ({ input: [f], output }) => f.current || output !== 'apply',
    },
    lapsedApprovalNeverApplies: {
      description: "An agent's approval that no longer holds is never applied",
      condition: ({ input: [f], output }) => f.approvedBy === 'person' || f.stillApproved || output !== 'apply',
    },
    lapsedApprovalBackToThePerson: {
      description: "An agent's approval that no longer holds, due to apply on objects still current, goes back to the person",
      condition: ({ input: [f], output }) =>
        !(due(f) && f.approvedBy === 'rule' && !f.stillApproved && f.current) || output === 'back-to-person',
    },
    waitsOnItsRun: {
      description: 'A proposal that applies at its run’s end is not applied while the run goes',
      condition: ({ input: [f], output }) => !(f.at === 'run-end' && f.run === 'going') || output === 'wait',
    },
    droppedWithItsRun: {
      description: 'A proposal that applies at its run’s end is dropped where the run ended otherwise than well',
      condition: ({ input: [f], output }) => !(f.at === 'run-end' && f.run === 'ended') || output === 'drop',
    },
    appliesWhenDue: {
      description:
        'An approval that holds on current objects applies at approval, or once its run ended well where it waits on the run',
      condition: ({ input: [f], output }) =>
        !(due(f) && f.current && (f.approvedBy === 'person' || f.stillApproved)) || output === 'apply',
    },
    staleWhenMoved: {
      description: 'A proposal due to apply whose objects moved is marked stale',
      condition: ({ input: [f], output }) => !(due(f) && !f.current) || output === 'stale',
    },
  },
});

/** `proposalApply`'s type, which `src/proposal/apply.ts` takes. */
export type ProposalApply = Implementation<typeof proposalApplySpec>;
