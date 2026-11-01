import { useId, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveStep,
  decisionQuery,
  type Question,
  type QuestionAnswer,
  type RetryMode,
  type RunDetail,
  type StepApproval,
  type StepCloseout,
  type StepGate,
} from '../lib/api';
import { askedSaid } from '../lib/asks';
import { decidableRun, decisionStamp, isDecidable } from '../lib/decide';
import { cn } from '../lib/utils';
import { Artifacts, HandedOn, Statement } from './Closeout';
import { BUTTON, MODES, Refusal, TEXTAREA, useAsk } from './Ask';
import { answersFrom, QuestionFields, RecommendButton, unanswered, type Draft } from './Questions';
import { when } from './Facts';
import { runsMoved } from '@/lib/runWrites';

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
 * `questions` are what the step's closeout asks as data, each of its question fields in turn: answered by choosing, in the answer column
 * above Approve (`GateQuestions`), and then left out of what it handed on, so each question is drawn once. Approve waits until every one
 * has a choice or words, and sends the answers with its words as their note (`approvalBody`); Send back to the gated step carries them
 * too, all or none (`sendBackBody`). The api checks them against what the step asks now and writes them in the package's words.
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
  questions = [],
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
  questions?: readonly Question[];
}) {
  const [draft, setDraft] = useState<Draft>({});
  const [to, setTo] = useState(back[0] ?? step);
  const field = useId();
  const approval = useApprove(runId, step, () => setDraft({}));
  const sendBack = useAsk(runId, step, () => setDraft({}));
  const busy = approval.isPending || sendBack.isPending;
  const answering = { questions, draft, left: unanswered(questions, draft) };

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
      className={cn('space-y-4 text-body-medium', framed && 'rounded border border-yours bg-card p-3')}
    >
      {framed && <GateSentence step={step} back={back} acts={acts} />}

      <div className={cn('space-y-4', closeout && 'lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0')}>
        {closeout && (
          <section aria-label={`What ${step} handed on`} className="min-w-0 space-y-2 rounded border border-outline-variant bg-card p-3">
            <h3 className="text-label-medium text-muted-foreground">
              What <span className="font-semibold text-foreground">{step}</span> handed on, which you approve
            </h3>
            <HandedOn closeout={closeout} answeredBeside={questions.length > 0} />
          </section>
        )}
        <div className="min-w-0 space-y-4">
          {questions.length > 0 && <GateQuestions step={step} questions={questions} draft={draft} onDraft={setDraft} />}
          <ApproveForm step={step} acts={acts} approveLine={approveLine} field={field} approval={approval} busy={busy} {...answering} />
          {back.length > 0 && (
            <SendBackForm step={step} back={back} to={to} onTo={setTo} field={field} sendBack={sendBack} busy={busy} {...answering} />
          )}
        </div>
      </div>
    </section>
  );
}

/** What a gate asks of a person, said above it where nothing else says it. */
function GateSentence({ step, back, acts }: { step: string; back: readonly string[]; acts: boolean }) {
  const backName = back.length === 1 ? back[0] : 'the work';
  return (
    <p className="break-words">
      <strong>{step}</strong> waits at its gate:{' '}
      {acts
        ? `nothing of it runs until you approve it — your approval is what files it${back.length ? ` — or you send ${backName} back` : ''}.`
        : 'nothing after it is filed until you approve what it handed on, or send it back.'}
    </p>
  );
}

/** The questions a gated step asks, to answer before approving it: the fields `QuestionsForm` draws, and the recommended answers. */
function GateQuestions({
  step,
  questions,
  draft,
  onDraft,
}: {
  step: string;
  questions: readonly Question[];
  draft: Draft;
  onDraft: (next: Draft) => void;
}) {
  return (
    <section aria-label={`What ${step} asks`} data-gate-questions className="space-y-2">
      <p data-said>
        <strong>{step}</strong> asks {questions.length === 1 ? 'a question' : `${questions.length} questions`}: answer before you approve.
      </p>
      <QuestionFields questions={questions} draft={draft} onDraft={onDraft} />
      <RecommendButton questions={questions} draft={draft} onDraft={onDraft} />
    </section>
  );
}

/** What a gate's form is given of the questions: those asked, what the person has said of them, and those not answered yet. */
type Answering = { questions: readonly Question[]; draft: Draft; left: readonly string[] };

const notAnswered = (left: readonly string[]) => (left.length > 0 ? `Not answered: ${left.join(' · ')}` : undefined);

/**
 * Approve, with a box for the words — the note beside the answers where the step asks questions, and held until each has one. At an
 * ending's gate (`acts`), a second press runs it.
 */
function ApproveForm({
  step,
  acts,
  approveLine,
  field,
  approval,
  busy,
  questions,
  draft,
  left,
}: Answering & {
  step: string;
  acts: boolean;
  approveLine: string;
  field: string;
  approval: ReturnType<typeof useApprove>;
  busy: boolean;
}) {
  const [words, setWords] = useState('');
  const [confirming, setConfirming] = useState(false);
  const handed = (what: string) =>
    acts ? `the step is handed ${what} as the terms it acts on` : `every step after the gate is handed ${what}`;
  return (
    <form
      aria-label={`Approve ${step}`}
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (acts && !confirming) return setConfirming(true);
        approval.mutate(approvalBody(questions, draft, words));
      }}
    >
      <label htmlFor={`${field}-words`} className="sr-only">
        {questions.length ? `A note beside the answers to ${step}, if any` : `Words to approve ${step} with, if any`}
      </label>
      <textarea
        id={`${field}-words`}
        value={words}
        onChange={(event) => setWords(event.target.value)}
        rows={2}
        placeholder={
          questions.length
            ? `A note beside the answers (optional): ${handed('it with the answers')}, under “Approved”.`
            : `Your words (optional): ${handed('them')}, under “Approved”.`
        }
        className={TEXTAREA}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="submit" disabled={busy || left.length > 0} title={notAnswered(left)} className={BUTTON}>
          {approval.isPending ? 'Approving…' : confirming ? `Run ${step} now` : 'Approve'}
        </button>
        {confirming && !approval.isPending && (
          <button type="button" onClick={() => setConfirming(false)} className={cn(BUTTON, SECONDARY)}>
            Not yet
          </button>
        )}
        <p className="text-body-small">
          as <code>{approveLine}</code> approves it: the next tick files {acts ? 'it' : 'what waits on it'}
        </p>
      </div>
      {confirming && (
        <p data-confirm className="text-body-small font-medium text-yours">
          {`This runs ${step} in the repository's own checkout, and it cannot be taken back: press Run ${step} now to approve it.`}
        </p>
      )}
      {approval.isError && <Refusal error={approval.error} not="Not approved" />}
    </form>
  );
}

/**
 * Send back, the answer box: an objection the next try is told, continuing its session or in a new one, to one of `back`. Sent back to the
 * gated step itself where it asks questions, it carries the answers, all or none: held, naming those left, while only some are answered.
 */
function SendBackForm({
  step,
  back,
  to,
  onTo,
  field,
  sendBack,
  busy,
  questions,
  draft,
}: Answering & {
  step: string;
  back: readonly string[];
  to: string;
  onTo: (name: string) => void;
  field: string;
  sendBack: ReturnType<typeof useAsk>;
  busy: boolean;
}) {
  const [objection, setObjection] = useState('');
  const [mode, setMode] = useState<RetryMode>('continue');
  const backName = back.length === 1 ? back[0] : 'the work';
  const body = sendBackBody({ step, to, mode, objection, questions, draft });
  const waits = sendBackWaits({ step, to, questions, draft });
  return (
    <form
      aria-label={`Send ${backName} back`}
      className="space-y-2 border-t border-outline-variant pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        sendBack.mutate(body);
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
        <button
          type="submit"
          disabled={busy || waits.length > 0 || !(body.message?.trim() || body.answers)}
          title={notAnswered(waits)}
          className={cn(BUTTON, SECONDARY)}
        >
          {sendBack.isPending ? 'Sending back…' : 'Send back'}
        </button>
        <Choice
          legend={`How to send ${backName} back`}
          name={`${field}-mode`}
          options={RETRY_MODES}
          value={mode}
          onChange={setMode}
          label={modeLabel}
        />
      </div>
      {back.length > 1 && (
        <Choice legend="Which step to send back" name={`${field}-to`} options={back} value={to} onChange={onTo} label={asIs} />
      )}
      {sendBack.isError && <Refusal error={sendBack.error} />}
    </form>
  );
}

const RETRY_MODES = ['continue', 'fresh'] as const;

/** A send-back's mode as its radio says it: what it does, and the CLI's flag for it. */
const modeLabel = (m: RetryMode): ReactNode => (
  <>
    {MODES[m]} <code className="text-muted-foreground">--{m}</code>
  </>
);

/** A step's name, as its radio says it. */
const asIs = (name: string): ReactNode => name;

/** A row of radios, each option drawn by `label`: a retry's mode with its flag, or the step a send-back names. */
function Choice<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  label,
}: {
  legend: string;
  name: string;
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  label: (option: T) => ReactNode;
}) {
  return (
    <fieldset className="flex flex-wrap gap-x-3 gap-y-1 text-body-small">
      <legend className="sr-only">{legend}</legend>
      {options.map((o) => (
        <label key={o} className="flex cursor-pointer items-center gap-1.5">
          <input type="radio" name={name} value={o} checked={value === o} onChange={() => onChange(o)} />
          {label(o)}
        </label>
      ))}
    </fieldset>
  );
}

/**
 * What an approval sends: the answers to the questions the step asks, where it asks any, in the order asked; and the words, where any were
 * written — beside answers, their note.
 */
export const approvalBody = (
  questions: readonly Question[],
  draft: Draft,
  words: string,
): { message?: string; answers?: QuestionAnswer[] } => ({
  ...(questions.length ? { answers: answersFrom(questions, draft) } : {}),
  ...(words.trim() ? { message: words } : {}),
});

/**
 * The questions a send-back waits on, since the answers go all or none: those left unanswered once some are answered, where it goes to the
 * gated step itself — none while nothing is answered, or everything, and none where it goes to another step.
 */
export const sendBackWaits = ({
  step,
  to,
  questions,
  draft,
}: {
  step: string;
  to: string;
  questions: readonly Question[];
  draft: Draft;
}): string[] => {
  const left = unanswered(questions, draft);
  return to === step && left.length < questions.length ? left : [];
};

/**
 * What a send-back sends: the step it names and how, with the objection as its message. Sent to the gated step itself where it asks
 * questions and every one is answered, it carries the answers too, the objection then their note and left out when empty; to another
 * step, or with any question unanswered, no answers at all.
 */
export const sendBackBody = ({
  step,
  to,
  mode,
  objection,
  questions,
  draft,
}: {
  step: string;
  to: string;
  mode: RetryMode;
  objection: string;
  questions: readonly Question[];
  draft: Draft;
}): { mode: RetryMode; step: string; message?: string; answers?: QuestionAnswer[] } => {
  const answered = to === step && questions.length > 0 && unanswered(questions, draft).length === 0;
  if (!answered) return { mode, message: objection, step: to };
  return { mode, step: to, answers: answersFrom(questions, draft), ...(objection.trim() ? { message: objection } : {}) };
};

/** A gate once a person's word is taken (`takenOf`): the step it was about, and what the next tick does with it. */
function GateTaken({ step, taken }: { step: string; taken: { named: string; said: string } }) {
  return (
    <section
      aria-label={`The gate of ${step}`}
      data-gate="taken"
      className="rounded border border-outline-variant px-3 py-2 text-body-medium"
    >
      <strong>{taken.named}</strong>{' '}
      <span data-note className="font-mono text-body-small text-muted-foreground">
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
 * Whether the step ends the run in the repository's own checkout, off the workflow the run froze (`workspace: main`, `endsOnBase` in
 * agent-orchestrator): a gate on it holds before it is filed, and a person's approval files it; with no gate, as quick's land, the pass
 * of the step before it that can send the work back files it instead.
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
 * or the sentence saying what the run changed is not known — as the CLI's `decide` prints them beside the branch; the steps waited on are
 * read in the run's order off the graph the api gives, whatever the ending's spec reads.
 */
export function ActsOn({ run, step }: { run: RunDetail; step: RunDetail['steps'][number] }) {
  const { data, error } = useQuery({ ...decisionQuery(run.id, decisionStamp(run)), enabled: decidableRun(run) });
  const standings = isDecidable(data) ? data.standings : [];
  const waitsOn = new Set(run.graph.edges.filter((e) => e.kind === 'after' && e.to === step.name).map((e) => e.from));
  const work = run.steps.filter((one) => waitsOn.has(one.name));

  return (
    <section
      aria-label={`What ${step.name} would act on`}
      className="min-w-0 space-y-3 rounded border border-outline-variant p-3 text-body-medium"
    >
      <div className="space-y-1">
        <h3 className="text-label-medium text-muted-foreground">The result it would act on</h3>
        {standings.map((s) => (
          <p key={s.branch} data-standing={s.where} className="break-words">
            <span className="font-mono text-body-small">{s.said}</span>
            {s.stat && (
              <span data-stat className="block font-mono text-body-small text-muted-foreground">
                {s.stat}
              </span>
            )}
          </p>
        ))}
        {!standings.length && (
          <p className="text-body-small text-muted-foreground">
            {error
              ? `The branch could not be read: ${error.message}`
              : isDecidable(data)
                ? 'No result branch of its own: the work is on the base branch.'
                : 'Reading the branch…'}
          </p>
        )}
      </div>

      {work.map((one) => (
        <div key={one.name} className="min-w-0 space-y-2 border-t border-outline-variant pt-3">
          <h3 className="text-label-medium text-muted-foreground">
            What <span className="font-semibold text-foreground">{one.name}</span> handed on
          </h3>
          {one.closeout ? (
            <Statement closeout={one.closeout} />
          ) : (
            <p className="text-body-small text-muted-foreground">It signed off with nothing to read.</p>
          )}
          {one.closeout && (
            <div aria-label={`Artifacts of ${one.name}`} className="text-body-small text-muted-foreground">
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
      className="space-y-1 rounded border border-sage bg-surface-variant px-3 py-2 text-body-medium text-on-surface-variant"
    >
      <p>
        <span className="font-medium text-foreground">Approved</span>{' '}
        <span className="text-muted-foreground">
          try {approval.try}, {when(approval.at)} —{' '}
          {ends
            ? `your approval filed it, and the step is handed ${approval.message === null ? 'it' : 'these words'} as the terms it acts on`
            : `every step after the gate is handed ${approval.message === null ? 'the approval' : 'these words'}`}
        </span>
      </p>
      {approval.message === null ? (
        <p data-words="none" className="text-muted-foreground">
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
export const SECONDARY = 'bg-card text-foreground ring-1 ring-outline ring-inset hover:bg-accent disabled:hover:bg-card';

/**
 * An approval of a step at its gate through the api (`approveStep`), and the run read again once the api has it — its detail, and the
 * list the Factory's card reads, each by its own key (`exact`), never a decision: a decision is keyed by the state it was read for, and
 * refetching the key the page is on would fill it with the answer for the state after this write.
 */
export function useApprove(runId: string, step: string, onApproved: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (how: { message?: string; answers?: readonly QuestionAnswer[] }) => approveStep(runId, step, how),
    onSuccess: () => {
      onApproved();
      void queryClient.invalidateQueries({ queryKey: ['runs', runId], exact: true });
      void runsMoved(queryClient);
    },
  });
}
