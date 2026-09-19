import { useId, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import type { StepAttempts, StepCloseout, StepTry } from '../lib/api';
import { duration } from '../lib/canvas';
import { imagePaths, type Outcome, outcomeOf, outcomeWord } from '../lib/outcome';
import { cn } from '../lib/utils';
import { Artifacts } from './Artifacts';
import { Markdown } from './Markdown';
import { FieldView, Json, OutcomeHead } from './Outcome';

// Where they were: the Gate, the run's page and the tests read them from here.
export { Artifacts, bytesWord } from './Artifacts';

/**
 * A try as the Rounds rows and the Output tab name it: its round, its number, and in brackets how it was reached — what replaced
 * the try before it: `round 2 · try 3 (round)`, `round 1 · try 2 (retries)`.
 */
export function tryLabel(t: StepTry, tries: readonly StepTry[]): string {
  const before = tries.find((other) => other.try === t.try - 1);
  return `round ${t.round} · try ${t.try}${before?.then ? ` (${before.then})` : ''}`;
}

/** A try's attempts as its row says them: how many, and how long the latest took, or that it runs. */
export function attemptsWord({ count, latest }: StepAttempts): string {
  if (!latest) return 'no attempt';
  const took = latest.endedAt ? duration(Date.parse(latest.endedAt) - Date.parse(latest.startedAt)) : latest.ended ? null : 'running';
  return took ? `#${count} · ${took}` : `#${count}`;
}

const verdictClass = (verdict: string | null) =>
  verdict === 'passed'
    ? 'text-emerald-700 dark:text-emerald-400'
    : verdict === 'unfinished' || verdict?.startsWith('exit ')
      ? 'font-semibold text-red-700 dark:text-red-400'
      : 'text-neutral-500';

/**
 * Every try of a step, a row each, earliest first: its round and number and how it was reached, its task, its attempts and how
 * long the latest took, its check's verdict — and a link that selects it, whose closeout the Output tab then shows.
 */
export function Rounds({ tries, selected, onSelect }: { tries: readonly StepTry[]; selected: number; onSelect: (n: number) => void }) {
  return (
    <section aria-label="Rounds" className="space-y-1">
      <h3 className="text-xs font-medium text-neutral-500">Rounds</h3>
      <ol className="space-y-1">
        {tries.map((t) => {
          const label = tryLabel(t, tries);
          const chosen = t.try === selected;
          return (
            <li
              key={t.try}
              data-try={t.try}
              aria-current={chosen || undefined}
              className={cn('space-y-0.5 rounded px-2 py-1 text-xs', chosen && 'bg-neutral-100 dark:bg-neutral-800')}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium" title={t.note ?? undefined}>
                  {label}
                  {t.current && <span className="font-normal text-neutral-500"> · current</span>}
                </span>
                <button
                  type="button"
                  onClick={() => onSelect(t.try)}
                  aria-label={`Show the closeout of ${label}`}
                  className="shrink-0 font-medium text-neutral-900 underline-offset-2 hover:underline dark:text-neutral-100"
                >
                  closeout
                </button>
              </div>
              <p className="break-all font-mono text-[11px] text-neutral-500">{t.taskId ?? 'not filed'}</p>
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
                  <span className="text-neutral-500">your answer </span>
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
        <p data-shown-try={selected.try} className="text-xs font-medium text-neutral-500">
          {tryLabel(selected, tries)}
          {selected.current && ' · current'}
        </p>
      )}
      {selected.answer && <YourAnswer answer={selected.answer} />}
      <TryOutcome t={selected} none={none} />
      {others.length > 0 && (
        <section aria-label="Other tries" className="space-y-1">
          {others.map((t) => (
            <details key={t.try} data-try={t.try} className="rounded border border-neutral-200 text-sm dark:border-neutral-800">
              <summary className="cursor-pointer px-2 py-1 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
                {tryLabel(t, tries)}
                {t.current && ' · current'} — {outcomeWord(outcomeOf(t, EARLIER_NONE))}
              </summary>
              <div className="space-y-3 border-t border-neutral-200 p-2 dark:border-neutral-800">
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

/** What a person said to a try when they asked for it, as `wf decide` prints it under the question of the try before: `your answer`. */
function YourAnswer({ answer }: { answer: string }) {
  return (
    <p data-your-answer className="whitespace-pre-wrap break-words">
      <span className="font-medium text-neutral-500">your answer:</span> {answer}
    </p>
  );
}

/** How a try ended, said first — by its agent, or by the machine for it — then its statement drawn, when there is one. */
function TryOutcome({ t, none }: { t: StepTry; none: string }) {
  const outcome = outcomeOf(t, none);
  if (!t.closeout) return <OutcomeHead outcome={outcome} />;
  return <CloseoutView closeout={t.closeout} outcome={outcome} />;
}

/**
 * A statement drawn: its outcome and who said it, what it needs, its summary, each declared field by its shape (`outputKind`), its
 * replies, what it did not give, and its files. The Raw switch shows the statement as the engine recorded it instead, whole.
 */
export function CloseoutView({ closeout, outcome }: { closeout: StepCloseout; outcome: Outcome }) {
  const [raw, setRaw] = useState(false);
  const switchId = useId();
  const images = imagePaths(closeout.artifacts);
  const declared = Object.entries(closeout.output);
  const field = (name: string, value: unknown) => (
    <FieldView key={name} name={name} schema={closeout.schema[name]} value={value} artifacts={closeout.artifacts} images={images} />
  );
  const toggle = (
    // The aria switch is a label of its own, round its input, so its word is a label beside it that names that input.
    <div className="flex shrink-0 items-center gap-1.5 text-xs text-neutral-500">
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
      <Markdown>{closeout.summary}</Markdown>
      {raw ? (
        <section aria-label="As it came" className="space-y-1">
          <h4 className="text-xs text-neutral-500">the statement as it came</h4>
          <Json data-raw value={closeout.raw} />
        </section>
      ) : (
        <>
          {declared.map(([name, value]) => field(name, value))}
          {closeout.replies && field('replies', closeout.replies)}
          {closeout.missing.length > 0 && (
            <p data-missing className="text-xs text-amber-700 dark:text-amber-400">declared and not given: {closeout.missing.join(', ')}</p>
          )}
          <div>
            <p className="text-xs text-neutral-500">artifacts</p>
            <Artifacts artifacts={closeout.artifacts} />
          </div>
        </>
      )}
    </div>
  );
}

/** What a step that signed off blocked needs, under its word, as its agent wrote it. */
export function ClosedNeeds({ needs }: { needs: string }) {
  return (
    <div data-needs className="text-amber-700 dark:text-amber-400">
      <p className="font-medium">Needs:</p>{' '}
      <Markdown>{needs}</Markdown>
    </div>
  );
}

