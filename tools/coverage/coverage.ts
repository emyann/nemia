/**
 * A package's coverage per file, reduced from the lcov Node's test runner writes, and the comparison of two such records.
 *
 * A session runs it as a measure around a change that touches tests alone: the sources do not move, so a line or a branch the
 * suite reached before and no longer reaches is a hit count that fell, read exactly, never a percentage rounded.
 */
import path from 'node:path';

/** The lines and branches of one source file the suite reached: `found` of each, `hit` of those, and which lines were hit. */
export type FileCoverage = {
  lines: { found: number; hit: number; hitLines: number[] };
  /**
   * `takenByLine`, how many branches were taken on each line that has any, by line number: lcov's block numbers move between runs,
   * so a branch is told by its line. Absent from a record written before it was kept.
   */
  branches: { found: number; hit: number; takenByLine?: Record<string, number> };
};

/** One package's coverage, by each source file's path from the package's folder. */
export type CoverageRecord = { version: 1; package: string; files: Record<string, FileCoverage> };

/** What fell for one file between two records: the lines it no longer hits, its branch hits before and after, or the file gone. */
export type Fall = {
  file: string;
  gone: boolean;
  linesLost: number[];
  /** Each line with fewer branches taken after than before, as `line (before→after)`, where both records count them. */
  branchesLost: string[];
  lines: { before: number; after: number };
  branches: { before: number; after: number };
};

/** The folders a path of the package's own may cross and still be no source of it: its tests' helpers and fixtures. */
const NOT_SOURCE = new Set(['node_modules', 'fixtures', '__fixtures__']);

/** Whether `fromPackage`, a path relative to the package's folder, is one of the package's own source files. */
const isSource = (fromPackage: string): boolean => {
  if (fromPackage === '' || fromPackage.startsWith('..') || path.isAbsolute(fromPackage)) return false;
  const parts = fromPackage.split(path.sep);
  if (parts[0] === 'test' || parts.some((part) => NOT_SOURCE.has(part))) return false;
  return !/\.test\.[cm]?[jt]sx?$/.test(fromPackage);
};

/** A record's lines, as lcov says them for one file, before they are kept or dropped. */
type Section = {
  file: string;
  lineCounts: Map<number, number>;
  lf?: number;
  lh?: number;
  brf?: number;
  brh?: number;
  brda: Array<{ at: string; taken: number }>;
};

/** The `SF:` sections of an lcov text, each with its `DA`, `LF`, `LH`, `BRDA`, `BRF` and `BRH` lines read. */
const sections = (lcov: string): Section[] => {
  const found: Section[] = [];
  let current: Section | undefined;
  for (const raw of lcov.split('\n')) {
    const line = raw.trim();
    const colon = line.indexOf(':');
    const key = colon === -1 ? line : line.slice(0, colon);
    const value = line.slice(colon + 1);
    if (key === 'SF') {
      current = { file: value, lineCounts: new Map(), brda: [] };
      found.push(current);
    } else if (current && key === 'DA') {
      const [at, count] = value.split(',').map(Number);
      current.lineCounts.set(at, (current.lineCounts.get(at) ?? 0) + count);
    } else if (current && key === 'BRDA') {
      const [line, block, branch, taken] = value.split(',');
      current.brda.push({ at: `${line},${block},${branch}`, taken: taken === '-' ? 0 : Number(taken) });
    } else if (current && (key === 'LF' || key === 'LH' || key === 'BRF' || key === 'BRH')) {
      current[key.toLowerCase() as 'lf' | 'lh' | 'brf' | 'brh'] = Number(value);
    } else if (key === 'end_of_record') {
      current = undefined;
    }
  }
  return found;
};

/** One section's coverage: the summary lines where lcov gives them, else counted from its `DA` and `BRDA` lines. */
const coverageOf = (section: Section): FileCoverage => {
  const hitLines = [...section.lineCounts].filter(([, count]) => count > 0).map(([at]) => at);
  hitLines.sort((a, b) => a - b);
  return {
    lines: { found: section.lf ?? section.lineCounts.size, hit: section.lh ?? hitLines.length, hitLines },
    branches: {
      found: section.brf ?? section.brda.length,
      hit: section.brh ?? section.brda.filter(({ taken }) => taken > 0).length,
      takenByLine: takenOn(section.brda),
    },
  };
};

/** How many branches were taken on each line, of `brda`'s, that has one taken. */
const takenOn = (brda: Section['brda']): Record<string, number> => {
  const taken: Record<string, number> = {};
  for (const { at, taken: count } of brda) {
    const line = at.split(',')[0];
    if (count > 0) taken[line] = (taken[line] ?? 0) + 1;
  }
  return taken;
};

/** The larger count of each line of `a` and `b`. */
const mostOf = (a: Record<string, number>, b: Record<string, number>): Record<string, number> => {
  const most = { ...a };
  for (const [line, count] of Object.entries(b)) most[line] = Math.max(most[line] ?? 0, count);
  return most;
};

/** Each line of `was` with fewer branches taken in `now`, as `line (before→after)`, in line order. */
const linesFell = (was: Record<string, number>, now: Record<string, number>): string[] =>
  Object.entries(was)
    .filter(([line, count]) => (now[line] ?? 0) < count)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([line, count]) => `${line} (${count}→${now[line] ?? 0})`);

/** Two sections of one file, as a run that reports a file twice leaves: the lines hit in either, and the larger of each count. */
const merged = (a: FileCoverage, b: FileCoverage): FileCoverage => {
  const hitLines = [...new Set([...a.lines.hitLines, ...b.lines.hitLines])].sort((x, y) => x - y);
  return {
    lines: { found: Math.max(a.lines.found, b.lines.found), hit: hitLines.length, hitLines },
    branches: {
      found: Math.max(a.branches.found, b.branches.found),
      hit: Math.max(a.branches.hit, b.branches.hit),
      takenByLine: mostOf(a.branches.takenByLine ?? {}, b.branches.takenByLine ?? {}),
    },
  };
};

/**
 * The record of the package in `packageDir` from the lcov text of its suite: each of its own source files by its path from the
 * folder, leaving out its test files, everything under its `test/` folder and any fixtures, and every file outside the folder.
 */
export const recordOf = (lcov: string, packageDir: string): CoverageRecord => {
  const root = path.resolve(packageDir);
  const files: Record<string, FileCoverage> = {};
  for (const section of sections(lcov)) {
    const fromPackage = path.relative(root, path.resolve(root, section.file));
    if (!isSource(fromPackage)) continue;
    const key = fromPackage.split(path.sep).join('/');
    const coverage = coverageOf(section);
    files[key] = files[key] ? merged(files[key], coverage) : coverage;
  }
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
  return { version: 1, package: path.basename(root), files: sorted };
};

/**
 * The files of `before` whose coverage fell in `after`: a line hit before and not after, fewer lines or branches hit, or the file
 * gone. A file only `after` has is no fall.
 */
export const compared = (before: CoverageRecord, after: CoverageRecord): Fall[] => {
  const falls: Fall[] = [];
  for (const [file, was] of Object.entries(before.files)) {
    const now = after.files[file];
    const lines = { before: was.lines.hit, after: now?.lines.hit ?? 0 };
    const branches = { before: was.branches.hit, after: now?.branches.hit ?? 0 };
    if (!now) {
      falls.push({
        file,
        gone: true,
        linesLost: was.lines.hitLines,
        branchesLost: linesFell(was.branches.takenByLine ?? {}, {}),
        lines,
        branches,
      });
      continue;
    }
    const still = new Set(now.lines.hitLines);
    const linesLost = was.lines.hitLines.filter((at) => !still.has(at));
    const branchesLost = now.branches.takenByLine ? linesFell(was.branches.takenByLine ?? {}, now.branches.takenByLine) : [];
    if (linesLost.length > 0 || branchesLost.length > 0 || lines.after < lines.before || branches.after < branches.before) {
      falls.push({ file, gone: false, linesLost, branchesLost, lines, branches });
    }
  }
  return falls;
};

/** A string as one word of a POSIX shell's line: in single quotes, a quote inside it closed, escaped and reopened. */
const quoted = (word: string): string => `'${word.replaceAll("'", `'\\''`)}'`;

/**
 * A package's `test` script with coverage gathered into `destination` as lcov: the flags put right after its leading `node `, so
 * the script's own reporters keep their destinations. Undefined for a script that does not start with `node `.
 *
 * It names an exclusion of its own, which replaces Node's default one: that default is the runner's test-file globs, matched on each
 * file's whole path, so a package whose path goes through a `test/` folder (a fixture under a guards' `test/`) has every file
 * excluded. `recordOf` drops the package's tests and helpers itself.
 */
export const withCoverage = (script: string, destination: string): string | undefined => {
  const trimmed = script.trimStart();
  if (!trimmed.startsWith('node ')) return undefined;
  const flags = [
    '--experimental-test-coverage',
    `--test-coverage-exclude=${quoted('**/node_modules/**')}`,
    '--test-reporter=lcov',
    `--test-reporter-destination=${quoted(destination)}`,
  ].join(' ');
  return `node ${flags} ${trimmed.slice('node '.length).trimStart()}`;
};
