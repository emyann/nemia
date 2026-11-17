import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createWorkflow, workflowsQuery } from '../../lib/api/workflows.ts';
import type { WorkflowStepSpec } from '../../lib/api/library.ts';
import { firstStep, listedWith } from '../../lib/builder';
import { rereadWorkflows } from '../../lib/placed';
import { Button, Radio, RadioGroup, TextField } from '@/components/ui/ds';

/** Where a workflow's steps may work, each with the words a person chooses it by: none is chosen for them. */
const PLACES: ReadonlyArray<{ place: NonNullable<WorkflowStepSpec['place']>; label: string; hint: string }> = [
  { place: 'git', label: "On a repository's branches", hint: 'each step on a branch of the repository the run is started in' },
  { place: 'folder', label: 'In folders the run makes', hint: 'each step in a folder of its own, with no git repository' },
];

/** The places a person chooses a new workflow's steps to work in, as radios: `place` chosen, none while it is null. */
function PlaceChoice({
  place,
  onChange,
}: {
  place: WorkflowStepSpec['place'];
  onChange: (place: NonNullable<WorkflowStepSpec['place']>) => void;
}) {
  return (
    <RadioGroup
      label="Where its steps work"
      value={place}
      onChange={(next) => onChange(next as NonNullable<WorkflowStepSpec['place']>)}
      className="grid gap-2 @md/page:grid-cols-2"
    >
      {PLACES.map((p) => (
        <Radio key={p.place} value={p.place}>
          <span className="flex flex-col gap-0.5">
            <span className="text-body-medium font-medium">{p.label}</span>
            <span className="text-body-small text-muted-foreground">{p.hint}</span>
          </span>
        </Radio>
      ))}
    </RadioGroup>
  );
}

/** Why the api made nothing: `message`, its words. */
function Refused({ message }: { message: string }) {
  return (
    <div data-refused className="space-y-1 rounded border border-failure bg-failure-container px-3 py-2">
      <p className="text-body-medium font-medium text-on-failure-container">Not made. The api refused it:</p>
      <p className="font-mono text-body-small whitespace-pre-wrap break-words text-on-failure-container">{message}</p>
    </div>
  );
}

/**
 * A new workflow of yours, in `folder`, your workflows' folder: its name — its folder's — and a first step, a name, what it is told and
 * where it works, which a person chooses (`POST /api/namespaces/default/workflows`). Once made, `onCreated` is told its name, and the
 * board opens its page with its builder. Refused in the api's words: a name taken, or a step the package refuses.
 */
export function NewWorkflow({ folder, onCreated }: { folder: string; onCreated: (name: string) => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [step, setStep] = useState('');
  const [body, setBody] = useState('');
  const [place, setPlace] = useState<WorkflowStepSpec['place']>(null);
  const first = firstStep(step, body, place);
  const create = useMutation({
    mutationFn: (made: NonNullable<typeof first>) => createWorkflow(name, made),
    onSuccess: (made) => {
      onCreated(made.name);
      queryClient.setQueryData(workflowsQuery.queryKey, (list) => listedWith(list, made));
      void rereadWorkflows(queryClient);
      setOpen(false);
      setName('');
      setStep('');
      setBody('');
      setPlace(null);
    },
  });

  if (!open) {
    return (
      <Button variant="outlined" onPress={() => setOpen(true)}>
        New workflow
      </Button>
    );
  }
  return (
    <form
      aria-label="New workflow"
      className="space-y-3 rounded-lg border border-outline-variant bg-card p-4 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (first) create.mutate(first);
      }}
    >
      <div className="space-y-0.5">
        <h2 className="text-title-small">New workflow</h2>
        <p className="text-body-small text-muted-foreground">
          A folder of yours, under <code className="font-mono">{folder}/</code>, with its first step. Its page opens in its builder.
        </p>
      </div>
      <div className="grid gap-3 @md/page:grid-cols-2">
        <TextField label="Workflow name" value={name} onChange={setName} placeholder="triage" inputClassName="font-mono" />
        <TextField label="First step" value={step} onChange={setStep} placeholder="plan" inputClassName="font-mono" />
      </div>
      <TextField label="What it is told" multiline value={body} onChange={setBody} />
      <PlaceChoice place={place} onChange={setPlace} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" isDisabled={!name.trim() || !first || create.isPending}>
          {create.isPending ? 'Making…' : 'Make it'}
        </Button>
        <Button
          variant="outlined"
          onPress={() => {
            setOpen(false);
            create.reset();
          }}
        >
          Cancel
        </Button>
      </div>
      {create.isError && <Refused message={create.error.message} />}
    </form>
  );
}
