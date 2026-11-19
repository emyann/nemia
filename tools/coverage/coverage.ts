/**
 * A package's coverage per file, reduced from the lcov and the istanbul coverage Vitest's v8 provider writes, and the comparison of
 * two such records.
 *
 * A session runs it as a measure around a change that touches tests alone: the sources do not move, so a line or a branch the
 * suite reached before and no longer reaches is a hit count that fell, read exactly, never a percentage rounded.
 *
 * A branch is told by its arms, each with its own count across every process, as istanbul keeps them (`branch.arm`), mapped back to
 * the source by Vitest: an arm is taken when any test took it.
 */
import path from 'node:path';

/**
 * The lines and branches of one source file the suite reached: `found` of each, `hit` of those, and which lines were hit (lcov's
 * branch count is said, never judged); `arms`, each arm of the file's branches by `branch.arm` to its line, split by whether any test
 * took it.
 */
export type FileCoverage = {
  lines: { found: number; hit: number; hitLines: number[] };
  branches: { found: number; hit: number };
  arms: { taken: Record<string, number>; untaken: Record<string, number> };
};

/** One package's coverage, by each source file's path from the package's folder. Version 3 keeps each arm as istanbul names it. */
export type CoverageRecord = { version: 3; package: string; files: Record<string, FileCoverage> };

/** What fell for one file between two records: the lines it no longer hits, its branch hits before and after, or the file gone. */
export type Fall = {
  file: string;
  gone: boolean;
  linesLost: number[];
  /** The line of each arm some test took before and none takes after, in line order, once each. */
  armsLost: number[];
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
    },
    arms: { taken: {}, untaken: {} },
  };
};

/** Two sections of one file, as a run that reports a file twice leaves: the lines hit in either, and the larger of each count. */
const merged = (a: FileCoverage, b: FileCoverage): FileCoverage => {
  const hitLines = [...new Set([...a.lines.hitLines, ...b.lines.hitLines])].sort((x, y) => x - y);
  return {
    lines: { found: Math.max(a.lines.found, b.lines.found), hit: hitLines.length, hitLines },
    branches: {
      found: Math.max(a.branches.found, b.branches.found),
      hit: Math.max(a.branches.hit, b.branches.hit),
    },
    arms: a.arms,
  };
};

/** One file of the istanbul coverage Vitest's v8 provider writes (`coverage-final.json`): each branch, its arms and their counts. */
export type IstanbulFile = {
  branchMap: Record<string, { line?: number; loc?: { start: { line?: number } }; locations: Array<{ start: { line?: number } }> }>;
  b: Record<string, number[]>;
};

/** Vitest's istanbul coverage of a suite, by each file's absolute path: its processes' counts, merged. */
export type Istanbul = Record<string, IstanbulFile>;

/**
 * The arms of one file's branches, each by `branch.arm` (lcov's block and branch), to the line it opens on: an arm with no place of
 * its own, the `else` an `if` leaves out, opens on its branch's line.
 */
const armsIn = (file: IstanbulFile): FileCoverage['arms'] => {
  const arms: FileCoverage['arms'] = { taken: {}, untaken: {} };
  for (const [id, branch] of Object.entries(file.branchMap)) {
    const counts = file.b[id] ?? [];
    branch.locations.forEach((location, arm) => {
      const line = location.start.line ?? branch.loc?.start.line ?? branch.line ?? 0;
      arms[(counts[arm] ?? 0) > 0 ? 'taken' : 'untaken'][`${id}.${arm}`] = line;
    });
  }
  return arms;
};

/**
 * The record of the package in `packageDir` from the lcov text of its suite and the istanbul coverage beside it: each of its own
 * source files by its path from the folder, leaving out its test files, everything under its `test/` folder and any fixtures, and
 * every file outside the folder.
 *
 * @param lcov the lcov text Vitest's coverage wrote, its `SF:` paths from the package's folder or absolute
 * @param packageDir the package's folder
 * @param istanbul the istanbul coverage Vitest wrote beside it (`coverage-final.json`), read for each branch's arms
 */
export const recordOf = (lcov: string, packageDir: string, istanbul: Istanbul): CoverageRecord => {
  const root = path.resolve(packageDir);
  const keyOfPath = (file: string): string | undefined => {
    const fromPackage = path.relative(root, path.resolve(root, file));
    return isSource(fromPackage) ? fromPackage.split(path.sep).join('/') : undefined;
  };
  const files: Record<string, FileCoverage> = {};
  for (const section of sections(lcov)) {
    const key = keyOfPath(section.file);
    if (!key) continue;
    const coverage = coverageOf(section);
    files[key] = files[key] ? merged(files[key], coverage) : coverage;
  }
  for (const [file, coverage] of Object.entries(istanbul)) {
    const key = keyOfPath(file);
    if (key && key in files) files[key].arms = armsIn(coverage);
  }
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
  return { version: 3, package: path.basename(root), files: sorted };
};

/** Whether `arms`, one record's of a file, took the arm `key`. A record without the file took nothing. */
const takenIn = (arms: FileCoverage['arms'] | undefined, key: string): boolean => arms !== undefined && key in arms.taken;

/** What the records said of a file that is no fall: the lines and the arms' lines some record reached and another did not. */
export type Varying = { file: string; lines: number[]; armLines: number[] };

/**
 * Each of `keys` that every record before reached and no record after reaches, `lost`, and each the records disagree on, `varying`:
 * reached in one record of a side and not in another, or reached after by some and not all.
 */
const verdicts = <K>(keys: Iterable<K>, before: ((key: K) => boolean)[], after: ((key: K) => boolean)[]) => {
  const lost: K[] = [];
  const varying: K[] = [];
  for (const key of keys) {
    const [was, now] = [before.map((has) => has(key)), after.map((has) => has(key))];
    if (was.every(Boolean) && !now.some(Boolean)) lost.push(key);
    else if (![...was, ...now].every(Boolean)) varying.push(key);
  }
  return { lost, varying };
};

const ordered = (lines: number[]): number[] => [...new Set(lines)].sort((a, b) => a - b);

/**
 * The files whose coverage fell from the records `before` to the records `after`, and what varies between the records. A line, or a
 * branch's arm, falls when every record before reached it and none after does; what one record of either side reached and another
 * did not varies, as Node's merge of its processes' coverage leaves a line from run to run, and is said apart, judged no fall. A file's
 * count of lines hit falls only between one record on each side, where lcov's LH may say what its DA lines do not: across several,
 * fewer hit is a line that varied. The counts said are the fewest any record before hit and the most any after hits. A file only
 * `after` has is no fall; lcov's branch count is said, never judged.
 */
export const judged = (before: CoverageRecord[], after: CoverageRecord[]): { falls: Fall[]; varying: Varying[] } => {
  const falls: Fall[] = [];
  const varying: Varying[] = [];
  for (const file of [...new Set(before.flatMap((record) => Object.keys(record.files)))].sort()) {
    const [was, now] = [before.map((record) => record.files[file]), after.map((record) => record.files[file])];
    const hits = (side: (FileCoverage | undefined)[]) =>
      side.map((c) => new Set(c?.lines.hitLines)).map((set) => (at: number) => set.has(at));
    const lines = verdicts(new Set(was.flatMap((c) => c?.lines.hitLines ?? [])), hits(was), hits(now));
    const lineOf = new Map(was.flatMap((c) => Object.entries(c?.arms.taken ?? {})));
    const takes = (side: (FileCoverage | undefined)[]) => side.map((c) => (key: string) => takenIn(c?.arms, key));
    const arms = verdicts(lineOf.keys(), takes(was), takes(now));
    const count = (side: (FileCoverage | undefined)[], of: 'lines' | 'branches', most: boolean) =>
      (most ? Math.max : Math.min)(...side.map((c) => c?.[of].hit ?? 0));
    const counts = { before: count(was, 'lines', false), after: count(now, 'lines', true) };
    const branches = { before: count(was, 'branches', false), after: count(now, 'branches', true) };
    const armsLost = ordered(arms.lost.map((key) => lineOf.get(key)!));
    const gone = now.every((c) => c === undefined);
    const fewer = was.length === 1 && now.length === 1 && counts.after < counts.before;
    if (lines.lost.length > 0 || armsLost.length > 0 || fewer || (gone && was.every(Boolean))) {
      falls.push({ file, gone, linesLost: ordered(lines.lost), armsLost, lines: counts, branches });
    }
    if (lines.varying.length > 0 || arms.varying.length > 0) {
      varying.push({ file, lines: ordered(lines.varying), armLines: ordered(arms.varying.map((key) => lineOf.get(key)!)) });
    }
  }
  return { falls, varying };
};

/** The files of `before` whose coverage fell in `after`, one record on each side (`judged`). */
export const compared = (before: CoverageRecord, after: CoverageRecord): Fall[] => judged([before], [after]).falls;

/** A string as one word of a POSIX shell's line: in single quotes, a quote inside it closed, escaped and reopened. */
const quoted = (word: string): string => `'${word.replaceAll("'", `'\\''`)}'`;

/**
 * A package's `test` script with Vitest's v8 coverage written into the folder `destination`, as `lcov.info` and
 * `coverage-final.json`: the options put after its `vitest run`, so the script's own options and filters keep their place. Undefined
 * for a script that does not start with `vitest run`.
 *
 * It names an exclusion of its own, which replaces Vitest's default one: that default leaves out every file under a `test/` folder, so
 * a package whose path goes through one (a fixture under a guards' `test/`) has every file excluded. `recordOf` drops the package's
 * tests and helpers itself.
 *
 * @param script the package's `test` script, as its `package.json` gives it
 * @param destination the folder the coverage is written to
 */
export const withCoverage = (script: string, destination: string): string | undefined => {
  const trimmed = script.trimStart();
  const head = /^vitest\s+run\b/.exec(trimmed)?.[0];
  if (!head) return undefined;
  const options = [
    '--coverage.enabled',
    '--coverage.provider=v8',
    '--coverage.reporter=lcov',
    '--coverage.reporter=json',
    `--coverage.exclude=${quoted('**/node_modules/**')}`,
    `--coverage.reportsDirectory=${quoted(destination)}`,
  ].join(' ');
  return `${head} ${options}${trimmed.slice(head.length)}`;
};
