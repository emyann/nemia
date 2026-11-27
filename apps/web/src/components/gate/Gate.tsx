import { createContext, useContext, useId, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { decisionQuery } from '../../lib/api/decision.ts';
import { type Question } from '../../lib/api/tries.ts';
import { type QuestionAnswer, type RetryMode } from '../../lib/api/asks.ts';
import type { RunDetail, StepView } from '../../lib/runView';
import { askedSaid } from '../../lib/asks';
import { decidableRun, decisionStamp, isDecidable } from '../../lib/decide';
import { cn } from '../../lib/utils';
import { stepAnchor } from '../../lib/asks';
import { RouteLink } from '../agent/AgentParts';
import { LINK } from '../step/Facts';
import { MODES, Refusal, useAsk } from './Ask';
import { QuestionSeries, RecommendButton } from './Questions';
import { answersFrom, unanswered, type Draft } from '../../lib/question-draft/questionDraft.ts';
import { when } from '../step/Facts';
import { useApprove } from '../../lib/useApprove';
import type { Frozen } from '../../lib/frozen';
import { budgetsGiven, GateBudgetFields, GateBudgetRows, type Amounts, type GateBudgets, type GivenBudget } from './GateBudgets';
import { Body, Button, Label, Radio, RadioGroup, TextField } from '@/components/ui/ds';
import { Actor } from '../actor/Actor';
import { Pending, Reading, ReadingLines, CutPress } from '@/components/look';
import { troubleOf } from '@/lib/api/read';

/**
 * What a surface that holds a gate in a view of its own (the waiting card's modal) gives it to call once the api has taken an
 * approval or a send-back, so that the view closes on the answer; none where the gate stands on a page.
 */
export const GateAnswered = createContext<(() => void) | null>(null);

/** A gated step's gate, as its object's status holds it. */
type StepGate = NonNullable<StepView['gate']>;
/** A person's approval of the try a gated step is on. */
type StepApproval = NonNullable<StepGate['approval']>;

/**
 * A step waiting at its gate, beside the closeout it handed on: the two things the CLI's `ls` says a person can do. Approve, with a box for
 * the words every step after the gate is handed under `## Approved` — the CLI's `approve --message`, which may be left empty. And Send
 * back, the answer box: an objection the step's next try is told, continuing its session or in a new one — the CLI's `retry --message`,
 * which needs words. Each is the api's (`approveStep`, `askTry`), through the package, which writes a person's file and nothing else; its
 * refusal shows beside the button that made it, verbatim, the words still in the box. Once the api has taken either, what the tick does
 * with it, until the run is read again and the step says it: approved under the step, or the try asked in its note.
 *
 * `back` are the steps a send-back names, as the package names them (`sendBackTo`): the gated step itself. Empty where there is nothing to send
 * back, and then approving is the only word there is to say.
 *
 * What is being approved — the step's summary and each field it declared — is its part's Said and Gave, drawn beside the gate in the
 * step's part (`components/step/part`), so the gate draws none of it.
 *
 * `questions` are what the step's closeout asks as data, each of its question fields in turn: answered by choosing, above Approve
 * (`GateQuestions`). Approve waits until every one
 * has a choice or words, and sends the answers with its words as their note (`approvalBody`); Send back to the gated step carries them
 * too, all or none (`sendBackBody`). The api checks them against what the step asks now and writes them in the package's words.
 *
 * `budgets` are the caps the step proposes for the steps after it, where its closeout gives any (`GateBudgets`, `from: 'proposed'`):
 * drawn beside Approve, each with an amount field holding the proposal (`GateBudgetRows`). Approve sends the amounts the person changed
 * as `budgets`, and none where nothing changed, so the proposal is what the package writes (`approvalBody`, `budgetsGiven`); it waits
 * while a field holds no amount above zero.
 *
 * The words of either answer go as they were typed, as `--message` takes them: none with an approval where nothing was written, and a
 * send-back with none is the package's to refuse.
 */
export function Gate({
  runId,
  step,
  approveLine,
  back = [step],
  framed = true,
  questions = [],
  budgets,
}: {
  runId: string;
  step: string;
  /** The line that approves the step from a terminal, as the api answers it (`commands.approve` on the step). */
  approveLine: string;
  back?: readonly string[];
  /** False where what the gate asks is said above it already (the inspector's brief): no sentence of its own, and no box around it. */
  framed?: boolean;
  questions?: readonly Frozen<Question>[];
  /** The step's gate's budgets (`step.gate.budgets`): drawn with a field each while they are its proposal. */
  budgets?: Frozen<GateBudgets> | null;
}) {
  const [draft, setDraft] = useState<Draft>({});
  const [amounts, setAmounts] = useState<Amounts>({});
  const field = useId();
  const answered = useContext(GateAnswered);
  const forget = () => {
    setDraft({});
    setAmounts({});
    answered?.();
  };
  const approval = useApprove(runId, step, { onApproved: forget });
  const sendBack = useAsk(runId, step, () => {
    setDraft({});
    answered?.();
  });
  const busy = approval.isPending || sendBack.isPending;
  const answering = { questions, draft, left: unanswered(questions, draft) };
  const budgeting = budgetsGiven(budgets, amounts);

  const taken = approval.isSuccess
    ? takenOf({ approved: approval.data.try }, step)
    : sendBack.isSuccess
      ? takenOf({ asked: sendBack.data, step }, step)
      : null;
  if (taken) return <GateTaken step={step} taken={taken} />;

  return (
    <Body size="medium" component="div" className="contents">
      <section
        aria-label={`The gate of ${step}`}
        data-gate="awaiting"
        className={cn('space-y-4', framed && 'rounded border border-yours bg-surface-container-low p-3')}
      >
        {framed && <GateSentence step={step} />}

        <div className="min-w-0 space-y-4">
          {questions.length > 0 && <GateQuestions step={step} questions={questions} draft={draft} onDraft={setDraft} />}
          <GateBudgetFields step={step} budgets={budgets} amounts={amounts} onAmounts={setAmounts} />
          <ApproveForm
            step={step}
            approveLine={approveLine}
            approval={approval}
            busy={busy}
            budgeting={budgeting}
            {...answering}
          />
          {back.length > 0 && (
            <SendBackForm step={step} field={field} sendBack={sendBack} busy={busy} {...answering} />
          )}
        </div>
      </section>
    </Body>
  );
}

/** What a gate asks of a person, said above it where nothing else says it. */
function GateSentence({ step }: { step: string }) {
  return (
    <p className="break-words">
      <strong>{step}</strong> waits at its gate: nothing after it is filed until you approve what it handed on, or send it back.
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
  questions: readonly Frozen<Question>[];
  draft: Draft;
  onDraft: (next: Draft) => void;
}) {
  return (
    <section aria-label={`What ${step} asks`} data-gate-questions className="space-y-2">
      <p data-said>
        <strong>{step}</strong> asks {questions.length === 1 ? 'a question' : `${questions.length} questions`}: answer before you approve.
      </p>
      <QuestionSeries questions={questions} draft={draft} onDraft={onDraft} />
      <RecommendButton questions={questions} draft={draft} onDraft={onDraft} />
    </section>
  );
}

/** What a gate's form is given of the questions: those asked, what the person has said of them, and those not answered yet. */
type Answering = { questions: readonly Frozen<Question>[]; draft: Draft; left: readonly string[] };

const notAnswered = (left: readonly string[]) => (left.length > 0 ? `Not answered: ${left.join(' · ')}` : undefined);

/** Why Approve waits, on hover: the questions not answered, then the budgets whose field holds no amount above zero. */
const approveWaits = (left: readonly string[], unread: readonly string[]) =>
  [notAnswered(left), unread.length > 0 ? `No amount above $0 for: ${unread.join(' · ')}` : undefined].filter(Boolean).join(' — ') ||
  undefined;

/** Approve, with a box for the words — the note beside the answers where the step asks questions, and held until each has one. */
function ApproveForm({
  step,
  approveLine,
  approval,
  busy,
  budgeting,
  questions,
  draft,
  left,
}: Answering & {
  step: string;
  approveLine: string;
  approval: ReturnType<typeof useApprove>;
  busy: boolean;
  /** The budgets the person changed, and those whose field holds no amount (`budgetsGiven`). */
  budgeting: { given: readonly GivenBudget[]; unread: readonly string[] };
}) {
  const [words, setWords] = useState('');
  const handed = (what: string) => `every step after the gate is handed ${what}`;
  const hint = questions.length
    ? `A note beside the answers (optional): ${handed('it with the answers')}, under “Approved”.`
    : `Your words (optional): ${handed('them')}, under “Approved”.`;
  return (
    <form
      aria-label={`Approve ${step}`}
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        approval.mutate(approvalBody(questions, draft, words, budgeting.given));
      }}
    >
      <TextField
        aria-label={questions.length ? `A note beside the answers to ${step}, if any` : `Words to approve ${step} with, if any`}
        multiline
        value={words}
        onChange={setWords}
        placeholder={hint}
        supportingText={hint}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span title={approveWaits(left, budgeting.unread)} className="inline-flex">
          <CutPress pending={approval.isPending} type="submit" isDisabled={busy || left.length > 0 || budgeting.unread.length > 0}>
            {approval.isPending ? 'Approving…' : 'Approve'}
          </CutPress>
        </span>
        <Body size="small">
          as <code>{approveLine}</code> approves it: the next tick files what waits on it
        </Body>
      </div>
      {approval.isError && <Refusal error={approval.error} not="Not approved" />}
    </form>
  );
}

/**
 * Send back, the answer box: an objection the next try is told, continuing its session or in a new one, to the gated step. Where it asks questions, it carries the answers, all or none: held, naming those left, while only some are answered.
 */
const SEND_BACK_HINT = 'What to change: its next try is told it, under “Your answer”, and waits at its gate again.';

function SendBackForm({
  step,
  field,
  sendBack,
  busy,
  questions,
  draft,
}: Answering & {
  step: string;
  field: string;
  sendBack: ReturnType<typeof useAsk>;
  busy: boolean;
}) {
  const [objection, setObjection] = useState('');
  const [mode, setMode] = useState<RetryMode>('continue');
  const body = sendBackBody({ step, to: step, mode, objection, questions, draft });
  const waits = sendBackWaits({ step, to: step, questions, draft });
  return (
    <form
      aria-label={`Send ${step} back`}
      className="space-y-2 border-t border-outline-variant pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        sendBack.mutate(body);
      }}
    >
      <TextField
        aria-label={`What to change, sent back to ${step}`}
        multiline
        value={objection}
        onChange={setObjection}
        placeholder={SEND_BACK_HINT}
        supportingText={SEND_BACK_HINT}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span title={notAnswered(waits)} className="inline-flex">
          <Button
            icon={sendBack.isPending ? Pending : undefined}
            type="submit"
            variant="tonal"
            isDisabled={busy || waits.length > 0 || !(body.message?.trim() || body.answers)}
          >
            {sendBack.isPending ? 'Sending back…' : 'Send back'}
          </Button>
        </span>
        <Choice
          legend={`How to send ${step} back`}
          name={`${field}-mode`}
          options={GATE_MODES}
          value={mode}
          onChange={setMode}
          label={modeLabel}
        />
      </div>
      {sendBack.isError && <Refusal error={sendBack.error} />}
    </form>
  );
}

/** The modes a send-back offers, in its radios' order. */
const GATE_MODES: readonly RetryMode[] = ['continue', 'fresh'];

/** A send-back's mode as its radio says it: what it does, and the CLI's flag for it. */
const modeLabel = (m: RetryMode) =>
  (
    <>
      {MODES[m]} <code className="text-on-surface-variant">--{m}</code>
    </>
  ) satisfies ReactNode as ReactNode;

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
    <RadioGroup
      aria-label={legend}
      name={name}
      orientation="horizontal"
      value={value}
      onChange={(next) => onChange(next as T)}
      className="gap-x-3 gap-y-1"
    >
      {options.map((o) => (
        <Radio key={o} value={o}>
          {label(o)}
        </Radio>
      ))}
    </RadioGroup>
  );
}

/**
 * What an approval sends: the answers to the questions the step asks, where it asks any, in the order asked; and the words, where any were
 * written — beside answers, their note; and the budgets the person changed (`budgetsGiven`), where they changed any, and no `budgets` at
 * all where they changed none, so the package writes the step's proposal as it stands.
 *
 * @param questions the questions the step asks, none where it asks none
 * @param draft what the person chose and wrote for each question
 * @param words the words written beside the approval, empty where none
 * @param given the budgets the person changed, none where they changed none
 */
export const approvalBody = (questions: readonly Frozen<Question>[], draft: Draft, words: string, given: readonly GivenBudget[] = []) => ({
  ...(questions.length ? { answers: answersFrom(questions, draft) } : {}),
  ...(words.trim() ? { message: words } : {}),
  ...(given.length ? { budgets: given.map(({ step, usd }) => ({ step, usd })) } : {}),
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
  questions: readonly Frozen<Question>[];
  draft: Draft;
}) => {
  const left = unanswered(questions, draft);
  return (to === step && left.length < questions.length ? left : []) satisfies string[];
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
  questions: readonly Frozen<Question>[];
  draft: Draft;
}) => {
  const answered = to === step && questions.length > 0 && unanswered(questions, draft).length === 0;
  if (!answered)
    return { mode, message: objection, step: to } satisfies {
      mode: RetryMode;
      step: string;
      message?: string;
      answers?: QuestionAnswer[];
    } as { mode: RetryMode; step: string; message?: string; answers?: QuestionAnswer[] };
  return { mode, step: to, answers: answersFrom(questions, draft), ...(objection.trim() ? { message: objection } : {}) } satisfies {
    mode: RetryMode;
    step: string;
    message?: string;
    answers?: QuestionAnswer[];
  } as { mode: RetryMode; step: string; message?: string; answers?: QuestionAnswer[] };
};

/** A gate once a person's word is taken (`takenOf`): the step it was about, and what the next tick does with it. */
function GateTaken({ step, taken }: { step: string; taken: { named: string; said: string } }) {
  return (
    <Body size="medium" component="div" className="contents">
      <section aria-label={`The gate of ${step}`} data-gate="taken" className="rounded border border-outline-variant px-3 py-2">
        <strong>{taken.named}</strong>{' '}
        <Body size="small" component="span" data-note className="font-mono">
          {taken.said}
        </Body>
      </section>
    </Body>
  );
}

/**
 * What a gate says the moment a person's word is taken, until the run is read again and the step's own note says it: the step the word was
 * about, and what the next tick does with it.
 *
 * An approval is about the gated step, and what follows it is filed. A send-back is about the step whose try was asked for.
 *
 * @param taken what the api took: an approval, or an ask for a try of some step
 * @param step the gated step
 */
export const takenOf = (taken: { approved: number } | { asked: { try: number; stopFirst: boolean }; step: string }, step: string) =>
  'approved' in taken
    ? { named: step, said: `approved try ${taken.approved} — the next tick files what waits on it` }
    : { named: taken.step, said: askedSaid(taken.asked) };

/**
 * A gated step's gate as a word, for its facts: approved, awaiting approval, or where it holds — once the step has signed off. The package's
 * own refusal says it the same way (`approvalRefusal` in agent-orchestrator).
 *
 * @param gate the step's gate
 */
export const gateWord = (gate: StepGate) =>
  gate.approval ? `approved, try ${gate.approval.try}` : gate.awaiting ? 'awaiting approval' : 'holds once it has signed off';

/**
 * A gated step's approval, under the step: the try approved, when, and the words given with it, as the person wrote them — what every step
 * after the gate is handed under `## Approved`.
 *
 * `budgets`, where the step's gate carries the caps its approval set (`from: 'approved'`), are drawn under the words, read only.
 */
export function Approved({
  step,
  approval,
  budgets,
}: {
  step: string;
  approval: StepApproval;
  /** The step's gate's budgets: drawn under the approval once they are the caps it set (`from: 'approved'`). */
  budgets?: Frozen<GateBudgets> | null;
}) {
  return (
    <Body size="medium" component="div" className="contents">
      <section
        aria-label={`The approval of ${step}`}
        data-approval={approval.try}
        className="space-y-1 rounded border border-sage bg-surface-container px-3 py-2 text-on-surface-variant"
      >
        <p>
          <span className="font-medium text-on-surface">Approved</span>{' '}
          <span className="text-on-surface-variant">
            try {approval.try}, {when(approval.at)} —{' '}
            every step after the gate is handed {approval.message === null ? 'the approval' : 'these words'}
          </span>
        </p>
        <Actor actor={approval.actor} />
        {approval.message === null ? (
          <p data-words="none" className="text-on-surface-variant">
            with no words
          </p>
        ) : (
          <p data-words className="whitespace-pre-wrap break-words">
            {approval.message}
          </p>
        )}
        {budgets?.from === 'approved' && <GateBudgetRows step={step} budgets={budgets} />}
      </section>
    </Body>
  );
}
