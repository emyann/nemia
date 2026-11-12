/**
 * `node tools/contracts/prove.ts [<leg>]` (`npm run contracts [-- <leg>]`): proves every contract of `<leg>` (`legs.ts`), or of every
 * leg when none is named, by tsverify's own CLI run from the repository's root with `--cache`, its verdicts kept in
 * `node_modules/.cache/tsverify` until a file a contract's program reads changes.
 *
 * When a command exits non-zero, its output ends on a closing section that repeats, for each such command, every contract it did not
 * prove, with the lines tsverify printed under it (the law, the counterexample, its fix): a log read from its tail — sdlc's
 * `ci-log.ts` falls back to the last lines of a job with no `✖` in it — then shows what failed, rather than the last passing files.
 * The marks are read from tsverify's text report as it is printed, since its `--json` replaces the text the log keeps.
 *
 * Exit 0 when every command of the legs exits 0; else the highest exit code a command left (tsverify's: 1 something not proved, 2 a
 * usage error, 3 the verifier failing), and 1 when a file `ALONE` names holds no contract; 2 on a usage error of its own.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { LEGS, ROOTS, commandsOf, contractFilesUnder, isLeg, type Leg } from './legs.ts';

const USAGE = `usage: node tools/contracts/prove.ts [${LEGS.join('|')}], from anywhere (npm run contracts [-- <leg>]); no leg proves them all`;

/** What one tsverify command left: its exit code and its report, as it printed it on stdout. */
export interface Ran {
  readonly status: number;
  readonly output: string;
}

/** Runs one tsverify command from `root`, its report copied onto this process's output as it comes, and answers what it left. */
const tsverify = (root: string, args: string[]): Promise<Ran> =>
  new Promise((resolve) => {
    const child = spawn(path.join(root, 'node_modules', '.bin', 'tsverify'), args, { cwd: root, stdio: ['inherit', 'pipe', 'inherit'] });
    const chunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      process.stdout.write(chunk);
    });
    child.on('error', () => resolve({ status: 3, output: Buffer.concat(chunks).toString('utf8') }));
    child.on('close', (code) => resolve({ status: code ?? 3, output: Buffer.concat(chunks).toString('utf8') }));
  });

/** tsverify's marks of a verdict that is not `proved` (its `docs/verdicts.md`, *A line per contract*): ✓ alone is proved. */
const UNPROVED = '✗⊘◐○~?!';

const indent = (line: string): number => line.length - line.trimStart().length;

/**
 * Every contract a tsverify report did not prove, each as the lines it printed for it: the file's line, then the contract's (two
 * spaces in, its mark first) and every line under it. A contract is not proved when its mark is not ✓, or when a line under it opens
 * on a mark of a verdict that is not proved (an obligation, a division); a note under a proved law opens on none.
 */
export const unproved = (report: string): string[][] => {
  const lines = report.split(/\r?\n/);
  const found: string[][] = [];
  let file: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.trim() === '') continue;
    if (indent(line) === 0) {
      file = line;
      continue;
    }
    if (indent(line) !== 2 || !/^ {2}\S /u.test(line) || !'✓'.concat(UNPROVED).includes(line.trimStart()[0] ?? '')) continue;
    const block = [line];
    while (i + 1 < lines.length && (lines[i + 1] ?? '').trim() !== '' && indent(lines[i + 1] ?? '') > 2) block.push(lines[++i] ?? '');
    if (block.some((l) => UNPROVED.includes(l.trimStart()[0] ?? ''))) found.push(file === undefined ? block : [file, ...block]);
  }
  return found;
};

/** The closing section: for each command that exited non-zero, the contracts it did not prove, repeated from above. */
export const closing = (failed: readonly { readonly args: readonly string[]; readonly ran: Ran }[]): string[] => {
  if (failed.length === 0) return [];
  const out = ['', '── not proved, repeated from above: each contract tsverify did not prove, with its fix ──'];
  for (const { args, ran } of failed) {
    out.push('', `tsverify ${args.join(' ')}  (exit ${ran.status})`);
    const contracts = unproved(ran.output);
    if (contracts.length === 0)
      out.push(
        `  tsverify marked no contract as not proved: exit 2 is its usage error, 3 the verifier failing; read its error output above`,
      );
    for (const lines of contracts) out.push(...lines);
  }
  return out;
};

/** Proves `leg`, or every leg, from `root`, writing through `write` each command it runs, and answers the exit code. */
export const main = async (
  argv: string[],
  root: string,
  write: (line: string) => void = console.log,
  run: (root: string, args: string[]) => Promise<Ran> = tsverify,
): Promise<number> => {
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
  const failed: { args: string[]; ran: Ran }[] = [];
  for (const args of commands) {
    write(`\ntsverify ${args.join(' ')}`);
    const ran = await run(root, args);
    if (ran.status !== 0) failed.push({ args, ran });
    worst = Math.max(worst, ran.status);
  }
  for (const line of closing(failed)) write(line);
  return worst;
};

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename)
  process.exitCode = await main(process.argv.slice(2), path.join(import.meta.dirname, '..', '..'));
