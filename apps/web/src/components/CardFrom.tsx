import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { setCardFrom, type InboxEntry } from '../lib/api';
import type { CardRefusal } from '../lib/inbox';
import { ContextPicker } from './ContextPicker';
import { SECONDARY } from './InboxParts';

/**
 * A card's `from:`, the runs its run is handed as context: each linked to its page, and, on a card that can still start (`editable`), a
 * button that opens the picker (`ContextPicker`) to change them, as the CLI's `inbox from` does — each pick written at once, the last one
 * taken off with the line. The inbox is read again after any answer; a refusal is `onRefused`'s to show, under the card.
 */
export function CardFrom({
  entry,
  editable,
  onRefused,
}: {
  entry: InboxEntry;
  editable: boolean;
  onRefused: (refusal: Omit<CardRefusal, 'entry'> | null) => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const write = useMutation({
    mutationFn: (runs: string[]) => setCardFrom(entry.name, runs),
    onMutate: () => onRefused(null),
    onError: (error) => onRefused({ action: 'from', message: error.message }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['inbox'] }),
  });
  if (!entry.from.length && !editable) return null;
  const shown = write.isPending ? write.variables : entry.from;

  return (
    <div data-card-from className="space-y-2">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {entry.from.length ? (
          <span data-from={entry.from.join(' ')}>
            reads{' '}
            {entry.from.map((id, i) => (
              <span key={id}>
                {i > 0 && ', '}
                <Link to="/runs/$runId" params={{ runId: id }} className="font-mono underline underline-offset-2">
                  {id}
                </Link>
              </span>
            ))}
            , as context
          </span>
        ) : (
          <span>reads no run as context</span>
        )}
        {editable && (
          <button type="button" aria-expanded={editing} onClick={() => setEditing(!editing)} className={`${SECONDARY} px-2 py-0.5 text-xs`}>
            {editing ? 'Done' : 'Change'}
          </button>
        )}
      </p>
      {editing && editable && (
        <ContextPicker label="Reads as context" selected={shown} onChange={(runs) => write.mutate(runs)} disabled={write.isPending} />
      )}
    </div>
  );
}
