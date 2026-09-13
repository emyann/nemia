import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { stepLogQuery, type RunDetail } from '../lib/api';
import { isLive } from '../lib/canvas';
import { stepState, type StepState } from '../lib/status';
import { code, Facts, specRows, Told, when } from './Facts';
import { StatusChip } from './StatusChip';

type Step = RunDetail['steps'][number];

const TABS = ['Details', 'Output', 'Activity'] as const;
type Tab = (typeof TABS)[number];

/** What is going on in one step, beside the canvas, for the node that was clicked. */
export function StepInspector({ run, step, onClose }: { run: RunDetail; step: Step; onClose: () => void }) {
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
      className="flex h-[30rem] min-h-0 flex-col rounded border border-neutral-200 bg-white text-sm md:w-80 md:shrink-0 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <header className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">step inspector</p>
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
        {/* Keyed by step, so a log never stands in for another step's while that one loads. */}
        {tab === 'Activity' && <Activity key={step.name} runId={run.id} step={step} live={isLive(state)} />}
      </div>
    </aside>
  );
}

function Details({ step, state, runCancelled }: { step: Step; state: StepState; runCancelled: boolean }) {
  const { spec, attempts } = step;
  const latest = attempts.latest;

  return (
    <>
      <StatusChip status={step.status} runCancelled={runCancelled} />
      <Facts
        rows={[
          ['attempts', attempts.count],
          ['latest began', latest && when(latest.startedAt)],
          // No end time: the engine's view keeps how an attempt ended, not when.
          ['latest ended', latest && (latest.ended ? code(`${latest.ended} · ${latest.reason ?? 'no reason given'}`) : isLive(state) ? 'still running' : null)],
          ['branch', code(step.branch)],
          ['task', step.taskId ? code(step.taskId) : 'not filed'],
        ]}
      />
      {spec ? (
        <section className="space-y-1">
          <h3 className="text-xs font-medium text-neutral-500">Spec</h3>
          <Facts rows={specRows(spec)} />
        </section>
      ) : (
        <p className="text-neutral-500">No spec: the workflow folder does not have this step now.</p>
      )}
      {step.told && <Told told={step.told} filed={step.taskId !== null} />}
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

function Activity({ runId, step, live }: { runId: string; step: Step; live: boolean }) {
  const filed = step.taskId !== null;
  const { data, error, isPending } = useQuery({
    ...stepLogQuery(runId, step.name, live),
    enabled: filed,
    // The key changes when the step stops; keep showing what was read until the last read lands.
    placeholderData: keepPreviousData,
  });
  const log = useRef<HTMLPreElement>(null);
  // Follow the newest line, unless a person has scrolled up to read an older one.
  const following = useRef(true);
  useLayoutEffect(() => {
    if (log.current && following.current) log.current.scrollTop = log.current.scrollHeight;
  }, [data]);

  if (!filed) return <p className="text-neutral-500">Not filed yet, so there is no output.</p>;
  if (isPending) return <p className="text-neutral-500">Reading its output…</p>;
  if (!data) return <p className="text-red-600">{error?.message ?? 'Could not read its output.'}</p>;

  return (
    <>
      <p className="text-xs text-neutral-500">
        {live ? 'Read again every 5 s while it runs.' : 'Not running, so not read again.'}
        {data.truncated && ' The last 200 lines.'}
      </p>
      {error && <p className="text-xs text-red-600">{error.message}</p>}
      {data.lines.length ? (
        <pre
          ref={log}
          onScroll={(event) => {
            const el = event.currentTarget;
            following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          }}
          className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-100 p-2 font-mono text-[11px] leading-snug dark:bg-neutral-950"
        >
          {data.lines.join('\n')}
        </pre>
      ) : (
        <p className="text-neutral-500">No output yet.</p>
      )}
    </>
  );
}
