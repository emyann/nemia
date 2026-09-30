import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createWorkflow, workflowsQuery } from '../lib/api';
import { listedWith, UNSET } from '../lib/builder';

const INPUT =
  'block w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:placeholder:text-neutral-500 dark:focus:border-neutral-400';

/**
 * A new workflow of yours: its name — its folder's — and a first step, a name and what it is told (`POST /api/workflows/yours`). Once
 * made, `onCreated` is told its name, and the page opens its builder. Refused in the api's words: a name taken, or a step the package
 * refuses.
 */
export function NewWorkflow({ onCreated }: { onCreated: (name: string) => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [step, setStep] = useState('');
  const [body, setBody] = useState('');
  const ids = { name: useId(), step: useId(), body: useId() };
  const create = useMutation({
    mutationFn: () => createWorkflow(name, { name: step, spec: { ...UNSET }, body, own: null }),
    onSuccess: (made) => {
      onCreated(made.workflow.name);
      queryClient.setQueryData(workflowsQuery.queryKey, (list) => listedWith(list, made.workflow));
      void queryClient.invalidateQueries({ queryKey: workflowsQuery.queryKey, exact: true });
      setOpen(false);
      setName('');
      setStep('');
      setBody('');
    },
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        New workflow
      </button>
    );
  }
  return (
    <form
      aria-label="New workflow"
      className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate();
      }}
    >
      <div className="space-y-0.5">
        <h2 className="text-sm font-semibold">New workflow</h2>
        <p className="text-xs text-neutral-500">
          A folder of yours, under <code className="font-mono">~/.agent-workflows/workflows/</code>, with its first step. Its builder opens
          once it is made.
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
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={!name.trim() || !step.trim() || !body.trim() || create.isPending}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 dark:disabled:hover:bg-neutral-100"
        >
          {create.isPending ? 'Making…' : 'Make it'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            create.reset();
          }}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Cancel
        </button>
      </div>
      {create.isError && (
        <div data-refused className="space-y-1 rounded border border-red-300 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/40">
          <p className="text-sm font-medium text-red-800 dark:text-red-300">Not made. The api refused it:</p>
          <p className="font-mono text-xs whitespace-pre-wrap break-words text-red-800 dark:text-red-300">{create.error.message}</p>
        </div>
      )}
    </form>
  );
}
