/**
 * Every file of `src` that still reads or writes a run through the run store (`runStore.runs`, `.asks`, `.holds`, `.refresh`,
 * `.forgetting`) rather than through the Run door (`RunDoor`, `src/runs/runs.store.ts`), with how many uses of it do
 * (`run-store.test.ts`). A debt, and nothing else: a program yields the door, whose writes are checked on every layer and whose memory
 * stand-in a test gives it; a use left on the seam is a synchronous caller S2 did not convert — a plain function of the stats, the run
 * list, the pages or the command line, or a read inside a refusal's words.
 *
 * It only shrinks: a file converted takes its line away, a count cut is lowered here, and a file this does not name may hold none at all.
 * `runStore.inbox` is no debt of this one: it is the Card door's seam (S3). The files store itself (`record/files.store.ts`) defines the
 * seam and is not counted.
 */

/** Each file by its path from the package, and its uses of the run store's run groups, comments left out. */
export const RUN_DOOR_DEBT: Readonly<Record<string, number>> = {
  'src/branches/branches.store.ts': 1,
  'src/branches/merges.verb.ts': 1,
  'src/brief/handed.verb.ts': 1,
  'src/cap/cap.verb.ts': 2,
  'src/cli/decide/decide.ts': 1,
  'src/cli/runs.ts': 1,
  'src/collide/collisions.verb.ts': 1,
  'src/command/commands.verb.ts': 1,
  'src/command/pages.verb.ts': 1,
  'src/command/reads.verb.ts': 2,
  'src/costs/costs.verb.ts': 1,
  'src/ending/ending.verb.ts': 4,
  'src/feed/word-feed.verb.ts': 1,
  'src/folder/workflows.verb.ts': 1,
  'src/forget/forget.verb.ts': 4,
  'src/forgetting/forgetting.verb.ts': 2,
  'src/gate/commands.verb.ts': 1,
  'src/gate/gate.verb.ts': 2,
  'src/inbox/inbox.verb.ts': 5,
  'src/list/list.verb.ts': 8,
  'src/pause/pause.verb.ts': 2,
  'src/prune/prune.verb.ts': 10,
  'src/rest/resting.verb.ts': 1,
  'src/retry/retry.verb.ts': 1,
  'src/revisions/pin.verb.ts': 2,
  'src/round/round.verb.ts': 2,
  'src/runlist/runlist.verb.ts': 2,
  'src/standing/standing.verb.ts': 2,
  'src/start/commands.verb.ts': 1,
  'src/start/start.verb.ts': 4,
  'src/stats/stats.verb.ts': 3,
  'src/summary/reads.verb.ts': 1,
  'src/summary/summary.verb.ts': 1,
  'src/tick/advance.verb.ts': 6,
  'src/try/try.verb.ts': 1,
};
