/**
 * The size and complexity limits, and the ratchet that holds each file over one today to its own measure
 * (the feature-folders design under docs/, "The limits" and "The ratchet").
 *
 * `.oxlintrc.json` turns four rules on for every file at their thresholds, `THRESHOLDS` below; turns them off only in tests, vendored
 * and generated files, `EXEMPT`; and gives each file over a limit today a block of its own, its ceiling: its measure, rule by rule. Lint
 * refuses the file that grows past it. A ceiling holds only the worst function, so `RECORD` holds each such file's count of offenders
 * per rule. These tests measure the files with the four rules at their thresholds, and `refusals` refuses a ceiling above the measure,
 * a count of offenders other than the measure, a ceiling `RECORD` does not know, an entry with no ceiling, and an entry for a file with
 * no offender left. Oxlint accepts a rule name it does not know without a word, so plants over each threshold prove every rule runs.
 * No directive in the code may turn a limit off, by naming it or by naming no rule.
 *
 * A file moved whole renames its entry and its ceiling block in the same commit, its numbers unchanged. A file cut into parts gives an
 * entry only to the parts still over a limit, each no higher than the original's ceiling per rule, their counts summing to no more than
 * the original's. No number is ever raised: a change that meets a limit cuts the function.
 *
 * The test reads files outside this package. `turbo.json` makes `.oxlintrc.json` and the apps' sources inputs of this package's tests, and
 * the runtime reaches them as a dependency; after a change anywhere else, `npx turbo run test --force`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import ts from 'typescript';
import { scratch } from './scratch.ts';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');
const OXLINT = path.join(ROOT, 'node_modules', '.bin', 'oxlint');

const RULES = ['max-lines', 'max-lines-per-function', 'complexity', 'sonarjs/cognitive-complexity'] as const;
type Rule = (typeof RULES)[number];

/** Each limit at the design's threshold, set as the top level of `.oxlintrc.json` must set it. */
const THRESHOLDS: Record<Rule, unknown> = {
  'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
  'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
  complexity: ['error', { max: 20 }],
  'sonarjs/cognitive-complexity': ['error', 15],
};

/** The globs where the limits are off, and only these: tests, the shadcn CLI's components, TanStack Router's route tree. */
const EXEMPT = ['**/test/**', '**/*.test.ts', 'apps/web/src/components/ui/**', 'apps/web/src/routeTree.gen.ts'];

/**
 * Each file over a limit, with its count of offenders per rule: the functions over it, or 1 for `max-lines`. It only shrinks, and each
 * entry has a ceiling block in `.oxlintrc.json`.
 */
const RECORD: Record<string, Partial<Record<Rule, number>>> = {
  'apps/api/src/capabilities/capabilities.ts': { complexity: 1, 'sonarjs/cognitive-complexity': 1 },
  'apps/api/src/capabilities/reach.ts': { 'max-lines-per-function': 1, complexity: 1, 'sonarjs/cognitive-complexity': 1 },
  'apps/api/src/detail/detail.ts': { 'max-lines-per-function': 1, complexity: 1 },
  'packages/agent-orchestrator/src/summary/judged.verb.ts': { complexity: 1 },
  'apps/api/src/workflows/workflows.ts': { complexity: 1 },
  'apps/web/src/components/AgentForm.tsx': { 'max-lines-per-function': 1 },
  'apps/web/src/components/CardGate.tsx': { 'max-lines-per-function': 1 },
  'apps/web/src/components/Decide.tsx': { 'max-lines': 1, 'max-lines-per-function': 1, complexity: 1, 'sonarjs/cognitive-complexity': 1 },
  'apps/web/src/components/FactoryCanvas.tsx': { 'max-lines-per-function': 1 },
  'apps/web/src/components/NewWorkflow.tsx': { 'max-lines-per-function': 1 },
  'apps/web/src/components/PruneRun.tsx': { 'max-lines-per-function': 1 },
  'apps/web/src/components/Reach.tsx': { 'max-lines-per-function': 1, 'sonarjs/cognitive-complexity': 1 },
  'apps/web/src/components/RunCanvas.tsx': { 'max-lines-per-function': 1 },
  'apps/web/src/components/RunNode.tsx': { 'max-lines-per-function': 1, complexity: 1, 'sonarjs/cognitive-complexity': 1 },
  'apps/web/src/components/SkillForm.tsx': { 'max-lines-per-function': 1 },
  'apps/web/src/components/StartRun.tsx': { 'max-lines-per-function': 1 },
  'apps/web/src/components/StepForm.tsx': { 'max-lines-per-function': 1, complexity: 1, 'sonarjs/cognitive-complexity': 1 },
  'apps/web/src/components/StepInspector.tsx': { 'sonarjs/cognitive-complexity': 1 },
  'apps/web/src/components/StepNode.tsx': { 'max-lines-per-function': 2, complexity: 1, 'sonarjs/cognitive-complexity': 1 },
  'apps/web/src/components/StepRail.tsx': { 'max-lines-per-function': 1 },
  'apps/web/src/components/WorkflowBuilder.tsx': { 'max-lines-per-function': 1 },
  'apps/web/src/lib/factory.ts': { 'max-lines-per-function': 1, complexity: 1, 'sonarjs/cognitive-complexity': 1 },
  'apps/web/src/lib/feed.ts': { 'max-lines-per-function': 1 },
  'apps/web/src/lib/gate.ts': { complexity: 1, 'sonarjs/cognitive-complexity': 1 },
  'apps/web/src/lib/outcome.ts': { 'sonarjs/cognitive-complexity': 1 },
  'apps/web/src/lib/prune.ts': { 'sonarjs/cognitive-complexity': 1 },
  'apps/web/src/lib/status.ts': { complexity: 1, 'sonarjs/cognitive-complexity': 1 },
  'apps/web/src/lib/transcript.ts': { complexity: 1, 'sonarjs/cognitive-complexity': 1 },
  'apps/web/src/routes/agents_.skills.$from.$skill.tsx': { 'max-lines-per-function': 1 },
  'apps/web/src/routes/capabilities.tsx': { 'max-lines-per-function': 2, complexity: 1, 'sonarjs/cognitive-complexity': 1 },
  'apps/web/src/routes/inbox.tsx': { 'max-lines-per-function': 1 },
  'packages/agent-orchestrator/src/agents/agents.ts': { 'sonarjs/cognitive-complexity': 1 },
  'packages/agent-orchestrator/src/agents/agents.store.ts': {
    'max-lines-per-function': 1,
    complexity: 1,
    'sonarjs/cognitive-complexity': 1,
  },
  'packages/agent-orchestrator/src/skills/skills.store.ts': { 'sonarjs/cognitive-complexity': 1 },
  'packages/agent-orchestrator/src/closeout/closeout.ts': { complexity: 1, 'sonarjs/cognitive-complexity': 1 },
  'packages/agent-orchestrator/src/former/former.ts': { 'sonarjs/cognitive-complexity': 1 },
  'packages/agent-orchestrator/src/inbox/inbox.store.ts': { 'sonarjs/cognitive-complexity': 1 },
  'packages/agent-orchestrator/src/keys/keys.ts': { 'sonarjs/cognitive-complexity': 1 },
  'packages/agent-orchestrator/src/plan/plan.ts': { 'sonarjs/cognitive-complexity': 1 },
  'packages/agent-orchestrator/src/rest/rest.ts': { 'sonarjs/cognitive-complexity': 1 },
  'packages/agent-orchestrator/src/brief/brief-sections.ts': { 'sonarjs/cognitive-complexity': 1 },
  'packages/agent-orchestrator/src/brief/brief.ts': { 'max-lines-per-function': 1, complexity: 1, 'sonarjs/cognitive-complexity': 1 },
  'packages/agent-orchestrator/src/decide/decide.ts': { 'max-lines-per-function': 1, complexity: 1 },
  'packages/agent-orchestrator/src/forget/forget.ts': { complexity: 1, 'sonarjs/cognitive-complexity': 1 },
  'packages/agent-orchestrator/src/gate/gate.ts': { 'max-lines-per-function': 1, complexity: 1, 'sonarjs/cognitive-complexity': 1 },
  'packages/agent-orchestrator/src/list/list.ts': { 'max-lines-per-function': 1, complexity: 3, 'sonarjs/cognitive-complexity': 2 },
  'packages/agent-orchestrator/src/retry/retry.ts': { complexity: 3, 'sonarjs/cognitive-complexity': 3 },
  'packages/agent-orchestrator/src/round/round.ts': { 'max-lines-per-function': 2, complexity: 2, 'sonarjs/cognitive-complexity': 2 },
  'packages/agent-orchestrator/src/tick/assess.ts': { complexity: 1, 'sonarjs/cognitive-complexity': 1 },
  'packages/agent-orchestrator/src/ending/ending.ts': { complexity: 1, 'sonarjs/cognitive-complexity': 1 },
  'packages/agent-orchestrator/src/status/status.ts': { complexity: 1, 'sonarjs/cognitive-complexity': 2 },
  'packages/agent-orchestrator/src/wait/wait.ts': { complexity: 1, 'sonarjs/cognitive-complexity': 2 },
  'packages/agent-orchestrator/src/record/record.store.ts': { 'max-lines': 1 },
  'packages/agent-orchestrator/src/timeline/timeline.ts': { complexity: 1, 'sonarjs/cognitive-complexity': 1 },
  'packages/agent-orchestrator/src/workflow/validate.ts': { complexity: 1, 'sonarjs/cognitive-complexity': 2 },
  'packages/agent-orchestrator/src/workspace/worktree.store.ts': { complexity: 1, 'sonarjs/cognitive-complexity': 1 },
  'packages/agent-runtime/src/a2a/client.ts': { 'max-lines-per-function': 1 },
  'packages/agent-runtime/src/a2a/map.ts': { 'sonarjs/cognitive-complexity': 1 },
  'packages/agent-runtime/src/a2a/remote.ts': { 'max-lines-per-function': 1, 'sonarjs/cognitive-complexity': 1 },
  'packages/agent-runtime/src/cli/main.ts': { complexity: 1, 'sonarjs/cognitive-complexity': 1 },
  'packages/agent-runtime/src/core/domain.ts': { complexity: 2, 'sonarjs/cognitive-complexity': 2 },
  'packages/agent-runtime/src/core/engine/engine.ts': { complexity: 1, 'sonarjs/cognitive-complexity': 1 },
  'packages/agent-runtime/src/core/event-schema.ts': { 'sonarjs/cognitive-complexity': 1 },
  'packages/agent-runtime/src/service/harness-refusal.ts': { complexity: 1, 'sonarjs/cognitive-complexity': 1 },
  'packages/agent-runtime/src/harness/args.ts': { complexity: 1, 'sonarjs/cognitive-complexity': 1 },
  'packages/agent-runtime/src/harness/claude/code.ts': { complexity: 1 },
  'packages/agent-runtime/src/harness/detached/detached.ts': { 'max-lines-per-function': 1 },
  'packages/agent-runtime/src/harness/mcp.ts': { 'sonarjs/cognitive-complexity': 1 },
  'packages/agent-runtime/src/harness/sdk.ts': { 'max-lines-per-function': 1, complexity: 1, 'sonarjs/cognitive-complexity': 1 },
  'packages/agent-runtime/src/service/engine.ts': { 'max-lines-per-function': 2 },
  'packages/agent-runtime/src/service/say.ts': { complexity: 1, 'sonarjs/cognitive-complexity': 1 },
};

type Block = { files: string[]; excludeFiles?: string[]; rules: Record<string, unknown> };
type Config = {
  jsPlugins: { name: string; specifier: string }[];
  rules: Record<string, unknown>;
  overrides: Block[];
  [key: string]: unknown;
};

/** A rule's worst measure in a file, and its count of offenders there. */
type Measure = { worst: number; count: number };
type Measures = Record<string, Partial<Record<Rule, Measure>>>;

/** `.oxlintrc.json`, read as oxlint reads it: JSON with comments. */
function readConfig(): Config {
  const parsed = ts.parseConfigFileTextToJson('.oxlintrc.json', fs.readFileSync(path.join(ROOT, '.oxlintrc.json'), 'utf8'));
  if (parsed.error) throw new Error(ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n'));
  return parsed.config as Config;
}

const isLimit = (rule: string): rule is Rule => (RULES as readonly string[]).includes(rule);

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
 * and the count per rule. A limit's message this test cannot read a number from fails it, since a measure read wrong passes for nothing.
 */
function measure(cwd: string, configPath: string, config: object, files: string[]): Measures {
  fs.writeFileSync(configPath, JSON.stringify(config));
  const ran = spawnSync(OXLINT, ['-c', configPath, '-f', 'json', ...files], { cwd, encoding: 'utf8', timeout: 120_000 });
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
    const was = file[rule] ?? { worst: 0, count: 0 };
    file[rule] = { worst: Math.max(was.worst, Number(found[1])), count: was.count + 1 };
  }
  return out;
}

/** The files the ratchet measures, each at the four thresholds alone: no ceiling, no other rule, no type-aware pass. */
function measureTree(config: Config, files: string[]): Measures {
  const sonarjs = resolvedPlugins(config).filter((entry) => entry.name === 'sonarjs');
  const limits = { jsPlugins: sonarjs, plugins: [], rules: THRESHOLDS };
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

/**
 * What the limits' config and `record` say that the measures do not hold, each a sentence naming the fix: a threshold moved, a limit off
 * outside `EXEMPT`, a ceiling block for more than one file or set otherwise than its rule, a ceiling above the measure, a ceiling
 * `record` does not know, an entry with no ceiling, a file gone or with no offender left, and a count of offenders other than the
 * measured one.
 */
function refusals(
  config: Config,
  measures: Measures,
  record: Record<string, Partial<Record<Rule, number>>>,
  exists: (file: string) => boolean,
): string[] {
  const out: string[] = [];
  for (const rule of RULES)
    if (!isDeepStrictEqual(config.rules[rule], THRESHOLDS[rule]))
      out.push(
        `the top level of .oxlintrc.json sets ${rule} to ${JSON.stringify(config.rules[rule])}: set it to ${JSON.stringify(THRESHOLDS[rule])}`,
      );
  const ceilings = new Set<string>();
  for (const block of config.overrides) {
    const limits = Object.entries(block.rules).filter(([rule]) => isLimit(rule));
    if (limits.length === 0) continue;
    const off = limits.filter(([, setting]) => setting === 'off');
    if (off.length > 0) {
      if (block.files.some((glob) => !EXEMPT.includes(glob)) || off.length !== RULES.length)
        out.push(
          `a block turns ${off.map(([rule]) => rule).join(', ')} off for ${block.files.join(', ')}: the limits are off only in ${EXEMPT.join(', ')}, each rule of them; give a file over a limit a ceiling instead`,
        );
      continue;
    }
    if (block.files.length !== 1 || block.excludeFiles !== undefined || limits.length !== Object.keys(block.rules).length) {
      out.push(`a ceiling block names ${block.files.join(', ')}: give each file a block of its own, which sets the limits alone`);
      for (const file of block.files) ceilings.add(file);
      continue;
    }
    const [file] = block.files;
    ceilings.add(file);
    if (!(file in record)) out.push(`${file} has a ceiling RECORD does not know: a file over a limit is cut, never added to the baseline`);
    if (Object.keys(measures[file] ?? {}).length === 0) continue;
    for (const [rule, setting] of limits as [Rule, unknown][]) {
      const max = ceilingOf(setting, THRESHOLDS[rule]);
      const worst = measures[file]?.[rule]?.worst;
      if (max === undefined)
        out.push(`${file}'s ${rule} ceiling is set otherwise than its threshold: copy the top-level setting and change only its max`);
      else if (worst === undefined) out.push(`${file} no longer breaks ${rule}: take the rule off its block in .oxlintrc.json`);
      else if (max > worst)
        out.push(`${file}'s ${rule} ceiling is ${max}, above its measure ${worst}: lower it to ${worst} in .oxlintrc.json`);
    }
  }
  for (const [file, counts] of Object.entries(record)) {
    if (!exists(file)) {
      out.push(
        `${file} is in RECORD but not on disk: where it moved, rename its entry and its block in .oxlintrc.json; else take both off`,
      );
      continue;
    }
    if (!ceilings.has(file)) out.push(`${file} is in RECORD with no ceiling block in .oxlintrc.json: take its entry off RECORD`);
    if (Object.keys(measures[file] ?? {}).length === 0) {
      out.push(`${file} has no offender left: take its entry off RECORD and its block off .oxlintrc.json`);
      continue;
    }
    for (const rule of RULES) {
      const allowed = counts[rule] ?? 0;
      const count = measures[file]?.[rule]?.count ?? 0;
      if (count > allowed) out.push(`${file} has ${count} offenders of ${rule}, more than the ${allowed} RECORD allows: cut the function`);
      else if (count < allowed)
        out.push(`${file} has ${count} offenders of ${rule}, fewer than RECORD's ${allowed}: lower its count to ${count}`);
    }
  }
  return out;
}

test('the files over a limit are held to their ceilings and their counts, and no ceiling or count is looser than the measure', () => {
  const config = readConfig();
  const files = [...new Set([...Object.keys(RECORD), ...config.overrides.flatMap((block) => block.files)])].filter(
    (file) => !file.includes('*') && fs.existsSync(path.join(ROOT, file)),
  );
  const measures = measureTree(config, files);
  assert.ok(Object.keys(measures).length > 50, `measured ${Object.keys(measures).length} files over a limit, far fewer than RECORD`);
  assert.deepEqual(
    refusals(config, measures, RECORD, (file) => fs.existsSync(path.join(ROOT, file))),
    [],
  );
});

/** A config with the limits at their thresholds, the exemptions, and one ceiling block: `a.ts`, at 30 cyclomatic and 700 code lines. */
const clean = (): { config: Config; measures: Measures; record: Record<string, Partial<Record<Rule, number>>> } => ({
  config: {
    jsPlugins: [],
    rules: { ...THRESHOLDS },
    overrides: [
      { files: ['**/test/**', '**/*.test.ts'], rules: Object.fromEntries(RULES.map((rule) => [rule, 'off'])) },
      {
        files: ['a.ts'],
        rules: { 'max-lines': withMax(THRESHOLDS['max-lines'], 700), complexity: withMax(THRESHOLDS.complexity, 30) },
      },
    ],
  },
  measures: { 'a.ts': { 'max-lines': { worst: 700, count: 1 }, complexity: { worst: 30, count: 2 } } },
  record: { 'a.ts': { 'max-lines': 1, complexity: 2 } },
});

const exists = (file: string): boolean => file !== 'gone.ts';

/** The refusals of the clean fixture after `change`, which must be exactly one, and match `expected`. */
function refusedOnce(change: (fixture: ReturnType<typeof clean>) => void, expected: RegExp): void {
  const fixture = clean();
  change(fixture);
  const refused = refusals(fixture.config, fixture.measures, fixture.record, exists);
  assert.equal(refused.length, 1, refused.join('\n'));
  assert.match(refused[0], expected);
}

const ceilingBlock = (fixture: ReturnType<typeof clean>): Block => fixture.config.overrides[1];

test('the clean fixture is refused nothing', () => {
  const fixture = clean();
  assert.deepEqual(refusals(fixture.config, fixture.measures, fixture.record, exists), []);
});

test('REFUSED: a ceiling above the measure', () => {
  refusedOnce(
    (f) => (f.measures['a.ts'].complexity = { worst: 29, count: 2 }),
    /^a\.ts's complexity ceiling is 30, above its measure 29: lower it to 29/,
  );
});

test('REFUSED: a ceiling on a rule the file does not break', () => {
  refusedOnce(
    (f) => (ceilingBlock(f).rules['sonarjs/cognitive-complexity'] = withMax(THRESHOLDS['sonarjs/cognitive-complexity'], 20)),
    /^a\.ts no longer breaks sonarjs\/cognitive-complexity: take the rule off its block/,
  );
});

test('REFUSED: more offenders in a file than its record allows', () => {
  refusedOnce(
    (f) => (f.measures['a.ts'].complexity = { worst: 30, count: 3 }),
    /^a\.ts has 3 offenders of complexity, more than the 2 RECORD allows/,
  );
});

test('REFUSED: fewer offenders in a file than its record allows, so a new one cannot take the freed place', () => {
  refusedOnce(
    (f) => (f.measures['a.ts'].complexity = { worst: 30, count: 1 }),
    /^a\.ts has 1 offenders of complexity, fewer than RECORD's 2: lower its count to 1/,
  );
});

test('REFUSED: a ceiling for a file the record does not know', () => {
  refusedOnce((f) => {
    f.config.overrides.push({ files: ['b.ts'], rules: { complexity: withMax(THRESHOLDS.complexity, 25) } });
    f.measures['b.ts'] = { complexity: { worst: 25, count: 1 } };
  }, /^b\.ts has a ceiling RECORD does not know/);
});

test('REFUSED: a record entry with no ceiling', () => {
  refusedOnce((f) => {
    f.record['b.ts'] = { complexity: 1 };
    f.measures['b.ts'] = { complexity: { worst: 25, count: 1 } };
  }, /^b\.ts is in RECORD with no ceiling block/);
});

test('REFUSED: an entry for a file with no offender left', () => {
  refusedOnce((f) => {
    f.measures = {};
  }, /^a\.ts has no offender left: take its entry off RECORD/);
});

test('REFUSED: an entry for a file that is gone', () => {
  refusedOnce((f) => (f.record['gone.ts'] = { complexity: 1 }), /^gone\.ts is in RECORD but not on disk: where it moved, rename its entry/);
});

test('REFUSED: a ceiling block for two files, or set otherwise than its threshold', () => {
  refusedOnce((f) => (ceilingBlock(f).files = ['a.ts', 'c.ts']), /^a ceiling block names a\.ts, c\.ts: give each file a block of its own/);
  refusedOnce(
    (f) => (ceilingBlock(f).rules['max-lines'] = ['error', { max: 700, skipBlankLines: false, skipComments: true }]),
    /^a\.ts's max-lines ceiling is set otherwise than its threshold/,
  );
});

test('REFUSED: a threshold moved, or a limit turned off outside the exempt files', () => {
  refusedOnce(
    (f) => (f.config.rules.complexity = withMax(THRESHOLDS.complexity, 25)),
    /^the top level of \.oxlintrc\.json sets complexity to/,
  );
  refusedOnce(
    (f) => f.config.overrides.push({ files: ['src/**'], rules: { 'max-lines': 'off' } }),
    /^a block turns max-lines off for src\/\*\*: the limits are off only in/,
  );
});

/** A plant over each threshold, with the measure its rule must report. */
const PLANTS: Record<Rule, { file: string; text: string; measure: number }> = {
  'max-lines': { file: 'long.ts', text: Array.from({ length: 501 }, (_, i) => `export const a${i} = ${i};`).join('\n'), measure: 501 },
  'max-lines-per-function': {
    file: 'function.ts',
    text: [
      'export function sum(k: number): number {',
      '  let n = 0;',
      ...Array.from({ length: 77 }, () => '  n += k;'),
      '  return n;',
      '}',
    ].join('\n'),
    measure: 81,
  },
  complexity: {
    file: 'cyclomatic.ts',
    text: [
      'export function pick(n: number): string {',
      '  switch (n) {',
      ...Array.from({ length: 20 }, (_, i) => `    case ${i}: return '${i}';`),
      "    default: return '';",
      '  }',
      '}',
    ].join('\n'),
    measure: 21,
  },
  'sonarjs/cognitive-complexity': {
    file: 'cognitive.ts',
    text: [
      'export function count(n: number): number {',
      ...Array.from({ length: 16 }, (_, i) => `  if (n === ${i}) n += 1;`),
      '  return n;',
      '}',
    ].join('\n'),
    measure: 16,
  },
};

test('each limit the config names runs at its threshold, is off only in the exempt files, and holds a ceiling at the measure', () => {
  const config = readConfig();
  const dir = scratch('limits-');
  const exempt = ['test/all.ts', 'all.test.ts', 'apps/web/src/components/ui/all.tsx', 'apps/web/src/routeTree.gen.ts'];
  const all = RULES.map((rule) => PLANTS[rule].text.replaceAll('export ', '')).join('\n');
  for (const file of exempt) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), all);
  }
  const ceilings: Block[] = [];
  for (const rule of RULES) {
    const { file, text, measure: at } = PLANTS[rule];
    for (const side of ['on', 'under', 'at']) {
      fs.mkdirSync(path.join(dir, side), { recursive: true });
      fs.writeFileSync(path.join(dir, side, file), text);
    }
    ceilings.push({ files: [`under/${file}`], rules: { [rule]: withMax(config.rules[rule], at - 1) } });
    ceilings.push({ files: [`at/${file}`], rules: { [rule]: withMax(config.rules[rule], at) } });
  }
  const exemptions = config.overrides.filter((block) =>
    Object.entries(block.rules).some(([rule, setting]) => isLimit(rule) && setting === 'off'),
  );
  const { options: _options, $schema: _schema, ...rest } = config;
  const used = { ...rest, jsPlugins: resolvedPlugins(config), overrides: [...exemptions, ...ceilings] };
  const measures = measure(dir, path.join(dir, '.oxlintrc.json'), used, ['on', 'under', 'at', ...exempt]);

  const expected = (side: string): Measures =>
    Object.fromEntries(RULES.map((rule) => [`${side}/${PLANTS[rule].file}`, { [rule]: { worst: PLANTS[rule].measure, count: 1 } }]));
  assert.deepEqual(
    Object.fromEntries(Object.entries(measures).filter(([file]) => file.startsWith('on/'))),
    expected('on'),
    'a limit refused no plant, or not with its measure: the rule is off, misnamed, or its message is read wrong',
  );
  assert.deepEqual(
    Object.fromEntries(Object.entries(measures).filter(([file]) => file.startsWith('under/'))),
    expected('under'),
    'a ceiling one below the measure refused nothing: oxlint did not read the block',
  );
  assert.deepEqual(
    Object.keys(measures).filter((file) => !file.startsWith('on/') && !file.startsWith('under/')),
    [],
    'a limit refused a plant at its ceiling, or in a file it is off in',
  );
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
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', 'packages', 'apps', 'lint'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(
      (file) =>
        /\.(?:[cm]?js|tsx?)$/.test(file) && !EXEMPT.some((glob) => path.matchesGlob(file, glob)) && fs.existsSync(path.join(ROOT, file)),
    );
  assert.ok(files.length > 100, `read ${files.length} source files, far fewer than the workspace has`);
  assert.deepEqual(
    files.flatMap((file) => limitDirectives(fs.readFileSync(path.join(ROOT, file), 'utf8')).map((found) => `${file}: ${found}`)),
    [],
    'a limit is met by cutting the function, never by a directive: name the rule the line breaks, which is not a limit',
  );
});
