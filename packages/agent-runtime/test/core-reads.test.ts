/**
 * The runtime's core never opens a task's harness arguments.
 *
 * `domain.ts` decides and `engine.ts` applies; how a session is started — its model, its tools, its window — is the
 * adapter's, carried on the task as one `config` (`src/harness-args.ts`) and handed to the runner at spawn and release.
 * A read of one in the core is the second workload leaking in: the day `decide` branches on a model, the engine knows
 * about a harness. So this reads the two files' code, comments left out, and refuses a harness argument named there,
 * and `config` opened — by a member, an index, a destructuring, a spread, `in` or an `Object.*` walk. Passing it on whole
 * is the one use it has.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HARNESS_ARGS } from '../src/harness-args.ts';

const CORE = ['src/domain.ts', 'src/engine.ts'];

/** The code alone: block comments and line comments out, so a sentence about a model is not a read of one. */
const codeOf = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const NAMED = new RegExp(`\\b(${HARNESS_ARGS.join('|')})\\b`);
const OPENED = [
  /\bconfig\s*(\?\.|\.|\[|!)/, // a member or an index: `state.config.model`, `config?.[k]`, `config!.x`
  /\{[^{}]*\}\s*=\s*[^;\n]*\bconfig\b/, // destructured: `const { model } = state.config`
  /\.\.\.\s*[\w.?]*\bconfig\b/, // spread into something that is then read
  /\bin\s+[\w.?]*\bconfig\b/, // `key in state.config`
  /\bObject\.\w+\(\s*[\w.?]*\bconfig\b/, // `Object.keys(state.config)`
];

/** Each line of `code` that reads a harness argument, as `n: line`. */
const reads = (code: string): string[] =>
  code.split('\n').flatMap((line, i) => (NAMED.test(line) || OPENED.some((re) => re.test(line)) ? [`${i + 1}: ${line.trim()}`] : []));

test("domain.ts and engine.ts name no harness argument, and hand a task's config on without opening it", () => {
  for (const file of CORE) assert.deepEqual(reads(codeOf(fs.readFileSync(file, 'utf8'))), [], `${file} reads a harness argument`);
});

test('the check refuses every way of opening config, and is not refused by carrying it', () => {
  // Each of these is a read the core must never make; the test above would pass with a check that saw none of them.
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
  // What the core does with it: carry it into the record, the state and the spawn, and hand it to a release.
  const CARRIED = [
    'config?: HarnessArgs;',
    's.config = e.config; s.closeoutSchema = e.closeoutSchema;',
    'harness: spec.harness, config: spec.config,',
    'config: state.config, closeoutSchema: state.closeoutSchema,',
    'const released = yield* runner.release(session, state.config ?? {}).pipe(',
    'config: configForTurn(state.config, turnOf(state, attempt?.turn ?? 0).config),',
    '// a comment about the model is not a read of one',
  ];
  for (const line of CARRIED) assert.deepEqual(reads(codeOf(line)), [], `refused, and it only carries: ${line}`);
});

test('engine.ts hands the whole config to every spawn, so a runner is given what the task was filed with', () => {
  // The other half of passing it on: were the spawn to drop it, no read would show, and every harness would run bare. A
  // turn's own (an answer's `config`) is laid over it by `configForTurn`, in `harness-args.ts`, never here.
  const code = codeOf(fs.readFileSync('src/engine.ts', 'utf8'));
  assert.match(code, /runner\.spawn\(\{[^}]*\bconfig: configForTurn\(state\.config, /s);
  assert.match(code, /runner\.release\(session, state\.config\b/);
});

test('domain.ts and engine.ts know no budget: the cap is a harness argument, and a spend is a fact they carry', () => {
  // Stage 4b: the runtime measures and reports, and the orchestrator decides over budget. A `budget` in the core's code —
  // a field, an end reason, a comparison of a `limit` — is the judgement coming back, and none of the checks above sees
  // one that names no harness argument (`limit === 'budget'`).
  const BUDGET = /budget/i;
  for (const file of CORE) {
    const lines = codeOf(fs.readFileSync(file, 'utf8')).split('\n').flatMap((line, i) => (BUDGET.test(line) ? [`${i + 1}: ${line.trim()}`] : []));
    assert.deepEqual(lines, [], `${file} judges a budget`);
  }
  for (const line of ["if (sighting.limit === 'budget') return settle('failed');", 'budgetSpent?: boolean;', "reason: 'budget',"]) {
    assert.ok(BUDGET.test(codeOf(line)), `not refused: ${line}`);
  }
});
