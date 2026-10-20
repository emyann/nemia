/**
 * The Actions workflow agrees with the repository it checks.
 *
 * `.github/workflows/ci.yml` is prose to every test but this one: nothing here can run it, and its first real verdict comes when the
 * owner pushes main. What it can hold is the agreement between the file and the repository, which is what drifts — a workspace that has a
 * suite and no leg, a node floor the matrix no longer tests, a job the gate forgot to need — and each such drift is green on GitHub while
 * testing less than it claims, which is the worst way to be wrong. So each clause is a pure function returning a sentence that names the
 * fix, one test runs them all against the shipped file, and a `REFUSED:` test breaks a parsed copy once per clause.
 *
 * Branch protection requires one context, `ci`, from the gate job, and never names another: that is why the gate must need every job of
 * the file and carry `always()`, and why a job added by a later card without a line in `needs` is refused here.
 *
 * What the gate's script actually decides is run rather than read, next door in `ci-gate.boundary.test.ts`: matching its text would
 * prove nothing about its verdict.
 *
 * It reads the e2e's own `pages/NAMES` too, only to refuse a shard count the pages cannot fill: which pages a shard visits is dealt by
 * the runner from the pages that exist (`shardOf`, `apps/web/test/e2e/pages.ts`), and coverage is proved there, over them. A hand-written
 * shard list anywhere here would be the second list of pages that `apps/web/CLAUDE.md` forbids — a new page is its file and its NAMES
 * line and nothing else — so there is no list to diff, and the clause holds the wiring instead: the leg's shard, and the matrix's count.
 *
 * The test reads files outside this package, the workflow and the root's `package.json`: `turbo.json` lists `.github/` among this
 * package's test inputs (`turbo-inputs.test.ts`), or turbo replays a pass from its cache after an edit to the workflow.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  BOUND,
  BUILD,
  E2E,
  E2E_COMMAND,
  FILE,
  GATE,
  GENERATED,
  gateSteps,
  LEGS,
  readWorkflow,
  runSteps,
  shardRunStep,
  staleStep,
  STALE_STEP,
  type Step,
  type Workflow,
  workflowText,
} from './ci-workflow.ts';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');

/** What `cancel-in-progress` must read, as the sentence that refuses another value spells it out. */
const SPARED = "${{ github.ref != 'refs/heads/main' }}";

/** The filter every leg's suite run must carry, so the leg tests the workspace its name claims. */
const FILTERED = '--filter=${{ matrix.workspace }}';

/** What the gate's step must be given, the needed jobs' results as JSON, through the environment and not the command line. */
const RESULTS = '${{ toJSON(needs) }}';

/** A workspace of this repository, by the name a turbo filter gives it, and whether it has a suite to run. */
type Workspace = { name: string; suite: boolean };

/** Every workspace the root `package.json` claims, expanded from its globs: the folders under them that hold a `package.json`. */
function readWorkspaces(): Workspace[] {
  const root = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
    workspaces: string[];
    engines: { node: string };
  };
  return root.workspaces
    .map((glob) => glob.replace(/\/\*$/, ''))
    .flatMap((top) => fs.readdirSync(path.join(ROOT, top)).map((name) => path.join(ROOT, top, name)))
    .flatMap((dir) => {
      const file = path.join(dir, 'package.json');
      if (!fs.existsSync(file)) return [];
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as { name: string; scripts?: Record<string, string> };
      return [{ name: pkg.name, suite: pkg.scripts?.test !== undefined }];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** What `engines.node` claims, as the root writes it. */
const readEngine = (): string =>
  (JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { engines: { node: string } }).engines.node;

/** The workspaces the matrix names, one leg each. */
const legWorkspaces = (workflow: Workflow): unknown[] => workflow.jobs[LEGS]?.strategy?.matrix?.workspace ?? [];

/** The node versions the matrix names, as YAML read them: a string, or a number where a quote was forgotten. */
const legNodes = (workflow: Workflow): unknown[] => workflow.jobs[LEGS]?.strategy?.matrix?.node ?? [];

/** A workspace with a suite and no leg, and a leg naming a workspace this repository does not have. */
function legDrift(workflow: Workflow, workspaces: Workspace[]): string[] {
  const legs = legWorkspaces(workflow);
  return [
    ...workspaces
      .filter((workspace) => workspace.suite && !legs.includes(workspace.name))
      .map(
        (workspace) =>
          `${workspace.name} has a test script and no leg in ${FILE}: add ${workspace.name} to the ${LEGS} job's matrix.workspace, or CI reports green having never run its suite`,
      ),
    ...legs
      .filter((leg) => !workspaces.some((workspace) => workspace.name === leg))
      .map(
        (leg) =>
          `the ${LEGS} job's matrix.workspace in ${FILE} names ${String(leg)}, which is no workspace of this repository: take it off the matrix, or add the workspace it means`,
      ),
  ];
}

/** A node version written unquoted, an `engines.node` with no floor to read, and a matrix that does not test that floor. */
function nodeDrift(workflow: Workflow, engine: string): string[] {
  const nodes = legNodes(workflow);
  const sentences = nodes
    .filter((node) => typeof node !== 'string')
    .map(
      (node) =>
        `the ${LEGS} job's matrix.node in ${FILE} holds ${String(node)} unquoted: YAML reads it as a number and setup-node then installs another version, so write it '${String(node)}'`,
    );
  const floor = /^>=(\d+\.\d+\.\d+)$/.exec(engine)?.[1];
  if (floor === undefined)
    sentences.push(
      `engines.node in package.json reads ${engine}, which names no floor to test: write it >=<major>.<minor>.<patch>, so the matrix can be held to the version the package claims to run on`,
    );
  else if (!nodes.includes(floor))
    sentences.push(
      `the ${LEGS} job's matrix.node in ${FILE} does not test ${floor}, the floor engines.node claims in package.json: add '${floor}' to the matrix, or lower engines.node to a version the matrix tests`,
    );
  return sentences;
}

/** A gate that does not run whatever happens, or that does not need every other job of the file. */
function gateDrift(workflow: Workflow): string[] {
  const gate = workflow.jobs[GATE];
  if (gate === undefined)
    return [
      `${FILE} has no ${GATE} job: branch protection requires the one context ${GATE}, so add the gate job that needs every other job and fails unless each succeeded`,
    ];
  const needs = gate.needs ?? [];
  return [
    ...((gate.if ?? '').includes('always()')
      ? []
      : [
          `the ${GATE} job in ${FILE} does not carry if: always(): a failed job skips the gate, the ${GATE} context never reports, and branch protection waits for ever`,
        ]),
    ...Object.keys(workflow.jobs)
      .filter((job) => job !== GATE && !needs.includes(job))
      .map(
        (job) =>
          `the ${GATE} job in ${FILE} does not need ${job}: branch protection names ${GATE} and nothing else, so add ${job} to the gate's needs, or its failure reports green`,
      ),
  ];
}

/** GitHub's own action, taken by major tag: the pointer floats to its latest release, and a third party's never matches. */
const OWN_ACTION = /^actions\/[a-z][a-z\d-]*@v\d+$/;

/** A step that takes an action this workflow may not take. */
function actionDrift(workflow: Workflow): string[] {
  return Object.entries(workflow.jobs).flatMap(([name, job]) =>
    (job.steps ?? [])
      .filter((step) => step.uses !== undefined && !OWN_ACTION.test(step.uses))
      .map(
        (step) =>
          `the ${name} job in ${FILE} takes ${String(step.uses)}: this workflow takes GitHub's own actions by major tag alone, so write it actions/<name>@v<major>, and take a third party's code as a pinned download in a run step instead`,
      ),
  );
}

/** The timezones every leg runs its suite under: the two the card names, in no particular order. */
const ZONES = ['UTC', 'America/New_York'];

/** Each run of the suite in the leg, by the timezone it sets and whether it passes `--force`. */
const suiteRuns = (workflow: Workflow): { zone: string | undefined; forced: boolean }[] =>
  (workflow.jobs[LEGS]?.steps ?? [])
    .filter((step) => step.run?.includes('turbo run test') === true)
    .map((step) => ({ zone: step.env?.TZ, forced: step.run?.includes('--force') === true }));

/**
 * A timezone the leg does not run its suite under, and a run that does not pass `--force`. The second is the invisible one: `turbo.json`
 * hashes no environment, so a run without it replays the run before it from the cache and that timezone is never tested at all.
 */
function zoneDrift(workflow: Workflow): string[] {
  const runs = suiteRuns(workflow);
  return [
    ...ZONES.filter((zone) => !runs.some((run) => run.zone === zone)).map(
      (zone) =>
        `the ${LEGS} job in ${FILE} does not run its suite under TZ=${zone}: give it a run step of the suite with env TZ: ${zone}, or a test whose verdict turns on the timezone passes CI and fails on a machine in the other`,
    ),
    ...runs
      .filter((run) => !run.forced)
      .map(
        (run) =>
          `the ${LEGS} job's suite run under TZ=${String(run.zone)} in ${FILE} does not pass --force: turbo hashes no environment, so it replays the run before it from the cache and that timezone is never tested`,
      ),
  ];
}

/**
 * A run of the suite that does not filter to the leg's own workspace. `legDrift` proves the matrix names every workspace; this proves the
 * leg runs the one it is named for, and without it ten legs could run one package's suite while nine of them report another's.
 */
function filterDrift(workflow: Workflow): string[] {
  return (workflow.jobs[LEGS]?.steps ?? [])
    .filter((step) => step.run?.includes('turbo run test') === true && !step.run.includes(FILTERED))
    .map(
      (step) =>
        `the ${LEGS} job's suite run under TZ=${String(step.env?.TZ)} in ${FILE} does not pass ${FILTERED}: every leg would run the same package's suite, and the legs report a workspace they never tested`,
    );
}

/**
 * A gate whose verdict is not one step reading `toJSON(needs)` out of the environment. The results are a fork's to shape on a pull
 * request, so they must reach the step's shell through `env` and never be interpolated into its command line.
 */
function verdictDrift(workflow: Workflow): string[] {
  const steps = gateSteps(workflow);
  if (steps.length !== 1)
    return [
      `the ${GATE} job in ${FILE} has ${steps.length} steps that run a command, not one: give it the single step that reads the results out of env and fails unless each is success`,
    ];
  const [step] = steps as [Step];
  const sentences: string[] = [];
  if (!Object.values(step.env ?? {}).includes(RESULTS))
    sentences.push(
      `the ${GATE} job's step in ${FILE} is not given ${RESULTS} in its env: without it the step reads no result, and the ${GATE} context says nothing about the jobs it needs`,
    );
  if ((step.run ?? '').includes('${{'))
    sentences.push(
      `the ${GATE} job's step in ${FILE} interpolates an expression into its run: on a pull request a fork shapes what needs holds, so pass it through env and read it as a shell variable instead`,
    );
  return sentences;
}

/** The one expression that cancels a branch's superseded run and spares every run of main, as the owner chose at the gate. */
const SPARES_MAIN = /^\$\{\{\s*github\.ref\s*!=\s*'refs\/heads\/main'\s*\}\}$/;

/** A `cancel-in-progress` that does not spare main: `true` cancels a landing's run, and anything else cancels nothing or is unreadable. */
function cancelDrift(workflow: Workflow): string[] {
  const value = workflow.concurrency?.['cancel-in-progress'];
  return SPARES_MAIN.test(String(value))
    ? []
    : [
        `concurrency.cancel-in-progress in ${FILE} reads ${String(value)}: write it ${SPARED} so a branch's superseded run is cancelled and every push to main keeps its own run, since the ${GATE} gate reads a cancelled job as a failure and a landing that was never tested would report red`,
      ];
}

/** The trigger that would run a fork's code with a token that can write, read from the file's own text. */
function targetDrift(text: string): string[] {
  const trigger = ['pull', 'request', 'target'].join('_');
  return text.includes(trigger)
    ? [
        `${FILE} names ${trigger}: a fork's code must not run with a token that can write, so trigger on pull_request instead and read nothing of the fork's with write access`,
      ]
    : [];
}

/** The expression the shard's run must be given its shard by: the leg's own, never a literal, or every leg would run shard 1. */
const SHARD_FLAG = '--shard ${{ matrix.shard }}';

/** The expression the shard count must be written as: read back off the matrix, so the count is written once, in the matrix itself. */
const OF_FLAG = '--of ${{ strategy.job-total }}';

/** The command the bound job must run: the one reader of `PAGES_BOUND_MS`, which no copy in YAML may stand in for. */
const BOUND_COMMAND = 'apps/web/test/e2e/pages-bound.ts';

/** The pages the e2e has, read off its own NAMES: a name a line, the blank lines left out. */
const readPages = (): string[] =>
  fs
    .readFileSync(path.join(ROOT, 'apps', 'web', 'test', 'e2e', 'pages', NAMES_FILE), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

/** Where the e2e says which pages there are, relative to the repository, as the sentences that refuse a shard count name it. */
const NAMES_FILE = 'NAMES';
const NAMES_PATH = 'apps/web/test/e2e/pages/NAMES';

/** The shards the e2e job's matrix names, as YAML read them. */
const shardLegs = (workflow: Workflow): unknown[] => workflow.jobs[E2E]?.strategy?.matrix?.shard ?? [];

/**
 * A shard matrix that is not 1..n contiguous, a run that does not take its shard off the leg or its count off the matrix, and more shards
 * than the e2e has pages. The first is the invisible one: shards [1, 2, 4] of `strategy.job-total` 3 run shard 4 of 3, which the runner
 * refuses, while shard 3's pages are visited by nobody — and a literal `--of 4` beside three legs would leave a quarter of the pages
 * unvisited, green.
 */
function shardDrift(workflow: Workflow, pages: readonly string[]): string[] {
  const shards = shardLegs(workflow);
  const sentences: string[] = [];
  const wanted = Array.from({ length: shards.length || 4 }, (_shard, i) => i + 1);
  if (!shards.length || shards.some((shard, i) => shard !== wanted[i]))
    sentences.push(
      `the ${E2E} job's matrix.shard in ${FILE} reads ${JSON.stringify(shards)}, not 1 to ${wanted.length} in order: write it [${wanted.join(', ')}], since the run takes its count off strategy.job-total and a shard outside 1..n visits nothing while another's pages are visited by nobody`,
    );
  const run = shardRunStep(workflow)?.run;
  if (run === undefined)
    sentences.push(
      `the ${E2E} job in ${FILE} has no step that runs \`${E2E_COMMAND}\`: give it one passing ${SHARD_FLAG} ${OF_FLAG}, or the job reports green having visited no page`,
    );
  else
    for (const flag of [SHARD_FLAG, OF_FLAG])
      if (!run.includes(flag))
        sentences.push(
          `the ${E2E} job's run of \`${E2E_COMMAND}\` in ${FILE} does not pass ${flag}: write it \`${E2E_COMMAND} -- ${SHARD_FLAG} ${OF_FLAG}\`, or the shards visit the wrong pages — every leg the same one, or a count adrift from the legs, and the pages of a shard nobody runs are never visited`,
        );
  if (shards.length > pages.length)
    sentences.push(
      `the ${E2E} job's matrix.shard in ${FILE} names ${shards.length} shards and ${NAMES_PATH} names ${pages.length} pages: a shard of them would visit nothing, so cut the matrix to ${pages.length} shards at most`,
    );
  return sentences;
}

/**
 * A bound job that is not there, does not wait for the shards, or does not run the one command that sums their page time. `--pages` and
 * `--shard` both silence the bound inside a run (`planOf`), so without this job nothing in CI holds the whole e2e's cost — and
 * `PAGES_BOUND_MS` has one writer, in `apps/web/test/e2e/timing.ts`, which is why the sum is this command's and no comparison in YAML.
 */
function boundDrift(workflow: Workflow): string[] {
  const job = workflow.jobs[BOUND];
  if (job === undefined)
    return [
      `${FILE} has no ${BOUND} job: a shard silences the e2e's bound the way --pages does, so add the job that needs ${E2E} and runs \`node ${BOUND_COMMAND} <dir>\` over the shards' page times, or nothing in CI holds the whole e2e's cost`,
    ];
  return [
    ...((job.needs ?? []).includes(E2E)
      ? []
      : [
          `the ${BOUND} job in ${FILE} does not need ${E2E}: add ${E2E} to its needs, or it runs before the shards have written their page times and sums nothing`,
        ]),
    ...(runSteps(workflow, BOUND).some((step) => step.run?.includes(BOUND_COMMAND) === true)
      ? []
      : [
          `the ${BOUND} job in ${FILE} does not run \`node ${BOUND_COMMAND}\`: it is the one place the shards' page times are summed against PAGES_BOUND_MS, whose only writer is apps/web/test/e2e/timing.ts, so run it rather than comparing a copy of the bound here`,
        ]),
  ];
}

/** The two commands the build job must run, and what each writes, as the sentence that refuses its absence names it. */
const BUILT: { command: string; writes: string }[] = [
  { command: 'npm run build', writes: 'apps/web/src/routeTree.gen.ts' },
  { command: 'npm run theme:generate', writes: 'apps/web/theme/' },
];

/**
 * A build job that is not there, does not run a generator, or whose staleness step does not name a generated path — and a `GENERATED`
 * path this repository does not have, which would make the step guard nothing while reading as though it guarded everything.
 */
function buildDrift(workflow: Workflow, generated: readonly string[] = GENERATED): string[] {
  const sentences = generated
    .filter((generated) => !fs.existsSync(path.join(ROOT, generated)))
    .map(
      (path_) =>
        `GENERATED in ci-workflow.ts names ${path_}, which this repository does not have: a step that diffs a path that is not there refuses nothing, so write the path the generator writes, or take it off the list`,
    );
  if (workflow.jobs[BUILD] === undefined)
    return [
      ...sentences,
      `${FILE} has no ${BUILD} job: add the job that runs ${BUILT.map((built) => `\`${built.command}\``).join(' and ')} and then refuses a diff of ${generated.join(' and ')}, or a generated file committed stale passes CI and fails a person's typecheck`,
    ];
  const runs = runSteps(workflow, BUILD)
    .filter((step) => step.name !== STALE_STEP)
    .map((step) => step.run ?? '')
    .join('\n');
  sentences.push(
    ...BUILT.filter((built) => !runs.includes(built.command)).map(
      (built) =>
        `the ${BUILD} job in ${FILE} does not run \`${built.command}\`: it is what writes ${built.writes}, so without it the staleness step reads the committed bytes against themselves and refuses nothing`,
    ),
  );
  const stale = staleStep(workflow)?.run;
  if (stale === undefined)
    sentences.push(
      `the ${BUILD} job in ${FILE} has no step named ${STALE_STEP}: give it the step that refuses a diff of ${generated.join(' and ')} by name, which ci-build.boundary.test.ts runs as GitHub runs it`,
    );
  else
    sentences.push(
      ...generated
        .filter((path_) => !stale.includes(path_))
        .map(
          (path_) =>
            `the ${BUILD} job's ${STALE_STEP} step in ${FILE} does not name ${path_}: a generator rewrites it, so add it to the paths the step diffs, or a stale ${path_} reports green`,
        ),
    );
  return sentences;
}

/** Every clause, over the shipped file. */
const drift = (workflow: Workflow, workspaces: Workspace[], engine: string, text: string, pages: readonly string[]): string[] => [
  ...legDrift(workflow, workspaces),
  ...nodeDrift(workflow, engine),
  ...gateDrift(workflow),
  ...actionDrift(workflow),
  ...zoneDrift(workflow),
  ...filterDrift(workflow),
  ...verdictDrift(workflow),
  ...cancelDrift(workflow),
  ...targetDrift(text),
  ...shardDrift(workflow, pages),
  ...boundDrift(workflow),
  ...buildDrift(workflow),
];

test('the shipped CI workflow agrees with the repository it checks', () => {
  const workspaces = readWorkspaces();
  assert.ok(workspaces.length >= 4, `the scan read ${workspaces.length} workspaces: the repository has more, so the clauses read nothing`);
  assert.ok(
    workspaces.filter((workspace) => workspace.suite).length >= 4,
    'the scan found fewer than four workspaces with a test script: the leg clause reads nothing',
  );
  const pages = readPages();
  assert.ok(pages.length > 100, `${NAMES_PATH} names ${pages.length} pages: the shard clause reads a list that is not the e2e's`);
  assert.deepEqual(drift(readWorkflow(), workspaces, readEngine(), workflowText(), pages), []);
});

test('the shipped CI workflow runs on the three events, reads alone, and caches no install', () => {
  const workflow = readWorkflow();
  assert.ok(
    Object.keys(workflow).includes('on'),
    'js-yaml reads the on: key as a string: quote it in the workflow if it ever reads as true',
  );
  assert.deepEqual(
    workflow.on?.push?.branches,
    ['main'],
    'push fires on main alone: every other branch is tested through its pull request',
  );
  assert.ok(workflow.on !== undefined && 'pull_request' in workflow.on, `${FILE} must trigger on pull_request`);
  assert.ok(
    workflow.on !== undefined && 'workflow_dispatch' in workflow.on,
    `${FILE} must trigger on workflow_dispatch, so the owner can fire it by hand`,
  );
  assert.deepEqual(workflow.permissions, { contents: 'read' }, 'the token reads the code and no more');
  assert.match(workflow.concurrency?.group ?? '', /github\.ref/, 'a run is superseded per ref');
  assert.equal(workflow.jobs[LEGS]?.strategy?.['fail-fast'], false, 'every leg runs: one failure says nothing about the others');
  const cached = Object.entries(workflow.jobs).flatMap(([name, job]) =>
    (job.steps ?? []).filter((step) => step.uses?.startsWith('actions/setup-node') && 'cache' in (step.with ?? {})).map(() => name),
  );
  assert.deepEqual(cached, [], 'setup-node caches no install here: the lockfile install is part of what is tested');
});

test('REFUSED: a workspace with no leg, a leg with no workspace, a node floor adrift, an unquoted node, a job outside the gate, a third party, a timezone untested, a run unforced, a landing cancelled, a fork with a writable token', () => {
  const workspaces = readWorkspaces();
  const engine = readEngine();
  const text = workflowText();
  const shipped = readWorkflow(text);

  const matrixOf = (workflow: Workflow): Record<string, unknown[]> => {
    const matrix = workflow.jobs[LEGS]?.strategy?.matrix;
    assert.ok(matrix !== undefined, `the ${LEGS} job has a matrix today`);
    return matrix;
  };

  const dropped = structuredClone(shipped);
  const without = legWorkspaces(dropped).filter((leg) => leg !== 'docs');
  assert.equal(without.length, legWorkspaces(dropped).length - 1, 'docs is a leg today');
  matrixOf(dropped).workspace = without;
  assert.deepEqual(legDrift(dropped, workspaces), [
    "docs has a test script and no leg in .github/workflows/ci.yml: add docs to the test job's matrix.workspace, or CI reports green having never run its suite",
  ]);

  const extra = structuredClone(shipped);
  matrixOf(extra).workspace = [...legWorkspaces(extra), 'legacy'];
  assert.deepEqual(legDrift(extra, workspaces), [
    "the test job's matrix.workspace in .github/workflows/ci.yml names legacy, which is no workspace of this repository: take it off the matrix, or add the workspace it means",
  ]);

  const adrift = structuredClone(shipped);
  matrixOf(adrift).node = ['22.19.0', '24'];
  assert.deepEqual(nodeDrift(adrift, '>=22.18.0'), [
    "the test job's matrix.node in .github/workflows/ci.yml does not test 22.18.0, the floor engines.node claims in package.json: add '22.18.0' to the matrix, or lower engines.node to a version the matrix tests",
  ]);
  for (const unreadable of ['22', '*', '^22.18.0'])
    assert.deepEqual(nodeDrift(shipped, unreadable), [
      `engines.node in package.json reads ${unreadable}, which names no floor to test: write it >=<major>.<minor>.<patch>, so the matrix can be held to the version the package claims to run on`,
    ]);

  const unquoted = structuredClone(shipped);
  matrixOf(unquoted).node = [22.18, '24'];
  assert.deepEqual(nodeDrift(unquoted, engine), [
    "the test job's matrix.node in .github/workflows/ci.yml holds 22.18 unquoted: YAML reads it as a number and setup-node then installs another version, so write it '22.18'",
    "the test job's matrix.node in .github/workflows/ci.yml does not test 22.18.0, the floor engines.node claims in package.json: add '22.18.0' to the matrix, or lower engines.node to a version the matrix tests",
  ]);

  const unneeded = structuredClone(shipped);
  const gate = unneeded.jobs[GATE];
  const needed = gate?.needs;
  assert.ok(gate !== undefined && needed !== undefined && needed.includes('lint'), 'the gate needs lint today');
  gate.needs = needed.filter((job) => job !== 'lint');
  assert.deepEqual(gateDrift(unneeded), [
    "the ci job in .github/workflows/ci.yml does not need lint: branch protection names ci and nothing else, so add lint to the gate's needs, or its failure reports green",
  ]);

  const unbounded = structuredClone(shipped);
  const grown = unbounded.jobs[GATE]?.needs;
  assert.ok(grown?.includes(BOUND) === true, `the gate needs ${BOUND} today, which this clause is what refuses forgetting`);
  unbounded.jobs[GATE].needs = grown.filter((job) => job !== BOUND);
  assert.deepEqual(gateDrift(unbounded), [
    `the ci job in .github/workflows/ci.yml does not need ${BOUND}: branch protection names ci and nothing else, so add ${BOUND} to the gate's needs, or its failure reports green`,
  ]);

  const always = structuredClone(shipped);
  delete always.jobs[GATE]?.if;
  assert.deepEqual(gateDrift(always), [
    'the ci job in .github/workflows/ci.yml does not carry if: always(): a failed job skips the gate, the ci context never reports, and branch protection waits for ever',
  ]);

  const ungated = structuredClone(shipped);
  delete ungated.jobs[GATE];
  assert.deepEqual(gateDrift(ungated), [
    '.github/workflows/ci.yml has no ci job: branch protection requires the one context ci, so add the gate job that needs every other job and fails unless each succeeded',
  ]);

  const pinned = structuredClone(shipped);
  const steps = pinned.jobs[LEGS]?.steps;
  assert.equal(steps?.[0]?.uses, 'actions/checkout@v7', 'the first step of a leg checks the code out today');
  steps[0] = { uses: 'actions/checkout@v7.0.1' };
  steps[1] = { uses: ['a', 'third', 'party'].join('-') + '/setup@v1' };
  assert.deepEqual(actionDrift(pinned), [
    "the test job in .github/workflows/ci.yml takes actions/checkout@v7.0.1: this workflow takes GitHub's own actions by major tag alone, so write it actions/<name>@v<major>, and take a third party's code as a pinned download in a run step instead",
    "the test job in .github/workflows/ci.yml takes a-third-party/setup@v1: this workflow takes GitHub's own actions by major tag alone, so write it actions/<name>@v<major>, and take a third party's code as a pinned download in a run step instead",
  ]);

  const onezone = structuredClone(shipped);
  const legSteps = onezone.jobs[LEGS]?.steps;
  assert.ok(legSteps !== undefined, `the ${LEGS} job has steps today`);
  onezone.jobs[LEGS].steps = legSteps.filter((step) => step.env?.TZ !== 'America/New_York');
  assert.equal(suiteRuns(onezone).length, 1, 'the leg runs its suite twice today');
  assert.deepEqual(zoneDrift(onezone), [
    'the test job in .github/workflows/ci.yml does not run its suite under TZ=America/New_York: give it a run step of the suite with env TZ: America/New_York, or a test whose verdict turns on the timezone passes CI and fails on a machine in the other',
  ]);

  const unforced = structuredClone(shipped);
  const twice = unforced.jobs[LEGS]?.steps?.filter((step) => step.run?.includes('turbo run test') === true) ?? [];
  assert.equal(twice.length, 2, 'the leg runs its suite twice today');
  twice[1].run = twice[1].run?.replace(' --force', '');
  assert.deepEqual(zoneDrift(unforced), [
    "the test job's suite run under TZ=America/New_York in .github/workflows/ci.yml does not pass --force: turbo hashes no environment, so it replays the run before it from the cache and that timezone is never tested",
  ]);

  for (const value of [true, false, undefined, "${{ github.ref != 'refs/heads/next' }}"]) {
    const cancelled = structuredClone(shipped);
    assert.ok(cancelled.concurrency !== undefined, 'the workflow sets concurrency today');
    cancelled.concurrency['cancel-in-progress'] = value;
    assert.deepEqual(cancelDrift(cancelled), [
      `concurrency.cancel-in-progress in .github/workflows/ci.yml reads ${String(value)}: write it ${SPARED} so a branch's superseded run is cancelled and every push to main keeps its own run, since the ci gate reads a cancelled job as a failure and a landing that was never tested would report red`,
    ]);
  }

  const target = ['pull', 'request', 'target'].join('_');
  assert.deepEqual(targetDrift(text.replace('pull_request:', `${target}:`)), [
    `.github/workflows/ci.yml names ${target}: a fork's code must not run with a token that can write, so trigger on pull_request instead and read nothing of the fork's with write access`,
  ]);
});

test('REFUSED: a shard matrix that is not 1..n, a shard taken off no leg, a count written as a literal, more shards than the e2e has pages', () => {
  const shipped = readWorkflow();
  const pages = readPages();
  const shardsOf = (workflow: Workflow): unknown[] => {
    const matrix = workflow.jobs[E2E]?.strategy?.matrix;
    assert.ok(matrix !== undefined, `the ${E2E} job has a matrix today`);
    matrix.shard ??= [];
    return matrix.shard;
  };

  assert.deepEqual(shardLegs(shipped), [1, 2, 3, 4], 'the e2e runs in four shards today');

  assert.deepEqual(shardDrift(shipped, pages), [], 'the shards are wired to the matrix and the pages today');
  for (const [why, legs] of [
    ['not contiguous', [1, 2, 4, 8]],
    ['none at all, as a half-written matrix leaves it', []],
  ] as const) {
    const adrift = structuredClone(shipped);
    shardsOf(adrift).splice(0, 4, ...legs);
    assert.deepEqual(
      shardDrift(adrift, pages),
      [
        `the e2e job's matrix.shard in .github/workflows/ci.yml reads ${JSON.stringify(legs)}, not 1 to ${legs.length || 4} in order: ` +
          `write it [${Array.from({ length: legs.length || 4 }, (_leg, i) => i + 1).join(', ')}], since the run takes its count off ` +
          'strategy.job-total and a shard ' +
          "outside 1..n visits nothing while another's pages are visited by nobody",
      ],
      why,
    );
  }

  const literal = structuredClone(shipped);
  const run = shardRunStep(literal);
  assert.ok(run?.run !== undefined, 'the e2e job runs the e2e today');
  run.run = run.run.replace('--of ${{ strategy.job-total }}', '--of 4');
  assert.deepEqual(shardDrift(literal, pages), [
    "the e2e job's run of `npm run e2e` in .github/workflows/ci.yml does not pass --of ${{ strategy.job-total }}: write it " +
      '`npm run e2e -- --shard ${{ matrix.shard }} --of ${{ strategy.job-total }}`, or the shards visit the wrong pages — every leg the ' +
      'same one, or a count adrift from the legs, and the pages of a shard nobody runs are never visited',
  ]);

  const everyone = structuredClone(shipped);
  const same = shardRunStep(everyone);
  same!.run = same!.run!.replace('--shard ${{ matrix.shard }}', '--shard 1');
  assert.deepEqual(shardDrift(everyone, pages), [
    "the e2e job's run of `npm run e2e` in .github/workflows/ci.yml does not pass --shard ${{ matrix.shard }}: write it " +
      '`npm run e2e -- --shard ${{ matrix.shard }} --of ${{ strategy.job-total }}`, or the shards visit the wrong pages — every leg the ' +
      'same one, or a count adrift from the legs, and the pages of a shard nobody runs are never visited',
  ]);

  const unrun = structuredClone(shipped);
  unrun.jobs[E2E].steps = (unrun.jobs[E2E].steps ?? []).filter((step) => step.run?.includes(E2E_COMMAND) !== true);
  assert.deepEqual(shardDrift(unrun, pages), [
    'the e2e job in .github/workflows/ci.yml has no step that runs `npm run e2e`: give it one passing --shard ${{ matrix.shard }} ' +
      '--of ${{ strategy.job-total }}, or the job reports green having visited no page',
  ]);

  assert.deepEqual(shardDrift(shipped, ['factory', 'runs', 'say']), [
    "the e2e job's matrix.shard in .github/workflows/ci.yml names 4 shards and apps/web/test/e2e/pages/NAMES names 3 pages: " +
      'a shard of them would visit nothing, so cut the matrix to 3 shards at most',
  ]);
});

test('REFUSED: no job that sums the shards, one that does not wait for them, and one that does not run the bound', () => {
  const shipped = readWorkflow();
  assert.deepEqual(boundDrift(shipped), [], 'the bound job is there, needs the shards and runs the bound today');

  const ungated = structuredClone(shipped);
  delete ungated.jobs[BOUND];
  assert.deepEqual(boundDrift(ungated), [
    ".github/workflows/ci.yml has no e2e-bound job: a shard silences the e2e's bound the way --pages does, so add the job that needs " +
      "e2e and runs `node apps/web/test/e2e/pages-bound.ts <dir>` over the shards' page times, or nothing in CI holds the whole e2e's cost",
  ]);

  const racing = structuredClone(shipped);
  racing.jobs[BOUND].needs = [];
  assert.deepEqual(boundDrift(racing), [
    'the e2e-bound job in .github/workflows/ci.yml does not need e2e: add e2e to its needs, or it runs before the shards have written ' +
      'their page times and sums nothing',
  ]);

  const unsummed = structuredClone(shipped);
  unsummed.jobs[BOUND].steps = (unsummed.jobs[BOUND].steps ?? []).filter((step) => step.run === undefined);
  assert.deepEqual(boundDrift(unsummed), [
    'the e2e-bound job in .github/workflows/ci.yml does not run `node apps/web/test/e2e/pages-bound.ts`: it is the one place the ' +
      "shards' page times are summed against PAGES_BOUND_MS, whose only writer is apps/web/test/e2e/timing.ts, so run it rather than " +
      'comparing a copy of the bound here',
  ]);
});

test('REFUSED: no build job, a generator not run, a staleness step that names one generated path, and a path this repository has not', () => {
  const shipped = readWorkflow();
  assert.deepEqual(buildDrift(shipped), [], 'the build job runs both generators and names both generated paths today');

  const unbuilt = structuredClone(shipped);
  delete unbuilt.jobs[BUILD];
  assert.deepEqual(buildDrift(unbuilt), [
    '.github/workflows/ci.yml has no build job: add the job that runs `npm run build` and `npm run theme:generate` and then refuses a ' +
      "diff of apps/web/src/routeTree.gen.ts and apps/web/theme/, or a generated file committed stale passes CI and fails a person's typecheck",
  ]);

  for (const [command, writes] of [
    ['npm run build', 'apps/web/src/routeTree.gen.ts'],
    ['npm run theme:generate', 'apps/web/theme/'],
  ] as const) {
    const ungenerated = structuredClone(shipped);
    const steps = ungenerated.jobs[BUILD].steps ?? [];
    assert.ok(
      steps.some((step) => step.run?.includes(command) === true),
      `the build job runs \`${command}\` today`,
    );
    ungenerated.jobs[BUILD].steps = steps.filter((step) => step.name === STALE_STEP || step.run?.includes(command) !== true);
    assert.deepEqual(buildDrift(ungenerated), [
      `the build job in .github/workflows/ci.yml does not run \`${command}\`: it is what writes ${writes}, so without it the staleness ` +
        'step reads the committed bytes against themselves and refuses nothing',
    ]);
  }

  const half = structuredClone(shipped);
  const stale = staleStep(half);
  assert.ok(stale?.run !== undefined, `the build job has its ${STALE_STEP} step today`);
  stale.run = stale.run.replaceAll('apps/web/theme/', '');
  assert.deepEqual(buildDrift(half), [
    "the build job's Refuse a stale generated file step in .github/workflows/ci.yml does not name apps/web/theme/: a generator " +
      'rewrites it, so add it to the paths the step diffs, or a stale apps/web/theme/ reports green',
  ]);

  assert.deepEqual(buildDrift(shipped, ['apps/web/src/routeTree.gen.ts', 'apps/web/no-such-generated-file.ts']), [
    'GENERATED in ci-workflow.ts names apps/web/no-such-generated-file.ts, which this repository does not have: a step that diffs a ' +
      'path that is not there refuses nothing, so write the path the generator writes, or take it off the list',
    "the build job's Refuse a stale generated file step in .github/workflows/ci.yml does not name apps/web/no-such-generated-file.ts: " +
      'a generator rewrites it, so add it to the paths the step diffs, or a stale apps/web/no-such-generated-file.ts reports green',
  ]);

  const unnamed = structuredClone(shipped);
  unnamed.jobs[BUILD].steps = (unnamed.jobs[BUILD].steps ?? []).filter((step) => step.name !== STALE_STEP);
  assert.deepEqual(buildDrift(unnamed), [
    'the build job in .github/workflows/ci.yml has no step named Refuse a stale generated file: give it the step that refuses a diff of ' +
      'apps/web/src/routeTree.gen.ts and apps/web/theme/ by name, which ci-build.boundary.test.ts runs as GitHub runs it',
  ]);
});
