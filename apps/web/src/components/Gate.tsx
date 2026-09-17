import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { approveStep, decisionQuery, type RetryMode, type RunDetail, type StepApproval, type StepGate } from '../lib/api';
import { askedSaid } from '../lib/asks';
import { decidableRun, decisionStamp, isDecidable } from '../lib/decide';
import { cn } from '../lib/utils';
import { Artifacts } from './Closeout';
import { BUTTON, MODES, Refusal, TEXTAREA, useAsk } from './Decide';
import { Markdown } from './Markdown';
import { when } from './Facts';

/**
 * A step waiting at its gate, beside the closeout it handed on: the two things `wf ls` says a person can do. Approve, with a box for the
 * words every step after the gate is handed under `## Approved` — `wf approve --message`, which may be left empty. And Send back, the answer
 * box: an objection the step's next try is told, continuing its session or in a new one — `wf retry --message`, which needs words. Each is
 * the api's (`approveStep`, `askTry`), through the package, which writes a person's file and nothing else; its refusal shows beside the
 * button that made it, verbatim, the words still in the box. Once the api has taken either, what the tick does with it, until the run is
 * read again and the step says it: approved under the step, or the try asked in its note.
 *
 * `back` are the steps a send-back names, as the package names them (`sendBackTo`): the gated step itself, which is the default and §6's
 * gate; or, at an ending step's gate — held before the step is filed — the steps it waits on, whose work the objection is about, since the
 * ending has done nothing to object to. `wf retry` of the step at such a gate is refused, so the button asks for a try of the work instead,
 * and where the ending waits on several steps a person picks which. `acts` says the gate is an ending's: approving runs it rather than
 * letting what follows be filed.
 */
export function Gate({ runId, step, back = [step], acts = false }: { runId: string; step: string; back?: readonly string[]; acts?: boolean }) {
  const [words, setWords] = useState('');
  const [objection, setObjection] = useState('');
  const [mode, setMode] = useState<RetryMode>('nudge');
  const [to, setTo] = useState(back[0] ?? step);
  const field = useId();
  const approval = useApprove(runId, step, () => setWords(''));
  const sendBack = useAsk(runId, step, () => setObjection(''));
  const busy = approval.isPending || sendBack.isPending;
  // What the send-back's words name: the one step it goes to, or the work where there are several and a person picks one.
  const backName = back.length === 1 ? back[0]! : 'the work';

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
        <strong>{step}</strong> waits at its gate:{' '}
        {acts
          ? `nothing of it runs until you approve it — your approval is what files it — or you send ${backName} back.`
          : 'nothing after it is filed until you approve what it handed on, or send it back.'}
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
            as <code>{`wf approve ${runId} ${step}`}</code> approves it: the next tick files {acts ? 'it' : 'what waits on it'}
          </p>
        </div>
        {approval.isError && <Refusal error={approval.error} not="Not approved" />}
      </form>

      <form
        aria-label={`Send ${backName} back`}
        className="space-y-2 border-t border-amber-200 pt-3 dark:border-amber-900"
        onSubmit={(event) => {
          event.preventDefault();
          // An objection goes as it was typed, as `--message` takes it: the package refuses a send-back with none. To the step the
          // package sends it to, which at an ending's gate is the work and not the step at the gate.
          sendBack.mutate({ mode, message: objection, step: to });
        }}
      >
        <label htmlFor={`${field}-objection`} className="sr-only">
          {`What to change, sent back to ${backName}`}
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
            <legend className="sr-only">How to send {backName} back</legend>
            {(['nudge', 'fresh'] as const).map((m) => (
              <label key={m} className="flex cursor-pointer items-center gap-1.5">
                <input type="radio" name={`${field}-mode`} value={m} checked={mode === m} onChange={() => setMode(m)} />
                {MODES[m]} <code className="text-neutral-500">--{m}</code>
              </label>
            ))}
          </fieldset>
        </div>
        {/* Which step the objection goes to, where the ending waits on more than one: one of them is enough to hold its gate again. */}
        {back.length > 1 && (
          <fieldset className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <legend className="sr-only">Which step to send back</legend>
            {back.map((name) => (
              <label key={name} className="flex cursor-pointer items-center gap-1.5">
                <input type="radio" name={`${field}-to`} value={name} checked={to === name} onChange={() => setTo(name)} />
                {name}
              </label>
            ))}
          </fieldset>
        )}
        {sendBack.isError && <Refusal error={sendBack.error} />}
      </form>
    </section>
  );
}

/**
 * Whether a step's gate holds before the step is filed, which is an ending step's gate (`approvedFirst`, `waitsAtGate` in agent-workflows):
 * it waits at its gate and has never run. A gate on a step that works, §6's, holds the handoff after the step has signed off, so that step
 * has a task and a closeout to read; an ending step acts where nothing can be taken back, so its approval is what runs it, and there is no
 * closeout of its own — what a person approves is the work it would act on.
 */
export const actsOnly = (step: Pick<RunDetail['steps'][number], 'taskId' | 'gate'>): boolean => Boolean(step.gate?.awaiting) && step.taskId === null;

/**
 * What an ending step would act on, beside its gate: the run's result, for the person deciding whether to let it run.
 *
 * Where each result branch stands against the base branch and how much it changed, in the package's words (`branchWord`, `diffStat`, off
 * the run's decision, which the Decide section on this page has already read for this state of the run); then, for each step the ending
 * waits on — the steps a send-back goes to (`sendBackTo`) — the closeout it handed on, rendered, with the files it named. That is the
 * whole of what there is to read: the ending has run nothing and said nothing.
 */
export function ActsOn({ run, step }: { run: RunDetail; step: RunDetail['steps'][number] }) {
  const { data, error } = useQuery({ ...decisionQuery(run.id, decisionStamp(run)), enabled: decidableRun(run) });
  const standings = isDecidable(data) ? data.standings : [];
  // The steps it waits on, in the run's order, off the graph the api gives: what its work is, whatever its spec reads as.
  const waitsOn = new Set(run.graph.edges.filter((e) => e.kind === 'after' && e.to === step.name).map((e) => e.from));
  const work = run.steps.filter((one) => waitsOn.has(one.name));

  return (
    <section aria-label={`What ${step.name} would act on`} className="min-w-0 space-y-3 rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800">
      <div className="space-y-1">
        <h3 className="text-xs font-medium text-neutral-500">The result it would act on</h3>
        {standings.map((s) => (
          <p key={s.branch} data-standing={s.where} className="break-words">
            <span className="font-mono text-xs">{s.said}</span>
            {/* Git's own `--shortstat`, as `wf decide` prints it beside the branch. */}
            {s.stat && <span data-stat className="block font-mono text-xs text-neutral-500">{s.stat}</span>}
          </p>
        ))}
        {!standings.length && (
          <p className="text-xs text-neutral-500">
            {error
              ? `The branch could not be read: ${error.message}`
              : isDecidable(data)
                ? 'No result branch of its own: the work is on the base branch.'
                : 'Reading the branch…'}
          </p>
        )}
      </div>

      {work.map((one) => (
        <div key={one.name} className="min-w-0 space-y-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <h3 className="text-xs font-medium text-neutral-500">
            What <span className="font-semibold text-neutral-700 dark:text-neutral-300">{one.name}</span> handed on
          </h3>
          {one.closeout ? <Markdown>{one.closeout.summary}</Markdown> : <p className="text-xs text-neutral-500">It signed off with nothing to read.</p>}
          {one.closeout && (
            <div aria-label={`Artifacts of ${one.name}`} className="text-xs text-neutral-500">
              Artifacts:
              <Artifacts artifacts={one.closeout.artifacts} />
            </div>
          )}
        </div>
      ))}
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
