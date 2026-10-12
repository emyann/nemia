import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckboxGroup, Dialog, DialogTrigger, Form, Heading, Label as AriaLabel, Popover, Text, TextField } from 'react-aria-components';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { putHold, runsQuery, type RunDetail, type RunSummary } from '../lib/api';
import { titleOf } from '../lib/factory';
import { holdable, holdCandidates } from '../lib/hold.ts';
import { cn } from '../lib/utils';
import { POPOVER } from './CardGate';
import { Refusal } from './Ask';
import { runsMoved } from '@/lib/runWrites';

/**
 * Hold, on a run's page: the button opens a popover where a person ticks the runs to wait on and may say why, and the hold is put as the
 * CLI's `hold <run> --until <run>… --why <words>` puts it. The page then says the hold in its Held section, with Lift. A refusal — the
 * package's, of a run it will not hold or one it will not wait on — is shown in the form, and nothing is written. Nothing is offered where
 * the run says it cannot be held (`holdable`).
 */
export function HoldRun({ run }: { run: RunDetail }) {
  if (!holdable(run)) return null;
  return (
    <DialogTrigger>
      <Button variant="outline" size="sm" data-hold-open>
        Hold…
      </Button>
      <Popover placement="bottom end" offset={6} className={cn(POPOVER, 'w-96')}>
        <Dialog aria-label={`Hold ${run.id}`} className="space-y-3 outline-none">
          {({ close }) => <HoldRead run={run} onClose={close} />}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

/** The runs a hold may wait on, read off the list the Runs page reads (`holdCandidates`), before the form is drawn. */
function HoldRead({ run, onClose }: { run: RunDetail; onClose: () => void }) {
  const { data, error } = useQuery(runsQuery);
  if (error) {
    return (
      <div className="space-y-3">
        <div role="alert" data-hold-unread>
          <Refusal error={error} not="The runs to wait on could not be read" />
        </div>
        <Button variant="ghost" size="sm" onPress={onClose}>
          Close
        </Button>
      </div>
    );
  }
  if (!data)
    return (
      <p data-hold-reading className="text-xs text-neutral-600 dark:text-neutral-400">
        Reading the runs to wait on…
      </p>
    );
  return <HoldForm id={run.id} runs={holdCandidates(run, data)} onClose={onClose} />;
}

/**
 * The runs to wait on, ticked, the why, and Hold. The run is read again once held, its record and the list each alone (`exact`), as a lift
 * reads them, and the popover closes; a refusal stays in the form until something is changed.
 */
function HoldForm({ id, runs, onClose }: { id: string; runs: RunSummary[]; onClose: () => void }) {
  const [until, setUntil] = useState<string[]>([]);
  const [why, setWhy] = useState('');
  const queryClient = useQueryClient();
  const hold = useMutation({
    mutationFn: () => putHold(id, until, why),
    onSuccess: async () => {
      onClose();
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['runs', id], exact: true }), runsMoved(queryClient)]);
    },
  });
  return (
    <Form
      data-hold={id}
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        hold.mutate();
      }}
    >
      <Heading slot="title" className="font-semibold">{`Hold ${id}`}</Heading>
      <p className="text-xs text-neutral-600 dark:text-neutral-400">
        Nothing more of it is filed, and nothing is asked of you, until every run ticked has shipped. What runs now finishes.
      </p>
      <WaitFor
        runs={runs}
        until={until}
        isDisabled={hold.isPending}
        onChange={(value) => {
          setUntil(value);
          hold.reset();
        }}
      />
      <TextField
        value={why}
        onChange={(value) => {
          setWhy(value);
          hold.reset();
        }}
        maxLength={200}
        isDisabled={hold.isPending}
        className="flex flex-col gap-1"
      >
        <Label className="text-xs">Why (optional)</Label>
        <Input data-hold-why placeholder="merge conflicts with the run it waits on" />
      </TextField>
      {hold.isError && (
        <div role="alert" data-hold-refused>
          <Refusal error={hold.error} not="Not held" />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onPress={onClose} isDisabled={hold.isPending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" isDisabled={until.length === 0 || hold.isPending}>
          {hold.isPending ? 'Holding…' : 'Hold'}
        </Button>
      </div>
    </Form>
  );
}

/** The runs a hold may wait on, each a checkbox with its title and id, in a list that scrolls; a sentence where there are none. */
function WaitFor({
  runs,
  until,
  isDisabled,
  onChange,
}: {
  runs: RunSummary[];
  until: string[];
  isDisabled: boolean;
  onChange: (until: string[]) => void;
}) {
  return (
    <CheckboxGroup value={until} onChange={onChange} isDisabled={isDisabled} className="space-y-1.5">
      <AriaLabel className="text-xs font-medium">Wait for</AriaLabel>
      {runs.length === 0 ? (
        <Text slot="description" data-hold-none className="block text-xs text-neutral-600 dark:text-neutral-400">
          No other run of its repository may still ship.
        </Text>
      ) : (
        <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
          {runs.map((r) => (
            <Checkbox key={r.id} value={r.id} data-hold-run={r.id} className="items-start">
              <span className="min-w-0">
                <span className="block truncate text-xs" title={titleOf(r)}>
                  {titleOf(r)}
                </span>
                <span className="block font-mono text-[11px] text-neutral-500">{r.id}</span>
              </span>
            </Checkbox>
          ))}
        </div>
      )}
    </CheckboxGroup>
  );
}
