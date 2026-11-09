/**
 * The door-debt counter: a door's store test counts, in each file of `src`, the uses of the module spellings the door replaces (its
 * seam), and holds them to a baseline that only shrinks. The seam's pattern and the words of each break are the test's own; the
 * count and the judgement are here.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Every `.ts` file under `pkg`'s `dir` but the tests and `own`, by its path from `pkg`, with its text. */
export function sourcesUnder(pkg: string, dir: string, own: readonly string[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of fs.readdirSync(path.join(pkg, dir), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
    const file = path.relative(pkg, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
    if (!own.includes(file)) out[file] = fs.readFileSync(path.join(pkg, file), 'utf8');
  }
  return out;
}

/** A binding of a name, an `import … from` or an `export { … } from`, over as many lines as it takes: plumbing, not a use. */
const BINDINGS = /^[ \t]*(?:import|export)\b[^;]*?\bfrom\s*['"][^'"]*['"]\s*;?/gm;

/**
 * The uses of `seam`, a global pattern, in each file of `sources` that has any, comment lines left out. With `bindings`, an import or
 * a re-export is left out too, so a seam name handed on (`run(ledgerOf)`) counts and the line that brought it does not.
 */
export function seamUses(
  sources: Readonly<Record<string, string>>,
  seam: RegExp,
  { bindings = false }: { bindings?: boolean } = {},
): Map<string, number> {
  const uses = new Map<string, number>();
  for (const [file, text] of Object.entries(sources)) {
    const code = (bindings ? text.replace(BINDINGS, '') : text)
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
      .join('\n');
    const n = [...code.matchAll(seam)].length;
    if (n) uses.set(file, n);
  }
  return uses;
}

/** How a file's uses break its debt: more than it owes, fewer (the debt is lowered), or none left (its line is taken out). */
export type DebtBreak = { file: string; uses: number; owed: number; kind: 'grown' | 'fallen' | 'gone' };

/** Each file whose `uses` are not what `debt` names: a file it does not name or a count grown, a count fallen, a file with none left. */
export function debtBreaks(uses: ReadonlyMap<string, number>, debt: Readonly<Record<string, number>>): DebtBreak[] {
  const out: DebtBreak[] = [];
  for (const [file, n] of uses) {
    const owed = debt[file] ?? 0;
    if (n > owed) out.push({ file, uses: n, owed, kind: 'grown' });
    if (n < owed) out.push({ file, uses: n, owed, kind: 'fallen' });
  }
  for (const [file, owed] of Object.entries(debt)) if (!uses.has(file)) out.push({ file, uses: 0, owed, kind: 'gone' });
  return out;
}
