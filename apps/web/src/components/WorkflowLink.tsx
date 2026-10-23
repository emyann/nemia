import { Link, linkOptions } from '@tanstack/react-router';
import { workflowNameOf, type WorkflowPageAddress } from '../lib/api';
import { placeOfAddress } from '../lib/factories';

const LABEL = 'text-body-small text-muted-foreground hover:text-foreground';

/**
 * Where a run's workflow is linked to: its page in the run's place where the api gives the run one (`page`), and the Workflows page
 * where it gives none. Spread on any link to a route, so every link to a run's workflow goes to the same place.
 */
export const workflowTarget = (page: WorkflowPageAddress | null) =>
  page
    ? linkOptions({
        to: '/workflows/$from/$workflow',
        params: { from: page.from, workflow: page.workflow },
        search: placeOfAddress(page),
      })
    : linkOptions({ to: '/workflows' });

/**
 * The workflow a run was started from, by its folder's name, the folder in full on hover, linked where `workflowTarget` says.
 */
export function WorkflowLink({ dir, page }: { dir: string; page: WorkflowPageAddress | null }) {
  const name = workflowNameOf(dir);
  return (
    <Link {...workflowTarget(page)} title={dir} data-workflow={name} className={LABEL}>
      workflow <span className="font-mono text-foreground underline decoration-outline underline-offset-2">{name}</span>
    </Link>
  );
}
