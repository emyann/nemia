/**
 * Where an entry of the board's stories baseline is filed (apps/web, test/baseline.ts, `shardOf`): the baseline is a folder,
 * `test/baseline/<list>/`, with one text file for each source file that still owes something on that list, at that source file's path
 * under `apps/web/src/` with `.txt` after it, holding that file's entries of the list, one a line. So two changes that each cut the
 * entries of different source files delete different files, which git merges clean however near the entries sat in one list, and two
 * that both mend one source file both delete the same file, which git merges clean too.
 *
 * An entry is a path from the workspace root (`apps/web/src/components/run/HoldRun.tsx`), or that path, `#`, and what the list keys
 * in it (`apps/web/src/components/run/HoldRun.tsx#@/components/ui/button:Button`, `…/Said.stories.tsx#Yours`): only the path decides the
 * file, never the key.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** The baseline's lists, each a folder of its own under `test/baseline/`. */
export type BaselineList = 'storyless' | 'argless' | 'secondSystem' | 'handDrawn' | 'a11yTodo';

/** The folder every source path of an entry starts with. */
const SRC = 'apps/web/src/';

/** The baseline's folder, from the workspace root. */
const FOLDER = 'apps/web/test/baseline/';

/** The source file an entry names: all of it before its first `#`, or all of it where it has none. */
const sourceOf = (entry: string): string => (entry.includes('#') ? entry.slice(0, entry.indexOf('#')) : entry);

const shardOfSpec = spec<(list: BaselineList, entry: string) => string>({
  requires: ({ input: [, entry] }) => sourceOf(entry).startsWith(SRC) && sourceOf(entry).length > SRC.length,
  ensures: {
    filedUnderItsList: {
      description: "An entry is filed in its own list's folder, never another list's",
      condition: ({ input: [list], output }) => output.startsWith(FOLDER + list + '/'),
    },
    filedByItsSourceFile: {
      description: "An entry is filed at its source file's path under src, as text, whatever the list keys in that file",
      condition: ({ input: [list, entry], output }) => output === FOLDER + list + '/' + sourceOf(entry).slice(SRC.length) + '.txt',
    },
  },
});
export type ShardOf = Implementation<typeof shardOfSpec>;

/** A file of one list's folder as the tree holds it: its path from the workspace root, and its lines, each an entry. */
export type Filed = { readonly file: string; readonly entries: readonly string[] };

/** An entry that sits in a file other than its own. */
export type Astray = { readonly file: string; readonly entry: string };

/** What a list's folder holds against its layout: each entry filed where it does not belong, and each file left with no entry. */
export type FiledApart = { readonly astray: readonly Astray[]; readonly empty: readonly string[] };

/** The file `entry` belongs in on `list`, or none where it names no source file under src. */
const homeOf = (list: BaselineList, entry: string): string | undefined =>
  sourceOf(entry).startsWith(SRC) && sourceOf(entry).length > SRC.length
    ? FOLDER + list + '/' + sourceOf(entry).slice(SRC.length) + '.txt'
    : undefined;

/** Whether `files` names no file twice. */
const onceEach = (files: readonly Filed[]): boolean => files.every((one, at) => !files.slice(0, at).some((it) => it.file === one.file));

const astraySpec = spec<(list: BaselineList, file: string, entry: string) => boolean>({
  ensures: {
    astrayExactlyWhereFiledElsewhere: {
      description: 'An entry is refused as astray exactly when the file it sits in is not the one its source file has on its list',
      condition: ({ input: [list, file, entry], output }) => output === (homeOf(list, entry) !== file),
    },
  },
});
export type IsAstray = Implementation<typeof astraySpec>;

const misfiledSpec = spec<(list: BaselineList, files: readonly Filed[]) => FiledApart>({
  requires: ({ input: [, files] }) => onceEach(files),
  /**
   * That `misfiled` names as astray exactly the entries `isAstray` refuses, each in its file, is a fold over every file's entries,
   * a `flatMap` whose law of `.some` over the result runs out of the solver's work on tsverify 0.9.0 (as `shared-lines.contract.ts`'s
   * do): what is astray is `astrayExactlyWhereFiledElsewhere`'s, above, proved of each entry, and the fold is held by
   * `test/stories.test.ts`.
   */
  ensures: {
    emptyExactlyWhereNoEntry: {
      description: 'A file is refused as empty exactly when it holds no entry, so a mended file is deleted rather than emptied',
      condition: ({ input: [, files], output }) =>
        files.every(({ file, entries }) => output.empty.includes(file) === (entries.length === 0)) &&
        output.empty.every((file) => files.some((it) => it.file === file)),
    },
  },
});
export type Misfiled = Implementation<typeof misfiledSpec>;
