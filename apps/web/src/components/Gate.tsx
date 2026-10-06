import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveStep,
  decisionQuery,
  type RetryMode,
  type RunDetail,
  type StepApproval,
  type StepCloseout,
  type StepGate,
} from '../lib/api';
import { askedSaid } from '../lib/asks';
import { decidableRun, decisionStamp, isDecidable } from '../lib/decide';
import { cn } from '../lib/utils';
import { Artifacts, HandedOn } from './Closeout';
import { BUTTON, MODES, Refusal, TEXTAREA, useAsk } from './Ask';
import { Markdown } from './Markdown';
import { when } from './Facts';

/**
 * A step waiting at its gate, beside the closeout it handed on: the two things the CLI's `ls` says a person can do. Approve, with a box for
 * the words every step after the gate is handed under `## Approved` — the CLI's `approve --message`, which may be left empty. And Send
 * back, the answer box: an objection the step's next try is told, continuing its session or in a new one — the CLI's `retry --message`,
 * which needs words. Each is the api's (`approveStep`, `askTry`), through the package, which writes a person's file and nothing else; its
 * refusal shows beside the button that made it, verbatim, the words still in the box. Once the api has taken either, what the tick does
 * with it, until the run is read again and the step says it: approved under the step, or the try asked in its note.
 *
 * `back` are the steps a send-back names, as the package names them (`sendBackTo`): the gated step itself, which is the default and §6's
 * gate; or, at an ending step's gate — held before the step is filed — the steps it waits on, whose work the objection is about, since the
 * ending has done nothing to object to. The CLI's `retry` of the step at such a gate is refused, so the button asks for a try of the work
 * instead, and where the ending waits on several steps a person picks which. Empty for an ending that waits on nothing — a workflow of one
 * step in the checkout — and then there is no send-back at all, as the CLI `ls`'s own gate note prints none (`gateNote`): approving it is
 * the only word there is to say. `acts` says the gate is an ending's: approving runs it rather than letting what follows be filed, and the
 * words given with the approval are the terms it acts on (`approvedSection`), not something handed to steps after it.
 *
 * `closeout` is what is being approved, where the gate is drawn beside it: the step's summary and each field it declared (`HandedOn`, the
 * Output tab's drawing) — for a plan its approach, then its files, steps and risks — beside Approve and Send back, since it is the one
 * thing a person must read before either: left of the answer where the page is wide, above it where it is not. The inspector's gate has
 * none: its Output tab is where the closeout is.
 *
 * An ending's approval runs it where nothing can be taken back, so it takes a second, deliberate press: Approve, then Run <step>. The words
 * of either answer go as they were typed, as `--message` takes them: none with an approval where nothing was written, and a send-back with
 * none is the package's to refuse. Where the ending waits on more than one step, one of them is enough to hold its gate again.
 */
export function Gate({
  runId,
  step,
  approveLine,
  back = [step],
  acts = false,
  framed = true,
  closeout = null,
}: {
  runId: string;
  step: string;
  /** The line that approves the step from a terminal, as the api answers it (`commands.approve` on the step). */
  approveLine: string;
  back?: readonly string[];
  acts?: boolean;
  /** False where what the gate asks is said above it already (the inspector's brief): no sentence of its own, and no box around it. */
  framed?: boolean;
  closeout?: StepCloseout | null;
}) {
  const [words, setWords] = useState('');
  const [objection, setObjection] = useState('');
  const [mode, setMode] = useState<RetryMode>('nudge');
  const [to, setTo] = useState(back[0] ?? step);
  const [confirming, setConfirming] = useState(false);
  const field = useId();
  const approval = useApprove(runId, step, () => setWords(''));
  const sendBack = useAsk(runId, step, () => setObjection(''));
  const busy = approval.isPending || sendBack.isPending;
  const backName = back.length === 1 ? back[0] : 'the work';

  const taken = approval.isSuccess
    ? takenOf({ approved: approval.data.try }, step, acts)
    : sendBack.isSuccess
      ? takenOf({ asked: sendBack.data, step: to }, step, acts)
      : null;
  if (taken) return <GateTaken step={step} taken={taken} />;

  return (
    <section
      aria-label={`The gate of ${step}`}
      data-gate="awaiting"
      className={cn(
        'space-y-4 text-sm',
        framed && 'rounded border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/30',
      )}
    >
      {framed && (
        <p className="break-words">
          <strong>{step}</strong> waits at its gate:{' '}
          {acts
            ? `nothing of it runs until you approve it — your approval is what files it${back.length ? ` — or you send ${backName} back` : ''}.`
            : 'nothing after it is filed until you approve what it handed on, or send it back.'}
        </p>
      )}

      <div className={cn('space-y-4', closeout && 'lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0')}>
        {closeout && (
          <section
            aria-label={`What ${step} handed on`}
            className="min-w-0 space-y-2 rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <h3 className="text-xs font-medium text-neutral-500">
              What <span className="font-semibold text-neutral-700 dark:text-neutral-300">{step}</span> handed on, which you approve
            </h3>
            <HandedOn closeout={closeout} />
          </section>
        )}
        <div className="min-w-0 space-y-4">
          <form
            aria-label={`Approve ${step}`}
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (acts && !confirming) return setConfirming(true);
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
              placeholder={
                acts
                  ? 'Your words (optional): the step is handed them as the terms it acts on, under “Approved”.'
                  : 'Your words (optional): every step after the gate is handed them, under “Approved”.'
              }
              className={TEXTAREA}
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button type="submit" disabled={busy} className={BUTTON}>
                {approval.isPending ? 'Approving…' : confirming ? `Run ${step} now` : 'Approve'}
              </button>
              {confirming && !approval.isPending && (
                <button type="button" onClick={() => setConfirming(false)} className={cn(BUTTON, SECONDARY)}>
                  Not yet
                </button>
              )}
              <p className="text-xs">
                as <code>{approveLine}</code> approves it: the next tick files {acts ? 'it' : 'what waits on it'}
              </p>
            </div>
            {confirming && (
              <p data-confirm className="text-xs font-medium text-amber-900 dark:text-amber-200">
                {`This runs ${step} in the repository's own checkout, and it cannot be taken back: press Run ${step} now to approve it.`}
              </p>
            )}
            {approval.isError && <Refusal error={approval.error} not="Not approved" />}
          </form>

          {back.length > 0 && (
            <form
              aria-label={`Send ${backName} back`}
              className="space-y-2 border-t border-amber-200 pt-3 dark:border-amber-900"
              onSubmit={(event) => {
                event.preventDefault();
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
                <button type="submit" disabled={busy || !objection.trim()} className={cn(BUTTON, SECONDARY)}>
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
          )}
        </div>
      </div>
    </section>
  );
}

/** A gate once a person's word is taken (`takenOf`): the step it was about, and what the next tick does with it. */
function GateTaken({ step, taken }: { step: string; taken: { named: string; said: string } }) {
  return (
    <section
      aria-label={`The gate of ${step}`}
      data-gate="taken"
      className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
    >
      <strong>{taken.named}</strong>{' '}
      <span data-note className="font-mono text-xs text-neutral-600 dark:text-neutral-400">
        {taken.said}
      </span>
    </section>
  );
}

/**
 * What a gate says the moment a person's word is taken, until the run is read again and the step's own note says it: the step the word was
 * about, and what the next tick does with it.
 *
 * An approval is about the gated step, and what follows it is filed — except at an ending step's gate (`acts`), where nothing follows and
 * the approval files that step itself. A send-back is about the step whose try was asked for, which at such a gate is the work and not the
 * step at the gate (`sendBackTo` in agent-orchestrator): naming the ending there would say a try was filed for a step that has not run.
 */
export const takenOf = (
  taken: { approved: number } | { asked: { try: number; stopFirst: boolean }; step: string },
  step: string,
  acts: boolean,
): { named: string; said: string } =>
  'approved' in taken
    ? { named: step, said: `approved try ${taken.approved} — the next tick files ${acts ? 'it' : 'what waits on it'}` }
    : { named: taken.step, said: askedSaid(taken.asked) };

/**
 * Whether the step ends the run in the repository's own checkout, off the workflow the run froze (`workspace: main`, `approvedFirst` in
 * agent-orchestrator): its gate holds before it is filed, and a person's approval is what files it.
 *
 * A gate on a step that works, §6's, holds the handoff after the step has signed off, so that step has a task and a closeout to read; an
 * ending step acts where nothing can be taken back, and has no closeout of its own — what a person approves is the work it would act on.
 * The two read the same off a step's record at its gate (unfiled, awaiting approval), so the key is what tells them apart; a detail from an
 * api that does not carry it reads as any other step, and its gate is drawn as §6's.
 */
export const endsTheRun = (step: Pick<RunDetail['steps'][number], 'spec'>): boolean => step.spec?.workspace === 'main';

/**
 * What an ending step would act on, beside its gate: the run's result, for the person deciding whether to let it run.
 *
 * Where each result branch stands against the base branch and how much it changed, in the package's words (`branchWord`, `countsLine`,
 * off the run's decision, which the Decide section on this page has already read for this state of the run); then, for each step the
 * ending waits on — the steps a send-back goes to (`sendBackTo`) — the closeout it handed on, rendered, with the files it named. That is
 * the whole of what there is to read: the ending has run nothing and said nothing. The counts sit under each branch — `3 files: +14 −1`,
 * or the sentence saying what the run changed is not known — as the CLI's `decide` prints them beside the branch; the steps waited on are read in the run's order off the graph the api gives, whatever the
 * ending's spec reads.
 */
export function ActsOn({ run, step }: { run: RunDetail; step: RunDetail['steps'][number] }) {
  const { data, error } = useQuery({ ...decisionQuery(run.id, decisionStamp(run)), enabled: decidableRun(run) });
  const standings = isDecidable(data) ? data.standings : [];
  const waitsOn = new Set(run.graph.edges.filter((e) => e.kind === 'after' && e.to === step.name).map((e) => e.from));
  const work = run.steps.filter((one) => waitsOn.has(one.name));

  return (
    <section
      aria-label={`What ${step.name} would act on`}
      className="min-w-0 space-y-3 rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800"
    >
      <div className="space-y-1">
        <h3 className="text-xs font-medium text-neutral-500">The result it would act on</h3>
        {standings.map((s) => (
          <p key={s.branch} data-standing={s.where} className="break-words">
            <span className="font-mono text-xs">{s.said}</span>
            {s.stat && (
              <span data-stat className="block font-mono text-xs text-neutral-500">
                {s.stat}
              </span>
            )}
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
          {one.closeout ? (
            <Markdown>{one.closeout.summary}</Markdown>
          ) : (
            <p className="text-xs text-neutral-500">It signed off with nothing to read.</p>
          )}
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

/**
 * A gated step's gate as a word, for its facts: approved, awaiting approval, or where it holds — once the step has signed off, and for a
 * step that ends the run in the checkout (`ends`, `endsTheRun`) once the work it acts on has, since such a step never signs off before its
 * gate and its approval is what files it. The package's own refusal says it the same way (`approvalRefusal` in agent-orchestrator).
 */
export const gateWord = (gate: StepGate, ends = false): string =>
  gate.approval
    ? `approved, try ${gate.approval.try}`
    : gate.awaiting
      ? 'awaiting approval'
      : ends
        ? 'holds once the work has handed on, and your approval files it'
        : 'holds once it has signed off';

/**
 * A gated step's approval, under the step: the try approved, when, and the words given with it, as the person wrote them — what every step
 * after the gate is handed under `## Approved`.
 *
 * `ends` for the step that ends the run in the checkout (`endsTheRun`): nothing follows its gate, and the package hands the words to that
 * step itself — the terms it acts on (`approvedSection` in agent-orchestrator). Its approval is also what filed it, so the sentence says
 * that and not that something after it was let through.
 */
export function Approved({ step, approval, ends = false }: { step: string; approval: StepApproval; ends?: boolean }) {
  return (
    <section
      aria-label={`The approval of ${step}`}
      data-approval={approval.try}
      className="space-y-1 rounded border border-emerald-300 bg-emerald-50/60 px-3 py-2 text-sm dark:border-emerald-900 dark:bg-emerald-950/30"
    >
      <p>
        <span className="font-medium text-emerald-800 dark:text-emerald-300">Approved</span>{' '}
        <span className="text-neutral-600 dark:text-neutral-400">
          try {approval.try}, {when(approval.at)} —{' '}
          {ends
            ? `your approval filed it, and the step is handed ${approval.message === null ? 'it' : 'these words'} as the terms it acts on`
            : `every step after the gate is handed ${approval.message === null ? 'the approval' : 'these words'}`}
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

/** The look of a gate's second button: outlined, beside the filled one that answers. */
export const SECONDARY =
  'bg-white text-neutral-900 ring-1 ring-neutral-300 ring-inset hover:bg-neutral-100 disabled:hover:bg-white dark:bg-neutral-900 dark:text-neutral-100 dark:ring-neutral-700 dark:hover:bg-neutral-800 dark:disabled:hover:bg-neutral-900';

/**
 * An approval of a step at its gate through the api (`approveStep`), and the run read again once the api has it — its detail, and the
 * list the Factory's card reads, each by its own key (`exact`), never a decision: a decision is keyed by the state it was read for, and
 * refetching the key the page is on would fill it with the answer for the state after this write.
 */
export function useApprove(runId: string, step: string, onApproved: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (how: { message?: string }) => approveStep(runId, step, how),
    onSuccess: () => {
      onApproved();
      void queryClient.invalidateQueries({ queryKey: ['runs', runId], exact: true });
      void queryClient.invalidateQueries({ queryKey: ['runs'], exact: true });
    },
  });
}
