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
  ALLOWLIST_STEP,
  allowlistStep,
  SCAN,
  SCAN_CONFIG,
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

/** The action every job installs its node with, by the prefix that matches it at any major tag. */
const SETUP_NODE = 'actions/setup-node';

/** The action that keeps a job's files, by the prefix that matches it at any major tag. */
const UPLOAD = 'actions/upload-artifact';

/** A path whose first segment is dotted, which `upload-artifact` skips unless it is told to take hidden files. */
const HIDDEN = /(^|\/)\.[^/]/;

/** A `node-version` that is an expression, the legs' `${{ matrix.node }}`: held by `nodeDrift` off the matrix, not by its pin. */
const OFF_MATRIX = /\$\{\{/;

/**
 * A workspace of this repository, by the name a turbo filter gives it, whether it has a suite to run, and the `test` script that runs
 * it: a leg that runs a shard of a suite is held against the script that would have to take the shard, since a script with no hole for
 * it runs the whole suite under every shard and the leg reports a half it never ran.
 */
type Workspace = { name: string; suite: boolean; test?: string };

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
      return [{ name: pkg.name, suite: pkg.scripts?.test !== undefined, test: pkg.scripts?.test }];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** What `engines.node` claims, as the root writes it. */
const readEngine = (): string =>
  (JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { engines: { node: string } }).engines.node;

/** The workspaces the matrix's own axis names: the legs that run a whole suite. */
const legWorkspaces = (workflow: Workflow): unknown[] => workflow.jobs[LEGS]?.strategy?.matrix?.workspace ?? [];

/** The node versions the matrix's axis names, as YAML read them: a string, or a number where a quote was forgotten. */
const legNodes = (workflow: Workflow): unknown[] => workflow.jobs[LEGS]?.strategy?.matrix?.node ?? [];

/** The entries of the matrix's `include`, each of which `includeDrift` holds to the shape that makes a leg of its own. */
const legIncludes = (workflow: Workflow): Record<string, unknown>[] =>
  (workflow.jobs[LEGS]?.strategy?.matrix?.include ?? []) as Record<string, unknown>[];

/** A leg of the test job: a workspace on a node, running the whole suite or the one shard of it the leg names. */
type Leg = { workspace: unknown; node: unknown; shard: unknown };

/**
 * Every leg the test job expands to: the axes' cross product, plus one leg per `include` entry. An `include` entry makes a leg of its
 * own only because its `workspace` is a value the axis does not hold — GitHub adds an entry's keys to the matching combinations
 * otherwise — so this reading is true exactly while `includeDrift` is green, which is why that clause is beside this one.
 */
const legs = (workflow: Workflow): Leg[] => [
  ...legWorkspaces(workflow).flatMap((workspace) => legNodes(workflow).map((node) => ({ workspace, node, shard: undefined }))),
  ...legIncludes(workflow).map((entry) => ({ workspace: entry.workspace, node: entry.node, shard: entry.shard })),
];

/** The workspaces the legs run, each named once, in the order the legs name them. */
const workedspaces = (workflow: Workflow): unknown[] => [...new Set(legs(workflow).map((leg) => leg.workspace))];

/** A workspace with a suite and no leg, and a leg naming a workspace this repository does not have. */
function legDrift(workflow: Workflow, workspaces: Workspace[]): string[] {
  const named = workedspaces(workflow);
  return [
    ...workspaces
      .filter((workspace) => workspace.suite && !named.includes(workspace.name))
      .map(
        (workspace) =>
          `${workspace.name} has a test script and no leg in ${FILE}: add ${workspace.name} to the ${LEGS} job's matrix.workspace, or to its matrix.include with a shard of its own, or CI reports green having never run its suite`,
      ),
    ...named
      .filter((leg) => !workspaces.some((workspace) => workspace.name === leg))
      .map(
        (leg) =>
          `the ${LEGS} job's matrix in ${FILE} names ${String(leg)}, which is no workspace of this repository: take it off the matrix, or add the workspace it means`,
      ),
  ];
}

/**
 * An `include` entry that does not make a leg of its own. GitHub adds an entry's keys to every combination it does not contradict, and
 * makes a new combination only of an entry whose value for an axis the axis does not hold: so an entry naming a workspace the axis
 * already names would hand its shard to that workspace's existing legs rather than splitting them, and an entry with no node would be
 * added to every leg of the matrix instead.
 */
function includeDrift(workflow: Workflow): string[] {
  const axis = legWorkspaces(workflow);
  const nodes = legNodes(workflow);
  return legIncludes(workflow).flatMap((entry, i) => {
    if (entry.workspace === undefined)
      return [
        `the ${LEGS} job's matrix.include in ${FILE} has an entry (${i + 1} of ${legIncludes(workflow).length}) that names no workspace: GitHub adds such an entry's keys to every combination of the matrix instead of making a leg of its own, so give it workspace: <the workspace it is a shard of>, or take it off include`,
      ];
    if (axis.includes(entry.workspace))
      return [
        `the ${LEGS} job's matrix.include in ${FILE} holds an entry for ${String(entry.workspace)}, which matrix.workspace already names: GitHub adds such an entry's keys to the matching combinations instead of making a leg of its own, so its shard would be added to an existing leg rather than splitting it — take ${String(entry.workspace)} off matrix.workspace, or the entry off include`,
      ];
    if (entry.node === undefined)
      return [
        `the ${LEGS} job's matrix.include entry for ${String(entry.workspace)} in ${FILE} names no node: an entry that contradicts one axis and leaves another open is one leg, not one per node, so write node: '${String(nodes[0])}' on it — one entry per node the matrix names`,
      ];
    return [];
  });
}

/** A node version written unquoted, an `engines.node` with no floor to read, and a matrix that does not test that floor. */
function nodeDrift(workflow: Workflow, engine: string): string[] {
  const nodes = [...new Set(legs(workflow).map((leg) => leg.node))];
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
  // Every workspace on every node the axis names. The cross product gives it for nothing; an include entry is written by hand, one per
  // node, so a workspace that arrived through include can lose a node without a word.
  const expanded = legs(workflow);
  for (const workspace of workedspaces(workflow))
    for (const node of legNodes(workflow))
      if (!expanded.some((leg) => leg.workspace === workspace && leg.node === node))
        sentences.push(
          `${String(workspace)}'s legs in ${FILE} do not run on node ${String(node)}, which the ${LEGS} job's matrix.node names: give it a leg on every node the matrix names, or a workspace is tested on one version while the matrix claims two`,
        );
  return sentences;
}

/**
 * A job that pins its node by hand and pins it off the floor. Every job of this workflow but the legs runs the repository's own code on
 * the one version it claims to run on — `docs/plan-github-ci.md` says lint and typecheck run "whole, on the floor", and the e2e shards,
 * their bound and the build run it no less — so a pin that is not the floor is refused wherever it is, and a job a later card adds is
 * held the day it is written. The legs' own `${{ matrix.node }}` is `nodeDrift`'s, and skipped here.
 *
 * Unheld, the file could claim `>=24.16.0` in `engines.node` and still run five jobs on 22.18.0, where `npm ci` refuses them with
 * `EBADENGINE` — which is what CI did on run 39349841691.
 */
function pinDrift(workflow: Workflow, engine: string): string[] {
  const floor = /^>=(\d+\.\d+\.\d+)$/.exec(engine)?.[1];
  if (floor === undefined) return [];
  return Object.entries(workflow.jobs).flatMap(([name, job]) =>
    (job.steps ?? [])
      .filter((step) => step.uses?.startsWith(SETUP_NODE))
      .flatMap((step) => {
        const pin = (step.with ?? {})['node-version'];
        if (pin === undefined)
          return [
            `the ${name} job in ${FILE} pins no node-version, so it runs on whatever node the runner happens to ship: give its ${SETUP_NODE} step node-version: '${floor}', the floor engines.node claims in package.json`,
          ];
        if (typeof pin === 'string' && OFF_MATRIX.test(pin)) return [];
        return pin === floor
          ? []
          : [
              `the ${name} job in ${FILE} runs on node ${String(pin)}, not ${floor}, the floor engines.node claims in package.json: every job but the legs runs this repository's code on its floor, so write node-version: '${floor}', or npm ci refuses the job with EBADENGINE`,
            ];
      }),
  );
}

/**
 * An upload of a hidden path that does not take hidden files. `actions/upload-artifact` skips a dotted path by default, so an upload of
 * the e2e's `.e2e/` found nothing: with `if-no-files-found: error` that failed every shard whose pages had all passed, and with
 * `ignore` it would have dropped a failing page's pictures without a word. CI run 39349841691 is both.
 */
function hiddenDrift(workflow: Workflow): string[] {
  return Object.entries(workflow.jobs).flatMap(([name, job]) =>
    (job.steps ?? [])
      .filter((step) => step.uses?.startsWith(UPLOAD))
      .flatMap((step) => {
        const kept = (step.with ?? {})['path'];
        if (typeof kept !== 'string' || !kept.split('\n').some((line) => HIDDEN.test(line.trim()))) return [];
        return (step.with ?? {})['include-hidden-files'] === true
          ? []
          : [
              `the ${name} job in ${FILE} uploads ${kept}, a hidden path, without include-hidden-files: ${UPLOAD} skips a dotted path by default, so write include-hidden-files: true beside the path, or the upload keeps nothing`,
            ];
      }),
  );
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

/** The timezone every leg runs its suite under. */
const ZONE_EVERY = 'UTC';

/** The second timezone, run by one leg alone. */
const ZONE_LOCAL = 'America/New_York';

/** The one workspace whose code reads local time, and so the one leg that runs its suite a second time. */
const LOCAL_LEG = 'web';

/** What the second zone's run step must be conditioned on, so it runs for that leg and no other. */
const LOCAL_IF = `matrix.workspace == '${LOCAL_LEG}'`;

/** The environment variable the orchestrator's `test` script reads its shard out of. */
const SHARD_ENV = 'WF_TEST_SHARD';

/** What that variable must be given: the leg's own shard, never a literal, or every leg would run the same half. */
const SHARD_VALUE = '${{ matrix.shard }}';

/** The hole a `test` script needs for a shard to reach `node --test`, which expands to nothing where no shard is set. */
const SHARD_HOLE = '${WF_TEST_SHARD:+--test-shard=$WF_TEST_SHARD}';

/** A shard as `node --test-shard` takes one: the index of a count, both counting from one. */
const FRACTION = /^(\d+)\/(\d+)$/;

/** Each run of the suite in the leg, by the timezone it sets, what it is conditioned on, its shard, and whether it passes `--force`. */
const suiteRuns = (workflow: Workflow): { zone: string | undefined; if?: string; shard: string | undefined; forced: boolean }[] =>
  (workflow.jobs[LEGS]?.steps ?? [])
    .filter((step) => step.run?.includes('turbo run test') === true)
    .map((step) => ({
      zone: step.env?.TZ,
      if: step.if,
      shard: step.env?.[SHARD_ENV],
      forced: step.run?.includes('--force') === true,
    }));

/**
 * The zones the legs run their suites under, which is now two things rather than one: every leg under `UTC`, and the web alone a second
 * pass under `America/New_York`. The second zone was every leg's until the card of 2026-10-21 measured what it bought — local time is
 * read in `apps/web/src/lib` and nowhere else in this repository, and in 54 `ci` runs the New York pass never failed on its own — so
 * the condition on that step is what keeps four legs from paying for a zone their code cannot read, and the sentences below are what
 * refuses dropping it from the web, widening it back to every leg, or adding a third zone nothing here can account for.
 *
 * A run that does not pass `--force` is the invisible one: `turbo.json` hashes no environment, so it replays the run before it from the
 * cache and that timezone is never tested at all.
 */
function zoneDrift(workflow: Workflow): string[] {
  const runs = suiteRuns(workflow);
  const sentences: string[] = [];
  const every = runs.filter((run) => run.zone === ZONE_EVERY);
  if (every.length === 0)
    sentences.push(
      `the ${LEGS} job in ${FILE} does not run its suite under TZ=${ZONE_EVERY}: give it a run step of the suite with env TZ: ${ZONE_EVERY} and no if:, or a leg reports green having run no suite at all`,
    );
  sentences.push(
    ...every
      .filter((run) => run.if !== undefined)
      .map(
        (run) =>
          `the ${LEGS} job's suite run under TZ=${ZONE_EVERY} in ${FILE} is conditioned on if: ${String(run.if)}: every leg runs its suite under ${ZONE_EVERY}, so take the condition off, or the legs it leaves out report green having run nothing`,
      ),
  );
  const local = runs.filter((run) => run.zone === ZONE_LOCAL);
  if (local.length === 0)
    sentences.push(
      `the ${LEGS} job in ${FILE} does not run its suite under TZ=${ZONE_LOCAL}: give it a run step of the suite with env TZ: ${ZONE_LOCAL} and if: ${LOCAL_IF}, or a test of the ${LOCAL_LEG}'s local-time code passes CI and fails on a machine in another zone`,
    );
  sentences.push(
    ...local
      .filter((run) => run.if !== LOCAL_IF)
      .map(
        (run) =>
          `the ${LEGS} job's suite run under TZ=${ZONE_LOCAL} in ${FILE} is conditioned on ${run.if === undefined ? 'nothing' : `if: ${run.if}`}, not on if: ${LOCAL_IF}: ${LOCAL_LEG} is the one workspace of this repository whose code reads local time, so write if: ${LOCAL_IF} on that step, or the other legs run their suites twice for a zone they cannot read`,
      ),
  );
  sentences.push(
    ...runs
      .filter((run) => run.zone !== ZONE_EVERY && run.zone !== ZONE_LOCAL)
      .map(
        (run) =>
          `the ${LEGS} job in ${FILE} runs its suite under TZ=${String(run.zone)}, a zone this file knows nothing about: the legs run under ${ZONE_EVERY}, and ${LOCAL_LEG} alone a second pass under ${ZONE_LOCAL} — take the step off, or say in docs/plan-github-ci.md why a third zone is tested and hold it here`,
      ),
  );
  sentences.push(
    ...runs
      .filter((run) => !run.forced)
      .map(
        (run) =>
          `the ${LEGS} job's suite run under TZ=${String(run.zone)} in ${FILE} does not pass --force: turbo hashes no environment, so it replays the run before it from the cache and that timezone is never tested`,
      ),
  );
  return sentences;
}

/**
 * A set of shards that does not tile the suite it splits, a shard written in a form `node --test-shard` does not take, a workspace whose
 * `test` script cannot take a shard at all, and a suite run that does not hand the leg's own shard through the environment.
 *
 * Each is green on GitHub while testing less than it claims. Shards `1/2` alone leave half the files run by nobody; a script with no
 * hole for the fraction runs the whole suite under both legs, which is slower than before and reports two halves it never ran; and the
 * fraction cannot be appended from outside the script — node takes its file patterns off argv past the first positional, so a turbo
 * `-- --test-shard=1/2` arrives as a glob that matches nothing.
 */
function legShardDrift(workflow: Workflow, workspaces: Workspace[]): string[] {
  const expanded = legs(workflow);
  const sentences: string[] = [];
  const sharded = new Set<unknown>();
  // Grouped by the leg a shard splits: one workspace on one node. A group whose shards do not read as fractions is reported for that
  // alone, since nothing can be said about whether unreadable fractions tile.
  const groups = new Map<string, Leg[]>();
  for (const leg of expanded) {
    const key = `${String(leg.workspace)} on node ${String(leg.node)}`;
    groups.set(key, [...(groups.get(key) ?? []), leg]);
  }
  for (const [key, group] of groups) {
    const named = group.filter((leg) => leg.shard !== undefined);
    if (named.length === 0) continue;
    sharded.add(group[0].workspace);
    const unreadable = named.filter((leg) => typeof leg.shard !== 'string' || !FRACTION.test(leg.shard));
    if (unreadable.length > 0) {
      sentences.push(
        ...unreadable.map(
          (leg) =>
            `the leg for ${key} in ${FILE} names shard ${JSON.stringify(leg.shard)}, which is not <i>/<n>: node --test-shard takes the index of a count, both counting from one, so write it '1/2', or take the shard off the leg and run its suite whole`,
        ),
      );
      continue;
    }
    const have = named.map((leg) => leg.shard as string);
    const total = Number(FRACTION.exec(have[0])![2]);
    const want = Array.from({ length: total }, (_shard, i) => `${i + 1}/${total}`);
    if (have.length !== want.length || want.some((shard, i) => shard !== have[i]))
      sentences.push(
        `the legs for ${key} in ${FILE} run shards ${JSON.stringify(have)}, which do not tile ${want.join(' … ')} in order: a shard no leg names is a part of that suite run by nobody, so give it a leg for each of ${want.join(' … ')}, or write no shard and run the suite whole`,
      );
    if (group.length !== named.length)
      sentences.push(
        `the legs for ${key} in ${FILE} are ${group.length}, of which ${named.length} name a shard: a leg beside the shards runs the whole suite again, so give every leg of that workspace and node a shard of its own, or none of them one`,
      );
  }
  if (sharded.size === 0) return sentences;
  // The script that has to take the shard, and the env that has to carry it: asked only of a file that shards something today, so a
  // card that takes the shards off is not then held to a hole and a variable nothing reads.
  for (const name of sharded) {
    const workspace = workspaces.find((each) => each.name === name);
    if (workspace === undefined) continue;
    if (workspace.test === undefined || !workspace.test.includes(SHARD_HOLE) || workspace.test.indexOf(SHARD_HOLE) > workspace.test.indexOf("'"))
      sentences.push(
        `${workspace.name}'s legs in ${FILE} run shards of its suite and its test script cannot take one: write ${SHARD_HOLE} into that script, after --test and before its globs — node stops reading options at the first pattern, so a flag appended from outside is read as a file pattern — or every shard runs the whole suite and the leg reports a half it never ran`,
      );
  }
  for (const run of suiteRuns(workflow)) {
    if (run.shard === undefined)
      sentences.push(
        `the ${LEGS} job's suite run under TZ=${String(run.zone)} in ${FILE} is not given ${SHARD_ENV}: ${SHARD_VALUE} in its env: without it the script's shard hole expands to nothing and every shard leg runs the whole suite`,
      );
    else if (run.shard !== SHARD_VALUE)
      sentences.push(
        `the ${LEGS} job's suite run under TZ=${String(run.zone)} in ${FILE} is given ${SHARD_ENV}: ${run.shard}, not ${SHARD_VALUE}: every leg would run that one shard, and the rest of each suite is run by nobody`,
      );
  }
  return sentences;
}

/**
 * A leg name that does not name the shard. Two halves of one workspace's suite on one node then read alike in the run's summary, and a
 * person reading a red `ci` cannot tell which half failed — nor the two apart in the timings this card was measured from.
 */
function nameDrift(workflow: Workflow): string[] {
  if (!legs(workflow).some((leg) => leg.shard !== undefined)) return [];
  const name = workflow.jobs[LEGS]?.name ?? '';
  return name.includes(SHARD_VALUE)
    ? []
    : [
        `the ${LEGS} job's name in ${FILE} does not name ${SHARD_VALUE}: two shards of one workspace on one node then read alike in the run's summary, and a person cannot tell which half failed`,
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

/** Where the runtime writes its deliberate stub secrets, the one file the scan's allowlist may name. */
const STUBS = 'packages/agent-runtime/test/remote-agent.test.ts';

/**
 * A stub secret of that file: a word, four hex digits and SECRET, which is how the runtime's test writes a token nobody can use. A bare
 * `'SECRET'` is not one — gitleaks flags a string by its entropy, and that has none.
 */
const stubSecrets = (): string[] =>
  [...fs.readFileSync(path.join(ROOT, STUBS), 'utf8').matchAll(/'([a-z]+-[\da-f]{4}-SECRET[^'\n]*)'/g)].map((found) => found[1]);

/** What the scan is configured by, or an empty string where the file is not there, which is a drift of its own. */
const readConfig = (): string => {
  const file = path.join(ROOT, SCAN_CONFIG);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
};

/**
 * What the one allowlist of `SCAN_CONFIG` names, read off its own text: the files it is scoped to, and the shapes it allows in them.
 * Each array is read greedily to the last bracket of its line, since a regex of its own holds brackets and a lazy or negated class
 * would end the array inside one.
 */
function readAllowlist(text: string): { paths: string[]; regexes: string[] } {
  const listed = (key: string): string[] => {
    const array = new RegExp(`^${key} = \\[(.*)\\]$`, 'm').exec(text)?.[1] ?? '';
    return [...array.matchAll(/'([^']*)'/g)].map((found) => found[1]);
  };
  return { paths: listed('paths'), regexes: listed('regexes') };
}

/** The one gitleaks rule the allowlist is scoped to: the rule that flags the stub secrets, by their entropy. */
const RULE = 'generic-api-key';

/** Each table of `SCAN_CONFIG` in order, by its header, with the key lines under it, the comments left out. */
const blocks = (text: string): { header: string; lines: string[] }[] => {
  const found: { header: string; lines: string[] }[] = [];
  for (const line of text.split('\n').map((line) => line.trim())) {
    if (line === '' || line.startsWith('#')) continue;
    const header = /^\[\[?([\w.]+)\]\]?$/.exec(line);
    if (header !== null) found.push({ header: header[1], lines: [] });
    else if (found.length > 0) found[found.length - 1].lines.push(line);
  }
  return found;
};

/**
 * How the one allowlist is nested and joined, which is what no reading of this file can tell and what went wrong: a top-level
 * `[[allowlists]]` is global, and a global allowlist's `paths` entry skips the whole file whatever its `condition`, so the file allows
 * every secret in `STUBS` while its own comment says it allows two shapes. Nested under a `[[rules]]` block naming the rule it is
 * scoped to that rule alone — and because gitleaks appends an allowlist array and replaces every other attribute, the block must carry
 * its `id` and nothing else, or the default rule is replaced by one that detects nothing.
 *
 * `condition` is the same failure one key lower, and the default is the wrong one: without `condition = "AND"` a rule allowlist joins
 * its criteria with OR, so `paths` alone allows a finding and `regexes` alone does too — the whole file allowed for that rule, and a
 * stub's shape allowed anywhere in the repository. The file would read exactly as it does now.
 */
function formDrift(text: string): string[] {
  const found = blocks(text);
  if (found.some((block) => block.header === 'allowlists'))
    return [
      `${SCAN_CONFIG} holds a top-level [[allowlists]]: a global allowlist's paths entry skips the whole file whatever its condition, so every secret in ${STUBS} is allowed and a real one pasted in beside the stubs goes through. Nest it instead as [[rules.allowlists]] under a [[rules]] block carrying id = "${RULE}", which scopes it to that one rule`,
    ];
  const rules = found.filter((block) => block.header === 'rules');
  const rule = rules.find((block) => block.lines.includes(`id = "${RULE}"`));
  if (rules.length !== 1 || rule === undefined || found.filter((block) => block.header === 'rules.allowlists').length !== 1)
    return [
      `${SCAN_CONFIG} does not nest one [[rules.allowlists]] under one [[rules]] block carrying id = "${RULE}": write it that way, or the allowlist is global and skips every secret in the file its paths names rather than the two shapes it lists`,
    ];
  if (found.find((block) => block.header === 'rules.allowlists')?.lines.includes('condition = "AND"') !== true)
    return [
      `${SCAN_CONFIG}'s [[rules.allowlists]] does not carry condition = "AND": a rule allowlist joins its criteria with OR by default, so paths alone allows a finding and regexes alone allows one too — every generic key in ${STUBS} allowed, and a stub's shape allowed anywhere in the repository. Write condition = "AND", which allows a finding only where its path and its shape both match`,
    ];
  return rule.lines
    .map((line) => /^([\w-]+)\s*=/.exec(line)?.[1])
    .filter((key) => key !== undefined && key !== 'id')
    .map(
      (key) =>
        `${SCAN_CONFIG}'s [[rules]] block carries ${key} beside its id: gitleaks appends an allowlist array but replaces every other attribute of a rule, so the default ${RULE} rule becomes one that detects nothing and the scan goes blind to every generic key in the repository. Take ${key} out, leaving the id and the [[rules.allowlists]] block under it`,
    );
}

/**
 * An allowlist that has drifted from the file it was written for. Both ways are invisible: a shape no longer matched turns the scan red
 * on a stub nobody can use, and an unanchored shape allows a real secret that happens to hold one — the whole job reporting green over
 * a leak.
 */
function allowDrift(text: string, stubs: readonly string[]): string[] {
  if (text === '') return [];
  const form = formDrift(text);
  if (form.length > 0) return form;
  const { paths, regexes } = readAllowlist(text);
  const sentences: string[] = [];
  if (paths.length !== 1 || !paths[0].includes(STUBS.replaceAll('.', '\\.')))
    sentences.push(
      `the allowlist in ${SCAN_CONFIG} is scoped to ${JSON.stringify(paths)}, not to ${STUBS} alone: it is the one file of this repository that may hold a stub secret, so scope the allowlist to it with paths = ['${STUBS.replaceAll('.', '\\.')}$'] and nothing wider`,
    );
  return [
    ...sentences,
    ...regexes
      .filter((regex) => !(regex.startsWith('^') && regex.endsWith('$')))
      .map(
        (regex) =>
          `the allowlist in ${SCAN_CONFIG} holds ${regex}, anchored at neither end: write it ^${regex}$, or a real secret that happens to hold a stub's shape is allowed along with it`,
      ),
    ...stubs
      .filter((stub) => !regexes.some((regex) => new RegExp(regex).test(stub)))
      .map(
        (stub) =>
          `${STUBS} writes the stub secret ${stub}, which no regex in ${SCAN_CONFIG} matches: add its shape to the allowlist, anchored at both ends, or the ${SCAN} job refuses every push over a secret nobody can use`,
      ),
  ];
}

/** The flags the scan must carry: the range of new commits, the redaction a public log needs, and the allowlist above. */
const SCAN_FLAGS = ['--log-opts', '--redact', '--exit-code 2', `--config ${SCAN_CONFIG}`];

/** A download URL that pins the version it takes, through the step's own env, rather than a tag that floats to the latest release. */
const PINNED = /gitleaks\/releases\/download\/v\$\{VERSION\}\//;

/**
 * A scan job that is not there, takes its binary unpinned or unchecked, scans without its allowlist or over the whole history, or whose
 * checkout is shallow. The last reads as a scan and is none: the range names the commit before this push, which the shallow default has
 * not, so git refuses the range and the job that was to find a secret finds nothing.
 */
function scanDrift(workflow: Workflow, config: string): string[] {
  const job = workflow.jobs[SCAN];
  if (job === undefined)
    return [
      `${FILE} has no ${SCAN} job: add the job that downloads gitleaks at a pinned version, checks it against that release's sha256 and scans the push's new commits with --config ${SCAN_CONFIG}, or a secret committed to a public repository is noticed by nobody`,
    ];
  const sentences: string[] = [];
  if (config === '')
    sentences.push(
      `${SCAN_CONFIG} is not in this repository, so the ${SCAN} job scans with gitleaks' own rules alone: write it, allowing the stub secrets of ${STUBS} and nothing else, or every push is refused over them`,
    );
  const runs = runSteps(workflow, SCAN)
    .map((step) => `${step.run ?? ''}\n${Object.values(step.env ?? {}).join('\n')}`)
    .join('\n');
  if (!PINNED.test(runs))
    sentences.push(
      `the ${SCAN} job in ${FILE} does not download gitleaks from a release pinned by \${VERSION}: write the URL .../releases/download/v\${VERSION}/..., with the version in the step's env, or a release that moves under it moves what CI refuses`,
    );
  if (!runs.includes('sha256sum --check') || !/[\da-f]{64}/.test(runs))
    sentences.push(
      `the ${SCAN} job in ${FILE} does not check the download against a sha256: give the step env SHA256 with the 64-digit hash from that release's gitleaks_<version>_checksums.txt and pipe it to \`sha256sum --check --strict -\`, or a third party's bytes run here unverified`,
    );
  if (allowlistStep(workflow) === undefined)
    sentences.push(
      `the ${SCAN} job in ${FILE} has no step named "${ALLOWLIST_STEP}": add back the step that scans a fixture with the pinned binary, with ${SCAN_CONFIG} and without it, and refuses unless the stub shapes are allowed at their one path and nothing else is. It is the only thing that proves what ${SCAN_CONFIG} allows, since a configuration's meaning is not in its text`,
    );
  sentences.push(
    ...SCAN_FLAGS.filter((flag) => !runs.includes(flag)).map(
      (flag) =>
        `the ${SCAN} job's scan in ${FILE} does not pass ${flag}: add it to the gitleaks command, or the scan reads the whole history instead of this push's commits, allows what ${SCAN_CONFIG} says it allows, or prints a found secret into a public run's log`,
    ),
  );
  if ((job.steps ?? []).find((step) => step.uses?.startsWith('actions/checkout') === true)?.with?.['fetch-depth'] !== 0)
    sentences.push(
      `the ${SCAN} job's checkout in ${FILE} does not pass fetch-depth: 0: the range names the commit before this push, which the shallow default has not, so git refuses the range and the job fails having scanned nothing`,
    );
  return sentences;
}

/** Every clause, over the shipped file. */
const drift = (
  workflow: Workflow,
  workspaces: Workspace[],
  engine: string,
  text: string,
  pages: readonly string[],
  config: string,
  stubs: readonly string[],
): string[] => [
  ...legDrift(workflow, workspaces),
  ...includeDrift(workflow),
  ...nodeDrift(workflow, engine),
  ...legShardDrift(workflow, workspaces),
  ...nameDrift(workflow),
  ...pinDrift(workflow, engine),
  ...hiddenDrift(workflow),
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
  ...scanDrift(workflow, config),
  ...allowDrift(config, stubs),
];

test('the shipped CI workflow agrees with the repository it checks', () => {
  const workspaces = readWorkspaces();
  assert.ok(workspaces.length >= 4, `the scan read ${workspaces.length} workspaces: the repository has more, so the clauses read nothing`);
  assert.ok(
    workspaces.filter((workspace) => workspace.suite).length >= 4,
    'the scan found fewer than four workspaces with a test script: the leg clause reads nothing',
  );
  assert.equal(
    legs(readWorkflow()).length,
    12,
    'the matrix expands to twelve legs today: four workspaces on two nodes, and the orchestrator in two shards on each — a clause reading an empty matrix or an unexpanded include would bless the file having read nothing',
  );
  const pages = readPages();
  assert.ok(pages.length > 100, `${NAMES_PATH} names ${pages.length} pages: the shard clause reads a list that is not the e2e's`);
  const stubs = stubSecrets();
  assert.equal(stubs.length, 3, `${STUBS} writes ${stubs.length} stub secrets today, and every one of them is held by a clause`);
  assert.deepEqual(drift(readWorkflow(), workspaces, readEngine(), workflowText(), pages, readConfig(), stubs), []);
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

test('REFUSED: a workspace with no leg, a leg with no workspace, a node floor adrift, an unquoted node, a job pinned off the floor and one unpinned, a hidden path uploaded as if it were not, a job outside the gate, a third party, a timezone untested, a run unforced, a landing cancelled, a fork with a writable token', () => {
  const workspaces = readWorkspaces();
  const engine = readEngine();
  const text = workflowText();
  const shipped = readWorkflow(text);

  const matrixOf = (workflow: Workflow): Record<string, unknown[]> => {
    const matrix = workflow.jobs[LEGS]?.strategy?.matrix;
    assert.ok(matrix !== undefined, `the ${LEGS} job has a matrix today`);
    return matrix;
  };

  /** The node every leg of the shipped file runs beside 24: moved on the axis and on the include entries together, as a card would. */
  const renode = (workflow: Workflow, to: unknown): void => {
    const matrix = matrixOf(workflow);
    matrix.node = [to, '24'];
    for (const entry of matrix.include as { node?: unknown }[]) if (entry.node === '24.16.0') entry.node = to;
  };

  const dropped = structuredClone(shipped);
  const without = legWorkspaces(dropped).filter((leg) => leg !== 'docs');
  assert.equal(without.length, legWorkspaces(dropped).length - 1, 'docs is a leg today');
  matrixOf(dropped).workspace = without;
  assert.deepEqual(legDrift(dropped, workspaces), [
    "docs has a test script and no leg in .github/workflows/ci.yml: add docs to the test job's matrix.workspace, or to its matrix.include with a shard of its own, or CI reports green having never run its suite",
  ]);

  const unincluded = structuredClone(shipped);
  assert.equal((matrixOf(unincluded).include ?? []).length, 4, "the orchestrator's four shard legs arrive through include today");
  matrixOf(unincluded).include = [];
  assert.deepEqual(
    legDrift(unincluded, workspaces),
    [
      "agent-orchestrator has a test script and no leg in .github/workflows/ci.yml: add agent-orchestrator to the test job's matrix.workspace, or to its matrix.include with a shard of its own, or CI reports green having never run its suite",
    ],
    'the clause reads the include entries as legs: with them gone the orchestrator has none, and it is on the axis nowhere',
  );

  const extra = structuredClone(shipped);
  matrixOf(extra).workspace = [...legWorkspaces(extra), 'legacy'];
  assert.deepEqual(legDrift(extra, workspaces), [
    "the test job's matrix in .github/workflows/ci.yml names legacy, which is no workspace of this repository: take it off the matrix, or add the workspace it means",
  ]);

  const adrift = structuredClone(shipped);
  renode(adrift, '22.19.0');
  assert.deepEqual(nodeDrift(adrift, '>=22.18.0'), [
    "the test job's matrix.node in .github/workflows/ci.yml does not test 22.18.0, the floor engines.node claims in package.json: add '22.18.0' to the matrix, or lower engines.node to a version the matrix tests",
  ]);
  for (const unreadable of ['22', '*', '^22.18.0'])
    assert.deepEqual(nodeDrift(shipped, unreadable), [
      `engines.node in package.json reads ${unreadable}, which names no floor to test: write it >=<major>.<minor>.<patch>, so the matrix can be held to the version the package claims to run on`,
    ]);

  const unquoted = structuredClone(shipped);
  renode(unquoted, 22.18);
  assert.deepEqual(nodeDrift(unquoted, engine), [
    "the test job's matrix.node in .github/workflows/ci.yml holds 22.18 unquoted: YAML reads it as a number and setup-node then installs another version, so write it '22.18'",
    "the test job's matrix.node in .github/workflows/ci.yml does not test 24.16.0, the floor engines.node claims in package.json: add '24.16.0' to the matrix, or lower engines.node to a version the matrix tests",
  ]);

  const halfnoded = structuredClone(shipped);
  matrixOf(halfnoded).include = (matrixOf(halfnoded).include as { node?: unknown }[]).filter((entry) => entry.node !== '24');
  assert.deepEqual(
    nodeDrift(halfnoded, engine),
    [
      "agent-orchestrator's legs in .github/workflows/ci.yml do not run on node 24, which the test job's matrix.node names: give it a leg on every node the matrix names, or a workspace is tested on one version while the matrix claims two",
    ],
    'an include entry is written by hand, one per node, so a workspace that arrived through include can lose a node without a word',
  );

  const setupOf = (workflow: Workflow, job: string): Step => {
    const step = (workflow.jobs[job]?.steps ?? []).find((each) => each.uses?.startsWith(SETUP_NODE));
    assert.ok(step?.with !== undefined, `the ${job} job pins its node through setup-node today`);
    return step;
  };

  const lowered = structuredClone(shipped);
  setupOf(lowered, 'lint').with!['node-version'] = '22.18.0';
  assert.deepEqual(pinDrift(lowered, '>=24.16.0'), [
    "the lint job in .github/workflows/ci.yml runs on node 22.18.0, not 24.16.0, the floor engines.node claims in package.json: every job but the legs runs this repository's code on its floor, so write node-version: '24.16.0', or npm ci refuses the job with EBADENGINE",
  ]);

  const unpinned = structuredClone(shipped);
  delete setupOf(unpinned, BUILD).with!['node-version'];
  assert.deepEqual(pinDrift(unpinned, '>=24.16.0'), [
    "the build job in .github/workflows/ci.yml pins no node-version, so it runs on whatever node the runner happens to ship: give its actions/setup-node step node-version: '24.16.0', the floor engines.node claims in package.json",
  ]);

  assert.deepEqual(
    pinDrift(shipped, '>=24.16.0'),
    [],
    "the legs' node-version is an expression off the matrix, which pinDrift leaves to nodeDrift rather than reading as a pin",
  );

  const shown = structuredClone(shipped);
  const uploads = (shown.jobs[E2E]?.steps ?? []).filter((step) => step.uses?.startsWith(UPLOAD));
  assert.equal(uploads.length, 2, 'the e2e job uploads its page times and its failing pages today');
  for (const upload of uploads) delete upload.with!['include-hidden-files'];
  assert.deepEqual(hiddenDrift(shown), [
    'the e2e job in .github/workflows/ci.yml uploads .e2e/pages-*.json, a hidden path, without include-hidden-files: actions/upload-artifact skips a dotted path by default, so write include-hidden-files: true beside the path, or the upload keeps nothing',
    'the e2e job in .github/workflows/ci.yml uploads .e2e/*.png, a hidden path, without include-hidden-files: actions/upload-artifact skips a dotted path by default, so write include-hidden-files: true beside the path, or the upload keeps nothing',
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

  const stepsOf = (workflow: Workflow): Step[] => {
    const steps = workflow.jobs[LEGS]?.steps;
    assert.ok(steps !== undefined, `the ${LEGS} job has steps today`);
    return steps;
  };
  const runOf = (workflow: Workflow, zone: string): Step => {
    const step = stepsOf(workflow).find((each) => each.env?.TZ === zone);
    assert.ok(step !== undefined, `the ${LEGS} job runs its suite under TZ=${zone} today`);
    return step;
  };

  assert.equal(suiteRuns(shipped).length, 2, 'the leg has two suite runs today, the second of them the web leg alone');

  const onezone = structuredClone(shipped);
  onezone.jobs[LEGS].steps = stepsOf(onezone).filter((step) => step.env?.TZ !== 'America/New_York');
  assert.deepEqual(zoneDrift(onezone), [
    "the test job in .github/workflows/ci.yml does not run its suite under TZ=America/New_York: give it a run step of the suite with env TZ: America/New_York and if: matrix.workspace == 'web', or a test of the web's local-time code passes CI and fails on a machine in another zone",
  ]);

  const nozone = structuredClone(shipped);
  nozone.jobs[LEGS].steps = stepsOf(nozone).filter((step) => step.env?.TZ !== 'UTC');
  assert.deepEqual(zoneDrift(nozone), [
    'the test job in .github/workflows/ci.yml does not run its suite under TZ=UTC: give it a run step of the suite with env TZ: UTC and no if:, or a leg reports green having run no suite at all',
  ]);

  const everyleg = structuredClone(shipped);
  delete runOf(everyleg, 'America/New_York').if;
  assert.deepEqual(
    zoneDrift(everyleg),
    [
      "the test job's suite run under TZ=America/New_York in .github/workflows/ci.yml is conditioned on nothing, not on if: matrix.workspace == 'web': web is the one workspace of this repository whose code reads local time, so write if: matrix.workspace == 'web' on that step, or the other legs run their suites twice for a zone they cannot read",
    ],
    'the second zone unconditioned is the cost this card took off: four legs paying a second pass for a zone no code of theirs reads',
  );

  const otherleg = structuredClone(shipped);
  runOf(otherleg, 'America/New_York').if = "matrix.workspace == 'api'";
  assert.deepEqual(zoneDrift(otherleg), [
    "the test job's suite run under TZ=America/New_York in .github/workflows/ci.yml is conditioned on if: matrix.workspace == 'api', not on if: matrix.workspace == 'web': web is the one workspace of this repository whose code reads local time, so write if: matrix.workspace == 'web' on that step, or the other legs run their suites twice for a zone they cannot read",
  ]);

  const conditioned = structuredClone(shipped);
  runOf(conditioned, 'UTC').if = "matrix.workspace == 'web'";
  assert.deepEqual(zoneDrift(conditioned), [
    "the test job's suite run under TZ=UTC in .github/workflows/ci.yml is conditioned on if: matrix.workspace == 'web': every leg runs its suite under UTC, so take the condition off, or the legs it leaves out report green having run nothing",
  ]);

  const third = structuredClone(shipped);
  const tokyo = structuredClone(runOf(third, 'UTC'));
  tokyo.name = 'test under TZ=Asia/Tokyo';
  tokyo.env = { ...tokyo.env, TZ: 'Asia/Tokyo' };
  stepsOf(third).push(tokyo);
  assert.deepEqual(zoneDrift(third), [
    'the test job in .github/workflows/ci.yml runs its suite under TZ=Asia/Tokyo, a zone this file knows nothing about: the legs run ' +
      "under UTC, and web alone a second pass under America/New_York — take the step off, or say in docs/plan-github-ci.md why a third " +
      'zone is tested and hold it here',
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

test("REFUSED: an include entry the axis already names, one with no node or no workspace, shards that do not tile, a shard that is no fraction, a leg beside the shards, a test script with no hole for one, a suite run not given the shard or given a literal, and a job name that does not name it", () => {
  const shipped = readWorkflow();
  const workspaces = readWorkspaces();
  assert.deepEqual(includeDrift(shipped), [], "the orchestrator's include entries each make a leg of their own today");
  assert.deepEqual(legShardDrift(shipped, workspaces), [], 'the two shards tile the suite, the script takes one and both runs hand it on today');
  assert.deepEqual(nameDrift(shipped), [], "the leg's name names its shard today");

  const includeOf = (workflow: Workflow): Record<string, unknown>[] => {
    const include = workflow.jobs[LEGS]?.strategy?.matrix?.include as Record<string, unknown>[] | undefined;
    assert.equal(include?.length, 4, "the orchestrator's four shard legs arrive through include today");
    return include;
  };

  const merged = structuredClone(shipped);
  includeOf(merged).push({ workspace: 'web', node: '24.16.0', shard: '1/2' });
  assert.deepEqual(
    includeDrift(merged),
    [
      "the test job's matrix.include in .github/workflows/ci.yml holds an entry for web, which matrix.workspace already names: GitHub " +
        "adds such an entry's keys to the matching combinations instead of making a leg of its own, so its shard would be added to an " +
        'existing leg rather than splitting it — take web off matrix.workspace, or the entry off include',
    ],
    'the whole reading of the matrix rests on GitHub making a leg of an entry that contradicts an axis: an entry the axis agrees with ' +
      'is merged into its legs instead, and the shard it carries would be handed to a leg that runs the suite whole',
  );

  const nodeless = structuredClone(shipped);
  delete includeOf(nodeless)[0].node;
  assert.deepEqual(includeDrift(nodeless), [
    "the test job's matrix.include entry for agent-orchestrator in .github/workflows/ci.yml names no node: an entry that contradicts " +
      "one axis and leaves another open is one leg, not one per node, so write node: '24.16.0' on it — one entry per node the matrix names",
  ]);

  const nameless = structuredClone(shipped);
  delete includeOf(nameless)[0].workspace;
  assert.deepEqual(includeDrift(nameless), [
    "the test job's matrix.include in .github/workflows/ci.yml has an entry (1 of 4) that names no workspace: GitHub adds such an " +
      "entry's keys to every combination of the matrix instead of making a leg of its own, so give it workspace: <the workspace it is " +
      'a shard of>, or take it off include',
  ]);

  const half = structuredClone(shipped);
  includeOf(half).splice(1, 1);
  assert.deepEqual(
    legShardDrift(half, workspaces),
    [
      'the legs for agent-orchestrator on node 24.16.0 in .github/workflows/ci.yml run shards ["1/2"], which do not tile 1/2 … 2/2 in ' +
        'order: a shard no leg names is a part of that suite run by nobody, so give it a leg for each of 1/2 … 2/2, or write no shard ' +
        'and run the suite whole',
    ],
    'the invisible one: the leg reports green having run half the suite, and says 1/2 in its name while the other half is run by nobody',
  );

  const untiled = structuredClone(shipped);
  includeOf(untiled)[1].shard = '3/2';
  assert.deepEqual(legShardDrift(untiled, workspaces), [
    'the legs for agent-orchestrator on node 24.16.0 in .github/workflows/ci.yml run shards ["1/2","3/2"], which do not tile 1/2 … ' +
      '2/2 in order: a shard no leg names is a part of that suite run by nobody, so give it a leg for each of 1/2 … 2/2, or write no ' +
      'shard and run the suite whole',
  ]);

  for (const value of ['half', '1 of 2', 2]) {
    const unreadable = structuredClone(shipped);
    includeOf(unreadable)[1].shard = value;
    assert.deepEqual(legShardDrift(unreadable, workspaces), [
      `the leg for agent-orchestrator on node 24.16.0 in .github/workflows/ci.yml names shard ${JSON.stringify(value)}, which is not ` +
        "<i>/<n>: node --test-shard takes the index of a count, both counting from one, so write it '1/2', or take the shard off the " +
        'leg and run its suite whole',
    ]);
  }

  const beside = structuredClone(shipped);
  includeOf(beside).push({ workspace: 'agent-orchestrator', node: '24.16.0' });
  assert.deepEqual(
    legShardDrift(beside, workspaces),
    [
      'the legs for agent-orchestrator on node 24.16.0 in .github/workflows/ci.yml are 3, of which 2 name a shard: a leg beside the ' +
        'shards runs the whole suite again, so give every leg of that workspace and node a shard of its own, or none of them one',
    ],
    'an entry whose shard was forgotten runs the whole suite beside its own halves, which is the slowest the job has ever been and ' +
      'reads in the summary exactly like a third half',
  );

  const holeless = workspaces.map((workspace) =>
    workspace.name === 'agent-orchestrator'
      ? { ...workspace, test: workspace.test?.replace(' ${WF_TEST_SHARD:+--test-shard=$WF_TEST_SHARD}', '') }
      : workspace,
  );
  assert.notDeepEqual(holeless, workspaces, "the orchestrator's test script carries the shard hole today");
  assert.deepEqual(
    legShardDrift(shipped, holeless),
    [
      "agent-orchestrator's legs in .github/workflows/ci.yml run shards of its suite and its test script cannot take one: write " +
        '${WF_TEST_SHARD:+--test-shard=$WF_TEST_SHARD} into that script, after --test and before its globs — node stops reading ' +
        'options at the first pattern, so a flag appended from outside is read as a file pattern — or every shard runs the whole suite ' +
        'and the leg reports a half it never ran',
    ],
    'the hole is the whole route the fraction travels: without it both halves run the whole suite, slower than one pass was, each ' +
      'reporting a half it never ran',
  );

  const late = workspaces.map((workspace) =>
    workspace.name === 'agent-orchestrator'
      ? {
          ...workspace,
          test: workspace.test?.replace(' ${WF_TEST_SHARD:+--test-shard=$WF_TEST_SHARD}', '') + ' ${WF_TEST_SHARD:+--test-shard=$WF_TEST_SHARD}',
        }
      : workspace,
  );
  assert.equal(
    legShardDrift(shipped, late).length,
    1,
    'the hole after the globs is read by node as a file pattern, not as a flag, so a script that holds it there cannot take a shard either',
  );

  const unhanded = structuredClone(shipped);
  const utc = (unhanded.jobs[LEGS]?.steps ?? []).find((step) => step.env?.TZ === 'UTC');
  assert.ok(utc?.env !== undefined, 'the UTC run is given its environment today');
  delete utc.env.WF_TEST_SHARD;
  assert.deepEqual(legShardDrift(unhanded, workspaces), [
    "the test job's suite run under TZ=UTC in .github/workflows/ci.yml is not given WF_TEST_SHARD: ${{ matrix.shard }} in its env: " +
      "without it the script's shard hole expands to nothing and every shard leg runs the whole suite",
  ]);

  const literal = structuredClone(shipped);
  const run = (literal.jobs[LEGS]?.steps ?? []).find((step) => step.env?.TZ === 'UTC');
  run!.env!.WF_TEST_SHARD = '1/2';
  assert.deepEqual(legShardDrift(literal, workspaces), [
    "the test job's suite run under TZ=UTC in .github/workflows/ci.yml is given WF_TEST_SHARD: 1/2, not ${{ matrix.shard }}: every " +
      'leg would run that one shard, and the rest of each suite is run by nobody',
  ]);

  const unnamed = structuredClone(shipped);
  const name = unnamed.jobs[LEGS]?.name;
  assert.ok(name?.includes('${{ matrix.shard }}') === true, "the leg's name names its shard today");
  unnamed.jobs[LEGS].name = name.replace(' ${{ matrix.shard }}', '');
  assert.deepEqual(nameDrift(unnamed), [
    "the test job's name in .github/workflows/ci.yml does not name ${{ matrix.shard }}: two shards of one workspace on one node then " +
      "read alike in the run's summary, and a person cannot tell which half failed",
  ]);

  const unsharded = structuredClone(unnamed);
  unsharded.jobs[LEGS].strategy!.matrix!.include = [];
  assert.deepEqual(
    nameDrift(unsharded),
    [],
    'the shard is asked of the name only while a leg names one: a card that takes the shards off is not held to a name that reads an ' +
      'empty expression',
  );
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

test('REFUSED: no scan job, a download unpinned or unchecked, a scan without its flags, a shallow checkout, a self-check dropped, and an allowlist global, unnested or adrift', () => {
  const shipped = readWorkflow();
  const config = readConfig();
  const stubs = stubSecrets();
  assert.deepEqual(scanDrift(shipped, config), [], 'the scan job is pinned, checked, flagged and deep today');
  assert.deepEqual(allowDrift(config, stubs), [], "the allowlist matches each of the file's stub secrets today");

  const unscanned = structuredClone(shipped);
  delete unscanned.jobs[SCAN];
  assert.deepEqual(scanDrift(unscanned, config), [
    `.github/workflows/ci.yml has no gitleaks job: add the job that downloads gitleaks at a pinned version, checks it against that release's sha256 and scans the push's new commits with --config ${SCAN_CONFIG}, or a secret committed to a public repository is noticed by nobody`,
  ]);

  assert.deepEqual(scanDrift(shipped, ''), [
    `${SCAN_CONFIG} is not in this repository, so the gitleaks job scans with gitleaks' own rules alone: write it, allowing the stub secrets of ${STUBS} and nothing else, or every push is refused over them`,
  ]);

  const floating = structuredClone(shipped);
  const download = runSteps(floating, SCAN)[0];
  assert.ok(download?.run?.includes('releases/download/v${VERSION}/') === true, 'the download pins its version today');
  download.run = download.run.replace('download/v${VERSION}/', 'latest/download/');
  assert.deepEqual(scanDrift(floating, config), [
    'the gitleaks job in .github/workflows/ci.yml does not download gitleaks from a release pinned by ${VERSION}: write the URL ' +
      ".../releases/download/v${VERSION}/..., with the version in the step's env, or a release that moves under it moves what CI refuses",
  ]);

  for (const [why, mangle] of [
    ['the check taken out', (step: Step) => (step.run = step.run?.replace('sha256sum --check', 'cat'))],
    ['no hash to check against', (step: Step) => delete (step.env ?? {}).SHA256],
  ] as const) {
    const unchecked = structuredClone(shipped);
    mangle(runSteps(unchecked, SCAN)[0]);
    assert.deepEqual(
      scanDrift(unchecked, config),
      [
        'the gitleaks job in .github/workflows/ci.yml does not check the download against a sha256: give the step env SHA256 with the ' +
          "64-digit hash from that release's gitleaks_<version>_checksums.txt and pipe it to `sha256sum --check --strict -`, or a third " +
          "party's bytes run here unverified",
      ],
      why,
    );
  }

  for (const flag of SCAN_FLAGS) {
    const unflagged = structuredClone(shipped);
    const scan = runSteps(unflagged, SCAN).find((step) => step.run?.includes(flag) === true);
    assert.ok(scan?.run !== undefined, `the scan passes ${flag} today`);
    scan.run = scan.run.replaceAll(flag, '');
    assert.deepEqual(scanDrift(unflagged, config), [
      `the gitleaks job's scan in .github/workflows/ci.yml does not pass ${flag}: add it to the gitleaks command, or the scan reads the ` +
        `whole history instead of this push's commits, allows what ${SCAN_CONFIG} says it allows, or prints a found secret into a ` +
        "public run's log",
    ]);
  }

  const shallow = structuredClone(shipped);
  const checkout = (shallow.jobs[SCAN].steps ?? []).find((step) => step.uses?.startsWith('actions/checkout') === true);
  assert.equal(checkout?.with?.['fetch-depth'], 0, 'the scan checks the whole history out today');
  delete checkout.with;
  assert.deepEqual(scanDrift(shallow, config), [
    "the gitleaks job's checkout in .github/workflows/ci.yml does not pass fetch-depth: 0: the range names the commit before this push, " +
      'which the shallow default has not, so git refuses the range and the job fails having scanned nothing',
  ]);

  const wide = config.replace("paths = ['packages", "paths = ['packages/agent-runtime/test/', 'packages");
  assert.deepEqual(allowDrift(wide, stubs), [
    `the allowlist in ${SCAN_CONFIG} is scoped to ["packages/agent-runtime/test/","packages/agent-runtime/test/remote-agent\\\\.test\\\\.ts$"], ` +
      `not to ${STUBS} alone: it is the one file of this repository that may hold a stub secret, so scope the allowlist to it with ` +
      "paths = ['packages/agent-runtime/test/remote-agent\\.test\\.ts$'] and nothing wider",
  ]);

  const loose = config.replace('^key-[0-9a-f]{4}-SECRET$', 'key-[0-9a-f]{4}-SECRET');
  assert.deepEqual(allowDrift(loose, stubs), [
    `the allowlist in ${SCAN_CONFIG} holds key-[0-9a-f]{4}-SECRET, anchored at neither end: write it ^key-[0-9a-f]{4}-SECRET$, or a ` +
      "real secret that happens to hold a stub's shape is allowed along with it",
  ]);

  const renamed = config.replace('^tok-', '^tkn-');
  assert.deepEqual(allowDrift(renamed, stubs), [
    `${STUBS} writes the stub secret tok-3f9a-SECRET-7c21, which no regex in ${SCAN_CONFIG} matches: add its shape to the allowlist, ` +
      'anchored at both ends, or the gitleaks job refuses every push over a secret nobody can use',
  ]);

  const unproven = structuredClone(shipped);
  assert.ok(allowlistStep(unproven) !== undefined, 'the scan job proves its own allowlist today');
  unproven.jobs[SCAN].steps = (unproven.jobs[SCAN].steps ?? []).filter((step) => step.name !== ALLOWLIST_STEP);
  assert.deepEqual(scanDrift(unproven, config), [
    `the gitleaks job in .github/workflows/ci.yml has no step named "${ALLOWLIST_STEP}": add back the step that scans a fixture with ` +
      `the pinned binary, with ${SCAN_CONFIG} and without it, and refuses unless the stub shapes are allowed at their one path and ` +
      `nothing else is. It is the only thing that proves what ${SCAN_CONFIG} allows, since a configuration's meaning is not in its text`,
  ]);

  const global = [
    '[extend]',
    'useDefault = true',
    '',
    '[[allowlists]]',
    'condition = "AND"',
    "paths = ['packages/agent-runtime/test/remote-agent\\.test\\.ts$']",
    "regexes = ['^tok-[0-9a-f]{4}-SECRET-[0-9a-f]{4}$', '^key-[0-9a-f]{4}-SECRET$']",
    '',
  ].join('\n');
  assert.deepEqual(
    allowDrift(global, stubs),
    [
      `${SCAN_CONFIG} holds a top-level [[allowlists]]: a global allowlist's paths entry skips the whole file whatever its condition, so ` +
        `every secret in ${STUBS} is allowed and a real one pasted in beside the stubs goes through. Nest it instead as ` +
        '[[rules.allowlists]] under a [[rules]] block carrying id = "generic-api-key", which scopes it to that one rule',
    ],
    'the form the quick run’s draft of this card shipped, verbatim: the operator’s own run of it measured every finding in that file ' +
      'allowed, the two planted GitHub tokens included, where the scoped form leaves the planted ones and allows the stubs alone',
  );

  const unnested = config.replace('[[rules]]\nid = "generic-api-key"\n\n', '');
  assert.notEqual(unnested, config, 'the allowlist is nested under its rule today');
  assert.deepEqual(allowDrift(unnested, stubs), [
    `${SCAN_CONFIG} does not nest one [[rules.allowlists]] under one [[rules]] block carrying id = "generic-api-key": write it that ` +
      'way, or the allowlist is global and skips every secret in the file its paths names rather than the two shapes it lists',
  ]);

  const joined = config.replace('\ncondition = "AND"\n', '\n');
  assert.notEqual(joined, config, 'the allowlist joins its path and its shape with AND today');
  assert.deepEqual(allowDrift(joined, stubs), [
    `${SCAN_CONFIG}'s [[rules.allowlists]] does not carry condition = "AND": a rule allowlist joins its criteria with OR by default, ` +
      `so paths alone allows a finding and regexes alone allows one too — every generic key in ${STUBS} allowed, and a stub's shape ` +
      'allowed anywhere in the repository. Write condition = "AND", which allows a finding only where its path and its shape both match',
  ]);

  const replaced = config.replace('\nid = "generic-api-key"\n', '\nid = "generic-api-key"\nregex = \'(?i)api[_-]?key\'\n');
  assert.notEqual(
    replaced,
    config,
    'the rule block carries its id and nothing else today, and the key goes on the block itself rather than into the comment above it, ' +
      'which names the form in prose',
  );
  assert.deepEqual(allowDrift(replaced, stubs), [
    `${SCAN_CONFIG}'s [[rules]] block carries regex beside its id: gitleaks appends an allowlist array but replaces every other ` +
      'attribute of a rule, so the default generic-api-key rule becomes one that detects nothing and the scan goes blind to every ' +
      'generic key in the repository. Take regex out, leaving the id and the [[rules.allowlists]] block under it',
  ]);
});
