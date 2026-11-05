/**
 * `node tools/contracts/prove.ts [<leg>]` (`npm run contracts [-- <leg>]`): proves every contract of `<leg>` (`legs.ts`), or of every
 * leg when none is named, by tsverify's own CLI run from the repository's root with `--cache`, its verdicts kept in
 * `node_modules/.cache/tsverify` until a file a contract's program reads changes. It reads the contracts through tsverify's API to know
 * which file holds which, since a leg is a set of contracts, not of files: `observe` shares `domain.ts` with `decide` and
 * `lifecycleOf`, which the `rest` leg proves.
 *
 * Exit 0 when every command of the legs exits 0; else the highest exit code a command left (tsverify's: 1 something not proved, 2 a
 * usage error, 3 the verifier failing), and 1 when a contract `ALONE` names is gone; 2 on a usage error of its own.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import ts from 'typescript';
import { loadProject, readContract, sourceFile, type Project } from '@emyann/tsverify/api';
import { ALONE, LEGS, ROOTS, commandsOf, contractFilesUnder, isLeg, type Contract, type Leg } from './legs.ts';

const USAGE = `usage: node tools/contracts/prove.ts [${LEGS.join('|')}], from anywhere (npm run contracts [-- <leg>]); no leg proves them all`;

/** The program tsverify reads `file` through: the nearest tsconfig.json above it. */
const projectOf = (file: string): Project => {
  const config = ts.findConfigFile(path.dirname(file), (f) => ts.sys.fileExists(f));
  if (config === undefined) throw new Error(`no tsconfig.json above ${file}: give its package one`);
  return loadProject([file], config);
};

/**
 * The names of the contracts the file at `file` (absolute) exports, in order: each exported const that tsverify reads as a contract,
 * which are the names its CLI's `contractsIn` answers for each file of this repository's roots.
 */
export const contractsOf = (file: string): string[] => {
  const project = projectOf(file);
  return sourceFile(project, file).statements.flatMap((stmt) =>
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
};

/** Runs one tsverify command from `root`, its report on this process's output, and answers its exit code. */
const tsverify = (root: string, args: string[]): number =>
  spawnSync(path.join(root, 'node_modules', '.bin', 'tsverify'), args, { cwd: root, stdio: 'inherit' }).status ?? 3;

/**
 * Proves `leg`, or every leg, from `root`, writing through `write` what it runs, and answers the exit code. A leg of its own reads only
 * the files `ALONE` names, `rest` every file a contract may be in; programs are read one at a time, as all at once outgrow the heap.
 */
export const main = (argv: string[], root: string, write: (line: string) => void = console.log, run = tsverify): number => {
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
  let commands: string[][];
  try {
    commands = legs.flatMap((l) => commandsOf(found, l));
  } catch (error) {
    write((error as Error).message);
    return 1;
  }
  let worst = 0;
  for (const args of commands) {
    write(`\ntsverify ${args.join(' ')}`);
    worst = Math.max(worst, run(root, args));
  }
  return worst;
};

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename)
  process.exitCode = main(process.argv.slice(2), path.join(import.meta.dirname, '..', '..'));
