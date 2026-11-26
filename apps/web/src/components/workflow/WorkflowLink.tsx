import { Link, linkOptions } from '@tanstack/react-router';
import { workflowNameOf } from '../../lib/api/workflows.ts';
import { type WorkflowPageAddress } from '../../lib/api/address.ts';
import { placeOfAddress } from '../../lib/factories';
import { workflowLink } from '../../lib/factoryAddress';
import { Body } from '@/components/ui/ds';

const LABEL = 'text-on-surface-variant hover:text-on-surface';

/**
 * Where a run's workflow is linked to: its page in the run's place where the api gives the run one (`page`), and the Workflows page
 * where it gives none. Spread on any link to a route, so every link to a run's workflow goes to the same place.
 *
 * @param page the address of the run's workflow page, null where the api gives none
 */
export const workflowTarget = (page: WorkflowPageAddress | null) =>
  page ? workflowLink(placeOfAddress(page), page.from, page.workflow) : linkOptions({ to: '/workflows' });

/**
 * The workflow a run was started from, by its folder's name, the folder in full on hover, linked where `workflowTarget` says.
 */
export function WorkflowLink({ dir, page }: { dir: string; page: WorkflowPageAddress | null }) {
  const name = workflowNameOf(dir);
  return (
    <Link {...workflowTarget(page)} title={dir} data-workflow={name} className={LABEL}>
      <Body size="small" component="span">
        workflow <span className="font-mono text-on-surface underline decoration-outline underline-offset-2">{name}</span>
      </Body>
    </Link>
  );
}
