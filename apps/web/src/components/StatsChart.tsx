import type { StatsDay, StatsMark } from '../lib/api';
import { columnDrawn, seriesOf, type HeadlineNumber } from '../lib/stats';

/** A day's column across, and the chart's height, in the drawing's own units: it is stretched to the width it is given. */
const COLUMN = 10;
const HEIGHT = 60;

/** The widest a day's column is drawn, in pixels: a short period is drawn narrow rather than as a few wide blocks. */
const WIDEST = 48;

/** How tall the line drawn for a measured 0 is, at the foot of its column, apart from nothing drawn for a day nothing measured. */
const ZERO = 1.5;

/** What changed on a day, in words: each mark's kind and name. */
const changedWords = (marks: readonly StatsMark[]): string => marks.map((m) => `${m.kind} ${m.name}`).join(', ');

/**
 * One headline number's daily chart: a column per day served (`data-day`, its value as JSON in `data-value`, null kept), a bar for a
 * number, a line at the foot for a measured 0 and nothing for a day nothing measured, each day's value in words on hover; and a rule on
 * each day a run froze something that differs from the run before it (`data-mark-day`), naming what changed. The bars are scaled to the
 * largest known value, said above the drawing — `—` where nothing was measured; the first and the last day are said beneath it, as month
 * and day, the year being the period's.
 */
export function StatsChart({
  number,
  days,
  marks,
}: {
  number: HeadlineNumber;
  days: readonly StatsDay[];
  marks: ReadonlyMap<string, StatsMark[]>;
}) {
  const { points, max } = seriesOf(days, number.key);
  const scale = max !== null && max > 0 ? max : 1;
  return (
    <figure data-chart={number.key} className="min-w-0 space-y-1 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <figcaption className="flex items-baseline justify-between gap-2 text-xs">
        <span className="min-w-0 truncate" title={number.about}>
          <span className="font-medium text-neutral-900 dark:text-neutral-100">{number.label}</span>{' '}
          <span className="text-neutral-500 dark:text-neutral-400">{number.about}</span>
        </span>
        <span className="shrink-0 text-neutral-500 tabular-nums dark:text-neutral-400" title="The top of the scale">
          {number.words(max)}
        </span>
      </figcaption>
      {points.length ? (
        <div style={{ maxWidth: points.length * WIDEST }}>
          <DayColumns points={points} scale={scale} number={number} marks={marks} />
          <div className="flex justify-between border-t border-neutral-200 pt-1 font-mono text-[10px] text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
            <span title={points[0].day}>{points[0].day.slice(5)}</span>
            {points.length > 1 && <span title={points[points.length - 1].day}>{points[points.length - 1].day.slice(5)}</span>}
          </div>
        </div>
      ) : (
        <p className="flex h-24 items-center justify-center text-xs text-neutral-500 dark:text-neutral-400">No day to draw.</p>
      )}
    </figure>
  );
}

/** The drawing: a column per day (`DayColumn`), stretched to the width it is given. */
function DayColumns({
  points,
  scale,
  number,
  marks,
}: {
  points: ReadonlyArray<{ day: string; value: number | null }>;
  scale: number;
  number: HeadlineNumber;
  marks: ReadonlyMap<string, StatsMark[]>;
}) {
  return (
    <svg
      viewBox={`0 0 ${points.length * COLUMN} ${HEIGHT}`}
      preserveAspectRatio="none"
      className="block h-24 w-full overflow-visible"
      role="img"
      aria-label={`${number.label}, a day at a time`}
    >
      {points.map(({ day, value }, i) => (
        <DayColumn key={day} day={day} value={value} at={i} scale={scale} number={number} changed={marks.get(day)} />
      ))}
    </svg>
  );
}

/**
 * One day's column, the `at`th: the day and its value in words on hover, a bar scaled to `scale` for a number, a line at the foot for a
 * measured 0, nothing for null, and a rule naming what `changed` that day, if anything did.
 */
function DayColumn({
  day,
  value,
  at,
  scale,
  number,
  changed,
}: {
  day: string;
  value: number | null;
  at: number;
  scale: number;
  number: HeadlineNumber;
  changed: readonly StatsMark[] | undefined;
}) {
  const x = at * COLUMN;
  const drawn = columnDrawn(value, scale);
  return (
    <g data-day={day} data-value={JSON.stringify(value)}>
      <title>{`${day}: ${number.words(value)}${changed ? ` — changed: ${changedWords(changed)}` : ''}`}</title>
      <rect x={x} y={0} width={COLUMN} height={HEIGHT} className="fill-transparent hover:fill-neutral-500/10" />
      {drawn.kind === 'bar' && (
        <rect
          data-bar
          x={x + 1}
          y={HEIGHT - drawn.share * HEIGHT}
          width={COLUMN - 2}
          height={drawn.share * HEIGHT}
          className="fill-sky-600 dark:fill-sky-400"
        />
      )}
      {drawn.kind === 'zero' && (
        <rect data-zero x={x + 1} y={HEIGHT - ZERO} width={COLUMN - 2} height={ZERO} className="fill-sky-600 dark:fill-sky-400" />
      )}
      {changed && (
        <line
          data-mark-day={day}
          x1={x + COLUMN / 2}
          x2={x + COLUMN / 2}
          y1={0}
          y2={HEIGHT}
          vectorEffect="non-scaling-stroke"
          strokeWidth={1.5}
          className="stroke-violet-500 dark:stroke-violet-400"
        >
          <title>{`${day}: changed ${changedWords(changed)}`}</title>
        </line>
      )}
    </g>
  );
}
