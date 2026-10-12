/**
 * The frame's floating bar for one step of a run: the step's tabs (`StepTabs`), read from the run's record, which a read again keeps
 * current.
 */
import { useQuery } from '@tanstack/react-query';
import { runGone, runQuery, type RunDetail } from '@/lib/api';
import { titleOf } from '@/lib/factory';
import { FloatingBar } from './FloatingBar';
import { RunGone } from './RunGone';
import { StepTabs } from './StepInspector';

/**
 * The bar for the step `step` of the run `run`, titled by the step and described by its run's title. While the run is read it says so; a
 * run gone from the store, a read that failed and a step the run no longer has are each said in the bar, which stays open until a person
 * closes it: a read never writes the address.
 */
export function StepBar({ run: id, step: name }: { run: string; step: string }) {
  const { data: run, error } = useQuery(runQuery(id));
  return (
    <FloatingBar title={name} description={run ? titleOf(run) : id}>
      <StepBody id={id} name={name} run={run} error={error} />
    </FloatingBar>
  );
}

/** What the step bar holds for the step `name` of the run `id`, as `run` was last read and `error` its read's failure, if any. */
function StepBody({ id, name, run, error }: { id: string; name: string; run: RunDetail | undefined; error: unknown }) {
  if (run && runGone(error)) return <RunGone run={run} />;
  if (!run) return <Unread id={id} error={error} />;
  const step = run.steps.find((s) => s.name === name);
  if (!step) {
    return (
      <p data-no-step className="text-sm text-amber-700 dark:text-amber-400">
        {titleOf(run)} has no step named {name}.
      </p>
    );
  }
  return <StepTabs run={run} step={step} className="h-full" />;
}

/** A bar's body for the run `id` not read yet: that it is read, or, with `error`, why the read failed. */
export function Unread({ id, error }: { id: string; error: unknown }) {
  return error ? (
    <p className="text-sm text-red-700 dark:text-red-400">
      Could not read the run {id}: {error instanceof Error ? error.message : 'the api gave no reason'}
    </p>
  ) : (
    <p className="text-xs text-muted-foreground">Reading the run…</p>
  );
}
