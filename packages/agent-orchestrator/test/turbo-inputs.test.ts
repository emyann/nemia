/**
 * The tests that scan files outside their package are re-run when those files change. Turbo caches a package's test by the package's own
 * files, so a test that reads the apps or another package replays a pass from its cache after a change there, unless `turbo.json` names
 * what it reads as its inputs. The contract tests read every source outside their package (`test/contract.test.ts` in each package), the
 * lint tests here read `.oxlintrc.json` and `lint/`, and this package's suite reads the apps' tests (`suite.test.ts`, `comments.test.ts`).
 * The declared-imports scan here reads every workspace package's `package.json` and source, the apps' configs and the runtime's files
 * among them.
 * `INPUTS` names, for each such task, the globs it must list beside its own files; `missingInputs` refuses a task or a glob left out.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');

const APPS = ['$TURBO_ROOT$/apps/*/src/**', '$TURBO_ROOT$/apps/*/test/**'];

/** Each task that reads files outside its package, and the inputs it lists: its own files, and what it reads outside them. */
const INPUTS: Record<string, readonly string[]> = {
  'agent-orchestrator#test': [
    '$TURBO_DEFAULT$',
    '$TURBO_ROOT$/.oxlintrc.json',
    '$TURBO_ROOT$/lint/**',
    ...APPS,
    '$TURBO_ROOT$/apps/*/*.ts',
    '$TURBO_ROOT$/apps/*/package.json',
    '$TURBO_ROOT$/packages/agent-runtime/**',
    '!$TURBO_ROOT$/packages/agent-runtime/.turbo/**',
  ],
  'agent-runtime#test': [
    '$TURBO_DEFAULT$',
    '$TURBO_ROOT$/lint/**',
    ...APPS,
    ...['src', 'bin', 'test', 'place'].map((dir) => `$TURBO_ROOT$/packages/agent-orchestrator/${dir}/**`),
  ],
};

type Turbo = { tasks: Record<string, { inputs?: string[] }> };

const readTurbo = (): Turbo => JSON.parse(fs.readFileSync(path.join(ROOT, 'turbo.json'), 'utf8')) as Turbo;

/** Each task of `INPUTS` that `turbo` lacks, and each glob a task lists none of, as a sentence naming the fix. */
function missingInputs(turbo: Turbo): string[] {
  return Object.entries(INPUTS).flatMap(([task, globs]) => {
    const inputs = turbo.tasks[task]?.inputs;
    if (!inputs) return [`turbo.json has no inputs for ${task}: give it ${globs.join(', ')}, or turbo replays it from its cache`];
    return globs
      .filter((glob) => !inputs.includes(glob))
      .map((glob) => `${task} does not list ${glob} among its inputs in turbo.json: add it, or turbo replays it from its cache`);
  });
}

test('each test that reads files outside its package lists them among its inputs in turbo.json', () => {
  assert.deepEqual(missingInputs(readTurbo()), []);
});

test("REFUSED: a task that drops the apps' tests, its own files, or its whole inputs", () => {
  const dropping = (task: string, glob: string): Turbo => {
    const turbo = readTurbo();
    const inputs = turbo.tasks[task]?.inputs ?? [];
    assert.ok(inputs.includes(glob), `${task} lists ${glob} today`);
    turbo.tasks[task] = { ...turbo.tasks[task], inputs: inputs.filter((g) => g !== glob) };
    return turbo;
  };
  assert.deepEqual(missingInputs(dropping('agent-orchestrator#test', '$TURBO_ROOT$/apps/*/test/**')), [
    'agent-orchestrator#test does not list $TURBO_ROOT$/apps/*/test/** among its inputs in turbo.json: add it, or turbo replays it from its cache',
  ]);
  assert.deepEqual(missingInputs(dropping('agent-orchestrator#test', '$TURBO_ROOT$/packages/agent-runtime/**')), [
    'agent-orchestrator#test does not list $TURBO_ROOT$/packages/agent-runtime/** among its inputs in turbo.json: add it, or turbo replays it from its cache',
  ]);
  assert.deepEqual(missingInputs(dropping('agent-runtime#test', '$TURBO_DEFAULT$')), [
    'agent-runtime#test does not list $TURBO_DEFAULT$ among its inputs in turbo.json: add it, or turbo replays it from its cache',
  ]);
  assert.deepEqual(missingInputs(dropping('agent-runtime#test', '$TURBO_ROOT$/packages/agent-orchestrator/place/**')), [
    'agent-runtime#test does not list $TURBO_ROOT$/packages/agent-orchestrator/place/** among its inputs in turbo.json: add it, or turbo replays it from its cache',
  ]);
  const turbo = readTurbo();
  delete turbo.tasks['agent-runtime#test'];
  const [refused, ...rest] = missingInputs(turbo);
  assert.deepEqual(rest, []);
  assert.match(refused, /^turbo\.json has no inputs for agent-runtime#test: give it \$TURBO_DEFAULT\$, /);
});
