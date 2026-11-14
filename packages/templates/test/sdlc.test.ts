/**
 * sdlc as a factory gets it: `nemia template lint` passes it, spawned as a person types it, and `nemia factory apply` renders it into a
 * factory's tree with every parameter written where the template says it: the CI context in each implement check and each landing, the
 * round's check in build's implement check, the landing's refresh in each land's merge and its derived paths in each review, the rules
 * of the pull request's labels in each implement check, the areas in RULES.md, and no expression left in any file. Its way, `github`,
 * is the branch each implement and land check takes and the answer each of their notes opens with: on GitHub where it is set true, and
 * in the checkout by default, where the local check judges each round and the merged tree; a `github` that is no boolean is refused at
 * apply. Each step that writes its own `output:` has its schema beside it in the tree, the template's own bytes; the team is six
 * agents, Ada none of them. Applied with no `--set`, each parameter takes its default. Build's design, read with its agent as a run
 * reads it, declares the budgets of the later steps by their shape.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { FACTORY_APPLY, loadWorkflows } from 'agent-orchestrator';
import { parseAgent, parseFolder, parseWorkflow, splitFrontmatter } from 'agent-orchestrator/workflow';
import { assess } from 'agent-orchestrator/run';
import { PERSONS_EXIT } from '../sdlc/carried/exec.ts';
import { scratch } from 'test-kit/scratch';
import { copyOf, filesUnder, handled, nemia, rendered, SDLC, storeEnv } from './template.ts';

/** The template, copied once, and applied twice on one store: with every parameter set, and with none. */
const COPY = copyOf(SDLC);
const TREES = await rendered([
  {
    name: 'set',
    template: COPY,
    sets: [
      'github=true',
      'ciCheck=gate',
      'roundCheck=echo round',
      'localCheck=echo local',
      'areas=a, b',
      'pullRequestLabels=work=fix:fix',
      'implementCheck=echo own',
      'landingRefresh=node x.ts cut',
      'landingDerives=a.json',
    ],
  },
  { name: 'plain', template: COPY },
  { name: 'own', template: COPY, sets: ['implementCheck=echo own'] },
]);

/** The tree of the factory `name`, which the controller seeded. */
const treeOf = (name: string): string => {
  const tree = TREES[name]?.tree;
  assert.ok(tree, `${name} was rendered: ${JSON.stringify(TREES[name]?.conditions)}`);
  return tree;
};

/** The step `workflow/step` of the tree `tree`: its frontmatter, read, and its body. */
function stepIn(tree: string, workflow: string, step: string): { front: Record<string, unknown>; body: string } {
  const file = `workflows/${workflow}/${step}.md`;
  const { block, body } = splitFrontmatter(file, fs.readFileSync(path.join(tree, file), 'utf8'));
  return { front: (yaml.load(block ?? '') ?? {}) as Record<string, unknown>, body };
}

/** The check of the step `workflow/step` of `tree`. */
const checkOf = (tree: string, workflow: string, step: string): string => String(stepIn(tree, workflow, step).front.check ?? '');

/** The steps whose check and note differ by way. */
const WAYS = [
  ['build', 'implement'],
  ['build', 'land'],
  ['quick', 'implement'],
  ['quick', 'land'],
] as const;

/** The opening of a check's branch on the rendered way `github`. */
const branchOn = (github: boolean): string => `if [ "${github}" = true ]; then `;

/** The answer a way's note opens with. */
const answer = (github: boolean): RegExp => new RegExp(`^Does this factory judge and land its work on GitHub\\? \\*\\*${github}\\*\\*\\.`);

/** `--check` with the CI context `name`, quoted or bare. */
const ciCheck = (name: string): RegExp => new RegExp(`--check "?${name}"?(?=[\\s;]|$)`, 'm');

test('nemia template lint passes sdlc and prints its digest', () => {
  const env = storeEnv(scratch('nemia-sdlc-lint-'));
  const real = nemia(env, 'template', 'lint', SDLC);
  assert.equal(real.code, 0, real.err);
  assert.match(real.out, /^digest of the content: sha256:[0-9a-f]{64}$/m);
});

test('applied with every parameter set, each is written where the template says, and no expression is left', () => {
  const tree = treeOf('set');
  const build = checkOf(tree, 'build', 'implement');
  assert.ok(build.includes('{ echo round; }'), build);
  assert.match(build, ciCheck('gate'));
  assert.match(checkOf(tree, 'quick', 'implement'), ciCheck('gate'));
  for (const workflow of ['build', 'quick'])
    assert.ok(
      checkOf(tree, workflow, 'implement').includes('push --labels "work=fix:fix" && '),
      `${workflow}/implement labels by the rules set`,
    );
  for (const workflow of ['build', 'quick']) assert.match(stepIn(tree, workflow, 'land').body, ciCheck('gate'), `${workflow}/land`);
  for (const [workflow, step] of WAYS) {
    const check = checkOf(tree, workflow, step);
    assert.ok(check.includes(branchOn(true)), `${workflow}/${step} branches on GitHub:\n${check}`);
    assert.ok(check.endsWith('; else { echo local; }; fi'), `and its other way is the local check the factory set:\n${check}`);
    assert.match(stepIn(tree, workflow, step).body, answer(true), `${workflow}/${step}'s note opens with the way`);
  }
  assert.ok(fs.readFileSync(path.join(tree, 'RULES.md'), 'utf8').includes('a, b'));
  assert.deepEqual(
    filesUnder(tree).filter((file) => fs.readFileSync(path.join(tree, file), 'utf8').includes('${{')),
    [],
  );
});

test('applied with no --set, each parameter takes its default', () => {
  const tree = treeOf('plain');
  const build = checkOf(tree, 'build', 'implement');
  assert.ok(build.includes('{ npm run --if-present lint && npm run --if-present typecheck; }'), build);
  assert.match(build, ciCheck('ci'));
  for (const workflow of ['build', 'quick'])
    assert.ok(checkOf(tree, workflow, 'implement').includes('push --labels "" && '), `${workflow}/implement labels nothing by default`);
  for (const workflow of ['build', 'quick']) assert.match(stepIn(tree, workflow, 'land').body, ciCheck('ci'), `${workflow}/land`);
  for (const [workflow, step] of WAYS) {
    const check = checkOf(tree, workflow, step);
    assert.ok(check.includes(branchOn(false)), `${workflow}/${step} is in the checkout by default:\n${check}`);
    assert.ok(
      check.endsWith('; else { npm run --if-present lint && npm run --if-present typecheck && npm run --if-present test; }; fi'),
      `and the local check it runs there is lint, typecheck and test:\n${check}`,
    );
    assert.match(stepIn(tree, workflow, step).body, answer(false), `${workflow}/${step}'s note opens with the way`);
  }
  assert.ok(fs.readFileSync(path.join(tree, 'RULES.md'), 'utf8').includes('the top-level folders of the repository'));
  assert.ok(fs.readFileSync(path.join(tree, 'workflows/agents/otto.md'), 'utf8').includes('Edit(~/.agent-workflows/inbox/**)'));
});

test("the factory's landing refresh reaches land's merge as its two flags, and both reviews' notes name the paths it derives", () => {
  const tree = treeOf('set');
  for (const workflow of ['build', 'quick'])
    assert.ok(
      stepIn(tree, workflow, 'land').body.includes(' --refresh "node x.ts cut" --derives "a.json"'),
      `${workflow}/land's merge carries both flags`,
    );
  for (const workflow of ['build', 'quick'])
    assert.ok(stepIn(tree, workflow, 'review').body.includes('`a.json`'), `${workflow}/review names the derived paths`);
  const plain = stepIn(treeOf('plain'), 'build', 'land').body;
  assert.ok(plain.includes(' --refresh "" --derives ""'), 'unset, both are given empty, which the merge takes as no refresh');
});

test("build's and quick's implement try again on their own twice when their check refuses, either way, and land never does", () => {
  for (const name of ['set', 'plain'])
    for (const workflow of ['build', 'quick']) {
      assert.equal(stepIn(treeOf(name), workflow, 'implement').front.retries, 2, `${name}: ${workflow}/implement`);
      assert.equal(stepIn(treeOf(name), workflow, 'land').front.retries, undefined, `${name}: ${workflow}/land waits on a person`);
    }
});

/** The steps of `workflow` in the factory `name`'s tree, loaded as a start of it in the factory loads them: with the factory's hires. */
function loaded(name: string, workflow: string) {
  const tree = treeOf(name);
  const { hires } = JSON.parse(fs.readFileSync(path.join(tree, 'factory.json'), 'utf8')) as { hires: Record<string, string> };
  const agents = Object.fromEntries(
    Object.entries(hires).flatMap(([step, agent]) => (step.startsWith(`${workflow}/`) ? [[step.slice(workflow.length + 1), agent]] : [])),
  );
  const store = TREES[name]?.store ?? '';
  return loadWorkflows(path.join(tree, 'workflows', workflow), { home: store }, { factory: 'sdlc', workflow, agents });
}

/** The code `change.ts` exits with, read from its shipped text: it imports nothing, so it keeps its own copy of `PERSONS_EXIT`. */
const changeExit = (): number => {
  const found = /^const PERSONS_EXIT = (\d+);$/m.exec(fs.readFileSync(path.join(SDLC, 'workflows', 'quick', 'change.ts'), 'utf8'));
  assert.ok(found, 'change.ts declares its PERSONS_EXIT');
  return Number(found[1]);
};

test("build's and quick's implement load with a policy that fails the step on 78, the code sdlc's scripts exit with for a person's refusal", () => {
  assert.equal(PERSONS_EXIT, 78, "carried/exec.ts's code");
  assert.equal(changeExit(), PERSONS_EXIT, "change.ts's own copy of it");
  for (const name of ['set', 'plain'])
    for (const workflow of ['build', 'quick']) {
      const steps = loaded(name, workflow);
      assert.deepEqual(
        steps.find((step) => step.name === 'implement')?.checkFailurePolicy,
        { rules: [{ action: 'FailStep', onExitCodes: { operator: 'In', values: [PERSONS_EXIT] } }] },
        `${name}: ${workflow}/implement waits on the person for a refusal only a person answers`,
      );
      assert.equal(steps.find((step) => step.name === 'land')?.checkFailurePolicy, undefined, `${name}: ${workflow}/land has none`);
    }
});

/** The end of the parts.ts clause, the last of sdlc's own scripts that both ways run. */
const PARTS_END = '/parts.ts" check && ';

/** The factory's own check, `command`, as the implement check runs it: a clause of its own, between sdlc's scripts and the way's `if`. */
const ownClause = (command: string, github: boolean): string => `${PARTS_END}{ ${command}; } && ${branchOn(github)}`;

/** How many times `part` is in `text`. */
const count = (text: string, part: string): number => text.split(part).length - 1;

test("the factory's own check runs in build's and quick's implement check, either way, after sdlc's scripts and before the way's branch", () => {
  for (const [name, github] of [
    ['set', true],
    ['own', false],
  ] as const)
    for (const workflow of ['build', 'quick']) {
      const check = checkOf(treeOf(name), workflow, 'implement');
      assert.equal(count(check, '{ echo own; }'), 1, `${name}: ${workflow}/implement runs it once:\n${check}`);
      assert.equal(
        count(check, ownClause('echo own', github)),
        1,
        `${name}: ${workflow}/implement runs it after parts.ts, before the way:\n${check}`,
      );
      for (const step of workflow === 'build' ? ['implement'] : ['implement', 'review'])
        assert.ok(stepIn(treeOf(name), workflow, step).body.includes('`echo own`'), `${name}: ${workflow}/${step}'s note names it`);
    }
});

test("unset, the factory's own check is a clause that does nothing, and setting it changes that clause alone", () => {
  for (const workflow of ['build', 'quick'] as const) {
    const check = checkOf(treeOf('plain'), workflow, 'implement');
    assert.equal(count(check, ownClause('true', false)), 1, `${workflow}/implement runs \`true\` in its place:\n${check}`);
    assert.equal(
      checkOf(treeOf('own'), workflow, 'implement').replace('{ echo own; }', '{ true; }'),
      check,
      'and setting it changes that clause alone',
    );
  }
});

test('REFUSED: a github that is no boolean, at apply, naming the --set that fixes it, which an undeclared parameter does not', async () => {
  const env = storeEnv(scratch('nemia-sdlc-way-'));
  const repo = path.join(env.HOME!, 'repo');
  fs.mkdirSync(repo);
  spawnSync('git', ['init', '-q'], { cwd: repo, env });
  await assert.rejects(
    handled(env, FACTORY_APPLY, ['x', '--template', COPY, '--repo', repo, '--no-trust', '--set', 'github=yes']),
    /--set github=(?:true|false)\b/,
  );
  assert.equal(fs.existsSync(path.join(env.WF_ROOT!, 'factories', 'x')), false, 'and no factory is filed');
});

test("each step that writes its own output has its schema beside it, the template's bytes, and so has each agent", () => {
  const tree = treeOf('set');
  const owned = ['build', 'quick', 'intake', 'janitor'].flatMap((workflow) =>
    fs
      .readdirSync(path.join(tree, 'workflows', workflow))
      .filter((leaf) => leaf.endsWith('.md') && leaf !== 'README.md')
      .flatMap((leaf) => {
        const output = stepIn(tree, workflow, leaf.slice(0, -'.md'.length)).front.output;
        return typeof output === 'string' ? [`workflows/${workflow}/${output}`] : [];
      }),
  );
  assert.deepEqual(
    owned,
    ['workflows/quick/implement.schema.json', 'workflows/intake/route.schema.json'],
    "quick's implement and intake's intake write their own output, and no other step",
  );
  for (const file of owned) assert.ok(fs.readFileSync(path.join(tree, file)).equals(fs.readFileSync(path.join(SDLC, file))), file);
  for (const agent of ['agora', 'argus', 'iris', 'otto', 'seldon'])
    assert.ok(
      fs
        .readFileSync(path.join(tree, 'workflows', 'agents', `${agent}.schema.json`))
        .equals(fs.readFileSync(path.join(SDLC, 'agents', agent, 'output.schema.json'))),
      agent,
    );
});

/** The intake of the factory `name`, parsed with Iris as a run reads it. */
const intakeOf = (name: string) => {
  const folder = path.join(treeOf(name), 'workflows', 'intake');
  const files = fs
    .readdirSync(folder)
    .filter((leaf) => leaf.endsWith('.md') && leaf !== 'README.md')
    .map((leaf) => [leaf.slice(0, -'.md'.length), fs.readFileSync(path.join(folder, leaf), 'utf8')] as const);
  const readIn = (dir: string) => (file: string) => {
    const at = path.join(dir, file);
    return fs.existsSync(at) ? fs.readFileSync(at, 'utf8') : undefined;
  };
  const agents = path.join(treeOf(name), 'workflows', 'agents');
  const iris = parseAgent('iris', fs.readFileSync(path.join(agents, 'iris.md'), 'utf8'), readIn(agents));
  const steps = parseFolder(files, readIn(folder), new Map([['iris', iris]]), undefined, {
    factory: name,
    workflow: 'intake',
    agents: { intake: 'iris' },
  });
  return steps;
};

for (const name of ['set', 'plain'])
  test(`rendered ${name === 'set' ? 'on GitHub' : 'in the checkout'}, intake loads, ending in the condition next that routes to build or quick, or ends the run`, () => {
    const steps = intakeOf(name);
    const of = (step: string) => steps.find((s) => s.name === step);
    assert.deepEqual(
      steps.map((s) => s.name),
      ['intake', 'next', 'to-build', 'to-quick'],
    );
    assert.equal(of('intake')?.gate ?? false, false, 'the gate is on the condition, so the intent is approved with its route');
    assert.equal(of('next')?.gate, true);
    assert.deepEqual(of('next')?.routes, ['build', 'quick', 'end']);
    assert.deepEqual(of('next')?.route, {
      kind: 'table',
      from: 'intake.handsOver',
      table: { design: 'build', change: 'quick', nothing: 'end' },
    });
    assert.deepEqual(of('next')?.ends, ['end']);
    assert.deepEqual([of('to-build')?.when, of('to-build')?.workflow], [['build'], 'build']);
    assert.deepEqual([of('to-quick')?.when, of('to-quick')?.workflow], [['quick'], 'quick']);
  });

/** One pass of a rendered intake whose Iris signed off with `handsOver`, `next` approved or not: what `assess` files and sends. */
/** The one read `assess` takes, by the type of its parameter: the entry exports `assess` alone. */
type AssessRead = Parameters<typeof assess>[0];

const intakePass = (steps: ReturnType<typeof intakeOf>, handsOver: string, approved: boolean) => {
  const run: AssessRead['run'] = {
    id: 'r-1',
    repo: '/repo',
    workspace: '/wt',
    baseRef: 'abc123',
    branch: 'main',
    isolate: true,
    brief: 'an idea',
    workflowDir: '/wf',
    createdAt: '2026-01-01T00:00:00Z',
    steps: { intake: { taskId: 't-intake' }, next: { taskId: null }, 'to-build': { taskId: null }, 'to-quick': { taskId: null } },
    ...(approved ? { approvals: [{ step: 'next', try: 1, at: '2026-01-01T00:00:00Z' }] } : {}),
  };
  const intent = {
    title: 'an idea',
    problem: 'what hurts',
    proposedOutcome: 'what becomes true',
    affected: [],
    constraints: [],
    decisions: [],
    open: [],
    handsOver,
  };
  const read: AssessRead = {
    steps,
    run,
    phaseOf: (id) => (id === 't-intake' ? 'succeeded' : 'unknown'),
    signedOff: (step) => (step === 'intake' ? { outcome: 'done', summary: 'the intent', artifacts: [], output: intent } : undefined),
    asked: () => false,
    verdictOf: () => undefined,
    sessionBlocked: () => false,
    spendOf: () => undefined,
    asks: [],
    roundAsks: [],
    standings: [],
    checkout: undefined,
  };
  const a = assess(read);
  return { ready: a.ready, send: a.send, status: a.status };
};

for (const name of ['set', 'plain'])
  test(`rendered ${name === 'set' ? 'on GitHub' : 'in the checkout'}, an intake whose intent hands over nothing files neither to-build nor to-quick, and the run succeeds once next is approved`, () => {
    const steps = intakeOf(name);
    assert.deepEqual(intakePass(steps, 'nothing', false), { ready: [], send: [], status: 'awaiting approval' });
    assert.deepEqual(intakePass(steps, 'nothing', true), { ready: [], send: [], status: 'succeeded' });
    assert.deepEqual(intakePass(steps, 'design', true).send, ['to-build'], 'the same pass sends build for an intent that needs a design');
    assert.deepEqual(intakePass(steps, 'change', true).send, ['to-quick'], 'and quick for one that settles its change');
  });

test('the team is six agents, and Ada is none of them', () => {
  const agents = fs
    .readdirSync(path.join(treeOf('set'), 'workflows', 'agents'))
    .filter((leaf) => leaf.endsWith('.md'))
    .map((leaf) => leaf.slice(0, -'.md'.length))
    .sort();
  assert.deepEqual(agents, ['agora', 'argus', 'grace', 'iris', 'otto', 'seldon']);
});

test("build's design, read with Seldon, declares the later steps' budgets as data: the budgets shape, expanded and required", () => {
  const tree = treeOf('set');
  const agents = path.join(tree, 'workflows', 'agents');
  const readAgents = (file: string): string | undefined =>
    fs.existsSync(path.join(agents, file)) ? fs.readFileSync(path.join(agents, file), 'utf8') : undefined;
  const seldon = parseAgent('seldon', fs.readFileSync(path.join(agents, 'seldon.md'), 'utf8'), readAgents);
  const design = parseWorkflow(
    'design',
    fs.readFileSync(path.join(tree, 'workflows', 'build', 'design.md'), 'utf8'),
    (file) => readAgents(file),
    new Map([['seldon', seldon]]),
    undefined,
    { agent: 'seldon', factory: 'set', step: 'build/design' },
  );
  const schema = design.output?.schema;
  assert.ok(schema, "design's output is Seldon's");
  assert.ok(schema.required.includes('budgets'), 'budgets is required');
  const budgets = schema.properties.budgets;
  assert.equal(budgets?.type, 'array', 'the shape is expanded to an array');
  assert.ok(!Object.hasOwn(budgets ?? {}, 'x-shape'), 'the marker is gone once expanded');
});

test("build's design, read with Seldon, hands the review the outside pages its spec rests on: sources, required and strict, read by the review", () => {
  const tree = treeOf('set');
  const agents = path.join(tree, 'workflows', 'agents');
  const readAgents = (file: string): string | undefined =>
    fs.existsSync(path.join(agents, file)) ? fs.readFileSync(path.join(agents, file), 'utf8') : undefined;
  const seldon = parseAgent('seldon', fs.readFileSync(path.join(agents, 'seldon.md'), 'utf8'), readAgents);
  const design = parseWorkflow(
    'design',
    fs.readFileSync(path.join(tree, 'workflows', 'build', 'design.md'), 'utf8'),
    (file) => readAgents(file),
    new Map([['seldon', seldon]]),
    undefined,
    { agent: 'seldon', factory: 'set', step: 'build/design' },
  );
  const schema = design.output?.schema;
  assert.ok(schema, "design's output is Seldon's");
  assert.ok(schema.required.includes('sources'), 'sources is required');
  const sources = schema.properties.sources as
    | { type?: unknown; items?: { additionalProperties?: unknown; required?: unknown } }
    | undefined;
  assert.equal(sources?.type, 'array');
  assert.equal(sources?.items?.additionalProperties, false, 'each source is strict');
  assert.deepEqual(sources?.items?.required, ['url', 'read', 'excerpt', 'claims']);
  const input = stepIn(tree, 'build', 'review').front.input;
  assert.ok([input].flat().includes('design'), "build's review reads design's declared fields");
});

/** The variables a check reads a frozen folder by, one of which names where each of sdlc's scripts is read from. */
const FROZEN_FOLDERS = ['WF_CARRIED_FILES', 'WF_WORKFLOW_FILES'] as const;

/** The script names `check` gives under any path: what a working folder would answer if the check read the script from there. */
const scriptsIn = (check: string): string[] => [...new Set([...check.matchAll(/\/([\w-]+\.ts)"/g)].map(([, name]) => name ?? ''))];

/**
 * How `check` fails each variable it reads a frozen folder by, run as the run runs a check, by `sh -c`, in a working folder that holds
 * each script it names as a marker that leaves a file when run, with that one variable unset and each other one naming a folder whose
 * scripts do nothing: each case where it exits 0, says nothing of the variable on stderr, or ran a script of the working folder. Then
 * once with every variable set, where a clause that reads the working folder after one that is guarded is seen too.
 */
function unguarded(check: string): string[] {
  const root = scratch('nemia-sdlc-unset-');
  const work = path.join(root, 'work');
  const quiet = path.join(root, 'quiet');
  for (const folder of [work, quiet]) fs.mkdirSync(folder);
  for (const name of scriptsIn(check)) {
    fs.writeFileSync(path.join(work, name), `import fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(`ran-${name}`)}, '');\n`);
    fs.writeFileSync(path.join(quiet, name), 'export {};\n');
  }
  const read = FROZEN_FOLDERS.filter((name) => check.includes(name));
  if (read.length === 0) return ['it reads no frozen folder'];
  const runs = (unset: string | undefined): { status: number | null; stderr: string; markers: string[] } => {
    const env: NodeJS.ProcessEnv = { ...storeEnv(root), WF_RUN: 'r' };
    for (const name of FROZEN_FOLDERS) env[name] = quiet;
    if (unset !== undefined) delete env[unset];
    const ran = spawnSync('sh', ['-c', check], { cwd: work, env, encoding: 'utf8', timeout: 60_000 });
    const markers = fs.readdirSync(work).filter((file) => file.startsWith('ran-'));
    for (const marker of markers) fs.rmSync(path.join(work, marker));
    return { status: ran.status, stderr: ran.stderr, markers: markers.map((marker) => marker.slice('ran-'.length)) };
  };
  return [
    ...read.flatMap((unset) => {
      const ran = runs(unset);
      return [
        ...(ran.status === 0 ? [`${unset} unset: it exited 0`] : []),
        ...(ran.stderr.includes(unset) ? [] : [`${unset} unset: stderr names it not: ${ran.stderr.trim()}`]),
        ...ran.markers.map((marker) => `${unset} unset: it ran the working folder's ${marker}`),
      ];
    }),
    ...runs(undefined).markers.map((marker) => `every variable set: it ran the working folder's ${marker}`),
  ];
}

/** What of `check` runs in the tree `name`: in the checkout (`plain`), what is before its GitHub branch, which is never taken there. */
const takenIn = (name: string, check: string): string => (name === 'set' ? check : (check.split(branchOn(false))[0] ?? ''));

test("REFUSED: a check that reads a script from the working folder where its frozen folder's variable is unset", () => {
  assert.deepEqual(unguarded('node "./probe.ts" check && node "${WF_CARRIED_FILES:?run it in a run}/parts.ts" check'), [
    "WF_CARRIED_FILES unset: it ran the working folder's probe.ts",
    "every variable set: it ran the working folder's probe.ts",
  ]);
  assert.deepEqual(unguarded('node "${WF_CARRIED_FILES:?run it in a run}/probe.ts" check && node "./parts.ts" check'), [
    "every variable set: it ran the working folder's parts.ts",
  ]);
  assert.equal(
    unguarded('node "${WF_CARRIED_FILES:-.}/probe.ts" check').length,
    3,
    'a fallback to the working folder: exit 0, silent, ran',
  );
});

test("each of sdlc's checks, either way, refuses with the variable it reads a frozen folder by unset, naming it, and runs nothing", () => {
  let read = 0;
  for (const name of ['set', 'plain'])
    for (const workflow of ['build', 'quick', 'janitor'])
      for (const file of fs.readdirSync(path.join(treeOf(name), 'workflows', workflow)).filter((it) => it.endsWith('.md'))) {
        const check = checkOf(treeOf(name), workflow, file.replace(/\.md$/, ''));
        const taken = takenIn(name, check);
        if (!FROZEN_FOLDERS.some((variable) => taken.includes(variable))) continue;
        read += 1;
        assert.deepEqual(unguarded(check), [], `${name}: ${workflow}/${file}:\n${check}`);
      }
  assert.ok(read >= 8, `the checks that read a frozen folder were found: ${read}`);
});

test("quick's land step is told build's land note, rendered with the same values", () => {
  for (const name of ['set', 'plain']) {
    const build = stepIn(treeOf(name), 'build', 'land').body;
    assert.ok(build.includes('landing.ts'), `${name}: build's land note is read`);
    assert.equal(stepIn(treeOf(name), 'quick', 'land').body, build, `${name}: quick/land`);
  }
});

test("build's review loop ships its numbers: five rounds, the review's budget sized to them, implement's too", () => {
  for (const name of ['set', 'plain']) {
    const tree = treeOf(name);
    const review = stepIn(tree, 'build', 'review').front;
    assert.equal(review.rounds, 5, `${name}: build/review's rounds`);
    assert.equal(review.budget, 24, `${name}: build/review's budget`);
    assert.equal(stepIn(tree, 'build', 'implement').front.budget, 50, `${name}: build/implement's budget`);
  }
});

/**
 * What leaves the review loop of `workflow` without a bound: no positive whole `rounds` on its looping step, or a step of the loop
 * (the step it loops to, and itself) with no `budget`. Empty when the loop stops on its own: at its rounds, and at each step's cap.
 */
function unbounded(fronts: Record<string, Record<string, unknown>>): string[] {
  const missing: string[] = [];
  for (const [step, front] of Object.entries(fronts)) {
    if (typeof front.loop !== 'string') continue;
    if (!(Number.isInteger(front.rounds) && Number(front.rounds) > 0)) missing.push(`${step}: rounds`);
    for (const inLoop of [front.loop, step]) {
      const budget = fronts[inLoop]?.budget;
      if (!(typeof budget === 'number' && budget > 0)) missing.push(`${inLoop}: budget`);
    }
  }
  return missing;
}

const loopFronts = (tree: string, workflow: string): Record<string, Record<string, unknown>> =>
  Object.fromEntries(['implement', 'review'].map((step) => [step, stepIn(tree, workflow, step).front]));

test("build's and quick's review loops stop on their own: at review's rounds, and at implement's and review's budgets", () => {
  for (const workflow of ['build', 'quick']) {
    const fronts = loopFronts(treeOf('plain'), workflow);
    assert.equal(fronts.review?.loop, 'implement', `${workflow}/review loops to implement`);
    assert.deepEqual(unbounded(fronts), [], `${workflow}'s loop is bounded`);
  }
});

test('REFUSED: a loop with a step of it that has no budget, or a looping step with no rounds, is named unbounded', () => {
  const fronts = loopFronts(treeOf('plain'), 'build');
  const { budget: _budget, ...implement } = fronts.implement ?? {};
  assert.deepEqual(unbounded({ ...fronts, implement }), ['implement: budget']);
  const { rounds: _rounds, ...review } = fronts.review ?? {};
  assert.deepEqual(unbounded({ ...fronts, review }), ['review: rounds']);
});

/** Agora's closeout schema, as build's review reads it, rendered. */
function agoraSchema(): { required: string[]; properties: Record<string, unknown> } {
  const tree = treeOf('set');
  const agents = path.join(tree, 'workflows', 'agents');
  const readAgents = (file: string): string | undefined =>
    fs.existsSync(path.join(agents, file)) ? fs.readFileSync(path.join(agents, file), 'utf8') : undefined;
  const agora = parseAgent('agora', fs.readFileSync(path.join(agents, 'agora.md'), 'utf8'), readAgents);
  const review = parseWorkflow(
    'review',
    fs.readFileSync(path.join(tree, 'workflows', 'build', 'review.md'), 'utf8'),
    (file) => readAgents(file),
    new Map([['agora', agora]]),
    undefined,
    { agent: 'agora', factory: 'set', step: 'build/review' },
  );
  const schema = review.output?.schema;
  assert.ok(schema, "review's output is Agora's");
  return schema;
}

type Strict = { type?: unknown; required?: string[]; additionalProperties?: unknown; properties?: Record<string, { type?: unknown }> };

test("Agora's closeout requires what the review read and, on each finding, whether the first round missed it", () => {
  const schema = agoraSchema();
  assert.ok(schema.required.includes('read'), 'read is required');
  const read = schema.properties.read as Strict | undefined;
  assert.equal(read?.additionalProperties, false, 'read is strict');
  assert.deepEqual(read?.required, ['head', 'first', 'files', 'rules']);
  const findings = schema.properties.findings as { items?: Strict } | undefined;
  assert.ok(findings?.items?.required?.includes('missed'), 'missed is required of each finding');
  assert.equal(findings?.items?.properties?.missed?.type, 'boolean');
});

test('review-a-change names what Agora requires a round to say it read and missed, so a review is told what its closeout must say', () => {
  const schema = agoraSchema();
  const findings = schema.properties.findings as { items?: Strict } | undefined;
  const read = schema.properties.read as Strict | undefined;
  assert.ok(findings?.items?.required?.includes('missed') && schema.required.includes('read'), 'missed and read are required');
  const names = ['read', ...(read?.required ?? []), 'missed'];
  const skill = fs.readFileSync(path.join(SDLC, 'skills', 'review-a-change', 'SKILL.md'), 'utf8');
  for (const name of names) assert.ok(skill.includes(`\`${name}\``) || skill.includes(`\`read.${name}\``), `the skill names \`${name}\``);
});

/** The paragraph of a review note that opens with `**Say whether the branch holds the base**`, up to the blank line that ends it. */
const baseParagraph = (workflow: string): string => {
  const note = fs.readFileSync(path.join(SDLC, 'workflows', workflow, 'review.md'), 'utf8');
  const start = note.indexOf('**Say whether the branch holds the base**');
  assert.ok(start >= 0, `${workflow}'s review says whether the branch holds the base`);
  const end = note.indexOf('\n\n', start);
  return note.slice(start, end < 0 ? undefined : end);
};

test("build's and quick's review weigh a moved base alike, by the reads that say whether it can change the verdict", () => {
  const build = baseParagraph('build');
  assert.equal(baseParagraph('quick'), build, "quick's paragraph on the base is build's");
  for (const read of ['git diff -U0', 'git merge-tree --write-tree', 'mergeable'])
    assert.ok(build.includes(read), `the paragraph names ${read}`);
});
