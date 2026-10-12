import { Link } from '@tanstack/react-router';
import { workflowNameOf, type WorkflowPageAddress } from '../lib/api';
import { placeOfAddress } from '../lib/factories';

const LABEL = 'text-body-small text-muted-foreground hover:text-foreground';

/**
 * The workflow a run was started from, by its folder's name, the folder in full on hover: linked to its page in the run's place where the
 * api gives the run one (`page`), and to the Workflows page where it gives none.
 */
export function WorkflowLink({ dir, page }: { dir: string; page: WorkflowPageAddress | null }) {
  const name = workflowNameOf(dir);
  const label = (
    <>
      workflow <span className="font-mono text-foreground underline decoration-outline underline-offset-2">{name}</span>
    </>
  );
  if (!page) {
    return (
      <Link to="/workflows" title={dir} data-workflow={name} className={LABEL}>
        {label}
      </Link>
    );
  }
  return (
    <Link
      to="/workflows/$from/$workflow"
      params={{ from: page.from, workflow: page.workflow }}
      search={placeOfAddress(page)}
      title={dir}
      data-workflow={name}
      className={LABEL}
    >
      {label}
    </Link>
  );
}
