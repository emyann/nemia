import type { StatsDay, StatsMark } from '../lib/api';
import { seriesOf, type HeadlineNumber } from '../lib/stats';

/** A day's column across, and the chart's height, in the drawing's own units: it is stretched to the width it is given. */
const COLUMN = 10;
const HEIGHT = 60;

/** How tall the line drawn for a measured 0 is, at the foot of its column, apart from nothing drawn for a day nothing measured. */
const ZERO = 1.5;

/** What changed on a day, in words: each mark's kind and name. */
const changedWords = (marks: readonly StatsMark[]): string => marks.map((m) => `${m.kind} ${m.name}`).join(', ');

/**
 * One headline number's daily chart: a column per day served (`data-day`, its value as JSON in `data-value`, null kept), a bar for a
 * number, a line at the foot for a measured 0 and nothing for a day nothing measured, each day's value in words on hover; and a rule on
 * each day a run froze something that differs from the run before it (`data-mark-day`), naming what changed. The bars are scaled to the
 * largest known value, said above the drawing; the first and the last day are said beneath it.
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
  const scale = max > 0 ? max : 1;
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
      ) : (
        <p className="flex h-24 items-center justify-center text-xs text-neutral-500 dark:text-neutral-400">No day to draw.</p>
      )}
      {points.length > 0 && (
        <div className="flex justify-between border-t border-neutral-200 pt-1 font-mono text-[10px] text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
          <span>{points[0].day}</span>
          <span>{points[points.length - 1].day}</span>
        </div>
      )}
    </figure>
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
  const height = value === null ? 0 : (value / scale) * HEIGHT;
  return (
    <g data-day={day} data-value={JSON.stringify(value)}>
      <title>{`${day}: ${number.words(value)}${changed ? ` — changed: ${changedWords(changed)}` : ''}`}</title>
      <rect x={x} y={0} width={COLUMN} height={HEIGHT} className="fill-transparent hover:fill-neutral-500/10" />
      {value !== null && value > 0 && (
        <rect data-bar x={x + 1} y={HEIGHT - height} width={COLUMN - 2} height={height} className="fill-sky-600 dark:fill-sky-400" />
      )}
      {value === 0 && (
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
