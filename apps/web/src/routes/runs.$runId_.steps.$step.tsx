import { useMemo, useState } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { DebugPanel } from '@/components/DebugPanel';
import { SessionRetryingBand, SessionStoppedBand, SessionUnreadableBand } from '@/components/session/SessionBand';
import { SessionComposer } from '@/components/session/SessionComposer';
import { SessionQuiet, SessionTalk } from '@/components/session/SessionTalk';
import { RunGone } from '@/components/RunGone';
import { StatusChip, StepNote } from '@/components/StatusChip';
import { loadRun, runGone, runQuery, type RunDetail, type Said } from '@/lib/api';
import { titleOf } from '@/lib/factory';
import { mergeSaid, sayable } from '@/lib/say';
import { isGate, stepState } from '@/lib/status';
import { foldTranscript, heardIn, sessionToRead, withSaid, type Turn } from '@/lib/transcript';
import { useStepTranscript, type Following } from '@/lib/useStepTranscript';

/**
 * The page of a step's session, at /runs/$runId/steps/$step: `$runId_` draws it on its own, not inside the run's page, which has no outlet
 * for it.
 */
export const Route = createFileRoute('/runs/$runId_/steps/$step')({
  loader: ({ context, params }) => loadRun(context.queryClient, params.runId),
  staticData: { fullBleed: true },
  component: SessionPage,
  errorComponent: ({ error }) => (
    <div className="space-y-3 p-4">
      <Link to="/runs" className="text-body-medium text-muted-foreground hover:text-foreground">
        ← Runs
      </Link>
      <p className="text-body-medium text-failure">Could not load this run: {error instanceof Error ? error.message : String(error)}</p>
    </div>
  ),
});

type Step = RunDetail['steps'][number];

/**
 * The page of a step's session, or, when the store has no run of its id as the page loads (`loadRun`), the words that say so, by the
 * run's id: the address of a run removed, or of none.
 */
function SessionPage() {
  const { runId, step: name } = Route.useParams();
  if (Route.useLoaderData().gone) {
    return (
      <div className="space-y-3 p-4">
        <Link to="/runs" className="text-body-medium text-muted-foreground hover:text-foreground">
          ← Runs
        </Link>
        <RunGone id={runId} />
      </div>
    );
  }
  return <SessionRead runId={runId} name={name} />;
}

/**
 * The session of the step `name` of the run `runId`, as a conversation: the whole of it, full height, followed while its task is live —
 * with what a person said to it laid in, and a box below to say something more while it runs. A run removed while the page is open is
 * said to be gone, and its session is neither followed nor offered words. The session is keyed by run and step, so one step's
 * conversation never stands in for another's while that one is read.
 */
function SessionRead({ runId, name }: { runId: string; name: string }) {
  const { data: run, error } = useSuspenseQuery(runQuery(runId));
  if (runGone(error)) {
    return (
      <div className="space-y-3 p-4">
        <Link to="/runs" className="text-body-medium text-muted-foreground hover:text-foreground">
          ← Runs
        </Link>
        <RunGone run={run} />
      </div>
    );
  }
  const step = run.steps.find((s) => s.name === name);
  if (!step) {
    return (
      <div className="space-y-3 p-4">
        <BackToRun run={run} />
        <p className="text-body-medium text-failure">
          Run {run.id} has no step '{name}'. Its page lists the steps it has.
        </p>
      </div>
    );
  }
  return <Session key={`${run.id}/${step.name}`} run={run} step={step} />;
}

/**
 * The session of `step` in `run`: its header, its Debug panel, the bands over its talk, its talk, and the composer under it — which is
 * drawn only while there is a session to say anything to, the stopped band standing in its place where there is not (`sayable`).
 *
 * The transcript is told whether the step waits on a person's word — its session over, nothing of it running — and never whether the
 * run is held: a hold (the CLI's
 * `hold`) answers nothing, and the session runs or rests as it did. What this page said that the run, as last read, does not have yet is
 * kept with the task it was said to, so a later try starts afresh. Words the transcript shows reaching the session are drawn once, as what
 * was said, where they reached it (`heardIn`).
 */
function Session({ run, step }: { run: RunDetail; step: Step }) {
  const cancelled = run.cancelledAt !== null;
  const following = useStepTranscript(run.id, step.name, sessionToRead(step), isGate(stepState(step.status, cancelled, false), cancelled));
  const [sent, setSent] = useState<{ taskId: string | null; said: Said[] }>({ taskId: step.taskId, said: [] });
  const said = useMemo(() => mergeSaid(step.said, sent.taskId === step.taskId ? sent.said : []), [step.said, step.taskId, sent]);
  const turns = useMemo(() => {
    const heard = heardIn(following.events, said);
    return withSaid(foldTranscript(heard.events), heard.said);
  }, [following.events, said]);
  const say = sayable(run, step);
  return (
    <div className="flex h-[calc(100svh-var(--frame-top))] min-h-96 flex-col">
      <header aria-label="The step" className="shrink-0 space-y-1 border-b px-4 py-3">
        <BackToRun run={run} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-semibold">{step.name}</h1>
          <StatusChip status={step.status} runCancelled={run.cancelledAt !== null} runHeld={run.holding != null} />
          {following.live && (
            <span
              data-following
              data-streamed={following.streamed || undefined}
              className="inline-flex items-center gap-1.5 text-body-small text-muted-foreground"
            >
              <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-alive" />
              following live
            </span>
          )}
        </div>
        <StepNote note={step.note} />
      </header>
      <DebugPanel run={run} step={step} />
      <div className="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col gap-3 px-4 pt-3 pb-4">
        {following.retrying !== null && <SessionRetryingBand why={following.retrying} />}
        {following.error !== null && <SessionUnreadableBand why={following.error} />}
        {!say.open && <SessionStoppedBand why={say.why} />}
        <SessionBody step={step} following={following} turns={turns} />
        {say.open && (
          <SessionComposer
            runId={run.id}
            step={step.name}
            line={step.commands.say}
            onSaid={(entry) =>
              setSent((before) => ({ taskId: step.taskId, said: [...(before.taskId === step.taskId ? before.said : []), entry] }))
            }
          />
        )}
      </div>
    </div>
  );
}

/**
 * The session's talk, `turns` folded off what `following` read, and the message being written after them: or why there is none — the
 * step not filed, no session of its task started (`sessionToRead`), its conversation still being read, or nothing in it the engine can
 * read, each of which the family's empty shell carries (`SessionQuiet`).
 */
function SessionBody({ step, following, turns }: { step: Step; following: Following; turns: Turn[] }) {
  if (!step.taskId) return <SessionQuiet words="Not filed yet, so there is no session to show." />;
  if (!sessionToRead(step)) return <SessionQuiet words="No session of it has started yet, so there is no conversation to show." />;
  if (following.loading) return <SessionQuiet words="Reading the conversation…" />;
  if (turns.length || following.partial)
    return <SessionTalk who={step.name} turns={turns} live={following.live} writing={following.partial?.text ?? null} />;
  if (following.error !== null) return null;
  return (
    <SessionQuiet
      words={
        following.live ? 'Nothing said yet. The page follows the session as it goes.' : 'Its session said nothing the engine can read.'
      }
    />
  );
}

function BackToRun({ run }: { run: RunDetail }) {
  return (
    <Link
      to="/runs/$runId"
      params={{ runId: run.id }}
      className="block truncate text-body-medium text-muted-foreground hover:text-foreground"
    >
      ← {titleOf(run)}
    </Link>
  );
}
