/**
 * sdlc as a factory gets it: `nemia template lint` passes it, spawned as a person types it, and `nemia factory apply` renders it into a
 * factory's tree with every parameter written where the template says it: the CI context in each implement check and each landing,
 * the round's check in build's implement check, the areas in RULES.md, and no expression left in any file. Its way, `github`, is the
 * branch each implement and land check takes and the answer each of their notes opens with: on GitHub where it is set true, and in the
 * checkout by default, where the local check judges each round and the merged tree; a `github` that is no boolean is refused at
 * apply. Each step that writes its own `output:` has its schema beside it in the tree, the template's own bytes; the team is six
 * agents, Ada none of them. Applied with no `--set`, each parameter takes its default.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { splitFrontmatter } from 'agent-orchestrator/workflow';
import { scratch } from './scratch.ts';
import { copyOf, filesUnder, nemia, rendered, SDLC, storeEnv } from './template.ts';

/** The template, copied once, and applied twice on one store: with every parameter set, and with none. */
const COPY = copyOf(SDLC);
const TREES = await rendered([
  { name: 'set', template: COPY, sets: ['github=true', 'ciCheck=gate', 'roundCheck=echo round', 'localCheck=echo local', 'areas=a, b'] },
  { name: 'plain', template: COPY },
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

test('REFUSED: a github that is no boolean, at apply, naming the --set that fixes it, which an undeclared parameter does not', () => {
  const env = storeEnv(scratch('nemia-sdlc-way-'));
  const repo = path.join(env.HOME!, 'repo');
  fs.mkdirSync(repo);
  spawnSync('git', ['init', '-q'], { cwd: repo, env });
  const refused = nemia(env, 'factory', 'apply', 'x', '--template', COPY, '--repo', repo, '--no-trust', '--set', 'github=yes');
  assert.notEqual(refused.code, 0, refused.out);
  assert.match(refused.err, /--set github=(?:true|false)\b/);
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
  assert.deepEqual(owned, ['workflows/quick/implement.schema.json'], "quick's implement writes its own output, and no other step");
  for (const file of owned) assert.ok(fs.readFileSync(path.join(tree, file)).equals(fs.readFileSync(path.join(SDLC, file))), file);
  for (const agent of ['agora', 'argus', 'iris', 'otto', 'seldon'])
    assert.ok(
      fs
        .readFileSync(path.join(tree, 'workflows', 'agents', `${agent}.schema.json`))
        .equals(fs.readFileSync(path.join(SDLC, 'agents', agent, 'output.schema.json'))),
      agent,
    );
});

test('the team is six agents, and Ada is none of them', () => {
  const agents = fs
    .readdirSync(path.join(treeOf('set'), 'workflows', 'agents'))
    .filter((leaf) => leaf.endsWith('.md'))
    .map((leaf) => leaf.slice(0, -'.md'.length))
    .sort();
  assert.deepEqual(agents, ['agora', 'argus', 'grace', 'iris', 'otto', 'seldon']);
});
