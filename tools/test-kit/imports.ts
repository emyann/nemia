/**
 * What a piece of source imports, read by pattern rather than by the compiler: the scanners the layout tests, the boundary tests and
 * the door-debt tests of every workspace share. A line of prose is read as nothing, so a comment that quotes an import is no import.
 */
import path from 'node:path';

/** A line of prose — a `//` line, or a line of a block comment — read as nothing, with the line kept so numbers still count. */
export const withoutComments = (text: string): string =>
  text
    .split('\n')
    .map((line) => (/^\s*(\/\/|\/\*|\*)/.test(line) ? '' : line))
    .join('\n');

/** A module a file names, and whether the import is erased: `import type`, `export type`, or braces of `type` names only. */
export type Import = { spec: string; typeOnly: boolean };

/** Every module a piece of source names outside its comment lines, and whether each import is erased. */
export function importsIn(text: string): Import[] {
  const code = withoutComments(text);
  const out: Import[] = [];
  for (const m of code.matchAll(/^\s*(?:import|export)\s+(type\s+)?([^'"`;]*?)\s*\bfrom\s*['"]([^'"]+)['"]/gm)) {
    const braces = /^\{([\s\S]*)\}$/.exec((m[2] ?? '').trim());
    const members = braces
      ? (braces[1] ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    out.push({ spec: m[3] ?? '', typeOnly: Boolean(m[1]) || (members.length > 0 && members.every((s) => /^type\s/.test(s))) });
  }
  for (const m of code.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) out.push({ spec: m[1] ?? '', typeOnly: false });
  for (const m of code.matchAll(/\bimport\s*\(\s*['"`]([^'"`]+)['"`]/g)) out.push({ spec: m[1] ?? '', typeOnly: false });
  return out;
}

/** A call that names a module by its first argument: a dynamic import, a `require`, and the two resolvers. */
export type Call = 'import' | 'require' | 'import.meta.resolve' | 'require.resolve';

/** How `specifiersIn` reads: the calls it counts as naming a module, and whether such a call must close on its one argument. */
export type Reading = { calls?: readonly Call[]; closed?: boolean };

const ALL_CALLS: readonly Call[] = ['import', 'require', 'import.meta.resolve', 'require.resolve'];

/**
 * Every module a piece of source names, once each and sorted: imports and re-exports, type-only included, a bare `import 'x'`, and
 * each call of `calls` (every one by default). With `closed`, a call counts only when its argument is the whole of it (`import('x')`,
 * never `import('x' + y)`). Comment lines are read as code: blank them first with `withoutComments` where prose must not count.
 */
export function specifiersIn(text: string, { calls = ALL_CALLS, closed = false }: Reading = {}): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/gm)) found.add(m[1] ?? '');
  for (const m of text.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) found.add(m[1] ?? '');
  if (calls.length > 0) {
    const names = calls.map((call) => call.replaceAll('.', '\\.')).join('|');
    const call = new RegExp(`\\b(?:${names})\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]${closed ? '\\s*\\)' : ''}`, 'g');
    for (const m of text.matchAll(call)) found.add(m[1] ?? '');
  }
  return [...found].sort();
}

/** The path a relative specifier in `file` names, from the same place `file` is named from; undefined for a package or a builtin. */
export const resolved = (file: string, spec: string): string | undefined =>
  spec.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)) : undefined;
