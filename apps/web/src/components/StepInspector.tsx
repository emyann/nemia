import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import type { RunDetail, StepTry } from '../lib/api';
import { duration, isLive } from '../lib/canvas';
import { isGate, stepState, type StepState } from '../lib/status';
import { gateOfStep } from '../lib/gate';
import { foldTranscript } from '../lib/transcript';
import { useStepTranscript } from '../lib/useStepTranscript';
import { cn } from '../lib/utils';
import { Rounds, TryCloseouts, tryLabel } from './Closeout';
import { Check, code, Facts, readRows, specRows, spentRows, Told, when } from './Facts';
import { Asked } from './GateBrief';

/** A step's conversation, loaded when the Activity tab is first opened: the scroller and the tool views are not needed to read the canvas. */
const Conversation = lazy(() => import('./conversation/Conversation').then((m) => ({ default: m.Conversation })));
import { StatusChip, StepNote } from './StatusChip';

type Step = RunDetail['steps'][number];

const TABS = ['Details', 'Output', 'Activity'] as const;
type Tab = (typeof TABS)[number];

type Props = {
  run: RunDetail;
  step: Step;
  onClose: () => void;
  /** Which run the step is in, above its name: on the Factory, where the steps of several runs are drawn. */
  runTitle?: string;
  /** Classes over the panel's own, for where it sits: beside the run's canvas by default. */
  className?: string;
};

/**
 * The tab the inspector opens on for a step nobody has picked a tab for: Output once the step has a closeout — it signed off, at its gate,
 * blocked or done — since what it handed on is what there is to read, and at a gate what a person approves; Details before that.
 */
export const openingTab = (step: Pick<Step, 'closeout'>): Tab => (step.closeout ? 'Output' : 'Details');

/**
 * What is going on in one step, beside the canvas, for the node that was clicked. It opens on the step's `openingTab`, and a tab a
 * person picks is kept while the panel stays open, whichever step they click next. A try a Rounds row selects is kept with its step: the
 * panel stays mounted as another step is clicked, and that one's current try is shown.
 *
 * Opened on Output at a gate, it says first that the answer is on Details, so the plan read is not a dead end. The Activity tab is keyed by
 * run and step, so a conversation never stands in for another step's while that one is read.
 */
export function StepInspector({ run, step, onClose, runTitle, className }: Props) {
  const [picked, setTab] = useState<Tab | null>(null);
  const tab = picked ?? openingTab(step);
  const [chosen, setChosen] = useState<{ step: string; try: number } | null>(null);
  const runCancelled = run.cancelledAt !== null;
  const runHeld = run.holding != null;
  const state = stepState(step.status, runCancelled, runHeld);
  const current = step.tries.find((t) => t.current) ?? step.tries.at(-1)!;
  const selected = (chosen?.step === step.name && step.tries.find((t) => t.try === chosen.try)) || current;
  const select = (n: number) => {
    setChosen({ step: step.name, try: n });
    setTab('Output');
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside
      aria-label={`Step ${step.name}`}
      className={cn(
        'flex h-[30rem] min-h-0 flex-col rounded border border-neutral-200 bg-white text-sm md:w-80 md:shrink-0 dark:border-neutral-800 dark:bg-neutral-900',
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">step inspector</p>
          {runTitle && (
            <p className="truncate text-xs text-neutral-500" title={runTitle}>
              {runTitle}
            </p>
          )}
          <h2 className="truncate font-semibold" title={step.name}>
            {step.name}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the step's panel"
          className="rounded px-1.5 text-lg leading-none text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
        >
          ×
        </button>
      </header>

      <div role="tablist" className="flex gap-1 border-b border-neutral-200 px-2 dark:border-neutral-800">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-2 py-1.5 text-xs ${
              tab === t
                ? 'border-neutral-900 font-medium dark:border-neutral-100'
                : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
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
              <p data-answer-at="Details" className="text-xs text-amber-800 dark:text-amber-300">
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
    </aside>
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
 * The Details tab: what the run asks of you here first (`Asked`), above the step's own state, which is the reason it waits and not what to do
 * about it; then its facts, its tries, its check, its spec and what it was told. A step not filed has run nothing, so in place of a row of
 * dashes it says so once, above its spec.
 *
 * Its facts: the try the attempts are of, once there is more than one, since each round and each try within one is a task of its own; how
 * long the latest attempt took, only where its end is on the record; what its current try consumed, in `wf decide`'s words — `not measured`
 * where nobody counted, never 0; what its sessions read (`readRows`); and what every try has cost together (`spentRows`).
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
        <p data-unfiled className="text-neutral-500">
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
          <h3 className="text-xs font-medium text-neutral-500">Spec</h3>
          <Facts rows={specRows(spec, step.filed)} />
        </section>
      ) : (
        <p className="text-neutral-500">
          No spec: the workflow the run is judged by does not have this step — the one it froze at <code>wf start</code>, or on a record
          from before runs froze one, its folder.
        </p>
      )}
      {step.told && <Told told={step.told} filed={step.taskId !== null} />}
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
 * until the step waits on a person's word, its session over, and never stops for `held`: a hold on the run (`wf hold`) answers nothing, and
 * the session runs or rests as it did.
 */
function Activity({ run, step }: { run: RunDetail; step: Step }) {
  const cancelled = run.cancelledAt !== null;
  const following = useStepTranscript(run.id, step.name, step.taskId, isGate(stepState(step.status, cancelled, false), cancelled));
  const turns = useMemo(() => foldTranscript(following.events), [following.events]);
  const tail = turns.slice(-ACTIVITY_TURNS);

  if (!step.taskId) return <p className="text-neutral-500">Not filed yet, so there is no conversation.</p>;

  return (
    <>
      <div className="flex items-baseline justify-between gap-2 text-xs text-neutral-500">
        <p>
          {following.loading ? 'Reading its conversation…' : following.live ? 'Followed as it runs.' : 'Not running, so not followed.'}
          {tail.length < turns.length && ` The last ${tail.length} of ${turns.length}.`}
        </p>
        <Link
          to="/runs/$runId/steps/$step"
          params={{ runId: run.id, step: step.name }}
          className="shrink-0 font-medium text-neutral-900 underline-offset-2 hover:underline dark:text-neutral-100"
        >
          Open the session
        </Link>
      </div>
      {following.error && <p className="text-xs text-red-600">{following.error}</p>}
      {!following.loading &&
        (tail.length ? (
          <Suspense fallback={<p className="text-neutral-500">Reading its conversation…</p>}>
            <Conversation turns={tail} live={following.live} density="compact" className="min-h-0 flex-1" />
          </Suspense>
        ) : (
          !following.error && (
            <p className="text-neutral-500">{following.live ? 'Nothing said yet.' : 'Its session said nothing the engine can read.'}</p>
          )
        ))}
    </>
  );
}
