/**
 * A closeout's questions, as data (`StepCloseout.questions`, decoded by agent-orchestrator's question/question.ts), drawn by one part, a
 * series of questions (`QuestionSeries`): each question a section of its own, each option a tile with its label for title and what it
 * means under it, the agent's recommendation tagged, a question that takes one answer drawn with radio tiles and one that takes several
 * with check tiles. Answered, it adds the two ways out the board supplies on every question, as the Agent SDK's question tool supplies
 * "Other" itself: "Something else", which needs the person's words, and "None of these", which stands without them. A box for words
 * opens only under a way out taken, or once asked for beside a choice. Read-only, it draws the same sections, no control in them.
 *
 * It answers under a step that signed off blocked asking them (`QuestionsForm`), at the gate of a step that asks them (`Gate`), and on
 * the row that raises a blocked step's budget (`RaiseRow`); each sends the answers to the api, where they are checked against what the
 * step asks now and written in the package's words.
 */
import { useEffect, useId, useRef, useState } from 'react';
import type { Question } from '../../lib/api/tries.ts';
import type { RetryMode } from '../../lib/api/asks.ts';
import { askedSaid, type Answer } from '../../lib/asks';
import { OFFERS, SERIES } from '../../lib/words';
import {
  answersFrom,
  chosenDraft,
  entryOf,
  recommendedDraft,
  recommendedOf,
  unanswered,
  wayDraft,
  wordsDraft,
  type Draft,
  type WayOut,
} from '../../lib/question-draft/questionDraft.ts';
import { MODES, Refusal, useAsk } from './Ask';
import { Markdown } from '../markdown/Markdown';
import type { Frozen } from '../../lib/frozen';
import { Body, Button, Radio, RadioGroup, Tag, TextField, Title } from '@/components/ui/ds';
import { CheckTile, CheckTileGroup, CutTag, Pending, RadioTile, RadioTileGroup } from '@/components/look';

/** The value a way out's tile holds in its question's group; an option's is `option:<its place>`, so no label an agent wrote meets it. */
const WAY_VALUE: Record<WayOut, string> = { else: 'way:else', none: 'way:none' };

/** The value of the option at `i` in its question's group. */
const optionValue = (i: number) => `option:${i}`;

/** What a press on the tile of `value` names in `q`: a way out, or an option's label. */
const pressedOf = (q: Frozen<Question>, value: string) =>
  (value === WAY_VALUE.else
    ? { way: 'else' }
    : value === WAY_VALUE.none
      ? { way: 'none' }
      : { label: q.options[Number(value.slice('option:'.length))]?.label ?? '' }) satisfies { way: WayOut } | { label: string } as
    | { way: WayOut }
    | { label: string };

/** An option's title: its label, tagged where the agent recommends it. */
function OptionTitle({ label, recommended }: { label: string; recommended: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span>{label}</span>
      {recommended && (
        <CutTag>
          <Tag data-recommended variant="tonal" color="secondary" className="uppercase">
            {SERIES.recommended}
          </Tag>
        </CutTag>
      )}
    </span>
  );
}

/** A question's head: its number as an eyebrow, its title, its body, and whether it takes one answer or several. */
function QuestionHead({ q, n }: { q: Frozen<Question>; n: number }) {
  return (
    <>
      <span className="block text-label-small text-on-surface-variant uppercase">{SERIES.eyebrow(n)}</span>
      <Title size="medium" component="span" className="block text-on-surface">
        {q.title}
      </Title>
      <Markdown className="text-on-surface">{q.body}</Markdown>
      <Body component="p" data-takes={q.multiple ? 'any' : 'one'} className="text-on-surface-variant">
        {q.multiple ? SERIES.takesAny : SERIES.takesOne}
      </Body>
    </>
  );
}

/** One question read-only: its head, and each option as a tile with no control in it, the recommended ones tagged. */
function QuestionRead({ q, n }: { q: Frozen<Question>; n: number }) {
  return (
    <li data-question={q.title} className="space-y-2">
      <QuestionHead q={q} n={n} />
      <ul className="flex flex-col gap-2">
        {q.options.map((o) => (
          <li key={o.label} data-option={o.label} className="rounded-shape-medium border border-outline-variant px-4 py-2">
            <Title size="small" component="span" className="block text-on-surface">
              <OptionTitle label={o.label} recommended={recommendedOf(q).includes(o.label)} />
            </Title>
            <Body component="span" className="text-on-surface-variant">
              {o.meaning}
            </Body>
          </li>
        ))}
      </ul>
    </li>
  );
}

/** The tiles of one question: its options, then the two ways out, as radio tiles where it takes one and check tiles where it takes any. */
function QuestionTiles({ q, draft, onDraft }: { q: Frozen<Question>; draft: Draft; onDraft: (next: Draft) => void }) {
  const { chose, way } = entryOf(draft, q.title);
  const recommended = recommendedOf(q);
  const options = q.options.map((o, i) => ({
    value: optionValue(i),
    label: o.label,
    title: <OptionTitle label={o.label} recommended={recommended.includes(o.label)} />,
    description: o.meaning,
    marks: { 'data-option': o.label },
  }));
  const ways = (['else', 'none'] as const).map((w) => ({
    value: WAY_VALUE[w],
    title: SERIES.ways[w].title,
    description: SERIES.ways[w].line,
    marks: { 'data-way': w },
  }));
  if (!q.multiple) {
    return (
      <RadioTileGroup
        aria-label={q.title}
        layout="column"
        value={way ? WAY_VALUE[way] : (options.find((o) => o.label === chose[0])?.value ?? null)}
        onChange={(value) => {
          const pressed = pressedOf(q, value);
          onDraft('way' in pressed ? wayDraft(draft, q, pressed.way, true) : chosenDraft(draft, q, pressed.label, true));
        }}
      >
        {[...options, ...ways].map((t) => (
          <RadioTile key={t.value} value={t.value} title={t.title} description={t.description} {...t.marks} />
        ))}
      </RadioTileGroup>
    );
  }
  const value = [...options.filter((o) => chose.includes(o.label)).map((o) => o.value), ...(way ? [WAY_VALUE[way]] : [])];
  return (
    <CheckTileGroup
      aria-label={q.title}
      layout="column"
      value={value}
      onChange={(next) => {
        const added = next.find((v) => !value.includes(v));
        const changed = added ?? value.find((v) => !next.includes(v));
        if (changed === undefined) return;
        const pressed = pressedOf(q, changed);
        const on = added !== undefined;
        onDraft('way' in pressed ? wayDraft(draft, q, pressed.way, on) : chosenDraft(draft, q, pressed.label, on));
      }}
    >
      {[...options, ...ways].map((t) => (
        <CheckTile key={t.value} value={t.value} title={t.title} description={t.description} {...t.marks} />
      ))}
    </CheckTileGroup>
  );
}

/**
 * The person's words on one question: a box under a way out taken, or beside a choice once asked for by `Add your words`; else only the
 * offer to add them.
 */
function QuestionWords({ q, draft, onDraft }: { q: Frozen<Question>; draft: Draft; onDraft: (next: Draft) => void }) {
  const { own, way } = entryOf(draft, q.title);
  const [asked, setAsked] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (asked) box.current?.querySelector('textarea')?.focus();
  }, [asked]);
  if (!way && !asked && own === '') {
    return (
      <Button variant="text" data-add-words onPress={() => setAsked(true)}>
        {SERIES.addWords}
      </Button>
    );
  }
  const hint = way ? SERIES.ways[way].words : SERIES.beside;
  return (
    <div ref={box}>
      <TextField
        aria-label={SERIES.words(q.title)}
        data-own
        multiline
        value={own}
        onChange={(words) => onDraft(wordsDraft(draft, q, words))}
        placeholder={hint}
        supportingText={hint}
      />
    </div>
  );
}

/** One question to answer: its head, its tiles and its ways out, and the person's words where they give some. */
function QuestionAnswer({ q, n, draft, onDraft }: { q: Frozen<Question>; n: number; draft: Draft; onDraft: (next: Draft) => void }) {
  return (
    <fieldset data-question={q.title} className="min-w-0 space-y-3 rounded-shape-medium border border-outline-variant p-3">
      <legend className="sr-only">{`${SERIES.eyebrow(n)}: ${q.title}`}</legend>
      <QuestionHead q={q} n={n} />
      <QuestionTiles q={q} draft={draft} onDraft={onDraft} />
      <QuestionWords q={q} draft={draft} onDraft={onDraft} />
    </fieldset>
  );
}

/**
 * A series of questions, in the order asked, numbered from one: answered where `onDraft` is given, each question with its ways out;
 * read-only where it is not, under the field's name, with no control in it.
 */
export function QuestionSeries({
  questions,
  draft = {},
  onDraft,
  field,
}: {
  questions: readonly Frozen<Question>[];
  draft?: Draft;
  onDraft?: (next: Draft) => void;
  field?: string;
}) {
  if (!onDraft) {
    return (
      <section data-questions={field} aria-label={field} className="min-w-0 space-y-2">
        {field && <h4 className="font-mono text-body-small text-on-surface-variant">{field}</h4>}
        <ol className="space-y-4 text-body-medium">
          {questions.map((q, i) => (
            <QuestionRead key={q.title} q={q} n={i + 1} />
          ))}
        </ol>
      </section>
    );
  }
  return questions.map((q, i) => <QuestionAnswer key={q.title} q={q} n={i + 1} draft={draft} onDraft={onDraft} />);
}

/** The questions of one field of a closeout, read-only: the series, under the field's name. */
export function Questions({ field, questions }: { field: string; questions: readonly Frozen<Question>[] }) {
  return <QuestionSeries field={field} questions={questions} />;
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

/**
 * `Choose the recommended answers`, beside the fields: it chooses each recommended option and leaves every other question as it was.
 * Nothing where no question recommends one.
 */
export function RecommendButton({
  questions,
  draft,
  onDraft,
}: {
  questions: readonly Frozen<Question>[];
  draft: Draft;
  onDraft: (next: Draft) => void;
}) {
  if (!questions.some((q) => recommendedOf(q).length)) return null;
  return (
    <Button variant="outlined" data-recommend-all onPress={() => onDraft(recommendedDraft(questions, draft))}>
      Choose the recommended answers
    </Button>
  );
}

/** A step whose try a person just asked for, as its row says it until the run is read again: the CLI `ls`'s note. */
export function AskedRow({ step, said }: { step: string; said: string }) {
  return (
    <li data-asked data-step={step} className="rounded border border-outline-variant px-3 py-2 text-body-medium">
      <strong>{step}</strong>{' '}
      <span data-note className="font-mono text-body-small text-on-surface-variant">
        {said}
      </span>
    </li>
  );
}

/** How the answers reach the step: its session continued, or a new one — a recheck files no session to read them. */
function ModeChoice({ name, step, mode, onMode }: { name: string; step: string; mode: RetryMode; onMode: (m: RetryMode) => void }) {
  return (
    <RadioGroup
      aria-label={`How to try ${step} again`}
      name={name}
      orientation="horizontal"
      value={mode}
      onChange={(m) => onMode(m as RetryMode)}
      className="gap-x-3 gap-y-1 text-body-small"
    >
      {(['continue', 'fresh'] as const).map((m) => (
        <Radio key={m} value={m}>
          {MODES[m]} <code className="text-on-surface-variant">--{m}</code>
        </Radio>
      ))}
    </RadioGroup>
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
  const [mode, setMode] = useState<RetryMode>('continue');
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
      className="space-y-2 rounded border border-yours bg-surface-container-low p-3 text-body-medium"
    >
      <p data-said>
        <strong>{offer.step}</strong> asks {offer.questions.length === 1 ? 'a question' : `${offer.questions.length} questions`}
        {offer.needs && <span className="text-on-surface-variant">: {offer.needs}</span>}
      </p>
      <form
        aria-label={OFFERS.answer.form(offer.step)}
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          ask.mutate({ mode, answers: answersFrom(offer.questions, draft), ...(note.trim() ? { message: note } : {}) });
        }}
      >
        <QuestionSeries questions={offer.questions} draft={draft} onDraft={setDraft} />
        <TextField
          aria-label={`A note to ${offer.step} beside the answers`}
          data-note-box
          multiline
          value={note}
          onChange={setNote}
          placeholder={OFFERS.answer.note}
          supportingText={OFFERS.answer.note}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span title={left.length > 0 ? `Not answered: ${left.join(' · ')}` : undefined} className="inline-flex">
            <Button icon={ask.isPending ? Pending : undefined} type="submit" isDisabled={ask.isPending || left.length > 0}>
              {ask.isPending ? 'Asking…' : OFFERS.answer.button}
            </Button>
          </span>
          <RecommendButton questions={offer.questions} draft={draft} onDraft={setDraft} />
          <ModeChoice name={`${field}-mode`} step={offer.step} mode={mode} onMode={setMode} />
        </div>
      </form>
      {ask.isError && <Refusal error={ask.error} />}
    </li>
  );
}
