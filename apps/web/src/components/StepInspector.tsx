import { lazy, Suspense, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import type { RunDetail, StepTry } from '../lib/api';
import { duration, isLive } from '../lib/canvas';
import { isGate, stepState, type StepState } from '../lib/status';
import { gateOfStep } from '../lib/gate';
import { foldTranscript, sessionToRead } from '../lib/transcript';
import { useStepTranscript } from '../lib/useStepTranscript';
import { cn } from '../lib/utils';
import { Rounds, TryCloseouts, tryLabel } from './Closeout';
import { Check, code, Facts, readRows, specRows, spentRows, when } from './Facts';
import { StepPageLink } from './StepParts';
import { Told } from './Told';
import { Asked } from './GateBrief';

/**
 * A step's talk, loaded when the Activity tab is first opened: the family's talk and the step's own parts are not needed to read the
 * canvas.
 */
const SessionTalk = lazy(() => import('./session/SessionTalk').then((m) => ({ default: m.SessionTalk })));
import { StatusChip, StepNote } from './StatusChip';

type Step = RunDetail['steps'][number];

const TABS = ['Details', 'Output', 'Activity'] as const;
type Tab = (typeof TABS)[number];

/**
 * The tab a step's tabs (`StepTabs`) open on for a step nobody has picked a tab for: Output once the step has a closeout — it signed off,
 * at its gate, blocked or done — since what it handed on is what there is to read, and at a gate what a person approves; Details before
 * that.
 */
export const openingTab = (step: Pick<Step, 'closeout'>): Tab => (step.closeout ? 'Output' : 'Details');

/**
 * What is going on in one step, in three tabs. It opens on the step's `openingTab`, and a tab a person picks is kept while it stays
 * mounted, whichever step it is handed next. A try a Rounds row selects is kept with its step, and another step shows its current try.
 *
 * Opened on Output at a gate, it says first that the answer is on Details, so the plan read is not a dead end. The Activity tab is keyed by
 * run and step, so a conversation never stands in for another step's while that one is read. `className` places it in what holds it.
 */
export function StepTabs({ run, step, className }: { run: RunDetail; step: Step; className?: string }) {
  const [picked, setTab] = useState<Tab | null>(null);
  const tab = picked ?? openingTab(step);
  const [chosen, setChosen] = useState<{ step: string; try: number } | null>(null);
  const runCancelled = run.cancelledAt !== null;
  const state = stepState(step.status, runCancelled, run.holding != null);
  const current = step.tries.find((t) => t.current) ?? step.tries.at(-1)!;
  const selected = (chosen?.step === step.name && step.tries.find((t) => t.try === chosen.try)) || current;
  const select = (n: number) => {
    setChosen({ step: step.name, try: n });
    setTab('Output');
  };

  return (
    <div className={cn('flex flex-col', className)}>
      <div role="tablist" className="flex gap-1 border-b border-outline-variant px-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-2 py-1.5 text-body-small ${
              tab === t ? 'border-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div role="tabpanel" className={`min-h-0 flex-1 p-3 ${tab === 'Activity' ? 'flex flex-col gap-2' : 'space-y-4 overflow-auto'}`}>
        {tab === 'Details' && (
          <Details
            run={run}
            step={step}
            state={state}
            runCancelled={runCancelled}
            current={current}
            selected={selected}
            onSelect={select}
          />
        )}
        {tab === 'Output' && (
          <>
            {gateOfStep(run, step) && (
              <p data-answer-at="Details" className="text-body-small text-yours">
                {step.name} waits at its gate on you: read what it handed on, then{' '}
                <button type="button" onClick={() => setTab('Details')} className="font-medium underline underline-offset-2">
                  approve it or send it back
                </button>
                .
              </p>
            )}
            <Output step={step} state={state} selected={selected} />
          </>
        )}
        {tab === 'Activity' && <Activity key={`${run.id}/${step.name}`} run={run} step={step} />}
      </div>
    </div>
  );
}

type DetailsProps = {
  run: RunDetail;
  step: Step;
  state: StepState;
  runCancelled: boolean;
  current: StepTry;
  selected: StepTry;
  onSelect: (n: number) => void;
};

/**
 * The Details tab: what the run asks of you here first (`Asked`), above the step's own state, which is the reason it waits and not what to
 * do about it; then its facts, its tries, its check, its spec and what it was told. A step not filed has run nothing, so in place of a row
 * of dashes it says so once, above its spec.
 *
 * Its facts: the try the attempts are of, once there is more than one, since each round and each try within one is a task of its own; how
 * long the latest attempt took, only where its end is on the record; what its current try consumed, in the CLI `decide`'s words — `not
 * measured` where nobody counted, never 0; what its sessions read (`readRows`); and what every try has cost together (`spentRows`).
 */
function Details({ run, step, state, runCancelled, current, selected, onSelect }: DetailsProps) {
  const { spec, attempts, tries } = step;
  const latest = attempts.latest;
  const gated = Boolean(step.approve) && !runCancelled;

  return (
    <>
      <Asked run={run} step={step} />
      <div className="space-y-1">
        <StatusChip status={step.status} runCancelled={runCancelled} runHeld={run.holding != null} />
        <StepNote note={step.note} />
      </div>
      {step.taskId === null ? (
        <p data-unfiled className="text-muted-foreground">
          {gated ? 'not filed yet: it waits at its gate' : 'not filed yet'}
        </p>
      ) : (
        <Facts
          rows={[
            ...(tries.length > 1 ? ([['try', tryLabel(current, tries)]] satisfies Array<[string, string]>) : []),
            ['attempts', attempts.count],
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
            ['latest took', latest?.endedAt ? duration(Date.parse(latest.endedAt) - Date.parse(latest.startedAt)) : null],
            ['used', step.used?.used],
            ['cost', step.used?.cost],
            ...readRows(step.used),
            ...spentRows(step),
            ['branch', code(step.branch)],
            ['task', code(step.taskId)],
          ]}
        />
      )}
      {tries.length > 1 && <Rounds tries={tries} selected={selected.try} onSelect={onSelect} />}
      {step.check && <Check check={step.check} />}
      {spec ? (
        <section className="space-y-1">
          <h3 className="text-label-medium text-muted-foreground">Spec</h3>
          <Facts rows={specRows(spec, step.filed)} />
        </section>
      ) : (
        <p className="text-muted-foreground">
          No spec: the workflow the run is judged by does not have this step — the one it froze as it started, or on a record from before
          runs froze one, its folder.
        </p>
      )}
      <Told told={step.told} layers={step.layers} parts={step.taskParts} filed={step.taskId !== null} />
      <StepPageLink page={run.workflowPage} step={step.name} />
    </>
  );
}

/** When an attempt ended, if the record says, and how. */
function Ended({ at, how }: { at: string | null; how: string }) {
  return (
    <>
      {at && <span className="block">{when(at)}</span>}
      {code(how)}
    </>
  );
}

/**
 * The selected try's closeout, and every other try's folded beneath it. Of a try with no closeout, the current try's is said in the step's
 * own words, an earlier one's off the engine's record.
 */
function Output({ step, state, selected }: { step: Step; state: StepState; selected: StepTry }) {
  const none = !selected.current
    ? "No closeout on the engine's record of this try."
    : step.status.endsWith('closeout unreadable')
      ? 'It gave a closeout that could not be read.'
      : isLive(state) || state === 'waiting' || state === 'waiting-for-slot'
        ? 'No closeout yet: the step has not signed off.'
        : 'No closeout: the step ended without one.';
  return <TryCloseouts tries={step.tries} selected={selected} none={none} />;
}

/** How many of the conversation's last turns the tab draws: its tail, with the whole of it a click away. */
const ACTIVITY_TURNS = 30;

/**
 * The tail of the step's conversation — the session page's, read and followed the same way — and the way to the whole of it. It is followed
 * until the step waits on a person's word, its session over, and never stops for `held`: a hold on the run (the CLI's `hold`) answers
 * nothing, and the session runs or rests as it did.
 */
function Activity({ run, step }: { run: RunDetail; step: Step }) {
  const cancelled = run.cancelledAt !== null;
  const following = useStepTranscript(run.id, step.name, sessionToRead(step), isGate(stepState(step.status, cancelled, false), cancelled));
  const turns = useMemo(() => foldTranscript(following.events), [following.events]);
  const tail = turns.slice(-ACTIVITY_TURNS);

  if (!step.taskId) return <p className="text-muted-foreground">Not filed yet, so there is no conversation.</p>;
  if (!sessionToRead(step)) return <p className="text-muted-foreground">No session of it has started, so there is no conversation yet.</p>;

  return (
    <>
      <div className="flex items-baseline justify-between gap-2 text-body-small text-muted-foreground">
        <p>
          {following.loading ? 'Reading its conversation…' : following.live ? 'Followed as it runs.' : 'Not running, so not followed.'}
          {tail.length < turns.length && ` The last ${tail.length} of ${turns.length}.`}
        </p>
        <Link
          to="/runs/$runId/steps/$step"
          params={{ runId: run.id, step: step.name }}
          className="shrink-0 font-medium text-foreground underline-offset-2 hover:underline"
        >
          Open the session
        </Link>
      </div>
      {following.error && <p className="text-body-small text-failure">{following.error}</p>}
      {!following.loading &&
        (tail.length ? (
          <Suspense fallback={<p className="text-muted-foreground">Reading its conversation…</p>}>
            <SessionTalk who={step.name} turns={tail} live={following.live} density="compact" />
          </Suspense>
        ) : (
          !following.error && (
            <p className="text-muted-foreground">
              {following.live ? 'Nothing said yet.' : 'Its session said nothing the engine can read.'}
            </p>
          )
        ))}
    </>
  );
}
