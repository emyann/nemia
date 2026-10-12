/**
 * The frame's floating bar for a run: what a person needs to see of it without leaving the floor — what it asks of them, its steps and
 * their statuses, and its brief — read from the run's record, which a read again keeps current. Its page, which Open visits, has the rest.
 */
import { useQuery } from '@tanstack/react-query';
import { runGone, runQuery, type RunDetail } from '@/lib/api';
import { titleOf } from '@/lib/factory';
import { useBar } from '@/lib/useBar';
import { FavoriteStar } from './FavoriteStar';
import { FloatingBar } from './FloatingBar';
import { Markdown } from './Markdown';
import { NeedsBanner, ToDecideBanner } from './Needs';
import { RunGone } from './RunGone';
import { StatusChip } from './StatusChip';
import { Unread } from './StepBar';

/**
 * The bar for the run `run`, titled by the run once read, with its id under the title and its star beside Open. While the run is read
 * it says so; a run gone from the store and a read that failed are each said in the bar, which stays open until a person closes it: a
 * read never writes the address.
 */
export function RunBar({ run: id }: { run: string }) {
  const { data: run, error } = useQuery(runQuery(id));
  return (
    <FloatingBar
      title={run ? titleOf(run) : id}
      description={<span className="font-mono text-body-small">{id}</span>}
      actions={<FavoriteStar favorite={{ kind: 'run', run: id }} name={run ? titleOf(run) : id} className="-mt-0.5" />}
    >
      <RunBody id={id} run={run} error={error} />
    </FloatingBar>
  );
}

/**
 * What the run bar holds for the run `id`, as `run` was last read and `error` its read's failure, if any: what is to decide and who it
 * waits on, as the run's page says them, each step they name a button that shows the step in the bar; its steps, each a button with its
 * status that shows it in the bar; and its brief.
 */
export function RunBody({ id, run, error }: { id: string; run: RunDetail | undefined; error: unknown }) {
  const { show } = useBar();
  if (run && runGone(error)) return <RunGone run={run} />;
  if (!run) return <Unread id={id} error={error} />;
  const onStep = (step: string) => show({ kind: 'step', run: id, step });
  return (
    <>
      <ToDecideBanner run={run} onStep={onStep} />
      <NeedsBanner run={run} onStep={onStep} />
      <section aria-label="Steps" className="space-y-1">
        <h3 className="text-label-medium text-muted-foreground">Steps</h3>
        <ul className="space-y-0.5">
          {run.steps.map((step) => (
            <li key={step.name}>
              <button
                type="button"
                data-step={step.name}
                onClick={() => onStep(step.name)}
                className="flex w-full items-center justify-between gap-3 rounded px-2 py-1 text-left hover:bg-muted"
              >
                <span className="min-w-0 truncate font-mono text-body-small">{step.name}</span>
                <StatusChip status={step.status} runCancelled={run.cancelledAt !== null} runHeld={run.holding != null} />
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Brief" className="space-y-1">
        <h3 className="text-label-medium text-muted-foreground">Brief</h3>
        <Markdown className="text-body-medium">{run.brief}</Markdown>
      </section>
    </>
  );
}
