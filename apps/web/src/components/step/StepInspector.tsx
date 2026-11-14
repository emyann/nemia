import { lazy, Suspense, useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { agentsQuery } from '../../lib/api/agents';
import type { RunDetail, StepView } from '../../lib/runView';
import { waitsAtGate, stepState } from '../../lib/status';
import { foldTranscript, sessionToRead } from '../../lib/transcript';
import { useStepTranscript, type Following } from '../../lib/useStepTranscript';
import { cn } from '../../lib/utils';
import { StepPart } from './part/StepPart';

/** A step's talk, loaded once the bar draws it: the family's talk and the step's own parts are not needed to read the canvas. */
const SessionTalk = lazy(() => import('./session/SessionTalk').then((m) => ({ default: m.SessionTalk })));

type Step = StepView;

/**
 * What is going on in one step, in one scroll: its part whole (`StepPart` at L) — what it asks of you, what it got, said and gave, and
 * its detail, of the try the address shows — then the tail of its conversation under it. The conversation is keyed by run and step, so
 * one never stands in for another step's while that one is read. `className` places it in what holds it.
 */
export function StepInspector({ run, step, className }: { run: RunDetail; step: Step; className?: string }) {
  const agents = useQuery(agentsQuery);
  return (
    <div data-step-scope={step.name} className={cn('flex flex-col gap-4 overflow-auto p-3', className)}>
      <StepPart view={run} step={step.name} size="L" agents={agents.data} />
      <section aria-label="Its conversation" className="flex flex-col gap-2">
        <h3 className="text-label-medium text-on-surface-variant uppercase">Its conversation</h3>
        <Activity key={`${run.id}/${step.name}`} run={run} step={step} />
      </section>
    </div>
  );
}

/** How many of the conversation's last turns the bar draws: its tail, with the whole of it a click away. */
export const ACTIVITY_TURNS = 30;

/**
 * The tail of the step's conversation — the session page's, read and followed the same way — and the way to the whole of it. It is followed
 * until the step waits on a person's word, its session over, and never stops for `held`: a hold on the run (the CLI's `hold`) answers
 * nothing, and the session runs or rests as it did.
 */
function Activity({ run, step }: { run: RunDetail; step: Step }) {
  const cancelled = run.cancelledAt !== null;
  const following = useStepTranscript(run.id, step.name, sessionToRead(step), waitsAtGate(stepState(step, cancelled, false), cancelled));
  return <ActivityTail run={run} step={step} following={following} />;
}

/**
 * What the bar draws of the conversation `following` holds: its last `ACTIVITY_TURNS` turns, compact, and the way to the
 * whole of it.
 */
export function ActivityTail({ run, step, following }: { run: RunDetail; step: Step; following: Following }) {
  const turns = useMemo(() => foldTranscript(following.events), [following.events]);
  const tail = turns.slice(-ACTIVITY_TURNS);

  if (!step.taskId) return <p className="text-muted-foreground">Not filed yet, so there is no conversation.</p>;
  if (!sessionToRead(step)) return <p className="text-muted-foreground">No session of it has started, so there is no conversation yet.</p>;

  return (
    <>
      <div className="flex items-baseline justify-between gap-2 text-body-small text-muted-foreground">
        <p>
          {following.loading ? 'Reading its conversation…' : following.live ? 'Followed as it runs.' : 'Not running, so not followed.'}
          {tail.length < turns.length && ` The last ${tail.length} of ${turns.length}.`}
        </p>
        <Link
          to="/runs/$runId/steps/$step"
          params={{ runId: run.id, step: step.name }}
          className="shrink-0 font-medium text-foreground underline-offset-2 hover:underline"
        >
          Open the session
        </Link>
      </div>
      {following.error && <p className="text-body-small text-failure">{following.error}</p>}
      {!following.loading &&
        (tail.length ? (
          <Suspense fallback={<p className="text-muted-foreground">Reading its conversation…</p>}>
            <SessionTalk who={step.name} turns={tail} live={following.live} density="compact" />
          </Suspense>
        ) : (
          !following.error && (
            <p className="text-muted-foreground">
              {following.live ? 'Nothing said yet.' : 'Its session said nothing the engine can read.'}
            </p>
          )
        ))}
    </>
  );
}
