import { lazy, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { agentsQuery } from '../../lib/api/agents';
import type { RunDetail, StepView } from '../../lib/runView';
import { waitsAtGate, stepState } from '../../lib/status';
import { foldTranscript, sessionToRead } from '../../lib/transcript';
import { useStepTranscript, type Following } from '../../lib/useStepTranscript';
import { Button } from '@/components/ui/ds';
import { StepPart } from './part/StepPart';
import { SaidAway } from './session/SessionOwn';
import { SessionReading } from './session/SessionReading';

/** A step's talk, loaded once the bar draws it: the family's talk and the step's own parts are not needed to read the canvas. */
const SessionTalk = lazy(() => import('./session/SessionTalk').then((m) => ({ default: m.SessionTalk })));

type Step = StepView;

/** The part's body as the bar draws it: on the bar's own frame, over the padding of the bar's body, the part's body having its own. */
const onTheBar = (body: ReactNode) => <div className="-m-4">{body}</div>;

/**
 * What the step bar holds of one step: its part whole (`StepPart` at L) — what it asks of you, what it got, said and gave, and its detail,
 * of the try the address shows — drawn on the bar's own cut frame, its head linking to no page, the bar's menu holding Open, and with
 * `said` scrolled in the bar to its Said once drawn; or, while `talk`, the tail of its conversation in its place, under a Back that calls
 * `onBack`, its closeout's Read what it said calling `onSaid`. The conversation is read and followed only while it is shown, and keyed by
 * run and step, so one never stands in for another step's while that one is read.
 * @param props.run The run the step is of.
 * @param props.step The step.
 * @param props.talk Whether its conversation is shown, in place of its part.
 * @param props.said Whether its part is scrolled to its Said once drawn.
 * @param props.onBack What Back does: shows its part again.
 * @param props.onSaid What its closeout's Read what it said does: shows its part again, scrolled to its Said.
 */
export function StepInspector({
  run,
  step,
  talk,
  said,
  onBack,
  onSaid,
}: {
  run: RunDetail;
  step: Step;
  talk: boolean;
  said: boolean;
  onBack: () => void;
  onSaid: () => void;
}) {
  const agents = useQuery(agentsQuery);
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (said && !talk && card.current) toSaidIn(card.current, step.name);
  }, [said, talk, step.name]);
  if (!talk)
    return (
      <div ref={card} className="contents">
        <StepPart view={run} step={step.name} size="L" agents={agents.data} here frame={onTheBar} />
      </div>
    );
  return (
    <section data-step-scope={step.name} aria-label="Its conversation" className="flex flex-col gap-2">
      <Button variant="outlined" size="xsmall" icon={ArrowLeft} onPress={onBack} className="self-start">
        Back to the step
      </Button>
      <SaidAway value={onSaid}>
        <Activity key={`${run.id}/${step.name}`} run={run} step={step} />
      </SaidAway>
    </section>
  );
}

/** The room left above the Said slot once it is scrolled to: the slot's own `scroll-mt-4`. */
const SAID_MARGIN = 16;

/**
 * Scrolls the bar's body that holds `card` to the Said slot of the step `step` in it, that scroll alone, as `scrollIntoView` would move
 * the window too; nothing where the part has no Said.
 */
function toSaidIn(card: HTMLElement, step: string) {
  const slot = card.querySelector(`[data-part-said="${CSS.escape(step)}"]`);
  const body = card.closest<HTMLElement>('[data-bar-body]');
  if (!slot || !body) return;
  const top = slot.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
  body.scrollTo({ top: Math.max(0, top - SAID_MARGIN) });
}

/** What a screen reader hears while the bar's conversation is first read, or its talk is loaded. */
const READING = 'Reading its conversation…';

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

  if (!step.taskId) return <p className="text-on-surface-variant">Not filed yet, so there is no conversation.</p>;
  if (!sessionToRead(step))
    return <p className="text-on-surface-variant">No session of it has started, so there is no conversation yet.</p>;

  return (
    <>
      <div className="flex items-baseline justify-between gap-2 text-body-small text-on-surface-variant">
        <p>
          {!following.loading && (following.live ? 'Followed as it runs.' : 'Not running, so not followed.')}
          {tail.length < turns.length && ` The last ${tail.length} of ${turns.length}.`}
        </p>
        <Link
          to="/runs/$runId/steps/$step"
          params={{ runId: run.id, step: step.name }}
          className="shrink-0 font-medium text-on-surface underline-offset-2 hover:underline"
        >
          Open the session
        </Link>
      </div>
      {following.error && <p className="text-body-small text-failure">{following.error}</p>}
      {following.loading ? (
        <SessionReading words={READING} density="compact" />
      ) : tail.length ? (
        <Suspense fallback={<SessionReading words={READING} density="compact" />}>
          <SessionTalk who={step.name} turns={tail} live={following.live} density="compact" />
        </Suspense>
      ) : (
        !following.error && (
          <p className="text-on-surface-variant">
            {following.live ? 'Nothing said yet.' : 'Its session said nothing the engine can read.'}
          </p>
        )
      )}
    </>
  );
}
