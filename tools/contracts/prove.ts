/**
 * `node tools/contracts/prove.ts [<leg>]` (`npm run contracts [-- <leg>]`): proves every contract of `<leg>` (`legs.ts`), or of every
 * leg when none is named, by tsverify's own CLI run from the repository's root with `--cache`, its verdicts kept in
 * `node_modules/.cache/tsverify` until a file a contract's program reads changes.
 *
 * Exit 0 when every command of the legs exits 0; else the highest exit code a command left (tsverify's: 1 something not proved, 2 a
 * usage error, 3 the verifier failing), and 1 when a file `ALONE` names holds no contract; 2 on a usage error of its own.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { LEGS, ROOTS, commandsOf, contractFilesUnder, isLeg, type Leg } from './legs.ts';

const USAGE = `usage: node tools/contracts/prove.ts [${LEGS.join('|')}], from anywhere (npm run contracts [-- <leg>]); no leg proves them all`;

/** Runs one tsverify command from `root`, its report on this process's output, and answers its exit code. */
const tsverify = (root: string, args: string[]): number =>
  spawnSync(path.join(root, 'node_modules', '.bin', 'tsverify'), args, { cwd: root, stdio: 'inherit' }).status ?? 3;

/** Proves `leg`, or every leg, from `root`, writing through `write` each command it runs, and answers the exit code. */
export const main = (argv: string[], root: string, write: (line: string) => void = console.log, run = tsverify): number => {
  const [leg, ...extra] = argv;
  if (extra.length > 0 || (leg !== undefined && !isLeg(leg))) {
    write(USAGE);
    return 2;
  }
  const legs: readonly Leg[] = leg === undefined ? LEGS : [leg];
  const files = ROOTS.flatMap((r) => contractFilesUnder(path.join(root, r))).map((f) => path.relative(root, f));
  let commands: string[][];
  try {
    commands = legs.flatMap((l) => commandsOf(files, l));
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
