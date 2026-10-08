/** The store's own refusal of a root its steps' permission rules cannot name, asked at start before the runtime's. */
import { unruledIn } from 'agent-runtime/vocabulary';
import type { Workflow } from '../step/step.ts';
import { readsRunArtifacts } from '../ending/ending.ts';
import { filedFolders } from '../filed/filed.ts';
import { DEFAULT_HARNESS, isRemoteHarness } from '../harness/harness.ts';

/** The store's folders a start asks of its steps' first filing: the run's artifacts folder, the inbox, and its inputs folder if given. */
type StoreFolders = { runArtifacts: string; inbox: string; inputs?: string };

/** What a step's first filing would name under the store in a permission rule, or undefined where it names nothing there. */
const ruledUnderStore = (step: Workflow, steps: readonly Workflow[], t: StoreFolders): string | undefined => {
  if (readsRunArtifacts(step)) return "a read of its run's artifacts folder";
  const { handed, store, inputs } = filedFolders(step, steps, t);
  if (handed.length) return 'the artifacts folders of the steps before it';
  if (store.length) return 'the inbox';
  return inputs.length ? "the run's inputs folder" : undefined;
};

/**
 * Why the store at `root` (`WF_ROOT`) cannot start `steps` — or undefined: the first local step whose first filing would name a folder
 * under it in a permission rule (`readsRunArtifacts`, `filedFolders`, with `t` the run's artifacts folder, the inbox, and the run's inputs
 * folder for a run given inputs) on a harness whose rules cannot carry a character of `root` (`unruledIn`), so the rule would name another
 * folder, or none. Its words name the step, `WF_ROOT`, its value and the character, and the fix: a root of plain characters, the store's
 * folder moved there. A root every rule carries, or steps that name nothing under it in a rule, are let through. Pure.
 */
export const storeRootRefusal = (root: string, steps: readonly Workflow[], t: StoreFolders): string | undefined => {
  for (const step of steps.filter((s) => !isRemoteHarness(s.harness))) {
    const what = ruledUnderStore(step, steps, t);
    const char = what && unruledIn(step.harness ?? DEFAULT_HARNESS, root);
    if (char)
      return (
        `${step.name}: its harness would be given ${what} by a permission rule naming a path under the store, WF_ROOT=${root} ` +
        `(~/.agent-workflows when WF_ROOT is unset), and such a rule cannot carry the ${JSON.stringify(char)} in it: it would name another folder, or none.\n` +
        `Set WF_ROOT to a directory whose path holds only letters, digits, \`-\`, \`_\`, \`.\` and \`/\`, like WF_ROOT=/srv/wf, and move the store's folder there first to keep its runs.`
      );
  }
  return undefined;
};
