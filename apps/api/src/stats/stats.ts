/** The flow numbers of every run in the store, for the board: what `nemia stats --json` prints. */
import { STATS, statsQueryOf, type QueryKey, type Stats } from 'agent-orchestrator';
import type { StatsQuery } from 'objects';
import type { Served } from '../layer.ts';

/** `GET /api/stats`' query, as objects' `StatsQuery` declares it. */
/** The query `StatsQuery` declares, and the label queries the api read off the request (`selectorsOf`, server/server.ts). */
type StatsAsked = { readonly [K in keyof typeof StatsQuery]?: (typeof StatsQuery)[K]['Type'] } & { readonly selector?: readonly string[] };

export type { Stats };

/**
 * The query keys `GET /api/stats` reads, by the key of the package's query each sets. The factory and the repository to keep are read
 * off `ofFactory` and `ofRepo`, since `factory` and `repo` name the place every route is answered in (`served`).
 */
const QUERY_KEYS: Record<QueryKey, keyof StatsAsked> = {
  from: 'from',
  to: 'to',
  by: 'by',
  agent: 'agent',
  step: 'step',
  workflow: 'workflow',
  factory: 'ofFactory',
  repo: 'ofRepo',
};

/**
 * - `GET /api/stats` — `Stats`, as `nemia stats --json` prints it, answered by its entry (`STATS`): the flow numbers of every run in
 *   the store, whatever factory and repository the request is answered in, like `GET /api/runs`. `from` and `to` are UTC days
 *   (YYYY-MM-DD), `by` one of agent, step, factory, workflow or repo, and `agent`, `step`, `workflow`, `ofFactory` and `ofRepo` keep only
 *   the facts that have that value, compared as strings: `ofRepo` a repository's path as a run's record names it. A number nothing
 *   measured is null, never 0: `deniedPerTry`, the mean calls a try was refused, is null on a day whose tries all ran on a harness that
 *   records no denial (codex, a remote agent) or were a recheck's, as is a step row's `deniedCalls`; its `denials`
 *   name each call refused, with a count. `skillsPerTry`, the mean skills a try's session loaded, is null on a day with no try whose
 *   session's ends all say what they loaded, as is a step row's `skillLoads`; its `skills` name each skill loaded, with a count. Its
 *   `rules` are each rule a skill the step is given declares in its `rules.json`, kept or broken over the tries whose refused calls were
 *   measured — broken when a refused call matches one of its `breaks` — empty with none declared or measured. A group's `tallies` are
 *   a row per step and field the step's frozen `tally:` names, each a `sum` and the `tries` it was measured on, over the range
 *   (`total`) and on each of its `days`: an array's items, a number's value, or the items whose boolean flag is true; `sum` is null,
 *   never 0, on a day no closeout of the step measured it. Each group carries its `marks`: the days a run froze a step, an agent or a
 *   rendered skill that differs from the run of the same factory and workflow folder before it; and its `slowLandings`: each landing check
 *   that passed in more than half the deadline its task was filed with, its `checkMs`, that `deadlineMs` and the `share`. A query the
 *   package refuses (`statsQueryOf`) is a 422 naming the key and what it takes. A run is read again only when its files in the store or its
 *   tasks' journals changed: each finished run's facts are answered from the app's memo (`ReadMemo`) while they stand, and read afresh too
 *   under `WF_VERIFY_REST=1`. `?selector=`, given again for another, keeps the facts of the runs one of them takes by their labels, as
 *   `nemia stats -l` keeps them (OR across repeats, the run's whole map read as `GET /api/runs` reads it); a selector the package's
 *   grammar refuses is a 422 naming the key or the clause.
 */
export async function statsOf(query: StatsAsked, { memo, inRequest }: Served): Promise<Stats> {
  const given = Object.fromEntries(
    (Object.entries(QUERY_KEYS) as [QueryKey, keyof StatsAsked][]).flatMap(([key, name]) => {
      const value = query[name];
      return typeof value === 'string' ? [[key, value]] : [];
    }),
  );
  statsQueryOf(given, (key) => `?${QUERY_KEYS[key]}=`);
  const selector = query.selector === undefined ? undefined : [...query.selector];
  return inRequest(STATS.handler({ ...given, ...(selector?.length ? { selector } : {}) }, { stats: memo.stats, series: memo.series }));
}
