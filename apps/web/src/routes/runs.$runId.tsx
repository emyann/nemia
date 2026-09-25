import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Artifacts, bytesWord, ClosedNeeds } from '../components/Closeout';
import { Decide } from '../components/Decide';
import { Markdown } from '../components/Markdown';
import { NeedsBanner, ToDecideBanner } from '../components/Needs';
import { Check, code, Facts, pathRow, Read, readRows, specRows, spentRows, Told, when } from '../components/Facts';
import { ActsOn, Approved, endsTheRun, Gate, gateWord } from '../components/Gate';
import { RunCanvas } from '../components/RunCanvas';
import { RunGone } from '../components/RunGone';
import { StatusChip, StepNote } from '../components/StatusChip';
import { StepInspector } from '../components/StepInspector';
import { Timeline } from '../components/Timeline';
import { WorkflowLink } from '../components/WorkflowLink';
import { runGone, runQuery, type RunDetail } from '../lib/api';
import { answersOf, gateOffered, stepAnchor } from '../lib/asks';
import { spentTitle } from '../lib/cost';
import { decidableRun } from '../lib/decide';
import { duration } from '../lib/canvas';
import { waitedMs } from '../lib/factory';

/**
 * `step` opens that step's inspector as the page loads: the Factory card's gate links here to what the step at it handed on, which the
 * inspector opens on (its Output tab, for a step that has signed off).
 */
export const Route = createFileRoute('/runs/$runId')({
  validateSearch: (search: Record<string, unknown>): { step?: string } => (typeof search.step === 'string' && search.step ? { step: search.step } : {}),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(runQuery(params.runId)),
  component: RunPage,
  errorComponent: ({ error }) => (
    <div className="space-y-3">
      <BackToRuns />
      <p className="text-sm text-red-600">
        Could not load this run: {error instanceof Error ? error.message : String(error)}
      </p>
    </div>
  ),
});

type Step = RunDetail['steps'][number];

/** How long a page opened on a step keeps that step's inspector in view while what is above it is still being read. */
const LANDING_MS = 3_000;

/**
 * Opened on a step (`?step=`), the page is brought to its inspector, which sits under the banners and Decide, below the first screen: a
 * person who pressed Read the plan would otherwise be reading the Decide section. Decide grows once its decision is read, after the page has
 * drawn, so a scroll made once lands short of the inspector; this one is made again each time the page's height changes, for a few seconds,
 * and never once the person scrolls, presses a key or touches the page themselves.
 */
function useLanding(target: RefObject<HTMLElement | null>, step: string | undefined) {
  useEffect(() => {
    const el = target.current;
    if (!step || !el) return;
    const bring = () => el.scrollIntoView({ block: 'start' });
    bring();
    const resized = new ResizeObserver(bring);
    // The article: what grows above the inspector grows it.
    resized.observe(el.parentElement ?? document.body);
    const done = () => {
      resized.disconnect();
      clearTimeout(timer);
      for (const kind of TAKEN_BACK) window.removeEventListener(kind, done, true);
    };
    const timer = setTimeout(done, LANDING_MS);
    for (const kind of TAKEN_BACK) window.addEventListener(kind, done, true);
    return done;
  }, [target, step]);
}

/** What a person does to move the page themselves, which ends a landing. */
const TAKEN_BACK = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

function RunPage() {
  const { runId } = Route.useParams();
  const { data: run, error } = useSuspenseQuery(runQuery(runId));
  // Removed while the page was open: its last read is kept by the query, and not drawn as if it were still there.
  if (runGone(error)) {
    return (
      <div className="space-y-3">
        <BackToRuns />
        <RunGone run={run} />
      </div>
    );
  }
  // Keyed by run: the step selected and where the nodes were dragged belong to the run they were on.
  return <Run key={run.id} run={run} />;
}

function Run({ run }: { run: RunDetail }) {
  const runCancelled = run.cancelledAt !== null;
  const { step: linked } = Route.useSearch();
  const [selected, setSelected] = useState<string | null>(linked ?? null);
  // A link to another step of the run while its page is open opens that one.
  useEffect(() => {
    if (linked) setSelected(linked);
  }, [linked]);
  const steps = useRef<HTMLElement>(null);
  useLanding(steps, linked);
  const close = useCallback(() => setSelected(null), []);
  // A step the folder has lost since it was clicked is off the canvas, and its panel goes with it.
  const inspected = run.steps.find((s) => s.name === selected);

  return (
    <article className="space-y-6">
      <BackToRuns />

      {/* What is left to decide about the result, above who else the run waits on, as `wf ls` prints the two. */}
      <ToDecideBanner run={run} />

      <NeedsBanner run={run} />

      <WaitingOnRuns run={run} />

      <HeldUntil run={run} />

      {run.warning && (
        <p className="rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
          {run.warning}
        </p>
      )}

      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="font-mono text-sm text-neutral-500">{run.id}</h1>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {/* What the run has cost, every step's tries, once a cost was measured: `≥` where an ended attempt has none on it. */}
          {run.cost && (
            <p data-run-cost title={spentTitle(run.cost, "the run's tries")} className="text-sm">
              <span className="text-neutral-500">cost </span>
              <span className="font-mono">{run.cost.said}</span>
            </p>
          )}
          {/* Beside it, what the same sessions read, by price — where every one of them measured it. */}
          {run.read && (
            <p data-run-read className="text-sm" title="What every try of every step read: from the cache, written to it, and the largest context one response carried.">
              <Read said={run.read.said} peak={run.read.peak} rebuilt={run.read.rebuilt} />
            </p>
          )}
          <WorkflowLink dir={run.workflowDir} />
        </div>
      </header>

      {/* Between the banner and the canvas, for a run with something to decide — never while it runs — an answer to give, or a try a person
          has asked for. A session the harness blocked is continued from the banner, and draws it only once its try is asked. */}
      {(decidableRun(run) || answersOf(run).length > 0) && <Decide run={run} />}

      <section ref={steps} aria-label="The run's steps as a graph" className="flex scroll-mt-4 flex-col gap-4 md:flex-row">
        <div className="min-w-0 flex-1">
          <RunCanvas run={run} selected={inspected?.name ?? null} onSelect={setSelected} />
        </div>
        {inspected && <StepInspector run={run} step={inspected} onClose={close} />}
      </section>

      <section className="space-y-4">
        <Markdown>{run.brief}</Markdown>
        {/* Under the brief, as `wf decide` puts it under the run's line: the inbox card it was started from. */}
        {run.fromNote && (
          <p data-from={run.from?.inbox} className="text-sm text-neutral-500">
            {run.fromNote}
          </p>
        )}
        <Facts
          rows={[
            // A folder run has no repository, no base and no branch, and a row of dashes where they belong says nothing. Where its
            // work is instead — the one thing a person needs to find what it made.
            ...(run.place === 'folder'
              ? ([['work', pathRow(run.work)]] satisfies Array<[string, ReactNode]>)
              : ([['repo', code(run.repo)], ['base', code(run.baseRef)], ['branch', code(run.branch)]] satisfies Array<[string, ReactNode]>)),
            ['created', when(run.createdAt)],
            // When it started — its first step filed — and the wait before it, which a run started `--after` runs spends doing nothing.
            ['started', startedRow(run)],
            ['cancelled', run.cancelledAt && when(run.cancelledAt)],
            // Only once `wf prune` removed its worktrees: the run is read as it ended, and nothing of it can be tried again.
            ...(run.pruned ? ([['pruned', <Pruned pruned={run.pruned} />]] satisfies Array<[string, ReactNode]>) : []),
            ['workflow', code(run.workflowDir)],
          ]}
        />
      </section>

      <Timeline run={run} />

      {run.steps.map((step) => (
        <StepSection key={step.name} run={run} step={step} runCancelled={runCancelled} />
      ))}
    </article>
  );
}

/** When `wf prune` removed a run's worktrees, how many and what they held, and what it kept — in `wf prune`'s words. */
function Pruned({ pruned: { at, worktrees } }: { pruned: NonNullable<RunDetail['pruned']> }) {
  const bytes = worktrees.reduce((sum, w) => sum + w.bytes, 0);
  const count = `${worktrees.length} worktree${worktrees.length === 1 ? '' : 's'}`;
  return (
    <span data-pruned title={worktrees.map((w) => `${w.path}  ${bytesWord(w.bytes)}`).join('\n')}>
      {when(at)} — removed {count}, {bytesWord(bytes)} freed; its branches, record and files are kept
    </span>
  );
}

/** What the harness denied a step's try, every call as a permission rule names it: `Skill(look), Bash(pytest)`. */
const deniedRow = (calls: readonly string[]): ReactNode => (
  <span data-denied className="font-mono text-xs text-red-700 dark:text-red-400">{calls.join(', ')}</span>
);

function StepSection({ run, step, runCancelled }: { run: RunDetail; step: Step; runCancelled: boolean }) {
  const runId = run.id;
  const { spec, closeout, gate } = step;
  // Waiting at its gate on you, as `wf ls` asks it (`approve`): on a run nobody called off, and not sent back already.
  const atGate = gateOffered(step, runCancelled);
  // An ending step's gate, which holds before the step is filed (`endsTheRun`): it has no closeout of its own, and what a person approves is
  // the work it would act on — the branch's standing and diff stat, and each work step's closeout with its files (`ActsOn`).
  const ends = endsTheRun(step);
  // An ending that has already run — filed, aborted, retried — is at its gate for its own closeout, as any gated step is.
  const acts = atGate && ends && step.taskId === null;
  // The steps a send-back names, as the package names them (`sendBackTo`): the step itself once it has run, or the steps it waits on.
  const back = acts ? run.graph.edges.filter((e) => e.kind === 'after' && e.to === step.name).map((e) => e.from) : [step.name];
  const handedOn = closeout && (
    <div className="min-w-0 space-y-2 rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800">
      <Markdown>{closeout.summary}</Markdown>
      {closeout.needs && <ClosedNeeds needs={closeout.needs} />}
      {closeout.artifacts.length > 0 && (
        <div aria-label="Artifacts" className="text-xs text-neutral-500">
          Artifacts:
          <Artifacts artifacts={closeout.artifacts} />
        </div>
      )}
    </div>
  );

  return (
    <section id={stepAnchor(step.name)} className="scroll-mt-4 space-y-4 border-t border-neutral-200 pt-6 dark:border-neutral-800">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold">{step.name}</h2>
          <StatusChip status={step.status} runCancelled={runCancelled} runHeld={run.holding != null} />
        </div>
        <StepNote note={step.note} />
      </div>

      {spec && <Facts rows={specRows(spec, step.filed)} />}

      {step.check && <Check check={step.check} />}

      {step.body && <Markdown className="text-sm">{step.body}</Markdown>}

      {step.told && <Told told={step.told} filed={step.taskId !== null} />}

      <Facts
        rows={[
          // A folder step's folder, where a git step's branch goes: the directory it worked in, copyable.
          run.place === 'folder' ? ['folder', pathRow(step.workspace)] : ['branch', code(step.branch)],
          ['task', step.taskId ? code(step.taskId) : 'not filed'],
          // Its gate, where it has one: a person's word files what follows it — or, for the step that ends the run, the step itself.
          ...(gate ? ([['gate', gateWord(gate, ends)]] satisfies Array<[string, string]>) : []),
          // What the harness denied its current try, every call as a permission rule names it: what its work may be short of.
          ...(step.denied ? ([['denied', deniedRow(step.denied.calls)]] satisfies Array<[string, ReactNode]>) : []),
          // What its current try consumed, in `wf decide`'s words: `not measured` where nobody counted, never 0.
          ['used', step.used?.used],
          ['cost', step.used?.cost],
          // What its sessions read, by price, where anything measured it: the peak and a rebuilt cache marked.
          ...readRows(step.used),
          // What every try has cost together, and of its cap where it has one: red once past it.
          ...spentRows(step),
        ]}
      />

      {/* What a folder step left in its folder, which is the whole of what it made: the files its closeout named and the ones it
          forgot to, each with its size, and a text file readable in a tab — and what the api serves by no name, a directory or a
          link, by its path, so *the folder is empty* is said of an empty folder and of nothing else. A folder the api could not read
          says so instead: an empty list there would say the step made nothing when nobody could look. A git step's work is its
          branch, and has no such list. */}
      {run.place === 'folder' && step.taskId !== null && (
        <div aria-label="Files" data-files className="text-xs text-neutral-500">
          {step.filesError === null ? (
            <>
              Files in its folder:
              <Artifacts artifacts={step.files} size none="the folder is empty" />
            </>
          ) : (
            <span data-files-error>{step.filesError}</span>
          )}
        </div>
      )}

      {/* At its gate, the gate, with what it handed on — which is what a person approves, every field it declared — beside Approve and
          Send back. At an ending step's gate, what it would act on instead: it has handed nothing on, and approving is what runs it. */}
      {atGate ? (
        acts ? (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <ActsOn run={run} step={step} />
            <Gate runId={runId} step={step.name} back={back} acts={acts} />
          </div>
        ) : (
          <Gate runId={runId} step={step.name} back={back} closeout={closeout} />
        )
      ) : (
        handedOn
      )}

      {/* Once approved, under the step: when, and the words every step after the gate is handed — or, for the step that ends the run,
          what its own approval filed and the terms it acts on. */}
      {gate?.approval && <Approved step={step.name} approval={gate.approval} ends={ends} />}
    </section>
  );
}

/**
 * When the run started — its first step filed — and, where it waited before that, for how long: the wait the Factory's card does not count as
 * time at work (`runClock`). Not yet while nothing of it is filed, and never for a run called off first.
 */
function startedRow(run: RunDetail): ReactNode {
  if (run.startedAt === null) return run.cancelledAt ? 'never: called off first' : 'not yet';
  const waited = waitedMs(run)!;
  return (
    <span data-started>
      {when(run.startedAt)}
      {waited >= 1000 && `, after waiting ${duration(waited)}`}
    </span>
  );
}

/**
 * What a run started `--after` runs still waits on, as `wf decide` says it for such a run and offers nothing else: `wf ls`'s word, what it
 * leaves a person to do, and each run it names, linked to its page where the store has it. Amber when one never ships without a person.
 */
function WaitingOnRuns({ run }: { run: RunDetail }) {
  const { waiting } = run;
  if (!waiting) return null;
  return (
    <section
      aria-label="Waiting on runs"
      data-on-you={waiting.onYou}
      className={`space-y-1 rounded px-3 py-2 text-sm ${
        waiting.onYou ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300'
      }`}
    >
      <p className="font-mono">{waiting.word}</p>
      <p data-advice>{waiting.advice}</p>
      <ul className="flex flex-wrap gap-x-3 text-xs">
        {waiting.runs.map((w) => (
          <li key={w.run}>
            {w.missing ? (
              <span className="font-mono">{w.run}</span>
            ) : (
              <Link to="/runs/$runId" params={{ runId: w.run }} className="font-mono underline underline-offset-2">
                {w.run}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A person's hold on the run (`wf hold`), as `wf decide` says it: until which runs ship, what that means and how to lift it, and each run it
 * is held until, linked where it is there. In violet as the held chips are, and in amber once only a person lifts it. While it stands no step
 * offers an answer — the package refuses each — so this is the one thing on the page asked of anyone.
 */
function HeldUntil({ run }: { run: RunDetail }) {
  const { holding } = run;
  if (!holding) return null;
  return (
    <section
      aria-label="Held"
      data-on-you={holding.onYou}
      className={`space-y-1 rounded px-3 py-2 text-sm ${
        holding.onYou ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' : 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200'
      }`}
    >
      <p className="font-mono">{holding.word}</p>
      <p data-advice>{holding.advice}</p>
      {holding.runs.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 text-xs">
          {holding.runs.map((h) => (
            <li key={h.run}>
              {h.missing ? (
                <span className="font-mono">{h.run}</span>
              ) : (
                <Link to="/runs/$runId" params={{ runId: h.run }} className="font-mono underline underline-offset-2">
                  {h.run}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BackToRuns() {
  return (
    <Link to="/runs" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
      ← Runs
    </Link>
  );
}
