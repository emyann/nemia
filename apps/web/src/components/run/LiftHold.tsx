import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Body, Button, Popover, PopoverTrigger, Title } from '@/components/ui/ds';
import { liftHold } from '../../lib/api/runs.ts';
import { Refusal } from '../gate/Ask';
import { runsMoved } from '@/lib/runWrites';
import { useRunNamespace } from '@/lib/runNamespace';

/** What a lift does, said before the second press: the package's `unhold`, as the CLI's `hold <run> --off` runs it. */
const LIFTS = 'It goes on at the next tick, and what its steps asked while it was held is asked again.';

/**
 * The lift, through the api (`DELETE /api/namespaces/:namespace/runs/:id/hold`), in `namespace` where the caller holds it, else the run's
 * own (`useRunNamespace`), and the run read again once it is lifted: its record and the list, each alone
 * (`exact`), as an approval reads them, since a decision is keyed by the state it was read for. The tick says the run moved on the feed
 * once it files what the hold kept back; the board does not wait for that to stop saying the hold.
 */
function useLift(id: string, namespace: string | undefined, onLifted: () => void = () => undefined) {
  const queryClient = useQueryClient();
  const namespaceNow = useRunNamespace(id, namespace);
  return useMutation({
    mutationFn: () => namespaceNow().then((ns) => liftHold(ns, id)),
    onSuccess: async () => {
      onLifted();
      await runsMoved(queryClient, id);
    },
  });
}

/**
 * Lift, asked once a menu's Lift… was pressed (the run page's, or the one a right-click opens where the run is listed): it asks at
 * once, and Lift lifts the hold as the CLI's `hold --off` does. Keep it, or the lift, closes the surface it is asked in (`onClose`). A
 * refusal — a run nobody holds — is shown in the package's words.
 */
export function LiftHold({ id, onClose }: { id: string; onClose: () => void }) {
  const lift = useLift(id, undefined, onClose);
  return (
    <span data-lift className="flex flex-wrap items-center gap-2 pt-1 text-body-small">
      {`Lift the hold on ${id}? ${LIFTS}`}
      <Button size="xsmall" onPress={() => lift.mutate()} isDisabled={lift.isPending}>
        {lift.isPending ? 'Lifting…' : 'Lift'}
      </Button>
      <Button
        variant="outlined"
        size="xsmall"
        onPress={() => {
          lift.reset();
          onClose();
        }}
        isDisabled={lift.isPending}
      >
        Keep it
      </Button>
      {lift.isError && (
        <span role="alert" data-lift-refused className="basis-full font-mono whitespace-pre-wrap break-words text-failure">
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
export function CardLift({ id, namespace }: { id: string; namespace: string }) {
  return (
    <span
      role="presentation"
      className="nodrag"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <PopoverTrigger>
        <Button variant="outlined" size="xsmall" data-lift={id} className="h-6 px-2">
          Lift…
        </Button>
        <Popover aria-label={`Lift the hold on ${id}`} placement="bottom end" offset={6} className="w-72">
          {({ close }) => <LiftForm id={id} namespace={namespace} onClose={close} />}
        </Popover>
      </PopoverTrigger>
    </span>
  );
}

/** The lift, confirmed in the card's popover: what it does, and the press that does it. */
function LiftForm({ id, namespace, onClose }: { id: string; namespace: string; onClose: () => void }) {
  const lift = useLift(id, namespace, onClose);
  return (
    <div className="space-y-2">
      <Title size="small" component="h2">{`Lift the hold on ${id}?`}</Title>
      <Body size="small" colorRole="on-surface-variant">
        {LIFTS}
      </Body>
      <div className="flex items-center gap-2">
        <Button size="xsmall" onPress={() => lift.mutate()} isDisabled={lift.isPending}>
          {lift.isPending ? 'Lifting…' : 'Lift'}
        </Button>
        <Button variant="tonal" size="xsmall" onPress={onClose} isDisabled={lift.isPending}>
          Keep it
        </Button>
      </div>
      {lift.isError && (
        <div role="alert" data-lift-refused>
          <Refusal error={lift.error} not="Not lifted" />
        </div>
      )}
    </div>
  );
}
