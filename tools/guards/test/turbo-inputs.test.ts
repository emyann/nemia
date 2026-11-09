/**
 * The tests that scan files outside their package are re-run when those files change. Turbo caches a package's test by the package's own
 * files, so a test that reads the apps or another package replays a pass from its cache after a change there, unless `turbo.json` names
 * what it reads as its inputs. The contract tests read every source outside their package (`test/contract.test.ts` in each package), the
 * lint tests here read `.oxlintrc.json` and `lint/`, and this package's suite reads the apps' tests (`suite.test.ts`, `comments.test.ts`)
 * and the orchestrator's guard of its flag reads the apps' `tsconfig.json` (`index-reads.test.ts`).
 * The declared-imports scan here reads every workspace package's `package.json` and source, the apps' configs and the runtime's files
 * among them, and the runtime's contract test reads the `.ts` files at each app's root too, and both contract scans an app's code beside
 * its `src/`, the client's `bin/` and `contracts/` (`APP_BESIDE`). The vocabulary test here reads the
 * names of the agents and workflows sdlc ships, under `packages/templates/sdlc/` (`words.test.ts`, `nemia-shipped.test.ts`), which
 * the orchestrator's own files do not reach. The orchestrator's tests read the side
 * Grafana's files and the guards' manifest (`observe.test.ts`, `profile.test.ts`, `contract.test.ts`), the runtime's contract test a
 * file of `tools/observe/render/`, and the docs' name test every file under `tools/` (`names.test.ts`), so those three tasks and the
 * guards' list `tools/`. The docs' tests read the packages' docs for the diagrams they draw, every source for the names their pages
 * cite, and the paths those pages cite, at the root and under `docs/`. The api's test of what `npm run dev` watches
 * reads every workspace package's `package.json` and sources
 * (`dev-watch.test.ts`). The api's tests read Nemia's builtin servers and skills, the orchestrator's `servers/` and `skills/`
 * (`servers.test.ts`, `sign-in.boundary.test.ts`, `skills.test.ts`). The board's test of the look's parts reads the trigger skill of a
 * change to the board, which names each part (`apps/web/test/look.test.ts`), and its test of a merge reads the root's `CLAUDE.md` and
 * `.gitattributes` (`apps/web/test/e2e-merge.test.ts`), so the web's test lists all three; the client's reads nothing outside it,
 * and needs no task of its own, since the api and the orchestrator it runs reach its hash through its dependencies (`^transit`). The
 * repository's own guards read
 * the files they hold (`guards#test`): the whole-repository scans (`names.test.ts`, `others.test.ts`, `local-paths.test.ts`) and the
 * lint guards (`comments.test.ts`, `limits.test.ts`) read `.oxlintrc.json`, `.oxfmtrc.json`, `lint/` and every package's tests, bins,
 * places and contracts; the CI guard reads the Actions workflow, the secret scan's allowlist, the stub secrets of the
 * runtime's `remote-agent.test.ts`, the e2e's page names, the board's generated paths and every workspace's manifest
 * (`tools/guards/test/ci-workflow.test.ts`, `tools/guards/test/ci-scan.boundary.test.ts`), and `tools/guards/test/repo-guards.test.ts`
 * reads `CODEOWNERS`, under `.github/`, and the packages' manifests. The citation guard reads every `CLAUDE.md` and every test file, the
 * apps' among them (`claude-md-cites.test.ts`); the licence guard every workspace's manifest (`license.test.ts`); the verifier's
 * guard every workspace's manifest and every package's `src/` (`no-shipped-verifier.test.ts`); the team's guards and the git
 * reads' guard `.claude/settings.json`, the repository's skills and sdlc's role skills (`team-words.test.ts`,
 * `git-reads.test.ts`), the five layers' guard the docs site's pages and the agents' glossary table (`agent-layers-doc.test.ts`), and the
 * glossary guard every context's table and the apps' source (`glossary.test.ts`); the orchestrator's own files, and the runtime's through
 * it, reach this task through its dependency on `agent-orchestrator`. The same list is what `tools/guards/due.ts` reads to say whether CI
 * owes the guards their suite. `INPUTS` names, for each such task, the globs it must list beside its own files; `missingInputs` refuses a
 * task or a glob left out.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');

const APPS = ['$TURBO_ROOT$/apps/*/src/**', '$TURBO_ROOT$/apps/*/test/**'];

/**
 * An app's code beside its `src/`: the client's bins and its contracts (`apps/cli/bin`, `apps/cli/contracts`), which the contract scans
 * read as they read every file outside their package, and the glossary guard as it reads every `.ts` under a table's paths.
 */
const APP_BESIDE = ['$TURBO_ROOT$/apps/*/bin/**', '$TURBO_ROOT$/apps/*/contracts/**'];

/**
 * The apps' test files, under their `test/` and beside their code to the depth they keep them, which `claude-md-cites.test.ts` resolves
 * a citation to. The apps' whole source is an input too (`APP_SOURCES`), so the two globs under `src/` are within it; they stay listed
 * for the citation guard, which would still read them if the glossary guard stopped reading the apps' source.
 */
const APP_TESTS = ['$TURBO_ROOT$/apps/*/test/**', '$TURBO_ROOT$/apps/*/src/*.test.ts*', '$TURBO_ROOT$/apps/*/src/*/*.test.ts*'];

/**
 * What the glossary guard reads in the apps (`glossary.test.ts`): each app's table at its root, and every `.ts` and `.tsx` under it —
 * its source, its configuration files beside its manifest, and the board's Storybook — where it counts the spellings a table retires.
 * The guards are due on every change to the board's source for it; the packages' tables and source reach this task through its
 * dependency on `agent-orchestrator`.
 */
const APP_SOURCES = [
  '$TURBO_ROOT$/apps/*/src/**',
  '$TURBO_ROOT$/apps/*/*.ts',
  '$TURBO_ROOT$/apps/web/.storybook/**',
  '$TURBO_ROOT$/apps/*/glossary.json',
];

/** Every `CLAUDE.md` of the repository, the root's, the apps' and the packages': what `claude-md-cites.test.ts` reads. */
const CLAUDE_FILES = ['$TURBO_ROOT$/CLAUDE.md', '$TURBO_ROOT$/apps/*/CLAUDE.md', '$TURBO_ROOT$/packages/*/CLAUDE.md'];

/** The trigger skill of a change to the board, which `apps/web/test/look.test.ts` reads for the look's parts. */
const BOARD_SKILL = '$TURBO_ROOT$/.claude/skills/change-the-board/SKILL.md';

/**
 * The test kit, which every workspace's tests import (`test-kit/scratch`, `test-kit/layout`, …): a task that lists its inputs lists it,
 * through `tools/**` or by name, so a change to the kit re-runs the tests that take it.
 */
const KIT = '$TURBO_ROOT$/tools/test-kit/**';

/** Each task that reads files outside its package, and the inputs it lists: its own files, and what it reads outside them. */
const INPUTS: Record<string, readonly string[]> = {
  'agent-orchestrator#test': [
    '$TURBO_DEFAULT$',
    '$TURBO_ROOT$/.oxlintrc.json',
    '$TURBO_ROOT$/lint/**',
    '$TURBO_ROOT$/tools/**',
    ...APPS,
    '$TURBO_ROOT$/apps/*/*.ts',
    ...APP_BESIDE,
    '$TURBO_ROOT$/apps/*/package.json',
    '$TURBO_ROOT$/apps/*/tsconfig.json',
    '$TURBO_ROOT$/apps/*/CLAUDE.md',
    '$TURBO_ROOT$/CLAUDE.md',
    '$TURBO_ROOT$/packages/templates/sdlc/**',
    '$TURBO_ROOT$/packages/agent-runtime/**',
    '!$TURBO_ROOT$/packages/agent-runtime/.turbo/**',
  ],
  'guards#test': [
    '$TURBO_DEFAULT$',
    '$TURBO_ROOT$/.github/**',
    '$TURBO_ROOT$/.gitleaks.toml',
    '$TURBO_ROOT$/docs/**',
    '$TURBO_ROOT$/tools/**',
    '$TURBO_ROOT$/package.json',
    '$TURBO_ROOT$/package-lock.json',
    '$TURBO_ROOT$/turbo.json',
    '$TURBO_ROOT$/packages/*/package.json',
    '$TURBO_ROOT$/apps/*/package.json',
    '$TURBO_ROOT$/packages/*/src/**',
    ...['test', 'bin', 'place', 'contracts'].map((dir) => `$TURBO_ROOT$/packages/*/${dir}/**`),
    '$TURBO_ROOT$/.oxlintrc.json',
    '$TURBO_ROOT$/.oxfmtrc.json',
    '$TURBO_ROOT$/lint/**',
    '$TURBO_ROOT$/packages/agent-runtime/test/remote-agent.test.ts',
    '$TURBO_ROOT$/apps/web/test/e2e/pages/NAMES',
    '$TURBO_ROOT$/apps/web/src/routeTree.gen.ts',
    '$TURBO_ROOT$/apps/web/theme/**',
    ...APP_TESTS,
    '$TURBO_ROOT$/apps/*/tsconfig.json',
    ...APP_SOURCES,
    ...APP_BESIDE,
    '$TURBO_ROOT$/apps/docs/src/content/docs/**',
    ...CLAUDE_FILES,
    '$TURBO_ROOT$/.claude/settings.json',
    '$TURBO_ROOT$/.claude/skills/**',
    '$TURBO_ROOT$/packages/templates/sdlc/skills/**',
  ],
  'agent-runtime#test': [
    '$TURBO_DEFAULT$',
    '$TURBO_ROOT$/lint/**',
    '$TURBO_ROOT$/tools/**',
    ...APPS,
    '$TURBO_ROOT$/apps/*/*.ts',
    ...APP_BESIDE,
    ...['src', 'bin', 'test', 'place'].map((dir) => `$TURBO_ROOT$/packages/agent-orchestrator/${dir}/**`),
  ],
  'api#test': [
    '$TURBO_DEFAULT$',
    KIT,
    ...['src', 'place', 'servers', 'skills'].map((dir) => `$TURBO_ROOT$/packages/*/${dir}/**`),
    '$TURBO_ROOT$/packages/*/package.json',
  ],
  'web#test': ['$TURBO_DEFAULT$', KIT, BOARD_SKILL, '$TURBO_ROOT$/CLAUDE.md', '$TURBO_ROOT$/.gitattributes'],
  'docs#test': [
    '$TURBO_DEFAULT$',
    '$TURBO_ROOT$/tools/**',
    '$TURBO_ROOT$/lint/**',
    ...APPS,
    '$TURBO_ROOT$/packages/**',
    '!$TURBO_ROOT$/packages/*/.turbo/**',
    '$TURBO_ROOT$/docs/**',
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

test("REFUSED: a task that drops the apps' tests, sources or tables, or root files, sdlc's team, the repository's tools, its own files, or its whole inputs", () => {
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
  for (const glob of APP_SOURCES) {
    const missing = missingInputs(dropping('guards#test', glob));
    assert.equal(missing.length, 1, glob);
    assert.ok(missing[0].includes(glob), missing[0]);
  }
  assert.deepEqual(missingInputs(dropping('guards#test', '$TURBO_ROOT$/.gitleaks.toml')), [
    'guards#test does not list $TURBO_ROOT$/.gitleaks.toml among its inputs in turbo.json: add it, or turbo replays it from its cache',
  ]);
  assert.deepEqual(missingInputs(dropping('agent-orchestrator#test', '$TURBO_ROOT$/packages/templates/sdlc/**')), [
    'agent-orchestrator#test does not list $TURBO_ROOT$/packages/templates/sdlc/** among its inputs in turbo.json: add it, or turbo replays it from its cache',
  ]);
  assert.deepEqual(missingInputs(dropping('agent-runtime#test', '$TURBO_ROOT$/apps/*/*.ts')), [
    'agent-runtime#test does not list $TURBO_ROOT$/apps/*/*.ts among its inputs in turbo.json: add it, or turbo replays it from its cache',
  ]);
  for (const task of ['agent-orchestrator#test', 'guards#test', 'agent-runtime#test', 'docs#test'])
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
  for (const task of ['agent-orchestrator#test', 'agent-runtime#test', 'guards#test'])
    for (const glob of APP_BESIDE)
      assert.deepEqual(missingInputs(dropping(task, glob)), [
        `${task} does not list ${glob} among its inputs in turbo.json: add it, or turbo replays it from its cache`,
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
