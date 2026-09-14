import type { StepArtifact, StepAttempts, StepCloseout, StepTry } from '../lib/api';
import { duration } from '../lib/canvas';
import { cn } from '../lib/utils';
import { code, Facts } from './Facts';

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

/** Bytes as a person reads them, as `wf decide` prints a file's size. */
export const bytesWord = (bytes: number): string =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

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
 * The closeout of the try selected — the current one until another is — and beneath it every other try's, folded. `none` is what
 * is said of the selected try when it gave no closeout.
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
      {selected.closeout ? <CloseoutView closeout={selected.closeout} /> : <p className="text-neutral-500">{none}</p>}
      {others.length > 0 && (
        <section aria-label="Other tries" className="space-y-1">
          {others.map((t) => (
            <details key={t.try} data-try={t.try} className="rounded border border-neutral-200 text-sm dark:border-neutral-800">
              <summary className="cursor-pointer px-2 py-1 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
                {tryLabel(t, tries)}
                {t.current && ' · current'} — {t.closeout ? t.closeout.outcome : 'no closeout'}
              </summary>
              <div className="space-y-3 border-t border-neutral-200 p-2 dark:border-neutral-800">
                {t.answer && <YourAnswer answer={t.answer} />}
                {t.closeout ? <CloseoutView closeout={t.closeout} /> : <p className="text-neutral-500">No closeout on the engine's record of this try.</p>}
              </div>
            </details>
          ))}
        </section>
      )}
    </>
  );
}

/** What a person said to a try when they asked for it, as `wf decide` prints it under the question of the try before: `your answer`. */
function YourAnswer({ answer }: { answer: string }) {
  return (
    <p data-your-answer className="whitespace-pre-wrap break-words">
      <span className="font-medium text-neutral-500">your answer:</span> {answer}
    </p>
  );
}

/** How a try signed off: its outcome and summary, what it needs, what it gave of its declared output, its replies, and its files. */
export function CloseoutView({ closeout }: { closeout: StepCloseout }) {
  const declared = Object.entries(closeout.output);
  return (
    <div data-closeout className="space-y-3">
      <p>
        <span className="text-neutral-500">outcome </span>
        <span className={closeout.outcome === 'blocked' ? 'font-semibold text-amber-700 dark:text-amber-400' : 'font-medium'}>{closeout.outcome}</span>
      </p>
      <p className="whitespace-pre-wrap">{closeout.summary}</p>
      {closeout.needs && (
        <p className="whitespace-pre-wrap text-amber-700 dark:text-amber-400">
          <span className="font-medium">Needs:</span> {closeout.needs}
        </p>
      )}
      {(declared.length > 0 || closeout.missing.length > 0) && (
        <section aria-label="Declared output" className="space-y-1">
          <h4 className="text-neutral-500">declared output</h4>
          {declared.length > 0 && <Facts rows={declared.map(([name, value]) => [name, <OutputValue value={value} />])} />}
          {closeout.missing.length > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">declared and not given: {closeout.missing.join(', ')}</p>
          )}
        </section>
      )}
      {closeout.replies && (
        <section aria-label="Replies" className="space-y-1">
          <h4 className="text-neutral-500">replies</h4>
          {closeout.replies.length ? (
            <ul className="space-y-1 text-xs">
              {closeout.replies.map((reply, i) => (
                <li key={i} data-answer={reply.answer} className="whitespace-pre-wrap break-words">
                  {reply.finding} → <span className="font-medium">{reply.answer}</span>
                  {reply.why && <span className="text-neutral-500"> ({reply.why})</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-neutral-500">none</p>
          )}
        </section>
      )}
      <div>
        <p className="text-neutral-500">artifacts</p>
        <Artifacts artifacts={closeout.artifacts} />
      </div>
    </div>
  );
}

/** A declared field's value: text as text, a number or a flag as itself, and anything else as the JSON it came as. */
function OutputValue({ value }: { value: unknown }) {
  if (typeof value === 'string') return <span className="whitespace-pre-wrap">{value}</span>;
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return code(String(value));
  return (
    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-100 p-2 font-mono text-[11px] leading-snug dark:bg-neutral-950">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/**
 * The files a closeout named. One the api serves: an image drawn inline, opening full-size in a new tab; a text file as a link;
 * anything else as a link with its size. Any other path as the path, as the closeout gave it.
 */
export function Artifacts({ artifacts }: { artifacts: readonly StepArtifact[] }) {
  if (!artifacts.length) return <p className="text-xs text-neutral-500">none named</p>;
  return (
    <ul className="mt-1 space-y-2 text-xs">
      {artifacts.map((artifact, i) => (
        <li key={`${i}:${artifact.path}`} className="break-all">
          <ArtifactView artifact={artifact} />
        </li>
      ))}
    </ul>
  );
}

const linkClass = 'font-mono font-medium text-neutral-900 underline underline-offset-2 dark:text-neutral-100';

function ArtifactView({ artifact }: { artifact: StepArtifact }) {
  if (!('url' in artifact)) {
    return (
      <span data-artifact="path" className="font-mono">
        {artifact.path}
      </span>
    );
  }
  if (artifact.kind === 'image') {
    return (
      <figure data-artifact="image" className="space-y-1">
        <a href={artifact.url} target="_blank" rel="noreferrer" title={`Open ${artifact.name} full-size in a new tab`} className="block">
          <img
            src={artifact.url}
            alt={artifact.name}
            className="max-h-60 max-w-full rounded border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950"
          />
        </a>
        <figcaption className="font-mono text-neutral-500">
          {artifact.name} · {bytesWord(artifact.size)}
        </figcaption>
      </figure>
    );
  }
  return (
    <span data-artifact={artifact.kind}>
      <a href={artifact.url} target="_blank" rel="noreferrer" className={linkClass}>
        {artifact.name}
      </a>
      {artifact.kind === 'other' && <span className="text-neutral-500"> · {bytesWord(artifact.size)}</span>}
    </span>
  );
}
