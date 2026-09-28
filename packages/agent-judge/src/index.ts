/**
 * The judge's Effect API, at `agent-judge/effect`: the services, the layers and the tagged failures. Everything a caller
 * needs without Effect is at `agent-judge` (`facade.ts`).
 */
export {
  Asker,
  Judge,
  recorded,
  replay,
  BASE_URL,
  FAILURE_OF,
  NoKey,
  Refused,
  RateLimited,
  TimedOut,
  Unreachable,
  ReplayMiss,
  RecordError,
  Invalid,
  type AskFailure,
  type Asked,
  type AskerOps,
  type Answers,
  type AskOptions,
  type JudgeError,
  type JudgeOps,
  type LiveOptions,
  type Reply,
} from './judge.ts';
export {
  decide,
  why,
  FAILURE_KINDS,
  type Answered,
  type Failed,
  type FailureKind,
  type Judgment,
  type Thresholds,
  type Verdict,
} from './decide.ts';
export { keyOf, pinnedModel, stateHash, KEY_VERSION, type State } from './key.ts';
export type { AnswerFact, Claim, FailedFact } from './record.ts';
