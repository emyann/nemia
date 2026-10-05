import { useQuery } from '@tanstack/react-query';
import { passesQuery, type PassesRead } from '@/lib/api';
import { bucketLabel, bucketWord, msWord, seenWords, shareWord } from '@/lib/pass';
import { clockWord } from '@/lib/quota';
import { useNow } from '@/lib/useNow';

const BOX = 'min-w-0 space-y-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800';
const QUIET = 'text-neutral-500 dark:text-neutral-400';

/**
 * The tick's pass, as the daemon kept its recent passes (`GET /api/passes`): how long they took, a column per bound of the histogram;
 * what the time went to, a bar per phase with its time a pass and share of the whole; and beside them the median and slowest pass, the
 * journal reads and what the latest pass saw in the store. At `#passes`, where the Factory's `a pass takes N ms` links. A read that fails
 * is said here, and the rest of the page stands.
 */
export function StatsPasses() {
  const { data, error } = useQuery(passesQuery);
  const now = new Date(useNow(60_000));
  const since = data?.recent[0] ? clockWord(new Date(data.recent[0].at), now) : null;
  return (
    <section id="passes" data-passes aria-label="The tick's pass" className="scroll-mt-4 space-y-2">
      <h2 className="text-sm font-medium">
        The tick's pass{' '}
        <span className={`font-normal ${QUIET}`}>
          —{' '}
          {data?.summary
            ? `the last ${data.summary.passes} the daemon kept, since ${since}`
            : 'each pass reads the store, decides and acts'}
        </span>
      </h2>
      {error ? (
        <p data-passes-error className="text-xs text-red-600 dark:text-red-400">
          The recent passes could not be read: {error.message}
        </p>
      ) : !data ? (
        <p className={`text-xs ${QUIET}`}>Reading the recent passes…</p>
      ) : !data.summary ? (
        <p data-passes-none className={`text-xs ${QUIET}`}>
          No pass is kept yet: the daemon keeps its recent passes as it ticks the store, and they are drawn here.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Histogram read={data} />
          <Parts parts={data.parts} />
          <Facts summary={data.summary} />
        </div>
      )}
    </section>
  );
}

/**
 * How long the recent passes took: a column per bucket (`data-bucket`, `over` past the last bound) with its count, scaled to the
 * fullest.
 */
function Histogram({ read }: { read: PassesRead }) {
  const fullest = Math.max(1, ...read.histogram.map((b) => b.count));
  return (
    <figure data-histogram className={BOX}>
      <figcaption className="text-xs">
        <span className="font-medium text-neutral-900 dark:text-neutral-100">How long a pass took</span>{' '}
        <span className={QUIET}>— the passes in each bucket, up to its bound in ms</span>
      </figcaption>
      <div className="flex h-28 items-end gap-1">
        {read.histogram.map((b) => (
          <div
            key={b.le ?? 'over'}
            data-bucket={b.le ?? 'over'}
            data-count={b.count}
            title={`${bucketWord(b.le, read.bounds)}: ${b.count} ${b.count === 1 ? 'pass' : 'passes'}`}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-0.5"
          >
            <span className={`font-mono text-[10px] tabular-nums ${b.count ? 'text-neutral-700 dark:text-neutral-300' : QUIET}`}>
              {b.count}
            </span>
            <span
              className="w-full rounded-t-sm bg-sky-600 dark:bg-sky-400"
              style={{ height: b.count ? `${Math.max(2, (b.count / fullest) * 80)}%` : 1, opacity: b.count ? 1 : 0.3 }}
            />
          </div>
        ))}
      </div>
      <div className={`flex gap-1 border-t border-neutral-200 pt-1 font-mono text-[10px] dark:border-neutral-800 ${QUIET}`}>
        {read.histogram.map((b) => (
          <span key={b.le ?? 'over'} className="min-w-0 flex-1 truncate text-center">
            {bucketLabel(b.le, read.bounds)}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** What the time went to: each phase a pass on average, heaviest first (`data-part`), its bar its share of the whole. */
function Parts({ parts }: { parts: PassesRead['parts'] }) {
  return (
    <figure data-parts className={BOX}>
      <figcaption className="text-xs">
        <span className="font-medium text-neutral-900 dark:text-neutral-100">What the time went to</span>{' '}
        <span className={QUIET}>— each part of a pass, on average</span>
      </figcaption>
      <ul className="space-y-1 text-xs">
        {parts.map((p) => (
          <li key={p.phase} data-part={p.phase} data-share={p.share} className="flex items-center gap-2">
            <span className="w-16 shrink-0 font-mono">{p.phase}</span>
            <span className="h-2 min-w-0 flex-1 rounded-sm bg-neutral-100 dark:bg-neutral-800">
              <span className="block h-full rounded-sm bg-sky-600 dark:bg-sky-400" style={{ width: `${p.share * 100}%` }} />
            </span>
            <span className="w-24 shrink-0 text-right font-mono tabular-nums">
              {msWord(p.ms)} ms <span className={QUIET}>{shareWord(p.share)}</span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** The numbers beside the drawings (`data-fact`): the median and slowest pass, the journal reads and what the latest pass saw. */
function Facts({ summary }: { summary: NonNullable<PassesRead['summary']> }) {
  const facts: Array<[string, string, string]> = [
    ['median', 'a pass, the median', `${msWord(summary.medianMs)} ms`],
    ['slowest', 'the slowest pass', `${msWord(summary.slowestMs)} ms`],
    ['reads', 'journal reads, the last pass', `${summary.reads}`],
    ['runs', 'runs in the store', `${summary.runs}`],
    ['tasks', 'tasks not settled', `${summary.tasks}`],
    ['queued', 'sessions queued', `${summary.queued}`],
    ['admitted', 'sessions admitted', `${summary.admitted}`],
  ];
  return (
    <figure data-facts className={`${BOX} md:col-span-2 xl:col-span-1`} title={`The last pass saw ${seenWords(summary)}.`}>
      <figcaption className="text-xs">
        <span className="font-medium text-neutral-900 dark:text-neutral-100">Beside it</span>{' '}
        <span className={QUIET}>— the reads and the store, as the last pass saw them</span>
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
