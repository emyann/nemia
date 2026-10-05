import { Link } from '@tanstack/react-router';
import { workflowNameOf, type WorkflowPageAddress } from '../lib/api';
import { placeOfAddress } from '../lib/factories';

const LABEL = 'text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100';

/**
 * The workflow a run was started from, by its folder's name, the folder in full on hover: linked to its page in the run's place where the
 * api gives the run one (`page`), and to the Workflows page where it gives none.
 */
export function WorkflowLink({ dir, page }: { dir: string; page: WorkflowPageAddress | null }) {
  const name = workflowNameOf(dir);
  const label = (
    <>
      workflow{' '}
      <span className="font-mono text-neutral-700 underline decoration-neutral-300 underline-offset-2 dark:text-neutral-300 dark:decoration-neutral-600">
        {name}
      </span>
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
