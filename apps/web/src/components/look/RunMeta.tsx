import type { WorkflowPageAddress } from '@/lib/api/address';
import { CLOSED_LABEL_KEYS, type Labels as LabelMap } from '@/lib/api/labels';
import { workflowNameOf } from '@/lib/api/workflows';
import { namespaceOf } from '@/lib/factories';
import { Body, Focusable, Tooltip, TooltipTrigger } from '@/components/ui/ds';
import { cn, focusRing } from '@/components/ui/ds/utils';
import { workflowTarget } from '../workflow/WorkflowLink';
import { CopyId } from './CopyId';
import { TextLink } from './TextLink';

/** The labels of `map` a person put on it, in key order: every one but the store's own `factory` and `workflow`. */
const ownOf = (map: Readonly<LabelMap>) =>
  Object.entries(map)
    .filter(([key]) => !CLOSED_LABEL_KEYS.includes(key))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

/**
 * A run's own labels, quiet: each its value alone in the meta line's ink, its whole `key=value` in the kit's tooltip and said aloud, a
 * link to its label page; every key drawn alike, the store's `factory` and `workflow` left to the line that says them. None for none.
 * With `keys`, each is written whole, `key=value`, in a hairline box, as the run's panel says them.
 */
export function QuietLabels({ labels, keys = false }: { labels: Readonly<LabelMap>; keys?: boolean }) {
  const entries = ownOf(labels);
  if (entries.length === 0) return null;
  return (
    <span data-quiet-labels className={cn('inline-flex min-w-0 items-center', keys ? 'flex-wrap gap-1.5' : 'gap-2.5')}>
      {entries.map(([key, value]) => (
        <TooltipTrigger key={key} delay={300}>
          <TextLink
            to="/labels/$key/$value"
            params={{ key, value }}
            data-label={`${key}=${value}`}
            aria-label={`${key}=${value}`}
            className={cn(
              'text-body-small font-medium whitespace-nowrap text-on-surface-variant hover:text-on-surface',
              keys && 'border border-outline-variant px-1.5',
            )}
          >
            {keys ? `${key}=${value}` : value}
          </TextLink>
          <Tooltip>{`${key}=${value}`}</Tooltip>
        </TooltipTrigger>
      ))}
    </span>
  );
}

/** The tag mark before a run's labels, in the outline's ink: a label's shape with its hole. */
function TagMark() {
  return (
    <svg data-tag-mark width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="shrink-0 text-outline">
      <path d="M1.5,2.5 H7 L10.5,6 L7,9.5 H1.5 Z" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="4.2" cy="6" r="0.9" fill="currentColor" />
    </svg>
  );
}

/** Where a run runs, its factory and its workflow as a path, the workflow's folder whole in the kit's tooltip, linked where asked. */
function Where({
  factory,
  workflowDir,
  workflowPage,
}: {
  factory: string;
  workflowDir: string;
  workflowPage?: WorkflowPageAddress | null;
}) {
  const workflow = workflowNameOf(workflowDir);
  return (
    <span data-run-where className="inline-flex items-center gap-1.25">
      <span data-factory={factory}>{factory}</span>
      <span aria-hidden="true" className="text-on-surface-variant">
        /
      </span>
      <TooltipTrigger delay={300}>
        {workflowPage === undefined ? (
          <Focusable>
            <span
              data-workflow={workflow}
              role="img"
              aria-label={workflow}
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the keyboard opens the folder's tooltip by focusing it
              tabIndex={0}
              className={focusRing()}
            >
              {workflow}
            </span>
          </Focusable>
        ) : (
          <TextLink {...workflowTarget(workflowPage)} data-workflow={workflow} className="text-on-surface-variant">
            {workflow}
          </TextLink>
        )}
        <Tooltip>{workflowDir}</Tooltip>
      </TooltipTrigger>
    </span>
  );
}

/**
 * What a run is, in one quiet line under its title, in three groups: its id's last four characters with a copy control; where it runs,
 * its factory and its workflow as a path (`nemia / quick`), the workflow's folder whole in the kit's tooltip on hover and on focus and,
 * where `workflowPage` is given, linked as `WorkflowLink` links it (`workflowTarget`); then, past a thin divider and a tag mark, its
 * own labels, quiet (`QuietLabels`). A run with no labels of its own draws neither the divider nor the mark. `whole`, the run's panel's
 * head: its whole id, and its labels on a line of their own, each `key=value`. `labels` false leaves the labels out, as a card at md
 * does.
 */
export function RunMeta({
  run,
  workflowPage,
  whole = false,
  labels = true,
}: {
  run: { id: string; factory: string | null; workflowDir: string; labels: Readonly<Record<string, string>> };
  workflowPage?: WorkflowPageAddress | null;
  whole?: boolean;
  labels?: boolean;
}) {
  const labelled = labels && Object.keys(run.labels).some((key) => !CLOSED_LABEL_KEYS.includes(key));
  const where = <Where factory={namespaceOf(run.factory)} workflowDir={run.workflowDir} workflowPage={workflowPage} />;
  if (whole)
    return (
      <Body size="small" component="span" colorRole="on-surface-variant" data-run-meta className="flex min-w-0 flex-col gap-1.5 font-medium">
        <span className="flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-1">
          <CopyId id={run.id} />
          {where}
        </span>
        {labelled && (
          <span className="inline-flex min-w-0 items-center gap-2">
            <TagMark />
            <QuietLabels labels={run.labels} keys />
          </span>
        )}
      </Body>
    );
  return (
    <Body size="small" component="span" colorRole="on-surface-variant" data-run-meta className="flex min-w-0 items-center gap-3.5 font-medium whitespace-nowrap">
      <CopyId id={run.id} short />
      {where}
      {labelled && (
        <span className="inline-flex min-w-0 items-center gap-3.5">
          <i aria-hidden="true" className="block h-3 w-px shrink-0 bg-outline-variant" />
          <span className="inline-flex min-w-0 items-center gap-2">
            <TagMark />
            <QuietLabels labels={run.labels} />
          </span>
        </span>
      )}
    </Body>
  );
}
