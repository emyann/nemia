import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { approveStep, type RetryMode, type StepApproval, type StepGate } from '../lib/api';
import { askedSaid } from '../lib/asks';
import { cn } from '../lib/utils';
import { BUTTON, MODES, Refusal, TEXTAREA, useAsk } from './Decide';
import { when } from './Facts';

/**
 * A step waiting at its gate, beside the closeout it handed on: the two things `wf ls` says a person can do. Approve, with a box for the
 * words every step after the gate is handed under `## Approved` — `wf approve --message`, which may be left empty. And Send back, the answer
 * box: an objection the step's next try is told, continuing its session or in a new one — `wf retry --message`, which needs words. Each is
 * the api's (`approveStep`, `askTry`), through the package, which writes a person's file and nothing else; its refusal shows beside the
 * button that made it, verbatim, the words still in the box. Once the api has taken either, what the tick does with it, until the run is
 * read again and the step says it: approved under the step, or the try asked in its note.
 */
export function Gate({ runId, step }: { runId: string; step: string }) {
  const [words, setWords] = useState('');
  const [objection, setObjection] = useState('');
  const [mode, setMode] = useState<RetryMode>('nudge');
  const field = useId();
  const approval = useApprove(runId, step, () => setWords(''));
  const sendBack = useAsk(runId, step, () => setObjection(''));
  const busy = approval.isPending || sendBack.isPending;

  if (approval.isSuccess || sendBack.isSuccess) {
    return (
      <section aria-label={`The gate of ${step}`} data-gate="taken" className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800">
        <strong>{step}</strong>{' '}
        <span data-note className="font-mono text-xs text-neutral-600 dark:text-neutral-400">
          {approval.isSuccess ? `approved try ${approval.data.try} — the next tick files what waits on it` : sendBack.isSuccess ? askedSaid(sendBack.data) : null}
        </span>
      </section>
    );
  }

  return (
    <section
      aria-label={`The gate of ${step}`}
      data-gate="awaiting"
      className="space-y-4 rounded border border-amber-300 bg-amber-50/60 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30"
    >
      <p className="break-words">
        <strong>{step}</strong> waits at its gate: nothing after it is filed until you approve what it handed on, or send it back.
      </p>

      <form
        aria-label={`Approve ${step}`}
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          // Words go as they were typed, as `--message` takes them; none when nothing was written.
          approval.mutate(words.trim() ? { message: words } : {});
        }}
      >
        <label htmlFor={`${field}-words`} className="sr-only">
          {`Words to approve ${step} with, if any`}
        </label>
        <textarea
          id={`${field}-words`}
          value={words}
          onChange={(event) => setWords(event.target.value)}
          rows={2}
          placeholder="Your words (optional): every step after the gate is handed them, under “Approved”."
          className={TEXTAREA}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="submit" disabled={busy} className={BUTTON}>
            {approval.isPending ? 'Approving…' : 'Approve'}
          </button>
          <p className="text-xs">
            as <code>{`wf approve ${runId} ${step}`}</code> approves it: the next tick files what waits on it
          </p>
        </div>
        {approval.isError && <Refusal error={approval.error} not="Not approved" />}
      </form>

      <form
        aria-label={`Send ${step} back`}
        className="space-y-2 border-t border-amber-200 pt-3 dark:border-amber-900"
        onSubmit={(event) => {
          event.preventDefault();
          // An objection goes as it was typed, as `--message` takes it: the package refuses a send-back with none.
          sendBack.mutate({ mode, message: objection });
        }}
      >
        <label htmlFor={`${field}-objection`} className="sr-only">
          {`What to change, sent back to ${step}`}
        </label>
        <textarea
          id={`${field}-objection`}
          value={objection}
          onChange={(event) => setObjection(event.target.value)}
          rows={2}
          placeholder="What to change: its next try is told it, under “Your answer”, and waits at its gate again."
          className={TEXTAREA}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="submit" disabled={busy || !objection.trim()} className={cn(BUTTON, 'bg-white text-neutral-900 ring-1 ring-neutral-300 ring-inset hover:bg-neutral-100 disabled:hover:bg-white dark:bg-neutral-900 dark:text-neutral-100 dark:ring-neutral-700 dark:hover:bg-neutral-800 dark:disabled:hover:bg-neutral-900')}>
            {sendBack.isPending ? 'Sending back…' : 'Send back'}
          </button>
          <fieldset className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <legend className="sr-only">How to send {step} back</legend>
            {(['nudge', 'fresh'] as const).map((m) => (
              <label key={m} className="flex cursor-pointer items-center gap-1.5">
                <input type="radio" name={`${field}-mode`} value={m} checked={mode === m} onChange={() => setMode(m)} />
                {MODES[m]} <code className="text-neutral-500">--{m}</code>
              </label>
            ))}
          </fieldset>
        </div>
        {sendBack.isError && <Refusal error={sendBack.error} />}
      </form>
    </section>
  );
}

/** A gated step's gate as a word, for its facts: approved, awaiting approval, or where it holds once the step has signed off. */
export const gateWord = (gate: StepGate): string =>
  gate.approval ? `approved, try ${gate.approval.try}` : gate.awaiting ? 'awaiting approval' : 'holds once it has signed off';

/**
 * A gated step's approval, under the step: the try approved, when, and the words given with it, as the person wrote them — what every step
 * after the gate is handed under `## Approved`.
 */
export function Approved({ step, approval }: { step: string; approval: StepApproval }) {
  return (
    <section
      aria-label={`The approval of ${step}`}
      data-approval={approval.try}
      className="space-y-1 rounded border border-emerald-300 bg-emerald-50/60 px-3 py-2 text-sm dark:border-emerald-900 dark:bg-emerald-950/30"
    >
      <p>
        <span className="font-medium text-emerald-800 dark:text-emerald-300">Approved</span>{' '}
        <span className="text-neutral-600 dark:text-neutral-400">
          try {approval.try}, {when(approval.at)} — every step after the gate is handed {approval.message === null ? 'the approval' : 'these words'}
        </span>
      </p>
      {approval.message === null ? (
        <p data-words="none" className="text-neutral-500">
          with no words
        </p>
      ) : (
        <p data-words className="whitespace-pre-wrap break-words">
          {approval.message}
        </p>
      )}
    </section>
  );
}

/** An approval of a step at its gate through the api (`approveStep`), and the run read again once the api has it. */
function useApprove(runId: string, step: string, onApproved: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (how: { message?: string }) => approveStep(runId, step, how),
    onSuccess: () => {
      onApproved();
      // The run as the api has it now: the step's approval under it, and the step waiting on nobody.
      void queryClient.invalidateQueries({ queryKey: ['runs', runId] });
    },
  });
}
