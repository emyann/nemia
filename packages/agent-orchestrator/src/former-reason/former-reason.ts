/**
 * The reasons the feed no longer names, and what each now reads as: a wait on a person is said by the `Awaiting*` codes and the stops
 * beside them (phase `waiting`), and a wait on a thing by `Waiting` with what it waits on (`on`). A former code is read, never written:
 * on a line on disk, whatever its version (`upgraded`, which converts it through `currentOf`), and in a selector a person typed or a
 * subscription stored, which is never rewritten but evaluated against what the line would have been called (`formerOf`), as
 * `subscription/former-wake.ts` reads the retired wake words. A later card removes them, with this folder.
 *
 * A line from a newer `nemia` that reused one of these spellings with another meaning would be misread: none does, and none may, while
 * this table reads them.
 */
import type { Codes, InvolvedKind } from '../feed/index.ts';

/** What one former code reads as, for each kind of line it was written of. */
type Converted = Partial<Record<InvolvedKind, Codes>>;

/**
 * Every former code, and what it reads as by kind. `Blocked` of a run is `AwaitingAnswer` with no `via`: a run's line never said
 * where its answer was asked. `Held` was a run's alone, a hold of a person's that waits on other runs landing.
 */
export const FORMER_REASONS: Readonly<Record<string, Converted>> = {
  NeedsHuman: { Step: { reason: 'AwaitingAnswer', via: 'session' } },
  Blocked: { Step: { reason: 'AwaitingAnswer', via: 'closeout' }, Run: { reason: 'AwaitingAnswer' } },
  RoundsExhausted: { Step: { reason: 'AwaitingRound' } },
  WaitingForSlot: { Step: { reason: 'Waiting', on: 'limit' } },
  WaitingForCheckout: { Step: { reason: 'Waiting', on: 'checkout' } },
  WaitingForPause: { Step: { reason: 'Waiting', on: 'pause' } },
  CheckDenied: { Step: { reason: 'Denied' } },
  Held: { Run: { reason: 'Waiting', on: 'run' } },
};

/** Whether `value` is a code the feed no longer names. */
export const isFormerReason = (value: string): boolean => Object.hasOwn(FORMER_REASONS, value);

/**
 * The current codes of a line of `kind` that names `codes`. A former code converts by the table; a step's `Waiting` with no `on` — a
 * line written before `on` was, which did not say whether it waited on its own steps or on other runs — reads as `Pending`, the common
 * case (the person's answer at this card's design); every other code is current, and kept as written. Pure.
 */
export function currentOf(codes: { reason: string; on?: string; via?: string }, kind: InvolvedKind): Codes {
  const converted = isFormerReason(codes.reason) ? FORMER_REASONS[codes.reason][kind] : undefined;
  if (converted) return converted;
  if (codes.reason === 'Waiting' && codes.on === undefined) return { reason: 'Pending' };
  return codes as Codes;
}

/**
 * The former code a current line would have been written under, or undefined where it had none of its own: what a stored
 * `reason=NeedsHuman` is evaluated against (`selects`). A run that waits on a person for anything but its gates was `Blocked`, whatever
 * step it now names. A step's `Waiting` on a run and its `Pending` were each written as they are now, or as `Waiting`, which is a current
 * code and read as one. Pure.
 */
export function formerOf(codes: Codes, kind: InvolvedKind): string | undefined {
  if (kind === 'Run') {
    if (codes.reason === 'Waiting' && codes.on === 'run') return 'Held';
    const waits = ['AwaitingAnswer', 'AwaitingRound', 'OverBudget', 'BudgetExhausted', 'Unsigned', 'Denied'];
    return waits.includes(codes.reason) ? 'Blocked' : undefined;
  }
  if (kind !== 'Step') return undefined;
  return Object.keys(FORMER_REASONS).find((former) => {
    const now = FORMER_REASONS[former].Step;
    return now !== undefined && now.reason === codes.reason && now.on === codes.on && now.via === codes.via;
  });
}

/** What a former code is now spelled as a selector: `reason=AwaitingAnswer,via=session`, a step's reading first. */
const spelled = (former: string): string => {
  const { Step, Run } = FORMER_REASONS[former];
  const now = (Step ?? Run)!;
  return [`reason=${now.reason}`, ...(now.on ? [`on=${now.on}`] : []), ...(now.via ? [`via=${now.via}`] : [])].join(',');
};

/**
 * The hint for each former code `selector` names, typed to `nemia watch -l` or `nemia subscribe`: the code is still read, and what to
 * type instead. Empty where it names none. Pure.
 */
export function formerHints(selector: string): string[] {
  const named = selector.match(/[A-Za-z][A-Za-z0-9]*/g) ?? [];
  return [...new Set(named.filter(isFormerReason))].map(
    (former) => `${former} is a former reason, still read: type ${spelled(former)} instead`,
  );
}
