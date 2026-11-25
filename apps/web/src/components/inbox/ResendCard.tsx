import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Radio, RadioGroup } from '@/components/ui/ds';
import { Pending } from '@/components/look';
import { resendCard, type InboxEntry } from '@/lib/api/inbox';
import type { CardResent } from 'objects';

/** The choice that names no workflow: the card is left for its factory's card triggers. */
const NONE = '';

/**
 * A started card sent on, as the CLI's `inbox resend` does: one choice among the workflows its factory offers (`workflows`), or none,
 * which leaves the card for its factory's card triggers, and Send on, which says that the run the card waits on is called off. The inbox is
 * read again whatever the answer, so the card filed lists at once. What the api answered is said under the press (`Resent`): the card
 * filed and where it goes, and the run called off, or why not and the command that calls it off; a refusal is `onRefused`'s to show, in
 * the api's words.
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
  const [answer, setAnswer] = useState<CardResent | null>(null);
  const send = useMutation({
    mutationFn: () => resendCard(entry, workflow === NONE ? undefined : workflow),
    onMutate: () => onRefused(null),
    onError: (error) => onRefused(error.message),
    onSuccess: setAnswer,
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
      <Button icon={send.isPending ? Pending : undefined} variant="outlined" isDisabled={send.isPending} onPress={() => send.mutate()}>
        {send.isPending ? 'Sending on…' : 'Send on'}
      </Button>
      {answer && <Resent answer={answer} />}
    </div>
  );
}

/**
 * What a card sent on answered, as the CLI's `inbox resend` says it: the card filed and where it goes, then the run it came from called
 * off, or, where its cancel failed, why, in the api's words, which name the command that calls it off.
 */
function Resent({ answer }: { answer: CardResent }) {
  const { card, from } = answer;
  const goes = card.spec.workflow === undefined ? "naming no workflow, for its factory's card triggers" : `queued on ${card.spec.workflow}`;
  return (
    <div data-resent={card.metadata.name} className="space-y-1 text-body-small">
      <p>
        Filed as <code className="font-mono">{card.metadata.name}</code>, {goes}.
      </p>
      {answer.cancelled !== undefined && <p>Run {from.run} called off.</p>}
      {answer.cancelLeft !== undefined && (
        <p data-cancel-left className="rounded border border-failure bg-failure-container px-2 py-1 text-on-failure-container">
          Run {from.run} not called off: {answer.cancelLeft}
        </p>
      )}
    </div>
  );
}
