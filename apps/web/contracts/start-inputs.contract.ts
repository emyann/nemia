/**
 * The files a start hands its run, as the start's form lists them before it is pressed (`inputAdded`, src/lib/startInputs.ts): each file
 * dropped on the form's drop zone, or picked with its file trigger, is added to the list it holds, one after another in the order they
 * came. A run finds each input by its name (the api copies each into the run's own `inputs/` under it), so the list holds a name once: a
 * file added under a name already listed takes its place, where it stood, and so the last of the files added under one name wins; every
 * other file listed stays, in its order, and a file under a new name follows them. Nothing is listed that was not listed or added.
 *
 * A file is told apart by its name and its size, as the list shows it: the verifier compares no records by identity.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A file as the list reads it: its own name, which the run finds it by, and its size in bytes. A browser's `File` is one. */
export type ListedInput = { readonly name: string; readonly size: number };

/** Whether `a` and `b` are one file as the list reads it: the same name and size. */
const same = (a: ListedInput, b: ListedInput): boolean => a.name === b.name && a.size === b.size;

/** Whether `files` holds `file`. */
const holds = (files: readonly ListedInput[], file: ListedInput): boolean => files.some((f) => same(f, file));

/** The largest size a file is counted to, a safe integer's. */
const MOST_BYTES = 9_007_199_254_740_991;

/** Whether `file` has a size as a browser's file has: a count of bytes, none below 0, none past a safe integer. */
const sized = (file: ListedInput): boolean => file.size >= 0 && file.size <= MOST_BYTES;

const inputAddedSpec = spec<(listed: readonly ListedInput[], added: ListedInput) => readonly ListedInput[]>({
  /** The list the form holds names each file once, as this function leaves it; every file has a size, as a browser's has. */
  requires: ({ input: [listed, added] }) =>
    sized(added) && listed.every((f, i) => sized(f) && !listed.slice(0, i).some((g) => g.name === f.name)),
  ensures: {
    aNameIsListedOnce: {
      description: 'The list names each file once: a run finds its inputs by name',
      condition: ({ output }) => output.every((f, i) => !output.slice(0, i).some((g) => g.name === f.name)),
    },
    aNewNameIsListedLast: {
      description: 'A file added under a name nothing listed names is listed after them all',
      condition: ({ input: [listed, added], output }) => {
        const last = output.at(listed.length);
        return listed.some((f) => f.name === added.name) || (last !== undefined && same(last, added));
      },
    },
    aFileListedStaysUnlessReplaced: {
      description: 'A file listed under another name than the added one stays listed',
      condition: ({ input: [listed, added], output }) => listed.every((f) => f.name === added.name || holds(output, f)),
    },
    nothingIsListedThatWasNotGiven: {
      description: 'Every file listed was listed before or is the one added',
      condition: ({ input: [listed, added], output }) => output.every((f) => holds(listed, f) || same(f, added)),
    },
    aReplacedFileKeepsItsPlace: {
      description: 'A file added under a name already listed stands where the one it replaces stood',
      condition: ({ input: [listed, added], output }) =>
        listed.every((f, i) => {
          const standing = output.at(i);
          return f.name !== added.name || (standing !== undefined && same(standing, added));
        }),
    },
    theListedComeFirst: {
      description: 'The files listed before keep their order, ahead of a file added under a new name',
      condition: ({ input: [listed], output }) => output.length >= listed.length && listed.every((f, i) => output.at(i)?.name === f.name),
    },
  },
});

/**
 * `inputAdded`'s type at `ListedInput`, which src/lib/startInputs.ts's `inputAddedOf` takes: the form's own `inputAdded` is generic over
 * the list's items (a browser's `File`), so it keeps its files' type, and the verifier reads no generic function.
 */
export type InputAdded = Implementation<typeof inputAddedSpec>;
