import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { StatsByStep } from '../components/StatsByStep';
import { StatsChart } from '../components/StatsChart';
import { StatsFilters } from '../components/StatsFilters';
import { StatsMarks } from '../components/StatsMarks';
import { StatsPasses } from '../components/StatsPasses';
import { StatsTiles } from '../components/StatsTiles';
import { passesQuery, statsQuery } from '../lib/api';
import { apiQueryOf, byStepOf, HEADLINES, marksByDay, searchOf } from '../lib/stats';

/**
 * The Stats page, at `/stats`: its search is the period and the filters (`searchOf`), and its loader asks the api for them as of the
 * moment it runs, handing on the query it asked and that moment, so the page and its pickers read the same days.
 */
export const Route = createFileRoute('/stats')({
  validateSearch: searchOf,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const at = new Date().toISOString();
    const query = apiQueryOf(deps, new Date(at));
    void context.queryClient.prefetchQuery(passesQuery);
    await context.queryClient.ensureQueryData(statsQuery(query));
    return { query, at };
  },
  component: StatsPage,
  staticData: { fullBleed: true },
  pendingComponent: () => <p className="px-6 py-6 text-sm text-neutral-500">Reading the runs' journals for their numbers…</p>,
  errorComponent: ({ error }) => (
    <p className="px-6 py-6 text-sm text-red-600">
      Could not load the stats: {error instanceof Error ? error.message : String(error)}. Is the api running (<code>npm run dev</code>)?
    </p>
  ),
});

/**
 * How well the factory has worked, measured: the tiles for the last 14 days against the 14 before, then a daily chart per headline number
 * over the period chosen, with a rule on each day something a run froze changed; the skills each step and agent loaded beside the calls
 * refused it, side by side on a wide screen; the changes in words; and the tick's recent passes (`StatsPasses`, at `#passes`), read on
 * their own so a failed read leaves the page standing. Every number is the api's, as the CLI's `stats` counts it; one nothing measured
 * reads — and draws nothing.
 */
function StatsPage() {
  const search = Route.useSearch();
  const { query, at } = Route.useLoaderData();
  const { data } = useSuspenseQuery(statsQuery(query));
  const marks = marksByDay(data.all.marks);
  return (
    <article className="space-y-6 px-6 py-6">
      <p className="max-w-4xl text-sm text-neutral-600 dark:text-neutral-400">
        How well the runs went, counted from their journals by UTC day. A number nothing measured reads — and draws nothing; a measured 0
        draws a line at the foot of its day. A violet rule marks a day a run froze something that differs from the run of its workflow
        before it.
      </p>
      <StatsTiles last={data.all.tiles.last} before={data.all.tiles.before} />
      <StatsFilters search={search} now={new Date(at)} />
      <section aria-label="A day at a time" className="space-y-2">
        <h2 className="text-sm font-medium">
          A day at a time{' '}
          <span className="font-normal text-neutral-500 dark:text-neutral-400">
            {data.from ? `(${data.from} → ${data.to})` : '— no try has ended, and no run has finished'}
          </span>
        </h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {HEADLINES.map((number) => (
            <StatsChart key={number.key} number={number} days={data.all.days} marks={marks} />
          ))}
        </div>
      </section>
      <div className="grid gap-6 xl:grid-cols-2">
        <StatsByStep
          title="Skills loaded"
          about="each skill a step's sessions loaded, over the tries whose sessions said"
          kind="skills"
          rows={byStepOf(data.all.steps, 'skills')}
          total="loads"
          item="skill"
        />
        <StatsByStep
          title="Calls refused"
          about="each call a step's harness refused it, over the tries whose harness records them"
          kind="denials"
          rows={byStepOf(data.all.steps, 'denials')}
          total="calls"
          item="call"
        />
      </div>
      <StatsMarks marks={data.all.marks} />
      <StatsPasses />
      {data.unreadable.length > 0 && (
        <p data-unreadable className="text-xs text-amber-700 dark:text-amber-400">
          Left out, a journal of each not reading: {data.unreadable.join(', ')}
        </p>
      )}
    </article>
  );
}
