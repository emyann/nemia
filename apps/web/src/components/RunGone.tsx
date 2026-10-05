import { CircleSlash } from 'lucide-react';
import type { RunDetail } from '@/lib/api';
import { titleOf } from '@/lib/factory';

/**
 * In place of a run's page, or of one of its steps', when a read again of the run found none (`runGone`): it was removed while the page was
 * open. What was last read is not drawn under it, so nothing on the page looks live, or offers a button for a run that is not there.
 */
export function RunGone({ run }: { run: RunDetail }) {
  return (
    <p data-run-gone={run.id} role="status" className="max-w-3xl text-sm text-amber-700 dark:text-amber-400">
      <CircleSlash aria-hidden className="mr-1 inline size-3.5 -translate-y-px" />
      {titleOf(run)} is no longer in this store: it was removed while this page was open. Runs lists the runs the store has.
    </p>
  );
}
