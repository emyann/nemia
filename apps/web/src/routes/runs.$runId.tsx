import type { ReactNode } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { StatusChip } from '../components/StatusChip';
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
  const runCancelled = run.cancelledAt !== null;

  return (
    <article className="space-y-6">
      <BackToRuns />

      {run.waitingOnYou.length > 0 && (
        <p className="rounded bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Waiting on you: <strong>{run.waitingOnYou.join(', ')}</strong> signed off blocked —{' '}
          <code>wf decide {run.id}</code>
        </p>
      )}

      {run.warning && (
        <p className="rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
          {run.warning}
        </p>
      )}

      <header className="space-y-4">
        <h1 className="font-mono text-sm text-neutral-500">{run.id}</h1>
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
      </header>

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
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">{step.name}</h2>
        <StatusChip status={step.status} runCancelled={runCancelled} />
      </div>

      {spec && (
        <Facts
          rows={[
            ['harness', code(spec.harness)],
            ['model', code(spec.model)],
            ['after', spec.after.length ? code(spec.after.join(', ')) : null],
            ['resume', code(spec.resume)],
            ['permission mode', code(spec.permissionMode)],
            ['deadline', spec.deadlineSeconds === null ? null : `${spec.deadlineSeconds} s`],
            ['max attempts', spec.maxAttempts],
          ]}
        />
      )}

      {step.body && <div className="whitespace-pre-wrap text-sm leading-relaxed">{step.body}</div>}

      {step.told && (
        <details className="text-sm">
          <summary className="cursor-pointer text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
            What it was told
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-neutral-100 p-3 text-xs dark:bg-neutral-900">
            {step.told}
          </pre>
        </details>
      )}

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
    <Link to="/" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
      ← Runs
    </Link>
  );
}

/** Label and value, one per row. A value that is not set reads as a dash. */
function Facts({ rows }: { rows: Array<[label: string, value: ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-neutral-500">{label}</dt>
          <dd className="min-w-0 break-words">{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

const code = (value: string | null) => (value === null ? null : <span className="font-mono text-xs">{value}</span>);

const when = (iso: string) => <time dateTime={iso}>{new Date(iso).toLocaleString()}</time>;
