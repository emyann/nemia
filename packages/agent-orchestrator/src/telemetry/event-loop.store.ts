/**
 * The daemon's event loop, watched while it lasts (`eventLoopWatched`): the api serves in the same process as the store's pass, so a pass
 * that holds the loop delays every request. Its delay is measured by Node (`monitorEventLoopDelay`) and recorded into a histogram the
 * process exports with its other series (`EVENT_LOOP_DELAY`), and a stall past a bound is logged once, naming the span of the daemon that
 * was running as the loop came back: the most recent one still open, which the process's tracer, wrapped, keeps (`openSpans`).
 */
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { Effect, Metric, Tracer } from 'effect';

/**
 * The event loop's delay, in ms, as Node measures it: the time a timer of the loop's fired past its due. Named in OpenTelemetry's family
 * of Node's runtime (`nodejs.eventloop.delay.*`, gauges of percentiles in seconds), a histogram here and in ms, as the daemon's other
 * durations are (`pass.duration`), so a collector reads its percentiles over any window and beside a pass's time.
 */
export const EVENT_LOOP_DELAY = Metric.histogram('nodejs.eventloop.delay', {
  description: "the daemon's event loop's delay, in ms: how late a timer of the loop fired",
  boundaries: [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000],
});

/** How the loop is watched: a stall past `stallMs` is logged; Node's measure is read into the histogram every `everyMs`. */
export type LoopWatch = { stallMs: number; everyMs: number };

/** The daemon's watch: a stall past a second is logged, and the histogram filled every 10 s, as the process exports its series. */
const DAEMON_WATCH: LoopWatch = { stallMs: 1_000, everyMs: 10_000 };

/** How often the watch's own timer is due, in ms: the stall it sees ends no later than this past the loop's coming back. */
const BEAT_MS = 100;

/** Node's measure's resolution, in ms: the loop is sampled this often. */
const RESOLUTION_MS = 10;

/**
 * The delays Node's measure saw, one per sample, read off its percentiles (`percentiles`, each percentile's value in ns) and its sample
 * count: each step between two percentiles holds its share of the samples at the higher one's value, in ms. Its histogram keeps no samples,
 * and its percentiles bound them from above.
 * @param percentiles Each percentile of the measure, from 0 to 100, and the delay at it in ns.
 * @param count The samples the measure took.
 */
export const delaysOf = (percentiles: ReadonlyMap<number, number>, count: number) => {
  const steps = [...percentiles].sort(([a], [b]) => a - b);
  const out: number[] = [];
  let taken = 0;
  for (const [percentile, ns] of steps) {
    const upTo = Math.round((percentile / 100) * count);
    for (; taken < upTo; taken++) out.push(ns / 1e6);
  }
  return out;
};

/** The span's name and its parents' names, innermost first. */
const namedOf = (span: Tracer.Span) => {
  const chain: string[] = [];
  let at: Tracer.AnySpan | undefined = span;
  while (at !== undefined && chain.length < 12) {
    chain.push(at._tag === 'Span' ? at.name : `external ${at.spanId}`);
    at = at._tag === 'Span' && at.parent._tag === 'Some' ? at.parent.value : undefined;
  }
  return { name: span.name, chain };
};

/**
 * `inner`, the process's tracer, with every span it starts kept in `open` until it ends, in the order started: the last is the one
 * started most recently and still open, the span a fiber of the daemon was in when it last gave the loop up.
 * @param inner The tracer the process gave, which still makes and exports every span.
 * @param open The spans open, kept in the order started.
 */
const openSpans = (inner: Tracer.Tracer, open: Set<Tracer.Span>) =>
  Tracer.make({
    span(options) {
      const span = inner.span(options);
      const end = span.end.bind(span);
      open.add(span);
      span.end = (endTime, exit) => {
        open.delete(span);
        end(endTime, exit);
      };
      return span;
    },
    ...(inner.context ? { context: inner.context.bind(inner) } : {}),
  });

/** The span started most recently that is still open, or undefined where none is. */
const runningOf = (open: ReadonlySet<Tracer.Span>) => {
  let last: Tracer.Span | undefined;
  for (const span of open) last = span;
  return last && namedOf(last);
};

/**
 * The watch's own timer, every `BEAT_MS` for ever: a beat that comes later than `watch.stallMs` past its due is a stall, logged as a
 * warning annotated with how long the loop was held (`heldMs`) and the span running as it came back (`span`, and its parents, `spans`);
 * every `watch.everyMs`, what Node's measure saw since it was read last is recorded into `EVENT_LOOP_DELAY`.
 */
const watched = (watch: LoopWatch, open: ReadonlySet<Tracer.Span>) =>
  Effect.gen(function* () {
    const measure = monitorEventLoopDelay({ resolution: RESOLUTION_MS });
    measure.enable();
    yield* Effect.addFinalizer(() => Effect.sync(() => measure.disable()));
    let read = performance.now();
    for (;;) {
      const due = performance.now() + BEAT_MS;
      yield* Effect.sleep(BEAT_MS);
      const now = performance.now();
      const late = now - due;
      if (late > watch.stallMs) {
        const running = runningOf(open);
        yield* Effect.logWarning(
          `the event loop was held ${(late / 1000).toFixed(1)} s, so every request waited as long; ${running ? `the daemon was in ${running.chain.join(' < ')}` : 'no span of the daemon was open'} as it came back: a CPU profile of the daemon (node --cpu-prof) names what held it`,
        ).pipe(Effect.annotateLogs({ heldMs: Math.round(late), span: running?.name ?? null, spans: running?.chain ?? [] }));
      }
      if (now - read < watch.everyMs) continue;
      read = now;
      const delays = delaysOf(measure.percentiles, measure.count);
      measure.reset();
      for (const ms of delays) yield* Metric.update(EVENT_LOOP_DELAY, ms);
    }
  });

/**
 * `program` run with the event loop watched (`watched`, by `watch`) on a fiber of the scope's, its spans and every fiber's it forks kept
 * open while they are (`openSpans`), through the tracer the process gives: what the daemon (`up`) runs in, so the stall's line names the
 * step of the pass, or of a sweep, that held the loop.
 * @param program What runs with the loop watched: the daemon.
 * @param watch When a stall is logged and how often the histogram is filled; the daemon's (`DAEMON_WATCH`) unless given.
 */
export const eventLoopWatched = <A, E, R>(program: Effect.Effect<A, E, R>, watch: LoopWatch = DAEMON_WATCH) =>
  Effect.gen(function* () {
    const open = new Set<Tracer.Span>();
    const tracer = openSpans(yield* Effect.tracer, open);
    yield* Effect.forkScoped(Effect.scoped(watched(watch, open)));
    return yield* Effect.withTracer(program, tracer);
  });
