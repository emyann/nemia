import type { CheckResult, StepCheck } from 'objects';
import type { StepAttempts, StepCloseout, StepTry } from '../../lib/api/tries.ts';
import { durationWords } from '../../lib/duration';
import { bodyLeadsWith, summaryShown } from '../../lib/transcript';
import { cn } from '../../lib/utils';
import { verdictWords } from '../../lib/words';
import { Markdown } from '../markdown/Markdown';
import { Json } from './Outcome';
import type { Frozen } from '../../lib/frozen';

export { Artifacts, bytesWord } from '../run/Artifacts';

/** A check's verdict: its result, and the code it exited with. */
type CheckVerdict = NonNullable<StepCheck['verdict']>;

/**
 * A try as its picker and its detail name it: its round, its number, and in brackets how it was reached — what replaced the try before
 * it: `round 2 · try 3 (round)`, `round 1 · try 2 (retries)`.
 */
export function tryLabel(t: Frozen<StepTry>, tries: readonly Frozen<StepTry>[]): string {
  const before = tries.find((other) => other.try === t.try - 1);
  return `round ${t.round} · try ${t.try}${before?.cause ? ` (${before.cause})` : ''}`;
}

/** A step's tries grouped by their round, rounds in order, each round's tries earliest first: what the try picker lists. */
export const triesByRound = <T extends Frozen<Pick<StepTry, 'try' | 'round'>>>(tries: readonly T[]): Array<{ round: number; tries: T[] }> =>
  [...new Set(tries.map((t) => t.round))].sort((a, b) => a - b).map((round) => ({ round, tries: tries.filter((t) => t.round === round) }));

/** A try's sessions as its detail says them: how many, and how long the latest took, or that it runs. */
export function attemptsWord({ count, latest }: StepAttempts): string {
  if (!latest) return 'no session';
  const took = latest.endedAt
    ? durationWords(Date.parse(latest.endedAt) - Date.parse(latest.startedAt), 'second')
    : latest.ended
      ? null
      : 'running';
  return took ? `#${count} · ${took}` : `#${count}`;
}

/** The ink of a check's verdict, by its result: plain where it passed, a failure where it failed or did not finish, else muted. */
const VERDICT_CLASS: Record<CheckResult, string> = {
  passed: 'text-foreground',
  failed: 'font-semibold text-failure',
  unfinished: 'font-semibold text-failure',
  running: 'text-muted-foreground',
  unknown: 'text-muted-foreground',
};

/** A try's check's verdict as its detail says it — `check exit 1` — inked by its result; `not filed` until the run files the check. */
export function CheckVerdictWords({ verdict }: { verdict: CheckVerdict | null }) {
  const said = verdict ? verdictWords(verdict) : 'not filed';
  return (
    <span data-verdict={said} data-verdict-result={verdict?.result}>
      check <span className={cn('font-mono', verdict ? VERDICT_CLASS[verdict.result] : 'text-muted-foreground')}>{said}</span>
    </span>
  );
}

/** A statement whole, as the engine recorded it: what the detail's fold shows, and all there is of one that could not be read. */
export function AsItCame({ raw }: { raw: unknown }) {
  return (
    <section aria-label="As it came" className="space-y-1">
      <h4 className="text-body-small text-muted-foreground">the statement as it came</h4>
      <Json data-raw value={raw} />
    </section>
  );
}

/** What a person said to a try when they asked for it, as the CLI's `decide` prints it under the try before's question: `your answer`. */
export function YourAnswer({ answer }: { answer: string }) {
  return (
    <p data-your-answer className="whitespace-pre-wrap break-words">
      <span className="font-medium text-muted-foreground">your answer:</span> {answer}
    </p>
  );
}

/**
 * What a closeout says in words: its summary, one line as the api cut it, then its body as markdown, and what the run did not accept of
 * it, each under `not accepted`. A body that opens with the summary (`bodyLeadsWith`) is drawn alone, so the line is said once.
 */
export function Statement({ closeout }: { closeout: Frozen<Pick<StepCloseout, 'summary' | 'body' | 'refused'>> }) {
  return (
    <>
      {!bodyLeadsWith(closeout.summary, closeout.body) && (
        <p data-summary className="text-body-medium text-foreground">
          {summaryShown(closeout.summary)}
        </p>
      )}
      {closeout.body && <Markdown data-body>{closeout.body}</Markdown>}
      {closeout.refused.map((why) => (
        <p key={why} data-refused className="text-body-small text-failure">
          not accepted: {why}
        </p>
      ))}
    </>
  );
}

/** What a step that signed off blocked needs, under its word, as its agent wrote it. */
export function ClosedNeeds({ needs }: { needs: string }) {
  return (
    <div data-needs className="text-yours">
      <p className="font-medium">Needs:</p> <Markdown>{needs}</Markdown>
    </div>
  );
}
