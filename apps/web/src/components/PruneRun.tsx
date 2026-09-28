import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogTrigger, Heading, Popover, Radio, RadioGroup, Text } from 'react-aria-components';
import { Button } from '@/components/ui/button';
import { pruneRun, type RunDetail } from '../lib/api';
import { firstChoice, pruneOffer, pruneQuestion, type PruneChoice, type PruneOffer } from '../lib/prune.ts';
import { cn } from '../lib/utils';
import { DOT, RADIO } from './AgentForm';
import { POPOVER } from './CardGate';
import { Refusal } from './Decide';

/**
 * Prune, on a finished git run's page: the button opens a popover with a choice of what to give back — its worktrees; its files too; and, for
 * a run nobody merged, the same though its branch becomes the only copy of its work — and the prune is asked twice, the second time in words
 * that say what goes. The api prunes through the package's `prune`, as `wf prune <run> --yes` does, and refuses in its words, shown here.
 * Nothing is offered where the package would prune nothing (`pruneOffer`).
 */
export function PruneRun({ run }: { run: RunDetail }) {
  const offer = pruneOffer(run);
  if (!offer) return null;
  return (
    <DialogTrigger>
      <Button variant="outline" size="sm" data-prune-open>
        {run.pruned ? 'Prune its files…' : 'Prune…'}
      </Button>
      <Popover placement="bottom end" offset={6} className={cn(POPOVER, 'w-96')}>
        <Dialog aria-label={`Prune ${run.id}`} className="space-y-3 outline-none">
          {({ close }) => <PruneForm id={run.id} offer={offer} onClose={close} />}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

/**
 * The choice and the two presses. The run is read again once pruned, its record and the list each alone (`exact`), as an approval reads them;
 * the popover closes, unless `wf prune` kept something it could not remove, which its lines then say.
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['runs', id], exact: true }),
        queryClient.invalidateQueries({ queryKey: ['runs'], exact: true }),
      ]);
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
        <Text slot="description" className="block text-xs text-neutral-600 dark:text-neutral-400">
          What to give back. Its record and its branches are kept: no branch is ever deleted.
        </Text>
        {offer.choices.map((c) => (
          <Radio key={c.key} value={c.key} isDisabled={c.unavailable !== null} data-prune-choice={c.key} className={cn(RADIO, 'data-disabled:opacity-60')}>
            <span aria-hidden className={DOT} />
            <span className="space-y-0.5">
              <span className="block text-xs font-medium">{c.label}</span>
              <span className={cn('block text-[11px] leading-snug', c.how.unmerged ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground')}>
                {c.says}
              </span>
              {c.unavailable && <span className="block text-[11px] leading-snug text-amber-700 dark:text-amber-400">{c.unavailable}</span>}
            </span>
          </Radio>
        ))}
      </RadioGroup>
      {asking ? (
        <div className="space-y-2">
          <p data-prune-question className={cn('text-xs', choice.how.unmerged && 'text-red-700 dark:text-red-400')}>
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
        <pre data-prune-said className="overflow-x-auto font-mono text-[11px] whitespace-pre-wrap text-neutral-600 dark:text-neutral-400">
          {prune.data.lines.join('\n')}
        </pre>
      )}
    </div>
  );
}
