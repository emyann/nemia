/**
 * Whether the person's folder listing may read a folder (`folderReach`, src/factory/folders/folders.ts): the help a path field gives
 * names the folders under what the person typed, and only under the roots the store lets it read (`WF_FOLDER_ROOTS`, else the home of
 * the user the daemon runs as), never inside a store (Nemia's `WF_ROOT`, the runtime's `AE_ROOT`), whose runs, cards, tokens and
 * worktrees no listing names. Pure: the folder is handed in already resolved (`fs.realpath`), so a link out of a root is judged where
 * it leads.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** Where a folder stands for the listing: under a root and in no store (`within`), in a store (`store`), or under no root (`outside`). */
export type FolderReach = 'within' | 'store' | 'outside';

/** Whether the absolute path `inner` is `outer` or a folder under it, by whole segments: `/home/a` is not under `/home/ab`. */
const under = (inner: string, outer: string): boolean =>
  inner === outer || inner.startsWith(outer.endsWith('/') ? outer : `${outer}/`);

const folderReachSpec = spec<(real: string, roots: readonly string[], stores: readonly string[]) => FolderReach>({
  requires: ({ input: [real, roots, stores] }) =>
    real.startsWith('/') && roots.every((r) => r.startsWith('/')) && stores.every((s) => s.startsWith('/')),
  ensures: {
    aStoreIsNeverListed: {
      description: 'A folder inside a store, or a store itself, is never read, whatever root holds it',
      condition: ({ input: [real, , stores], output }) => !stores.some((s) => under(real, s)) || output === 'store',
    },
    withinOnlyUnderARoot: {
      description: 'A folder is read only when it is a root or under one, by whole segments',
      condition: ({ input: [real, roots], output }) => output !== 'within' || roots.some((r) => under(real, r)),
    },
    underARootAndNoStoreIsRead: {
      description: 'A folder under a root and in no store is read',
      condition: ({ input: [real, roots, stores], output }) =>
        !(roots.some((r) => under(real, r)) && !stores.some((s) => under(real, s))) || output === 'within',
    },
    outsideIsUnderNoRoot: {
      description: 'A folder is said outside only when it is under no root and in no store',
      condition: ({ input: [real, roots, stores], output }) =>
        output !== 'outside' || (!roots.some((r) => under(real, r)) && !stores.some((s) => under(real, s))),
    },
  },
});

/** `folderReach`'s type, which src/factory/folders/folders.ts takes. */
export type FolderReachOf = Implementation<typeof folderReachSpec>;
