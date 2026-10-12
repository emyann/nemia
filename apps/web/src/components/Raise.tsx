/**
 * A step past its budget, offered the raise of its cap the package takes (`RaiseRow`), and what its try sends (`raiseBody`): the answer
 * row's twin on the Decide section, beside a box for the amount.
 */
import { useId, useState } from 'react';
import type { Question, QuestionAnswer, RetryMode } from '../lib/api';
import { askedSaid, raiseTo, type Answer } from '../lib/asks';
import { cn } from '../lib/utils';
import { BUTTON, MODES, Refusal, TEXTAREA, useAsk, useRound } from './Ask';
import { answersFrom, Asks, QuestionFields, RecommendButton, unanswered, type Draft } from './Questions';

const AMOUNT =
  'w-24 rounded border border-outline bg-background px-2 py-1 font-mono text-sm focus:border-on-surface-variant focus:outline-none';

/**
 * A step past its budget — over it, ended at it, or a check that did not finish past it — and the raise of its cap the package takes
 * (`raise`): its word, with the amounts; a box for the cap to raise it to, started at the first whole dollar above what the package says it
 * has to pass (`raiseTo`); and the button that asks — with its try, as the CLI's `retry --budget` does, continuing its session or in a new
 * one, or with its loop's round, as the CLI's `round --budget` does. The box takes any amount: the package refuses one not above what was
 * spent, and its sentence shows beside the box, verbatim, the amount still in it. Once the api has the ask, what the tick does with it,
 * until the run is read again and the step's note says it.
 *
 * A try carries what an answer row's would, beside the raise. For a step that signed off blocked, its question and a box for the answer,
 * which the button waits for — the CLI's `retry --budget <amount> --message "<answer>"`, as the CLI's `decide` offers it: once a try is
 * asked, a second ask carrying the answer is refused as already asked. Where its closeout asks questions as data (`questions`), the fields
 * that answer them by choosing instead, with the recommended answers and a note beside them, the button waiting until each has a choice or
 * words: the answers go with the budget (`raiseBody`), which the api checks against what the step asks now. For any other, a box for
 * anything to tell it. And where a check did
 * not pass, its check again (`recheck`), which costs nothing and needs no raise — chosen first where it did not finish — with the amount
 * and the box closed: it files no session, so it takes no budget and carries no message, which `messageRefusal` refuses on one.
 *
 * The amount goes as typed: one the package refuses is refused in its words, and an empty box sends none, which it refuses too. An answer
 * goes as it was typed, as `--message` takes it; something to tell a try is optional, and none is sent when nothing was written.
 */
export function RaiseRow({ runId, offer }: { runId: string; offer: Extract<Answer, { kind: 'raise' }> }) {
  const [amount, setAmount] = useState(() => String(raiseTo(offer.above)));
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState<Draft>({});
  const [mode, setMode] = useState<RetryMode>(offer.unfinished && offer.modes.includes('recheck') ? 'recheck' : 'nudge');
  const field = useId();
  const tried = useAsk(runId, offer.step, () => setMessage(''));
  const rounded = useRound(runId);
  const ask = offer.by === 'retry' ? tried : rounded;
  const asks = offer.by === 'retry' && offer.own === 'blocked';
  const rechecking = offer.by === 'retry' && mode === 'recheck';
  const left = asks ? unanswered(offer.questions, draft) : [];

  const taken = tried.isSuccess
    ? askedSaid(tried.data)
    : rounded.isSuccess
      ? `round ${rounded.data.round} asked — the next tick files it`
      : null;
  if (taken) return <RaiseAsked step={offer.step} said={taken} />;

  return (
    <li data-offer="raise" data-step={offer.step} data-by={offer.by} className="space-y-2 rounded border border-yours bg-card p-3 text-sm">
      <RaiseHead offer={offer} asks={asks} />
      <form
        aria-label={`Raise ${offer.step}'s budget`}
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (offer.by === 'round') {
            rounded.mutate({ step: offer.step, ...(amount.trim() === '' ? {} : { budget: Number(amount) }) });
          } else if (rechecking) {
            tried.mutate({ mode: 'recheck' });
          } else {
            tried.mutate(raiseBody({ mode, amount, message, asks, questions: offer.questions, draft }));
          }
        }}
      >
        {offer.by === 'retry' && (
          <RaiseWords
            step={offer.step}
            field={field}
            asks={asks}
            rechecking={rechecking}
            questions={offer.questions}
            message={message}
            onMessage={setMessage}
            draft={draft}
            onDraft={setDraft}
          />
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <AmountBox step={offer.step} field={field} amount={amount} onAmount={setAmount} disabled={rechecking} />
          <button
            type="submit"
            disabled={ask.isPending || left.length > 0 || (asks && !offer.questions.length && !message.trim())}
            title={left.length > 0 ? `Not answered: ${left.join(' · ')}` : undefined}
            className={BUTTON}
          >
            {ask.isPending ? 'Asking…' : raiseWord(offer.by, rechecking, asks)}
          </button>
          {offer.by === 'retry' && <RaiseModes step={offer.step} name={`${field}-mode`} modes={offer.modes} mode={mode} onMode={setMode} />}
        </div>
      </form>
      {ask.isError && <Refusal error={ask.error} />}
    </li>
  );
}

/** A raise's word, with the amounts; for a step that signed off blocked, what it asks; and what the button below raises. */
function RaiseHead({ offer, asks }: { offer: Extract<Answer, { kind: 'raise' }>; asks: boolean }) {
  return (
    <>
      <p className="break-words">
        <strong>{offer.step}</strong> <span className="font-mono text-xs">{offer.status}</span>
      </p>
      {asks &&
        (offer.needs ? (
          <Asks data-asks needs={offer.needs} />
        ) : (
          <p data-asks className="break-words">
            signed off blocked, and said nothing of what it needs
          </p>
        ))}
      <p className="text-xs break-words text-muted-foreground">
        The run spends nothing more on it until its cap is raised above <span className="font-mono">{offer.said}</span>
        {offer.by === 'round' ? ", with its loop's next round" : ''}: the button below raises it.
        {offer.modes.includes('recheck') && ' Its check again costs nothing, and needs no raise.'}
      </p>
    </>
  );
}

/** The box for the cap to raise a step to, in dollars: closed while its check again is chosen, which takes no budget. */
function AmountBox({
  step,
  field,
  amount,
  onAmount,
  disabled,
}: {
  step: string;
  field: string;
  amount: string;
  onAmount: (next: string) => void;
  disabled: boolean;
}) {
  return (
    <label htmlFor={field} className="flex items-center gap-1 text-xs">
      <span className="sr-only">{`The cap to raise ${step} to, in dollars`}</span>
      <span aria-hidden className="font-mono">
        $
      </span>
      <input
        id={field}
        type="number"
        step="any"
        inputMode="decimal"
        value={amount}
        disabled={disabled}
        onChange={(event) => onAmount(event.target.value)}
        className={cn(AMOUNT, 'disabled:cursor-not-allowed disabled:opacity-50')}
      />
    </label>
  );
}

/** How a raise's try is filed: each mode the package takes for it, with its flag. */
function RaiseModes({
  step,
  name,
  modes,
  mode,
  onMode,
}: {
  step: string;
  name: string;
  modes: readonly RetryMode[];
  mode: RetryMode;
  onMode: (next: RetryMode) => void;
}) {
  return (
    <fieldset className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      <legend className="sr-only">How to try {step} again</legend>
      {modes.map((m) => (
        <label key={m} className="flex cursor-pointer items-center gap-1.5">
          <input type="radio" name={name} value={m} checked={mode === m} onChange={() => onMode(m)} />
          {MODES[m]} <code className="text-muted-foreground">--{m}</code>
        </label>
      ))}
    </fieldset>
  );
}

/** A raise once the api has its ask, as the row says it until the run is read again: the try or the round asked. */
function RaiseAsked({ step, said }: { step: string; said: string }) {
  return (
    <li data-offer="asked" data-step={step} className="rounded border border-outline-variant px-3 py-2 text-sm">
      <strong>{step}</strong>{' '}
      <span data-note className="font-mono text-xs text-muted-foreground">
        {said}
      </span>
    </li>
  );
}

/** What a raise's button asks for: a round, its check again, an answer, or a try. */
const raiseWord = (by: 'retry' | 'round', rechecking: boolean, asks: boolean): string =>
  by === 'round'
    ? 'Raise the budget and go round again'
    : rechecking
      ? 'Run its check again'
      : asks
        ? 'Raise the budget and answer'
        : 'Raise the budget and try again';

/**
 * What a raise's try carries beside the raise: for a step that signed off blocked asking questions as data, the fields to answer them by
 * choosing, the recommended answers, and a note beside them; for one that asked in words, a box for the answer; for any other, a box for
 * anything to tell it, closed while its check again is chosen.
 */
function RaiseWords({
  step,
  field,
  asks,
  rechecking,
  questions,
  message,
  onMessage,
  draft,
  onDraft,
}: {
  step: string;
  field: string;
  asks: boolean;
  rechecking: boolean;
  questions: readonly Question[];
  message: string;
  onMessage: (next: string) => void;
  draft: Draft;
  onDraft: (next: Draft) => void;
}) {
  const choosing = asks && questions.length > 0;
  return (
    <>
      {choosing && <QuestionFields questions={questions} draft={draft} onDraft={onDraft} />}
      {choosing && <RecommendButton questions={questions} draft={draft} onDraft={onDraft} />}
      <label htmlFor={`${field}-message`} className="sr-only">
        {choosing ? `A note to ${step} beside the answers` : asks ? `Your answer to ${step}` : `What to tell ${step}, if anything`}
      </label>
      <textarea
        id={`${field}-message`}
        value={message}
        onChange={(event) => onMessage(event.target.value)}
        rows={asks && !choosing ? 3 : 2}
        disabled={rechecking}
        placeholder={
          rechecking
            ? 'A recheck runs the check again and files no session: there is nobody to tell.'
            : choosing
              ? 'A note beside the answers (optional): the next try is told it.'
              : asks
                ? 'Your answer: the next try is told it, under “Your answer”.'
                : 'Anything to tell it (optional): the next try is told it.'
        }
        className={cn(TEXTAREA, 'disabled:cursor-not-allowed disabled:opacity-50')}
      />
    </>
  );
}

/**
 * What a raise's try sends, beside its mode: the amount, where one was typed; for a step that signed off blocked asking questions as
 * data, the answers to them in the order asked, the message their note and left out when empty; for one that asked in words, the message
 * as typed, its answer; for any other, the message where something was written.
 */
export const raiseBody = ({
  mode,
  amount,
  message,
  asks,
  questions,
  draft,
}: {
  mode: RetryMode;
  amount: string;
  message: string;
  asks: boolean;
  questions: readonly Question[];
  draft: Draft;
}): { mode: RetryMode; budget?: number; message?: string; answers?: QuestionAnswer[] } => {
  const budget = amount.trim() === '' ? {} : { budget: Number(amount) };
  if (asks && questions.length) {
    return { mode, ...budget, answers: answersFrom(questions, draft), ...(message.trim() ? { message } : {}) };
  }
  return { mode, ...budget, ...(asks || message.trim() ? { message } : {}) };
};
