/**
 * Each context of the product keeps a glossary table at its door, a `glossary.json` (`paths` from the repository's root, `terms`, and on
 * a term the spellings it `retired`, each with the card that removes it). This guard holds the tables and the spellings they retire:
 *
 * - **A table has its shape** (`shapeBreaks`): a `context`, a `title`, an `about`, its `paths` and its `terms`, each term a `term` and a
 *   `meaning`, and where present a `type`, a `see` link and its `retired` spellings.
 * - **A path is on disk, and in one table** (`pathBreaks`): a file belongs to the context with the longest path that holds it, so two
 *   tables claiming one path would leave its owner a guess.
 * - **A retired spelling names its card** (`cardBreaks`): the card that removes it from the code.
 * - **A retired spelling only goes** (`countBreaks`): matched whole and in any case, as `agent-orchestrator/test/words.test.ts` matches a
 *   word (no letter, digit, `_` or `$` on either side, so `wf/x` and `wf-x` say it and `wfx`, `$wf` and `_wf` do not), in each `.ts` and
 *   `.tsx` git lists under the retiring table's paths — a context nested in it included, so the run core's `wf` is counted in the whole
 *   of `packages/agent-orchestrator`. Tests, a `test/` folder, the board's vendored `components/ui` and its generated route tree are not
 *   read, as `words.test.ts` reads none. Each file that says one today is counted in `RETIRED_COUNTS` (`glossary.baseline.ts`), and the
 *   count only shrinks: refused are a file the baseline does not hold, a count above the measure or below it, an entry for a file clean
 *   or gone, and a spelling no table retires. Where two tables retire one spelling, its count is kept once, over the files of both.
 *
 * This replaces the two `wf` ratchets the orchestrator's and the api's `cli-name.test.ts` held: the run core's table retires `wf`, and
 * the api's too. The tables and the apps' source are among `guards#test`'s inputs in `turbo.json`; the packages' reach it through its
 * dependency on `agent-orchestrator`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RETIRED_COUNTS } from './glossary.baseline.ts';
import { files, REPO } from './repo-files.ts';
import { scratch } from './scratch.ts';

type Retired = { spelling: string; card: string };
type Term = { term: string; meaning: string; type?: string; see?: { label: string; href: string }; retired?: Retired[] };
type Table = { context: string; title: string; about: string; paths: string[]; terms: Term[] };

/** Each retired spelling, lower-cased, and each file of it by its path from the root, with the times it says it. */
type Counts = Record<string, Record<string, number>>;

/** A table as read: its file from the root, and its text parsed, which `shapeBreaks` vouches for before it is used as a `Table`. */
type Read = { file: string; table: Table };

/** Where the counts live, as a refusal names it. */
const BASELINE = 'tools/guards/test/glossary.baseline.ts';

const SHAPE =
  'context, title, about, paths[] and terms[], each term a term and a meaning, with an optional type, see{label, href} and retired[{spelling, card}]';

const isString = (value: unknown): value is string => typeof value === 'string';
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** What `value`, the text of the table `file` parsed, lacks of a table's shape, each as a sentence naming the fix. */
function shapeBreaks(file: string, value: unknown): string[] {
  const fix = `write ${file} as a glossary table: ${SHAPE}`;
  if (!isRecord(value)) return [`${file} is no object: ${fix}`];
  const out: string[] = [];
  for (const field of ['context', 'title', 'about'])
    if (!isString(value[field]) || !value[field].trim()) out.push(`${file} has no ${field}: ${fix}`);
  if (!Array.isArray(value.paths) || value.paths.length === 0 || !value.paths.every(isString))
    out.push(`${file} has no paths, a list of folders or files from the repository root: ${fix}`);
  if (!Array.isArray(value.terms)) return [...out, `${file} has no terms: ${fix}`];
  value.terms.forEach((term: unknown, i) => {
    const at = `${file}'s term ${i + 1}`;
    if (!isRecord(term) || !isString(term.term) || !isString(term.meaning)) return out.push(`${at} has no term or no meaning: ${fix}`);
    if (term.type !== undefined && !isString(term.type)) out.push(`${at} (${term.term}) has a type that is no string: ${fix}`);
    if (term.see !== undefined && !(isRecord(term.see) && isString(term.see.label) && isString(term.see.href)))
      out.push(`${at} (${term.term}) has a see that is no {label, href}: ${fix}`);
    if (
      term.retired !== undefined &&
      !(Array.isArray(term.retired) && term.retired.every((r) => isRecord(r) && isString(r.spelling) && r.spelling.trim()))
    )
      out.push(`${at} (${term.term}) has a retired that is no list of {spelling, card}: ${fix}`);
    return undefined;
  });
  return out;
}

/** Whether `file`, a path from the root, is `claimed` or under it. */
const under = (file: string, claimed: string): boolean => file === claimed || file.startsWith(`${claimed}/`);

/** Each path of `tables` that is not on disk under `root`, and each that two tables claim, as a sentence naming the fix. */
function pathBreaks(root: string, tables: readonly Read[]): string[] {
  const out: string[] = [];
  const owner = new Map<string, string>();
  for (const { file, table } of tables)
    for (const claimed of table.paths) {
      if (!fs.existsSync(path.join(root, claimed)))
        out.push(`${file} claims ${claimed}, which is not on disk: correct the path in ${file}, or take it off`);
      const first = owner.get(claimed);
      if (first === undefined) owner.set(claimed, file);
      else out.push(`${claimed} is claimed by ${first} and ${file}: keep it in the one table of the context that owns it`);
    }
  return out;
}

/** Each retired spelling of `tables` that names no card, as a sentence naming the fix. */
const cardBreaks = (tables: readonly Read[]): string[] =>
  tables.flatMap(({ file, table }) =>
    table.terms.flatMap((term) =>
      (term.retired ?? [])
        .filter((r) => !isString(r.card) || !r.card.trim())
        .map((r) => `${file} retires ${r.spelling} under ${term.term} with no card: name the card that removes it in that row's card`),
    ),
  );

/** The files the count leaves out, as `words.test.ts` leaves them: tests, and the board's vendored and generated files. */
const skipped = (file: string): boolean =>
  /\.test\.tsx?$/.test(file) ||
  file.split('/').includes('test') ||
  file.startsWith('apps/web/src/components/ui/') ||
  file === 'apps/web/src/routeTree.gen.ts';

const escaped = (word: string): string => word.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

/** How many times `text` says `spelling`, whole and in any case: no letter, digit, `_` or `$` on either side. */
const wordsIn = (text: string, spelling: string): number =>
  [...text.matchAll(new RegExp(`(?<![\\w$])${escaped(spelling)}(?![\\w$])`, 'gi'))].length;

/** A row that retires a spelling: its table, and the term to say instead. */
type Retiring = { read: Read; term: string };

/** Each retired spelling of `tables`, lower-cased, and the rows that retire it. */
function retirements(tables: readonly Read[]): Map<string, Retiring[]> {
  const by = new Map<string, Retiring[]>();
  for (const read of tables)
    for (const term of read.table.terms)
      for (const r of term.retired ?? []) {
        const spelling = r.spelling.toLowerCase();
        by.set(spelling, [...(by.get(spelling) ?? []), { read, term: term.term }]);
      }
  return by;
}

/** The term to say in `file` for `spelling`, and its table: the rows whose table holds the file, else every row that retires it. */
function insteadOf(spelling: string, file: string, retiring: ReadonlyMap<string, Retiring[]>): string {
  const rows = retiring.get(spelling) ?? [];
  const holding = rows.filter(({ read }) => read.table.paths.some((p) => under(file, p)));
  return (holding.length ? holding : rows).map(({ read, term }) => `${term} (${read.file})`).join(' or ');
}

/**
 * Each retired spelling's count in each file that says it: the `.ts` and `.tsx` of `listed` under a path of a table that retires it,
 * each file read once however many of those tables hold it, by `read` (undefined for a file listed but gone).
 */
function measure(tables: readonly Read[], listed: readonly string[], read: (file: string) => string | undefined): Counts {
  const counts: Counts = {};
  for (const [spelling, retiring] of retirements(tables)) {
    const paths = retiring.flatMap(({ read }) => read.table.paths);
    const found: Record<string, number> = {};
    for (const file of listed) {
      if (!/\.tsx?$/.test(file) || skipped(file) || !paths.some((p) => under(file, p))) continue;
      const count = wordsIn(read(file) ?? '', spelling);
      if (count > 0) found[file] = count;
    }
    counts[spelling] = found;
  }
  return counts;
}

/**
 * What the measure and the baseline disagree on, each a sentence naming the fix: a file the baseline does not hold, a count above the
 * measure or below it, an entry for a file clean or gone, and a spelling no table retires.
 */
function countBreaks(
  counts: Counts,
  baseline: Counts,
  retiring: ReadonlyMap<string, Retiring[]>,
  exists: (file: string) => boolean,
): string[] {
  const out: string[] = [];
  for (const [spelling, found] of Object.entries(counts)) {
    const held = baseline[spelling] ?? {};
    for (const [file, count] of Object.entries(found))
      if (!(file in held))
        out.push(
          `${file} says ${spelling}, retired, ${count} time(s): say ${insteadOf(spelling, file, retiring)}; never add it to ${BASELINE}`,
        );
  }
  for (const [spelling, held] of Object.entries(baseline)) {
    if (!retiring.has(spelling)) {
      out.push(`${BASELINE} holds ${spelling}, which no glossary table retires: take its entries off, or retire it in its context's table`);
      continue;
    }
    for (const [file, allowed] of Object.entries(held)) {
      const count = counts[spelling]?.[file] ?? 0;
      const entry = `RETIRED_COUNTS[${JSON.stringify(spelling)}][${JSON.stringify(file)}]`;
      if (!exists(file)) out.push(`${file} is in ${BASELINE} but not on disk: where it moved, rename ${entry}; else take it off`);
      else if (count === 0) out.push(`${file} says ${spelling} no more: take ${entry} off ${BASELINE}`);
      else if (count > allowed)
        out.push(
          `${file} says ${spelling} ${count} time(s), more than the ${allowed} ${entry} allows: say ${insteadOf(spelling, file, retiring)}`,
        );
      else if (count < allowed)
        out.push(`${file} says ${spelling} ${count} time(s), fewer than ${allowed}: lower ${entry} to ${count} in ${BASELINE}`);
    }
  }
  return out;
}

/**
 * Every breach of the tables under `root` and their retired spellings against `baseline`: `listed` is the files git lists, by their
 * path from `root`, among them each `glossary.json`, which is a table.
 */
function glossaryBreaks(root: string, listed: readonly string[], baseline: Counts): string[] {
  const read = (file: string): string | undefined => {
    const at = path.join(root, file);
    return fs.statSync(at, { throwIfNoEntry: false })?.isFile() ? fs.readFileSync(at, 'utf8') : undefined;
  };
  const tables: Read[] = [];
  const shapes: string[] = [];
  for (const file of listed.filter((f) => path.posix.basename(f) === 'glossary.json')) {
    const text = read(file);
    if (text === undefined) continue;
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      shapes.push(`${file} is no JSON: write it as a glossary table: ${SHAPE}`);
      continue;
    }
    const broken = shapeBreaks(file, value);
    if (broken.length) shapes.push(...broken);
    else tables.push({ file, table: value as Table });
  }
  const exists = (file: string): boolean => fs.existsSync(path.join(root, file));
  return [
    ...shapes,
    ...pathBreaks(root, tables),
    ...cardBreaks(tables),
    ...countBreaks(measure(tables, listed, read), baseline, retirements(tables), exists),
  ];
}

/** A table of one context, `pkg`, whose term Nemia retires `wf` on `card`. */
const table = (over: Partial<Table> = {}, card = 'slice-4'): Table => ({
  context: 'core',
  title: 'The core',
  about: 'the core of a planted package.',
  paths: ['pkg'],
  terms: [{ term: 'Nemia', meaning: 'the system.', retired: [{ spelling: 'wf', card }] }],
  ...over,
});

/** A scratch root holding each of `planted`, by its path from the root, and the list git would give of it. */
function plant(planted: Record<string, string | object>): { root: string; listed: string[] } {
  const root = scratch('glossary-');
  for (const [file, body] of Object.entries(planted)) {
    fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), typeof body === 'string' ? body : JSON.stringify(body));
  }
  return { root, listed: Object.keys(planted).sort() };
}

/** The breaches of a root holding the table `pkg/glossary.json` and `pkg/src/a.ts`, which says `wf` twice, against `baseline`. */
const planted = (baseline: Counts, over: Record<string, string | object> = {}): string[] => {
  const { root, listed } = plant({ 'pkg/glossary.json': table(), 'pkg/src/a.ts': '// wf retry, as `wf hold` does\n', ...over });
  return glossaryBreaks(root, listed, baseline);
};

const HELD: Counts = { wf: { 'pkg/src/a.ts': 2 } };

/** Asserts `breaks` is one refusal, naming each of `names`. */
const refusedOnce = (breaks: readonly string[], ...names: string[]): void => {
  assert.equal(breaks.length, 1, breaks.join('\n'));
  for (const name of names) assert.ok(breaks[0].includes(name), `the refusal names ${name}: ${breaks[0]}`);
};

test('the matcher counts a retired spelling whole and in any case, in the code under the paths of its table and no test', () => {
  assert.equal(wordsIn('wf, WF, wf/x, wf-x', 'wf'), 4);
  assert.equal(wordsIn('wfx, $wf, _wf, wf_x, wf$', 'wf'), 0);
  const { root, listed } = plant({
    'pkg/glossary.json': table(),
    'pkg/src/a.ts': 'wf',
    'pkg/src/b.tsx': 'Wf',
    'pkg/src/a.test.ts': 'wf',
    'pkg/src/b.test.tsx': 'wf',
    'pkg/test/c.ts': 'wf',
    'pkg/src/d.md': 'wf',
    'pkg/src/nested/glossary.json': table({ paths: ['pkg/src/nested'] }),
    'pkg/src/nested/e.ts': 'wf wf',
    'other/f.ts': 'wf',
    'apps/web/src/routeTree.gen.ts': 'wf',
    'apps/web/src/components/ui/g.tsx': 'wf',
  });
  const both = { paths: ['pkg', 'apps/web'] };
  const tables = [
    { file: 'pkg/glossary.json', table: table(both) },
    { file: 'pkg/src/nested/glossary.json', table: table({ paths: ['pkg/src/nested'] }) },
  ];
  const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
  assert.deepEqual(
    measure(tables, listed, read),
    { wf: { 'pkg/src/a.ts': 1, 'pkg/src/b.tsx': 1, 'pkg/src/nested/e.ts': 2 } },
    "a parent's spelling is counted in a nested context, once however many tables retire it; tests, the vendored and generated files are not read",
  );
  assert.deepEqual(planted(HELD), [], 'a measure the baseline holds is let through');
});

test('REFUSED: a table missing its terms', () => {
  const { terms: _, ...termless } = table();
  refusedOnce(planted({}, { 'pkg/glossary.json': termless, 'pkg/src/a.ts': '' }), 'pkg/glossary.json', 'terms');
});

test('REFUSED: a path of a table that is not on disk', () => {
  refusedOnce(planted(HELD, { 'pkg/glossary.json': table({ paths: ['pkg', 'pkg/gone'] }) }), 'pkg/glossary.json', 'pkg/gone');
});

test('REFUSED: one path claimed by two tables', () => {
  refusedOnce(
    planted(HELD, { 'pkg/src/glossary.json': table({ context: 'twin', paths: ['pkg'], terms: [] }) }),
    'pkg/glossary.json',
    'pkg/src/glossary.json',
  );
});

test('REFUSED: a retired spelling with an empty card, or none', () => {
  refusedOnce(planted(HELD, { 'pkg/glossary.json': table({}, ' ') }), 'pkg/glossary.json', 'wf');
  const cardless = table();
  cardless.terms[0].retired = [{ spelling: 'wf' } as Retired];
  refusedOnce(planted(HELD, { 'pkg/glossary.json': cardless }), 'pkg/glossary.json', 'wf');
});

test('REFUSED: a count above the baseline', () => {
  refusedOnce(planted({ wf: { 'pkg/src/a.ts': 1 } }), 'pkg/src/a.ts', 'RETIRED_COUNTS');
});

test('REFUSED: a count below the baseline, to be lowered', () => {
  refusedOnce(planted({ wf: { 'pkg/src/a.ts': 3 } }), 'pkg/src/a.ts', 'RETIRED_COUNTS', 'to 2');
});

test('REFUSED: a file that says a retired spelling the baseline does not hold', () => {
  refusedOnce(planted(HELD, { 'pkg/src/b.ts': 'wf' }), 'pkg/src/b.ts', 'pkg/glossary.json');
});

test('REFUSED: a baseline entry for a file clean or gone', () => {
  refusedOnce(planted({ wf: { ...HELD.wf, 'pkg/src/b.ts': 1 } }, { 'pkg/src/b.ts': 'nemia' }), 'pkg/src/b.ts', 'RETIRED_COUNTS');
  refusedOnce(planted({ wf: { ...HELD.wf, 'pkg/src/gone.ts': 1 } }), 'pkg/src/gone.ts', 'RETIRED_COUNTS');
});

test('REFUSED: a baseline spelling no table retires', () => {
  refusedOnce(planted({ ...HELD, ae: { 'pkg/src/a.ts': 1 } }), 'ae', BASELINE);
});

test('the repository: every table has its shape and its own paths, and each retired spelling only goes, file by file', () => {
  const listed = files();
  assert.ok(listed.filter((f) => path.posix.basename(f) === 'glossary.json').length > 0, 'git lists the glossary tables');
  assert.deepEqual(glossaryBreaks(REPO, listed, RETIRED_COUNTS), []);
});
