import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { removeRun } from '../lib/api';

/**
 * Remove, on a try's page, asked twice: the first press asks, the second removes the run as the CLI's `rm` does — its record and the
 * folders it worked in — and goes back to Runs, whose list is read again while the run's own record is dropped. The api removes only a try,
 * and refuses one still in flight in the package's words, which are shown here.
 */
export function RemoveRun({ id }: { id: string }) {
  const [asking, setAsking] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const remove = useMutation({
    mutationFn: () => removeRun(id),
    onSuccess: async () => {
      await navigate({ to: '/runs' });
      queryClient.removeQueries({ queryKey: ['runs', id], exact: true });
      await queryClient.invalidateQueries({ queryKey: ['runs'], exact: true });
    },
  });
  return (
    <span data-remove-run className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {asking ? (
        <>
          Remove this try, its record and its folders?
          <Button variant="destructive" size="sm" onPress={() => remove.mutate()} isDisabled={remove.isPending}>
            {remove.isPending ? 'Removing…' : 'Remove'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onPress={() => {
              remove.reset();
              setAsking(false);
            }}
            isDisabled={remove.isPending}
          >
            Keep it
          </Button>
        </>
      ) : (
        <Button variant="outline" size="sm" onPress={() => setAsking(true)}>
          Remove…
        </Button>
      )}
      {remove.isError && (
        <span
          role="alert"
          data-remove-refused
          className="basis-full font-mono whitespace-pre-wrap break-words text-red-700 dark:text-red-400"
        >
          {remove.error.message}
        </span>
      )}
    </span>
  );
}
