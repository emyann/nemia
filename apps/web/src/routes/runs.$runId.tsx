import type { ReactNode } from 'react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { Artifacts, bytesWord, ClosedNeeds } from '../components/Closeout';
import { Decide } from '../components/Decide';
import { Markdown } from '../components/Markdown';
import { NeedsBanner, ToDecideBanner } from '../components/Needs';
import { Check, code, Facts, pathRow, Read, readRows, specRows, spentRows, unreadRows, when } from '../components/Facts';
import { StepPageLink } from '../components/StepParts';
import { StepBody, StepPolicy, Told } from '../components/Told';
import { ActsOn, Approved, endsTheRun, Gate, gateWord } from '../components/Gate';
import { RunCanvas } from '../components/RunCanvas';
import { RunGone } from '../components/RunGone';
import { StatusChip, StepNote } from '../components/StatusChip';
import { Timeline } from '../components/Timeline';
import { StartedFrom } from '../components/TryTag';
import { FavoriteStar } from '../components/FavoriteStar';
import { RemoveRun } from '../components/RemoveRun';
import { LiftHold } from '../components/LiftHold';
import { HoldRun } from '../components/HoldRun';
import { PruneRun } from '../components/PruneRun';
import { factoriesQuery, loadRun, runGone, runQuery, type RunDetail } from '../lib/api';
import { untrustedFor, type UntrustedPlace } from '../lib/factories';
import { answersOf, askedIn, gateOffered, stepAnchor } from '../lib/asks';
import { barValue } from '../lib/bar';
import { spentTitle } from '../lib/cost';
import { decidableRun } from '../lib/decide';
import { duration } from '../lib/canvas';
import { clockCounts, inFlight, runClock, titleOf, waitedMs } from '../lib/factory';
import { useNow } from '../lib/useNow';
import { container, ink } from '../lib/meaning';

/**
 * `step`, the old address of one step of the run, opens that step in the frame's bar: the page is loaded again in place of that address,
 * at `?bar=step:<run>/<step>`, so Back does not return to it.
 */
export const Route = createFileRoute('/runs/$runId')({
  validateSearch: (search: Record<string, unknown>): { step?: string } =>
    typeof search.step === 'string' && search.step ? { step: search.step } : {},
  beforeLoad: ({ search, params }) => {
    if (!search.step) return;
    const bar = barValue({ kind: 'step', run: params.runId, step: search.step });
    throw redirect({ to: '/runs/$runId', params, search: { bar }, replace: true });
  },
  loader: ({ context, params }) => loadRun(context.queryClient, params.runId),
  component: RunPage,
  errorComponent: ({ error }) => (
    <div className="space-y-3">
      <BackToRuns />
      <p className="text-body-medium text-failure">Could not load this run: {error instanceof Error ? error.message : String(error)}</p>
    </div>
  ),
});

type Step = RunDetail['steps'][number];

/**
 * The page of a run, or, when the store has no run of its id as the page loads (`loadRun`), the words that say so, by its id: the
 * address of a run removed, or of none.
 */
function RunPage() {
  const { runId } = Route.useParams();
  if (Route.useLoaderData().gone) {
    return (
      <div className="space-y-3">
        <BackToRuns />
        <RunGone id={runId} />
      </div>
    );
  }
  return <RunRead runId={runId} />;
}

/**
 * The page of the run `runId`, keyed by run, so where the nodes were dragged belongs to the run they were on. A run removed
 * while the page is open is said to be gone: the query keeps its last read, which is not drawn as if the run were still there.
 */
function RunRead({ runId }: { runId: string }) {
  const { data: run, error } = useSuspenseQuery(runQuery(runId));
  if (runGone(error)) {
    return (
      <div className="space-y-3">
        <BackToRuns />
        <RunGone run={run} />
      </div>
    );
  }
  return <Run key={run.id} run={run} />;
}

/**
 * One run, top to bottom: what is left to decide about its result, above who else it waits on, as the CLI's `ls` prints the two; the runs
 * it waits on and a person's hold; its warning; its id and its star (`RunHeading`), with what it has cost, every step's tries, once a cost
 * was measured (`≥` where an ended attempt has none on it), what the same sessions read, by price, where every one of them measured it,
 * what it was started from, and, once it is over, what it holds on disk to give back as the CLI's `prune` does; then Decide, between the
 * banners and the canvas, for a run with something to decide and never while it runs: an answer to give, or a try a person has asked for,
 * since a session the harness blocked is continued from the banner and Decide draws it only once its try is asked; the graph, the whole
 * width of the page, a step pressed on it inspected in the frame's bar; the brief, with the inbox card it was started from under it, as the
 * CLI's `decide` puts it under the run's line; its facts; its timeline; and each step's section.
 *
 * Its facts: a folder run has no repository, base or branch, and names where its work is instead, the one thing a person needs to find what
 * it made; when it started, its first step filed, and the wait before, which a run started `--after` runs spends doing nothing; and, only
 * once the CLI's `prune` removed its worktrees, the prune: the run is then read as it ended, and nothing of it can be tried again.
 */
function Run({ run }: { run: RunDetail }) {
  const runCancelled = run.cancelledAt !== null;

  return (
    <article className="space-y-6">
      <BackToRuns />

      <ToDecideBanner run={run} />

      <NeedsBanner run={run} />

      <WaitingOnRuns run={run} />

      <HeldUntil run={run} />

      {run.warning && <p className="rounded border border-outline px-3 py-2 text-body-medium text-muted-foreground">{run.warning}</p>}

      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <RunHeading run={run} />
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <RunTook run={run} />
          {run.cost && (
            <p data-run-cost title={spentTitle(run.cost, "the run's tries")} className="text-body-medium">
              <span className="text-muted-foreground">cost </span>
              <span className="font-mono">{run.cost.said}</span>
            </p>
          )}
          {run.read && (
            <p
              data-run-read
              className="text-body-medium"
              title="What every try of every step read: from the cache, written to it, and the largest context one response carried."
            >
              <Read said={run.read.said} peak={run.read.peak} rebuilt={run.read.rebuilt} />
            </p>
          )}
          {run.tokens && (
            <p data-run-tokens className="text-body-medium">
              <span className="font-mono">{run.tokens.said}</span> <span className="text-muted-foreground">({run.tokens.split})</span>
            </p>
          )}
          <StartedFrom run={run} />
          {run.try && <RemoveRun id={run.id} />}
          <HoldRun run={run} />
          <PruneRun run={run} />
        </div>
      </header>

      {(decidableRun(run) || answersOf(run).length > 0) && <Decide run={run} />}

      <section aria-label="The run's steps as a graph">
        <RunCanvas run={run} />
      </section>

      <section className="space-y-4">
        <Markdown>{run.brief}</Markdown>
        {run.fromNote && (
          <p data-from={run.from?.inbox} className="text-body-medium text-muted-foreground">
            {run.fromNote}
          </p>
        )}
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
            ['cancelled', run.cancelledAt && when(run.cancelledAt)],
            ...(run.pruned ? ([['pruned', <Pruned key="pruned" pruned={run.pruned} />]] satisfies Array<[string, ReactNode]>) : []),
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
 * One step's section: its state, its spec, its check, what it is told, its facts, its files, then its gate or what it handed on.
 *
 * What it is told is said once: where its run froze its layers, by layer in the fold (`Told`) alone, its agent's instructions, the
 * person's custom instructions, its policy and its task; where it froze none, its body (`StepBody`) above the fold of its brief whole.
 *
 * Its facts: a folder step's folder, copyable, where a git step's branch goes; its task; its gate, where it has one — a person's word files
 * what follows it, or, for the step that ends the run, the step itself; what the harness denied its current try, every call as a permission
 * rule names it, which is what its work may be short of, with its likely cause where the run's place is not trusted; why the runtime
 * could not read its session alone, where it could not, in its
 * words — neither working nor gone, which its status does not say; what its current try consumed, in the CLI `decide`'s words,
 * `not measured` where nobody counted and never 0; what its sessions read, by price, where anything measured it, the peak and a rebuilt
 * cache marked; and what every try has cost together, and of its cap where it has one, red once past it.
 *
 * A folder step's files: what it left in its folder, which is the whole of what it made — the files its closeout named and the ones it
 * forgot to, each with its size, a text file readable in a tab, and what the api serves by no name, a directory or a link, by its path — so
 * *the folder is empty* is said of an empty folder and of nothing else. A folder the api could not read says so instead, where an empty
 * list would say the step made nothing when nobody could look. A git step's work is its branch, and has no such list.
 *
 * At its gate — waiting on you as the CLI's `ls` asks it (`approve`), on a run nobody called off, and not sent back already (`gateOffered`)
 * — the step's policy drawn open (`StepPolicy`), then the gate, with what the step handed on, every field it declared, which is what a
 * person approves, beside Approve and Send back. An ending step's gate (`endsTheRun`) holds before the step is filed: it has handed nothing
 * on, and shows instead the work it would act on (`ActsOn`), the branch's standing and counts and each work step's closeout with its
 * files, since approving is what runs it. An ending that has already run — filed, aborted, retried — is at its gate for its own closeout,
 * as any gated step is. A send-back names the steps the package names (`sendBackTo`): the step itself once it has run, or the steps it
 * waits on. Once approved, under the step: when, and the words every step after the gate is handed — or, for the step that ends the run,
 * what its own approval filed and the terms it acts on.
 */
function StepSection({ run, step, runCancelled }: { run: RunDetail; step: Step; runCancelled: boolean }) {
  const { spec, closeout, gate } = step;
  const cause = useDeniedCause(run, Boolean(step.denied));
  const atGate = gateOffered(step, runCancelled);
  const ends = endsTheRun(step);
  const acts = atGate && ends && step.taskId === null;
  const handedOn = closeout && (
    <div className="min-w-0 space-y-2 rounded border border-outline-variant p-3 text-body-medium">
      <Markdown>{closeout.summary}</Markdown>
      {closeout.needs && <ClosedNeeds needs={closeout.needs} />}
      {closeout.artifacts.length > 0 && (
        <div aria-label="Artifacts" className="text-body-small text-muted-foreground">
          Artifacts:
          <Artifacts artifacts={closeout.artifacts} />
        </div>
      )}
    </div>
  );

  return (
    <section id={stepAnchor(step.name)} className="scroll-mt-4 space-y-4 border-t border-outline-variant pt-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold">{step.name}</h2>
          <StatusChip status={step.status} runCancelled={runCancelled} runHeld={run.holding != null} />
        </div>
        <StepNote note={step.note} />
      </div>

      {spec && <Facts rows={specRows(spec, step.filed)} />}

      {step.check && <Check check={step.check} />}

      <StepBody body={step.body} layers={step.layers} />

      <Told told={step.told} layers={step.layers} parts={step.taskParts} filed={step.taskId !== null} />
      <StepPageLink page={run.workflowPage} step={step.name} />

      <Facts
        rows={[
          run.place === 'folder' ? ['folder', pathRow(step.workspace)] : ['branch', code(step.branch)],
          ['task', step.taskId ? code(step.taskId) : 'not filed'],
          ...(gate ? ([['gate', gateWord(gate, ends)]] satisfies Array<[string, string]>) : []),
          ...(step.denied ? ([['denied', deniedRow(step.denied.calls, cause)]] satisfies Array<[string, ReactNode]>) : []),
          ...unreadRows(step.sessionUnread),
          ['used', step.used?.used],
          ['cost', step.used?.cost],
          ...readRows(step.used),
          ...spentRows(step),
        ]}
      />

      {run.place === 'folder' && step.taskId !== null && (
        <div aria-label="Files" data-files className="text-body-small text-muted-foreground">
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

      {atGate ? <AtGate run={run} step={step} acts={acts} /> : handedOn}

      {gate?.approval && <Approved step={step.name} approval={gate.approval} ends={ends} />}
    </section>
  );
}

/**
 * A step at its gate, under its section: its policy drawn open, then the gate. An ending's (`acts`) beside the work it would act on,
 * sending back the steps it waits on; any other beside what the step handed on, with the questions it asks (`askedIn`), sending back the
 * step.
 */
function AtGate({ run, step, acts }: { run: RunDetail; step: Step; acts: boolean }) {
  const back = acts ? run.graph.edges.filter((e) => e.kind === 'after' && e.to === step.name).map((e) => e.from) : [step.name];
  return (
    <>
      <StepPolicy layers={step.layers} />
      {acts ? (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <ActsOn run={run} step={step} />
          <Gate runId={run.id} step={step.name} approveLine={step.commands.approve} back={back} acts={acts} />
        </div>
      ) : (
        <Gate
          runId={run.id}
          step={step.name}
          approveLine={step.commands.approve}
          back={back}
          closeout={step.closeout}
          questions={askedIn(step.closeout)}
        />
      )}
    </>
  );
}

/**
 * What the run took, or how long it has been at work, as its card's clock says it (`runClock`), the start, the end and the wall time on
 * hover; it moves every second while a task of it runs (`clockCounts`). Nothing before the run started, which the `started` row says.
 */
function RunTook({ run }: { run: RunDetail }) {
  const finished = !inFlight(run);
  const now = useNow(clockCounts(run, finished) ? 1_000 : 30_000);
  if (run.startedAt === null) return null;
  const clock = runClock(run, now, finished);
  return (
    <p data-run-took className="text-body-medium">
      <time dateTime={clock.at} title={clock.title} className="font-mono">
        {clock.words}
      </time>
    </p>
  );
}

/**
 * When the run started — its first step filed — and, where it waited before that, for how long: the wait the Factory's card does not count
 * as time at work (`runClock`). Not yet while nothing of it is filed, and never for a run called off first.
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
 * What a run started `--after` runs still waits on, as the CLI's `decide` says it for such a run and offers nothing else: the CLI `ls`'s
 * word, what it leaves a person to do, and each run it names, linked to its page where the store has it. In the yours container when one
 * never ships without a person, at rest otherwise.
 */
function WaitingOnRuns({ run }: { run: RunDetail }) {
  const { waiting } = run;
  if (!waiting) return null;
  return (
    <section
      aria-label="Waiting on runs"
      data-on-you={waiting.onYou}
      className={`space-y-1 rounded px-3 py-2 text-body-medium ${waiting.onYou ? container.yours : 'bg-muted text-foreground'}`}
    >
      <p className="font-mono">{waiting.word}</p>
      <p data-advice>{waiting.advice}</p>
      <ul className="flex flex-wrap gap-x-3 text-body-small">
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
 * A person's hold on the run (the CLI's `hold`), as the CLI's `decide` says it: until which runs ship, what that means and how to lift it,
 * and each run it is held until, linked where it is there. At rest, in the grey container, and in the yours container
 * once only a person lifts it. While it stands no step offers an answer — the package refuses each — so this is the one thing on the page
 * asked of anyone.
 */
function HeldUntil({ run }: { run: RunDetail }) {
  const { holding } = run;
  if (!holding) return null;
  return (
    <section
      aria-label="Held"
      data-on-you={holding.onYou}
      className={`space-y-1 rounded px-3 py-2 text-body-medium ${holding.onYou ? container.yours : container.grey}`}
    >
      <p className="font-mono">{holding.word}</p>
      <p data-advice>{holding.advice}</p>
      {holding.runs.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 text-body-small">
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
      <LiftHold id={run.id} />
    </section>
  );
}

/** A run's id, its page's heading, and its star, named by its title, which puts it under Favorites. */
function RunHeading({ run }: { run: RunDetail }) {
  return (
    <div className="flex items-center gap-1">
      <h1 className="font-mono text-body-medium text-muted-foreground">{run.id}</h1>
      <FavoriteStar favorite={{ kind: 'run', run: run.id }} name={titleOf(run)} />
    </div>
  );
}

function BackToRuns() {
  return (
    <Link to="/runs" className="text-body-medium text-muted-foreground hover:text-foreground">
      ← Runs
    </Link>
  );
}
