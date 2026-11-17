import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/ds';
import { removeRun } from '../../lib/api/runs.ts';
import { runsMoved } from '@/lib/runWrites';
import { useRunNamespace } from '@/lib/runNamespace';
import { sayWritten } from '@/lib/written';

/**
 * Remove, asked once a menu's Remove… was pressed (the run page's, or the one a right-click opens where the run is listed): it asks at
 * once, and Remove removes the run as the CLI's `rm` does — its record and the folders it worked in — the list read again while the run's
 * own record is dropped. Keep it, or the removal, closes the surface it is asked in (`onClose`); asked on the run's own page (`leave`), the
 * removal then goes back to Runs. Once removed, the frame's snackbar says so (`sayWritten`). The api removes only a try, and refuses one still in flight in the package's words, which are shown here.
 */
export function RemoveRun({ id, onClose, leave = false }: { id: string; onClose: () => void; leave?: boolean }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const namespaceNow = useRunNamespace(id);
  const remove = useMutation({
    mutationFn: () => namespaceNow().then((ns) => removeRun(ns, id)),
    onSuccess: async () => {
      onClose();
      sayWritten('removed', id);
      if (leave) await navigate({ to: '/runs' });
      queryClient.removeQueries({ queryKey: ['runs', id], exact: true });
      await runsMoved(queryClient);
    },
  });
  return (
    <span data-remove-run className="flex flex-wrap items-center gap-2 text-body-small text-muted-foreground">
      Remove this try, its record and its folders?
      <Button variant="tonal" color="error" size="xsmall" onPress={() => remove.mutate()} isDisabled={remove.isPending}>
        {remove.isPending ? 'Removing…' : 'Remove'}
      </Button>
      <Button
        variant="text"
        size="xsmall"
        onPress={() => {
          remove.reset();
          onClose();
        }}
        isDisabled={remove.isPending}
      >
        Keep it
      </Button>
      {remove.isError && (
        <span role="alert" data-remove-refused className="basis-full font-mono whitespace-pre-wrap break-words text-failure">
          {remove.error.message}
        </span>
      )}
    </span>
  );
}
