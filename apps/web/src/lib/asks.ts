/**
 * What a step needs from a person, as the board says it, and what the run's page offers to answer it with. Pure.
 *
 * The facts are the api's — a closeout's `needs`, a session the harness blocked and, on a run's detail, what it said last, what `wf ls`
 * asks of you for a step at its gate (`approve plan`), `waitingOnYou`, a try a person `asked` for — which are the package's and the engine's.
 * The words that join the first two to a step, `asks` and `blocked by the harness`, are the board's: the package has none for them.
 */
import type { RunDetail, RunSummary, RunToDecide } from './api';
import { stepState } from './status.ts';

/** A step as the list gives it, or as a run's detail does, with what a session the harness blocked said last. */
type NeedsStep = Pick<RunSummary['steps'][number], 'name' | 'needs' | 'blockedByHarness' | 'approve'> & { lastLine?: string | null };

/**
 * What one step needs from a person: the question it signed off blocked with; that the harness blocked its session — with what the
 * session said last where the api read it (a run's detail), and null where it did not (the list) or the session said nothing; or, at its
 * gate, its approval — `said` in `wf ls`'s words, `approve plan`.
 */
export type Need =
  | { step: string; kind: 'asks'; needs: string }
  | { step: string; kind: 'harness'; lastLine: string | null }
  | { step: string; kind: 'approve'; said: string };

/**
 * A step's need, or null. The question of a step that signed off blocked, while it waits on you — not once a person has asked for its
 * next try, which takes it out of `waitingOnYou`. Its approval, for a step waiting at its gate, while it waits on you — not once it is
 * approved, nor sent back. That the harness blocked its session, for as long as it does. Nothing on a run called off: nobody is waiting
 * for the answer any more.
 */
export function needOf(step: NeedsStep, waitingOnYou: boolean, runCancelled: boolean): Need | null {
  if (runCancelled) return null;
  if (step.blockedByHarness) return { step: step.name, kind: 'harness', lastLine: step.lastLine ?? null };
  if (step.approve && waitingOnYou) return { step: step.name, kind: 'approve', said: step.approve };
  if (step.needs && waitingOnYou) return { step: step.name, kind: 'asks', needs: step.needs };
  return null;
}

/**
 * Each step's need, in the run's order: what the Factory's card and the run's banner say.
 *
 * Without the ending step whose gate the run's to-decide line already says, as `wf ls` leaves it out of `→ waiting on you` (cli.ts): that
 * line names the step and the command that approves it, and the same step is not asked for twice.
 */
export const needsOf = (run: Pick<RunSummary, 'cancelledAt' | 'waitingOnYou'> & { steps: readonly NeedsStep[]; toDecide?: RunToDecide | null }): Need[] => {
  const decided = run.toDecide?.kind === 'approve' ? run.toDecide.step : null;
  return run.steps.flatMap((step) => {
    const need = needOf(step, run.waitingOnYou.includes(step.name), run.cancelledAt !== null);
    return need && !(need.kind === 'approve' && need.step === decided) ? [need] : [];
  });
};

/**
 * A need as its step's node says it, under the step's name: `asks: <needs>`, `blocked by the harness: <what it said last>` — and at a gate,
 * `wf ls`'s own words, which name the step: `approve plan`.
 */
export const needText = (need: Need): string =>
  need.kind === 'asks' ? `asks: ${need.needs}` : need.kind === 'approve' ? need.said : `blocked by the harness${need.lastLine ? `: ${need.lastLine}` : ''}`;

/**
 * A need with the step it is of, as the card and the banner say it: `implement asks: <needs>`, `implement is blocked by the harness: <…>`,
 * and `approve plan`, whose words name their step already.
 */
export const needLine = (need: Need): string =>
  need.kind === 'approve' ? need.said : `${need.step} ${need.kind === 'asks' ? '' : 'is '}${needText(need)}`;

/**
 * Whether a step's section offers its gate — Approve and Send back — beside what it handed on: it waits at its gate on you, as `wf ls` asks it
 * (`approve plan`), on a run nobody called off. Only words offer it: a step approved or sent back carries none, and neither does a detail from
 * an api that has no approve route, whose `approve` is not there at all (`withGraph` refuses such a detail first).
 */
export const gateOffered = (step: Pick<RunDetail['steps'][number], 'approve'>, runCancelled: boolean): boolean => Boolean(step.approve) && !runCancelled;

/** Where a step's section is on its run's page, as a URL's hash: what the banner's `approve plan` links to, where Approve is. */
export const stepAnchor = (step: string): string => `step-${step}`;

/**
 * What a run's page offers for a step, each a `wf retry` the api asks for (`askTry`):
 *
 *   answer     it signed off blocked: an answer to its `needs`, carried into a nudge, or a fresh session
 *   try-again  its check refused it, or it ended without its closeout: another session, with something to say if you like — and
 *              where a check did not pass, the check run again; first, when it did not finish
 *   raise      a try of it, or its loop's round, has to carry a raise of its cap (`StepRaise`): over its budget, ended at it, or a check
 *              that did not finish past it. With its try — `wf retry --budget`, a nudge or a new session, and for a step that signed off
 *              blocked the answer to its `needs` beside it (`--message`), or its check again, which needs no raise — or with its loop's
 *              round, `wf round --budget`. `status` is its word, with the amounts; `unfinished` whether its check did not finish
 *   continue   the harness blocked its session, with nothing signed: a nudge, with something to say if you like, which the package takes
 *              as `wf retry` does — the tick stops the session, then files the try. The banner offers it, beside what the session said last
 *   asked      a person asked for its next try, which the next tick files: `wf ls`'s note says so
 */
export type Offer =
  | { step: string; kind: 'answer'; needs: string | null }
  | { step: string; kind: 'try-again'; recheck: boolean; unfinished: boolean }
  | ({ step: string; kind: 'raise'; status: string; needs: string | null; unfinished: boolean } & NonNullable<RunDetail['steps'][number]['raise']>)
  | { step: string; kind: 'continue' }
  | { step: string; kind: 'asked'; try: number; note: string | null };

/** What the Decide section offers: every offer but `continue`, which the banner makes beside the need it answers. */
export type Answer = Exclude<Offer, { kind: 'continue' }>;

/**
 * The offers of a run's page, in the run's order: one per step waiting on you that a try can answer, one per session the harness blocked,
 * and each step a person asked for a try of. A session the harness blocked is not waiting on you in the package's words — it asked
 * nothing — and is offered Continue all the same. A loop out of rounds goes round with `wf round`, among the Decide section's commands, and
 * has none. A step the api carries a raise for (`raise`) is offered that, whatever its word: over its budget its word is `over budget`,
 * whether it signed off blocked, ended unsigned or was refused by its check, and a check that did not finish past its budget reads as any
 * such check — and a try of either that files a session is refused without the raise. None where the package takes none: the target of a
 * loop held on its budget goes again with its looping step's round, whose row that is. Nothing on a run called off.
 */
export function offersOf(run: Pick<RunDetail, 'cancelledAt' | 'waitingOnYou' | 'steps'>): Offer[] {
  if (run.cancelledAt !== null) return [];
  return run.steps.flatMap((step): Offer[] => {
    if (step.asked) return [{ step: step.name, kind: 'asked', try: step.asked.try, note: step.note }];
    if (step.blockedByHarness) return [{ step: step.name, kind: 'continue' }];
    if (!run.waitingOnYou.includes(step.name)) return [];
    const unfinished = step.check?.verdict === 'unfinished';
    if (step.raise) return [{ step: step.name, kind: 'raise', status: step.status, needs: step.needs, unfinished, ...step.raise }];
    const state = stepState(step.status, false);
    if (state === 'blocked') return [{ step: step.name, kind: 'answer', needs: step.needs }];
    if (state === 'failed-check') return [{ step: step.name, kind: 'try-again', recheck: true, unfinished }];
    if (state === 'unsigned') return [{ step: step.name, kind: 'try-again', recheck: false, unfinished: false }];
    return [];
  });
}

/**
 * The amount a raise's box starts at: the first whole dollar above what the package says the budget has to pass (`StepRaise.above`) — $5 for
 * a step whose tries cost $4.25, $4 for one ended at a $3 cap. A person changes it; the package refuses one not above, in its words.
 */
export const raiseTo = (above: number): number => Math.floor(above) + 1;

/** What the Decide section offers, in the run's order: every offer but Continue, which the banner makes (`Answer`). */
export const answersOf = (run: Pick<RunDetail, 'cancelledAt' | 'waitingOnYou' | 'steps'>): Answer[] =>
  offersOf(run).filter((offer): offer is Answer => offer.kind !== 'continue');

/**
 * A try the api has just taken, as the board says it until the run is read again and the step's note says it in `wf ls`'s words: what the
 * tick does with it — for a step whose session the harness blocked (`stopFirst`, the package's), stop that session first.
 */
export const askedSaid = (asked: { try: number; stopFirst: boolean }): string =>
  `try ${asked.try} asked — ${asked.stopFirst ? 'stopping its blocked session, then the tick files it' : 'the next tick files it'}`;
