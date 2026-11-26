/**
 * A ProposalList's `?fieldSelector=` (`proposalPhaseSelector`, proved by contracts/proposal-phase-selector.contract.ts): `status.phase`,
 * then one of Kubernetes' operators `=`, `==` or `!=`, then a proposal's phase; and which proposals it takes (`phaseTakes`). An empty
 * selector is every proposal, the list's to read before this is asked. Pure.
 */
import { PROPOSAL_PHASES } from 'objects';
import type { PhaseTakes, ProposalPhaseSelectorOf } from '../../contracts/proposal-phase-selector.contract.ts';

/** The field a proposal's list is selected by. */
const FIELD = 'status.phase';

/** `word` as a proposal's phase, or null where it is none. */
const phaseOf = (word: string) => PROPOSAL_PHASES.find((phase) => phase === word) ?? null;

/**
 * The selector `text` spells: `status.phase`, then `==`, `!=` or `=`, then a phase; null for anything else.
 * @param text The field selector a list of proposals is asked with, as given.
 */
export const proposalPhaseSelector: ProposalPhaseSelectorOf = (text) => {
  if (!text.startsWith(FIELD)) return null;
  const rest = text.slice(FIELD.length);
  const operator = rest.startsWith('==') ? '==' : rest.startsWith('!=') ? '!=' : rest.startsWith('=') ? '=' : null;
  if (operator === null) return null;
  const phase = phaseOf(rest.slice(operator.length));
  return phase === null ? null : { phase, equal: operator !== '!=' };
};

/**
 * Whether a list asked by `selector` takes a proposal in `phase`.
 * @param selector The selector the list was asked with.
 * @param phase The proposal's phase.
 */
export const phaseTakes: PhaseTakes = (selector, phase) => (phase === selector.phase) === selector.equal;
