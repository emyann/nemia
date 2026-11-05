/**
 * The face of reach: which steps at their gate an agent's rules for `auto` could ever approve, why not, and the rules that would
 * (`reach.ts`, pure, its laws `contracts/reach.contract.ts`'s). The read over a factory or a run is `nemia policy reach` (`reach.verb.ts`).
 */
export {
  neverHolds,
  ruleReaches,
  suggestedFor,
  unmetNow,
  gateRows,
  missWords,
  unmetWords,
  NEVER_WORDS,
  type GateSite,
  type NeverWhy,
  type Unmet,
  type Reach,
  type RuleMiss,
  type GateReach,
} from './reach.ts';
