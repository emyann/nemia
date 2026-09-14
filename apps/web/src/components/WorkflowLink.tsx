import { Link } from '@tanstack/react-router';
import { workflowNameOf } from '../lib/api';

/** The workflow a run was started from, by its folder's name, linked to the Workflows page; the folder in full on hover. */
export function WorkflowLink({ dir }: { dir: string }) {
  const name = workflowNameOf(dir);
  return (
    <Link
      to="/workflows"
      title={dir}
      data-workflow={name}
      className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
    >
      workflow <span className="font-mono text-neutral-700 underline decoration-neutral-300 underline-offset-2 dark:text-neutral-300 dark:decoration-neutral-600">{name}</span>
    </Link>
  );
}
