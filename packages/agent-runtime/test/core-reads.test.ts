/**
 * The runtime's core never opens a task's harness arguments.
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
