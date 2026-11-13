import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button as AriaButton, Slider, SliderThumb, SliderTrack } from 'react-aria-components';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Sheet, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { stepPathQuery, type LifecycleTransition, type MachineGraph, type StepPath } from '@/lib/api/steps';
import type { RunDetail, StepView } from '@/lib/runView';
import { byPerson, centredScroll, litAt, pathPoll, stepStamp, takenRoutes } from '@/lib/lifecyclePath';
import { clockWord } from '@/lib/quota';
import { useNow } from '@/lib/useNow';
import { cn } from '@/lib/utils';
import { MachineCanvas } from './MachineCanvas';
import { focusRing } from '@/components/ui/ds/utils';

type Step = StepView;

/** The machine the panel draws a task's path on, by its name and what a person calls it: the runtime's lifecycle. */
const LIFECYCLE = { name: 'lifecycle', title: "A task's lifecycle" };

/** The tallest the lifecycle is drawn in the panel: the conversation under it keeps the rest of the page. */
const CANVAS_MAX_HEIGHT = 420;

/** The title the path is shown under, in the panel and full width. */
const PATH_TITLE = "The task's path through the runtime's lifecycle";

/**
 * A step's Debug panel, in its part's detail, closed by default: opened, the task of the try the part shows (`shown`, the address's
 * choice, else its current) as it moved through the runtime's lifecycle, drawn over the lifecycle's graph, with a timeline to scrub back
 * through, and a button that opens the same lit graph full width, at a size its names can be read. Nothing of it is read or drawn while
 * it is closed.
 */
export function DebugPanel({ run, step, shown }: { run: RunDetail; step: Step; shown: number | null }) {
  return (
    <section aria-label="Debug" className="shrink-0">
      <Collapsible>
        {({ isExpanded }) => (
          <>
            <CollapsibleTrigger
              className={cn('w-full px-4 py-1.5 text-left text-body-small text-muted-foreground hover:text-foreground', focusRing())}
            >
              {isExpanded ? '▾' : '▸'} Debug
            </CollapsibleTrigger>
            <CollapsibleContent>{isExpanded && <PathOf run={run} step={step} shown={shown} />}</CollapsibleContent>
          </>
        )}
      </Collapsible>
    </section>
  );
}

/** The try whose path is read: none for the current one, which is read again as the step moves. */
const pathTry = (step: Step, shown: number | null): number | null =>
  shown === null || shown === (step.tries.find((t) => t.current)?.try ?? null) ? null : shown;

/**
 * One try's path on the lifecycle, which the path's read carries (`StepPath`'s `lifecycle`): the state it stands in lit, the routes it took
 * to get there drawn over the graph, and a timeline of every entry of its journal. The timeline follows the newest entry until a person
 * moves it, and again once they move it back to the end; the part showing another try follows that try's newest. The graph opened full
 * width is drawn from the same read and the same entry shown. The current try's path is read as the current one (`tryNumber` null), so
 * it is read again as the step moves.
 */
function PathOf({ run, step, shown }: { run: RunDetail; step: Step; shown: number | null }) {
  const tryNumber = pathTry(step, shown);
  const [pinned, setPinned] = useState<{ try: number | null; at: number } | null>(null);
  const poll = (r: StepPath | undefined) => pathPoll(r, r?.lifecycle.final ?? [], tryNumber === null);
  const read = useQuery(stepPathQuery(run.id, step.name, stepStamp({ ...step, current: step.current ?? null }), tryNumber, poll));
  const machine = read.data?.lifecycle;
  const path = read.data?.path ?? [];
  const last = path.length - 1;
  const at = pinned === null || pinned.try !== tryNumber ? last : Math.min(pinned.at, last);
  const lit = litAt(path, at);
  const taken = machine ? takenRoutes(path, at, machine) : [];
  const onScrub = (i: number) => setPinned(i >= last ? null : { try: tryNumber, at: i });

  return (
    <div className="max-h-[60svh] space-y-2 overflow-y-auto px-4 pb-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-small text-muted-foreground">
        <span>
          {PATH_TITLE}
          {read.data?.taskId ? (
            <>
              {' '}
              — <code className="font-mono">{read.data.taskId}</code>
            </>
          ) : null}
        </span>
        {machine && read.data?.taskId && path.length > 0 ? (
          <WideGraph machine={machine} taskId={read.data.taskId} path={path} at={at} lit={lit} taken={taken} onScrub={onScrub} />
        ) : null}
        {step.tries.length > 1 && <span data-path-try={shown}>try {shown}</span>}
      </div>
      {read.error ? (
        <p className="text-body-medium text-failure">Could not read the path: {read.error.message}</p>
      ) : !read.data ? (
        <p className="text-body-medium text-muted-foreground">Reading the path…</p>
      ) : (
        <PathDrawn read={read.data} reading={read.isPlaceholderData} at={at} lit={lit} taken={taken} onScrub={onScrub} />
      )}
    </div>
  );
}

/**
 * A path read, drawn: the lifecycle it carries with the state `lit` and the routes `taken`, beside its timeline at entry `at`, dimmed while
 * another try's is `reading`; a step not filed yet says so.
 */
function PathDrawn({
  read,
  reading,
  at,
  lit,
  taken,
  onScrub,
}: {
  read: StepPath;
  reading: boolean;
  at: number;
  lit: string | undefined;
  taken: readonly string[];
  onScrub: (i: number) => void;
}) {
  if (read.taskId === null) return <p className="text-body-medium text-muted-foreground">Not filed yet, so there is no path to show.</p>;
  return (
    <div
      data-path={read.taskId}
      data-reading={reading || undefined}
      className={`grid gap-4 @lg/page:grid-cols-[minmax(0,1fr)_18rem] ${reading ? 'opacity-60' : ''}`}
    >
      <MachineCanvas machine={read.lifecycle} {...LIFECYCLE} id="debug-lifecycle" lit={lit} taken={taken} maxHeight={CANVAS_MAX_HEIGHT} />
      <Timeline path={read.path} at={at} machine={read.lifecycle} onScrub={onScrub} />
    </div>
  );
}

/**
 * The lit graph full width: a button that opens a sheet as wide as the window, drawing the lifecycle at its own size with the same state
 * lit, the same routes taken and a slider over the same entries. Its body scrolls, the wheel with it, and follows the lit state into view.
 */
function WideGraph({
  machine,
  taskId,
  path,
  at,
  lit,
  taken,
  onScrub,
}: {
  machine: MachineGraph;
  taskId: string;
  path: readonly LifecycleTransition[];
  at: number;
  lit: string | undefined;
  taken: readonly string[];
  onScrub: (i: number) => void;
}) {
  return (
    <SheetTrigger>
      <Button variant="outline" size="xs">
        Full width
      </Button>
      <Sheet className="data-[side=right]:w-full data-[side=right]:sm:max-w-none">
        <SheetHeader className="gap-2 border-b border-outline-variant pr-14">
          <SheetTitle>{PATH_TITLE}</SheetTitle>
          <SheetDescription>
            <code className="font-mono text-body-small">{taskId}</code>
          </SheetDescription>
          <div className="max-w-xl">
            <Scrubber path={path} at={at} onScrub={onScrub} />
          </div>
        </SheetHeader>
        <LitInView lit={lit}>
          <MachineCanvas machine={machine} {...LIFECYCLE} id="debug-lifecycle-wide" lit={lit} taken={taken} />
        </LitInView>
      </Sheet>
    </SheetTrigger>
  );
}

/**
 * A scrolling body that brings the state `lit` into view, centred, when it is drawn out of view: as it opens, and each time another state
 * is lit. It waits for the graph to draw the state, and moves nothing while the state is already in view.
 */
function LitInView({ lit, children }: { lit: string | undefined; children: ReactNode }) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = body.current;
    if (!el || lit === undefined) return;
    const bring = () => {
      const node = el.querySelector(`[data-state="${CSS.escape(lit)}"][data-lit]`);
      if (!node) return false;
      const to = centredScroll(el.getBoundingClientRect(), node.getBoundingClientRect(), el.scrollTop);
      if (to === undefined) return false;
      if (to !== null) el.scrollTop = to;
      return true;
    };
    if (bring()) return;
    const observer = new MutationObserver(() => {
      if (bring()) observer.disconnect();
    });
    observer.observe(el, { childList: true, subtree: true, attributes: true });
    return () => observer.disconnect();
  }, [lit]);
  return (
    <div ref={body} data-wide-body className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
      {children}
    </div>
  );
}

/** A slider over the path's entries, and which one it shows of how many. */
function Scrubber({ path, at, onScrub }: { path: readonly LifecycleTransition[]; at: number; onScrub: (i: number) => void }) {
  return (
    <div className="space-y-2">
      <Slider
        aria-label="The path's entry shown"
        minValue={0}
        maxValue={Math.max(1, path.length - 1)}
        value={at}
        onChange={(v) => onScrub(Math.min(v, path.length - 1))}
        isDisabled={path.length < 2}
        className="px-2"
      >
        <SliderTrack className="relative h-5 w-full">
          <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded bg-surface-container-highest" />
          <SliderThumb className={cn('top-1/2 size-4 rounded-full border-2 border-alive bg-card', focusRing())} />
        </SliderTrack>
      </Slider>
      <p data-shown className="text-body-small text-muted-foreground">
        Entry {at + 1} of {path.length}
        {at === path.length - 1 ? ', the newest' : ''}
      </p>
    </div>
  );
}

/**
 * The path as a timeline: a slider over its entries and the list of them, each its state, the journal entry that put it there and when,
 * the one shown marked. A move a person's verb made — a stop, an answer or a close — names the verb (`byPerson`), and a move neither
 * a verb nor an edge of the graph makes says so.
 */
function Timeline({
  path,
  at,
  machine,
  onScrub,
}: {
  path: readonly LifecycleTransition[];
  at: number;
  machine: Pick<MachineGraph, 'edges' | 'verbs'>;
  onScrub: (i: number) => void;
}) {
  const now = new Date(useNow(60_000));
  const routes = new Set(machine.edges.map((e) => `${e.from}->${e.to}`));
  if (path.length === 0) return <p className="text-body-medium text-muted-foreground">Its journal has nothing on it yet.</p>;
  return (
    <div className="space-y-2">
      <Scrubber path={path} at={at} onScrub={onScrub} />
      <ol aria-label="The path" className="space-y-0.5 font-mono text-body-small">
        {path.map((s, i) => {
          const verb = byPerson(path, i, machine.verbs);
          const offGraph = !verb && i > 0 && path[i - 1].state !== s.state && !routes.has(`${path[i - 1].state}->${s.state}`);
          return (
            <li key={i} data-entry={i} data-state-at={s.state} aria-current={i === at ? 'step' : undefined}>
              <AriaButton
                onPress={() => onScrub(i)}
                className={cn(
                  'flex w-full items-baseline gap-2 rounded px-1.5 py-0.5 text-left hover:bg-accent',
                  focusRing(),
                  i === at && 'bg-alive-container text-on-alive-container',
                  i > at && 'text-muted-foreground',
                )}
              >
                <span className="flex min-w-0 flex-1 flex-wrap gap-x-2 *:whitespace-nowrap">
                  <span data-said>
                    <span className="font-semibold">{s.state}</span> <span className="text-muted-foreground">← {s.event}</span>
                  </span>
                  {verb && (
                    <span data-by-person={verb} className="text-muted-foreground italic">
                      (by a person: {verb})
                    </span>
                  )}
                  {offGraph && <span className="text-muted-foreground">(no edge)</span>}
                </span>
                <span className="shrink-0 text-muted-foreground">{clockWord(new Date(s.at), now)}</span>
              </AriaButton>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
