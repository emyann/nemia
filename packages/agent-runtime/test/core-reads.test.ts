/**
 * The runtime's core never opens a task's harness arguments, and reaches no harness but through the seam.
 *
 * What the core imports from `src/harness/` is read as a graph (`test-kit/imports`): the seam (`seam.ts`), its error (`error.ts`), a
 * type, which loads nothing, and the generic config helpers of `args.ts` named in `ARGS_HELPERS`; any other value is a harness's
 * vocabulary read in the core, as the core once read Claude Code's bridge flag through `args.ts`, which no text check of the core's
 * own lines could see.
 *
 * `domain.ts` decides, `lifecycle.ts` holds the edges it decides by, and `engine.ts` applies; how a session is started — its model, its
 * tools, its window — is the adapter's, carried on the task as one `config` (`src/harness/args.ts`) and handed to the runner at spawn and
 * release. A read of one in the core is the second workload leaking in: the day `decide` branches on a model, the engine knows
 * about a harness. So this reads the three files' code, comments left out, and refuses a harness argument named there,
 * and `config` opened — by a member, an index, a destructuring, a spread, `in` or an `Object.*` walk. Passing it on whole
 * is the one use it has.
 *
 * The runtime measures a spend and reports it, and the orchestrator decides over budget: a `budget` in the core's code — a field,
 * an end reason, a comparison of a `limit` — is that judgement coming back, and none of the harness-argument checks sees one that
 * names no harness argument (`limit === 'budget'`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { importsIn, resolved, withoutComments } from 'test-kit/imports';
import { HARNESS_ARGS } from '../src/harness/args.ts';

const CORE = [
  'src/core/session.ts',
  'src/core/domain.ts',
  'src/core/engine/engine.ts',
  'src/core/engine/filing.ts',
  'src/core/lifecycle.ts',
];

/**
 * The code alone: block comments and line comments out, so a sentence about a model is not a read of one, and each module an import
 * names left blank, so `from '../model.ts'` is not a read of `model`.
 */
const codeOf = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/(\bfrom\s*)(['"])[^'"]*\2/g, '$1$2$2');

const NAMED = new RegExp(`\\b(${HARNESS_ARGS.join('|')})\\b`);
/**
 * The ways a line opens `config`, in order:
 *
 * 1. a member or an index: `state.config.model`, `config?.[k]`, `config!.x`;
 * 2. a destructuring: `const { model } = state.config`;
 * 3. a spread into something that is then read;
 * 4. `key in state.config`;
 * 5. an `Object.*` walk: `Object.keys(state.config)`.
 */
const OPENED = [
  /\bconfig\s*(\?\.|\.|\[|!)/,
  /\{[^{}]*\}\s*=\s*[^;\n]*\bconfig\b/,
  /\.\.\.\s*[\w.?]*\bconfig\b/,
  /\bin\s+[\w.?]*\bconfig\b/,
  /\bObject\.\w+\(\s*[\w.?]*\bconfig\b/,
];

/** Each line of `code` that reads a harness argument, as `n: line`. */
const reads = (code: string): string[] =>
  code.split('\n').flatMap((line, i) => (NAMED.test(line) || OPENED.some((re) => re.test(line)) ? [`${i + 1}: ${line.trim()}`] : []));

test("domain.ts, lifecycle.ts and engine.ts name no harness argument, and hand a task's config on without opening it", () => {
  for (const file of CORE) assert.deepEqual(reads(codeOf(fs.readFileSync(file, 'utf8'))), [], `${file} reads a harness argument`);
});

test('the check refuses every way of opening config, and is not refused by carrying it (the test above would pass with a check that saw none of these reads)', () => {
  const REFUSED = [
    'if (state.config?.model === "opus") return [];',
    'const mode = state.config.permissionMode;',
    "const effort = spec.config?.['effort'];",
    'const { tools } = state.config ?? {};',
    'const all = { ...state.config };',
    "if ('mcp' in state.config) return;",
    'for (const k of Object.keys(state.config ?? {})) void k;',
    'const w = state.worktree;',
    'contextTokens: spec.contextTokens,',
  ];
  for (const line of REFUSED) assert.equal(reads(line).length, 1, `not refused: ${line}`);
  const CARRIED = [
    'config?: HarnessArgs;',
    's.config = e.config; s.closeoutSchema = e.closeoutSchema;',
    'harness: spec.harness, config: spec.config,',
    'config: state.config, closeoutSchema: state.closeoutSchema,',
    'const released = yield* runner.release(session, state.config ?? {}).pipe(',
    'config: configForTurn(state.config, turnOf(state, attempt?.turn ?? 0).config),',
    '// a comment about the model is not a read of one',
    "import { TaskId } from '../model.ts';",
  ];
  for (const line of CARRIED) assert.deepEqual(reads(codeOf(line)), [], `refused, and it only carries: ${line}`);
});

test('engine.ts hands the whole config to every spawn, so a runner is given what the task was filed with, and a spawn that dropped it would run every harness bare', () => {
  const code = codeOf(fs.readFileSync('src/core/engine/engine.ts', 'utf8'));
  assert.match(code, /runner\s*\.spawn\(spawnRequestOf\(/, 'every spawn is asked with the request `spawnRequestOf` makes');
  assert.match(
    code,
    /const spawnRequestOf = [^{]*\{[^}]*\breturn \{[^}]*\bconfig: configForTurn\(state\.config, /s,
    "a turn's own config (an answer's) is laid over the task's by `configForTurn`, in `harness/args.ts`, never in engine.ts",
  );
  assert.match(code, /runner\s*\.release\(\s*session,\s*state\.config\b/);
});

test('domain.ts, lifecycle.ts and engine.ts know no budget: the cap is a harness argument, and a spend is a fact they carry', () => {
  const BUDGET = /budget/i;
  for (const file of CORE) {
    const lines = codeOf(fs.readFileSync(file, 'utf8'))
      .split('\n')
      .flatMap((line, i) => (BUDGET.test(line) ? [`${i + 1}: ${line.trim()}`] : []));
    assert.deepEqual(lines, [], `${file} judges a budget`);
  }
  for (const line of ["if (sighting.limit === 'budget') return settle('failed');", 'budgetSpent?: boolean;', "reason: 'budget',"]) {
    assert.ok(BUDGET.test(codeOf(line)), `not refused: ${line}`);
  }
});

/** The harness files the core may take values from whole: the seam, and its error. */
const SEAM = ['src/harness/seam.ts', 'src/harness/error.ts'];

/** The values of `args.ts` the core may take: the generic helpers of a task's config, which name no harness. */
const ARGS_HELPERS = ['argsRefusalOf', 'configForTurn', 'turnArgsRefusalOf', 'FORMER_ARGS', 'HARNESS_ARGS', 'RENAMED_ARGS', 'TAKEN_ARGS'];

/** The values an import statement of `text` from `spec` names, its `type` members left out. */
const valuesFrom = (text: string, spec: string): string[] =>
  [...withoutComments(text).matchAll(/^\s*import\s+(?!type\s)\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/gm)]
    .filter((m) => m[2] === spec)
    .flatMap((m) =>
      (m[1] ?? '')
        .split(',')
        .map((n) => n.trim())
        .filter((n) => n !== '' && !n.startsWith('type ')),
    );

/** Each value the core file `file`, holding `text`, takes from a harness file it may not, as `file: spec (names)`. */
const harnessReads = (file: string, text: string): string[] =>
  importsIn(text).flatMap(({ spec, typeOnly }) => {
    const target = resolved(file, spec);
    if (typeOnly || target === undefined || !target.startsWith('src/harness/') || SEAM.includes(target)) return [];
    const values = valuesFrom(text, spec);
    if (target === 'src/harness/args.ts' && values.length > 0 && values.every((v) => ARGS_HELPERS.includes(v))) return [];
    return [`${file}: ${spec} (${values.join(', ') || 'a value'})`];
  });

/** Every source file of the core, from the package's folder: `src/core/**`, its tests left out. */
const coreFiles = (dir = 'src/core'): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const file = path.posix.join(dir, e.name);
    return e.isDirectory() ? coreFiles(file) : file.endsWith('.ts') && !file.endsWith('.test.ts') ? [file] : [];
  });

test('the core imports from harness/ only the seam, its error, types, and the generic config helpers of args.ts', async (t) => {
  await t.test('src/core/** as it is', () => {
    const files = coreFiles();
    assert.ok(files.includes('src/core/engine/engine.ts') && files.includes('src/core/domain.ts'), 'the core is read');
    assert.deepEqual(
      files.flatMap((f) => harnessReads(f, fs.readFileSync(f, 'utf8'))),
      [],
    );
  });
  await t.test('a planted read is refused: a harness vocabulary, a value of args.ts off the list, a whole module', () => {
    const at = 'src/core/engine/engine.ts';
    for (const line of [
      "import { bridgeAsked } from '../../harness/claude/vocabulary.ts';",
      "import { configForTurn, bridgeOfTask } from '../../harness/args.ts';",
      "import * as args from '../../harness/args.ts';",
      "import { claudeCodeOps } from '../../harness/claude/code.ts';",
    ])
      assert.equal(harnessReads(at, line).length, 1, `not refused: ${line}`);
    for (const line of [
      "import { Runner, type SpawnRequest } from '../../harness/seam.ts';",
      "import type { ClaudeFlags } from '../../harness/claude/vocabulary.ts';",
      "import { type HarnessArgs, configForTurn } from '../../harness/args.ts';",
      "import { RunnerError } from '../../harness/error.ts';",
    ])
      assert.deepEqual(harnessReads(at, line), [], `refused, and it is allowed: ${line}`);
  });
});
