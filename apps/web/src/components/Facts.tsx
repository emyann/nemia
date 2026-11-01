import type { ReactNode } from 'react';
import type { Bridge, Collisions, PeakMark, RunDetail, StepCheck, StepFiled, StepLog, StepSpec, StepUsed } from '../lib/api';
import { stepAnchor } from '../lib/asks';
import { contextText } from '../lib/builder';
import { costText, pastBudget } from '../lib/cost';
import { collisionFacts, type GateFact } from '../lib/gate';
import { cn } from '../lib/utils';
import { RouteLink } from './AgentParts';
import { CopyButton } from './CopyButton';
import { Instant } from './Instant';

/** A section's quiet heading: small, medium weight, in the muted ink. */
export const HEADING = 'text-body-small font-medium text-muted-foreground';

/** A link's look in a fact's words. */
export const LINK =
  'rounded-sm underline decoration-outline underline-offset-2 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/50';

const STATE = {
  good: 'text-foreground',
  bad: 'text-failure',
  none: '',
} as const;

/** `facts` of run `runId`, a label and its words a row, each coloured by its state: under a gate, and in the run's Decide section. */
export function FactList({
  runId,
  facts,
  label,
  className,
}: {
  runId: string;
  facts: readonly GateFact[];
  label: string;
  className?: string;
}) {
  return (
    <dl aria-label={label} className={cn('grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-body-small', className)}>
      {facts.map((fact, i) => (
        <div key={`${fact.label}-${i}`} className="contents">
          <dt className="text-muted-foreground">{fact.label}</dt>
          <dd data-fact={fact.label} data-state={fact.state} className={cn('min-w-0 break-words', STATE[fact.state ?? 'none'])}>
            <FactWords runId={runId} fact={fact} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A fact's words, linked to the step's section on the run's page where there is more to read: a review's findings, a check's output. */
function FactWords({ runId, fact }: { runId: string; fact: GateFact }) {
  if (!fact.step) return <>{fact.said}</>;
  return (
    <RouteLink to="/runs/$runId" params={{ runId }} hash={stepAnchor(fact.step)} data-fact-link={fact.step} className={LINK}>
      {fact.said}
    </RouteLink>
  );
}

/**
 * The trial merges an ending's decision read (`Collisions`), in the run's Decide section: the runs in flight on the base and the semantic
 * conflict, in the gate's words, which a landing that failed its check waits at no gate to show.
 */
export function TrialMerges({ runId, collisions }: { runId: string; collisions: Collisions }) {
  return (
    <section aria-label="Trial merges" className="space-y-1">
      <h3 className="text-label-medium text-muted-foreground">
        Trial merges, as git says them now: onto {collisions.onto}, and onto each run in flight on it
      </h3>
      <FactList runId={runId} facts={collisionFacts(collisions)} label="What the trial merges say" />
    </section>
  );
}

/** Label and value, one per row. A value that is not set reads as a dash. */
export function Facts({ rows }: { rows: Array<[label: string, value: ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-body-medium">
      {rows.map(([label, value]) => (
        <div key={label} data-fact={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
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
 * `read-only · by tools`. One the try was filed with other than the workflow's word — the CLI's `retry --model` — reads as the try's,
 * marked `this try`. For a step not filed, what the workflow says, or a dash. A step on a remote A2A agent (`remoteRows`) reads otherwise.
 *
 * The context is the session's window as the step writes it — `200k` — and the model's whole window where neither the step nor the try has
 * one. `workspace` is a row only where the step says it (`base`, the repository's own checkout rather than a worktree of the run's), and
 * `place` only where it says `folder` (`placeRows`): a detail from an api that does not carry the key has none. `loop` and `rounds`, the
 * edge back and how many rounds it may run, are rows beside `after` on a looping step only. A codex step's fence is its sandbox, which the
 * engine's task files as its permission mode: the same row, under Codex's name (`fenceLabel`). A step filed bridged has a `reach` row: its
 * session's web link, or why it is not up.
 */
export const specRows = (spec: StepSpec, filed: StepFiled | null = null): Array<[string, ReactNode]> =>
  isRemote(spec, filed)
    ? remoteRows(spec, filed)
    : [
        ['harness', code(spec.harness)],
        ['model', modelRow(spec.model, filed)],
        ['effort', ranWith(spec.effort, filed, (f) => f.effort)],
        ['context', ranWith(tokensWord(spec.context), filed, (f) => tokensWord(f.contextTokens), "model's whole window")],
        ['after', spec.after.length ? code(spec.after.join(', ')) : null],
        ...(spec.workspace ? ([['workspace', code(spec.workspace)]] satisfies Array<[string, ReactNode]>) : []),
        ...placeRows(spec),
        ...(spec.loop === null
          ? []
          : ([
              ['loop', code(spec.loop)],
              ['rounds', spec.rounds],
            ] satisfies Array<[string, ReactNode]>)),
        ['resume', code(spec.resume)],
        [fenceLabel(spec), modeRow(spec.sandbox ?? spec.permissionMode, filed)],
        ['tools', ranWith(toolsWord(spec.tools), filed, (f) => toolsWord(f.tools))],
        ['deadline', ranWith(secondsWord(spec.deadlineSeconds), filed, (f) => secondsWord(f.deadlineSeconds), 'no limit')],
        ...(filed?.bridge
          ? ([['reach', <BridgeWords key="reach" bridge={filed.bridge} data-step-bridge />]] satisfies Array<[string, ReactNode]>)
          : []),
      ];

/**
 * A bridged session's web link, opened in a new tab, where its bridge is up; why not, in the runtime's words, where it is not. `data` marks
 * the link for the page that draws it.
 */
export function BridgeWords({ bridge, ...data }: { bridge: Bridge } & Record<`data-${string}`, boolean>) {
  if (bridge.url === null)
    return <span data-bridge-why className="wrap-anywhere">{`The web link is not up: ${bridge.why ?? 'its bridge says nothing'}`}</span>;
  return (
    <a href={bridge.url} target="_blank" rel="noreferrer" className={cn(LINK, 'break-all')} {...data}>
      {bridge.url}
    </a>
  );
}

/** The `place` row of a step that works in a folder the run makes: none for one on a repository, which every step was before the key. */
const placeRows = (spec: StepSpec): Array<[string, ReactNode]> => (spec.place === 'folder' ? [['place', code(spec.place)]] : []);

/** A step on a remote A2A agent: its harness names one (`a2a:<name>`), or the api says its try was sent to one. */
const isRemote = (spec: StepSpec, filed: StepFiled | null): boolean => !!filed?.remote || !!spec.harness?.startsWith('a2a:');

/**
 * A step on a remote A2A agent, as rows: the harness, the agent's address, and what the run itself keeps — `after`, `workspace`, `place`,
 * the deadline. No model, effort, context, fence, tools or resume: the agent runs as its own party configured it, and a `harness's own ·
 * default` row there would say the run chose what nobody here chose. The address is the store's current word; where the store does not
 * declare the agent, it says so.
 */
function remoteRows(spec: StepSpec, filed: StepFiled | null): Array<[string, ReactNode]> {
  const address = filed?.remote === undefined || filed.remote === null ? null : (filed.remote.address ?? 'no longer in a2a-agents.json');
  return [
    ['harness', code(spec.harness ?? (filed?.remote ? `a2a:${filed.remote.name}` : null))],
    ['agent', filed?.remote?.address ? code(address) : address],
    ['after', spec.after.length ? code(spec.after.join(', ')) : null],
    ...(spec.workspace ? ([['workspace', code(spec.workspace)]] satisfies Array<[string, ReactNode]>) : []),
    ...placeRows(spec),
    ['deadline', ranWith(secondsWord(spec.deadlineSeconds), filed, (f) => secondsWord(f.deadlineSeconds), 'no limit')],
  ];
}

/** What a step's fence is called on its harness: `sandbox` on codex, whose `sandbox:` it is, and `permission mode` on Claude Code. */
export const fenceLabel = (spec: Pick<StepSpec, 'harness' | 'sandbox'>): string =>
  spec.harness === 'codex' || spec.sandbox ? 'sandbox' : 'permission mode';

const tokensWord = (tokens: number | null | undefined) => (tokens === null || tokens === undefined ? null : contextText(tokens));
const toolsWord = (tools: string[] | null) => (tools === null ? null : tools.join(', ') || 'none');
const secondsWord = (seconds: number | null) => (seconds === null ? null : `${seconds} s`);

/**
 * One field of what a step runs with: the workflow's word, the engine's where the workflow has none — `unset` where the engine was
 * given none either, for the harness to choose — and the engine's where it filed the try with another.
 */
function ranWith(
  workflow: string | null,
  filed: StepFiled | null,
  pick: (filed: StepFiled) => string | null,
  unset = "harness's own",
): ReactNode {
  const engine = filed && pick(filed);
  if (!filed || (workflow !== null && (engine === null || engine === workflow))) return code(workflow);
  return workflow === null ? (
    <Marked value={engine ?? unset} mark="default" word={engine === null} />
  ) : (
    <Marked value={engine!} mark="this try" title={`The workflow says ${workflow}; this try was filed with ${engine}.`} />
  );
}

/**
 * The model, as `ranWith` reads it — and the model a person's `retry --model` asked this try for, marked `this try`, whatever the
 * workflow says.
 */
function modelRow(workflow: string | null, filed: StepFiled | null): ReactNode {
  if (!filed?.askedModel) return ranWith(workflow, filed, (f) => f.model);
  const says = workflow === null ? 'names no model' : `says ${workflow}`;
  return (
    <Marked
      value={filed.model ?? filed.askedModel}
      mark="this try"
      title={`Asked for on this try: ${filed.askedModel}; the workflow ${says}.`}
    />
  );
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
    return (
      <Marked value={runs.mode} mark="by tools" title={`Its tools have none that writes, so its harness runs it ${runs.mode}${named}.`} />
    );
  }
  if (workflow === null) return <Marked value={runs.mode} mark="default" />;
  if (asFiled !== workflow) {
    return (
      <Marked
        value={runs.mode}
        mark="this try"
        title={`The workflow says ${workflow}; this try was filed with ${filed.permissionMode ?? 'none'}.`}
      />
    );
  }
  return runs.mode === workflow ? (
    code(workflow)
  ) : (
    <Marked value={runs.mode} mark="as run" title={`The workflow says ${workflow}, which its harness runs as ${runs.mode}.`} />
  );
}

/**
 * The fence a try was filed with, in the words the workflow uses for it: a task filed `bypassPermissions` for a codex step whose record
 * reads `sandbox: danger-full-access` (a step frozen with `permissionMode: bypassPermissions`, written back under its sandbox) is that
 * sandbox — Codex runs both `-s danger-full-access` — and not a fence of the try's own.
 */
const filedFence = (filed: string | null, workflow: string | null): string | null =>
  filed === 'bypassPermissions' && workflow === 'danger-full-access' ? workflow : filed;

function Marked({ value, mark, word = false, title }: { value: string; mark: string; word?: boolean; title?: string }) {
  return (
    <span data-mark={mark} title={title}>
      <span className={word ? undefined : 'font-mono text-body-small'}>{value}</span>
      <span className="text-muted-foreground"> · {mark}</span>
    </span>
  );
}

export const code = (value: string | null) => (value === null ? null : <span className="font-mono text-body-small">{value}</span>);

/**
 * A path on the machine, as a `Facts` value: the path, and a button that copies it. A folder run's work is somewhere under the store
 * that nobody typed and nobody remembers, and the board is where a person reads the run — so the path is copyable wherever it is shown,
 * rather than selected out of a line that wraps.
 */
export const pathRow = (at: string | null) =>
  at === null ? null : (
    <span data-path className="flex items-start gap-1">
      <span className="min-w-0 break-all font-mono text-body-small">{at}</span>
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
  return [
    [
      'spent',
      <span
        key="spent"
        data-spent={over ? 'over' : 'within'}
        className={`font-mono text-body-small ${over ? 'font-semibold text-money' : ''}`}
      >
        {text}
      </span>,
    ],
  ];
}

/**
 * A `read` row for `Facts`, beside a step's `cost`: what its sessions read, by price, in the CLI `decide`'s words, where anything measured
 * it. None where nothing did — a runner that counted its input as one number has nothing to say here, which is not 0.
 */
export function readRows(used: StepUsed | null | undefined): Array<[string, ReactNode]> {
  return used?.read ? [['read', <Read key="read" said={used.read} peak={used.peak} rebuilt={used.rebuilt} />]] : [];
}

/**
 * The `unread` row of a step's facts: why the runtime could not read its session alone, whole and wrapping, in its words — a long sentence
 * naming a file and a field. None for a step whose session was read.
 */
export const unreadRows = (words: string | null): Array<[string, ReactNode]> =>
  words
    ? [
        [
          'unread',
          <span key="unread" data-unread className={cn('text-body-small', WARN)}>
            {words}
          </span>,
        ],
      ]
    : [];

const WARN = 'text-money';

/**
 * What sessions read, by price: the counts — `read 21.4M · wrote 412k · peak 167k` — and, beneath, a resumed session that wrote its
 * context to the cache again. The peak is marked where it reached the step's `context:` cap or passed 200k with none, and so is the
 * rebuild: each is a session that paid for a context it need not have carried, or carried again. The words are the package's (`readWords`).
 * Where no peak was measured, the compactions (`compacted at its 200k cap`) stand in its place among the counts.
 */
export function Read({ said, peak, rebuilt }: { said: string; peak: PeakMark; rebuilt: number }) {
  const parts = said.split(' · ');
  const counts = parts.filter((part) => /^(read|wrote|peak|compacted)\b/.test(part));
  const rest = parts.filter((part) => !counts.includes(part));
  return (
    <span data-read className="block">
      {counts.length > 0 && (
        <span className="font-mono text-body-small">
          {counts.map((part, i) => (
            <span key={part}>
              {i > 0 && ' · '}
              {/^(peak|compacted)\b/.test(part) && peak ? (
                <span data-peak={peak} className={`font-semibold ${WARN}`} title={PEAK_TITLE[peak]}>
                  {part}
                </span>
              ) : (
                part
              )}
            </span>
          ))}
        </span>
      )}
      {rebuilt > 0 &&
        rest.map((part) => (
          <span key={part} data-rebuilt={rebuilt} className={`block text-body-small ${WARN}`} title={REBUILT_TITLE}>
            {part}
          </span>
        ))}
    </span>
  );
}

const PEAK_TITLE: Record<Exclude<PeakMark, null>, string> = {
  cap: "It reached the step's context: cap: Claude Code compacted the conversation, a summary in place of what it read, or was about to.",
  large: 'Its context passed 200k tokens on a step with no context: cap. Every response reads all of it.',
};
const REBUILT_TITLE =
  'A resumed session should read its context from the cache. It wrote it again instead, at twenty times the price of a read: the cache was rebuilt.';

/**
 * The command a step is judged by, and once it failed its check, what it exited with and the last lines of
 * each stream: its output first, where a test runner says what failed, then its stderr.
 */
export function Check({ check: { command, refused } }: { check: StepCheck }) {
  return (
    <section aria-label="Check" className="space-y-2">
      <h3 className="text-label-medium text-muted-foreground">Check</h3>
      <Facts
        rows={[
          ['command', code(command)],
          ...(refused
            ? [
                [
                  'refused',
                  <span key="refused" className="font-mono text-body-small font-semibold text-failure">
                    {refused.exit}
                  </span>,
                ] as [string, ReactNode],
              ]
            : []),
        ]}
      />
      {refused?.unreadable && <p className="text-body-small text-failure">{refused.unreadable}</p>}
      {refused?.stdout && <Stream name="output" log={refused.stdout} />}
      {refused && refused.stderr.lines.length > 0 && <Stream name="stderr" log={refused.stderr} />}
    </section>
  );
}

/** One of a refused check's streams, as the api cut it: its last lines, and whether there were more. */
function Stream({ name, log }: { name: string; log: StepLog }) {
  if (!log.lines.length) return <p className="text-body-small text-muted-foreground">No {name}.</p>;
  return (
    <div className="space-y-1">
      <p className="text-body-small text-muted-foreground">
        {log.truncated ? `The last ${log.lines.length} lines of its ${name}` : `Its ${name}`}
      </p>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 font-mono text-body-small leading-snug">
        {log.lines.join('\n')}
      </pre>
    </div>
  );
}

/** An ISO instant as a `Facts` value: the page's words, whole on hover (`Instant`). */
export const when = (iso: string) => <Instant at={iso} />;
