/**
 * Each folder the pass found of the runs a run is handed (agent-orchestrator, src/handed-folders/handed-folders.ts, `handedFolders`),
 * which `handedRunMounts`'s laws read (`handed-runs.contract.ts`), leaning on what this spec proves of it.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * A run this one is handed (`--from`, a card's `from:`, the run that routed on to it), as the pass found its folders on disk when it
 * files a step: its id, and its `artifacts/` and its `inputs/`, each absolute and present only where it is a directory now (a run given
 * no input has no `inputs/`; a run forgotten has neither).
 */
export type HandedRunFolders = { run: string; artifacts?: string; inputs?: string };

const handedFoldersSpec = spec<(found: readonly HandedRunFolders[]) => string[]>({
  ensures: {
    onlyTheirs: {
      description: "Only a handed run's artifacts and inputs folders, as the pass found them, are listed",
      condition: ({ input: [found], output }) => output.every((p) => found.some((f) => f.artifacts === p || f.inputs === p)),
    },
    everyArtifacts: {
      description: "Every handed run's artifacts folder the pass found is listed",
      condition: ({ input: [found], output }) => found.every((f) => f.artifacts === undefined || output.includes(f.artifacts)),
    },
    everyInputs: {
      description: "Every handed run's inputs folder the pass found is listed",
      condition: ({ input: [found], output }) => found.every((f) => f.inputs === undefined || output.includes(f.inputs)),
    },
  },
});

/** The type of each folder the pass found of the runs a run is handed, by its absolute path (`handedFolders`, src/handed-folders/handed-folders.ts). */
export type HandedFolders = Implementation<typeof handedFoldersSpec>;

