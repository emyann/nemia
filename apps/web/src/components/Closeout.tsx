import { useId, useState, type ReactNode } from 'react';
import { Switch } from '@/components/ui/switch';
import type { StepAttempts, StepCloseout, StepTry } from '../lib/api';
import { duration } from '../lib/canvas';
import { foldsAtGate, imagePaths, type Outcome, outcomeOf, outcomeWord } from '../lib/outcome';
import { bodyLeadsWith, summaryShown } from '../lib/transcript';
import { cn } from '../lib/utils';
import { Artifacts, Values } from './Artifacts';
import { Markdown } from './Markdown';
import { FieldView, Json, OutcomeHead } from './Outcome';
import { Questions } from './Questions';

export { Artifacts, bytesWord } from './Artifacts';

/**
 * A try as the Rounds rows and the Output tab name it: its round, its number, and in brackets how it was reached — what replaced
 * the try before it: `round 2 · try 3 (round)`, `round 1 · try 2 (retries)`.
 */
export function tryLabel(t: StepTry, tries: readonly StepTry[]): string {
  const before = tries.find((other) => other.try === t.try - 1);
  return `round ${t.round} · try ${t.try}${before?.cause ? ` (${before.cause})` : ''}`;
}

/** A try's sessions as its row says them: how many, and how long the latest took, or that it runs. */
export function attemptsWord({ count, latest }: StepAttempts): string {
  if (!latest) return 'no session';
  const took = latest.endedAt ? duration(Date.parse(latest.endedAt) - Date.parse(latest.startedAt)) : latest.ended ? null : 'running';
  return took ? `#${count} · ${took}` : `#${count}`;
}

const verdictClass = (verdict: string | null) =>
  verdict === 'passed'
    ? 'text-foreground'
    : verdict === 'unfinished' || verdict?.startsWith('exit ')
      ? 'font-semibold text-failure'
      : 'text-muted-foreground';

/**
 * Every try of a step, a row each, earliest first: its round and number and how it was reached, its task, its attempts and how
 * long the latest took, its check's verdict — and a link that selects it, whose closeout the Output tab then shows.
 */
export function Rounds({ tries, selected, onSelect }: { tries: readonly StepTry[]; selected: number; onSelect: (n: number) => void }) {
  return (
    <section aria-label="Rounds" className="space-y-1">
      <h3 className="text-label-medium text-muted-foreground">Rounds</h3>
      <ol className="space-y-1">
        {tries.map((t) => {
          const label = tryLabel(t, tries);
          const chosen = t.try === selected;
          return (
            <li
              key={t.try}
              data-try={t.try}
              aria-current={chosen || undefined}
              className={cn(
                'space-y-0.5 rounded px-2 py-1 text-body-small',
                chosen && 'bg-surface-container ring-1 ring-outline-variant ring-inset',
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium" title={t.note ?? undefined}>
                  {label}
                  {t.current && <span className="font-normal text-muted-foreground"> · current</span>}
                </span>
                <button
                  type="button"
                  onClick={() => onSelect(t.try)}
                  aria-label={`Show the closeout of ${label}`}
                  className="shrink-0 font-medium text-foreground underline-offset-2 hover:underline"
                >
                  closeout
                </button>
              </div>
              <p className="break-all font-mono text-body-small text-muted-foreground">{t.taskId ?? 'not filed'}</p>
              <p className="flex flex-wrap gap-x-3">
                <span data-attempts>{attemptsWord(t.attempts)}</span>
                {t.check && (
                  <span data-verdict={t.check.verdict ?? 'not filed'}>
                    check <span className={cn('font-mono', verdictClass(t.check.verdict))}>{t.check.verdict ?? 'not filed'}</span>
                  </span>
                )}
              </p>
              {t.answer && (
                <p data-your-answer title={t.answer} className="line-clamp-2 break-words">
                  <span className="text-muted-foreground">your answer </span>
                  {t.answer}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * The outcome of the try selected — the current one until another is — and beneath it every other try's, folded. `none` is what
 * is said of the selected try when it gave no statement and the engine records no reason it has none.
 */
export function TryCloseouts({ tries, selected, none }: { tries: readonly StepTry[]; selected: StepTry; none: string }) {
  const others = tries.filter((t) => t.try !== selected.try).reverse();
  return (
    <>
      {tries.length > 1 && (
        <p data-shown-try={selected.try} className="text-body-small font-medium text-muted-foreground">
          {tryLabel(selected, tries)}
          {selected.current && ' · current'}
        </p>
      )}
      {selected.answer && <YourAnswer answer={selected.answer} />}
      <TryOutcome t={selected} none={none} />
      {others.length > 0 && (
        <section aria-label="Other tries" className="space-y-1">
          {others.map((t) => (
            <details key={t.try} data-try={t.try} className="rounded border border-outline-variant text-body-medium">
              <summary className="cursor-pointer px-2 py-1 text-body-small text-muted-foreground hover:text-foreground">
                {tryLabel(t, tries)}
                {t.current && ' · current'} — {outcomeWord(outcomeOf(t, EARLIER_NONE))}
              </summary>
              <div className="space-y-3 border-t border-outline-variant p-2">
                {t.answer && <YourAnswer answer={t.answer} />}
                <TryOutcome t={t} none={EARLIER_NONE} />
              </div>
            </details>
          ))}
        </section>
      )}
    </>
  );
}

const EARLIER_NONE = "No closeout on the engine's record of this try.";

/** A statement whole, as the engine recorded it: what Raw shows, and all there is of one that could not be read. */
function AsItCame({ raw }: { raw: unknown }) {
  return (
    <section aria-label="As it came" className="space-y-1">
      <h4 className="text-body-small text-muted-foreground">the statement as it came</h4>
      <Json data-raw value={raw} />
    </section>
  );
}

/** What a person said to a try when they asked for it, as the CLI's `decide` prints it under the try before's question: `your answer`. */
function YourAnswer({ answer }: { answer: string }) {
  return (
    <p data-your-answer className="whitespace-pre-wrap break-words">
      <span className="font-medium text-muted-foreground">your answer:</span> {answer}
    </p>
  );
}

/**
 * How a try ended, said first — by its agent, or by the machine for it — then its statement drawn, when there is one. A statement that
 * could not be read is shown whole, as the engine recorded it: nothing hidden.
 */
function TryOutcome({ t, none }: { t: StepTry; none: string }) {
  const outcome = outcomeOf(t, none);
  if (t.unreadable) {
    return (
      <div data-closeout className="space-y-3">
        <OutcomeHead outcome={outcome} />
        <AsItCame raw={t.unreadable.raw} />
      </div>
    );
  }
  if (!t.closeout) return <OutcomeHead outcome={outcome} />;
  return <CloseoutView closeout={t.closeout} outcome={outcome} />;
}

/**
 * A statement drawn: its outcome and who said it, what it needs, its summary, each declared field by its shape (`outputKind`), its
 * replies, what it did not give, and its files. The Raw switch shows the statement as the engine recorded it instead, whole; its word is a
 * label of its own beside it, naming the switch's input, since React Aria's switch is a label round its input.
 */
export function CloseoutView({ closeout, outcome }: { closeout: StepCloseout; outcome: Outcome }) {
  const [raw, setRaw] = useState(false);
  const switchId = useId();
  const toggle = (
    <div className="flex shrink-0 items-center gap-1.5 text-body-small text-muted-foreground">
      <Switch id={switchId} size="sm" isSelected={raw} onChange={setRaw} />
      <label htmlFor={switchId} className="cursor-pointer">
        Raw
      </label>
    </div>
  );
  return (
    <div data-closeout className="space-y-3">
      <OutcomeHead outcome={outcome} aside={toggle} />
      {closeout.needs && <ClosedNeeds needs={closeout.needs} />}
      <Statement closeout={closeout} />
      {raw ? (
        <AsItCame raw={closeout.raw} />
      ) : (
        <>
          <DeclaredFields closeout={closeout} />
          <div>
            <p className="text-body-small text-muted-foreground">artifacts</p>
            <Artifacts artifacts={closeout.artifacts} />
            <Values values={closeout.values} />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Each field a closeout declared, drawn by its shape (`FieldView`), then its replies and what it declared and did not give: the Output
 * tab's, and the gate's (`HandedOn`), which folds the long ones (`foldsAtGate`) and says what each holds on its fold. `answered` leaves
 * out each question field: the gate draws its questions to answer beside it.
 */
function DeclaredFields({ closeout, fold = false, answered = false }: { closeout: StepCloseout; fold?: boolean; answered?: boolean }) {
  const images = imagePaths(closeout.artifacts);
  const asked = new Map(closeout.questions.map((a) => [a.field, a.questions]));
  const field = (name: string, value: unknown, first = false) => {
    const questions = asked.get(name);
    if (questions) return answered ? null : <Questions key={name} field={name} questions={questions} />;
    const folded = fold && foldsAtGate(value, first);
    const view = (
      <FieldView
        key={name}
        name={name}
        named={!folded}
        schema={closeout.schema[name]}
        value={value}
        artifacts={closeout.artifacts}
        images={images}
      />
    );
    return folded ? (
      <Fold key={name} name={name} count={(value as unknown[]).length}>
        {view}
      </Fold>
    ) : (
      view
    );
  };
  return (
    <>
      {Object.entries(closeout.output).map(([name, value], i) => field(name, value, i === 0))}
      {closeout.replies && field('replies', closeout.replies)}
      {closeout.missing.length > 0 && (
        <p data-missing className="text-body-small text-yours">
          declared and not given: {closeout.missing.join(', ')}
        </p>
      )}
    </>
  );
}

/** A long field folded under its name and how many entries it holds; drawn only once opened, so a closed fold holds nothing to find. */
function Fold({ name, count, children }: { name: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      data-fold={name}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="rounded border border-outline-variant"
    >
      <summary className="cursor-pointer px-2 py-1 text-body-small text-muted-foreground hover:text-foreground">
        <span className="font-mono">{name}</span> · {count}
      </summary>
      {open && <div className="border-t border-outline-variant p-2">{children}</div>}
    </details>
  );
}

/**
 * What a step handed on, for the person deciding at its gate: what it needs, if it signed off blocked; its summary; each field it
 * declared — for a plan its approach, then its files, steps and risks, a long one folded; and the files it named. The Output tab's
 * drawing, without its outcome line and Raw switch: at a gate the step has signed off, and the statement whole is a tab away.
 * `answeredBeside` where the gate draws the questions it asks to answer: they are then left out here, so each is drawn once.
 */
export function HandedOn({ closeout, answeredBeside = false }: { closeout: StepCloseout; answeredBeside?: boolean }) {
  return (
    <div data-handed-on className="min-w-0 space-y-3">
      {closeout.needs && <ClosedNeeds needs={closeout.needs} />}
      <Statement closeout={closeout} />
      <DeclaredFields closeout={closeout} fold answered={answeredBeside} />
      {closeout.artifacts.length > 0 && (
        <div aria-label="Artifacts" className="text-body-small text-muted-foreground">
          Artifacts:
          <Artifacts artifacts={closeout.artifacts} />
        </div>
      )}
      <Values values={closeout.values} />
    </div>
  );
}

/**
 * What a closeout says in words: its summary, one line as the api cut it, then its body as markdown, and what the run did not accept of
 * it, each under `not accepted`. A body that opens with the summary (`bodyLeadsWith`) is drawn alone, so the line is said once.
 */
export function Statement({ closeout }: { closeout: StepCloseout }) {
  return (
    <>
      {!bodyLeadsWith(closeout.summary, closeout.body) && (
        <p data-summary className="text-body-medium text-foreground">
          {summaryShown(closeout.summary)}
        </p>
      )}
      {closeout.body && <Markdown data-body>{closeout.body}</Markdown>}
      {closeout.refused.map((why) => (
        <p key={why} data-refused className="text-body-small text-failure">
          not accepted: {why}
        </p>
      ))}
    </>
  );
}

/** What a step that signed off blocked needs, under its word, as its agent wrote it. */
export function ClosedNeeds({ needs }: { needs: string }) {
  return (
    <div data-needs className="text-yours">
      <p className="font-medium">Needs:</p> <Markdown>{needs}</Markdown>
    </div>
  );
}
