import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import type { RunDetail } from '../lib/api';
import { duration, isLive } from '../lib/canvas';
import { stepState, type StepState } from '../lib/status';
import { foldTranscript } from '../lib/transcript';
import { useStepTranscript } from '../lib/useStepTranscript';
import { cn } from '../lib/utils';
import { Check, code, Facts, specRows, Told, when } from './Facts';

// Loaded when the Activity tab is first opened: markdown and the scroller weigh more than the canvas the inspector sits beside.
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

/** What is going on in one step, beside the canvas, for the node that was clicked. */
export function StepInspector({ run, step, onClose, runTitle, className }: Props) {
  const [tab, setTab] = useState<Tab>('Details');
  const runCancelled = run.cancelledAt !== null;
  const state = stepState(step.status, runCancelled);

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
        {tab === 'Details' && <Details step={step} state={state} runCancelled={runCancelled} />}
        {tab === 'Output' && <Output step={step} state={state} />}
        {/* Keyed by run and step, so a conversation never stands in for another step's while that one is read. */}
        {tab === 'Activity' && <Activity key={`${run.id}/${step.name}`} run={run} step={step} />}
      </div>
    </aside>
  );
}

function Details({ step, state, runCancelled }: { step: Step; state: StepState; runCancelled: boolean }) {
  const { spec, attempts } = step;
  const latest = attempts.latest;

  return (
    <>
      <div className="space-y-1">
        <StatusChip status={step.status} runCancelled={runCancelled} />
        <StepNote note={step.note} />
      </div>
      <Facts
        rows={[
          ['attempts', attempts.count],
          ['latest began', latest && when(latest.startedAt)],
          ['latest ended', latest && (latest.ended ? <Ended at={latest.endedAt} how={`${latest.ended} · ${latest.reason ?? 'no reason given'}`} /> : isLive(state) ? 'still running' : null)],
          // Only with an end on the record: one from before the engine kept it says how, and not when.
          ['latest took', latest?.endedAt ? duration(Date.parse(latest.endedAt) - Date.parse(latest.startedAt)) : null],
          ['branch', code(step.branch)],
          ['task', step.taskId ? code(step.taskId) : 'not filed'],
        ]}
      />
      {step.check && <Check check={step.check} />}
      {spec ? (
        <section className="space-y-1">
          <h3 className="text-xs font-medium text-neutral-500">Spec</h3>
          <Facts rows={specRows(spec)} />
        </section>
      ) : (
        <p className="text-neutral-500">
          No spec: the workflow the run is judged by does not have this step — the one it froze at <code>wf start</code>, or on
          a record from before runs froze one, its folder.
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

function Output({ step, state }: { step: Step; state: StepState }) {
  const { closeout } = step;
  if (!closeout) {
    const why = step.status.endsWith('closeout unreadable')
      ? 'It gave a closeout that could not be read.'
      : isLive(state) || state === 'waiting'
        ? 'No closeout yet: the step has not signed off.'
        : 'No closeout: the step ended without one.';
    return <p className="text-neutral-500">{why}</p>;
  }

  return (
    <>
      <p>
        <span className="text-neutral-500">outcome </span>
        <span className={closeout.outcome === 'blocked' ? 'font-semibold text-amber-700 dark:text-amber-400' : 'font-medium'}>
          {closeout.outcome}
        </span>
      </p>
      <p className="whitespace-pre-wrap">{closeout.summary}</p>
      {closeout.needs && (
        <p className="whitespace-pre-wrap text-amber-700 dark:text-amber-400">
          <span className="font-medium">Needs:</span> {closeout.needs}
        </p>
      )}
      <div>
        <p className="text-neutral-500">artifacts</p>
        {closeout.artifacts.length ? (
          <ul className="mt-1 space-y-0.5 font-mono text-xs">
            {closeout.artifacts.map((name) => (
              <li key={name} className="break-all">
                {name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-neutral-500">none named</p>
        )}
      </div>
    </>
  );
}

/** How many of the conversation's last turns the tab draws: its tail, with the whole of it a click away. */
const ACTIVITY_TURNS = 30;

/** The tail of the step's conversation — the session page's, read and followed the same way — and the way to the whole of it. */
function Activity({ run, step }: { run: RunDetail; step: Step }) {
  const following = useStepTranscript(run.id, step.name, step.taskId);
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
          !following.error && <p className="text-neutral-500">{following.live ? 'Nothing said yet.' : 'Its session said nothing the engine can read.'}</p>
        ))}
    </>
  );
}
