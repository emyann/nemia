import type { ReactNode } from 'react';
import type { RunDetail, StepCheck, StepFiled, StepLog, StepSpec } from '../lib/api';
import { costText, pastBudget } from '../lib/cost';

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

/**
 * A step's frontmatter, as rows for `Facts` — and, given what the engine filed its current try with, what it runs with. A field
 * its workflow leaves unset reads as the value the engine filed the task with, marked `default`: `1 · default`, `no limit ·
 * default`. The permission mode reads as the session runs in it, its harness's choice where none was filed: `auto · default`,
 * `read-only · by tools`. One the try was filed with other than the workflow's word — a `wf retry --model` — reads as the try's,
 * marked `this try`. For a step not filed, what the workflow says, or a dash.
 */
export const specRows = (spec: StepSpec, filed: StepFiled | null = null): Array<[string, ReactNode]> => [
  ['harness', code(spec.harness)],
  ['model', modelRow(spec.model, filed)],
  ['effort', ranWith(spec.effort, filed, (f) => f.effort)],
  ['after', spec.after.length ? code(spec.after.join(', ')) : null],
  // Beside `after`, on a looping step only: the edge back, and how many rounds it may run.
  ...(spec.loop === null ? [] : ([['loop', code(spec.loop)], ['rounds', spec.rounds]] satisfies Array<[string, ReactNode]>)),
  ['resume', code(spec.resume)],
  ['permission mode', modeRow(spec.permissionMode, filed)],
  ['tools', ranWith(toolsWord(spec.tools), filed, (f) => toolsWord(f.tools))],
  ['deadline', ranWith(secondsWord(spec.deadlineSeconds), filed, (f) => secondsWord(f.deadlineSeconds), 'no limit')],
  ['max attempts', ranWith(spec.maxAttempts === null ? null : String(spec.maxAttempts), filed, (f) => String(f.maxAttempts))],
];

const toolsWord = (tools: string[] | null) => (tools === null ? null : tools.join(', ') || 'none');
const secondsWord = (seconds: number | null) => (seconds === null ? null : `${seconds} s`);

/**
 * One field of what a step runs with: the workflow's word, the engine's where the workflow has none — `unset` where the engine was
 * given none either, for the harness to choose — and the engine's where it filed the try with another.
 */
function ranWith(workflow: string | null, filed: StepFiled | null, pick: (filed: StepFiled) => string | null, unset = "harness's own"): ReactNode {
  const engine = filed && pick(filed);
  if (!filed || (workflow !== null && (engine === null || engine === workflow))) return code(workflow);
  return workflow === null
    ? <Marked value={engine ?? unset} mark="default" word={engine === null} />
    : <Marked value={engine!} mark="this try" title={`The workflow says ${workflow}; the engine filed this try with ${engine}.`} />;
}

/** The model, as `ranWith` reads it — and the model a person's `wf retry --model` asked this try for, marked `this try`, whatever the workflow says. */
function modelRow(workflow: string | null, filed: StepFiled | null): ReactNode {
  if (!filed?.askedModel) return ranWith(workflow, filed, (f) => f.model);
  const says = workflow === null ? 'names no model' : `says ${workflow}`;
  return <Marked value={filed.model ?? filed.askedModel} mark="this try" title={`Asked for with wf retry --model ${filed.askedModel}; the workflow ${says}.`} />;
}

/**
 * The permission mode, as the session runs in it (`runsIn`): its harness's choice where none was filed, marked `default` — `auto` for
 * Claude Code, not the prompting mode Claude Code has of its own — and a Codex sandbox the step's tools narrowed, marked `by tools`.
 * Where the api could not ask the harness, as `ranWith` reads it.
 */
function modeRow(workflow: string | null, filed: StepFiled | null): ReactNode {
  const runs = filed?.runsIn;
  if (!filed || !runs) return ranWith(workflow, filed, (f) => f.permissionMode);
  if (runs.by === 'tools') {
    const named = workflow === null ? '' : `, though the workflow says ${workflow}`;
    return <Marked value={runs.mode} mark="by tools" title={`Its tools have none that writes, so its harness runs it ${runs.mode}${named}.`} />;
  }
  if (workflow === null) return <Marked value={runs.mode} mark="default" />;
  if (filed.permissionMode !== workflow) {
    return <Marked value={runs.mode} mark="this try" title={`The workflow says ${workflow}; the engine filed this try with ${filed.permissionMode ?? 'none'}.`} />;
  }
  return runs.mode === workflow ? code(workflow) : <Marked value={runs.mode} mark="as run" title={`The workflow says ${workflow}, which its harness runs as ${runs.mode}.`} />;
}

function Marked({ value, mark, word = false, title }: { value: string; mark: string; word?: boolean; title?: string }) {
  return (
    <span data-mark={mark} title={title}>
      <span className={word ? undefined : 'font-mono text-xs'}>{value}</span>
      <span className="text-neutral-500"> · {mark}</span>
    </span>
  );
}

export const code = (value: string | null) => (value === null ? null : <span className="font-mono text-xs">{value}</span>);

type Priced = Pick<RunDetail['steps'][number], 'spent' | 'budget' | 'taskId' | 'tries'>;

/**
 * A `spent` row for `Facts`, where one says more than the current try's `cost` does: for a step with a cap, what its tries have cost of it
 * (`$4.25 of $3`), red once they have cost it or more; for one tried more than once, what every try cost together. None otherwise. A filed
 * step nobody priced reads `not measured`, never $0.
 */
export function spentRows(step: Priced): Array<[string, ReactNode]> {
  if (!step.budget && step.tries.length < 2) return [];
  const text = costText(step);
  if (!text) return [['spent', step.taskId ? 'not measured' : null]];
  const over = pastBudget(step);
  return [['spent', <span data-spent={over ? 'over' : 'within'} className={`font-mono text-xs ${over ? 'font-semibold text-red-700 dark:text-red-400' : ''}`}>{text}</span>]];
}

/**
 * The command a step is judged by, and once its check refused, what it exited with and the last lines of
 * each stream: its output first, where a test runner says what failed, then its stderr.
 */
export function Check({ check: { command, refused } }: { check: StepCheck }) {
  return (
    <section aria-label="Check" className="space-y-2">
      <h3 className="text-xs font-medium text-neutral-500">Check</h3>
      <Facts
        rows={[
          ['command', code(command)],
          ...(refused
            ? [['refused', <span className="font-mono text-xs font-semibold text-red-700 dark:text-red-400">{refused.exit}</span>] as [string, ReactNode]]
            : []),
        ]}
      />
      {refused?.unreadable && <p className="text-xs text-red-600 dark:text-red-400">{refused.unreadable}</p>}
      {refused?.stdout && <Stream name="output" log={refused.stdout} />}
      {refused && refused.stderr.lines.length > 0 && <Stream name="stderr" log={refused.stderr} />}
    </section>
  );
}

/** One of a refused check's streams, as the api cut it: its last lines, and whether there were more. */
function Stream({ name, log }: { name: string; log: StepLog }) {
  if (!log.lines.length) return <p className="text-xs text-neutral-500">No {name}.</p>;
  return (
    <div className="space-y-1">
      <p className="text-xs text-neutral-500">{log.truncated ? `The last ${log.lines.length} lines of its ${name}` : `Its ${name}`}</p>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-100 p-2 font-mono text-[11px] leading-snug dark:bg-neutral-950">
        {log.lines.join('\n')}
      </pre>
    </div>
  );
}

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
