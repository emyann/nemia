/**
 * Who a request is from, by the token it presents and what its route needs of one (`sessionCaller`): the record of a standing token
 * read by its digest first, then the record of a session's (`TokenDoor`), whether that session is still the live one judged afresh against
 * the run's record and the engine (`liveSession`), then the pure judgement (`callerOf`). Remembers nothing between requests: a session's
 * token ends with its try, and a person's with its record, removed by name; no list of revoked ones is kept. What the api reads of the
 * tokens, re-exported here so the package's entry names it from one module.
 */
import { Effect } from 'effect';
import { EngineService, asked } from '../runtime-client.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';
import { callerOf, type CallerOf, type TokenNeed } from './token.ts';
import { TokenDoor, standingOf, tokenDigest, type TokenFiled } from './token.store.ts';

export { callerOf, type CallerOf, type StandingRecord, type TokenHolder, type TokenNeed, type TokenRecord } from './token.ts';
export {
  TokenDoor,
  holderOf,
  tokenDoorFiles,
  tokenDigest,
  type PersonTokenFiled,
  type TokenDoorShape,
  type TokenFiled,
} from './token.store.ts';
export { SESSION_TOKEN } from '../filed/filed.ts';

/** Whether the engine's task `task` was filed and has not settled: a session that still runs, or will run again. */
const unsettled = Effect.fnUntraced(function* (task: string) {
  const { state } = yield* asked('view', (yield* EngineService).view(task));
  return Boolean(state.filedAt) && !state.settled;
});

/**
 * Whether the session a token was minted for is still the live one: for a step's, its run is there and not called off, the step's
 * current task is the token's (a later try or round files another), and that task has not settled; for a session that is no run's
 * (Nemia's), its task has not settled, the keeper filing her anew under another once she was stopped.
 */
export const liveSession = Effect.fn('liveSession')(function* (record: TokenFiled) {
  if (record.run === null) return yield* unsettled(record.task);
  const run = yield* (yield* RunDoor).runs.find(RunId.read(record.run), () => {});
  if (run === undefined || run.cancelledAt !== undefined) return false;
  if (record.step === null || run.steps[record.step]?.taskId !== record.task) return false;
  return yield* unsettled(record.task);
});

/**
 * The caller a request is, from the token it presents (`undefined`: it presents none) and what its route needs of one (`need`, `none`
 * where not said): with none, the person where the route needs none and refused `token-required` where it needs one; a standing token,
 * its holder under its name; refused `unknown-token` where the store keeps no record of it, `person-token-required` for a session's where
 * the route needs a standing one, `session-ended` where its session is no longer the live one, and otherwise its agent in its factory,
 * run and step (`callerOf`). Reads the store's root off the program (`StoreRoot`, through `TokenDoor`), the run off `RunDoor` and the
 * task off the engine (`EngineService`), each only where the judgement turns on it.
 */
export const sessionCaller = Effect.fn('sessionCaller')(function* (token: string | undefined, need: TokenNeed = 'none') {
  if (token === undefined) return callerOf(false, need, null, null, false);
  const door = yield* TokenDoor;
  const kept = yield* door.persons.read(tokenDigest(token));
  const standing = kept === null ? null : standingOf(kept);
  const record = standing !== null ? null : yield* door.tokens.read(token);
  const live = record === null || need === 'standing' ? false : yield* liveSession(record);
  return callerOf(true, need, standing, record, live) satisfies CallerOf;
});
