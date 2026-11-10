/**
 * The size and complexity limits, and the one ratchet on them: no file's ceiling is looser than its measure (`docs/architecture.md`,
 * *Folders, in every package*, for the size of a file; the feature-folders design under docs/, "The limits", for the functions).
 *
 * `.oxlintrc.json` is the one source of the numbers: its top level sets the four limits at their thresholds, a block turns them off
 * where a file is a test or is not ours (what `.gitattributes` marks vendored or generated), and each file over a function limit today
 * has a block of its own, its ceiling, rule by rule. These tests read all of it from there and measure the files with the four rules at
 * the thresholds the config sets, so a threshold that moves is followed rather than refused; `refusals` refuses a limit the top level
 * does not set, a ceiling above the measure, a ceiling on a rule the file no longer breaks, a ceiling for a file that is gone, and a
 * block that turns a limit off over a file that is ours and not a test. Oxlint accepts a rule name it does not know without a word, so
 * plants over each threshold prove every rule runs. No directive in the code may turn a limit off, by naming it or by naming no rule.
 *
 * A file moved whole renames its ceiling block in the same commit, its numbers unchanged; no number is ever raised: a change that meets
 * a limit cuts the function.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import ts from 'typescript';
import { ours } from 'test-kit/repo';
import { scratch } from 'test-kit/scratch';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');
const OXLINT = path.join(ROOT, 'node_modules', '.bin', 'oxlint');

const RULES = ['max-lines', 'max-lines-per-function', 'complexity', 'sonarjs/cognitive-complexity'] as const;
type Rule = (typeof RULES)[number];

type Block = { files: string[]; excludeFiles?: string[]; rules: Record<string, unknown> };
type Config = {
  jsPlugins: { name: string; specifier: string }[];
  rules: Record<string, unknown>;
  overrides: Block[];
  [key: string]: unknown;
};

/** A rule's worst measure in each file over it. */
type Measures = Record<string, Partial<Record<Rule, number>>>;

/** `.oxlintrc.json`, read as oxlint reads it: JSON with comments. */
function readConfig(): Config {
  const parsed = ts.parseConfigFileTextToJson('.oxlintrc.json', fs.readFileSync(path.join(ROOT, '.oxlintrc.json'), 'utf8'));
  if (parsed.error) throw new Error(ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n'));
  return parsed.config as Config;
}

const isLimit = (rule: string): rule is Rule => (RULES as readonly string[]).includes(rule);

/** The four limits as the top level of `config` sets them: the thresholds every file is measured at. */
const thresholdsOf = (config: Config): Record<Rule, unknown> =>
  Object.fromEntries(RULES.map((rule) => [rule, config.rules[rule]])) as Record<Rule, unknown>;

/** The blocks of `config` that turn a limit off. */
const offBlocks = (config: Config): Block[] =>
  config.overrides.filter((block) => Object.entries(block.rules).some(([rule, setting]) => isLimit(rule) && setting === 'off'));

/** A file the limits are off in by its kind: a test, a list of cases whose length is its coverage. */
const isTest = (file: string): boolean => /(?:^|\/)test\//.test(file) || /\.test\.tsx?$/.test(file);

/** The number each rule's message reports: the file's code lines, or the offending function's lines, cyclomatic or cognitive value. */
const MEASURED: Record<Rule, RegExp> = {
  'max-lines': /^File has too many lines \((\d+)\)\.$/,
  'max-lines-per-function': /^The (?:async |generator )?function (?:`[^`]+` )?has too many lines \((\d+)\)\. Maximum allowed is \d+\.$/,
  complexity: /^(?:async |generator )?function (?:`[^`]+` )?has a complexity of (\d+)\. Maximum allowed is \d+\.$/,
  'sonarjs/cognitive-complexity': /^Refactor this function to reduce its Cognitive Complexity from (\d+) to the \d+ allowed\.$/,
};

/** A rule as the config names it, from the code oxlint reports: `eslint(complexity)` or `sonarjs(cognitive-complexity)`. */
const ruleOf = (code: string): string => code.replace(/^eslint\((.*)\)$/, '$1').replace(/^(\w[\w-]*)\((.*)\)$/, '$1/$2');

/** Each jsPlugins specifier made absolute, as a config in another folder needs it: a path from the root, or a package the root installs. */
const resolvedPlugins = (config: Config): Config['jsPlugins'] =>
  config.jsPlugins.map((entry) => ({
    ...entry,
    specifier: entry.specifier.startsWith('.')
      ? path.join(ROOT, entry.specifier)
      : createRequire(path.join(ROOT, 'package.json')).resolve(entry.specifier),
  }));

/**
 * Oxlint run from `cwd` on `files` with `config`, written to `configPath`: the limits it reports, file by file, with the worst measure
 * per rule. A limit's message this test cannot read a number from fails it, since a measure read wrong passes for nothing.
 */
function measure(cwd: string, configPath: string, config: object, files: string[]): Measures {
  fs.writeFileSync(configPath, JSON.stringify(config));
  const ran = spawnSync(OXLINT, ['-c', configPath, '-f', 'json', ...files], {
    cwd,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 64 << 20,
  });
  assert.equal(ran.signal, null, `oxlint was stopped by ${ran.signal}: ${ran.stderr}`);
  assert.ok(ran.status === 0 || ran.status === 1, `oxlint exited ${ran.status}: ${ran.stderr}${ran.stdout}`);
  const report = JSON.parse(ran.stdout) as { diagnostics: { code: string; message: string; filename: string }[] };
  const out: Measures = {};
  for (const d of report.diagnostics) {
    const rule = ruleOf(d.code);
    if (!isLimit(rule)) continue;
    const found = MEASURED[rule].exec(d.message);
    assert.ok(found, `${d.filename}: no measure in ${rule}'s message "${d.message}": the rule's wording moved, so update MEASURED`);
    const file = (out[d.filename] ??= {});
    file[rule] = Math.max(file[rule] ?? 0, Number(found[1]));
  }
  return out;
}

/** The files with a ceiling, each measured at the config's four thresholds alone: no ceiling, no other rule, no type-aware pass. */
function measureTree(config: Config, files: string[]): Measures {
  const sonarjs = resolvedPlugins(config).filter((entry) => entry.name === 'sonarjs');
  const limits = { jsPlugins: sonarjs, plugins: [], rules: thresholdsOf(config) };
  return measure(ROOT, path.join(scratch('limits-'), 'limits.json'), limits, files);
}

/** The `max` a ceiling sets, when it is its top-level setting with only `max` changed; `undefined` for any other setting. */
function ceilingOf(setting: unknown, top: unknown): number | undefined {
  if (!Array.isArray(setting) || !Array.isArray(top) || setting.length !== top.length || setting[0] !== top[0]) return undefined;
  const [, option] = setting as [unknown, unknown];
  const [, base] = top as [unknown, unknown];
  if (typeof option === 'number' && typeof base === 'number') return option;
  if (typeof option !== 'object' || option === null || typeof base !== 'object' || base === null) return undefined;
  const { max } = option as { max?: unknown };
  return typeof max === 'number' && isDeepStrictEqual({ ...option, max: (base as { max?: unknown }).max }, base) ? max : undefined;
}

/** `setting`, a rule's top-level setting, with its `max` set to `max`. */
const withMax = (setting: unknown, max: number): unknown => {
  const [level, option] = setting as [string, unknown];
  return typeof option === 'number' ? [level, max] : [level, { ...(option as object), max }];
};

/** What `refusals` reads besides the config and the measures: whether a file is on disk, and the files a glob covers that are ours. */
type World = { exists: (file: string) => boolean; oursUnder: (glob: string) => string[] };

/**
 * What the limits' config says that the measures and the repository do not hold, each a sentence naming the fix: a limit the top level
 * does not set as an error with a `max`, a block that turns a limit off over a file that is ours and not a test, or turns off fewer than
 * the four, a ceiling block for more than one file or set otherwise than its rule, a ceiling on `max-lines`, a ceiling for a file that
 * is gone, a ceiling on a rule the file no longer breaks, and a ceiling above the measure.
 */
function refusals(config: Config, measures: Measures, world: World): string[] {
  const out: string[] = [];
  const top = thresholdsOf(config);
  for (const rule of RULES)
    if (ceilingOf(top[rule], top[rule]) === undefined)
      out.push(
        `the top level of .oxlintrc.json sets ${rule} to ${JSON.stringify(top[rule])}: set it as an error with its threshold as the max`,
      );
  for (const block of config.overrides) {
    const limits = Object.entries(block.rules).filter(([rule]) => isLimit(rule));
    if (limits.length === 0) continue;
    const off = limits.filter(([, setting]) => setting === 'off');
    if (off.length > 0) {
      const shaped = block.files.flatMap((glob) => world.oursUnder(glob).filter((file) => !isTest(file)));
      if (shaped.length > 0 || off.length !== RULES.length)
        out.push(
          `a block turns ${off.map(([rule]) => rule).join(', ')} off for ${block.files.join(', ')}${shaped.length > 0 ? `, over ${shaped.slice(0, 3).join(', ')}` : ''}: the four limits are off only in tests and in what .gitattributes marks vendored or generated; give a file of ours over a limit a ceiling instead`,
        );
      continue;
    }
    if (block.files.length !== 1 || block.excludeFiles !== undefined || limits.length !== Object.keys(block.rules).length) {
      out.push(`a ceiling block names ${block.files.join(', ')}: give each file a block of its own, which sets the limits alone`);
      continue;
    }
    const [file] = block.files;
    if (limits.some(([rule]) => rule === 'max-lines'))
      out.push(`${file} has a max-lines ceiling: max-lines is a stop for every file, with no ceiling — cut the file along its concepts`);
    if (!world.exists(file)) {
      out.push(`${file} has a ceiling block but is not on disk: where it moved, rename its block in .oxlintrc.json; else take it off`);
      continue;
    }
    for (const [rule, setting] of limits as [Rule, unknown][]) {
      const max = ceilingOf(setting, top[rule]);
      const worst = measures[file]?.[rule];
      if (max === undefined)
        out.push(`${file}'s ${rule} ceiling is set otherwise than its threshold: copy the top-level setting and change only its max`);
      else if (worst === undefined) out.push(`${file} no longer breaks ${rule}: take the rule off its block in .oxlintrc.json`);
      else if (max > worst)
        out.push(`${file}'s ${rule} ceiling is ${max}, above its measure ${worst}: lower it to ${worst} in .oxlintrc.json`);
    }
  }
  return out;
}

/** The files git lists under `packages`, `apps` and `lint`, by path from the root, that are on disk: the code the limits read. */
const codeFiles = (): string[] =>
  execFileSync('git', ['ls-files', '-co', '--exclude-standard', 'packages', 'apps', 'lint'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((file) => /\.(?:[cm]?js|tsx?)$/.test(file) && fs.existsSync(path.join(ROOT, file)));

test('no ceiling in .oxlintrc.json is looser than the measured worst of its file, and the limits are off only in tests and what is not ours', () => {
  const config = readConfig();
  const files = [...new Set(config.overrides.filter((b) => !offBlocks(config).includes(b)).flatMap((block) => block.files))].filter(
    (file) => !file.includes('*') && fs.existsSync(path.join(ROOT, file)),
  );
  const measures = measureTree(config, files);
  assert.ok(Object.keys(measures).length > 20, `measured ${Object.keys(measures).length} files over a limit, far fewer than have ceilings`);
  const code = codeFiles();
  const world: World = {
    exists: (file) => fs.existsSync(path.join(ROOT, file)),
    oursUnder: (glob) => code.filter((file) => path.matchesGlob(file, glob) && ours(file)),
  };
  assert.deepEqual(refusals(config, measures, world), []);
});

/**
 * A fixture config, not the repository's: the limits at thresholds of its own, a test exemption, and one ceiling block: `a.ts`, at 30
 * cyclomatic and a 90-line function.
 */
const TOP: Record<Rule, unknown> = {
  'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
  'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
  complexity: ['error', { max: 12 }],
  'sonarjs/cognitive-complexity': ['error', 10],
};

const clean = (): { config: Config; measures: Measures } => ({
  config: {
    jsPlugins: [],
    rules: { ...TOP },
    overrides: [
      { files: ['**/test/**', '**/*.test.ts'], rules: Object.fromEntries(RULES.map((rule) => [rule, 'off'])) },
      {
        files: ['a.ts'],
        rules: {
          'max-lines-per-function': withMax(TOP['max-lines-per-function'], 90),
          complexity: withMax(TOP.complexity, 30),
        },
      },
    ],
  },
  measures: { 'a.ts': { 'max-lines-per-function': 90, complexity: 30 } },
});

/** The fixture's repository: `gone.ts` is not on disk, `src/**` covers a file of ours, `vendor/**` only one that is not ours. */
const WORLD: World = {
  exists: (file) => file !== 'gone.ts',
  oursUnder: (glob) => ['src/a.ts', 'src/test/a.ts', 'src/a.test.ts'].filter((file) => path.matchesGlob(file, glob)),
};

/** The refusals of the clean fixture after `change`, which must be exactly one, and match `expected`. */
function refusedOnce(change: (fixture: ReturnType<typeof clean>) => void, expected: RegExp): void {
  const fixture = clean();
  change(fixture);
  const refused = refusals(fixture.config, fixture.measures, WORLD);
  assert.equal(refused.length, 1, refused.join('\n'));
  assert.match(refused[0], expected);
}

const ceilingBlock = (fixture: ReturnType<typeof clean>): Block => fixture.config.overrides[1];

test('the clean fixture is refused nothing, and a block turning the limits off over tests or what is not ours neither', () => {
  const fixture = clean();
  assert.deepEqual(refusals(fixture.config, fixture.measures, WORLD), []);
  const off = Object.fromEntries(RULES.map((rule) => [rule, 'off']));
  fixture.config.overrides.push({ files: ['vendor/**'], rules: off }, { files: ['src/test/**', 'src/*.test.ts'], rules: off });
  assert.deepEqual(refusals(fixture.config, fixture.measures, WORLD), []);
});

test('a threshold moved in the config is followed: the ceilings are read against the new top level', () => {
  const fixture = clean();
  fixture.config.rules.complexity = withMax(TOP.complexity, 25);
  fixture.config.rules['sonarjs/cognitive-complexity'] = withMax(TOP['sonarjs/cognitive-complexity'], 18);
  assert.deepEqual(refusals(fixture.config, fixture.measures, WORLD), []);
});

test('REFUSED: a ceiling above the measure', () => {
  refusedOnce((f) => (f.measures['a.ts'].complexity = 29), /^a\.ts's complexity ceiling is 30, above its measure 29: lower it to 29/);
});

test('REFUSED: a ceiling on a rule the file does not break, or on a file with no offender left', () => {
  refusedOnce(
    (f) => (ceilingBlock(f).rules['sonarjs/cognitive-complexity'] = withMax(TOP['sonarjs/cognitive-complexity'], 20)),
    /^a\.ts no longer breaks sonarjs\/cognitive-complexity: take the rule off its block/,
  );
  const fixture = clean();
  fixture.measures = {};
  assert.equal(refusals(fixture.config, fixture.measures, WORLD).filter((line) => line.startsWith('a.ts no longer breaks')).length, 2);
});

test('REFUSED: a ceiling for a file that is gone', () => {
  refusedOnce((f) => (ceilingBlock(f).files = ['gone.ts']), /^gone\.ts has a ceiling block but is not on disk/);
});

test('REFUSED: a ceiling block for two files, or set otherwise than its threshold', () => {
  refusedOnce((f) => (ceilingBlock(f).files = ['a.ts', 'c.ts']), /^a ceiling block names a\.ts, c\.ts: give each file a block of its own/);
  refusedOnce(
    (f) => (ceilingBlock(f).rules['max-lines-per-function'] = ['error', { max: 90, skipBlankLines: false, skipComments: true }]),
    /^a\.ts's max-lines-per-function ceiling is set otherwise than its threshold/,
  );
});

test('REFUSED: a ceiling block that sets max-lines for one file, whatever its measure', () => {
  refusedOnce((f) => {
    ceilingBlock(f).rules['max-lines'] = withMax(TOP['max-lines'], 900);
    f.measures['a.ts']['max-lines'] = 900;
  }, /^a\.ts has a max-lines ceiling/);
});

test('REFUSED: a limit the top level does not set, or a limit turned off over a file of ours that is no test', () => {
  refusedOnce((f) => (f.config.rules['max-lines'] = 'off'), /^the top level of \.oxlintrc\.json sets max-lines to/);
  refusedOnce(
    (f) => f.config.overrides.push({ files: ['src/**'], rules: Object.fromEntries(RULES.map((rule) => [rule, 'off'])) }),
    /^a block turns max-lines, max-lines-per-function, complexity, sonarjs\/cognitive-complexity off for src\/\*\*, over src\/a\.ts:/,
  );
  refusedOnce(
    (f) => f.config.overrides.push({ files: ['vendor/**'], rules: { 'max-lines': 'off' } }),
    /^a block turns max-lines off for vendor\/\*\*: the four limits are off only in/,
  );
});

/** A file of `n` code lines. */
const lines = (n: number): string => Array.from({ length: n }, (_, i) => `export const a${i} = ${i};`).join('\n');

/** The `max` each limit of `config`'s top level sets: the thresholds the plants are cut against. */
const maxOf = (config: Config, rule: Rule): number => {
  const max = ceilingOf(config.rules[rule], config.rules[rule]);
  assert.ok(max !== undefined, `the top level of .oxlintrc.json sets no max for ${rule}: set it as an error with its threshold as the max`);
  return max;
};

/** A plant one over each of `config`'s thresholds, with the measure its rule must report: built from the threshold, never a copy of it. */
const plantsOf = (config: Config): Record<Rule, { file: string; text: string; measure: number }> => {
  const max = (rule: Rule): number => maxOf(config, rule);
  return {
    'max-lines': { file: 'long.ts', text: lines(max('max-lines') + 1), measure: max('max-lines') + 1 },
    'max-lines-per-function': {
      file: 'function.ts',
      text: [
        'export function sum(k: number): number {',
        '  let n = 0;',
        ...Array.from({ length: max('max-lines-per-function') - 3 }, () => '  n += k;'),
        '  return n;',
        '}',
      ].join('\n'),
      measure: max('max-lines-per-function') + 1,
    },
    complexity: {
      file: 'cyclomatic.ts',
      text: [
        'export function pick(n: number): string {',
        '  switch (n) {',
        ...Array.from({ length: max('complexity') }, (_, i) => `    case ${i}: return '${i}';`),
        "    default: return '';",
        '  }',
        '}',
      ].join('\n'),
      measure: max('complexity') + 1,
    },
    'sonarjs/cognitive-complexity': {
      file: 'cognitive.ts',
      text: [
        'export function count(n: number): number {',
        ...Array.from({ length: max('sonarjs/cognitive-complexity') + 1 }, (_, i) => `  if (n === ${i}) n += 1;`),
        '  return n;',
        '}',
      ].join('\n'),
      measure: max('sonarjs/cognitive-complexity') + 1,
    },
  };
};

/** A path under `glob` for a plant: `**\/` dropped, then each `**` and `*` filled with a name. */
const plantUnder = (glob: string): string => {
  const file = glob.replaceAll('**/', '').replaceAll('**', 'all.ts').replaceAll('*', 'all');
  assert.ok(path.matchesGlob(file, glob), `no plant path read from the glob ${glob}: widen plantUnder for its shape`);
  return file;
};

/**
 * `config`'s limits run on a plant over each threshold, one under a ceiling a step below its measure, one under a ceiling at it, a file
 * at `max-lines` exactly, and every plant again in a file each of the config's exempting globs covers: the measures oxlint reports.
 */
function plantsMeasured(config: Config): { measures: Measures; plants: ReturnType<typeof plantsOf> } {
  const plants = plantsOf(config);
  const dir = scratch('limits-');
  const exemptions = offBlocks(config);
  const exempt = [...new Set(exemptions.flatMap((block) => block.files).map(plantUnder))];
  const all = RULES.map((rule) => plants[rule].text.replaceAll('export ', '')).join('\n');
  for (const file of exempt) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), all);
  }
  const ceilings: Block[] = [];
  for (const side of ['on', 'under', 'at']) fs.mkdirSync(path.join(dir, side), { recursive: true });
  for (const rule of RULES) {
    const { file, text, measure: at } = plants[rule];
    fs.writeFileSync(path.join(dir, 'on', file), text);
    if (rule === 'max-lines') {
      fs.writeFileSync(path.join(dir, 'at', file), lines(at - 1));
      continue;
    }
    for (const side of ['under', 'at']) fs.writeFileSync(path.join(dir, side, file), text);
    ceilings.push({ files: [`under/${file}`], rules: { [rule]: withMax(config.rules[rule], at - 1) } });
    ceilings.push({ files: [`at/${file}`], rules: { [rule]: withMax(config.rules[rule], at) } });
  }
  const { options: _options, $schema: _schema, ignorePatterns: _ignored, ...rest } = config;
  const used = { ...rest, jsPlugins: resolvedPlugins(config), overrides: [...exemptions, ...ceilings] };
  return { measures: measure(dir, path.join(dir, '.oxlintrc.json'), used, ['on', 'under', 'at', ...exempt]), plants };
}

/** That `config`'s limits refuse each plant with its measure, read each ceiling, and refuse nothing at a ceiling, at the stop or exempt. */
function assertPlantsHeld(config: Config): void {
  const { measures, plants } = plantsMeasured(config);
  const expected = (side: string, rules: readonly Rule[] = RULES): Measures =>
    Object.fromEntries(rules.map((rule) => [`${side}/${plants[rule].file}`, { [rule]: plants[rule].measure }]));
  assert.deepEqual(
    Object.fromEntries(Object.entries(measures).filter(([file]) => file.startsWith('on/'))),
    expected('on'),
    'a limit refused no plant, or not with its measure: the rule is off, misnamed, or its message is read wrong',
  );
  assert.deepEqual(
    Object.fromEntries(Object.entries(measures).filter(([file]) => file.startsWith('under/'))),
    expected(
      'under',
      RULES.filter((rule) => rule !== 'max-lines'),
    ),
    'a ceiling one below the measure refused nothing: oxlint did not read the block',
  );
  assert.deepEqual(
    Object.keys(measures).filter((file) => !file.startsWith('on/') && !file.startsWith('under/')),
    [],
    'a limit refused a plant at its ceiling, a file at the max-lines stop, or a file it is off in',
  );
}

test('each limit the config names runs at its threshold, is off in the files its exempting blocks cover, and holds a ceiling at the measure', () => {
  assertPlantsHeld(readConfig());
});

test('a threshold changed in the config is followed: the plants are cut against the new numbers and refused at them', () => {
  const config = readConfig();
  for (const rule of RULES) config.rules[rule] = withMax(config.rules[rule], maxOf(config, rule) - 5);
  const { plants } = plantsMeasured(config);
  assert.equal(plants.complexity.measure, maxOf(readConfig(), 'complexity') - 4, 'the plants did not read the changed threshold');
  assertPlantsHeld(config);
});

/**
 * The directives in `text` that turn a limit off: one that names a limit, and one that names no rule, which turns every rule off. A
 * directive's reason, after `--`, names no rule.
 */
function limitDirectives(text: string): string[] {
  return [...text.matchAll(/(?:oxlint|eslint)-disable(?:-next-line|-line)?(?![\w-])([^\n]*)/g)]
    .filter(([, rest]) => {
      const rules = rest
        .replace(/\*\/.*$/, '')
        .replace(/\s--(?:\s.*)?$/, '')
        .trim();
      return rules === '' || rules.split(/[\s,]+/).some((rule) => isLimit(rule));
    })
    .map(([directive]) => directive.trim());
}

test('REFUSED: a directive that names a limit, or no rule at all, is found', () => {
  const fixture = [
    '/* oxlint-disable */',
    '// oxlint-disable-next-line -- the whole line, every rule',
    '// eslint-disable-next-line complexity -- a long switch',
    '/* oxlint-disable max-lines, no-console */',
    '{/* oxlint-disable-next-line sonarjs/cognitive-complexity */}',
    '// oxlint-disable-next-line no-control-regex -- a control character is refused',
    '// oxlint-disable-next-line typescript/no-base-to-string, jsx-a11y/no-noninteractive-element-interactions -- max-lines is not named',
    '// oxlint-enable complexity',
  ].join('\n');
  assert.deepEqual(limitDirectives(fixture), [
    'oxlint-disable */',
    'oxlint-disable-next-line -- the whole line, every rule',
    'eslint-disable-next-line complexity -- a long switch',
    'oxlint-disable max-lines, no-console */',
    'oxlint-disable-next-line sonarjs/cognitive-complexity */}',
  ]);
});

test('no directive in the code turns a limit off for a line or a file, by naming it or by naming no rule', () => {
  const exempt = offBlocks(readConfig()).flatMap((block) => block.files);
  const files = codeFiles().filter((file) => ours(file) && !exempt.some((glob) => path.matchesGlob(file, glob)));
  assert.ok(files.length > 100, `read ${files.length} source files, far fewer than the workspace has`);
  assert.deepEqual(
    files.flatMap((file) => limitDirectives(fs.readFileSync(path.join(ROOT, file), 'utf8')).map((found) => `${file}: ${found}`)),
    [],
    'a limit is met by cutting the function, never by a directive: name the rule the line breaks, which is not a limit',
  );
});
