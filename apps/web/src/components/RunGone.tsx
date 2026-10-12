import { CircleSlash } from 'lucide-react';
import type { RunDetail } from '@/lib/api';
import { titleOf } from '@/lib/factory';

/**
 * In place of a run's page, or of one of its steps', when the store has no such run (`runGone`). Given the `run` last read, it was removed
 * while the page was open, and what was read is not drawn under it, so nothing on the page looks live, or offers a button for a run that
 * is not there. Given only its `id`, the address was visited with no read of it: removed, or never a run of the store.
 */
export function RunGone(props: { run: RunDetail } | { id: string }) {
  const id = 'run' in props ? props.run.id : props.id;
  return (
    <p data-run-gone={id} role="status" className="max-w-3xl text-sm text-yours">
      <CircleSlash aria-hidden className="mr-1 inline size-3.5 -translate-y-px" />
      {'run' in props
        ? `${titleOf(props.run)} is no longer in this store: it was removed while this page was open.`
        : `Run ${id} is not in this store: removed, or never was.`}{' '}
      Runs lists the runs the store has.
    </p>
  );
}
