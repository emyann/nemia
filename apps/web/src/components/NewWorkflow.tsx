import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createWorkflow, workflowsQuery } from '../lib/api';
import type { WorkflowStepSpec } from '../lib/api';
import { firstStep, listedWith } from '../lib/builder';
import { rereadWorkflows } from '../lib/placed';

const INPUT =
  'block w-full rounded border border-outline bg-background px-2 py-1.5 text-sm placeholder:text-muted-foreground focus:border-on-surface-variant focus:outline-none';

/** Where a workflow's steps may work, each with the words a person chooses it by: none is chosen for them. */
const PLACES: ReadonlyArray<{ place: NonNullable<WorkflowStepSpec['place']>; label: string; hint: string }> = [
  { place: 'git', label: "On a repository's branches", hint: 'each step on a branch of the repository the run is started in' },
  { place: 'folder', label: 'In folders the run makes', hint: 'each step in a folder of its own, with no git repository' },
];

/** The places a person chooses a new workflow's steps to work in, as radios under `name`: `place` checked, none while it is null. */
function PlaceChoice({
  name,
  place,
  onChange,
}: {
  name: string;
  place: WorkflowStepSpec['place'];
  onChange: (place: NonNullable<WorkflowStepSpec['place']>) => void;
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="block text-xs font-medium">Where its steps work</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {PLACES.map((p) => (
          <label
            key={p.place}
            className="grid cursor-pointer grid-cols-[auto_1fr] items-start gap-x-2 gap-y-0.5 rounded border border-outline px-2 py-1.5 text-sm has-checked:border-on-surface-variant has-checked:bg-accent"
          >
            <input
              type="radio"
              name={name}
              value={p.place}
              checked={place === p.place}
              onChange={() => onChange(p.place)}
              className="mt-1"
            />
            <span className="font-medium">{p.label}</span>
            <span className="col-start-2 text-xs text-muted-foreground">{p.hint}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Why the api made nothing: `message`, its words. */
function Refused({ message }: { message: string }) {
  return (
    <div data-refused className="space-y-1 rounded border border-failure bg-failure-container px-3 py-2">
      <p className="text-sm font-medium text-on-failure-container">Not made. The api refused it:</p>
      <p className="font-mono text-xs whitespace-pre-wrap break-words text-on-failure-container">{message}</p>
    </div>
  );
}

/**
 * A new workflow of yours, in `folder`, your workflows' folder: its name — its folder's — and a first step, a name, what it is told and
 * where it works, which a person chooses (`POST /api/workflows/yours`). Once made, `onCreated` is told its name, and the board opens its
 * page with its builder. Refused in the api's words: a name taken, or a step the package refuses.
 */
export function NewWorkflow({ folder, onCreated }: { folder: string; onCreated: (name: string) => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [step, setStep] = useState('');
  const [body, setBody] = useState('');
  const [place, setPlace] = useState<WorkflowStepSpec['place']>(null);
  const ids = { name: useId(), step: useId(), body: useId(), place: useId() };
  const first = firstStep(step, body, place);
  const create = useMutation({
    mutationFn: (made: NonNullable<typeof first>) => createWorkflow(name, made),
    onSuccess: (made) => {
      onCreated(made.workflow.name);
      queryClient.setQueryData(workflowsQuery.queryKey, (list) => listedWith(list, made.workflow));
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-outline px-3 py-1.5 text-sm font-medium hover:bg-accent"
      >
        New workflow
      </button>
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
        <h2 className="text-sm font-semibold">New workflow</h2>
        <p className="text-xs text-muted-foreground">
          A folder of yours, under <code className="font-mono">{folder}/</code>, with its first step. Its page opens in its builder.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={ids.name} className="block text-xs font-medium">
            Workflow name
          </label>
          <input
            id={ids.name}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="triage"
            className={`${INPUT} font-mono`}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={ids.step} className="block text-xs font-medium">
            First step
          </label>
          <input
            id={ids.step}
            value={step}
            onChange={(event) => setStep(event.target.value)}
            placeholder="plan"
            className={`${INPUT} font-mono`}
          />
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor={ids.body} className="block text-xs font-medium">
          What it is told
        </label>
        <textarea id={ids.body} value={body} rows={3} onChange={(event) => setBody(event.target.value)} className={`${INPUT} resize-y`} />
      </div>
      <PlaceChoice name={ids.place} place={place} onChange={setPlace} />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={!name.trim() || !first || create.isPending}
          className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {create.isPending ? 'Making…' : 'Make it'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            create.reset();
          }}
          className="rounded border border-outline px-3 py-1.5 text-sm font-medium hover:bg-accent"
        >
          Cancel
        </button>
      </div>
      {create.isError && <Refused message={create.error.message} />}
    </form>
  );
}
