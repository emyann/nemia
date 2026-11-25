import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { decisionQuery } from '../../lib/api/decision.ts';
import { pruneRun } from '../../lib/api/runs.ts';
import { runNamespace } from '@/lib/runNamespace';
import { decidableRun, decisionStamp } from '../../lib/decide';
import { awaitingOf, firstChoice, pruneOffer, pruneQuestion, type PruneChoice, type PruneOffer } from '../../lib/prune.ts';
import { cn } from '../../lib/utils';
import { Refusal } from '../gate/Ask';
import { runsMoved } from '@/lib/runWrites';
import { sayWritten } from '@/lib/written';
import { Pending, Reading, ReadingLines } from '@/components/look';
import { Button, Radio, RadioGroup, Skeleton, Title } from '@/components/ui/ds';
import { CHOICE } from '@/lib/classes';

/** What of a run its prune's question reads: whether it may be decided, the stamp of its decision, and what it left on disk. */
type PruneAsked = Parameters<typeof decisionStamp>[0] & Parameters<typeof pruneOffer>[0];

/**
 * The prune's question, wherever it is asked: whether anybody decided the run, read off the api's decision (`awaitingOf`) — the package's
 * own reading, which the CLI's `prune` refuses without `--unmerged` — before anything is offered, then the choice and the two presses. The
 * same query as the Decide section's, under the same key, so a page that shows the decision reads nothing more; a run called off has
 * nothing to decide, and is not asked. A decision read for an earlier state of the run (`keepPreviousData`) is not taken for this one's.
 * `onClose` closes the surface it is asked in, once pruned or closed.
 */
export function PruneQuestion({ run, onClose }: { run: PruneAsked; onClose: () => void }) {
  const decidable = decidableRun(run);
  const { data, error, isPlaceholderData } = useQuery({ ...decisionQuery(run.id, decisionStamp(run)), enabled: decidable });
  if (decidable && error) {
    return (
      <div className="space-y-3">
        <div role="alert" data-prune-unread>
          <Refusal error={error} not="Whether it was merged could not be read" />
        </div>
        <Button variant="outlined" size="xsmall" onPress={onClose}>
          Close
        </Button>
      </div>
    );
  }
  if (decidable && (!data || isPlaceholderData)) {
    return (
      <div data-prune-reading>
        <Reading label="Reading whether it was merged…" className="flex flex-col gap-3">
          <ReadingLines widths={['w-full', 'w-2/3']} className="text-body-small" />
          <Skeleton shape="rectangle" className="h-9 w-24 rounded-none" />
        </Reading>
      </div>
    );
  }
  const offer = pruneOffer(run, decidable && data ? awaitingOf(data) : null);
  return offer ? <PruneForm id={run.id} offer={offer} onClose={onClose} /> : null;
}

/**
 * Close the prune's surface once nothing of the run was left behind, as the frame's snackbar says the run `id` is pruned.
 * @param id The run's id.
 * @param onClose Closes the surface the prune is asked in.
 */
function closePruned(id: string, onClose: () => void) {
  onClose();
  sayWritten('pruned', id);
}

/**
 * The choice and the two presses. The run is read again once pruned, its record and the list each alone (`exact`), as an approval reads
 * them; the popover closes as the frame's snackbar says it is pruned, unless the CLI's `prune` kept something it could not remove, which
 * its lines then say.
 */
function PruneForm({ id, offer, onClose }: { id: string; offer: PruneOffer; onClose: () => void }) {
  const [key, setKey] = useState<PruneChoice['key']>(firstChoice(offer).key);
  const [asking, setAsking] = useState(false);
  const choice = offer.choices.find((c) => c.key === key && !c.unavailable) ?? firstChoice(offer);
  const queryClient = useQueryClient();
  const prune = useMutation({
    mutationFn: () => runNamespace(queryClient, id).then((ns) => pruneRun(ns, id, choice.how)),
    onSuccess: async (done) => {
      setAsking(false);
      if (done.left === 0) closePruned(id, onClose);
      await runsMoved(queryClient, id);
    },
  });
  return (
    <div data-prune={id} className="space-y-3">
      <Title size="small" component="h2">{`Prune ${id}`}</Title>
      <RadioGroup
        label="What to give back"
        supportingText="Its record and its branches are kept: no branch is ever deleted."
        value={choice.key}
        onChange={(value) => {
          setKey(value as PruneChoice['key']);
          setAsking(false);
          prune.reset();
        }}
        isDisabled={asking || prune.isPending}
        className="gap-2"
      >
        {offer.choices.map((c) => (
          <Radio key={c.key} value={c.key} isDisabled={c.unavailable !== null} data-prune-choice={c.key} className={CHOICE}>
            <span className="min-w-0 space-y-0.5">
              <span className="block text-body-small font-medium">{c.label}</span>
              <span className={cn('block text-body-small leading-snug', c.how.unmerged ? 'text-yours' : 'text-on-surface-variant')}>
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
            <PrunePress pending={prune.isPending} onPress={() => prune.mutate()} />
            <Button
              variant="outlined"
              size="xsmall"
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
          <Button variant="outlined" size="xsmall" onPress={() => setAsking(true)} isDisabled={prune.isSuccess}>
            Prune…
          </Button>
          <Button variant="outlined" size="xsmall" onPress={onClose}>
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
        <pre data-prune-said className="overflow-x-auto font-mono text-body-small whitespace-pre-wrap text-on-surface-variant">
          {prune.data.lines.join('\n')}
        </pre>
      )}
    </div>
  );
}

/** The Prune that answers the question: `Pruning…` while its press is out, the kit's small ProgressIndicator in it, and disabled then. */
function PrunePress({ pending, onPress }: { pending: boolean; onPress: () => void }) {
  return (
    <Button icon={pending ? Pending : undefined} variant="tonal" color="error" size="xsmall" onPress={onPress} isDisabled={pending}>
      {pending ? 'Pruning…' : 'Prune'}
    </Button>
  );
}
