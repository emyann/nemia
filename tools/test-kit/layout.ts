/**
 * The folder rule's judgement, written once (`docs/architecture.md`, *Folders, in every package*) and called by each package's layout
 * test over its own source, each passing its root and, where it has the face rule, which files are faced:
 *
 * - a folder is a concept, at most `<root>/<concept>/<part>/<file>` deep (`depthBreaks`), with no count of its files;
 * - no folder or file is named for no concept (`namelessBreaks`);
 * - a file outside a concept imports a part's faced code through the part's face, its `index.ts`, or its one faced file when it has
 *   none; inside the concept, any file of it by path (`faceBreaks`);
 * - no two files need each other's values (`cycles` over `valueGraph`): a type-only import is erased, so it may cycle;
 * - no source file imports a test (`testImports`), and a barrel re-exports by name (`starExports`).
 *
 * Each returns the breaks as sentences that name the fix, sorted, and an empty list for a tree that keeps the rule.
 */
import path from 'node:path';
import { importsIn, resolved, withoutComments, type Import } from './imports.ts';

/** Every set of two files or more that need each other's values, by Tarjan's strongly connected components. */
export function cycles(graph: ReadonlyMap<string, readonly string[]>): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const found: string[][] = [];
  const visit = (node: string): void => {
    const at = index.size;
    index.set(node, at);
    low.set(node, at);
    stack.push(node);
    onStack.add(node);
    for (const next of graph.get(node) ?? []) {
      if (!index.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node) ?? at, low.get(next) ?? at));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node) ?? at, index.get(next) ?? at));
      }
    }
    if (low.get(node) === at) {
      const component: string[] = [];
      let member: string | undefined;
      do {
        member = stack.pop();
        if (member === undefined) break;
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1) found.push(component.sort());
    }
  };
  for (const node of [...graph.keys()].sort()) if (!index.has(node)) visit(node);
  return found.sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? ''));
}

/** The value imports among `files`, each a path and its text: a type-only import is erased, so it may cycle. */
export const valueGraph = (files: ReadonlyMap<string, string>): Map<string, string[]> =>
  new Map(
    [...files].map(([file, text]) => [
      file,
      importsIn(text).flatMap(({ spec, typeOnly }) => {
        const target = resolved(file, spec);
        return !typeOnly && target !== undefined && files.has(target) ? [target] : [];
      }),
    ]),
  );

/** The parts of `file`'s path below `root`, or undefined for a file outside it. */
const below = (file: string, root: string): string[] | undefined =>
  file.startsWith(`${root}/`) ? file.slice(root.length + 1).split('/') : undefined;

/** The deepest a file sits under its root: `<concept>/<part>/<file>`. */
const DEPTH = 3;

/** Each file of `files` under `root` deeper than `<root>/<concept>/<part>/<file>`. */
export const depthBreaks = (files: readonly string[], root: string): string[] =>
  files
    .filter((file) => (below(file, root)?.length ?? 0) > DEPTH)
    .map(
      (file) =>
        `${file} sits ${(below(file, root)?.length ?? 0) - 1} folders under ${root}/: a folder is ${root}/<concept>/<part>/ at most — put it in its part, or make the part a concept of its own`,
    )
    .sort();

/** Names that say nothing of a concept: code split into them has no home. */
export const NAMELESS: readonly string[] = ['utils', 'helpers', 'common', 'shared', 'misc'];

/** Each file of `files` under `root` with a folder, or a file whose name before its first dot, in `NAMELESS`. */
export const namelessBreaks = (files: readonly string[], root: string): string[] =>
  files
    .flatMap((file) => {
      const nameless = below(file, root)?.find((part) => NAMELESS.includes(part.split('.')[0] ?? ''));
      return nameless === undefined
        ? []
        : [`${file} is named ${nameless.split('.')[0]}, which says no concept: put each part beside the concept that uses it`];
    })
    .sort();

/** Which of a package's files the face rule reads, and where its concepts are. */
export type Faces = {
  /** The folder whose children are the concepts: `src`. */
  root: string;
  /** Whether a file is a part's faced code, imported from outside its concept through the part's face; the rest by path. */
  faced: (file: string) => boolean;
};

/**
 * Where a file outside a concept imports a part's faced code past the part's face. The face is the part's `index.ts`, or its one
 * faced file when it has no `index.ts`; a file anywhere in the concept imports any file of it by path.
 */
export function faceBreaks(files: readonly string[], importsOf: (file: string) => readonly Import[], { root, faced }: Faces): string[] {
  const concept = (file: string): string | undefined => {
    const parts = below(file, root);
    return parts !== undefined && parts.length > 1 ? parts[0] : undefined;
  };
  const known = new Set(files);
  const isFaced = (file: string): boolean => concept(file) !== undefined && faced(file);
  const facedBy = new Map<string, string[]>();
  for (const file of files.filter(isFaced)) {
    const folder = path.posix.dirname(file);
    facedBy.set(folder, [...(facedBy.get(folder) ?? []), file]);
  }
  const faceOf = (folder: string): string | undefined => {
    const pure = facedBy.get(folder) ?? [];
    if (pure.includes(`${folder}/index.ts`)) return `${folder}/index.ts`;
    return pure.length === 1 ? pure[0] : undefined;
  };
  const out: string[] = [];
  for (const file of files) {
    for (const { spec } of importsOf(file)) {
      const target = resolved(file, spec);
      if (target === undefined || !known.has(target) || !isFaced(target) || concept(file) === concept(target)) continue;
      const folder = path.posix.dirname(target);
      const face = faceOf(folder);
      if (target === face) continue;
      out.push(
        face === undefined
          ? `${file} imports ${target}: ${folder}/ has ${facedBy.get(folder)?.length ?? 0} pure files and no index.ts — write one that re-exports them by name, and import it`
          : `${file} imports ${target}: import ${face}, the face of ${folder}/`,
      );
    }
  }
  return out.sort();
}

/** Whether a file is a test: one beside the code, or anything under `test/`. */
const isTest = (file: string): boolean => /\.test\.tsx?$/.test(file) || file.startsWith('test/');

/** Where a source file imports a test: a test beside the code, or anything under `test/`, is imported by nothing but a test. */
export const testImports = (file: string, imports: readonly Import[]): string[] =>
  imports
    .map(({ spec }) => resolved(file, spec))
    .filter((target): target is string => target !== undefined && isTest(target))
    .map((target) => `${file} imports ${target}: nothing but a test imports a test — move what both need into the source`);

/** Where a face or an entry re-exports a whole module: a barrel names what it re-exports, so a name is added on purpose. */
export const starExports = (file: string, text: string): string[] =>
  [...withoutComments(text).matchAll(/^\s*export\s*\*[^'"`;]*from\s*['"]([^'"]+)['"]/gm)].map(
    (m) => `${file} re-exports all of ${m[1]}: re-export by name`,
  );
