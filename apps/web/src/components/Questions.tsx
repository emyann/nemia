/**
 * A closeout's questions, as data (`StepCloseout.questions`, decoded by agent-orchestrator's question/question.ts): read under a step's
 * output (`Questions`), and answered by choosing (`QuestionFields`) — under a step that signed off blocked asking them (`QuestionsForm`),
 * at the gate of a step that asks them (`Gate`), and on the row that raises a blocked step's budget (`RaiseRow`). Each sends the answers
 * to the api, where they are checked against what the step asks now and written in the package's words.
 */
import { useId, useState } from 'react';
import type { Question, QuestionAnswer, RetryMode } from '../lib/api';
import { askedSaid, type Answer } from '../lib/asks';
import { cn } from '../lib/utils';
import { OFFERS } from '../lib/words';
import { BUTTON, MODES, Refusal, TEXTAREA, useAsk } from './Ask';
import { Markdown } from './Markdown';

/** What a person has said so far of each question, by its title: the labels chosen, and words of their own. */
export type Draft = Readonly<Record<string, { chose: readonly string[]; own: string }>>;

const said = (draft: Draft, q: Question) => draft[q.title] ?? { chose: [], own: '' };

/** `draft` with every question that has a recommendation set to it, and their words kept; a question without one is left as it was. */
export const recommendedDraft = (questions: readonly Question[], draft: Draft): Draft =>
  Object.fromEntries([
    ...Object.entries(draft),
    ...questions.flatMap((q) => (q.recommended === null ? [] : [[q.title, { ...said(draft, q), chose: [q.recommended] }]])),
  ]);

/**
 * `draft` with `label` chosen, or no longer chosen, on `q`: the one choice of a question that takes one, among others of one that takes
 * several.
 */
export const chosenDraft = (draft: Draft, q: Question, label: string, on: boolean): Draft => {
  const before = said(draft, q).chose.filter((l) => q.multiple && l !== label);
  return { ...draft, [q.title]: { ...said(draft, q), chose: on ? [...before, label] : before } };
};

/** The titles of the questions `draft` leaves with neither a choice nor words, in the order asked. */
export const unanswered = (questions: readonly Question[], draft: Draft): string[] =>
  questions.filter((q) => said(draft, q).chose.length === 0 && !said(draft, q).own.trim()).map((q) => q.title);

/** `draft` as the api takes it: an answer to each question, in the order asked, its own words only where there are any. */
export const answersFrom = (questions: readonly Question[], draft: Draft): QuestionAnswer[] =>
  questions.map((q) => {
    const { chose, own } = said(draft, q);
    return own.trim() ? { question: q.title, chose, own: own.trim() } : { question: q.title, chose };
  });

/** One option as a question shows it: its label, what choosing it means, and whether it is the one recommended. */
function OptionText({ q, label, meaning }: { q: Question; label: string; meaning: string }) {
  return (
    <span className="min-w-0">
      <strong className="font-medium">{label}</strong> <span className="text-muted-foreground">— {meaning}</span>
      {q.recommended === label && (
        <span data-recommended className="ml-1.5 rounded bg-surface-variant px-1 py-px text-body-small font-medium text-on-surface-variant">
          recommended
        </span>
      )}
    </span>
  );
}

/** The questions of one field of a closeout, read-only: each question, its body, and its options, the one recommended marked. */
export function Questions({ field, questions }: { field: string; questions: readonly Question[] }) {
  return (
    <section data-questions={field} aria-label={field} className="min-w-0 space-y-2">
      <h4 className="font-mono text-body-small text-muted-foreground">{field}</h4>
      <ol className="space-y-3 text-body-medium">
        {questions.map((q, i) => (
          <li key={q.title} data-question={q.title} className="space-y-1">
            <p className="font-medium">
              {i + 1}. {q.title}
              {q.multiple && <span className="font-normal text-muted-foreground"> (any of them)</span>}
            </p>
            <Markdown className="text-foreground">{q.body}</Markdown>
            <ul className="list-disc space-y-0.5 pl-5">
              {q.options.map((o) => (
                <li key={o.label} data-option={o.label}>
                  <OptionText q={q} label={o.label} meaning={o.meaning} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** One question to answer: its options as radios, or checkboxes where it takes several, and a line for words of the person's own. */
export function QuestionField({ q, n, draft, onDraft }: { q: Question; n: number; draft: Draft; onDraft: (next: Draft) => void }) {
  const id = useId();
  const { chose, own } = said(draft, q);
  return (
    <fieldset data-question={q.title} className="space-y-1.5 rounded border border-outline-variant p-2">
      <legend className="px-1 font-medium">
        {n}. {q.title}
        {q.multiple && <span className="font-normal text-muted-foreground"> (choose any)</span>}
      </legend>
      <Markdown className="text-foreground">{q.body}</Markdown>
      {q.options.map((o) => (
        <label key={o.label} data-option={o.label} className="flex cursor-pointer items-start gap-2">
          <input
            type={q.multiple ? 'checkbox' : 'radio'}
            name={`${id}-choice`}
            value={o.label}
            checked={chose.includes(o.label)}
            onChange={(event) => onDraft(chosenDraft(draft, q, o.label, event.target.checked))}
            className="mt-1"
          />
          <OptionText q={q} label={o.label} meaning={o.meaning} />
        </label>
      ))}
      <label htmlFor={`${id}-own`} className="sr-only">
        Your own words on {q.title}
      </label>
      <textarea
        id={`${id}-own`}
        data-own
        rows={1}
        value={own}
        onChange={(event) => onDraft({ ...draft, [q.title]: { chose, own: event.target.value } })}
        placeholder="In your own words — beside a choice, or instead of one"
        className={TEXTAREA}
      />
    </fieldset>
  );
}

/**
 * A question a step asks, as its agent wrote it, in a box that scrolls once it is long: under `asks:`, which the CLI's `decide` puts before
 * it.
 */
export function Asks({ step, needs, ...data }: { step?: string; needs: string; 'data-asks'?: boolean; 'data-said'?: boolean }) {
  return (
    <div {...data} className="space-y-1">
      <p>
        {step && <strong>{step}</strong>}
        {step && ' '}asks:
      </p>{' '}
      <Markdown className="max-h-72 overflow-y-auto pr-1">{needs}</Markdown>
    </div>
  );
}

/** Each question to answer, in the order asked, numbered from one: the fields every form that answers a step's questions draws. */
export function QuestionFields({
  questions,
  draft,
  onDraft,
}: {
  questions: readonly Question[];
  draft: Draft;
  onDraft: (next: Draft) => void;
}) {
  return questions.map((q, i) => <QuestionField key={q.title} q={q} n={i + 1} draft={draft} onDraft={onDraft} />);
}

/**
 * `Choose the recommended answers`, beside the fields: it chooses each recommended option and leaves every other question as it was.
 * Nothing where no question recommends one.
 */
export function RecommendButton({
  questions,
  draft,
  onDraft,
}: {
  questions: readonly Question[];
  draft: Draft;
  onDraft: (next: Draft) => void;
}) {
  if (!questions.some((q) => q.recommended !== null)) return null;
  return (
    <button
      type="button"
      data-recommend-all
      onClick={() => onDraft(recommendedDraft(questions, draft))}
      className={cn(BUTTON, 'bg-card text-foreground ring-1 ring-outline hover:bg-accent')}
    >
      Choose the recommended answers
    </button>
  );
}

/** A step whose try a person just asked for, as its row says it until the run is read again: the CLI `ls`'s note. */
function AskedRow({ step, said }: { step: string; said: string }) {
  return (
    <li data-asked data-step={step} className="rounded border border-outline-variant px-3 py-2 text-body-medium">
      <strong>{step}</strong>{' '}
      <span data-note className="font-mono text-body-small text-muted-foreground">
        {said}
      </span>
    </li>
  );
}

/** How the answers reach the step: its session continued, or a new one — a recheck files no session to read them. */
function ModeChoice({ name, step, mode, onMode }: { name: string; step: string; mode: RetryMode; onMode: (m: RetryMode) => void }) {
  return (
    <fieldset className="flex flex-wrap gap-x-3 gap-y-1 text-body-small">
      <legend className="sr-only">How to try {step} again</legend>
      {(['nudge', 'fresh'] as const).map((m) => (
        <label key={m} className="flex cursor-pointer items-center gap-1.5">
          <input type="radio" name={name} value={m} checked={mode === m} onChange={() => onMode(m)} />
          {MODES[m]} <code className="text-muted-foreground">--{m}</code>
        </label>
      ))}
    </fieldset>
  );
}

/**
 * A step's questions, answered by choosing: nothing is chosen until the person chooses, or presses `Choose the recommended answers`, which
 * chooses each recommended option and leaves every other question as it was. `Answer and continue` waits until every question has a choice
 * or words, then asks for the try with the answers, a note beside them if one was written, as the CLI's `retry --message` would carry them
 * — the api checks them against what the step asks now, and its refusal is shown verbatim.
 */
export function QuestionsForm({ runId, offer }: { runId: string; offer: Extract<Answer, { case: 'answer' }> }) {
  const [draft, setDraft] = useState<Draft>({});
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<RetryMode>('nudge');
  const field = useId();
  const ask = useAsk(runId, offer.step, () => setNote(''));
  if (ask.isSuccess) return <AskedRow step={offer.step} said={askedSaid(ask.data)} />;
  const left = unanswered(offer.questions, draft);
  return (
    <li
      data-offer={offer.case}
      data-kind={offer.kind}
      data-questions
      data-step={offer.step}
      className="space-y-2 rounded border border-yours bg-card p-3 text-body-medium"
    >
      <p data-said>
        <strong>{offer.step}</strong> asks {offer.questions.length === 1 ? 'a question' : `${offer.questions.length} questions`}
        {offer.needs && <span className="text-muted-foreground">: {offer.needs}</span>}
      </p>
      <form
        aria-label={OFFERS.answer.form(offer.step)}
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          ask.mutate({ mode, answers: answersFrom(offer.questions, draft), ...(note.trim() ? { message: note } : {}) });
        }}
      >
        <QuestionFields questions={offer.questions} draft={draft} onDraft={setDraft} />
        <label htmlFor={`${field}-note`} className="sr-only">
          A note to {offer.step} beside the answers
        </label>
        <textarea
          id={`${field}-note`}
          data-note-box
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={OFFERS.answer.note}
          className={TEXTAREA}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="submit"
            disabled={ask.isPending || left.length > 0}
            title={left.length > 0 ? `Not answered: ${left.join(' · ')}` : undefined}
            className={BUTTON}
          >
            {ask.isPending ? 'Asking…' : OFFERS.answer.button}
          </button>
          <RecommendButton questions={offer.questions} draft={draft} onDraft={setDraft} />
          <ModeChoice name={`${field}-mode`} step={offer.step} mode={mode} onMode={setMode} />
        </div>
      </form>
      {ask.isError && <Refusal error={ask.error} />}
    </li>
  );
}
