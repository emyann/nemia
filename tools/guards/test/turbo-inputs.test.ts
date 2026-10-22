/**
 * The tests that scan files outside their package are re-run when those files change. Turbo caches a package's test by the package's own
 * files, so a test that reads the apps or another package replays a pass from its cache after a change there, unless `turbo.json` names
 * what it reads as its inputs. The contract tests read every source outside their package (`test/contract.test.ts` in each package), the
 * lint tests here read `.oxlintrc.json` and `lint/`, and this package's suite reads the apps' tests (`suite.test.ts`, `comments.test.ts`).
 * The declared-imports scan here reads every workspace package's `package.json` and source, the apps' configs and the runtime's files
 * among them, and the runtime's contract test reads the `.ts` files at each app's root too. The vocabulary test here reads this
 * repository's team from `workflows/agents/` (`words.test.ts`), and the citation test here reads every `CLAUDE.md` of the repository,
 * the root's and the apps' among them (`claude-md-cites.test.ts`). Every package's test script loads the test-cost probe and reporter from
 * `tools/test-costs/`, so each package's test lists `tools/` too. The docs' tests read the packages' docs for the diagrams they draw,
 * every source for the names their pages cite, and the paths those pages cite, at the root and under `docs/` and `workflows/`.
 * The api's test of what `npm run dev` watches reads every workspace package's `package.json` and sources (`dev-watch.test.ts`).
 * The board's test of the look's parts reads the trigger skill of a change to the board, which names each part
 * (`apps/web/test/look.test.ts`), and its test of a merge reads the root's `CLAUDE.md` and `.gitattributes`
 * (`apps/web/test/e2e-merge.test.ts`), so the web's test lists all three.
 * The repository's own guards read the files they hold (`guards#test`): the CI guard reads the Actions workflow, the secret scan's
 * allowlist, the stub secrets of the runtime's `remote-agent.test.ts`, the e2e's page names, the board's generated paths and every
 * workspace's manifest (`tools/guards/test/ci-workflow.test.ts`, `tools/guards/test/ci-scan.boundary.test.ts`), and
 * `tools/guards/test/repo-guards.test.ts` reads `CODEOWNERS`, under `.github/`, and the packages' manifests. The same list is what
 * `tools/guards/due.ts` reads to say whether CI owes the guards their suite.
 * `INPUTS` names, for each such task, the globs it must list beside its own files; `missingInputs` refuses a task or a glob left out.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');

const APPS = ['$TURBO_ROOT$/apps/*/src/**', '$TURBO_ROOT$/apps/*/test/**'];

/** The trigger skill of a change to the board, which `apps/web/test/look.test.ts` reads for the look's parts. */
const BOARD_SKILL = '$TURBO_ROOT$/.claude/skills/change-the-board/SKILL.md';

/** Each task that reads files outside its package, and the inputs it lists: its own files, and what it reads outside them. */
const INPUTS: Record<string, readonly string[]> = {
  'agent-orchestrator#test': [
    '$TURBO_DEFAULT$',
    '$TURBO_ROOT$/.oxlintrc.json',
    '$TURBO_ROOT$/lint/**',
    '$TURBO_ROOT$/tools/**',
    ...APPS,
    '$TURBO_ROOT$/apps/*/*.ts',
    '$TURBO_ROOT$/apps/*/package.json',
    '$TURBO_ROOT$/apps/*/CLAUDE.md',
    '$TURBO_ROOT$/CLAUDE.md',
    '$TURBO_ROOT$/workflows/agents/**',
    '$TURBO_ROOT$/packages/agent-runtime/**',
    '!$TURBO_ROOT$/packages/agent-runtime/.turbo/**',
  ],
  'guards#test': [
    '$TURBO_DEFAULT$',
    '$TURBO_ROOT$/.github/**',
    '$TURBO_ROOT$/.gitleaks.toml',
    '$TURBO_ROOT$/workflows/**',
    '$TURBO_ROOT$/docs/**',
    '$TURBO_ROOT$/tools/**',
    '$TURBO_ROOT$/package.json',
    '$TURBO_ROOT$/package-lock.json',
    '$TURBO_ROOT$/turbo.json',
    '$TURBO_ROOT$/packages/*/package.json',
    '$TURBO_ROOT$/apps/*/package.json',
    '$TURBO_ROOT$/packages/agent-runtime/test/remote-agent.test.ts',
    '$TURBO_ROOT$/apps/web/test/e2e/pages/NAMES',
    '$TURBO_ROOT$/apps/web/src/routeTree.gen.ts',
    '$TURBO_ROOT$/apps/web/theme/**',
  ],
  'agent-runtime#test': [
    '$TURBO_DEFAULT$',
    '$TURBO_ROOT$/lint/**',
    '$TURBO_ROOT$/tools/**',
    ...APPS,
    '$TURBO_ROOT$/apps/*/*.ts',
    ...['src', 'bin', 'test', 'place'].map((dir) => `$TURBO_ROOT$/packages/agent-orchestrator/${dir}/**`),
  ],
  'api#test': [
    '$TURBO_DEFAULT$',
    '$TURBO_ROOT$/tools/**',
    ...['src', 'place'].map((dir) => `$TURBO_ROOT$/packages/*/${dir}/**`),
    '$TURBO_ROOT$/packages/*/package.json',
  ],
  'web#test': ['$TURBO_DEFAULT$', '$TURBO_ROOT$/tools/**', BOARD_SKILL, '$TURBO_ROOT$/CLAUDE.md', '$TURBO_ROOT$/.gitattributes'],
  'docs#test': [
    '$TURBO_DEFAULT$',
    '$TURBO_ROOT$/tools/**',
    '$TURBO_ROOT$/lint/**',
    ...APPS,
    '$TURBO_ROOT$/packages/**',
    '!$TURBO_ROOT$/packages/*/.turbo/**',
    '$TURBO_ROOT$/docs/**',
    '$TURBO_ROOT$/workflows/**',
    '$TURBO_ROOT$/README.md',
    '$TURBO_ROOT$/CLAUDE.md',
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

test("REFUSED: a task that drops the apps' tests or root files, the team, the test-cost tooling, its own files, or its whole inputs", () => {
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
  assert.deepEqual(missingInputs(dropping('guards#test', '$TURBO_ROOT$/.github/**')), [
    'guards#test does not list $TURBO_ROOT$/.github/** among its inputs in turbo.json: add it, or turbo replays it from its cache',
  ]);
  assert.deepEqual(missingInputs(dropping('guards#test', '$TURBO_ROOT$/.gitleaks.toml')), [
    'guards#test does not list $TURBO_ROOT$/.gitleaks.toml among its inputs in turbo.json: add it, or turbo replays it from its cache',
  ]);
  assert.deepEqual(missingInputs(dropping('agent-orchestrator#test', '$TURBO_ROOT$/workflows/agents/**')), [
    'agent-orchestrator#test does not list $TURBO_ROOT$/workflows/agents/** among its inputs in turbo.json: add it, or turbo replays it from its cache',
  ]);
  assert.deepEqual(missingInputs(dropping('agent-runtime#test', '$TURBO_ROOT$/apps/*/*.ts')), [
    'agent-runtime#test does not list $TURBO_ROOT$/apps/*/*.ts among its inputs in turbo.json: add it, or turbo replays it from its cache',
  ]);
  for (const task of ['agent-orchestrator#test', 'guards#test', 'agent-runtime#test', 'api#test', 'web#test', 'docs#test'])
    assert.deepEqual(missingInputs(dropping(task, '$TURBO_ROOT$/tools/**')), [
      `${task} does not list $TURBO_ROOT$/tools/** among its inputs in turbo.json: add it, or turbo replays it from its cache`,
    ]);
  assert.deepEqual(missingInputs(dropping('web#test', '$TURBO_ROOT$/.gitattributes')), [
    'web#test does not list $TURBO_ROOT$/.gitattributes among its inputs in turbo.json: add it, or turbo replays it from its cache',
  ]);
  assert.deepEqual(missingInputs(dropping('web#test', BOARD_SKILL)), [
    `web#test does not list ${BOARD_SKILL} among its inputs in turbo.json: add it, or turbo replays it from its cache`,
  ]);
  assert.deepEqual(missingInputs(dropping('api#test', '$TURBO_ROOT$/packages/*/src/**')), [
    'api#test does not list $TURBO_ROOT$/packages/*/src/** among its inputs in turbo.json: add it, or turbo replays it from its cache',
  ]);
  assert.deepEqual(missingInputs(dropping('docs#test', '$TURBO_ROOT$/packages/**')), [
    'docs#test does not list $TURBO_ROOT$/packages/** among its inputs in turbo.json: add it, or turbo replays it from its cache',
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
  assert.ok(refused.startsWith('turbo.json has no inputs for agent-runtime#test'), refused);
  assert.ok(refused.includes('give it $TURBO_DEFAULT$, '), refused);
});
