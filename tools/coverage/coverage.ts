/**
 * A package's coverage per file, reduced from the lcov Node's test runner writes, and the comparison of two such records.
 *
 * A session runs it as a measure around a change that touches tests alone: the sources do not move, so a line or a branch the
 * suite reached before and no longer reaches is a hit count that fell, read exactly, never a percentage rounded.
 *
 * A branch is told by V8's ranges, not lcov's count per line: V8 leaves out a block that ran as often as the one around it, so the
 * merged lcov reads an arm untaken when its sibling ran in another test file. A range is taken when any one process took it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The lines and branches of one source file the suite reached: `found` of each, `hit` of those, and which lines were hit (lcov's
 * branch count is said, never judged); `arms`, each V8 range of the file by `start-end` offsets to its line, split by whether any
 * test process took it.
 */
export type FileCoverage = {
  lines: { found: number; hit: number; hitLines: number[] };
  branches: { found: number; hit: number };
  arms: { taken: Record<string, number>; untaken: Record<string, number> };
};

/** One package's coverage, by each source file's path from the package's folder. Version 2 keeps each arm. */
export type CoverageRecord = { version: 2; package: string; files: Record<string, FileCoverage> };

/** One script of one process's raw V8 coverage, as `NODE_V8_COVERAGE` holds it. */
export type V8Script = { url: string; functions: Array<{ ranges: Array<{ startOffset: number; endOffset: number; count: number }> }> };

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

type Range = { start: number; end: number; count: number };
const keyOf = (range: Range): string => `${range.start}-${range.end}`;
/** A script's ranges, each cut at its source's `length`: past it is the source URL the loader appends, which names the file's path. */
const rangesOf = (script: V8Script, length: number): Range[] =>
  script.functions.flatMap(({ ranges }) =>
    ranges.map((r) => ({ start: r.startOffset, end: Math.min(r.endOffset, length), count: r.count })),
  );

/**
 * Adds to `taken`, as `file:start-end`, each of `arms` that `ranges`, one process's, took: by the arm's own count where the process
 * reports it, else by the innermost range around it, which V8 left it out for equalling. Ranges nest: one sweep holds those open.
 */
const takeIn = (arms: Range[], ranges: Range[], taken: Set<string>, file: string) => {
  const items = [...ranges.map((r) => ({ ...r, arm: false })), ...arms.map((r) => ({ ...r, arm: true }))];
  items.sort((a, b) => a.start - b.start || b.end - a.end || Number(a.arm) - Number(b.arm));
  const open: Range[] = [];
  for (const item of items) {
    while (open.length > 0 && open[open.length - 1].end < item.end) open.pop();
    if (!item.arm) open.push(item);
    else if ((open[open.length - 1]?.count ?? 0) > 0) taken.add(`${file}:${keyOf(item)}`);
  }
};

/** The 1-based line of each offset of `text`, past the blanks a range opens with (a block left out after a brace opens on it). */
const lineAt = (text: string) => {
  const starts = [0];
  for (let at = text.indexOf('\n'); at !== -1; at = text.indexOf('\n', at + 1)) starts.push(at + 1);
  return (from: number) => {
    const at = from + /^\s*/.exec(text.slice(from, from + 200))![0].length;
    return starts.filter((start) => start <= at).length;
  };
};

/** The arms of each source file from the suite's processes, read twice (every range, then which each took) to hold one at a time. */
const armsOf = (
  processes: () => Iterable<V8Script[]>,
  keyIn: (url: string) => string | undefined,
  textOf: (key: string) => string,
): Map<string, FileCoverage['arms']> => {
  const texts = new Map<string, string>();
  const text = (key: string) => texts.get(key) ?? texts.set(key, textOf(key)).get(key)!;
  function* scripts(): Iterable<[string, Range[]]> {
    for (const process of processes()) {
      for (const script of process) {
        const key = keyIn(script.url);
        if (key) yield [key, rangesOf(script, text(key).length)];
      }
    }
  }
  const all = new Map<string, Map<string, Range>>();
  for (const [key, ranges] of scripts()) {
    const known = all.get(key) ?? all.set(key, new Map()).get(key)!;
    for (const range of ranges) known.set(keyOf(range), { ...range, count: 0 });
  }
  const taken = new Set<string>();
  for (const [key, ranges] of scripts()) takeIn([...all.get(key)!.values()], ranges, taken, key);
  const arms = new Map<string, FileCoverage['arms']>();
  for (const [key, known] of all) {
    const line = lineAt(text(key));
    const split: FileCoverage['arms'] = { taken: {}, untaken: {} };
    for (const range of known.values()) split[taken.has(`${key}:${keyOf(range)}`) ? 'taken' : 'untaken'][keyOf(range)] = line(range.start);
    arms.set(key, split);
  }
  return arms;
};

/**
 * The record of the package in `packageDir` from the lcov text of its suite and the raw V8 coverage of each of its processes: each
 * of its own source files by its path from the folder, leaving out its test files, everything under its `test/` folder and any
 * fixtures, and every file outside the folder. `textOf` reads a source by its path from the folder, to say the line of each arm.
 */
export const recordOf = (
  lcov: string,
  packageDir: string,
  processes: () => Iterable<V8Script[]>,
  textOf: (key: string) => string = (key) => fs.readFileSync(path.join(packageDir, key), 'utf8'),
): CoverageRecord => {
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
  const kept = (url: string) => [url.startsWith('file:') ? keyOfPath(fileURLToPath(url)) : undefined].find((key) => key && key in files);
  for (const [key, arms] of armsOf(processes, kept, textOf)) files[key].arms = arms;
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
  return { version: 2, package: path.basename(root), files: sorted };
};

/**
 * The lines of the arms `was` took that `now` takes no more, each read as the innermost range of `now` around it, itself where
 * `now` knows it: an arm `now` never reported ran, in every process of it, as often as that range.
 */
const armsLostIn = (was: FileCoverage['arms'], now: FileCoverage['arms'] = { taken: {}, untaken: {} }): number[] => {
  const spans = Object.keys({ ...now.taken, ...now.untaken }).map((key) => [key, ...key.split('-').map(Number)] as const);
  const takenNow = (key: string): boolean => {
    const [start, end] = key.split('-').map(Number);
    const around = spans.filter(([, s, e]) => s <= start && end <= e).sort(([, a, x], [, b, y]) => b - a || x - y)[0];
    return around !== undefined && around[0] in now.taken;
  };
  const lost = Object.entries(was.taken).flatMap(([key, line]) => (takenNow(key) ? [] : [line]));
  return [...new Set(lost)].sort((a, b) => a - b);
};

/**
 * The files of `before` whose coverage fell in `after`: a line hit before and not after, fewer lines hit, an arm some test took
 * before and none takes after, or the file gone. A file only `after` has is no fall; lcov's branch count is said, never judged.
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
        armsLost: armsLostIn(was.arms, undefined),
        lines,
        branches,
      });
      continue;
    }
    const still = new Set(now.lines.hitLines);
    const linesLost = was.lines.hitLines.filter((at) => !still.has(at));
    const armsLost = armsLostIn(was.arms, now.arms);
    if (linesLost.length > 0 || armsLost.length > 0 || lines.after < lines.before) {
      falls.push({ file, gone: false, linesLost, armsLost, lines, branches });
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
