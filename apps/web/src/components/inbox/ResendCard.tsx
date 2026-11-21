import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Radio, RadioGroup } from '@/components/ui/ds';
import { Pending } from '@/components/look';
import { resendCard, type InboxEntry } from '@/lib/api/inbox';

/** The choice that names no workflow: the card is left for its factory's card triggers. */
const NONE = '';

/**
 * A started card sent on, as the CLI's `inbox resend` does: one choice among the workflows its factory offers (`workflows`), or none,
 * which leaves the card for its factory's card triggers, and Send on, which says that the run the card waits on is called off. The inbox is
 * read again whatever the answer, so the card filed lists at once; a refusal is `onRefused`'s to show, in the api's words.
 */
export function ResendCard({
  entry,
  workflows,
  onRefused,
}: {
  entry: Pick<InboxEntry, 'name' | 'factory'>;
  /** The workflows its factory offers, by name: what it may be sent on to. */
  workflows: readonly string[];
  onRefused: (message: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [workflow, setWorkflow] = useState(NONE);
  const send = useMutation({
    mutationFn: () => resendCard(entry, workflow === NONE ? undefined : workflow),
    onMutate: () => onRefused(null),
    onError: (error) => onRefused(error.message),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['inbox'] }),
  });
  return (
    <div data-resend={entry.name} className="space-y-2 rounded border border-outline-variant px-3 py-2">
      <p className="text-body-medium">
        Send this card on as a card of its own, handed the run it was started as. Where that run waits on you, it is called off.
      </p>
      <RadioGroup
        aria-label={`Where ${entry.name} is sent on to`}
        name={`resend-${entry.name}`}
        orientation="horizontal"
        value={workflow}
        onChange={setWorkflow}
        className="gap-x-3 gap-y-1 text-body-small"
      >
        {workflows.map((w) => (
          <Radio key={w} value={w}>
            {w}
          </Radio>
        ))}
        <Radio value={NONE}>None — its factory&apos;s card triggers take it</Radio>
      </RadioGroup>
      <Button icon={send.isPending ? Pending : undefined} isDisabled={send.isPending} onPress={() => send.mutate()}>
        {send.isPending ? 'Sending on…' : 'Send on'}
      </Button>
    </div>
  );
}
