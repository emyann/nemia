/**
 * The runs a picker offers (the start form's runs to wait on and to read, a hold's runs to wait on): the runs not finished, read once as
 * the picker opens (`openRunsQuery`), then the finished runs a page at a time (`finishedPagesQuery`), one page more each time a person asks
 * (Show older). Never every run at once.
 */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { judged } from './api/judged.ts';
import { finishedPagesQuery, openRunsQuery, type FinishedPage, type FinishedRun, type ListedRun, type OpenRuns } from './api/runs.ts';

/** The runs a picker lists: the open, newest created first, then the finished, newest finished first. */
type PickedRuns = { open: ListedRun[]; finished: FinishedRun[] };

/**
 * The runs a picker lists, off the open runs and the finished pages read so far: the runs that wait and those in flight together, each
 * judged, newest created first (a run the list could not judge has nothing to pick it by and is left out); then every finished run of the
 * pages in their order, each once and none already listed as open (a run that finished between the two reads, or a page that slid).
 */
export function pickedOf(open: OpenRuns, pages: readonly FinishedPage[]): PickedRuns {
  const opened = [...open.waiting, ...open.inFlight]
    .filter(judged)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const seen = new Set(opened.map((run) => run.id));
  const finished = pages
    .flatMap((page) => page.runs)
    .filter((run) => {
      if (seen.has(run.id)) return false;
      seen.add(run.id);
      return true;
    });
  return { open: opened, finished };
}

/**
 * The runs a picker offers while it is open: `open` and `finished` as `pickedOf` orders them, each empty until both reads answer;
 * `more` while the finished runs have an older page, and `older()` asks for it; `reading` until both answer; `error` the first read's
 * refusal. The open runs are read as the picker opens, not on the list's beat; the feed and a write read both again.
 */
export function usePickerRuns(): PickedRuns & { more: boolean; older: () => void; reading: boolean; error: Error | null } {
  const open = useQuery({ ...openRunsQuery(), refetchInterval: false });
  const pages = useInfiniteQuery(finishedPagesQuery());
  const picked = open.data && pages.data ? pickedOf(open.data, pages.data.pages) : { open: [], finished: [] };
  return {
    ...picked,
    more: pages.hasNextPage,
    older: () => {
      if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
    },
    reading: !open.data || !pages.data,
    error: open.error ?? pages.error,
  };
}
