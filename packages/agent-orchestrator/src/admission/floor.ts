/**
 * The floor of an agent's standing token (`floorOf`, proved by `contracts/token-floor.contract.ts`): whether a request the api takes under
 * a token the person minted for an agent reaches what it asks, judged by the same command classes, factory levels and confirmed list at
 * `auto` that admission judges an agent's session by, what admission would ask the person of refused, since the api has no prompt. Pure:
 * `floor.verb.ts` reads the levels, the wait and the list afresh on each request.
 */
import type { FloorNarrowingWord, FloorRefusalWord } from 'objects';
import type { FloorAnswer, FloorCall, FloorNarrowing, FloorOf, FloorRefusal } from '../../contracts/token-floor.contract.ts';
import { atLeast } from '../level/level.ts';

export type { FloorAnswer, FloorCall, FloorHolder, FloorNarrowing, FloorRefusal } from '../../contracts/token-floor.contract.ts';

/** Whether two types are the same, both ways. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** The contract's words are `objects`' (`FLOOR_NARROWINGS`, `FLOOR_REFUSALS`): a word added to one and not the other does not compile. */
const NARROWINGS_AGREE: Same<FloorNarrowing, FloorNarrowingWord> = true;
const REFUSALS_AGREE: Same<FloorRefusal, FloorRefusalWord> = true;
void [NARROWINGS_AGREE, REFUSALS_AGREE];

/** The refusal for `reason`. */
const denied = (reason: FloorRefusal): FloorAnswer => ({ decision: 'deny', reason });

/** Whether the class `c` is above the narrowing `n`: anything but a read above `read`, an answer above `act`. */
const above = (c: FloorCall['class'], n: FloorNarrowing | null): boolean => n !== null && c !== 'read' && (n === 'read' || c !== 'act');

/**
 * The floor's answer for `call` under a token held as `holder`: refused out of reach (`none`), asked every time (`ask`), above the
 * token's narrowing, in a factory other than the one it is bound to, a write in a factory below the level an agent's call needs, or an
 * answer to what waits on the person that no confirmed rule lets through; else allowed.
 */
export const floorOf: FloorOf = (call, holder) => {
  if (call.class === 'none') return denied('out-of-reach');
  if (call.class === 'ask') return denied('asks-the-person');
  if (above(call.class, holder.narrowed)) return denied('narrowed');
  if (holder.factory !== null && call.factory !== null && call.factory !== holder.factory) return denied('other-factory');
  if (call.class !== 'read' && call.level !== null && !atLeast(call.level, call.least)) return denied('below-level');
  if (call.class === 'answer' && call.waits && !call.ruled) return denied('waits-on-person');
  return { decision: 'allow' };
};
