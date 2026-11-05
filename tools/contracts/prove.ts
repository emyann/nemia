/**
 * `node tools/contracts/prove.ts [<leg>]`, run from the repository's root (`npm run contracts [-- <leg>]`): proves every contract
 * of `<leg>` (`legs.ts`), or of every leg when none is named, as `tsverify <root> --cache` proves a folder's — the same options,
 * the same verdict cache (`node_modules/.cache/tsverify`), a verdict kept until a file its program reads changes. It goes through
 * tsverify's API rather than its CLI because a leg is a set of contracts, not of files: `observe` shares its file with `decide` and
 * `lifecycleOf`, which the `rest` leg proves.
 *
 * Exit 0 when every contract of the leg is proved, 1 when one is not (or one `ALONE` names is gone), 2 on a usage error.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import ts from 'typescript';
import {
  loadProject,
  prune,
  readContract,
  sourceFile,
  verdictsIn,
  verify,
  withZ3,
  type Project,
  type Verification,
} from '@emyann/tsverify/api';
import { ALONE, LEGS, ROOTS, contractFilesUnder, isLeg, planOf, type Contract, type Leg } from './legs.ts';

const USAGE = `usage: node tools/contracts/prove.ts [${LEGS.join('|')}], from the repository's root (npm run contracts [-- <leg>]); no leg proves them all`;

/** How long a verdict is kept unused, as tsverify's CLI keeps it. */
const KEPT_DAYS = 14;

/** Whether a verdict passes, as tsverify's CLI judges it: every law and obligation proved, nothing unsupported or undecided. */
export const passed = (v: Verification): boolean =>
  v.unsupported === undefined &&
  v.undecided === undefined &&
  v.laws.every((l) => l.status === 'proved') &&
  v.obligations.every((o) => o.status === 'proved');

/** What a verdict that did not pass leaves unproved, one line each. */
export const unproved = (v: Verification): string[] => [
  ...(v.unsupported === undefined ? [] : [`unsupported: ${v.unsupported}`]),
  ...(v.undecided === undefined ? [] : [`undecided: ${JSON.stringify(v.undecided)}`]),
  ...v.laws
    .filter((l) => l.status !== 'proved')
    .map(
      (l) =>
        `law ${l.name}: ${l.status}${l.reason ? ` — ${l.reason}` : ''}${l.args ? ` ${String(l.args.map((a) => JSON.stringify(a)))}` : ''}`,
    ),
  ...v.obligations
    .filter((o) => o.status !== 'proved')
    .map((o) => `obligation ${o.text} at ${o.at}: ${o.status}${o.reason ? ` — ${o.reason}` : ''}`),
];

/** The program tsverify reads `file` through: the nearest tsconfig.json above it. */
const projectOf = (file: string): Project => {
  const config = ts.findConfigFile(path.dirname(file), (f) => ts.sys.fileExists(f));
  if (config === undefined) throw new Error(`no tsconfig.json above ${file}: give its package one`);
  return loadProject([file], config);
};

/** The names of the contracts `file` exports: each exported const tsverify reads as a contract. */
const contractsIn = (project: Project, file: string): string[] =>
  sourceFile(project, file).statements.flatMap((stmt) =>
    ts.isVariableStatement(stmt) && stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      ? stmt.declarationList.declarations.flatMap((d) => {
          if (!ts.isIdentifier(d.name) || d.initializer === undefined) return [];
          try {
            readContract(project, file, d.name.text);
            return [d.name.text];
          } catch {
            return [];
          }
        })
      : [],
  );

/** The names of the contracts the file at `file` (absolute) exports, read through its own program. */
export const contractsOf = (file: string): string[] => contractsIn(projectOf(file), file);

/**
 * Proves `leg`, or every leg, from `root`; writes what it proved through `write`, and answers the exit code. A leg of its own reads
 * only the files `ALONE` names, `rest` every file a contract may be in. Programs are read one at a time, as tsverify's CLI reads
 * them, each once for every contract of its file the run proves: all of them held at once outgrow the heap.
 */
export const main = async (argv: string[], root: string, write: (line: string) => void = console.log): Promise<number> => {
  const [leg, ...extra] = argv;
  if (extra.length > 0 || (leg !== undefined && !isLeg(leg))) {
    write(USAGE);
    return 2;
  }
  const legs: readonly Leg[] = leg === undefined ? LEGS : [leg];
  const files = legs.includes('rest')
    ? ROOTS.flatMap((r) => contractFilesUnder(path.join(root, r)))
    : [...new Set(Object.values(ALONE).map((c) => path.join(root, c.file)))];
  const found: Contract[] = files.flatMap((file) => contractsOf(file).map((name) => ({ file: path.relative(root, file), name })));
  let plan: Contract[];
  try {
    plan = legs.flatMap((l) => planOf(found, l));
  } catch (error) {
    write((error as Error).message);
    return 1;
  }
  const cacheDir = path.join(root, 'node_modules', '.cache', 'tsverify');
  const cache = verdictsIn(cacheDir);
  let failed = 0;
  await withZ3(async (z3) => {
    for (const file of new Set(plan.map((c) => c.file))) {
      const project = projectOf(path.join(root, file));
      for (const c of plan.filter((p) => p.file === file)) {
        const started = performance.now();
        const v = await verify(z3, project, path.join(root, file), c.name, { cover: false, cache });
        const seconds = ((performance.now() - started) / 1000).toFixed(1);
        const counts = `${v.laws.length} laws, ${v.obligations.length} obligations, ${seconds} s`;
        if (passed(v)) write(`proved      ${file} ${c.name} (${counts})`);
        else {
          failed++;
          write(`NOT PROVED  ${file} ${c.name} (${counts}); every verdict of it: npx tsverify ${file} ${c.name}`);
          for (const line of unproved(v)) write(`    ${line}`);
        }
      }
    }
  });
  prune(cacheDir, KEPT_DAYS);
  write(`${legs.join(', ')}: ${plan.length - failed} of ${plan.length} contracts proved`);
  return failed === 0 ? 0 : 1;
};

/**
 * Run as a program, it runs itself again under V8's steady collection schedule, as tsverify's CLI does: when JavaScript collects the
 * solver's terms decides the order of its search, so the same verdict on every run asks for the same schedule, a flag V8 takes on its
 * command line alone. It proves from the root, as `npm run contracts` does: tsverify keys a verdict by the folder it was proved from,
 * among the rest.
 */
const STEADY = '--predictable-gc-schedule';

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  if (!process.execArgv.includes(STEADY)) {
    const run = spawnSync(process.execPath, [STEADY, ...process.execArgv, ...process.argv.slice(1)], { stdio: 'inherit' });
    process.exit(run.status ?? 3);
  }
  const root = path.join(import.meta.dirname, '..', '..');
  process.chdir(root);
  process.exitCode = await main(process.argv.slice(2), root);
}
