/**
 * A closeout's questions, as data (`StepCloseout.questions`, decoded by agent-orchestrator's question/question.ts): read under a step's
 * output (`Questions`), and answered by choosing under a step that signed off blocked asking them (`QuestionsForm`), which sends the
 * answers to the api, where they are checked and written as the next try's message.
 */
import { useId, useState } from 'react';
import type { Question, QuestionAnswer, RetryMode } from '../lib/api';
import { askedSaid, type Answer } from '../lib/asks';
import { cn } from '../lib/utils';
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
      <strong className="font-medium">{label}</strong> <span className="text-neutral-600 dark:text-neutral-400">— {meaning}</span>
      {q.recommended === label && (
        <span
          data-recommended
          className="ml-1.5 rounded bg-emerald-100 px-1 py-px text-[11px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
        >
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
      <h4 className="font-mono text-xs text-neutral-500">{field}</h4>
      <ol className="space-y-3 text-sm">
        {questions.map((q, i) => (
          <li key={q.title} data-question={q.title} className="space-y-1">
            <p className="font-medium">
              {i + 1}. {q.title}
              {q.multiple && <span className="font-normal text-neutral-500"> (any of them)</span>}
            </p>
            <Markdown className="text-neutral-700 dark:text-neutral-300">{q.body}</Markdown>
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
function QuestionField({ q, n, draft, onDraft }: { q: Question; n: number; draft: Draft; onDraft: (next: Draft) => void }) {
  const id = useId();
  const { chose, own } = said(draft, q);
  return (
    <fieldset data-question={q.title} className="space-y-1.5 rounded border border-neutral-200 p-2 dark:border-neutral-800">
      <legend className="px-1 font-medium">
        {n}. {q.title}
        {q.multiple && <span className="font-normal text-neutral-500"> (choose any)</span>}
      </legend>
      <Markdown className="text-neutral-700 dark:text-neutral-300">{q.body}</Markdown>
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

/** A step whose try a person just asked for, as its row says it until the run is read again: `wf ls`'s note. */
function AskedRow({ step, said }: { step: string; said: string }) {
  return (
    <li data-offer="asked" data-step={step} className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800">
      <strong>{step}</strong>{' '}
      <span data-note className="font-mono text-xs text-neutral-600 dark:text-neutral-400">
        {said}
      </span>
    </li>
  );
}

/** How the answers reach the step: its session continued, or a new one — a recheck files no session to read them. */
function ModeChoice({ name, step, mode, onMode }: { name: string; step: string; mode: RetryMode; onMode: (m: RetryMode) => void }) {
  return (
    <fieldset className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      <legend className="sr-only">How to try {step} again</legend>
      {(['nudge', 'fresh'] as const).map((m) => (
        <label key={m} className="flex cursor-pointer items-center gap-1.5">
          <input type="radio" name={name} value={m} checked={mode === m} onChange={() => onMode(m)} />
          {MODES[m]} <code className="text-neutral-500">--{m}</code>
        </label>
      ))}
    </fieldset>
  );
}

/**
 * A step's questions, answered by choosing: nothing is chosen until the person chooses, or presses `Choose the recommended answers`,
 * which chooses each recommended option and leaves every other question as it was. `Answer and continue` waits until every question has a
 * choice or words, then asks for the try with the answers, a note beside them if one was written, as `wf retry --message` would carry
 * them — the api checks them against what the step asks now, and its refusal is shown verbatim.
 */
export function QuestionsForm({ runId, offer }: { runId: string; offer: Extract<Answer, { kind: 'answer' }> }) {
  const [draft, setDraft] = useState<Draft>({});
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<RetryMode>('nudge');
  const field = useId();
  const ask = useAsk(runId, offer.step, () => setNote(''));
  if (ask.isSuccess) return <AskedRow step={offer.step} said={askedSaid(ask.data)} />;
  const left = unanswered(offer.questions, draft);
  return (
    <li
      data-offer="answer"
      data-questions
      data-step={offer.step}
      className="space-y-2 rounded border border-amber-300 bg-amber-50/60 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30"
    >
      <p data-said>
        <strong>{offer.step}</strong> asks {offer.questions.length === 1 ? 'a question' : `${offer.questions.length} questions`}
        {offer.needs && <span className="text-neutral-600 dark:text-neutral-400">: {offer.needs}</span>}
      </p>
      <form
        aria-label={`Answer ${offer.step}`}
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          ask.mutate({ mode, answers: answersFrom(offer.questions, draft), ...(note.trim() ? { message: note } : {}) });
        }}
      >
        {offer.questions.map((q, i) => (
          <QuestionField key={q.title} q={q} n={i + 1} draft={draft} onDraft={setDraft} />
        ))}
        <label htmlFor={`${field}-note`} className="sr-only">
          A note to {offer.step} beside the answers
        </label>
        <textarea
          id={`${field}-note`}
          data-note-box
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="A note beside the answers (optional): the next try is told it."
          className={TEXTAREA}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="submit"
            disabled={ask.isPending || left.length > 0}
            title={left.length > 0 ? `Not answered: ${left.join(' · ')}` : undefined}
            className={BUTTON}
          >
            {ask.isPending ? 'Asking…' : 'Answer and continue'}
          </button>
          {offer.questions.some((q) => q.recommended !== null) && (
            <button
              type="button"
              data-recommend-all
              onClick={() => setDraft(recommendedDraft(offer.questions, draft))}
              className={cn(
                BUTTON,
                'bg-white text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100 dark:bg-neutral-900 dark:text-neutral-100 dark:ring-neutral-700 dark:hover:bg-neutral-800',
              )}
            >
              Choose the recommended answers
            </button>
          )}
          <ModeChoice name={`${field}-mode`} step={offer.step} mode={mode} onMode={setMode} />
        </div>
      </form>
      {ask.isError && <Refusal error={ask.error} />}
    </li>
  );
}
