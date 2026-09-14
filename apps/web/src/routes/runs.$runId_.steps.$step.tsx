import { useMemo, useState } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Conversation } from '@/components/conversation/Conversation';
import { PromptBox } from '@/components/conversation/PromptBox';
import { StatusChip, StepNote } from '@/components/StatusChip';
import { runQuery, type RunDetail, type Said } from '@/lib/api';
import { titleOf } from '@/lib/factory';
import { mergeSaid, sayable } from '@/lib/say';
import { foldTranscript, withSaid } from '@/lib/transcript';
import { useStepTranscript } from '@/lib/useStepTranscript';

// `$runId_`: at /runs/$runId/steps/$step, and not drawn inside the run's page, which has no outlet for it.
export const Route = createFileRoute('/runs/$runId_/steps/$step')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(runQuery(params.runId)),
  staticData: { fullBleed: true },
  component: SessionPage,
  errorComponent: ({ error }) => (
    <div className="space-y-3 p-4">
      <Link to="/runs" className="text-sm text-muted-foreground hover:text-foreground">
        ← Runs
      </Link>
      <p className="text-sm text-red-600">Could not load this run: {error instanceof Error ? error.message : String(error)}</p>
    </div>
  ),
});

type Step = RunDetail['steps'][number];

/**
 * One step's session, as a conversation: the whole of it, full height, followed while its task is live — with what a person said to it laid
 * in, and a box below to say something more while it runs.
 */
function SessionPage() {
  const { runId, step: name } = Route.useParams();
  const { data: run } = useSuspenseQuery(runQuery(runId));
  const step = run.steps.find((s) => s.name === name);
  if (!step) {
    return (
      <div className="space-y-3 p-4">
        <BackToRun run={run} />
        <p className="text-sm text-red-600">
          Run {run.id} has no step '{name}'. Its page lists the steps it has.
        </p>
      </div>
    );
  }
  // Keyed by run and step, so one step's conversation never stands in for another's while that one is read.
  return <Session key={`${run.id}/${step.name}`} run={run} step={step} />;
}

function Session({ run, step }: { run: RunDetail; step: Step }) {
  const following = useStepTranscript(run.id, step.name, step.taskId);
  // What this page said that the run, as last read, does not have yet — kept with the task it was said to, so a later try starts afresh.
  const [sent, setSent] = useState<{ taskId: string | null; said: Said[] }>({ taskId: step.taskId, said: [] });
  const said = useMemo(() => mergeSaid(step.said, sent.taskId === step.taskId ? sent.said : []), [step.said, step.taskId, sent]);
  const turns = useMemo(() => withSaid(foldTranscript(following.events), said), [following.events, said]);
  const quiet = (text: string) => <p className="p-6 text-sm text-muted-foreground">{text}</p>;

  return (
    <div className="flex h-[calc(100svh-3rem)] min-h-96 flex-col">
      <header aria-label="The step" className="shrink-0 space-y-1 border-b px-4 py-3">
        <BackToRun run={run} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-semibold">{step.name}</h1>
          <StatusChip status={step.status} runCancelled={run.cancelledAt !== null} />
          {following.live && (
            <span data-following className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-green-500" />
              following live
            </span>
          )}
        </div>
        <StepNote note={step.note} />
        {following.error && <p className="text-sm text-red-600">{following.error}</p>}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        {!step.taskId
          ? quiet('Not filed yet, so there is no session to show.')
          : following.loading
            ? quiet('Reading the conversation…')
            : turns.length
              ? <Conversation turns={turns} live={following.live} className="min-h-0 flex-1" />
              : !following.error && quiet(following.live ? 'Nothing said yet. The page follows the session as it goes.' : 'Its session said nothing the engine can read.')}
      </div>
      <PromptBox
        runId={run.id}
        step={step.name}
        sayable={sayable(run, step)}
        onSaid={(entry) => setSent((before) => ({ taskId: step.taskId, said: [...(before.taskId === step.taskId ? before.said : []), entry] }))}
      />
    </div>
  );
}

function BackToRun({ run }: { run: RunDetail }) {
  return (
    <Link to="/runs/$runId" params={{ runId: run.id }} className="block truncate text-sm text-muted-foreground hover:text-foreground">
      ← {titleOf(run)}
    </Link>
  );
}
