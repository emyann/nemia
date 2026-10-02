/**
 * The report of what tests cost: `node tools/test-costs/report.ts [--top N] <dir>...`, each `<dir>` a check's files directory, such as
 * `~/.agent-workflows/runs/<run>/artifacts/<step>`, and a shell glob over them a range of checks. Every record in them counts as one
 * check, each try of a retried check its own. It prints each package's largest wall time, peak and overhead, then the top N (10 unless
 * `--top` says) slowest tests, slowest files and heaviest files. A folder with no record is named on stderr; none at all exits 2.
 */
import fs from 'node:fs';
import path from 'node:path';
import { rendered, type TestCosts } from './costs.ts';

/** What the command prints, and its exit code. */
export type Report = { out: string; err: string; code: number };

/** The records in one folder, by name: none when the folder is not there; a file that does not parse is said in `err`. */
function recordsIn(dir: string, err: string[]): TestCosts[] {
  const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => /^test-costs-.*\.json$/.test(name)) : [];
  if (names.length === 0) err.push(`test costs: no record in ${dir}`);
  return [...names].sort().flatMap((name) => {
    try {
      const costs = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as TestCosts;
      return costs.version === 1 ? [costs] : [];
    } catch (error) {
      err.push(`test costs: ${path.join(dir, name)} does not read: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  });
}

/** The arguments: `--top N` (a positive whole number) and the folders, or the message that says how to call it. */
function argsOf(args: string[]): { top: number; dirs: string[] } | string {
  const at = args.indexOf('--top');
  const top = at < 0 ? 10 : Number(args[at + 1]);
  if (!Number.isInteger(top) || top < 1) return `--top takes a whole number of rows, as in --top 20, not ${args[at + 1]}`;
  const dirs = args.filter((_arg, i) => at < 0 || (i !== at && i !== at + 1));
  return dirs.length > 0 ? { top, dirs } : "pass a check's files directory, such as ~/.agent-workflows/runs/<run>/artifacts/<step>";
}

/** The report of the records in `args`' folders. */
export function report(args: string[]): Report {
  const parsed = argsOf(args);
  const usage = 'usage: node tools/test-costs/report.ts [--top N] <dir>...';
  if (typeof parsed === 'string') return { out: '', err: `${parsed}\n${usage}\n`, code: 2 };
  const err: string[] = [];
  const records = parsed.dirs.flatMap((dir) => recordsIn(dir, err));
  if (records.length === 0) {
    err.push(
      "test costs: no record in any folder given: pass a check's files directory, such as ~/.agent-workflows/runs/<run>/artifacts/<step>",
    );
    return { out: '', err: `${err.join('\n')}\n`, code: 2 };
  }
  return { out: rendered(records, parsed.top), err: err.length > 0 ? `${err.join('\n')}\n` : '', code: 0 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const { out, err, code } = report(process.argv.slice(2));
  process.stdout.write(out);
  process.stderr.write(err);
  process.exitCode = code;
}
