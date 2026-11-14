/**
 * The ask and the result, side by side on a run's page: what was asked of the run (its brief, and the inbox card it was started from),
 * and what it gave — what the graph's final steps gave, read from the graph and never from a step's name (`resultOf`) — or until they
 * have, where the run stands, linked to the step that says it; or, for a run called off or ended before they gave, that it ended — a
 * step that failed still saying why.
 */
import { stepAnchor } from '@/lib/asks';
import { ink, type Hue } from '@/lib/meaning';
import { resultOf, resultStepsOf, runEndOf } from '@/lib/runResult';
import { routedOf } from '@/lib/routing';
import type { RunDetail } from '@/lib/runView';
import { stepPartOf } from '@/lib/stepPart';
import { useNow } from '@/lib/useNow';
import { ENDED, PERSON } from '@/lib/words';
import { cn } from '@/lib/utils';
import { TextLink } from '../look';
import { Markdown } from '../markdown/Markdown';
import { PartGave } from '../step/part/PartGave';

/** Where the run stands, until its final steps have given. */
type Why = Extract<ReturnType<typeof resultOf>, { kind: 'stands' }>['why'];

/** How the box says where the run stands, in the rail's words (`PERSON`), and its hue: waiting on you, failed, at work, to come. */
const STANDS: Record<Why, { words: string; hue: Hue }> = {
  yours: { words: PERSON['awaiting-approval'].rail, hue: 'yours' },
  failed: { words: PERSON.failed.rail, hue: 'failure' },
  working: { words: PERSON.working.rail, hue: 'alive' },
  toCome: { words: PERSON.waiting.rail, hue: 'grey' },
};

/** A link to the part of the step `step` on the run's page. */
function ToPart({ run, step }: { run: string; step: string }) {
  return (
    <TextLink to="/runs/$runId" params={{ runId: run }} hash={stepAnchor(step)} data-result-step={step} className="font-mono">
      {step}
    </TextLink>
  );
}

/** What a node that runs no session did, as its sentence says it: the card a workflow node sent, linked, or the route a condition took. */
function Routed({ message }: { message: string }) {
  const routed = routedOf(message);
  if (routed?.kind === 'sent')
    return (
      <p data-result-sent={routed.card} className="text-body-medium">
        <span className="text-on-surface-variant">sent </span>
        <TextLink to="/inbox/$name" params={{ name: routed.card }} title={`The card ${routed.card}, and the run it started`}>
          {routed.card}
        </TextLink>
      </p>
    );
  if (routed?.kind === 'routed')
    return (
      <p data-result-route={routed.route} className="text-body-medium">
        <span className="text-on-surface-variant">took the route </span>
        <span className="font-mono">{routed.route}</span>
      </p>
    );
  return null;
}

/**
 * What one final step gave: its name, linked to its part, what it said in a line, then its Gave (fields, files, values); for a node that
 * runs no session, what it did — the card it sent, the route it took.
 */
function Gave({ run, step, now }: { run: RunDetail; step: string; now: Date }) {
  const own = run.steps.find((s) => s.name === step);
  const { gave } = stepPartOf(run, step, now);
  if (!own) return null;
  return (
    <div data-result-gave={step} className="space-y-2">
      <ToPart run={run.id} step={step} />
      <Routed message={own.message} />
      {own.closeout?.summary && <p className="text-body-medium break-words">{own.closeout.summary}</p>}
      {gave !== 'none' && <PartGave step={own} gave={gave} size="L" />}
    </div>
  );
}

/** Whether every final step the run will run is done, and there is one: what the box says of a run that ended with nothing given. */
const finished = (steps: ReturnType<typeof resultStepsOf>): boolean => {
  const owed = steps.filter((s) => s.final && s.stands !== 'skipped');
  return owed.length > 0 && owed.every((s) => s.stands === 'done');
};

/** The run's result: what its final steps gave, each in turn, or where it stands, linked to the step that says it. */
function Result({ run }: { run: RunDetail }) {
  const now = new Date(useNow(30_000));
  const steps = resultStepsOf(run);
  const result = resultOf(steps);
  if (result.kind === 'gave')
    return (
      <div className="space-y-4">
        {result.steps.map((step) => (
          <Gave key={step} run={run} step={step} now={now} />
        ))}
      </div>
    );
  const end = runEndOf(run);
  if (end !== null && result.why !== 'failed')
    return (
      <p data-result-ended={end} className="text-body-medium">
        Nothing given.{' '}
        {end === 'calledOff' ? (
          <>
            The run was <span className={cn('font-medium', ink[ENDED.cancelled.hue])}>{ENDED.cancelled.word}</span> before its last steps
            gave.
          </>
        ) : finished(steps) ? (
          'The run ended, and its last steps finished with nothing to give.'
        ) : (
          'The run ended before its last steps gave.'
        )}
      </p>
    );
  const { words, hue } = STANDS[result.why];
  return (
    <p data-result-stands={result.why} className="text-body-medium">
      Nothing given yet. Where it stands: <span className={cn('font-medium', ink[hue])}>{words}</span>
      {result.step === null ? (
        ', nothing left to run.'
      ) : (
        <>
          {', '}
          <ToPart run={run.id} step={result.step} />.
        </>
      )}
    </p>
  );
}

/** The ask beside the result: the run's brief and the card it came from, then what it gave or where it stands (`resultOf`). */
export function RunResult({ run }: { run: RunDetail }) {
  return (
    <div className="grid items-start gap-6 @3xl/page:grid-cols-2">
      <section aria-label="The ask" data-run-ask className="min-w-0 space-y-3">
        <h2 className="text-label-large text-on-surface-variant">The ask</h2>
        <Markdown>{run.brief}</Markdown>
        {run.fromNote && (
          <p data-from={run.from?.inbox} className="text-body-medium text-on-surface-variant">
            {run.fromNote}
          </p>
        )}
      </section>
      <section aria-label="The result" data-run-result={resultOf(resultStepsOf(run)).kind} className="min-w-0 space-y-3">
        <h2 className="text-label-large text-on-surface-variant">The result</h2>
        <Result run={run} />
      </section>
    </div>
  );
}
