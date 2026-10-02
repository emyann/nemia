/**
 * The frame's floating bar for one step of a run: the step's tabs (`StepTabs`), read from the run's record, which a read again keeps current.
 */
import { useQuery } from '@tanstack/react-query';
import { runGone, runQuery } from '@/lib/api';
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
  const step = run?.steps.find((s) => s.name === name);
  return (
    <FloatingBar title={name} description={run ? titleOf(run) : id}>
      {runGone(error) && run ? (
        <RunGone run={run} />
      ) : error && !run ? (
        <p className="text-sm text-red-700 dark:text-red-400">
          Could not read the run {id}: {error instanceof Error ? error.message : String(error)}
        </p>
      ) : !run ? (
        <p className="text-xs text-neutral-500">Reading the run…</p>
      ) : !step ? (
        <p data-no-step className="text-sm text-amber-700 dark:text-amber-400">
          {titleOf(run)} has no step named {name}.
        </p>
      ) : (
        <StepTabs run={run} step={step} className="h-full" />
      )}
    </FloatingBar>
  );
}
