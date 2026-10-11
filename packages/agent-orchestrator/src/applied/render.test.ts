/**
 * A template rendered into a factory's tree: the tests' team exported, rendered back, and loaded by today's reader as the team itself
 * loads, its hires filling the steps; a parameter given where a document names it; and what today's folder has no line for refused by
 * name. `WF_ROOT` is set before the import, since the store's modules read it as they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { scratch } from '../../test/scratch.ts';
import { teamCopy } from '../../test/team.ts';

process.env.WF_ROOT = scratch('wf-render-');
const { exportTemplate, openTemplate } = await import('../template/template.store.ts');
const { loadWorkflows } = await import('../folder/folder.store.ts');
const { renderFactory, resolveParams } = await import('./index.ts');

/** The tests' team exported into a template folder, and the repository it came from. */
function exported(): { repo: string; dir: string } {
  const repo = scratch('wf-render-repo-');
  fs.renameSync(teamCopy(), path.join(repo, 'workflows'));
  const dir = path.join(scratch('wf-render-out-'), 'team');
  exportTemplate({ dir, from: repo });
  return { repo, dir };
}

/** The template `dir` rendered with `sets`, written into a new tree. */
function rendered(dir: string, sets: string[] = []): { tree: string; out: ReturnType<typeof renderFactory> } {
  const read = openTemplate(dir);
  const manifest = read.folder.documents.get('nemia.yaml') as { spec: { parameters?: Record<string, never> } };
  const out = renderFactory(read, resolveParams(manifest.spec.parameters ?? {}, sets).params);
  const tree = scratch('wf-render-tree-');
  for (const file of out.files) {
    fs.mkdirSync(path.dirname(path.join(tree, file.path)), { recursive: true });
    fs.writeFileSync(path.join(tree, file.path), file.text);
  }
  for (const copy of out.copies) fs.cpSync(path.join(dir, copy.from), path.join(tree, copy.path));
  return { tree, out };
}

/**
 * The steps of a loaded workflow, each without where its hire came from, which the team names in its step file and the tree in its
 * wiring, and its schema's file unnamed: the tree names it after its agent, and its schema is compared whole.
 */
const stepsOf = (workflows: ReturnType<typeof loadWorkflows>): unknown =>
  JSON.parse(
    JSON.stringify(workflows, (key, value) => {
      if (key === 'hire') return undefined;
      return typeof value === 'string' && value.endsWith('.schema.json') ? '<schema>' : value;
    }),
  );

/** The document `file` of `dir`, its spec changed by `change`. */
function edit(dir: string, file: string, change: (spec: Record<string, any>) => void): void {
  const doc = parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  change(doc.spec);
  fs.writeFileSync(path.join(dir, file), stringify(doc, { lineWidth: 0 }));
}

test("the tests' team, exported and rendered, loads as the team loads, its hires filling the steps and its skills carried", () => {
  const { repo, dir } = exported();
  const { tree, out } = rendered(dir);
  assert.deepEqual(out.refusals, []);
  assert.deepEqual(out.wiring, {
    workflows: ['dev'],
    hires: { 'dev/implement': 'implementer', 'dev/review': 'reviewer', 'dev/ship': 'shipper' },
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tree, 'factory.json'), 'utf8')), out.wiring);
  const fills = { factory: 'team', workflow: 'dev', agents: { implement: 'implementer', review: 'reviewer', ship: 'shipper' } };
  assert.deepEqual(
    stepsOf(loadWorkflows(path.join(tree, 'workflows', 'dev'), {}, fills)),
    stepsOf(loadWorkflows(path.join(repo, 'workflows', 'dev'))),
  );
  assert.equal(
    fs.readFileSync(path.join(tree, 'workflows/skills/review-a-change/SKILL.md'), 'utf8'),
    fs.readFileSync(path.join(repo, 'workflows/skills/review-a-change/SKILL.md'), 'utf8'),
  );
  assert.equal(
    fs.readFileSync(path.join(tree, 'workflows/dev/README.md'), 'utf8'),
    fs.readFileSync(path.join(repo, 'workflows/dev/README.md'), 'utf8'),
  );
});

test("an agent's mcp: line has its place in a template: exported in the agent's spec, and rendered back as the line it was", () => {
  const repo = scratch('wf-render-repo-');
  fs.renameSync(teamCopy(), path.join(repo, 'workflows'));
  const reviewer = path.join(repo, 'workflows', 'agents', 'reviewer.md');
  fs.writeFileSync(reviewer, fs.readFileSync(reviewer, 'utf8').replace('---\n', '---\nmcp: playwright, docs\n'));
  const dir = path.join(scratch('wf-render-out-'), 'team');
  exportTemplate({ dir, from: repo });
  assert.deepEqual(parse(fs.readFileSync(path.join(dir, 'agents/reviewer/agent.yaml'), 'utf8')).spec.mcp, ['playwright', 'docs']);
  assert.equal(Object.hasOwn(parse(fs.readFileSync(path.join(dir, 'agents/implementer/agent.yaml'), 'utf8')).spec, 'mcp'), false);
  const { tree, out } = rendered(dir);
  assert.deepEqual(out.refusals, []);
  assert.match(fs.readFileSync(path.join(tree, 'workflows/agents/reviewer.md'), 'utf8'), /^mcp: playwright, docs$/m);
  assert.doesNotMatch(fs.readFileSync(path.join(tree, 'workflows/agents/implementer.md'), 'utf8'), /^mcp:/m);
  const fills = { factory: 'team', workflow: 'dev', agents: { implement: 'implementer', review: 'reviewer', ship: 'shipper' } };
  const review = loadWorkflows(path.join(tree, 'workflows', 'dev'), {}, fills).find((step) => step.name === 'review');
  assert.deepEqual(review?.agent?.mcp, ['playwright', 'docs']);
});

test("a step's mcp: line has its place in a template: exported in the step's overrides, and rendered back as the step's own line", () => {
  const repo = scratch('wf-render-repo-');
  fs.renameSync(teamCopy(), path.join(repo, 'workflows'));
  const step = path.join(repo, 'workflows', 'dev', 'review.md');
  fs.writeFileSync(step, fs.readFileSync(step, 'utf8').replace('---\n', '---\nmcp: docs, playwright\n'));
  const dir = path.join(scratch('wf-render-out-'), 'team');
  exportTemplate({ dir, from: repo });
  const yaml = path.join(dir, 'workflows/dev/workflow.yaml');
  const steps = parse(fs.readFileSync(yaml, 'utf8')).spec.steps as Array<{ name: string; overrides?: { mcp?: string[] } }>;
  assert.deepEqual(steps.find((s) => s.name === 'review')?.overrides?.mcp, ['docs', 'playwright']);
  assert.equal(Object.hasOwn(parse(fs.readFileSync(path.join(dir, 'agents/reviewer/agent.yaml'), 'utf8')).spec, 'mcp'), false);
  const { tree, out } = rendered(dir);
  assert.deepEqual(out.refusals, []);
  assert.match(fs.readFileSync(path.join(tree, 'workflows/dev/review.md'), 'utf8'), /^mcp: docs, playwright$/m);
  assert.doesNotMatch(fs.readFileSync(path.join(tree, 'workflows/agents/reviewer.md'), 'utf8'), /^mcp:/m);
  const fills = { factory: 'team', workflow: 'dev', agents: { implement: 'implementer', review: 'reviewer', ship: 'shipper' } };
  const review = loadWorkflows(path.join(tree, 'workflows', 'dev'), {}, fills).find((s) => s.name === 'review');
  assert.deepEqual(
    [review?.mcp, review?.agent?.mcp],
    [
      ['docs', 'playwright'],
      ['docs', 'playwright'],
    ],
  );
  fs.writeFileSync(yaml, fs.readFileSync(yaml, 'utf8').replace('- docs', '- docs server'));
  assert.throws(
    () => loadWorkflows(path.join(rendered(dir).tree, 'workflows', 'dev'), {}, fills),
    (err: Error) => /review: `mcp: docs server, playwright` has `docs server`, which is not a server's name/.test(err.message),
    "a name the template writes that is no server's is refused as the step file is read, as its own line would be",
  );
});

test('a file a render asks for that is no file of the template is refused, so a {path} cannot reach outside it', () => {
  const { dir } = exported();
  fs.writeFileSync(path.join(path.dirname(dir), 'outside.md'), 'not the template');
  const read = openTemplate(dir);
  assert.equal(read.text('nemia.yaml'), fs.readFileSync(path.join(dir, 'nemia.yaml'), 'utf8'));
  assert.throws(
    () => read.text('../outside.md'),
    (err: Error & { _tag?: string }) =>
      err._tag === 'Invalid' &&
      err.message === `../outside.md is no file of the template ${dir}: name a file of the template, by its path in it.`,
  );
});

test('a parameter is given where a document names it, and a default where no --set gives it', () => {
  const { dir } = exported();
  edit(dir, 'nemia.yaml', (spec) => {
    spec.parameters = {
      model: { type: 'string', description: 'the model', default: 'sonnet' },
      budget: { type: 'number', description: 'dollars' },
    };
    spec.instruction = 'Operate this factory.';
  });
  edit(dir, 'agents/reviewer/agent.yaml', (spec) => {
    spec.claude.model = { param: 'model' };
  });
  edit(dir, 'workflows/dev/workflow.yaml', (spec) => {
    spec.steps[1].budget = { param: 'budget' };
  });
  const { tree } = rendered(dir, ['budget=7']);
  assert.match(fs.readFileSync(path.join(tree, 'workflows/agents/reviewer.md'), 'utf8'), /^model: sonnet$/m);
  assert.match(fs.readFileSync(path.join(tree, 'workflows/dev/review.md'), 'utf8'), /^budget: 7$/m);
  assert.equal(fs.readFileSync(path.join(tree, 'NEMIA.md'), 'utf8'), 'Operate this factory.\n');
  const { tree: other } = rendered(dir, ['budget=9', 'model=haiku']);
  assert.match(fs.readFileSync(path.join(other, 'workflows/agents/reviewer.md'), 'utf8'), /^model: haiku$/m);
});

test("a template's RULES.md, or its manifest's rules, is rendered as the tree's RULES.md; a template with neither renders none", () => {
  const { dir } = exported();
  assert.equal(
    rendered(dir).out.files.some((f) => f.path === 'RULES.md'),
    false,
  );
  fs.writeFileSync(path.join(dir, 'RULES.md'), '\nNever push on a Friday.\n\n');
  const fromFile = rendered(dir);
  assert.deepEqual(fromFile.out.refusals, []);
  assert.equal(fs.readFileSync(path.join(fromFile.tree, 'RULES.md'), 'utf8'), 'Never push on a Friday.\n');
  edit(dir, 'nemia.yaml', (spec) => {
    spec.rules = 'Write the tests first.';
  });
  assert.equal(fs.readFileSync(path.join(rendered(dir).tree, 'RULES.md'), 'utf8'), 'Write the tests first.\n', "the manifest's own first");
  fs.writeFileSync(path.join(dir, 'RULES.md'), '  \n');
  edit(dir, 'nemia.yaml', (spec) => {
    delete spec.rules;
  });
  assert.equal(
    rendered(dir).out.files.some((f) => f.path === 'RULES.md'),
    false,
    'blank rules are none',
  );
});

test('REFUSED by name, nothing to write: rules that open with a frontmatter block, in RULES.md or in the manifest', () => {
  const { dir } = exported();
  fs.writeFileSync(path.join(dir, 'RULES.md'), '---\nallowedTools: Bash\n---\nUse Bash.\n');
  const fromFile = renderFactory(openTemplate(dir), {});
  assert.equal(fromFile.refusals.length, 1, fromFile.refusals.join('\n'));
  assert.match(fromFile.refusals[0], /^RULES\.md opens with a frontmatter block, a first line of `---`\. A factory's rules only add words/);
  assert.match(fromFile.refusals[0], /Mend the template, and apply again\.$/);
  assert.equal(
    fromFile.files.some((f) => f.path === 'RULES.md'),
    false,
  );
  fs.rmSync(path.join(dir, 'RULES.md'));
  edit(dir, 'nemia.yaml', (spec) => {
    spec.rules = '---\nmodel: opus\n---\n';
  });
  assert.match(renderFactory(openTemplate(dir), {}).refusals.join('\n'), /^RULES\.md opens with a frontmatter block/);
});

test("a harness's options, and a block of a harness it does not run on, are refused by name", () => {
  const { dir } = exported();
  edit(dir, 'agents/reviewer/agent.yaml', (spec) => {
    spec.claude.options = { verbose: true };
    spec.codex = { model: 'gpt-5' };
  });
  edit(dir, 'workflows/dev/workflow.yaml', (spec) => {
    spec.steps[0].overrides = { codex: { model: 'gpt-5' } };
  });
  const { out } = rendered(dir);
  assert.equal(out.refusals.length, 3, out.refusals.join('\n'));
  assert.match(out.refusals.join('\n'), /agents\/reviewer\/agent\.yaml: `codex:` is a block for codex, and this runs on claude/);
  assert.match(out.refusals.join('\n'), /agents\/reviewer\/agent\.yaml: `claude\.options` is handed to claude as it is/);
  assert.match(
    out.refusals.join('\n'),
    /workflows\/dev\/workflow\.yaml, step implement: `codex:` is a block for codex, and this runs on claude/,
  );
});
