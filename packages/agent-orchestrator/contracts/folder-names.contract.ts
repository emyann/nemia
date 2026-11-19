/**
 * What the person's folder listing answers of one folder's entries (`folderNamesShown`, src/factory/folders/folders.ts): the names of the
 * folders in it that begin with what the person typed after its last slash, and nothing else of the disk — no file, no size, no time, no
 * contents. A hidden folder (a name opening with a dot) is named only when what was typed opens with one. At most `most` names, so the
 * answer stays small whatever the folder holds. Pure: the entries are read and handed in. Their order, and whether more were left out, are
 * held by the rows of src/factory/folders/folders.verb.test.ts, not here: as laws, the solver runs out of work or memory on them.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** One entry of the folder as it was read: its name, and whether it is a folder (a link followed to one counts). */
export type FolderEntry = { readonly name: string; readonly folder: boolean };

/** The names answered, in order, and whether some that would be were left out past the bound. */
export type FolderNamesShown = { readonly names: readonly string[]; readonly more: boolean };

/** Whether `e` is one the listing would name for what was typed, `prefix`. */
const named = (e: FolderEntry, prefix: string) =>
  e.folder && e.name.startsWith(prefix) && (!e.name.startsWith('.') || prefix.startsWith('.'));

const folderNamesShownSpec = spec<(entries: readonly FolderEntry[], prefix: string, most: number) => FolderNamesShown>({
  requires: ({ input: [entries, , most] }) =>
    Number.isInteger(most) && most > 0 && entries.every((e, i) => entries.slice(0, i).every((f) => f.name !== e.name)),
  ensures: {
    onlyFoldersTyped: {
      description: 'Every name answered is a folder of the entries that begins with what was typed, never a file',
      condition: ({ input: [entries, prefix], output }) => output.names.every((n) => entries.some((e) => e.name === n && named(e, prefix))),
    },
    hiddenOnlyWhenAsked: {
      description: 'A hidden folder is named only when what was typed opens with a dot',
      condition: ({ input: [, prefix], output }) => prefix.startsWith('.') || output.names.every((n) => !n.startsWith('.')),
    },
    bounded: {
      description: 'No more than the bound is answered',
      condition: ({ input: [, , most], output }) => output.names.length <= most,
    },
    noFolderNoMore: {
      description: 'Where no folder is named, none is said left out',
      condition: ({ input: [entries, prefix], output }) => entries.some((e) => named(e, prefix)) || !output.more,
    },
  },
  open: ['output.more'],
});

/** `folderNamesShown`'s type, which src/factory/folders/folders.ts takes. */
export type FolderNamesShownOf = Implementation<typeof folderNamesShownSpec>;
