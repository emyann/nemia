/**
 * What the person's folder listing answers of one folder's entries (`folderNamesShown`, src/factory/folders/folders.ts): the names of the
 * folders in it that begin with what the person typed after its last slash, and nothing else of the disk — no file, no size, no time, no
 * contents. A hidden folder (a name opening with a dot) is named only when what was typed opens with one. At most `most` names, in order,
 * and whether more were left out, so the answer stays small whatever the folder holds. Pure: the entries are read and handed in.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** One entry of the folder as it was read: its name, and whether it is a folder (a link followed to one counts). */
export type FolderEntry = { readonly name: string; readonly folder: boolean };

/** The names answered, in order, and whether some that would be were left out past the bound. */
export type FolderNamesShown = { readonly names: readonly string[]; readonly more: boolean };

/** Whether `e` is one the listing would name for what was typed, `prefix`. */
const named = (e: FolderEntry, prefix: string): boolean =>
  e.folder && e.name.startsWith(prefix) && (!e.name.startsWith('.') || prefix.startsWith('.'));

/**
 * Whether the name `a` comes before the name `b`, and is not it, in the order of their code units, as JavaScript sorts strings: the sort
 * of the two alone puts `a` first.
 */
const before = (a: string, b: string): boolean => a !== b && [a, b].sort()[0] === a;

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
    ascendingOnce: {
      description: 'The names are answered in order, each once: each comes before the next',
      condition: ({ output }) => output.names.slice(1).every((n, i) => before(output.names[i] ?? n, n)),
    },
    firstOnes: {
      description: 'The names answered are the first ones: every folder the listing would name and left out comes after each one answered',
      condition: ({ input: [entries, prefix], output }) =>
        entries.every((e) => !named(e, prefix) || output.names.includes(e.name) || output.names.every((n) => before(n, e.name))),
    },
    noneLeftOutUnsaid: {
      description: 'Every folder the listing would name is answered, or the answer says more were left out, and says so only then',
      condition: ({ input: [entries, prefix], output }) =>
        output.more === entries.some((e) => named(e, prefix) && !output.names.includes(e.name)),
    },
    fullUpToTheBound: {
      description: 'Where some are left out, the bound is filled',
      condition: ({ input: [, , most], output }) => !output.more || output.names.length === most,
    },
  },
});

/** `folderNamesShown`'s type, which src/factory/folders/folders.ts takes. */
export type FolderNamesShownOf = Implementation<typeof folderNamesShownSpec>;
