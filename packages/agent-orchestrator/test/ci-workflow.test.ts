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
 * The test reads files outside this package, the workflow and the root's `package.json`: `turbo.json` lists `.github/` among this
 * package's test inputs (`turbo-inputs.test.ts`), or turbo replays a pass from its cache after an edit to the workflow.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');

/** The workflow, as every sentence below names it to the person who must fix it. */
const FILE = '.github/workflows/ci.yml';

/** The job that reports the one context branch protection requires. */
const GATE = 'ci';

/** The job whose matrix holds the legs: one workspace on one node version. */
const LEGS = 'test';

type Step = { uses?: string; with?: Record<string, unknown>; run?: string; env?: Record<string, string> };

type Job = {
  if?: string;
  needs?: string[];
  strategy?: { 'fail-fast'?: boolean; matrix?: Record<string, unknown[]> };
  steps?: Step[];
};

type Workflow = {
  name?: string;
  on?: Record<string, { branches?: string[] } | null>;
  permissions?: Record<string, string>;
  concurrency?: { group?: string; 'cancel-in-progress'?: unknown };
  jobs: Record<string, Job>;
};

/** A workspace of this repository, by the name a turbo filter gives it, and whether it has a suite to run. */
type Workspace = { name: string; suite: boolean };

const workflowText = (): string => fs.readFileSync(path.join(ROOT, FILE), 'utf8');

const readWorkflow = (text = workflowText()): Workflow => yaml.load(text) as Workflow;

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

/** The trigger that would run a fork's code with a token that can write, read from the file's own text. */
function targetDrift(text: string): string[] {
  const trigger = ['pull', 'request', 'target'].join('_');
  return text.includes(trigger)
    ? [
        `${FILE} names ${trigger}: a fork's code must not run with a token that can write, so trigger on pull_request instead and read nothing of the fork's with write access`,
      ]
    : [];
}

/** Every clause, over the shipped file. */
const drift = (workflow: Workflow, workspaces: Workspace[], engine: string, text: string): string[] => [
  ...legDrift(workflow, workspaces),
  ...nodeDrift(workflow, engine),
  ...gateDrift(workflow),
  ...actionDrift(workflow),
  ...targetDrift(text),
];

test('the shipped CI workflow agrees with the repository it checks', () => {
  const workspaces = readWorkspaces();
  assert.ok(workspaces.length >= 4, `the scan read ${workspaces.length} workspaces: the repository has more, so the clauses read nothing`);
  assert.ok(
    workspaces.filter((workspace) => workspace.suite).length >= 4,
    'the scan found fewer than four workspaces with a test script: the leg clause reads nothing',
  );
  assert.deepEqual(drift(readWorkflow(), workspaces, readEngine(), workflowText()), []);
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

test('REFUSED: a workspace with no leg, a leg with no workspace, a node floor adrift, an unquoted node, a job outside the gate, a third party, a fork with a writable token', () => {
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

  const target = ['pull', 'request', 'target'].join('_');
  assert.deepEqual(targetDrift(text.replace('pull_request:', `${target}:`)), [
    `.github/workflows/ci.yml names ${target}: a fork's code must not run with a token that can write, so trigger on pull_request instead and read nothing of the fork's with write access`,
  ]);
});
