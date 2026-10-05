import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { factoryDaysQuery, seriesQuery, type SeriesRange, type SeriesRead, type StatsHealth } from '@/lib/api';
import { msWord } from '@/lib/pass';
import { landingsOf, placeOf, rangeFrom, SERIES_RANGES, systemCharts, type Landings, type SystemChart, type Trace } from '@/lib/series';
import { dollars, durationWord, NONE } from '@/lib/stats';
import { useNow } from '@/lib/useNow';

const BOX = 'min-w-0 space-y-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800';
const QUIET = 'text-neutral-500 dark:text-neutral-400';

/** The drawing's own units: it is stretched to the width it is given. */
const WIDTH = 300;
const HEIGHT = 80;

/** The colours of a chart's lines, in the order of its traces; an area is drawn grey behind them. */
const TONES = [
  { line: 'stroke-sky-600 dark:stroke-sky-400', swatch: 'bg-sky-600 dark:bg-sky-400' },
  { line: 'stroke-amber-600 dark:stroke-amber-400', swatch: 'bg-amber-600 dark:bg-amber-400' },
  { line: 'stroke-violet-600 dark:stroke-violet-400', swatch: 'bg-violet-600 dark:bg-violet-400' },
  { line: 'stroke-emerald-600 dark:stroke-emerald-400', swatch: 'bg-emerald-600 dark:bg-emerald-400' },
] as const;
const AREA = { fill: 'fill-neutral-400/25 dark:fill-neutral-500/25', swatch: 'bg-neutral-400/50 dark:bg-neutral-500/50' };

/**
 * The system, as the daemon kept its passes (`GET /api/series`) over a range picked here (`data-range`, `data-active` on the one shown): a
 * chart each of a pass's time against the store, admission, and quota burn; each factory's landings and their cost a day
 * (`GET /api/stats?by=factory`); and `health`, the system's over the page's period, beside them. At `#system`. A read that fails is said
 * here, and the rest of the page stands.
 */
export function StatsSystem({ health }: { health: StatsHealth | undefined }) {
  const [range, setRange] = useState<SeriesRange>('24h');
  const { data, error } = useQuery(seriesQuery(range));
  return (
    <section id="system" data-system aria-label="The system" className="scroll-mt-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">
          The system <span className={`font-normal ${QUIET}`}>— what the daemon kept of its passes, a minute and an hour at a time</span>
        </h2>
        <div className="flex gap-1" role="group" aria-label="Range">
          {SERIES_RANGES.map(({ id, label }) => (
            <Button
              key={id}
              variant={id === range ? 'secondary' : 'ghost'}
              size="sm"
              onPress={() => setRange(id)}
              data-range={id}
              data-active={id === range || undefined}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      {error ? (
        <p data-system-error className="text-xs text-red-600 dark:text-red-400">
          The system's series could not be read: {error.message}
        </p>
      ) : !data ? (
        <p className={`text-xs ${QUIET}`}>Reading the system's series…</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {systemCharts(data).map((chart) => (
            <SeriesChart key={chart.key} chart={chart} read={data} />
          ))}
          <FactoryLandings range={range} />
          {health && <HealthFacts health={health} />}
        </div>
      )}
    </section>
  );
}

/** A trace's latest value, in its words. */
const latestWords = (trace: Trace): string => trace.words(trace.values[trace.values.length - 1].v);

/**
 * One chart (`data-system-chart`): its traces over the range, each a line (`data-trace`, its count of values in `data-points`) or a grey
 * area behind them, scaled to its own top; a legend saying each one's latest and top; and the range's first and last moment beneath.
 * With no trace, it says nothing was kept over the range.
 */
function SeriesChart({ chart, read }: { chart: SystemChart; read: SeriesRead }) {
  const lines = chart.traces.filter((t) => !t.area);
  const frame = { from: read.from, to: read.to, width: WIDTH, height: HEIGHT };
  return (
    <figure data-system-chart={chart.key} className={BOX}>
      <figcaption className="text-xs">
        <span className="font-medium text-neutral-900 dark:text-neutral-100">{chart.title}</span>{' '}
        <span className={QUIET}>— {chart.about}</span>
      </figcaption>
      {chart.traces.length ? (
        <>
          <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
            {chart.traces.map((trace) => (
              <li key={trace.key} className="flex items-center gap-1" title={`${trace.label}: at most ${trace.words(trace.top)}`}>
                <span className={`inline-block size-2 rounded-sm ${trace.area ? AREA.swatch : TONES[lines.indexOf(trace) % 4].swatch}`} />
                <span className={QUIET}>{trace.label}</span>
                <span className="font-mono tabular-nums">{latestWords(trace)}</span>
              </li>
            ))}
          </ul>
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            className="block h-24 w-full overflow-visible"
            role="img"
            aria-label={`${chart.title}, a point a ${read.span}`}
          >
            {chart.traces.map((trace) => (
              <TracePath key={trace.key} trace={trace} frame={{ ...frame, top: trace.top }} tone={lines.indexOf(trace)} />
            ))}
          </svg>
          <div className={`flex justify-between border-t border-neutral-200 pt-1 font-mono text-[10px] dark:border-neutral-800 ${QUIET}`}>
            <span title={read.from}>{momentWord(read.from, read.span)}</span>
            <span title={read.to}>{momentWord(read.to, read.span)}</span>
          </div>
        </>
      ) : (
        <p data-system-none className={`flex h-24 items-center justify-center text-xs ${QUIET}`}>
          Nothing kept over this range yet.
        </p>
      )}
    </figure>
  );
}

/** A moment as the chart's foot says it, in UTC: the month, the day and the time for a range of minutes, the month and day otherwise. */
const momentWord = (iso: string, span: SeriesRead['span']): string =>
  span === 'minute' ? `${iso.slice(5, 10)} ${iso.slice(11, 16)}` : iso.slice(5, 10);

/** One trace drawn: a grey area down to the foot, or a line in the `tone`th colour; a lone value a dot. */
function TracePath({ trace, frame, tone }: { trace: Trace; frame: Parameters<typeof placeOf>[1]; tone: number }) {
  const places = trace.values.map((value) => placeOf(value, frame));
  const at = places.map(([x, y]) => `${x},${y}`).join(' ');
  if (trace.area) {
    const [first, last] = [places[0], places[places.length - 1]];
    return (
      <polygon
        data-trace={trace.key}
        data-points={places.length}
        points={`${first[0]},${HEIGHT} ${at} ${last[0]},${HEIGHT}`}
        className={AREA.fill}
      />
    );
  }
  return (
    <polyline
      data-trace={trace.key}
      data-points={places.length}
      points={places.length === 1 ? `${at} ${places[0][0] + 1},${places[0][1]}` : at}
      fill="none"
      vectorEffect="non-scaling-stroke"
      strokeWidth={places.length === 1 ? 4 : 1.5}
      className={TONES[tone % 4].line}
    />
  );
}

/**
 * Each factory's landings over the range (`data-landings`, a row each, `data-factory`): a column per day the api answered (`data-day`),
 * scaled to the most landed on a day, and how many landed and what they cost in all (`data-totals`).
 */
function FactoryLandings({ range }: { range: SeriesRange }) {
  const now = new Date(useNow(60_000));
  const { data, error } = useQuery(factoryDaysQuery(rangeFrom(range, now)));
  const rows = data ? landingsOf(data) : [];
  return (
    <figure data-landings className={BOX}>
      <figcaption className="text-xs">
        <span className="font-medium text-neutral-900 dark:text-neutral-100">Landed, by factory</span>{' '}
        <span className={QUIET}>— the runs landed a day, and what they cost</span>
      </figcaption>
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400">The landings could not be read: {error.message}</p>
      ) : !data ? (
        <p className={`text-xs ${QUIET}`}>Reading the landings…</p>
      ) : rows.length ? (
        <ul className="space-y-2 text-xs">
          {rows.map((row) => (
            <LandingRow key={row.factory} row={row} most={Math.max(1, ...rows.flatMap((r) => r.days.map((d) => d.landed)))} />
          ))}
        </ul>
      ) : (
        <p data-system-none className={`flex h-24 items-center justify-center text-xs ${QUIET}`}>
          No run landed over this range.
        </p>
      )}
    </figure>
  );
}

/** One factory's row: its name, a column a day scaled to `most`, and its totals. */
function LandingRow({ row, most }: { row: Landings; most: number }) {
  return (
    <li data-factory={row.factory} data-landed={row.landed} className="space-y-0.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate font-mono">{row.factory}</span>
        <span data-totals className="shrink-0 font-mono tabular-nums">
          {row.landed} landed · {row.costUsd === null ? NONE : dollars(row.costUsd)}
        </span>
      </div>
      <div className="flex h-6 items-end gap-px">
        {row.days.map((d) => (
          <span
            key={d.day}
            data-day={d.day}
            title={`${d.day}: ${d.landed} landed${d.costUsd === null ? '' : `, ${dollars(d.costUsd)}`}`}
            className="min-w-0 flex-1 rounded-t-sm bg-sky-600 dark:bg-sky-400"
            style={{ height: d.landed ? `${(d.landed / most) * 100}%` : 1, opacity: d.landed ? 1 : 0.3 }}
          />
        ))}
      </div>
    </li>
  );
}

/** A figure, or `—` where nothing was kept. */
const or = (v: number | null, words: (v: number) => string): string => (v === null ? NONE : words(v));

/** The system's health over the page's period (`data-health`, a line each, `data-fact`): its figures, `—` where nothing was kept. */
function HealthFacts({ health }: { health: StatsHealth }) {
  const load = (v: number) => v.toFixed(2);
  const facts: Array<[string, string, string]> = [
    ['pass', 'a pass, p50 / p95', `${or(health.pass.p50, msWord)} / ${or(health.pass.p95, msWord)} ms`],
    ['runs', 'runs in the store, at most', or(health.runs, String)],
    ['reads', 'journal reads a pass, p95', or(health.reads, (v) => `${Math.round(v)}`)],
    ['load', 'load a core, p95 / most', `${or(health.load.p95, load)} / ${or(health.load.max, load)}`],
    ['queued', 'sessions queued, at most', or(health.queued, String)],
    ['wait', 'longest wait to start', or(health.waitMs, durationWord)],
    ['checks', 'load as a check started, p50', or(health.checkLoad, load)],
    ...health.quota.map((q): [string, string, string] => [
      `quota ${q.harness} ${q.window}`,
      `${q.harness} ${q.window}, now / peak`,
      `${Math.round(q.latest)}% / ${Math.round(q.peak)}%`,
    ]),
  ];
  return (
    <figure data-health className={BOX}>
      <figcaption className="text-xs">
        <span className="font-medium text-neutral-900 dark:text-neutral-100">Its health</span>{' '}
        <span className={QUIET}>— over the period the page shows</span>
      </figcaption>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-xs">
        {facts.map(([key, label, value]) => (
          <div key={key} data-fact={key} className="contents">
            <dt className={QUIET}>{label}</dt>
            <dd className="text-right font-mono tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}
