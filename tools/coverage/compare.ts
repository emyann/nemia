/**
 * `node tools/coverage/compare.ts <before.json> <after.json>`: says whether any source file's coverage fell between two records
 * `record.ts` wrote. Exit 0 when none fell, 1 naming each file that did and the lines it lost, 2 when the arguments are not two
 * records.
 */
import fs from 'node:fs';
import path from 'node:path';
import { compared, type CoverageRecord, type Fall } from './coverage.ts';

const USAGE = 'usage: node tools/coverage/compare.ts <before.json> <after.json> (each written by node tools/coverage/record.ts)';

/** The record in `file`, or a message saying what is wrong with it. */
const recordIn = (file: string): CoverageRecord | string => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return `${file} cannot be read as JSON (${(error as Error).message})`;
  }
  const record = parsed as Partial<CoverageRecord> | null;
  if (record?.version !== 1 || typeof record.files !== 'object' || record.files === null) {
    return `${file} is no coverage record of version 1`;
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
  const lost = `${lines}${fall.branchesLost.length > 0 ? `, branches lost (line,block,branch): ${fall.branchesLost.join(' ')}` : ''}`;
  return `${fall.file}: lines hit ${fall.lines.before} → ${fall.lines.after}, branches hit ${fall.branches.before} → ${fall.branches.after}${lost}`;
};

/** Compares the two records `argv` names, writing what it found through `write`, and answers the exit code. */
export const main = (argv: string[], write: (line: string) => void = console.log): number => {
  if (argv.length !== 2) {
    write(USAGE);
    return 2;
  }
  const [before, after] = argv.map((file) => recordIn(path.resolve(file)));
  if (typeof before === 'string' || typeof after === 'string') {
    for (const problem of [before, after].filter((r) => typeof r === 'string')) write(problem);
    write(USAGE);
    return 2;
  }
  const falls = compared(before, after);
  if (falls.length > 0) {
    write(
      `coverage fell in ${falls.length} of ${Object.keys(before.files).length} files: find the test that reached each line and keep it`,
    );
    for (const fall of falls) write(`  ${said(fall)}`);
    return 1;
  }
  const [was, now] = [totals(before), totals(after)];
  write(
    `no coverage fell across ${Object.keys(before.files).length} files: lines hit ${was.lines} → ${now.lines}, branches hit ${was.branches} → ${now.branches}`,
  );
  return 0;
};

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) process.exitCode = main(process.argv.slice(2));
