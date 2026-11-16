/**
 * The files a start hands its run, as the start's form lists them before it is pressed (`inputsAdded`, src/lib/startInputs.ts): files
 * dropped on the form's drop zone, or picked with its file trigger, are added to the list it holds. A run finds each input by its name
 * (the api copies each into the run's own `inputs/` under it), so the list holds a name once: a file added under a name already listed
 * takes its place, where it stood, the last of the files added under one name winning; every other file listed stays, in its order, and
 * the files added under new names follow, in the order they were added. Nothing is listed that was not listed or added.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A file as the list reads it: its own name, which the run finds it by, and its size in bytes. A browser's `File` is one. */
export type ListedInput = { readonly name: string; readonly size: number };

/** Whether `files` names `name`. */
const names = (files: readonly ListedInput[], name: string): boolean => files.some((f) => f.name === name);

/** The last of `files` named `name`, or undefined where none is. */
const lastNamed = (files: readonly ListedInput[], name: string): ListedInput | undefined =>
  [...files].reverse().find((f) => f.name === name);

const inputsAddedSpec = spec<(listed: readonly ListedInput[], added: readonly ListedInput[]) => readonly ListedInput[]>({
  /** The list the form holds names each file once, as this function leaves it. */
  requires: ({ input: [listed] }) => listed.every((f, i) => listed.findIndex((g) => g.name === f.name) === i),
  ensures: {
    aNameIsListedOnce: {
      description: 'The list names each file once: a run finds its inputs by name',
      condition: ({ output }) => output.every((f, i) => output.findIndex((g) => g.name === f.name) === i),
    },
    theLastAddedUnderANameWins: {
      description: 'Of the files added under one name, the last added is the one listed',
      condition: ({ input: [, added], output }) => added.every((f) => output.includes(lastNamed(added, f.name) as ListedInput)),
    },
    aFileListedStaysUnlessReplaced: {
      description: 'A file listed under a name nothing added names stays listed',
      condition: ({ input: [listed, added], output }) => listed.every((f) => names(added, f.name) || output.includes(f)),
    },
    nothingIsListedThatWasNotGiven: {
      description: 'Every file listed was listed before or added now',
      condition: ({ input: [listed, added], output }) => output.every((f) => listed.includes(f) || added.includes(f)),
    },
    aReplacedFileKeepsItsPlace: {
      description: 'A file added under a name already listed stands where the one it replaces stood',
      condition: ({ input: [listed, added], output }) =>
        listed.every((f, i) => !names(added, f.name) || output[i] === lastNamed(added, f.name)),
    },
    theListedComeFirst: {
      description: 'The files listed before keep their order, ahead of the files added under new names',
      condition: ({ input: [listed], output }) => output.length >= listed.length && listed.every((f, i) => output[i]?.name === f.name),
    },
  },
});

/**
 * `inputsAdded`'s type, which src/lib/startInputs.ts takes: written generic over the list's own items (`<T extends ListedInput>`, a
 * browser's `File`) and held to this by `satisfies`, so the form keeps its files' type.
 */
export type InputsAdded = Implementation<typeof inputsAddedSpec>;
