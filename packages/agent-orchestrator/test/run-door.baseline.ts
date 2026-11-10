/**
 * Every file of `src` that still reads runs past a Run door a program is given: through `runsAtOnce(home)` (`src/runs/runs.store.ts`),
 * the door's synchronous spelling over the files at the root it is handed, or through `keptRuns(home, …)` (`src/record/files.store.ts`),
 * with how many calls each holds (`run-store.test.ts`). A debt, and nothing else: such a read goes past the `RunDoor` the program was
 * given, so a test's memory door never sees it. The count was taken over `runsAtOnce.` while the door's spelling read the module's root,
 * and holds over `runsAtOnce(` call for call: a respelling lowers no count.
 *
 * It only shrinks: a file moved onto a door it is given takes its line away, a count cut is lowered here, and a file this does not name
 * may hold none at all.
 */

/** Each file by its path from the package, and its calls of `runsAtOnce` and `keptRuns`, comments left out. */
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
