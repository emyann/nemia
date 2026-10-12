import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button as AriaButton, Slider, SliderThumb, SliderTrack, ToggleButton, ToggleButtonGroup } from 'react-aria-components';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Sheet, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { machineQuery, stepPathQuery, type LifecycleStep, type MachineGraph, type RunDetail, type StepPath } from '@/lib/api';
import { byPerson, centredScroll, litAt, pathPoll, pathStamp, takenRoutes } from '@/lib/lifecyclePath';
import { clockWord } from '@/lib/quota';
import { useNow } from '@/lib/useNow';
import { MachineCanvas } from './MachineCanvas';

type Step = RunDetail['steps'][number];

/** The machine the panel draws a task's path on: the runtime's lifecycle, as the `/machines` page draws it. */
const LIFECYCLE = 'lifecycle';

/** The tallest the lifecycle is drawn in the panel: the conversation under it keeps the rest of the page. */
const CANVAS_MAX_HEIGHT = 420;

/** The title the path is shown under, in the panel and full width. */
const PATH_TITLE = "The task's path through the runtime's lifecycle";

/**
 * A step's Debug panel, closed by default: opened, the task of one of its tries — the current one unless a person picks another — as it
 * moved through the runtime's lifecycle, drawn over the lifecycle's graph, with a timeline to scrub back through, and a button that opens
 * the same lit graph full width, at a size its names can be read. Nothing of it is read or drawn while it is closed.
 */
export function DebugPanel({ run, step }: { run: RunDetail; step: Step }) {
  return (
    <section aria-label="Debug" className="shrink-0 border-b">
      <Collapsible>
        {({ isExpanded }) => (
          <>
            <CollapsibleTrigger className="w-full px-4 py-1.5 text-left text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
              {isExpanded ? '▾' : '▸'} Debug
            </CollapsibleTrigger>
            <CollapsibleContent>{isExpanded && <DebugBody run={run} step={step} />}</CollapsibleContent>
          </>
        )}
      </Collapsible>
    </section>
  );
}

/** The panel opened: the lifecycle's graph read first, then the path drawn on it. */
function DebugBody({ run, step }: { run: RunDetail; step: Step }) {
  const machine = useQuery(machineQuery(LIFECYCLE));
  if (machine.error) {
    return (
      <p className="px-4 pb-3 text-sm text-red-600 dark:text-red-400">Could not read the lifecycle's graph: {machine.error.message}</p>
    );
  }
  if (!machine.data) return <p className="px-4 pb-3 text-sm text-muted-foreground">Reading the lifecycle…</p>;
  return <PathOf run={run} step={step} machine={machine.data} />;
}

/**
 * One try's path on the lifecycle: the state it stands in lit, the routes it took to get there drawn over the graph, and a timeline of
 * every entry of its journal. The timeline follows the newest entry until a person moves it, and again once they move it back to the end;
 * picking another try follows that try's newest. The graph opened full width is drawn from the same read and the same entry shown.
 */
function PathOf({ run, step, machine }: { run: RunDetail; step: Step; machine: MachineGraph }) {
  const [tryNumber, setTryNumber] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const poll = (r: StepPath | undefined) => pathPoll(r, machine.final, tryNumber === null);
  const read = useQuery(stepPathQuery(run.id, step.name, pathStamp(step), tryNumber, poll));
  const path = read.data?.path ?? [];
  const last = path.length - 1;
  const at = pinned === null ? last : Math.min(pinned, last);
  const lit = litAt(path, at);
  const taken = takenRoutes(path, at, machine);
  const current = step.tries.find((t) => t.current)?.try ?? step.tries.length;
  const pick = (n: number) => {
    setTryNumber(n === current ? null : n);
    setPinned(null);
  };
  const onScrub = (i: number) => setPinned(i >= last ? null : i);

  return (
    <div className="max-h-[60svh] space-y-2 overflow-y-auto px-4 pb-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          {PATH_TITLE}
          {read.data?.taskId ? (
            <>
              {' '}
              — <code className="font-mono">{read.data.taskId}</code>
            </>
          ) : null}
        </span>
        {read.data?.taskId && path.length > 0 ? (
          <WideGraph machine={machine} taskId={read.data.taskId} path={path} at={at} lit={lit} taken={taken} onScrub={onScrub} />
        ) : null}
        {step.tries.length > 1 && <TryPicker step={step} shown={tryNumber ?? current} onPick={pick} />}
      </div>
      {read.error ? (
        <p className="text-sm text-red-600 dark:text-red-400">Could not read the path: {read.error.message}</p>
      ) : !read.data ? (
        <p className="text-sm text-muted-foreground">Reading the path…</p>
      ) : read.data.taskId === null ? (
        <p className="text-sm text-muted-foreground">Not filed yet, so there is no path to show.</p>
      ) : (
        <div
          data-path={read.data.taskId}
          data-reading={read.isPlaceholderData || undefined}
          className={`grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem] ${read.isPlaceholderData ? 'opacity-60' : ''}`}
        >
          <MachineCanvas machine={machine} id="debug-lifecycle" lit={lit} taken={taken} maxHeight={CANVAS_MAX_HEIGHT} />
          <Timeline path={path} at={at} machine={machine} onScrub={onScrub} />
        </div>
      )}
    </div>
  );
}

/** Which of a step's tries the panel shows: one toggle a try, the current one said so. */
function TryPicker({ step, shown, onPick }: { step: Step; shown: number; onPick: (n: number) => void }) {
  return (
    <ToggleButtonGroup
      aria-label="Which try"
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[String(shown)]}
      onSelectionChange={(keys) => onPick(Number([...keys][0]))}
      className="flex gap-1"
    >
      {step.tries.map((t) => (
        <ToggleButton
          key={t.try}
          id={String(t.try)}
          className="rounded border px-1.5 py-0.5 text-[11px] outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-selected:border-amber-500 data-selected:text-foreground dark:data-selected:border-amber-400"
        >
          {t.current ? `try ${t.try} (current)` : `try ${t.try}`}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
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
  path: readonly LifecycleStep[];
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
        <SheetHeader className="gap-2 border-b border-neutral-200 pr-14 dark:border-neutral-800">
          <SheetTitle>{PATH_TITLE}</SheetTitle>
          <SheetDescription>
            <code className="font-mono text-xs">{taskId}</code>
          </SheetDescription>
          <div className="max-w-xl">
            <Scrubber path={path} at={at} onScrub={onScrub} />
          </div>
        </SheetHeader>
        <LitInView lit={lit}>
          <MachineCanvas machine={machine} id="debug-lifecycle-wide" lit={lit} taken={taken} />
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
function Scrubber({ path, at, onScrub }: { path: readonly LifecycleStep[]; at: number; onScrub: (i: number) => void }) {
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
          <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded bg-neutral-200 dark:bg-neutral-800" />
          <SliderThumb className="top-1/2 size-4 rounded-full border-2 border-amber-500 bg-white outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:border-amber-400 dark:bg-neutral-900" />
        </SliderTrack>
      </Slider>
      <p data-shown className="text-xs text-muted-foreground">
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
  path: readonly LifecycleStep[];
  at: number;
  machine: Pick<MachineGraph, 'edges' | 'verbs'>;
  onScrub: (i: number) => void;
}) {
  const now = new Date(useNow(60_000));
  const routes = new Set(machine.edges.map((e) => `${e.from}->${e.to}`));
  if (path.length === 0) return <p className="text-sm text-muted-foreground">Its journal has nothing on it yet.</p>;
  return (
    <div className="space-y-2">
      <Scrubber path={path} at={at} onScrub={onScrub} />
      <ol aria-label="The path" className="space-y-0.5 font-mono text-[11px]">
        {path.map((s, i) => {
          const verb = byPerson(path, i, machine.verbs);
          const offGraph = !verb && i > 0 && path[i - 1].state !== s.state && !routes.has(`${path[i - 1].state}->${s.state}`);
          return (
            <li key={i} data-entry={i} data-state-at={s.state} aria-current={i === at ? 'step' : undefined}>
              <AriaButton
                onPress={() => onScrub(i)}
                className={`flex w-full items-baseline gap-2 rounded px-1.5 py-0.5 text-left outline-none hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-ring/50 dark:hover:bg-neutral-800 ${i === at ? 'bg-amber-100 dark:bg-amber-950' : ''} ${i > at ? 'text-muted-foreground dark:text-neutral-600' : ''}`}
              >
                <span className="flex min-w-0 flex-1 flex-wrap gap-x-2 *:whitespace-nowrap">
                  <span data-said>
                    <span className="font-semibold">{s.state}</span> <span className="text-muted-foreground">← {s.event}</span>
                  </span>
                  {verb && (
                    <span data-by-person={verb} className="text-violet-700 italic dark:text-violet-300">
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
