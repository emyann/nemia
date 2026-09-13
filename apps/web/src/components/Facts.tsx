import type { ReactNode } from 'react';
import type { StepSpec } from '../lib/api';

/** Label and value, one per row. A value that is not set reads as a dash. */
export function Facts({ rows }: { rows: Array<[label: string, value: ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-neutral-500">{label}</dt>
          <dd className="min-w-0 break-words">{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A step's frontmatter, as rows for `Facts`. */
export const specRows = (spec: StepSpec): Array<[string, ReactNode]> => [
  ['harness', code(spec.harness)],
  ['model', code(spec.model)],
  ['after', spec.after.length ? code(spec.after.join(', ')) : null],
  ['resume', code(spec.resume)],
  ['permission mode', code(spec.permissionMode)],
  ['deadline', spec.deadlineSeconds === null ? null : `${spec.deadlineSeconds} s`],
  ['max attempts', spec.maxAttempts],
];

export const code = (value: string | null) => (value === null ? null : <span className="font-mono text-xs">{value}</span>);

export const when = (iso: string) => <time dateTime={iso}>{new Date(iso).toLocaleString()}</time>;

/** What a step was told, folded away: it is long, and it does not change while you look at the step. */
export function Told({ told, filed }: { told: string; filed: boolean }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
        {filed ? 'What it was told' : 'What it would be told now'}
      </summary>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-neutral-100 p-3 text-xs dark:bg-neutral-900">
        {told}
      </pre>
    </details>
  );
}
