/**
 * What a package's `node --test` cost, as a check records it in its files directory (`WF_ARTIFACTS`): each test's duration, file and
 * line from the runner's own events, each test file's wall time, peak resident memory and CPU from its own process, and the package's
 * wall time and peak (its largest process, not the sum of those that ran at once). Pure: the reporter folds a record with `foldCosts`,
 * and the report ranks records with `ranked` and prints them with `rendered`.
 */
import path from 'node:path';

/** One test or suite as the runner reported it: `file` absolute, `durationMs` from `details.duration_ms`. */
export type Seen = { file: string; line: number | null; name: string; nesting: number; suite: boolean; ok: boolean; durationMs: number };

/** What the probe leaves for one process that loaded it: the file it ran (absolute), and what that process cost. */
export type Fragment = { file: string; wallMs: number; maxRssKb: number; cpuMs: number; probeMs: number };

/** A test file's cost, its path from the package's folder; each figure null when its process left no fragment. */
export type FileCost = { file: string; wallMs: number | null; peakRssKb: number | null; cpuMs: number | null };

/** One test or suite of a record, its file from the package's folder. */
export type TestCost = {
  file: string;
  line: number | null;
  name: string;
  nesting: number;
  suite: boolean;
  ok: boolean;
  durationMs: number;
};

/** A package's record for one check: `overheadMs` is what the recording itself spent, in the runner and in every probe. */
export type TestCosts = {
  version: 1;
  package: string;
  node: string;
  platform: string;
  at: string;
  wallMs: number;
  peakRssKb: number | null;
  overheadMs: number;
  files: FileCost[];
  tests: TestCost[];
};

/** The runner's own facts, read where it ends: its folder, its wall time, and what the reporter spent. */
export type Runner = { package: string; dir: string; node: string; platform: string; at: string; wallMs: number; overheadMs: number };

/** The folder, under a check's files directory, where the probes of one package leave their fragments for its reporter. */
export const fragmentsDir = (artifacts: string, pkg: string): string => path.join(artifacts, '.test-costs', safeName(pkg));

/** The name of a package's record for the check that ended at `at`: one per try, so a retried check keeps every try. */
export const recordName = (pkg: string, at: Date): string => `test-costs-${safeName(pkg)}-${at.toISOString().replaceAll(':', '')}.json`;

/** A package's name made one file name: a scope's `@` and `/` become `-`. */
const safeName = (pkg: string): string => pkg.replace(/[^\w.-]+/g, '-').replace(/^-+/, '');

/** The larger of two figures, either of which may be missing. */
const larger = (a: number | null, b: number | null): number | null => (a === null ? b : b === null ? a : Math.max(a, b));

/** Each file the runner reported, in the order it first did, with the fragments of its processes; a fragment of no such file is dropped. */
function fileCosts(seen: Seen[], fragments: Fragment[], dir: string): FileCost[] {
  const files = new Map<string, FileCost>();
  for (const test of seen)
    if (!files.has(test.file)) files.set(test.file, { file: path.relative(dir, test.file), wallMs: null, peakRssKb: null, cpuMs: null });
  for (const fragment of fragments) {
    const cost = files.get(fragment.file);
    if (!cost) continue;
    cost.wallMs = larger(cost.wallMs, fragment.wallMs);
    cost.peakRssKb = larger(cost.peakRssKb, fragment.maxRssKb);
    cost.cpuMs = larger(cost.cpuMs, fragment.cpuMs);
  }
  return [...files.values()];
}

/** A package's record: its tests as reported, its files with their processes' costs, and its peak the largest file's. */
export function foldCosts(seen: Seen[], fragments: Fragment[], runner: Runner): TestCosts {
  const files = fileCosts(seen, fragments, runner.dir);
  return {
    version: 1,
    package: runner.package,
    node: runner.node,
    platform: runner.platform,
    at: runner.at,
    wallMs: runner.wallMs,
    peakRssKb: files.reduce<number | null>((peak, file) => larger(peak, file.peakRssKb), null),
    overheadMs: runner.overheadMs + fragments.reduce((sum, fragment) => sum + fragment.probeMs, 0),
    files,
    tests: seen.map((test) => ({ ...test, file: path.relative(runner.dir, test.file) })),
  };
}

/** One row of a ranking: what it is, its largest figure over the records read, and in how many records it appeared. */
export type Ranked = { package: string; file: string; line: number | null; name: string | null; value: number; checks: number };

/** The rankings of a set of records: the slowest tests, the slowest files and the heaviest files, each its top N. */
export type Rankings = { tests: Ranked[]; slowFiles: Ranked[]; heavyFiles: Ranked[] };

/** Rows folded by key: each keeps its largest value and counts the records it appeared in. */
function fold(rows: { key: string; row: Omit<Ranked, 'checks'> }[]): Ranked[] {
  const folded = new Map<string, Ranked>();
  for (const { key, row } of rows) {
    const had = folded.get(key);
    folded.set(key, had ? { ...had, value: Math.max(had.value, row.value), checks: had.checks + 1 } : { ...row, checks: 1 });
  }
  return [...folded.values()];
}

/** The top N rows, largest first; equal values in the order of their names, so a ranking reads the same twice. */
const topOf = (rows: Ranked[], top: number): Ranked[] =>
  [...rows]
    .sort((a, b) => b.value - a.value || `${a.package} ${a.file} ${a.name}`.localeCompare(`${b.package} ${b.file} ${b.name}`))
    .slice(0, top);

/** A file's figure as a row of a ranking, or none where its process left no fragment. */
const fileRows = (records: TestCosts[], figure: (file: FileCost) => number | null) =>
  records.flatMap((record) =>
    record.files.flatMap((file) => {
      const value = figure(file);
      return value === null
        ? []
        : [{ key: `${record.package}\0${file.file}`, row: { package: record.package, ...file, line: null, name: null, value } }];
    }),
  );

/** The top N slowest tests (suites left out: each holds its tests' time), slowest files and heaviest files over `records`. */
export function ranked(records: TestCosts[], top: number): Rankings {
  const tests = records.flatMap((record) =>
    record.tests
      .filter((test) => !test.suite)
      .map((test) => ({
        key: `${record.package}\0${test.file}\0${test.line}\0${test.name}`,
        row: { package: record.package, file: test.file, line: test.line, name: test.name, value: test.durationMs },
      })),
  );
  return {
    tests: topOf(fold(tests), top),
    slowFiles: topOf(fold(fileRows(records, (file) => file.wallMs)), top),
    heavyFiles: topOf(fold(fileRows(records, (file) => file.peakRssKb)), top),
  };
}

/** A duration for a person: milliseconds under a second, else seconds. */
const ms = (value: number | null): string =>
  value === null ? '-' : value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(1)} s`;

/** A size in kilobytes for a person, in mebibytes. */
const mb = (value: number | null): string => (value === null ? '-' : `${(value / 1024).toFixed(0)} MiB`);

/** Rows of cells as columns, each padded to its widest cell, two spaces between. */
const table = (rows: string[][]): string[] =>
  rows.map((row) =>
    row
      .map((cell, i) => cell.padEnd(Math.max(...rows.map((r) => r[i]?.length ?? 0))))
      .join('  ')
      .trimEnd(),
  );

/** Each package's largest figures over the records read, and how many records it has. */
function packageRows(records: TestCosts[]): string[][] {
  const names = [...new Set(records.map((record) => record.package))].sort();
  return names.map((name) => {
    const own = records.filter((record) => record.package === name);
    const most = (figure: (record: TestCosts) => number | null) => own.reduce<number | null>((m, r) => larger(m, figure(r)), null);
    return [
      name,
      String(own.length),
      ms(most((r) => r.wallMs)),
      mb(most((r) => r.peakRssKb)),
      String(most((r) => r.files.length)),
      String(most((r) => r.tests.length)),
      ms(most((r) => r.overheadMs)),
    ];
  });
}

/** A ranking's rows as lines: the figure, how many records it was in, the package, `file:line` and the test's name. */
const rankedLines = (rows: Ranked[], figure: (value: number) => string): string[] =>
  table(
    rows.map((row) => [
      figure(row.value),
      `×${row.checks}`,
      row.package,
      row.line === null ? row.file : `${row.file}:${row.line}`,
      row.name ?? '',
    ]),
  ).map((line) => `  ${line}`);

/** The report of `records`: each package's largest wall time, peak and overhead, then the top N slowest tests and files, heaviest files. */
export function rendered(records: TestCosts[], top: number): string {
  const rankings = ranked(records, top);
  return [
    `${records.length} records (each package's largest figures; ×N is the number of records a row appears in)`,
    ...table([['package', 'records', 'wall', 'peak', 'files', 'tests', 'overhead'], ...packageRows(records)]).map((line) => `  ${line}`),
    '',
    `slowest ${top} tests`,
    ...rankedLines(rankings.tests, ms),
    '',
    `slowest ${top} files`,
    ...rankedLines(rankings.slowFiles, ms),
    '',
    `heaviest ${top} files (peak resident memory)`,
    ...rankedLines(rankings.heavyFiles, mb),
    '',
  ].join('\n');
}
