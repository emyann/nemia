import type { ReactNode } from 'react';
import type { PeakMark, RunDetail, StepCheck, StepFiled, StepLog, StepSpec, StepUsed } from '../lib/api';
import { contextText } from '../lib/builder';
import { costText, pastBudget } from '../lib/cost';
import { CopyButton } from './CopyButton';

/** Label and value, one per row. A value that is not set reads as a dash. */
export function Facts({ rows }: { rows: Array<[label: string, value: ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} data-fact={label} className="contents">
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
 * marked `this try`. For a step not filed, what the workflow says, or a dash. A step on a remote A2A agent (`remoteRows`) reads otherwise.
 */
export const specRows = (spec: StepSpec, filed: StepFiled | null = null): Array<[string, ReactNode]> => (isRemote(spec, filed) ? remoteRows(spec, filed) : [

  ['harness', code(spec.harness)],
  ['model', modelRow(spec.model, filed)],
  ['effort', ranWith(spec.effort, filed, (f) => f.effort)],
  // The session's context window, as the step writes it — `200k` — and the model's whole window where neither the step nor the try has one.
  ['context', ranWith(tokensWord(spec.context), filed, (f) => tokensWord(f.contextTokens), "model's whole window")],
  ['after', spec.after.length ? code(spec.after.join(', ')) : null],
  // Only where the step says it: `main`, the repository's own checkout rather than a worktree of the run's. A detail from an api that does
  // not carry the key says nothing, rather than an empty row.
  ...(spec.workspace ? ([['workspace', code(spec.workspace)]] satisfies Array<[string, ReactNode]>) : []),
  // Beside `after`, on a looping step only: the edge back, and how many rounds it may run.
  ...(spec.loop === null ? [] : ([['loop', code(spec.loop)], ['rounds', spec.rounds]] satisfies Array<[string, ReactNode]>)),
  ['resume', code(spec.resume)],
  // A codex step's fence is its sandbox, which the engine's task files as its permission mode: the same row, under Codex's name.
  [fenceLabel(spec), modeRow(spec.sandbox ?? spec.permissionMode, filed)],
  ['tools', ranWith(toolsWord(spec.tools), filed, (f) => toolsWord(f.tools))],
  ['deadline', ranWith(secondsWord(spec.deadlineSeconds), filed, (f) => secondsWord(f.deadlineSeconds), 'no limit')],
]);

/** A step on a remote A2A agent: its harness names one (`a2a:<name>`), or the api says its try was sent to one. */
const isRemote = (spec: StepSpec, filed: StepFiled | null): boolean => !!filed?.remote || !!spec.harness?.startsWith('a2a:');

/**
 * A step on a remote A2A agent, as rows: the harness, the agent's address, and what the run itself keeps — `after`, `workspace`, the deadline.
 * No model, effort, context, fence, tools or resume: the agent runs as its own party configured it, and a `harness's own · default` row there
 * would say the run chose what nobody here chose. The address is the store's word now; where it no longer declares the agent, says so.
 */
function remoteRows(spec: StepSpec, filed: StepFiled | null): Array<[string, ReactNode]> {
  const address = filed?.remote === undefined || filed.remote === null ? null : filed.remote.address ?? 'no longer in a2a-agents.json';
  return [
    ['harness', code(spec.harness ?? (filed?.remote ? `a2a:${filed.remote.name}` : null))],
    ['agent', filed?.remote?.address ? code(address) : address],
    ['after', spec.after.length ? code(spec.after.join(', ')) : null],
    ...(spec.workspace ? ([['workspace', code(spec.workspace)]] satisfies Array<[string, ReactNode]>) : []),
    ['deadline', ranWith(secondsWord(spec.deadlineSeconds), filed, (f) => secondsWord(f.deadlineSeconds), 'no limit')],
  ];
}

/** What a step's fence is called on its harness: `sandbox` on codex, whose `sandbox:` it is, and `permission mode` on Claude Code. */
export const fenceLabel = (spec: Pick<StepSpec, 'harness' | 'sandbox'>): string => (spec.harness === 'codex' || spec.sandbox ? 'sandbox' : 'permission mode');

const tokensWord = (tokens: number | null | undefined) => (tokens === null || tokens === undefined ? null : contextText(tokens));
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
  const asFiled = filed && filedFence(filed.permissionMode, workflow);
  if (!filed || !runs) return ranWith(workflow, filed, (f) => filedFence(f.permissionMode, workflow));
  if (runs.by === 'tools') {
    const named = workflow === null ? '' : `, though the workflow says ${workflow}`;
    return <Marked value={runs.mode} mark="by tools" title={`Its tools have none that writes, so its harness runs it ${runs.mode}${named}.`} />;
  }
  if (workflow === null) return <Marked value={runs.mode} mark="default" />;
  if (asFiled !== workflow) {
    return <Marked value={runs.mode} mark="this try" title={`The workflow says ${workflow}; the engine filed this try with ${filed.permissionMode ?? 'none'}.`} />;
  }
  return runs.mode === workflow ? code(workflow) : <Marked value={runs.mode} mark="as run" title={`The workflow says ${workflow}, which its harness runs as ${runs.mode}.`} />;
}

/**
 * The fence a try was filed with, in the words the workflow now uses for it. A codex run frozen before 2026-09-23 named its widest sandbox
 * `permissionMode: bypassPermissions`, which its record now reads as `sandbox: danger-full-access` (`asNamed`) while the engine's task keeps
 * the word it was filed with; Codex ran it `-s danger-full-access` either way, so it is the same fence and no try of its own.
 */
const filedFence = (filed: string | null, workflow: string | null): string | null =>
  filed === 'bypassPermissions' && workflow === 'danger-full-access' ? workflow : filed;

function Marked({ value, mark, word = false, title }: { value: string; mark: string; word?: boolean; title?: string }) {
  return (
    <span data-mark={mark} title={title}>
      <span className={word ? undefined : 'font-mono text-xs'}>{value}</span>
      <span className="text-neutral-500"> · {mark}</span>
    </span>
  );
}

export const code = (value: string | null) => (value === null ? null : <span className="font-mono text-xs">{value}</span>);

/**
 * A path on the machine, as a `Facts` value: the path, and a button that copies it. A folder run's work is somewhere under the store
 * that nobody typed and nobody remembers, and the board is where a person reads the run — so the path is copyable wherever it is shown,
 * rather than selected out of a line that wraps.
 */
export const pathRow = (at: string | null) =>
  at === null ? null : (
    <span data-path className="flex items-start gap-1">
      <span className="min-w-0 break-all font-mono text-xs">{at}</span>
      <CopyButton text={at} what="the path" />
    </span>
  );

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
  return [['spent', <span key="spent" data-spent={over ? 'over' : 'within'} className={`font-mono text-xs ${over ? 'font-semibold text-red-700 dark:text-red-400' : ''}`}>{text}</span>]];
}

/**
 * A `read` row for `Facts`, beside a step's `cost`: what its sessions read, by price, in `wf decide`'s words, where anything measured it.
 * None where nothing did — a runner that counted its input as one number has nothing to say here, which is not 0.
 */
export function readRows(used: StepUsed | null | undefined): Array<[string, ReactNode]> {
  return used?.read ? [['read', <Read key="read" said={used.read} peak={used.peak} rebuilt={used.rebuilt} />]] : [];
}

const WARN = 'text-amber-700 dark:text-amber-400';

/**
 * What sessions read, by price: the counts — `read 21.4M · wrote 412k · peak 167k` — and, beneath, a resumed session that wrote its
 * context to the cache again. The peak is marked where it reached the step's `context:` cap or passed 200k with none, and so is the rebuild:
 * each is a session that paid for a context it need not have carried, or carried again. The words are the package's (`readWords`).
 */
export function Read({ said, peak, rebuilt }: { said: string; peak: PeakMark; rebuilt: number }) {
  const parts = said.split(' · ');
  // The peak, or where no peak was measured, the compactions alone (`compacted at its 200k cap`), which are where it stands.
  const counts = parts.filter((part) => /^(read|wrote|peak|compacted)\b/.test(part));
  const rest = parts.filter((part) => !counts.includes(part));
  return (
    <span data-read className="block">
      {counts.length > 0 && (
        <span className="font-mono text-xs">
          {counts.map((part, i) => (
            <span key={part}>
              {i > 0 && ' · '}
              {/^(peak|compacted)\b/.test(part) && peak ? (
                <span data-peak={peak} className={`font-semibold ${WARN}`} title={PEAK_TITLE[peak]}>{part}</span>
              ) : (
                part
              )}
            </span>
          ))}
        </span>
      )}
      {rebuilt > 0 && rest.map((part) => (
        <span key={part} data-rebuilt={rebuilt} className={`block text-xs ${WARN}`} title={REBUILT_TITLE}>{part}</span>
      ))}
    </span>
  );
}

const PEAK_TITLE: Record<Exclude<PeakMark, null>, string> = {
  cap: "It reached the step's context: cap: Claude Code compacted the conversation, a summary in place of what it read, or was about to.",
  large: 'Its context passed 200k tokens on a step with no context: cap. Every response reads all of it.',
};
const REBUILT_TITLE = 'A resumed session should read its context from the cache. It wrote it again instead, at twenty times the price of a read: the cache was rebuilt.';

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
            ? [['refused', <span key="refused" className="font-mono text-xs font-semibold text-red-700 dark:text-red-400">{refused.exit}</span>] as [string, ReactNode]]
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
