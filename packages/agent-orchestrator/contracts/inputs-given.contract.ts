/**
 * Where a step finds the run's inputs copied into its own workspace (agent-orchestrator, src/workspace/workspace.ts, `inputsGiven`): the
 * files `nemia start --input` gave the run and the cards `--card` handed it, which the run copies in so that a step puts one where it
 * belongs with a copy inside its workspace, never one that reads from outside it. One name in every kind of place, `given/inputs`: a
 * folder step's folder (`folderPlace.make`), and a worktree its place cuts for a step of a repository run (the place's `make`, asked with
 * `given`, which keeps the copy out of what a hand-off commits). Read by the cut, which asks the copy, and by the brief, which names it,
 * so the brief never names a copy nobody made. Never in a checkout a person works in: a step on `workspace: base`, and every step of a
 * repository run without isolation, which works in the repository itself.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * What of a run says whether its inputs are copied into a step's workspace: its place (`{ kind: 'folder' }` for a folder run, absent for
 * a repository run), whether a repository run cuts a worktree per line of work (`isolate`, absent on a folder run), and the files and the
 * cards it was handed, by name.
 */
export type InputsRun = {
  readonly place?: { readonly kind: 'folder' };
  readonly isolate?: boolean;
  readonly inputs?: readonly string[];
  readonly cards?: readonly string[];
};

/**
 * How a step's workspace comes to be, closed, as `workspacePlan` says it: continued, cut from one parent, merged from several, or the
 * base.
 */
export type CutKind = 'inherit' | 'fork' | 'merge' | 'base';

/** The one path, from a step's workspace, the run's inputs are copied to. */
export type GivenInputs = 'given/inputs';

/** Whether the run was handed anything to copy: a file, or a card. */
const handedAny = (run: InputsRun) => (run.inputs?.length ?? 0) > 0 || (run.cards?.length ?? 0) > 0;

/** Whether the run is a folder run. */
const isFolderRun = (run: InputsRun) => run.place?.kind === 'folder';

const inputsGivenSpec = spec<(run: InputsRun, plan: { readonly kind: CutKind }) => GivenInputs | null>({
  ensures: {
    noneWithoutFiles: {
      description: 'A run handed no file and no card copies nothing into any workspace',
      condition: ({ input: [run], output }) => handedAny(run) || output === null,
    },
    neverOnBase: {
      description: "A step on the base works in the person's own checkout, and nothing is copied into it",
      condition: ({ input: [, plan], output }) => plan.kind !== 'base' || output === null,
    },
    neverInAnUnisolatedCheckout: {
      description: "A repository run without isolation works in the person's own checkout, and nothing is copied into it",
      condition: ({ input: [run], output }) => isFolderRun(run) || run.isolate === true || output === null,
    },
    folderStepsGiven: {
      description: "Every step of a folder run handed files or cards, but on the base, finds them in its folder's given/inputs",
      condition: ({ input: [run, plan], output }) =>
        !(isFolderRun(run) && handedAny(run) && plan.kind !== 'base') || output === 'given/inputs',
    },
    worktreesGiven: {
      description:
        'Every step of an isolated repository run handed files or cards, but on the base, finds them in its worktree\'s given/inputs',
      condition: ({ input: [run, plan], output }) =>
        !(!isFolderRun(run) && run.isolate === true && handedAny(run) && plan.kind !== 'base') || output === 'given/inputs',
    },
  },
});

/** The type of where a step finds the run's inputs copied into its workspace, or null where none is copied (`inputsGiven`). */
export type InputsGiven = Implementation<typeof inputsGivenSpec>;
