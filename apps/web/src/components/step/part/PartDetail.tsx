/**
 * The detail of a step, folded, of the try its part shows: that try — its round and how it was reached, its task, its sessions, its
 * check's verdict and how it ended — then the step's facts (its sessions, what it used and cost, where it worked), its check, its gate's
 * approval, its spec, how it was told, its time on the clock, and its Debug (the lifecycle path), which opens the full-width sheet. Machine
 * detail one fold down, never gone.
 */
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { factoriesQuery } from '@/lib/api/factories';
import { untrustedFor, type UntrustedPlace } from '@/lib/factories';
import { ink } from '@/lib/meaning';
import { durationWords } from '@/lib/duration';
import { isLive } from '@/lib/canvas';
import { outcomeOf } from '@/lib/outcome';
import { ranOnWords } from '@/lib/ranOn';
import type { RunDetail, StepView } from '@/lib/runView';
import { stepState } from '@/lib/status';
import type { StepPartModel } from '@/lib/stepPart';
import { Approved, endsTheRun, gateWord } from '../../gate/Gate';
import { Artifacts, AsItCame, attemptsWord, CheckVerdictWords, tryLabel } from '../Closeout';
import { DebugPanel } from '../DebugPanel';
import { Check, code, Facts, pathRow, readRows, specRows, spentRows, unreadRows, when } from '../Facts';
import { OutcomeHead } from '../Outcome';
import { StepNote } from '../StatusChip';
import { StepPageLink } from '../StepParts';
import { StepBody, Told } from '../Told';
import { Fold } from './Fold';

/** The detail, as its part's model has it. */
type Detail = Exclude<StepPartModel['detail'], 'none'>;

/** The try shown: its round and number, its task, its sessions, its check's verdict, the answer it was asked with, and how it ended. */
function ShownTry({ step }: { step: StepView }) {
  const shown = step.tries.find((t) => t.try === step.shown);
  if (!shown) return null;
  const outcome = outcomeOf(shown, step.taskId === null ? 'Not filed yet.' : 'No closeout yet.');
  return (
    <section aria-label="The try shown" data-shown-try={shown.try} className="space-y-1 text-body-small">
      <p className="font-medium" title={shown.note ?? undefined}>
        {tryLabel(shown, step.tries)}
        {shown.current && <span className="font-normal text-on-surface-variant"> · current</span>}
      </p>
      <p className="font-mono break-all text-on-surface-variant">{shown.taskId ?? 'not filed'}</p>
      <p className="flex flex-wrap gap-x-3">
        <span data-attempts>{attemptsWord(shown.attempts)}</span>
        {shown.check && <CheckVerdictWords verdict={shown.check.verdict} />}
      </p>
      <OutcomeHead outcome={outcome} />
      {shown.closeout && <AsItCame raw={shown.closeout.raw} />}
    </section>
  );
}

/** When the latest session ended, if the record says, and how. */
function Ended({ at, how }: { at: string | null; how: string }) {
  return (
    <>
      {at && <span className="block">{when(at)}</span>}
      {code(how)}
    </>
  );
}

/**
 * What the harness denied a step's try, every call as a permission rule names it: `Skill(look), Bash(pytest)`; and under it, where
 * the run works on a place a harness does not trust (`cause`), that this is the likely cause, in the api's words, with the line that
 * trusts it.
 */
const deniedRow = (calls: readonly string[], cause: UntrustedPlace | undefined): ReactNode => (
  <span className="flex min-w-0 flex-col gap-1">
    <span data-denied className={`font-mono text-body-small ${ink.yours}`}>
      {calls.join(', ')}
    </span>
    {cause && (
      <span data-denied-cause={cause.factory} className="text-body-small text-muted-foreground">
        Likely cause: <span className="font-mono break-all">{cause.place.place}</span> is not trusted for {cause.place.harness}, which
        withholds {cause.place.withheld}.{' '}
        {cause.place.never ?? (
          <>
            Trust it: <code className="font-mono whitespace-nowrap text-foreground">{cause.trust}</code>
          </>
        )}
      </span>
    )}
  </span>
);

/**
 * The place the run `run` works on that a harness does not trust, read off the factories' answer only where a step of it was denied a
 * call (`asked`): nothing while that is read, and nothing where every place is trusted.
 */
function useDeniedCause(run: RunDetail, asked: boolean): UntrustedPlace | undefined {
  const { data } = useQuery({ ...factoriesQuery, enabled: asked });
  return asked && data ? untrustedFor(data, { repo: run.repo }) : undefined;
}

/**
 * A folder step's files: what it left in its folder, which is the whole of what it made — the files its closeout named and the ones it
 * forgot to, each with its size — so *the folder is empty* is said of an empty folder and of nothing else. A folder the api could not
 * read says so instead, where an empty list would say the step made nothing when nobody could look.
 */
function FolderFiles({ step }: { step: StepView }) {
  return (
    <div aria-label="Files" data-files className="text-body-small text-muted-foreground">
      {step.filesError === null ? (
        <>
          Files in its folder:
          <Artifacts artifacts={step.files} step={step.name} size none="the folder is empty" />
        </>
      ) : (
        <span data-files-error>{step.filesError}</span>
      )}
    </div>
  );
}

/**
 * The step's facts: its sessions, when the latest began and ended and how long it took, what it ran on, what its current try used and
 * cost, what its sessions read, what every try cost together, where it worked, its task and its gate.
 */
function StepFacts({ run, step }: { run: RunDetail; step: StepView }) {
  const cause = useDeniedCause(run, Boolean(step.denied));
  if (step.taskId === null)
    return (
      <>
        <p data-unfiled className="text-body-small text-on-surface-variant">
          {step.approve && run.cancelledAt === null ? 'not filed yet: it waits at its gate' : 'not filed yet'}
        </p>
        {step.gate && <Facts rows={[['gate', gateWord(step.gate, endsTheRun(step))]]} />}
      </>
    );
  const latest = step.attempts.latest;
  const state = stepState(step, run.cancelledAt !== null, run.holding != null);
  const rows: Array<[string, ReactNode]> = [
    ['sessions', step.attempts.count],
    ['latest began', latest && when(latest.startedAt)],
    [
      'latest ended',
      latest &&
        (latest.ended ? (
          <Ended key="latest ended" at={latest.endedAt} how={`${latest.ended} · ${latest.reason ?? 'no reason given'}`} />
        ) : isLive(state) ? (
          'still running'
        ) : null),
    ],
    ['latest took', latest?.endedAt ? durationWords(Date.parse(latest.endedAt) - Date.parse(latest.startedAt), 'second') : null],
    ['ran on', ranOnWords(latest)],
    ['used', step.used?.used],
    ['cost', step.used?.cost],
    ...readRows(step.used),
    ...spentRows(step),
    run.place === 'folder' ? ['folder', pathRow(step.workspace)] : ['branch', code(step.branch)],
    ['task', code(step.taskId)],
    ...(step.gate ? ([['gate', gateWord(step.gate, endsTheRun(step))]] satisfies Array<[string, string]>) : []),
    ...(step.denied ? ([['denied', deniedRow(step.denied.calls, cause)]] satisfies Array<[string, ReactNode]>) : []),
    ...unreadRows(step.sessionUnread),
  ];
  return <Facts rows={rows} />;
}

/** The step's tries on the clock: each try's session and check, when each was spawned and how long it queued and ran. */
function StepTimeline({ step }: { step: StepView }) {
  if (step.timeline.length === 0) return <p className="text-body-small text-on-surface-variant">Nothing of it on the clock yet.</p>;
  return (
    <ol aria-label="Its time" className="space-y-1 font-mono text-body-small">
      {step.timeline.map((t) => (
        <li key={t.try} data-timeline-try={t.try} className="flex flex-wrap gap-x-3">
          <span>
            round {t.round} · try {t.try}
          </span>
          {t.session && (
            <span>
              session: queued {t.session.queued}, ran {t.session.ran}
              {t.session.spawnedAt && <> · {when(t.session.spawnedAt)}</>}
            </span>
          )}
          {t.check && (
            <span>
              check: queued {t.check.queued}, ran {t.check.ran}
            </span>
          )}
          {t.used && <span>{t.used.used}</span>}
        </li>
      ))}
    </ol>
  );
}

/** The step's detail, folded unless `open`, its folds within it too: what `PartDetail` says, of the try its part shows (`detail.shown`). */
export function PartDetail({ run, step, detail, open = false }: { run: RunDetail; step: StepView; detail: Detail; open?: boolean }) {
  const ends = endsTheRun(step);
  return (
    <section data-part-detail aria-label="Its detail" className="min-w-0 border-t border-outline-variant pt-2">
      <Fold name="detail" title="Detail" open={open}>
        <StepNote note={step.note} />
        <ShownTry step={step} />
        <StepFacts run={run} step={step} />
        {run.place === 'folder' && step.taskId !== null && <FolderFiles step={step} />}
        {step.check && <Check check={step.check} />}
        {step.gate?.approval && <Approved step={step.name} approval={step.gate.approval} ends={ends} budgets={step.gate.budgets} />}
        <Fold name="spec" title="Its spec" open={open}>
          {detail.spec ? (
            <Facts rows={specRows(detail.spec, step.filed)} />
          ) : (
            <p className="text-body-small text-on-surface-variant">
              No spec: the workflow the run is judged by does not have this step — the one it froze as it started, or on a record from
              before runs froze one, its folder.
            </p>
          )}
        </Fold>
        <StepBody body={detail.body} layers={detail.layers} />
        <Told told={detail.told} layers={detail.layers} parts={detail.task} filed={step.taskId !== null} />
        <Fold name="timeline" title="Its time" open={open}>
          <StepTimeline step={step} />
        </Fold>
        <StepPageLink page={run.workflowPage} step={step.name} />
        <DebugPanel run={run} step={step} shown={detail.debug.try} />
      </Fold>
    </section>
  );
}
