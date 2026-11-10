/**
 * The legs CI's `contracts` job proves the repository's contracts in, one runner each, side by side: `observe` and
 * `approval-refusal` each prove the file of one contract that takes minutes alone, and `rest` every other file a contract may be in.
 * A leg is a set of files, each proved whole by tsverify's CLI as it proves a folder's (`tsverify <file>... --cache`): `legOf` a file
 * is its one leg, so each contract is proved by exactly one leg, and one added later in another file falls in `rest` without a word
 * here. A leg never names one contract (`tsverify <file> <export>`): that form asks too which ends the result reaches, and took
 * `observe`'s leg past its 30 minutes on CI (run 41991408687).
 *
 * Measured on CI (run 41961131487, every verdict cold): `observe` 667.8 s, `approvalRefusal` 878.2 s, and every other contract
 * seconds — the runtime's nine together under a minute, each of the orchestrator's other proofs under 30 s. Proved one after another
 * in one job, those two set CI's time; proved beside the rest, the slowest single one does.
 * On tsverify 0.9.0, which finds a pure function's examples by running it, the `npm run contracts` step of each leg took, cold (run
 * 42137684319): `rest` 228 s, `observe` 73 s, `approval-refusal` 56 s.
 *
 * Each leg is proved by tsverify's own CLI, never in a process of ours: a verdict is not yet the same in every process (the first item
 * of tsverify's roadmap, "The same verdict on every run"), and the laws here are each one its CLI proved on three runs.
 *
 * Pure but for `contractFilesUnder`, which reads the files of a folder: `prove.ts` runs a leg's commands.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/** What `npm run contracts` proves, from the repository's root: each package's and app's code that a contract is written on. */
export const ROOTS = [
  'packages/agent-runtime/src',
  'packages/agent-orchestrator/src',
  'packages/agent-orchestrator/place',
  'packages/objects/src',
  'apps/api/src/guard.ts',
  'apps/cli/src',
  'apps/web/src/lib/brought.ts',
  'apps/web/src/lib/proposals.ts',
];

/** A leg of the `contracts` job: one runner, its own verdict cache. */
export type Leg = 'observe' | 'approval-refusal' | 'rest';

/** Every leg, in the order `npm run contracts` with no leg named proves them: the quick one first. */
export const LEGS: readonly Leg[] = ['rest', 'observe', 'approval-refusal'];

/** A file proved in a leg of its own, from the repository's root, and the contract it is there for. */
export interface Alone {
  readonly file: string;
  readonly contract: string;
}

/**
 * The files proved in a leg of their own, each by the leg that bears its contract's name. The file's other contracts come along,
 * seconds each: `decide` and `lifecycleOf` with `observe`, `holdsOpen` with `approvalRefusal`.
 */
export const ALONE: Readonly<Record<Exclude<Leg, 'rest'>, Alone>> = {
  observe: { file: 'packages/agent-runtime/src/core/domain.ts', contract: 'observe' },
  'approval-refusal': { file: 'packages/agent-orchestrator/src/gate/gate.ts', contract: 'approvalRefusal' },
};

/** The one leg that proves the file at `file`, from the repository's root. */
export const legOf = (file: string): Leg =>
  (Object.entries(ALONE) as [Exclude<Leg, 'rest'>, Alone][]).find(([, alone]) => alone.file === file)?.[0] ?? 'rest';

/** Whether `word` names a leg. */
export const isLeg = (word: string): word is Leg => (LEGS as readonly string[]).includes(word);

/**
 * The `tsverify` commands that prove `leg`, each its arguments, given `files`, every file a contract may be in, from the root: one per
 * root, naming each of its files the leg proves, sorted, as `tsverify <root> --cache` read them before there were legs. Throws when a
 * file `ALONE` names is not among `files` — moved, its leg would prove nothing and its time would land in `rest` again — whichever leg
 * is asked, so every leg refuses it alike.
 */
export const commandsOf = (files: readonly string[], leg: Leg): string[][] => {
  const lost = Object.entries(ALONE).filter(([, alone]) => !files.includes(alone.file));
  if (lost.length > 0)
    throw new Error(
      lost.map(([name, a]) => `the ${name} leg proves ${a.file}, which holds no contract`).join('; ') +
        ': point ALONE in tools/contracts/legs.ts at the file its contract is in now, or take its leg out of ALONE and of the contracts job in .github/workflows/ci.yml',
    );
  const ours = files.filter((f) => legOf(f) === leg);
  const under = (root: string, file: string): boolean => file === root || file.startsWith(`${root}/`);
  return [...ROOTS.map((root) => ours.filter((f) => under(root, f))), ours.filter((f) => !ROOTS.some((root) => under(root, f)))]
    .filter((group) => group.length > 0)
    .map((group) => [...[...group].sort(), '--cache']);
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
 * folder it is given (`contractFilesUnder` in its `cli.js`, 0.7.0): a TypeScript file that imports tsverify, or that imports, by a
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
