import type { WorkflowPageAddress } from '@/lib/api/address';
import { workflowNameOf } from '@/lib/api/workflows';
import { namespaceOf } from '@/lib/factories';
import { QuietLabels } from '../field/Labels';
import { workflowTarget } from '../workflow/WorkflowLink';
import { CopyId, TextLink } from '../look';

/** The tag mark before a run's labels, in the outline's ink: a label's shape with its hole. */
function TagMark() {
  return (
    <svg data-tag-mark width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="shrink-0 text-outline">
      <path d="M1.5,2.5 H7 L10.5,6 L7,9.5 H1.5 Z" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="4.2" cy="6" r="0.9" fill="currentColor" />
    </svg>
  );
}

/**
 * What a run is, in one quiet line under its title, in three groups: its id's last four characters with a copy control; where it runs,
 * its factory and its workflow as a path (`nemia / quick`), the workflow's folder whole on hover and, where `workflowPage` is given,
 * linked as `WorkflowLink` links it (`workflowTarget`); then, past a thin divider and a tag mark, its own labels, quiet
 * (`QuietLabels`). A run with no labels of its own draws neither the divider nor the mark.
 */
export function RunMeta({
  run,
  workflowPage,
}: {
  run: { id: string; factory: string | null; workflowDir: string; labels: Readonly<Record<string, string>> };
  workflowPage?: WorkflowPageAddress | null;
}) {
  const workflow = workflowNameOf(run.workflowDir);
  const factory = namespaceOf(run.factory);
  const labelled = Object.keys(run.labels).some((key) => key !== 'factory' && key !== 'workflow');
  return (
    <span data-run-meta className="flex min-w-0 items-center gap-3.5 text-body-small font-medium whitespace-nowrap text-on-surface-variant">
      <CopyId id={run.id} short />
      <span data-run-where className="inline-flex items-center gap-1.25">
        <span data-factory={factory}>{factory}</span>
        <span aria-hidden="true" className="text-outline">
          /
        </span>
        {workflowPage === undefined ? (
          <span data-workflow={workflow} title={run.workflowDir}>
            {workflow}
          </span>
        ) : (
          <TextLink {...workflowTarget(workflowPage)} title={run.workflowDir} data-workflow={workflow} className="text-on-surface-variant">
            {workflow}
          </TextLink>
        )}
      </span>
      {labelled && (
        <span className="inline-flex min-w-0 items-center gap-3.5">
          <i aria-hidden="true" className="block h-3 w-px shrink-0 bg-outline-variant" />
          <span className="inline-flex min-w-0 items-center gap-2">
            <TagMark />
            <QuietLabels labels={run.labels} />
          </span>
        </span>
      )}
    </span>
  );
}
