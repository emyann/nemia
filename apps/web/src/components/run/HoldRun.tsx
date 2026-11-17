import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { putHold } from '../../lib/api/runs.ts';
import type { RunView } from '../../lib/api/judged.ts';
import { useRunNamespace } from '@/lib/runNamespace';
import { titleOf } from '../../lib/factory';
import { holdCandidates } from '../../lib/hold.ts';
import { usePickerRuns } from '../../lib/pickerRuns.ts';
import { Refusal } from '../gate/Ask';
import { ShowOlder } from '../agent/ContextPicker';
import { runsMoved } from '@/lib/runWrites';
import { Reading } from '@/components/look';
import { Body, Button, Checkbox, CheckboxGroup, Skeleton, TextField, Title } from '@/components/ui/ds';

/**
 * The hold's question, wherever it is asked: the runs a hold may wait on (`holdCandidates`), read before the form is drawn — those not
 * finished, newest created first, then the finished, newest finished first, a page at a time with Show older for the next
 * (`usePickerRuns`) — and the form. `onClose` closes the surface it is asked in, once held or cancelled.
 */
export function HoldQuestion({ run, onClose }: { run: Pick<RunView, 'id' | 'repo'>; onClose: () => void }) {
  const { open, finished, more, older, reading, error } = usePickerRuns();
  if (error) {
    return (
      <div className="space-y-3">
        <div role="alert" data-hold-unread>
          <Refusal error={error} not="The runs to wait on could not be read" />
        </div>
        <Button variant="text" size="xsmall" onPress={onClose}>
          Close
        </Button>
      </div>
    );
  }
  if (reading)
    return (
      <div data-hold-reading>
        <Reading label="Reading the runs to wait on…" className="divide-y divide-outline-variant rounded border border-outline">
          {[0, 1, 2].map((at) => (
            <div key={at} className="flex items-center gap-2 px-2 py-1 text-body-medium">
              <Skeleton shape="rectangle" className="size-4 rounded-none" />
              <Skeleton className="flex-1" />
            </div>
          ))}
        </Reading>
      </div>
    );
  return <HoldForm id={run.id} runs={holdCandidates(run, [...open, ...finished])} older={more ? older : null} onClose={onClose} />;
}

/**
 * The runs to wait on, ticked, the why, and Hold. The run is read again once held, its record and the list each alone (`exact`), as a lift
 * reads them, and the popover closes; a refusal stays in the form until something is changed.
 */
function HoldForm({ id, runs, older, onClose }: { id: string; runs: RunView[]; older: (() => void) | null; onClose: () => void }) {
  const [until, setUntil] = useState<string[]>([]);
  const [why, setWhy] = useState('');
  const queryClient = useQueryClient();
  const namespaceNow = useRunNamespace(id);
  const hold = useMutation({
    mutationFn: () => namespaceNow().then((ns) => putHold(ns, id, until, why)),
    onSuccess: async () => {
      onClose();
      await runsMoved(queryClient, id);
    },
  });
  return (
    <form
      data-hold={id}
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        hold.mutate();
      }}
    >
      <Title size="small" component="h2">{`Hold ${id}`}</Title>
      <Body size="small" colorRole="on-surface-variant">
        Nothing more of it is filed, and nothing is asked of you, until every run ticked has landed, or, with none ticked, until you lift
        the hold. What runs now finishes.
      </Body>
      <WaitFor
        runs={runs}
        until={until}
        older={older}
        isDisabled={hold.isPending}
        onChange={(value) => {
          setUntil(value);
          hold.reset();
        }}
      />
      <TextField
        data-hold-why
        label="Why (optional)"
        placeholder="merge conflicts with the run it waits on"
        value={why}
        onChange={(value) => {
          setWhy(value);
          hold.reset();
        }}
        maxLength={200}
        isDisabled={hold.isPending}
        className="w-full"
      />
      {hold.isError && (
        <div role="alert" data-hold-refused>
          <Refusal error={hold.error} not="Not held" />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outlined" size="xsmall" onPress={onClose} isDisabled={hold.isPending}>
          Cancel
        </Button>
        <Button type="submit" size="xsmall" isDisabled={hold.isPending}>
          {hold.isPending ? 'Holding…' : 'Hold'}
        </Button>
      </div>
    </form>
  );
}

/**
 * The runs a hold may wait on, each a checkbox with its title and id, in a list that scrolls; and Show older while there are older
 * finished runs to read (`older`), else a sentence where there are none.
 */
function WaitFor({
  runs,
  until,
  older,
  isDisabled,
  onChange,
}: {
  runs: RunView[];
  until: string[];
  older: (() => void) | null;
  isDisabled: boolean;
  onChange: (until: string[]) => void;
}) {
  return (
    <CheckboxGroup
      label="Wait for"
      value={until}
      onChange={onChange}
      isDisabled={isDisabled}
      supportingText={
        runs.length === 0 && !older ? (
          <span data-hold-none>No other run of its repository may still land: it is held until you lift it.</span>
        ) : null
      }
      className="gap-1.5"
    >
      {runs.length > 0 && (
        <div className="max-h-56 overflow-y-auto pr-1">
          {runs.map((r) => (
            <Checkbox key={r.id} value={r.id} data-hold-run={r.id} className="flex w-full">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-small" title={titleOf(r)}>
                  {titleOf(r)}
                </span>
                <span className="block font-mono text-body-small text-muted-foreground">{r.id}</span>
              </span>
            </Checkbox>
          ))}
        </div>
      )}
      {older && <ShowOlder onPress={older} />}
    </CheckboxGroup>
  );
}
