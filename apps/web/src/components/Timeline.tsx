import type { ReactNode } from 'react';
import type { RunDetail, StepTimelineTry, TaskSpan, TimelineTotal } from '../lib/api';
import { spentTitle } from '../lib/cost';

/**
 * Where a run's time went, as the CLI's `decide` prints it: a row for each try's session and each try's check of every step, in the order
 * the run keeps its steps — when it was filed, spawned and ended, how long it queued for a slot and ran, what its session used and what it
 * cost — then each round's total when its loop went round, named by its looping step where more than one loop did, and the run's, each with
 * what its sessions cost. The words are the api's, which are the package's; the times are the engine's instants, shown in this browser's
 * clock. Nothing is drawn for a run with nothing filed.
 */
export function Timeline({ run }: { run: RunDetail }) {
  const steps = run.steps.filter((step) => step.timeline.length > 0);
  if (!steps.length) return null;
  const { rounds } = run.timeline;
  const went = [...new Set(rounds.map((r) => r.loop))].filter((loop) => rounds.filter((r) => r.loop === loop).length > 1);
  const totals = [...rounds.filter((r) => went.includes(r.loop)), run.timeline.run];

  return (
    <section aria-label="Timeline" className="space-y-2">
      <h2 className="text-sm font-medium">Timeline</h2>
      <p className="text-xs text-muted-foreground">
        Queued is filed → spawned: the wait for a slot. Ran is spawned → ended. A total sums its tasks, so steps side by side add up to more
        than its wall, first filed → last ended. A round's counts only the steps its loop files again. Cost is what the harness priced each
        session at, once it ended; a check costs nothing.
      </p>
      <div className="overflow-x-auto rounded border border-outline-variant">
        <table className="w-full text-left text-xs tabular-nums">
          <thead className="bg-surface-container text-muted-foreground">
            <tr>
              {['step', 'try', 'filed', 'spawned', 'ended', 'queued', 'ran', 'cost', 'used'].map((heading) => (
                <th key={heading} scope="col" className="px-2 py-1.5 font-medium whitespace-nowrap">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {steps.flatMap((step) =>
              step.timeline.flatMap((t) => [
                <TryRow key={`${step.name}/${t.try}`} step={step.name} t={t} />,
                ...(t.check
                  ? [
                      <SpanRow
                        key={`${step.name}/${t.try}/check`}
                        step={step.name}
                        label={`try ${t.try} check`}
                        task="check"
                        span={t.check}
                        used={null}
                        cost={null}
                      />,
                    ]
                  : []),
              ]),
            )}
          </tbody>
          <tfoot className="border-t border-outline-variant bg-surface-container">
            {totals.map((total) => (
              <TotalRow key={`${total.loop}:${total.round}`} total={total} named={went.length > 1} />
            ))}
          </tfoot>
        </table>
      </div>
    </section>
  );
}

const CELL = 'px-2 py-1 whitespace-nowrap';

/** A try's label, as the CLI's `decide` prints it: `try 2 · round 2` past the first round. */
const tryLabel = (t: StepTimelineTry) => `try ${t.try}${t.round > 1 ? ` · round ${t.round}` : ''}`;

function TryRow({ step, t }: { step: string; t: StepTimelineTry }) {
  if (t.session)
    return (
      <SpanRow step={step} label={tryLabel(t)} task="session" span={t.session} used={t.used?.used ?? null} cost={t.used?.cost ?? null} />
    );
  return (
    <tr data-step={step} data-try={t.try} data-task="session" data-at="rechecked">
      <td className={`${CELL} font-medium`}>{step}</td>
      <td className={`${CELL} font-mono`}>{tryLabel(t)}</td>
      <td colSpan={7} className={`${CELL} text-muted-foreground`}>
        its session is try {t.sessionOf}'s, checked again
      </td>
    </tr>
  );
}

/**
 * A task's row: its instants and times, and for a session what it used and what it cost, in the CLI `decide`'s words — `not measured`,
 * never $0. The cost comes before what it used, which runs long, so a cost is in view without scrolling the table.
 */
function SpanRow({
  step,
  label,
  task,
  span,
  used,
  cost,
}: {
  step: string;
  label: string;
  task: 'session' | 'check';
  span: TaskSpan;
  used: string | null;
  cost: string | null;
}) {
  const lost = span.at === 'unknown';
  return (
    <tr data-step={step} data-task={task} data-at={span.at} className={task === 'check' ? 'text-muted-foreground' : undefined}>
      <td className={`${CELL} font-medium`}>{task === 'session' ? step : ''}</td>
      <td className={`${CELL} font-mono`}>{label}</td>
      {lost ? (
        <td colSpan={7} data-cell="lost" className={`${CELL} text-muted-foreground`}>
          the engine has no record of {span.taskId}
        </td>
      ) : (
        <>
          <td className={CELL}>{instant(span.filedAt, 'not known')}</td>
          <td className={CELL}>{instant(span.spawnedAt, span.at === 'queued' || span.at === 'starting' ? 'not yet' : '—')}</td>
          <td className={CELL}>{instant(span.endedAt, span.at === 'running' ? 'no end yet' : '—')}</td>
          <td data-cell="queued" className={`${CELL} font-mono`}>
            {span.queued}
          </td>
          <td data-cell="ran" className={`${CELL} font-mono ${span.at === 'running' ? 'text-alive' : ''}`}>
            {span.ran}
          </td>
          <td data-cell="cost" className={`${CELL} font-mono ${cost === 'not measured' ? 'text-muted-foreground' : ''}`}>
            {cost ?? ''}
          </td>
          <td data-cell="used" className={`${CELL} font-mono text-muted-foreground`}>
            {used ?? ''}
          </td>
        </>
      )}
    </tr>
  );
}

/**
 * A total's row: the run's, or a round's — named by its loop's looping step when `named`, as when two loops went round — and what its
 * sessions cost.
 */
function TotalRow({ total, named }: { total: TimelineTotal; named: boolean }) {
  const what = total.round === null ? "the run's tries" : `round ${total.round}'s sessions`;
  return (
    <tr data-total={total.round === null ? 'run' : `round-${total.round}`} data-loop={total.loop ?? undefined} className="font-medium">
      <td colSpan={2} className={CELL}>
        {total.round === null ? 'run' : `${named ? `${total.loop} ` : ''}round ${total.round}`}
      </td>
      <td colSpan={3} data-cell="wall" className={`${CELL} font-mono`}>
        wall {total.wall}
      </td>
      <td data-cell="queued" className={`${CELL} font-mono`}>
        {total.queued}
      </td>
      <td data-cell="ran" className={`${CELL} font-mono`}>
        {total.ran}
      </td>
      {total.cost ? (
        <td data-cell="cost" title={spentTitle(total.cost, what)} className={`${CELL} font-mono`}>
          {total.cost.said}
        </td>
      ) : (
        <td data-cell="cost" className={`${CELL} font-mono text-muted-foreground`}>
          not measured
        </td>
      )}
      {/* oxlint-disable-next-line jsx-a11y/control-has-associated-label -- the run's row has no `used` of its own: an empty cell */}
      <td className={CELL} />
    </tr>
  );
}

/** An instant the engine wrote down, in this browser's clock, whole on hover; `none` where there is none. */
function instant(at: string | null, none: string): ReactNode {
  if (at === null) return <span className="text-muted-foreground">{none}</span>;
  const date = new Date(at);
  return (
    <time dateTime={at} title={date.toLocaleString()} className="font-mono">
      {date.toLocaleTimeString()}
    </time>
  );
}
