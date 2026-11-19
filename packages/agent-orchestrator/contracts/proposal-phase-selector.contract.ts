/**
 * A ProposalList's `?fieldSelector=` (agent-orchestrator, src/proposal/phase-selector.ts, `proposalPhaseSelector`), as Kubernetes spells a
 * field selector: one field, `status.phase`, where a proposal stands in its life (`PROPOSAL_PHASES`), with one of Kubernetes' three
 * operators — `=` and `==`, which mean the same, and `!=` — then a phase. So `status.phase=waiting` is the proposals that wait on an
 * approval, which a factory's pane counts without reading the whole list. Anything else is no selector of it (null), which the list
 * refuses `Invalid`, naming the forms it takes; an empty one selects every proposal, and is the list's to read before this is asked.
 *
 * And which proposals a selector takes (`phaseTakes`): those in the phase it names, or, for `!=`, every other.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { ProposalPhase } from 'objects';

/** What a selector asks: the proposals in `phase` (`equal`), or every proposal but those (`!equal`). */
export type ProposalPhaseSelector = { readonly phase: ProposalPhase; readonly equal: boolean };

/** The field a proposal's list is selected by. */
const FIELD = 'status.phase';

/** Whether `word` is a proposal's phase. */
const isPhase = (word: string) =>
  word === 'waiting' ||
  word === 'approved' ||
  word === 'applied' ||
  word === 'declined' ||
  word === 'stale' ||
  word === 'dropped' ||
  word === 'failed';

/** Whether `text` is the field, `operator`, then a phase. */
const spelled = (text: string, operator: string) =>
  text.startsWith(FIELD + operator) && isPhase(text.slice(FIELD.length + operator.length));

const proposalPhaseSelectorSpec = spec<(text: string) => ProposalPhaseSelector | null>({
  ensures: {
    eachSpellingTaken: {
      description: 'status.phase, then =, == or !=, then a phase, is a selector of the list',
      condition: ({ input: [text], output }) => !(spelled(text, '=') || spelled(text, '==') || spelled(text, '!=')) || output !== null,
    },
    readAsSpelled: {
      description: 'A selector taken says the phase its text names, and takes the proposals in it exactly where its operator is = or ==',
      condition: ({ input: [text], output }) =>
        output === null ||
        (output.equal ? text === FIELD + '=' + output.phase || text === FIELD + '==' + output.phase : text === FIELD + '!=' + output.phase),
    },
  },
});

/** `proposalPhaseSelector`'s type, which `src/proposal/phase-selector.ts` takes: the selector `text` spells, or null for none. */
export type ProposalPhaseSelectorOf = Implementation<typeof proposalPhaseSelectorSpec>;

const phaseTakesSpec = spec<(selector: ProposalPhaseSelector, phase: ProposalPhase) => boolean>({
  ensures: {
    byPhase: {
      description: 'A selector takes a proposal exactly where its phase is the one named, or, for !=, exactly where it is not',
      condition: ({ input: [selector, phase], output }) => output === ((phase === selector.phase) === selector.equal),
    },
  },
});

/** `phaseTakes`'s type, which `src/proposal/phase-selector.ts` takes: whether a list asked by `selector` takes a proposal in `phase`. */
export type PhaseTakes = Implementation<typeof phaseTakesSpec>;
