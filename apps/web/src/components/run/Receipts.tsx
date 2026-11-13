/**
 * A run's receipts, at the foot of its page, each folded and closed at first: where its time went (`Timeline`), each step's check, each
 * step's spec, what its sessions read and spent, and where it ran — the machine's detail of the run, one fold down and never gone.
 */
import type { ReactNode } from 'react';
import { spentTitle } from '@/lib/cost';
import { durationWords } from '@/lib/duration';
import { waitedMs } from '@/lib/factory';
import type { RunDetail } from '@/lib/runView';
import { ENDED } from '@/lib/words';
import { bytesWord } from './Artifacts';
import { Check, code, Facts, pathRow, Read, readRows, specRows, spentRows, when } from '../step/Facts';
import { Fold } from '../step/part/Fold';
import { Timeline } from './Timeline';
import { StartedFrom } from './TryTag';

/** The folds of the receipts, in the page's order. */
export const RECEIPTS = ['timeline', 'checks', 'specs', 'tokens', 'where'] as const;

/** What a receipt says where the run has nothing of it. */
function Nothing({ children }: { children: ReactNode }) {
  return <p className="text-body-small text-on-surface-variant">{children}</p>;
}

/** A step's name over what a receipt says of it. */
function OfStep({ name, mark, children }: { name: string; mark: string; children: ReactNode }) {
  return (
    <div data-receipt={mark} data-step={name} className="space-y-1">
      <h3 className="font-mono text-body-small text-on-surface-variant">{name}</h3>
      {children}
    </div>
  );
}

/** Each step's check: the command the run judges it by, and what refused it where one did. */
function Checks({ run }: { run: RunDetail }) {
  const checked = run.steps.filter((s) => s.check);
  if (!checked.length) return <Nothing>No step of it has a check.</Nothing>;
  return checked.map((s) => (
    <OfStep key={s.name} name={s.name} mark="check">
      {s.check && <Check check={s.check} />}
    </OfStep>
  ));
}

/** Each step's spec, as the run froze it, and what its filing took. */
function Specs({ run }: { run: RunDetail }) {
  const specified = run.steps.filter((s) => s.spec);
  if (!specified.length) return <Nothing>No spec: the run froze none.</Nothing>;
  return specified.map((s) => (
    <OfStep key={s.name} name={s.name} mark="spec">
      {s.spec && <Facts rows={specRows(s.spec, s.filed)} />}
    </OfStep>
  ));
}

/**
 * What the run's sessions read and spent: what it cost, every step's tries (`≥` where an ended attempt has none on it), what the same
 * sessions read, by price, where every one of them measured it, and its tokens; then each step's, as its current try used it.
 */
function Tokens({ run }: { run: RunDetail }) {
  const steps = run.steps.filter((s) => s.used || s.spent);
  return (
    <>
      <div className="space-y-1 text-body-medium">
        {run.cost && (
          <p data-run-spent title={spentTitle(run.cost, "the run's tries")}>
            <span className="text-on-surface-variant">cost </span>
            <span className="font-mono">{run.cost.said}</span>
          </p>
        )}
        {run.read && (
          <p
            data-run-read
            title="What every try of every step read: from the cache, written to it, and the largest context one response carried."
          >
            <Read said={run.read.said} peak={run.read.peak} rebuilt={run.read.rebuilt} />
          </p>
        )}
        {run.tokens && (
          <p data-run-tokens>
            <span className="font-mono">{run.tokens.said}</span> <span className="text-on-surface-variant">({run.tokens.split})</span>
          </p>
        )}
        {!run.cost && !run.read && !run.tokens && <Nothing>Nothing of it was measured yet.</Nothing>}
      </div>
      {steps.map((s) => (
        <OfStep key={s.name} name={s.name} mark="tokens">
          <Facts rows={[['used', s.used?.used], ['cost', s.used?.cost], ...readRows(s.used), ...spentRows(s)]} />
        </OfStep>
      ))}
    </>
  );
}

/**
 * When the CLI's `prune` removed a run's worktrees, how many and what they held, and what it kept — in the CLI `prune`'s words. And when
 * `--artifacts` removed its files, what that freed: the files then go from what is kept. One prune took both, or its files alone, or the
 * files went later than the worktrees, each at its own time.
 */
function Pruned({ pruned: { at, worktrees, artifacts } }: { pruned: NonNullable<RunDetail['pruned']> }) {
  const bytes = worktrees.reduce((sum, w) => sum + w.bytes, 0);
  const count = `${worktrees.length} worktree${worktrees.length === 1 ? '' : 's'}`;
  const title = [
    ...worktrees.map((w) => `${w.path}  ${bytesWord(w.bytes)}`),
    ...(artifacts ? [`its files  ${bytesWord(artifacts.bytes)}`] : []),
  ].join('\n');
  if (!artifacts) {
    return (
      <span data-pruned title={title}>
        {when(at)} — removed {count}, {bytesWord(bytes)} freed; its branches, record and files are kept
      </span>
    );
  }
  const files = `its files, ${bytesWord(artifacts.bytes)} freed; its branches and record are kept`;
  return (
    <span data-pruned data-files-pruned title={title}>
      {!worktrees.length ? (
        <>
          {when(artifacts.at)} — removed {files}
        </>
      ) : artifacts.at === at ? (
        <>
          {when(at)} — removed {count}, {bytesWord(bytes)} freed, and {files}
        </>
      ) : (
        <>
          {when(at)} — removed {count}, {bytesWord(bytes)} freed; {when(artifacts.at)} — removed {files}
        </>
      )}
    </span>
  );
}

/**
 * When the run started — its first step filed — and, where it waited before that, for how long: the wait the Factory's card does not count
 * as time at work (`runClock`). Not yet while nothing of it is filed, and never for a run called off first.
 */
function startedRow(run: RunDetail): ReactNode {
  if (run.startedAt === null) return run.cancelledAt ? 'never: called off first' : 'not yet';
  const waited = waitedMs(run) ?? 0;
  return (
    <span data-started>
      {when(run.startedAt)}
      {waited >= 1000 && `, after waiting ${durationWords(waited, 'second')}`}
    </span>
  );
}

/**
 * Where the run ran: a folder run has no repository, base or branch, and names where its work is instead, the one thing a person needs
 * to find what it made; when it was created and started, when it was called off, what a prune took, its workflow, and what it was
 * started from.
 */
function Where({ run }: { run: RunDetail }) {
  return (
    <>
      <Facts
        rows={[
          ...(run.place === 'folder'
            ? ([['work', pathRow(run.work)]] satisfies Array<[string, ReactNode]>)
            : ([
                ['repo', code(run.repo)],
                ['base', code(run.baseRef)],
                ['branch', code(run.branch)],
              ] satisfies Array<[string, ReactNode]>)),
          ['created', when(run.createdAt)],
          ['started', startedRow(run)],
          [ENDED.cancelled.word, run.cancelledAt && when(run.cancelledAt)],
          ...(run.pruned ? ([['pruned', <Pruned key="pruned" pruned={run.pruned} />]] satisfies Array<[string, ReactNode]>) : []),
          ['workflow', code(run.workflowDir)],
        ]}
      />
      <StartedFrom run={run} />
    </>
  );
}

/** The run's receipts, each a fold closed at first (`RECEIPTS`): drawn only once a person opens it. `open` opens every one. */
export function Receipts({ run, open = false }: { run: RunDetail; open?: boolean }) {
  return (
    <section aria-label="Receipts" data-receipts className="space-y-1 border-t border-outline-variant pt-4">
      <h2 className="text-label-large text-on-surface-variant">Receipts</h2>
      <Fold name="timeline" title="Timeline" open={open}>
        {run.steps.some((s) => s.timeline.length > 0) ? <Timeline run={run} /> : <Nothing>Nothing of it is on the clock yet.</Nothing>}
      </Fold>
      <Fold name="checks" title="Checks" open={open}>
        <Checks run={run} />
      </Fold>
      <Fold name="specs" title="Specs" open={open}>
        <Specs run={run} />
      </Fold>
      <Fold name="tokens" title="Tokens" open={open}>
        <Tokens run={run} />
      </Fold>
      <Fold name="where" title="Where it ran" open={open}>
        <Where run={run} />
      </Fold>
    </section>
  );
}
