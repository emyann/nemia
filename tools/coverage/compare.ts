/**
 * `node tools/coverage/compare.ts <before.json> <after.json>`, or `<before.json>... -- <after.json>...`: says whether any source
 * file's coverage fell between the records `record.ts` wrote. Exit 0 when none fell, 1 naming each file that did and the lines it
 * lost, 2 when the arguments are not two sides of records of version 2. A line or an arm the records of a side disagree on varies,
 * as Node's merge of a suite's processes leaves some from run to run, and is said apart, judged no fall (`judged`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { judged, type CoverageRecord, type Fall, type Varying } from './coverage.ts';

const USAGE =
  'usage: node tools/coverage/compare.ts <before.json> <after.json>, or <before.json>... -- <after.json>... (each written by node tools/coverage/record.ts)';

/** The records before and after that `argv` names: two files, or each side of one `--`, each of one file or more. */
const sidesOf = (argv: string[]): [string[], string[]] | undefined => {
  const at = argv.indexOf('--');
  if (at === -1) return argv.length === 2 ? [[argv[0]], [argv[1]]] : undefined;
  const [before, after] = [argv.slice(0, at), argv.slice(at + 1)];
  return before.length > 0 && after.length > 0 && !after.includes('--') ? [before, after] : undefined;
};

/** The record in `file`, or a message saying what is wrong with it. */
const recordIn = (file: string): CoverageRecord | string => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return `${file} cannot be read as JSON (${(error as Error).message})`;
  }
  const record = parsed as Partial<CoverageRecord> | null;
  if (record?.version !== 2 || typeof record.files !== 'object' || record.files === null) {
    return `${file} is no coverage record of version 2, which keeps each branch's arms: write it again with node tools/coverage/record.ts`;
  }
  return record as CoverageRecord;
};

/** The lines and branches hit across every file of `record`. */
const totals = (record: CoverageRecord) =>
  Object.values(record.files).reduce((sum, file) => ({ lines: sum.lines + file.lines.hit, branches: sum.branches + file.branches.hit }), {
    lines: 0,
    branches: 0,
  });

/** One file's fall, said on a line: the file gone, or the lines it lost and its hit counts before and after. */
const said = (fall: Fall): string => {
  if (fall.gone) return `${fall.file}: gone from after (it hit ${fall.lines.before} lines, ${fall.branches.before} branches)`;
  const lines = fall.linesLost.length > 0 ? `, lines lost: ${fall.linesLost.join(', ')}` : '';
  const lost = `${lines}${fall.armsLost.length > 0 ? `, branches no test takes any more, on lines: ${fall.armsLost.join(', ')}` : ''}`;
  return `${fall.file}: lines hit ${fall.lines.before} → ${fall.lines.after}, branches hit ${fall.branches.before} → ${fall.branches.after}${lost}`;
};

/** What one file's records disagree on, said on a line. */
const varied = (v: Varying): string => {
  const arms = v.armLines.length > 0 ? `${v.lines.length > 0 ? ', ' : ''}branches on lines: ${v.armLines.join(', ')}` : '';
  return `${v.file}: ${v.lines.length > 0 ? `lines: ${v.lines.join(', ')}` : ''}${arms}`;
};

/** Compares the two records `argv` names, writing what it found through `write`, and answers the exit code. */
export const main = (argv: string[], write: (line: string) => void = console.log): number => {
  const sides = sidesOf(argv);
  if (!sides) {
    write(USAGE);
    return 2;
  }
  const [before, after] = sides.map((side) => side.map((file) => recordIn(path.resolve(file))));
  const problems = [...before, ...after].filter((r) => typeof r === 'string');
  if (problems.length > 0) {
    for (const problem of problems) write(problem);
    write(USAGE);
    return 2;
  }
  const [was, now] = [before as CoverageRecord[], after as CoverageRecord[]];
  const { falls, varying } = judged(was, now);
  const files = Object.keys(was[0].files).length;
  if (varying.length > 0) {
    write(`coverage varies between the records in ${varying.length} files, judged no fall: reached in one record and not in another`);
    for (const v of varying) write(`  ${varied(v)}`);
  }
  if (falls.length > 0) {
    write(`coverage fell in ${falls.length} of ${files} files: find the test that reached each line and keep it`);
    for (const fall of falls) write(`  ${said(fall)}`);
    return 1;
  }
  const [first, last] = [totals(was[0]), totals(now[0])];
  write(
    `no coverage fell across ${files} files: lines hit ${first.lines} → ${last.lines}, branches hit ${first.branches} → ${last.branches} (the first record of each side)`,
  );
  return 0;
};

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) process.exitCode = main(process.argv.slice(2));
