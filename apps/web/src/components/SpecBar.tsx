/**
 * The frame's floating bar for a step of a workflow: what its node on the workflow's canvas says, in a bar beside it — what it runs on,
 * its keys, and the steps it waits on — read from the workflows the Workflows page lists. Its page, which Open visits, has what it is told
 * and its keys explained.
 */
import { useQuery } from '@tanstack/react-query';
import { workflowsQuery, type WorkflowListing } from '@/lib/api';
import { FloatingBar } from './FloatingBar';
import { runsOn, specLines } from './StepNode';

/** Where a workflow is read from, as its card on the Workflows page tags it. */
const fromWord = (from: 'repo' | 'yours'): string => (from === 'yours' ? 'yours' : 'this repository');

/**
 * The bar for the step `step` of the workflow `workflow` read from `from`, titled by the step's name, saying whose workflow it is under the
 * title. While the workflows are read it says so; a read that failed, and a workflow or a step the api lists none by, are each said in the
 * bar, which stays open until a person closes it.
 */
export function SpecBar({ from, workflow, step }: { from: 'repo' | 'yours'; workflow: string; step: string }) {
  const workflows = useQuery(workflowsQuery);
  const listing = workflows.data?.find((w) => w.from === from && w.name === workflow);
  return (
    <FloatingBar
      title={<span className="break-all">{step}</span>}
      description={
        <span className="break-all">
          a step of <span className="font-mono">{workflow}</span> · {fromWord(from)}
        </span>
      }
    >
      <div data-spec-bar={`${from}/${workflow}/${step}`} className="space-y-5">
        {listing ? (
          <SpecBody listing={listing} step={step} />
        ) : (
          <Unread workflow={workflow} error={workflows.error} read={workflows.data !== undefined} />
        )}
      </div>
    </FloatingBar>
  );
}

/**
 * What the bar holds for a workflow not shown yet: why the read failed, `error`; that no workflow is named `workflow` once `read`; else
 * that it reads.
 */
function Unread({ workflow, error, read }: { workflow: string; error: Error | null; read: boolean }) {
  if (error) return <p className="text-sm text-red-700 dark:text-red-400">Could not read the workflows: {error.message}</p>;
  if (read) return <p className="text-sm text-amber-700 dark:text-amber-400">No workflow is named {workflow}.</p>;
  return <p className="text-xs text-neutral-500">Reading the workflows…</p>;
}

/**
 * What the bar holds for the step `step` of `listing`: what it runs on (`runsOn`); its keys as its node lists them (`specLines`), each
 * written whole, the tools by name where the node counts them; and the steps it waits on, the source of each `after` edge into it in the
 * workflow's order, or that it waits on none. Where it has no such step, or the workflow does not read, it says so.
 */
export function SpecBody({ listing, step: name }: { listing: WorkflowListing; step: string }) {
  const step = listing.steps.find((s) => s.name === name);
  if (listing.error)
    return (
      <p className="text-sm text-red-700 dark:text-red-400">
        {listing.name} does not read as a workflow: {listing.error}
      </p>
    );
  if (!step)
    return (
      <p className="text-sm text-amber-700 dark:text-amber-400">
        {listing.name} has no step named {name}.
      </p>
    );
  const sources = new Set(listing.graph.edges.filter((e) => e.kind === 'after' && e.to === name).map((e) => e.from));
  const waits = listing.steps.map((s) => s.name).filter((s) => sources.has(s));
  return (
    <>
      <section aria-label="Runs on" className="space-y-1">
        <h3 className="text-xs font-medium text-muted-foreground">Runs on</h3>
        <p className="font-mono" data-runs-on>
          {runsOn(step.spec)}
        </p>
      </section>
      <section aria-label="Keys" className="space-y-1">
        <h3 className="text-xs font-medium text-muted-foreground">Keys</h3>
        <dl className="space-y-1">
          {specLines(step.spec).map(([label, value, whole = value]) => (
            <div key={label} className="flex min-w-0 gap-2">
              <dt className="w-16 shrink-0 text-muted-foreground">{label}</dt>
              <dd className="min-w-0 font-mono break-words">{whole}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-label="Waits on" className="space-y-1">
        <h3 className="text-xs font-medium text-muted-foreground">Waits on</h3>
        <p data-waits-on>{waits.length ? <span className="font-mono">{waits.join(', ')}</span> : 'nothing: it starts first'}</p>
      </section>
    </>
  );
}
