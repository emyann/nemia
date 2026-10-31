/**
 * What a step needs from a person, as the board says it, and what the run's page offers to answer it with. Pure.
 *
 * The facts are the api's — a closeout's `needs`, a session the harness blocked and, on a run's detail, what it said last, what the CLI's
 * `ls` asks of you for a step at its gate (`approve plan`), `waitingOnYou`, a try a person `asked` for — which are the package's and the
 * engine's. The words that join the first two to a step, `asks` and `blocked by the harness`, are the board's: the package has none for
 * them.
 */
import type { Question, RunDetail, RunSummary, RunToDecide, StepCloseout } from './api';
import { stepState } from './status.ts';

/** A step as the list gives it, or as a run's detail does, with what a session the harness blocked said last. */
type NeedsStep = Pick<RunSummary['steps'][number], 'name' | 'needs' | 'reason' | 'via' | 'waitingFor' | 'approve'> & {
  lastLine?: string | null;
};

/** Whether a step's harness stopped its session to ask, and no closeout signed off blocked: codes `AwaitingAnswer` via `session`. */
export const atHarness = (step: Pick<NeedsStep, 'reason' | 'via'>): boolean => step.reason === 'AwaitingAnswer' && step.via === 'session';

/**
 * What one step needs from a person: the question it signed off blocked with; that the harness blocked its session — with what that harness
 * says it waits for where it says anything (`waitingFor`, the package's words, on the list as on the detail), and what the session said
 * last where the api read it (a run's detail), null where it did not (the list) or the session said nothing; or, at its gate, its approval
 * — `said` in the CLI `ls`'s words, `approve plan`.
 */
export type Need =
  | { step: string; kind: 'asks'; needs: string }
  | { step: string; kind: 'harness'; waitingFor: NeedsStep['waitingFor']; lastLine: string | null }
  | { step: string; kind: 'approve'; said: string };

/** The harness's own half of such a need, in the order a person reads it: what it waits for, then what the session said last. */
export const harnessSaid = (need: Extract<Need, { kind: 'harness' }>): string =>
  [need.waitingFor?.words, need.lastLine].filter(Boolean).join(' · ');

/**
 * A step's need, or null. The question of a step that signed off blocked, while it waits on you — not once a person has asked for its
 * next try, which takes it out of `waitingOnYou`. Its approval, for a step waiting at its gate, while it waits on you — not once it is
 * approved, nor sent back. That the harness blocked its session, for as long as it does. Nothing on a run called off: nobody is waiting
 * for the answer any more.
 */
export function needOf(step: NeedsStep, waitingOnYou: boolean, runCancelled: boolean): Need | null {
  if (runCancelled) return null;
  if (atHarness(step)) return { step: step.name, kind: 'harness', waitingFor: step.waitingFor, lastLine: step.lastLine ?? null };
  if (step.approve && waitingOnYou) return { step: step.name, kind: 'approve', said: step.approve };
  if (step.needs && waitingOnYou) return { step: step.name, kind: 'asks', needs: step.needs };
  return null;
}

/**
 * Each step's need, in the run's order: what the Factory's card and the run's banner say.
 *
 * Without the ending step whose gate the run's to-decide line already says, as the CLI's `ls` leaves it out of `→ waiting on you`
 * (cli/main.ts): that line names the step and the command that approves it, and the same step is not asked for twice.
 */
export const needsOf = (
  run: Pick<RunSummary, 'cancelledAt' | 'waitingOnYou'> & { steps: readonly NeedsStep[]; toDecide?: RunToDecide | null },
): Need[] => {
  const decided = run.toDecide?.kind === 'approve' ? run.toDecide.step : null;
  return run.steps.flatMap((step) => {
    const need = needOf(step, run.waitingOnYou.includes(step.name), run.cancelledAt !== null);
    return need && !(need.kind === 'approve' && need.step === decided) ? [need] : [];
  });
};

/**
 * A need as its step's node says it, under the step's name: `asks: <needs>`, `blocked by the harness: <what it waits for> · <what it said
 * last>` — and at a gate, the CLI `ls`'s own words, which name the step: `approve plan`. The wait before the last line: it is why the
 * session has not moved, and the line is only the last thing it happened to say.
 *
 * What a person does about the wait is not here — a card has one line and a node has one line, and `advice` needs its own (`NeedsBanner`).
 */
export const needText = (need: Need): string => {
  if (need.kind === 'asks') return `asks: ${need.needs}`;
  if (need.kind === 'approve') return need.said;
  const said = harnessSaid(need);
  return `blocked by the harness${said ? `: ${said}` : ''}`;
};

/**
 * A need as a step's node says it, which has one line about thirty characters wide and truncates: for a session the harness blocked with
 * a wait on it, the wait alone (`waiting for a permission prompt`). It is the one fact this page has nowhere else at a glance — the chip
 * above the line already says `needs-human`, and `blocked by the harness: ` is twenty-four characters, which would leave room for a few of
 * the wait's. The whole of it, with what the session said last, is the line's `title`
 * and the banner's. Every other need, and a harness that said nothing about what for, reads as it does anywhere else.
 */
export const needNodeText = (need: Need): string => (need.kind === 'harness' && need.waitingFor ? need.waitingFor.words : needText(need));

/**
 * What the harness denied a step's current try, as its node says it: how many calls, never which. The node's line is about thirty
 * characters and truncates, and `denied: Skill(look), Bash(pytest)` is thirty-three — a path-scoped call alone can fill it — so the
 * names would be cut on the one line that has to be read whole. They are the line's `title` and the step section's `denied` row.
 */
export const deniedNodeText = (calls: readonly string[]): string => `denied ${calls.length} call${calls.length === 1 ? '' : 's'}`;

/**
 * A need with the step it is of, as the card and the banner say it: `implement asks: <needs>`, `implement is blocked by the harness: <…>`,
 * and `approve plan`, whose words name their step already.
 */
export const needLine = (need: Need): string =>
  need.kind === 'approve' ? need.said : `${need.step} ${need.kind === 'asks' ? '' : 'is '}${needText(need)}`;

/**
 * Whether a step's section offers its gate — Approve and Send back — beside what it handed on: it waits at its gate on you, as the CLI's
 * `ls` asks it (`approve plan`), on a run nobody called off. Only words offer it: a step approved or sent back carries none, and neither
 * does a detail from an api that has no approve route, whose `approve` is not there at all (the read refuses such a detail first,
 * `runQuery`).
 */
export const gateOffered = (step: Pick<RunDetail['steps'][number], 'approve'>, runCancelled: boolean): boolean =>
  Boolean(step.approve) && !runCancelled;

/** Where a step's section is on its run's page, as a URL's hash: what the banner's `approve plan` links to, where Approve is. */
export const stepAnchor = (step: string): string => `step-${step}`;

/** The questions a step's closeout asks as data, each of its question fields in turn, in the schema's order; none without a closeout. */
export const askedIn = (closeout: Pick<StepCloseout, 'questions'> | null | undefined): Question[] =>
  closeout?.questions.flatMap((a) => a.questions) ?? [];

/**
 * What a run's page offers for a step, each the CLI's `retry` the api asks for (`askTry`):
 *
 *   answer     it signed off blocked: an answer to its `needs`, carried into a nudge, or a fresh session — and where its closeout asks
 * questions as data (`StepCloseout.questions`), those, every field's in the schema's order, answered by choosing   try-again  its check
 * refused it, or it ended without its closeout: another session, with something to say if you like — and              where a check did not
 * pass, the check run again; first, when it did not finish   denied     its harness denied its try a call, and it says `denials: fail`:
 * another session, a new one first, as the CLI's `decide` offers it —              the run's `allowedTools:` is frozen, so a try is denied
 * the same call again. `calls` is the line naming them              (`StepNeeds.denied`)   raise      a try of it, or its loop's round, has
 * to carry a raise of its cap (`StepRaise`): over its budget, ended at it, or a check              that did not finish past it. With its
 * try — the CLI's `retry --budget`, a nudge or a new session, and for a step that signed off              blocked the answer to its `needs`
 * beside it (`--message`), or its check again, which needs no raise — or with its loop's              round, the CLI's `round --budget`.
 * `message` is its word, with the amounts; `unfinished` whether its check did not finish   continue   the harness blocked its session, with
 * nothing signed: a nudge, with something to say if you like, which the package takes              as the CLI's `retry` does — the tick
 * stops the session, then files the try. The banner offers it, beside what the session said last   asked      a person asked for its next
 * try, which the next tick files: the CLI `ls`'s note says so
 *
 * A raise carries `questions` as an answer does (`askedIn`): what its closeout asks as data, which a raise of a step that signed off
 * blocked answers by choosing, beside the budget, rather than in words.
 */
export type Offer =
  | { step: string; kind: 'answer'; needs: string | null; questions: Question[] }
  | { step: string; kind: 'try-again'; recheck: boolean; unfinished: boolean }
  | { step: string; kind: 'denied'; calls: string | null }
  | ({ step: string; kind: 'raise'; message: string; needs: string | null; unfinished: boolean; questions: Question[] } & NonNullable<
      RunDetail['steps'][number]['raise']
    >)
  | { step: string; kind: 'continue' }
  | { step: string; kind: 'asked'; try: number; note: string | null };

/** What the Decide section offers: every offer but `continue`, which the banner makes beside the need it answers. */
export type Answer = Exclude<Offer, { kind: 'continue' }>;

/**
 * The offers of a run's page, in the run's order: one per step waiting on you that a try can answer, one per session the harness blocked,
 * and each step a person asked for a try of. A session the harness blocked is not waiting on you in the package's words — it asked nothing
 * — and is offered Continue all the same. A loop out of rounds goes round with the CLI's `round`, among the Decide section's commands, and
 * has none. A step the api carries a raise for (`raise`) is offered that, whatever its word: over its budget its word is `over budget`,
 * whether it signed off blocked, ended unsigned or was refused by its check, and a check that did not finish past its budget reads as any
 * such check — and a try of either that files a session is refused without the raise. None where the package takes none: the target of a
 * loop held on its budget goes again with its looping step's round, whose row that is. Nothing on a run called off, and nothing on a run a
 * person holds (the CLI's `hold`): the package refuses every one of these verbs on it (`heldRefusal`), so an offer would be a button that
 * fails. A run without `holding` is taken for one nobody holds.
 */
export function offersOf(run: Pick<RunDetail, 'cancelledAt' | 'waitingOnYou' | 'steps'> & { holding?: RunDetail['holding'] }): Offer[] {
  if (run.cancelledAt !== null || run.holding != null) return [];
  return run.steps.flatMap((step): Offer[] => {
    if (step.asked) return [{ step: step.name, kind: 'asked', try: step.asked.try, note: step.note }];
    if (atHarness(step)) return [{ step: step.name, kind: 'continue' }];
    if (!run.waitingOnYou.includes(step.name)) return [];
    const unfinished = step.check?.verdict?.result === 'unfinished';
    if (step.raise) {
      const questions = askedIn(step.closeout);
      return [{ step: step.name, kind: 'raise', message: step.message, needs: step.needs, unfinished, questions, ...step.raise }];
    }
    const state = stepState(step, false, false);
    if (state === 'blocked') {
      return [{ step: step.name, kind: 'answer', needs: step.needs, questions: askedIn(step.closeout) }];
    }
    if (state === 'failed-check') return [{ step: step.name, kind: 'try-again', recheck: true, unfinished }];
    if (state === 'unsigned') return [{ step: step.name, kind: 'try-again', recheck: false, unfinished: false }];
    if (state === 'denied') return [{ step: step.name, kind: 'denied', calls: step.denied?.words ?? null }];
    return [];
  });
}

/**
 * The amount a raise's box starts at: the first whole dollar above what the package says the budget has to pass (`StepRaise.above`) — $5
 * for a step whose tries cost $4.25, $4 for one ended at a $3 cap. A person changes it; the package refuses one not above, in its words.
 */
export const raiseTo = (above: number): number => Math.floor(above) + 1;

/** What the Decide section offers, in the run's order: every offer but Continue, which the banner makes (`Answer`). */
export const answersOf = (run: Pick<RunDetail, 'cancelledAt' | 'waitingOnYou' | 'steps'> & { holding?: RunDetail['holding'] }): Answer[] =>
  offersOf(run).filter((offer): offer is Answer => offer.kind !== 'continue');

/**
 * A try the api has just taken, as the board says it until the run is read again and the step's note says it in the CLI `ls`'s words: what
 * the tick does with it — for a step whose session the harness blocked (`stopFirst`, the package's), stop that session first.
 */
export const askedSaid = (asked: { try: number; stopFirst: boolean }): string =>
  `try ${asked.try} asked — ${asked.stopFirst ? 'stopping its blocked session, then the tick files it' : 'the next tick files it'}`;
