import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { removeWorkflow, type WorkflowListing } from '../lib/api';
import { forgetFavorite } from '../lib/useFavorites';
import { rereadWorkflows } from '../lib/placed';

/**
 * Remove, on a workflow of yours, asked twice: the first press asks, saying what goes — the folder, its steps and every file in it, and its
 * star — and what becomes of what names it: a run started on it goes on from the steps it froze at its start, and a card naming it that is
 * not queued is refused when it starts. The second removes it against the version it was listed at, takes its star off, tells `onRemoved`,
 * which leaves the page of the workflow gone, and reads the workflows again. The api's refusal — a folder changed since, or one a run, a
 * queued card or a factory still needs — is shown here.
 */
export function RemoveWorkflow({ workflow, onRemoved }: { workflow: WorkflowListing; onRemoved?: () => Promise<void> | void }) {
  const { name, dir, steps, error, version } = workflow;
  const [asking, setAsking] = useState(false);
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => removeWorkflow(name, version),
    onSuccess: async () => {
      forgetFavorite({ kind: 'workflow', from: 'yours', workflow: name });
      await onRemoved?.();
      await rereadWorkflows(queryClient);
    },
  });
  if (!asking)
    return (
      <Button variant="outline" size="xs" onPress={() => setAsking(true)}>
        Remove…
      </Button>
    );
  const held = error ? 'every file in it' : `its ${steps.length} ${steps.length === 1 ? 'step' : 'steps'} and every file in it`;
  return (
    <div data-remove-asks className="flex basis-full flex-wrap items-center gap-2 text-body-small text-muted-foreground">
      <p className="min-w-0 basis-full">
        Remove <code className="font-mono break-all">{dir}</code>, {held}? A run started on it goes on from the steps it froze at its start;
        a card that names it and is not queued is refused when it starts; its star goes with it.
      </p>
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
      {remove.isError && (
        <p role="alert" data-remove-refused className="basis-full font-mono whitespace-pre-wrap break-words text-destructive">
          {remove.error.message}
        </p>
      )}
    </div>
  );
}
