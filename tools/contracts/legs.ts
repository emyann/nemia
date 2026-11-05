/**
 * The legs CI's `contracts` job proves the repository's contracts in, one runner each, side by side: `observe` and
 * `approval-refusal` each prove one contract that takes minutes alone, and `rest` proves every other one. A contract's leg is
 * `legOf` it, so each contract found is proved by exactly one leg, and one added later falls in `rest` without a word here.
 *
 * Measured on CI (run 41961131487, every verdict cold): `observe` 667.8 s, `approvalRefusal` 878.2 s, and every
 * other contract seconds — the runtime's nine together under a minute, each of the orchestrator's other proofs under 30 s.
 * Proved one after another in one job, those two set CI's time; proved beside the rest, the slowest single one does.
 *
 * Each leg is proved by tsverify's own CLI, never in a process of ours: a verdict is not yet the same in every process (the first item
 * of tsverify's roadmap, "The same verdict on every run"), and the laws here are each one its CLI proved on three runs.
 *
 * Pure but for `contractFilesUnder`, which reads the files of a folder: `prove.ts` reads the contracts and runs a leg's commands.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/** What `npm run contracts` proves, from the repository's root: each package's and app's code that a contract is written on. */
export const ROOTS = ['packages/agent-runtime/src', 'packages/agent-orchestrator/src', 'apps/cli/src', 'apps/web/src/lib/brought.ts'];

/** A leg of the `contracts` job: one runner, its own verdict cache. */
export type Leg = 'observe' | 'approval-refusal' | 'rest';

/** Every leg, in the order `npm run contracts` with no leg named proves them: the quick one first. */
export const LEGS: readonly Leg[] = ['rest', 'observe', 'approval-refusal'];

/** A contract: the file its function is written in, from the repository's root, and the name it is exported by. */
export interface Contract {
  readonly file: string;
  readonly name: string;
}

/** The contracts proved in a leg of their own, each by the leg that bears its name. */
export const ALONE: Readonly<Record<Exclude<Leg, 'rest'>, Contract>> = {
  observe: { file: 'packages/agent-runtime/src/core/domain.ts', name: 'observe' },
  'approval-refusal': { file: 'packages/agent-orchestrator/src/gate/gate.ts', name: 'approvalRefusal' },
};

const same = (a: Contract, b: Contract): boolean => a.file === b.file && a.name === b.name;

/** The one leg that proves `contract`. */
export const legOf = (contract: Contract): Leg =>
  (Object.entries(ALONE) as [Exclude<Leg, 'rest'>, Contract][]).find(([, alone]) => same(alone, contract))?.[0] ?? 'rest';

/** Whether `word` names a leg. */
export const isLeg = (word: string): word is Leg => (LEGS as readonly string[]).includes(word);

/**
 * The contracts of `found` that `leg` proves. Throws when a contract `ALONE` names is not among `found` — renamed or moved, its
 * leg would prove nothing and its time would land in `rest` again — whichever leg is asked, so every leg refuses it alike.
 */
export const planOf = (found: readonly Contract[], leg: Leg): Contract[] => {
  const lost = Object.entries(ALONE).filter(([, alone]) => !found.some((c) => same(c, alone)));
  if (lost.length > 0)
    throw new Error(
      lost.map(([name, c]) => `the ${name} leg proves ${c.name} in ${c.file}, which exports no such contract`).join('; ') +
        ': point ALONE in tools/contracts/legs.ts at where the contract is now, or take its leg out of ALONE and of the contracts job in .github/workflows/ci.yml',
    );
  return found.filter((c) => legOf(c) === leg);
};

/**
 * The `tsverify` commands that prove the contracts of `found` that `leg` proves, each its arguments: one per root, naming every file
 * of it whose contracts the leg proves all of, as `tsverify <root> --cache` proved a root before there were legs; then one per
 * contract of a file the leg shares with another, by tsverify's one-contract form (`tsverify <file> <export>`). Throws as `planOf`.
 */
export const commandsOf = (found: readonly Contract[], leg: Leg): string[][] => {
  const plan = planOf(found, leg);
  const whole = (file: string): boolean => found.filter((c) => c.file === file).every((c) => legOf(c) === leg);
  const files = [...new Set(plan.map((c) => c.file))];
  const under = (root: string, file: string): boolean => file === root || file.startsWith(`${root}/`);
  const roots = ROOTS.map((root) => files.filter((f) => under(root, f) && whole(f)).sort()).filter((f) => f.length > 0);
  const elsewhere = files.filter((f) => whole(f) && !ROOTS.some((root) => under(root, f)));
  return [
    ...[...roots, ...(elsewhere.length > 0 ? [elsewhere] : [])].map((f) => [...f, '--cache']),
    ...plan.filter((c) => !whole(c.file)).map((c) => [c.file, c.name, '--cache']),
  ];
};

/** An import of tsverify or one of its entries, as tsverify's own CLI reads it. */
const IMPORTS_TSVERIFY = /["']@emyann\/tsverify(?:\/[^"'\n]*)?["']/;

/** Every TypeScript file under `dir`, outside `node_modules` and dot folders, declaration files left out. */
const typeScriptUnder = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' || e.name.startsWith('.') ? [] : typeScriptUnder(p);
    return e.isFile() && /\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts') ? [p] : [];
  });

/** The file a relative import names, as TypeScript finds it. */
const imported = (from: string, specifier: string): string | undefined => {
  const base = path.resolve(path.dirname(from), specifier);
  const tried = [
    base,
    base.replace(/\.(c|m)?js$/, '.$1ts'),
    base.replace(/\.jsx$/, '.tsx'),
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
  ];
  return tried.find((f) => /\.tsx?$/.test(f) && fs.existsSync(f) && fs.statSync(f).isFile());
};

/**
 * Every file under `root` (a folder, or a file taken as it is) that may hold a contract, by the rule tsverify's CLI applies to a
 * folder it is given (`contractFilesUnder` in its `cli.js`, 0.5.1): a TypeScript file that imports tsverify, or that imports, by a
 * relative path, a file that does. Absolute paths, sorted.
 */
export const contractFilesUnder = (root: string): string[] => {
  const at = path.resolve(root);
  if (!fs.statSync(at).isDirectory()) return [at];
  const known = new Map<string, boolean>();
  const importsTsverify = (f: string): boolean => {
    let yes = known.get(f);
    if (yes === undefined) {
      yes = IMPORTS_TSVERIFY.test(fs.readFileSync(f, 'utf8'));
      known.set(f, yes);
    }
    return yes;
  };
  return typeScriptUnder(at)
    .filter(
      (f) =>
        importsTsverify(f) ||
        ts.preProcessFile(fs.readFileSync(f, 'utf8'), true, true).importedFiles.some((i) => {
          if (!i.fileName.startsWith('.')) return false;
          const target = imported(f, i.fileName);
          return target !== undefined && importsTsverify(target);
        }),
    )
    .sort();
};
