/**
 * Every file of `src` that still reads runs past a Run door a program is given: through `runsAtOnce` (`src/runs/runs.store.ts`), the
 * door's synchronous spelling over the files at the module's own root, or through `keptRuns` (`src/record/files.store.ts`), with how
 * many uses each holds (`run-store.test.ts`). A debt, and nothing else: until the Run door is rooted as the Factory door is, such a read
 * reads the module's root, never the `StoreRoot` or the `RunDoor` the program was given.
 *
 * It only shrinks: a file moved onto a door it is given takes its line away, a count cut is lowered here, and a file this does not name
 * may hold none at all.
 */

/** Each file by its path from the package, and its uses of `runsAtOnce` and `keptRuns`, comments left out. */
export const RUN_DOOR_DEBT: Readonly<Record<string, number>> = {
  'src/branches/merges.verb.ts': 1,
  'src/brief/handed.verb.ts': 1,
  'src/cap/cap.verb.ts': 1,
  'src/cli/decide/decide.ts': 1,
  'src/cli/runs.ts': 1,
  'src/collide/collisions.verb.ts': 1,
  'src/costs/costs.verb.ts': 1,
  'src/ending/ending.verb.ts': 2,
  'src/factory/factory.verb.ts': 1,
  'src/factory/object/schedule.verb.ts': 1,
  'src/forget/forget.verb.ts': 4,
  'src/forget/forgetting/forgetting.verb.ts': 2,
  'src/forget/prune/prune.verb.ts': 9,
  'src/gate/commands.verb.ts': 3,
  'src/gate/gate.verb.ts': 2,
  'src/inbox/inbox.store.ts': 1,
  'src/object/commands.verb.ts': 2,
  'src/pause/pause.verb.ts': 3,
  'src/rest/informer.verb.ts': 1,
  'src/retry/retry.verb.ts': 1,
  'src/revisions/pin.verb.ts': 2,
  'src/round/round.verb.ts': 2,
  'src/standing/standing.verb.ts': 2,
  'src/start/commands.verb.ts': 1,
  'src/start/start.verb.ts': 4,
  'src/summary/reads.verb.ts': 1,
  'src/summary/summary.verb.ts': 1,
  'src/tick/advance.verb.ts': 5,
  'src/try/try.verb.ts': 1,
  'src/workflows/workflows.verb.ts': 1,
};
