import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button as AriaButton, Dialog, DialogTrigger, Heading, Popover } from 'react-aria-components';
import { Button } from '@/components/ui/button';
import { liftHold } from '../lib/api';
import { cn } from '../lib/utils';
import { POPOVER, SMALL } from './CardGate';
import { BUTTON, Refusal } from './Ask';
import { SECONDARY } from './Gate';
import { runsMoved } from '@/lib/runWrites';

/** What a lift does, said before the second press: the package's `unhold`, as the CLI's `hold <run> --off` runs it. */
const LIFTS = 'It goes on at the next tick, and what its steps asked while it was held is asked again.';

/**
 * The lift, through the api (`DELETE /api/runs/:id/hold`), and the run read again once it is lifted: its record and the list, each alone
 * (`exact`), as an approval reads them, since a decision is keyed by the state it was read for. The tick says the run moved on the feed
 * once it files what the hold kept back; the board does not wait for that to stop saying the hold.
 */
function useLift(id: string, onLifted: () => void = () => undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => liftHold(id),
    onSuccess: async () => {
      onLifted();
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['runs', id], exact: true }), runsMoved(queryClient)]);
    },
  });
}

/**
 * Lift, where the run's page says it is held, asked twice: the first press asks, the second lifts the hold as the CLI's `hold --off` does.
 * A refusal — a run nobody holds — is shown in the package's words.
 */
export function LiftHold({ id }: { id: string }) {
  const [asking, setAsking] = useState(false);
  const lift = useLift(id);
  return (
    <span data-lift className="flex flex-wrap items-center gap-2 pt-1 text-xs">
      {asking ? (
        <>
          {`Lift the hold on ${id}? ${LIFTS}`}
          <Button variant="default" size="sm" onPress={() => lift.mutate()} isDisabled={lift.isPending}>
            {lift.isPending ? 'Lifting…' : 'Lift'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onPress={() => {
              lift.reset();
              setAsking(false);
            }}
            isDisabled={lift.isPending}
          >
            Keep it
          </Button>
        </>
      ) : (
        <Button variant="outline" size="sm" onPress={() => setAsking(true)}>
          Lift…
        </Button>
      )}
      {lift.isError && (
        <span
          role="alert"
          data-lift-refused
          className="basis-full font-mono whitespace-pre-wrap break-words text-red-700 dark:text-red-400"
        >
          {lift.error.message}
        </span>
      )}
    </span>
  );
}

/**
 * Lift on the Factory's card, beside its `held` chip: the button opens a popover over the card, where the second press lifts the hold. In
 * the card's footer, which it fits, so a held card is no taller for it (`CELL_HEIGHT`). Clicks inside are the card's own, as `CardGate`'s.
 */
export function CardLift({ id }: { id: string }) {
  return (
    <span
      role="presentation"
      className="nodrag"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <DialogTrigger>
        <AriaButton
          data-lift={id}
          className={cn(
            SMALL,
            'bg-white text-foreground ring-1 dark:text-foreground ring-neutral-300 ring-inset hover:bg-neutral-100 dark:bg-neutral-900 dark:ring-neutral-700 dark:hover:bg-neutral-800',
          )}
        >
          Lift…
        </AriaButton>
        <Popover placement="bottom end" offset={6} className={POPOVER}>
          <Dialog aria-label={`Lift the hold on ${id}`} className="space-y-2 outline-none">
            {({ close }) => <LiftForm id={id} onClose={close} />}
          </Dialog>
        </Popover>
      </DialogTrigger>
    </span>
  );
}

/** The lift, confirmed in the card's popover: what it does, and the press that does it. */
function LiftForm({ id, onClose }: { id: string; onClose: () => void }) {
  const lift = useLift(id, onClose);
  return (
    <div className="space-y-2">
      <Heading slot="title" className="font-semibold">{`Lift the hold on ${id}?`}</Heading>
      <p className="text-xs text-muted-foreground">{LIFTS}</p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => lift.mutate()} disabled={lift.isPending} className={cn(BUTTON, 'px-2.5 py-1 text-xs')}>
          {lift.isPending ? 'Lifting…' : 'Lift'}
        </button>
        <button type="button" onClick={onClose} disabled={lift.isPending} className={cn(BUTTON, SECONDARY, 'px-2.5 py-1 text-xs')}>
          Keep it
        </button>
      </div>
      {lift.isError && (
        <div role="alert" data-lift-refused>
          <Refusal error={lift.error} not="Not lifted" />
        </div>
      )}
    </div>
  );
}
