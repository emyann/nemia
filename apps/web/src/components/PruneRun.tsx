import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogTrigger, Heading, Popover, Radio, RadioGroup, Text } from 'react-aria-components';
import { Button } from '@/components/ui/button';
import { decisionQuery, pruneRun, type RunDetail } from '../lib/api';
import { decidableRun, decisionStamp } from '../lib/decide';
import { awaitingOf, firstChoice, prunable, pruneOffer, pruneQuestion, type PruneChoice, type PruneOffer } from '../lib/prune.ts';
import { cn } from '../lib/utils';
import { DOT, RADIO } from './AgentForm';
import { POPOVER } from './CardGate';
import { Refusal } from './Ask';
import { runsMoved } from '@/lib/runWrites';

/**
 * Prune, on a finished repository run's page: the button opens a popover with a choice of what to give back — its worktrees; its files
 * too; and, for a run nobody decided, the same though its branch becomes the only copy of its work — and the prune is asked twice, the
 * second time in words that say what goes. The api prunes through the package's `prune`, as the CLI's `prune <run> --yes` does, and
 * refuses in its words, shown here. Nothing is offered where the package would prune nothing (`prunable`).
 */
export function PruneRun({ run }: { run: RunDetail }) {
  if (!prunable(run)) return null;
  return (
    <DialogTrigger>
      <Button variant="outline" size="sm" data-prune-open>
        {run.onDisk.worktrees ? 'Prune…' : 'Prune its files…'}
      </Button>
      <Popover placement="bottom end" offset={6} className={cn(POPOVER, 'w-96')}>
        <Dialog aria-label={`Prune ${run.id}`} className="space-y-3 outline-none">
          {({ close }) => <PruneRead run={run} onClose={close} />}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

/**
 * Whether anybody decided the run, read off the api's decision (`awaitingOf`) — the package's own reading, which the CLI's `prune` refuses
 * without `--unmerged` — before anything is offered. The same query as the Decide section's, under the same key, so a page that shows the
 * decision reads nothing more; a run called off has nothing to decide, and is not asked. A decision read for an earlier state of the run
 * (`keepPreviousData`) is not taken for this one's.
 */
function PruneRead({ run, onClose }: { run: RunDetail; onClose: () => void }) {
  const decidable = decidableRun(run);
  const { data, error, isPlaceholderData } = useQuery({ ...decisionQuery(run.id, decisionStamp(run)), enabled: decidable });
  if (decidable && error) {
    return (
      <div className="space-y-3">
        <div role="alert" data-prune-unread>
          <Refusal error={error} not="Whether it was merged could not be read" />
        </div>
        <Button variant="ghost" size="sm" onPress={onClose}>
          Close
        </Button>
      </div>
    );
  }
  if (decidable && (!data || isPlaceholderData)) {
    return (
      <p data-prune-reading className="text-body-small text-muted-foreground">
        Reading whether it was merged…
      </p>
    );
  }
  const offer = pruneOffer(run, decidable && data ? awaitingOf(data) : null);
  return offer ? <PruneForm id={run.id} offer={offer} onClose={onClose} /> : null;
}

/**
 * The choice and the two presses. The run is read again once pruned, its record and the list each alone (`exact`), as an approval reads
 * them; the popover closes, unless the CLI's `prune` kept something it could not remove, which its lines then say.
 */
function PruneForm({ id, offer, onClose }: { id: string; offer: PruneOffer; onClose: () => void }) {
  const [key, setKey] = useState<PruneChoice['key']>(firstChoice(offer).key);
  const [asking, setAsking] = useState(false);
  const choice = offer.choices.find((c) => c.key === key && !c.unavailable) ?? firstChoice(offer);
  const queryClient = useQueryClient();
  const prune = useMutation({
    mutationFn: () => pruneRun(id, choice.how),
    onSuccess: async (done) => {
      setAsking(false);
      if (done.left === 0) onClose();
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['runs', id], exact: true }), runsMoved(queryClient)]);
    },
  });
  return (
    <div data-prune={id} className="space-y-3">
      <Heading slot="title" className="font-semibold">{`Prune ${id}`}</Heading>
      <RadioGroup
        aria-label="What to give back"
        value={choice.key}
        onChange={(value) => {
          setKey(value as PruneChoice['key']);
          setAsking(false);
          prune.reset();
        }}
        isDisabled={asking || prune.isPending}
        className="space-y-2"
      >
        <Text slot="description" className="block text-body-small text-muted-foreground">
          What to give back. Its record and its branches are kept: no branch is ever deleted.
        </Text>
        {offer.choices.map((c) => (
          <Radio
            key={c.key}
            value={c.key}
            isDisabled={c.unavailable !== null}
            data-prune-choice={c.key}
            className={cn(RADIO, 'data-disabled:opacity-60')}
          >
            <span aria-hidden className={DOT} />
            <span className="space-y-0.5">
              <span className="block text-body-small font-medium">{c.label}</span>
              <span className={cn('block text-body-small leading-snug', c.how.unmerged ? 'text-yours' : 'text-muted-foreground')}>
                {c.says}
              </span>
              {c.unavailable && <span className="block text-body-small leading-snug text-yours">{c.unavailable}</span>}
            </span>
          </Radio>
        ))}
      </RadioGroup>
      {asking ? (
        <div className="space-y-2">
          <p data-prune-question className={cn('text-body-small', choice.how.unmerged && 'text-yours')}>
            {pruneQuestion(id, choice, offer)}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="destructive" size="sm" onPress={() => prune.mutate()} isDisabled={prune.isPending}>
              {prune.isPending ? 'Pruning…' : 'Prune'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onPress={() => {
                prune.reset();
                setAsking(false);
              }}
              isDisabled={prune.isPending}
            >
              Keep it
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onPress={() => setAsking(true)} isDisabled={prune.isSuccess}>
            Prune…
          </Button>
          <Button variant="ghost" size="sm" onPress={onClose}>
            Close
          </Button>
        </div>
      )}
      {prune.isError && (
        <div role="alert" data-prune-refused>
          <Refusal error={prune.error} not="Not pruned" />
        </div>
      )}
      {prune.data && prune.data.left > 0 && (
        <pre data-prune-said className="overflow-x-auto font-mono text-body-small whitespace-pre-wrap text-muted-foreground">
          {prune.data.lines.join('\n')}
        </pre>
      )}
    </div>
  );
}
