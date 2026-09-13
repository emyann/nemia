import { useCallback, useState } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Check, code, Facts, specRows, Told, when } from '../components/Facts';
import { RunCanvas } from '../components/RunCanvas';
import { StatusChip, StepNote } from '../components/StatusChip';
import { StepInspector } from '../components/StepInspector';
import { runQuery, type RunDetail } from '../lib/api';

export const Route = createFileRoute('/runs/$runId')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(runQuery(params.runId)),
  component: RunPage,
  errorComponent: ({ error }) => (
    <div className="space-y-3">
      <BackToRuns />
      <p className="text-sm text-red-600">
        Could not load this run: {error instanceof Error ? error.message : String(error)}
      </p>
    </div>
  ),
});

type Step = RunDetail['steps'][number];

function RunPage() {
  const { runId } = Route.useParams();
  const { data: run } = useSuspenseQuery(runQuery(runId));
  // Keyed by run: the step selected and where the nodes were dragged belong to the run they were on.
  return <Run key={run.id} run={run} />;
}

function Run({ run }: { run: RunDetail }) {
  const runCancelled = run.cancelledAt !== null;
  const [selected, setSelected] = useState<string | null>(null);
  const close = useCallback(() => setSelected(null), []);
  // A step the folder has lost since it was clicked is off the canvas, and its panel goes with it.
  const inspected = run.steps.find((s) => s.name === selected);

  return (
    <article className="space-y-6">
      <BackToRuns />

      {run.waitingOnYou.length > 0 && (
        <p className="rounded bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Waiting on you: <strong>{run.waitingOnYou.join(', ')}</strong> — signed off blocked, unsigned, refused by its
          check, or out of rounds —{' '}<code>wf decide {run.id}</code>
        </p>
      )}

      {run.warning && (
        <p className="rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
          {run.warning}
        </p>
      )}

      <h1 className="font-mono text-sm text-neutral-500">{run.id}</h1>

      <section aria-label="The run's steps as a graph" className="flex flex-col gap-4 md:flex-row">
        <div className="min-w-0 flex-1">
          <RunCanvas run={run} selected={inspected?.name ?? null} onSelect={setSelected} />
        </div>
        {inspected && <StepInspector run={run} step={inspected} onClose={close} />}
      </section>

      <section className="space-y-4">
        <div className="whitespace-pre-wrap leading-relaxed">{run.brief}</div>
        <Facts
          rows={[
            ['repo', code(run.repo)],
            ['base', code(run.baseRef)],
            ['branch', code(run.branch)],
            ['created', when(run.createdAt)],
            ['cancelled', run.cancelledAt && when(run.cancelledAt)],
            ['workflow', code(run.workflowDir)],
          ]}
        />
      </section>

      {run.steps.map((step) => (
        <StepSection key={step.name} step={step} runCancelled={runCancelled} />
      ))}
    </article>
  );
}

function StepSection({ step, runCancelled }: { step: Step; runCancelled: boolean }) {
  const { spec, closeout } = step;

  return (
    <section className="space-y-4 border-t border-neutral-200 pt-6 dark:border-neutral-800">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold">{step.name}</h2>
          <StatusChip status={step.status} runCancelled={runCancelled} />
        </div>
        <StepNote note={step.note} />
      </div>

      {spec && <Facts rows={specRows(spec)} />}

      {step.check && <Check check={step.check} />}

      {step.body && <div className="whitespace-pre-wrap text-sm leading-relaxed">{step.body}</div>}

      {step.told && <Told told={step.told} filed={step.taskId !== null} />}

      <Facts
        rows={[
          ['branch', code(step.branch)],
          ['task', step.taskId ? code(step.taskId) : 'not filed'],
        ]}
      />

      {closeout && (
        <div className="space-y-2 rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800">
          <p className="whitespace-pre-wrap">{closeout.summary}</p>
          {closeout.needs && (
            <p className="whitespace-pre-wrap text-amber-700 dark:text-amber-400">
              <span className="font-medium">Needs:</span> {closeout.needs}
            </p>
          )}
          {closeout.artifacts.length > 0 && (
            <p className="text-xs text-neutral-500">
              Artifacts: <span className="font-mono">{closeout.artifacts.join(', ')}</span>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function BackToRuns() {
  return (
    <Link to="/runs" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
      ← Runs
    </Link>
  );
}
