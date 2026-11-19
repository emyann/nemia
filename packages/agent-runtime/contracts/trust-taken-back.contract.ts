/**
 * Which of Claude Code's per-folder records (`projects["<path>"]` in its `.claude.json`) go with a folder Nemia made and is removing
 * (agent-runtime, src/harness/claude/trust.ts, `claudeKeyUnder`): the folder's own record, and the record of every folder inside it, and
 * no other. A run's frozen home (`runs/<id>/home/<hex>/`) is trusted before its first session, and Claude Code keeps a record of its own
 * for every folder a session starts in; when the run is forgotten, every such record under its `runs/<id>/home` is taken back, so the
 * file does not grow with every run. A record of another run whose id begins alike (`r-1` beside `r-10`), or of a folder beside the home
 * whose name begins alike (`home` beside `homes`), is a person's or another run's, and is never taken.
 *
 * Pure: the caller hands it each key of the file's `projects` as written and the folder resolved, and removes what it answers true for.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** `key` names the folder `folder` itself, or a folder inside it: the folder followed by a separator and more. */
const within = (key: string, folder: string) => key === folder || key.startsWith(folder + '/');

const claudeKeyUnderSpec = spec<(key: string, folder: string) => boolean>({
  requires: ({ input: [, folder] }) => folder.length > 1 && folder.startsWith('/') && !folder.endsWith('/'),
  ensures: {
    takesTheFolderAndWhatIsInside: {
      description:
        "The record of the folder being removed, and of every folder inside it, is taken back with it: a run's home goes with the records Claude Code kept of it",
      condition: ({ input: [key, folder], output }) => !within(key, folder) || output,
    },
    leavesEveryOtherRecord: {
      description:
        'A record of any folder that is neither the folder removed nor inside it is left as it is: a sibling whose name begins alike, a parent, or another run whose id begins alike is never taken',
      condition: ({ input: [key, folder], output }) => within(key, folder) || !output,
    },
  },
});

/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type ClaudeKeyUnder = Implementation<typeof claudeKeyUnderSpec>;
