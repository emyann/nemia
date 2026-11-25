import type { WorkflowPageAddress } from '../../lib/api/address.ts';
import { AgentLink } from '../agent/AgentParts';
import { WorkflowLink } from '../workflow/WorkflowLink';
import { Body, Label } from '@/components/ui/ds';

/** The tag a try's run wears on Runs, on the Factory and on its own page: started from an agent's page, and not from a workflow. */
export function TryTag({ agent }: { agent: string }) {
  return (
    <Label
      size="small"
      component="span"
      colorRole="on-surface-variant"
      data-try-tag={agent}
      title={`A try of the agent ${agent}, started from its page: fenced to its own folder, with a dollar to spend`}
      className="shrink-0 rounded-full border border-dashed border-outline px-1.5 py-0.5 leading-none"
    >
      try
    </Label>
  );
}

/**
 * What a run was started from: its workflow, linked to its page where the api gives the run one (`WorkflowLink`) — or, for a try, the tag
 * and the agent it tried, linked to the agent's page. A try's folder is the store's own and is listed on no page (`tries/<agent>`).
 */
export function StartedFrom({
  run,
}: {
  run: { workflowDir: string; workflowPage: WorkflowPageAddress | null; try: { agent: string } | null };
}) {
  if (!run.try) return <WorkflowLink dir={run.workflowDir} page={run.workflowPage} />;
  return (
    <Body size="small" component="span" colorRole="on-surface-variant" className="flex items-center gap-1.5" title={run.workflowDir}>
      <TryTag agent={run.try.agent} />
      of <AgentLink from="user" name={run.try.agent} className="text-on-surface" />
    </Body>
  );
}
