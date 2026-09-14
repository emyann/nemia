/**
 * `workflows/ui/`, the workflow for a change a person will see, held to its shape — so an edit that drops
 * the browser check, the screenshots, the look or the loop fails the suite rather than a run.
 *
 *   implement ⇄ review   (review: the diff, and implement's screenshots and the pages beside it)
 *
 * Looking is the look skill (`.claude/skills/look/SKILL.md`), which both steps use. It was a step of its own, with a
 * respond to answer both reviewers, until the reviewer ran on Claude and the loop gave the edge back (plan §4 U2).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Ajv } from 'ajv';
import { closeoutSchemaOf, composeBrief, workspacePlan, type Closeout, type Run } from '../src/run.ts';
import { loadWorkflows, loopSpan, terminalSteps } from '../src/workflow.ts';

const REPO = path.join(import.meta.dirname, '..', '..', '..');
const WORKFLOWS = path.join(import.meta.dirname, '..', 'workflows');
const E2E = 'npm test && npm run typecheck && npm run build && npm run e2e';
const ui = loadWorkflows(path.join(WORKFLOWS, 'ui'));
const steps = Object.fromEntries(ui.map((s) => [s.name, s]));

/** A step's prose with its line breaks as spaces, so a sentence is found wherever the file wraps it. */
const said = (text: string) => text.replace(/\s+/g, ' ');

/**
 * The skills a step's body tells it to use and it could not reach: one named by a file the repository does not have, and one named
 * only as `the <name> skill` on a step with no Skill tool, which the body is all it is told. A `tools:` line without `Skill` gives a
 * session no Skill tool — measured with Claude Code 2.1.270, whose session still lists the repository's skills beside it — so
 * such a step must be told the skill's file, which Read opens.
 */
function unreachableSkills(step: { body: string; tools?: string[] }): string[] {
  const text = said(step.body);
  const problems = new Set<string>();
  for (const [, file] of text.matchAll(/`(\.claude\/skills\/[^`/]+\/SKILL\.md)`/g)) {
    if (!fs.existsSync(path.join(REPO, file!))) problems.add(`${file} is not in the repository`);
  }
  const loads = !step.tools || step.tools.includes('Skill');
  for (const [, name] of text.matchAll(/\bthe ([\w-]+) skill\b/g)) {
    if (!loads && !text.includes(`\`.claude/skills/${name}/SKILL.md\``)) problems.add(`the ${name} skill is named, and this step has no Skill tool and is not told its file`);
  }
  return [...problems];
}

test('the ui workflow loads as two steps and the loop between them — every declared schema strict, or it would not', () => {
  assert.deepEqual(ui.map((s) => s.name), ['implement', 'review']);
  assert.deepEqual(ui.filter((s) => s.output).map((s) => [s.name, s.output!.schema.additionalProperties]), [['implement', false], ['review', false]]);
  assert.deepEqual([steps.review?.loop, steps.review?.rounds], ['implement', 3]);
  assert.deepEqual(loopSpan(ui, steps.review!), ['implement', 'review']);
  assert.deepEqual(terminalSteps(ui).map((s) => s.name), ['review']);
  // A chain: review works in implement's workspace, so each round it reads the change as it stands.
  assert.deepEqual(workspacePlan(ui, steps.review!), { kind: 'inherit', from: 'implement' });
});

test('look and respond are gone: both steps use the look skill, which the repository carries, and the loop answers the review', () => {
  for (const gone of ['look.md', 'look.schema.json', 'respond.md']) assert.equal(fs.existsSync(path.join(WORKFLOWS, 'ui', gone)), false, `${gone} is gone`);
  assert.ok(said(steps.implement!.body).includes('Before you sign off, use the look skill on every page you changed'), steps.implement!.body);
  assert.ok(said(steps.review!.body).includes("Read the diff."), steps.review!.body);
  assert.ok(said(steps.review!.body).includes("use the look skill on implement's screenshots and on the pages, side by side"), steps.review!.body);

  // The skill the two briefs name is there, under that name, and the one browser tool it forbids is refused by the settings too.
  const skill = fs.readFileSync(path.join(REPO, '.claude', 'skills', 'look', 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: look\ndescription: \S/);
  assert.match(skill, /never `browser_run_code_unsafe`/i);
  const settings = JSON.parse(fs.readFileSync(path.join(REPO, '.claude', 'settings.json'), 'utf8')) as { permissions: { deny: string[] } };
  assert.ok(settings.permissions.deny.includes('mcp__playwright__browser_run_code_unsafe'), 'denied by name');
});

test('REFUSED: a step told to use the look skill that could not reach it — no Skill tool and not told its file, or told a file that is not there', () => {
  // review's tools leave out Skill, so its body is the only way it learns where the skill is.
  assert.equal(steps.review?.tools?.includes('Skill'), false);
  for (const step of ui) {
    assert.match(said(step.body), /`\.claude\/skills\/look\/SKILL\.md`/, `${step.name} is told the skill's file`);
    assert.deepEqual(unreachableSkills(step), [], step.name);
  }

  const review = steps.review!;
  const told = '`.claude/skills/look/SKILL.md`';
  assert.deepEqual(unreachableSkills({ ...review, body: review.body.replaceAll(told, 'the skill') }), [
    'the look skill is named, and this step has no Skill tool and is not told its file',
  ]);
  assert.ok(unreachableSkills({ ...review, body: review.body.replaceAll(told, '`.claude/skills/looking/SKILL.md`') }).includes(
    '.claude/skills/looking/SKILL.md is not in the repository',
  ), 'a renamed skill');
  // The rule is the Skill tool's: a step that has it loads the skill by name.
  assert.deepEqual(unreachableSkills({ ...review, tools: [...review.tools!, 'Skill'], body: review.body.replaceAll(told, 'the skill') }), []);
});

test('implement is checked in a browser; review, which writes nothing, declares no check', () => {
  assert.equal(steps.implement?.check, E2E);
  assert.equal(steps.review?.check, undefined);
});

test('implement declares the screenshots it looked at and the pages they show, and only review reads them', () => {
  assert.equal(steps.implement?.harness, 'claude');
  assert.equal(steps.implement?.output?.file, 'implement.schema.json');
  const declared = steps.implement!.output!.schema.properties as Record<string, { type: string; items: unknown }>;
  assert.deepEqual(Object.keys(declared), ['screenshots', 'pages']);
  for (const field of ['screenshots', 'pages']) assert.deepEqual([declared[field]!.type, declared[field]!.items], ['array', { type: 'string' }], field);
  assert.deepEqual(ui.filter((s) => s.input?.includes('implement')).map((s) => s.name), ['review']);
});

test('review writes nothing by machinery: on Claude, tools that read and Bash, in dontAsk — and implement has every tool', () => {
  const { harness, after, input, tools, permissionMode, output, loop, rounds } = steps.review!;
  assert.deepEqual({ harness, after, input, tools, permissionMode, output: output?.file, loop, rounds }, {
    harness: 'claude', after: ['implement'], input: ['implement'], tools: ['Read', 'Grep', 'Glob', 'Bash'], permissionMode: 'dontAsk',
    output: 'review.schema.json', loop: 'implement', rounds: 3,
  });
  assert.deepEqual(tools?.filter((t) => ['Edit', 'Write', 'NotebookEdit'].includes(t)), [], 'nothing that edits');
  assert.equal(steps.implement?.tools, undefined);
});

type Branch = { type: string; properties: Record<string, unknown>; required: string[]; additionalProperties: boolean };
type Findings = { type: string; items: { properties: { where: { anyOf: Branch[] }; what: unknown }; required: string[]; additionalProperties: boolean } };

test("review's schema is the shipped review's, `again` and all, with a finding's place a file and a line or a page and a theme", () => {
  const shipped = loadWorkflows(WORKFLOWS).find((s) => s.name === 'review')!.output!.schema;
  const schema = steps.review!.output!.schema;
  assert.deepEqual(schema.required, shipped.required);
  assert.deepEqual(schema.properties.again, shipped.properties.again);

  const findings = schema.properties.findings as unknown as Findings;
  const theirs = (shipped.properties.findings as { items: { properties: Record<string, unknown> } }).items.properties;
  assert.equal(findings.type, 'array');
  assert.deepEqual([findings.items.required, findings.items.additionalProperties], [['where', 'what'], false]);
  const [code, page] = findings.items.properties.where.anyOf;
  assert.equal(findings.items.properties.where.anyOf.length, 2);
  assert.deepEqual([code!.required, code!.additionalProperties, page!.required, page!.additionalProperties], [['file', 'line'], false, ['page', 'theme'], false]);
  assert.deepEqual(code!.properties, { file: theirs.file, line: theirs.line }, "a file and a line, as the shipped review names them");
  assert.deepEqual((page!.properties.theme as { enum: string[] }).enum, ['light', 'dark', 'both']);
});

test('REFUSED: a review finding that names neither a file nor a page — nor half of one, nor both at once — in the closeout review is filed with', () => {
  const validate = new Ajv({ strict: true, allowUnionTypes: true }).compile(closeoutSchemaOf(steps.review!));
  const closeout = (...findings: unknown[]) => ({ outcome: 'done', summary: 'Read and looked.', artifacts: [], needs: null, findings, again: findings.length > 0 });
  const what = 'The legend covers the last row of nodes.';

  for (const allowed of [
    closeout(),
    closeout({ where: { file: 'apps/web/src/components/StepNode.tsx', line: 12 }, what }),
    closeout({ where: { file: 'apps/web/test/components.test.ts', line: null }, what }),
    closeout({ where: { page: '/workflows', theme: 'dark' }, what }),
  ]) {
    assert.equal(validate(allowed), true, `${JSON.stringify(allowed.findings)}: ${JSON.stringify(validate.errors)}`);
  }

  for (const refused of [
    { where: {}, what },
    { where: { what }, what },
    { where: { file: 'apps/web/src/components/StepNode.tsx' }, what },
    { where: { page: '/workflows' }, what },
    { where: { page: '/workflows', theme: 'sepia' }, what },
    { where: { file: 'apps/web/src/components/StepNode.tsx', line: 12, page: '/workflows', theme: 'dark' }, what },
    { where: null, what },
    { file: 'apps/web/src/components/StepNode.tsx', line: 12, what },
    { where: { page: '/workflows', theme: 'light' } },
  ]) {
    assert.equal(validate(closeout(refused)), false, JSON.stringify(refused));
    // Refused for the finding, and for nothing else of the closeout.
    assert.ok(validate.errors!.every((e) => e.instancePath.startsWith('/findings/0')), JSON.stringify(validate.errors));
  }
});

/** The files of two workflow folders that differ — missing from either, or not the same bytes — READMEs aside, which describe where each lives. */
function differences(ours: string, theirs: string): string[] {
  const files = (dir: string) => fs.readdirSync(dir).filter((f) => f !== 'README.md');
  const all = [...new Set([...files(ours), ...files(theirs)])].sort();
  return all.filter((f) => {
    const [a, b] = [path.join(ours, f), path.join(theirs, f)];
    return !fs.existsSync(a) || !fs.existsSync(b) || !fs.readFileSync(a).equals(fs.readFileSync(b));
  });
}

test("the repository's workflows/ui/ is the package's, file for file — and a copy that is not is caught", () => {
  const shipped = path.join(WORKFLOWS, 'ui');
  const drifted = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-ui-copy-'));
  fs.cpSync(shipped, drifted, { recursive: true });
  fs.appendFileSync(path.join(drifted, 'review.md'), '\nAlso check the spelling.\n');
  fs.writeFileSync(path.join(drifted, 'look.md'), '---\nafter: implement\n---\nLook.\n');
  fs.rmSync(path.join(drifted, 'implement.schema.json'));
  fs.writeFileSync(path.join(drifted, 'README.md'), '# Not the package\n');
  assert.deepEqual(differences(drifted, shipped), ['implement.schema.json', 'look.md', 'review.md'], 'the README may differ, and nothing else');
  fs.rmSync(drifted, { recursive: true, force: true });

  const repository = path.join(REPO, 'workflows', 'ui');
  assert.deepEqual(differences(repository, shipped), []);
  assert.ok(fs.existsSync(path.join(repository, 'README.md')), 'the repository copy says what it is');
});

test("review is handed implement's screenshots and pages, and not its summary, beside the loop's contract", () => {
  const run: Run = {
    id: 'r-1', repo: '/repo', workspace: '/repo', baseRef: 'abc123', branch: 'main', isolate: true, brief: 'Make the Factory darker',
    workflowDir: path.join(WORKFLOWS, 'ui'), createdAt: '2026-09-13T00:00:00Z', steps: { implement: { taskId: 't1' }, review: { taskId: null } },
  };
  const shot = '/wf/runs/r-1/artifacts/implement/factory-dark.png';
  const told: Closeout = { outcome: 'done', summary: 'IMPLEMENTER-ACCOUNT', artifacts: [shot], output: { screenshots: [shot], pages: ['/'] } };
  const brief = composeBrief(steps.review!, run, ui, (name) => (name === 'implement' ? told : undefined), '/wf/runs/r-1/artifacts/review');
  assert.match(brief, /\n## From implement\n/);
  assert.ok(brief.includes(JSON.stringify(shot)), brief);
  assert.doesNotMatch(brief, /IMPLEMENTER-ACCOUNT/);
  assert.match(brief, /\n## Round 1 of 3\n/);
  assert.deepEqual(closeoutSchemaOf(steps.review!).required, ['outcome', 'summary', 'artifacts', 'needs', 'findings', 'again']);
});
