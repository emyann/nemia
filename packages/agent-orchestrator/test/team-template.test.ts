/**
 * This repository's own team exported as a template, as the operator's `nemia template export <dir> --from <repo> --factory nemia`
 * exports it: through a factory `nemia` filed in a scratch store over the repository, attaching every workflow of the team. The folder
 * passes `nemia template check`, each step that writes its own `output:` has its schema named and carried, and the render refuses
 * nothing and writes the line back; so the next change to a step's keys cannot break the export unseen. The team is found as what ships
 * is (`SHIPPED_HOLDERS`, `workflowsIn`), and its steps are read for the ones that name a schema, so this file names none of them. A
 * config guard of the team that imports the export program past the package's three entries, kept here (`tools/guards/CLAUDE.md`).
 * `WF_ROOT` is set before the import, since the store's modules read it as they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { scratch } from './scratch.ts';
import { REPO, SHIPPED_HOLDERS } from './team.ts';

const ROOT = scratch('wf-team-template-');
process.env.WF_ROOT = ROOT;
const { templated } = await import('./templated.ts');
const { exportTemplate, openTemplate } = templated(ROOT);
const { checkedTree, packageSkillNames } = await import('../src/template/template.store.ts');
const { TemplateDoor } = await import('../src/templates/templates.store.ts');
const { TemplateSource } = await import('../src/templates/templates.model.ts');
const { StoreRoot } = await import('../src/config/root.store.ts');
const { addFactory, attachWorkflow } = await import('../src/runner.ts');
const { renderFactory } = await import('../src/applied/index.ts');
const { workflowsIn } = await import('../src/folder/folder.store.ts');
const { stepFiles } = await import('../src/folder/folder.ts');
const { splitFrontmatter } = await import('../src/step/step.ts');
const { Effect } = await import('effect');

/** The repository's own team: the first place what ships is read from. */
const [HOLDER = ''] = SHIPPED_HOLDERS;

/** Each step of the team that writes its own `output:`: its workflow, its name and the file it names. */
function ownOutputs(workflows: readonly string[]): Array<{ workflow: string; step: string; file: string }> {
  return workflows.flatMap((workflow) =>
    stepFiles(fs.readdirSync(path.join(HOLDER, workflow))).flatMap((leaf) => {
      const step = leaf.slice(0, -'.md'.length);
      const { block } = splitFrontmatter(step, fs.readFileSync(path.join(HOLDER, workflow, leaf), 'utf8'));
      const file = block?.match(/^output:\s*(\S+)\s*$/m)?.[1];
      return file === undefined ? [] : [{ workflow, step, file }];
    }),
  );
}

test("this repository's team exports through a factory nemia, passes its check, and renders with nothing refused", () => {
  const workflows = workflowsIn(HOLDER);
  const owned = ownOutputs(workflows);
  assert.ok(owned.length > 0, 'the team holds a step that writes its own output:, which this guard is for: if none is left, say so here');
  addFactory({ name: 'nemia', repos: [REPO] });
  for (const workflow of workflows) attachWorkflow({ factory: 'nemia', workflow });
  const dir = path.join(scratch('wf-team-template-out-'), 'nemia');
  exportTemplate({ dir, from: REPO, factory: 'nemia' });

  const tree = Effect.runSync(
    Effect.provideService(
      Effect.gen(function* () {
        return yield* (yield* TemplateDoor).templates.read(TemplateSource.read(dir));
      }),
      StoreRoot,
      ROOT,
    ),
  );
  assert.deepEqual(checkedTree(tree, packageSkillNames()).problems, []);

  const out = renderFactory(openTemplate(dir), {});
  assert.deepEqual(out.refusals, []);
  for (const { workflow, step, file } of owned) {
    const folder = `workflows/${workflow}`;
    const steps = parse(fs.readFileSync(path.join(dir, folder, 'workflow.yaml'), 'utf8')).spec.steps as Array<Record<string, unknown>>;
    assert.deepEqual(steps.find((s) => s.name === step)?.output, { path: `${folder}/${file}` }, `${folder}/${step}`);
    assert.equal(
      fs.readFileSync(path.join(dir, folder, file), 'utf8'),
      fs.readFileSync(path.join(HOLDER, workflow, file), 'utf8'),
      `${folder}/${file} is carried as the team holds it`,
    );
    const rendered = out.files.find((f) => f.path === `${folder}/${step}.md`)?.text ?? '';
    assert.ok(rendered.split('\n').includes(`output: ${file}`), `${folder}/${step}.md is rendered with its output: line`);
    assert.ok(
      out.copies.some((copy) => copy.path === `${folder}/${file}`),
      `${folder}/${file} is copied beside its step`,
    );
  }
});
