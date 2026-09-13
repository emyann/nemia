/**
 * `workflows/ui/`, the workflow for a change a person will see, held to its shape — so an edit that drops
 * the browser check, the screenshots or the fan-in fails the suite rather than a run.
 *
 *   implement ──► review (codex, read-only: the code)       ──┐
 *             └─► look   (claude: implement's screenshots)   ──┴─► respond (resumes implement)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { closeoutSchemaOf, composeBrief, workspacePlan, type Closeout, type Run } from '../src/run.ts';
import { loadWorkflows, terminalSteps } from '../src/workflow.ts';

const WORKFLOWS = path.join(import.meta.dirname, '..', 'workflows');
const E2E = 'npm test && npm run typecheck && npm run build && npm run e2e';
const ui = loadWorkflows(path.join(WORKFLOWS, 'ui'));
const steps = Object.fromEntries(ui.map((s) => [s.name, s]));

test('the ui workflow loads — every declared schema strict, or it would not — with its four steps', () => {
  assert.deepEqual(ui.map((s) => s.name), ['implement', 'look', 'respond', 'review']);
  assert.deepEqual(ui.filter((s) => s.output).map((s) => [s.name, s.output!.schema.additionalProperties]), [
    ['implement', false], ['look', false], ['review', false],
  ]);
});

test('the steps that edit are checked in a browser; the two that only read declare no check', () => {
  assert.equal(steps.implement?.check, E2E);
  assert.equal(steps.respond?.check, E2E);
  assert.equal(steps.review?.check, undefined);
  assert.equal(steps.look?.check, undefined);
});

test('implement declares the screenshots it looked at and the pages they show, and only look reads them', () => {
  assert.equal(steps.implement?.harness, 'claude');
  assert.equal(steps.implement?.output?.file, 'implement.schema.json');
  const declared = steps.implement!.output!.schema.properties as Record<string, { type: string; items: unknown }>;
  assert.deepEqual(Object.keys(declared), ['screenshots', 'pages']);
  for (const field of ['screenshots', 'pages']) assert.deepEqual([declared[field]!.type, declared[field]!.items], ['array', { type: 'string' }], field);
  assert.deepEqual(ui.filter((s) => s.input?.includes('implement')).map((s) => s.name), ['look']);
});

test('look reads implement on Claude, which reads images, and hands on findings by page and theme', () => {
  assert.equal(steps.look?.harness, 'claude');
  assert.deepEqual(steps.look?.after, ['implement']);
  assert.deepEqual(steps.look?.input, ['implement']);
  assert.equal(steps.look?.output?.file, 'look.schema.json');
  const findings = steps.look!.output!.schema.properties.findings as { type: string; items: { required: string[]; properties: { theme: { enum: string[] } } } };
  assert.equal(findings.type, 'array');
  assert.deepEqual(findings.items.required, ['page', 'theme', 'screenshot', 'what']);
  assert.deepEqual(findings.items.properties.theme.enum, ['light', 'dark', 'both']);
});

test('the two reviewers write nothing by machinery: look has only tools that read, review the read-only sandbox — and the steps that edit have every tool', () => {
  assert.deepEqual(steps.look?.tools, ['Read', 'Grep', 'Glob']);
  assert.deepEqual(steps.look?.tools?.filter((t) => ['Edit', 'Write', 'NotebookEdit', 'Bash'].includes(t)), [], 'nothing that writes');
  // Codex has no tool list, so its reviewer's fence is its sandbox, and a `tools:` line on it would be refused at load.
  assert.deepEqual([steps.review?.harness, steps.review?.permissionMode, steps.review?.tools], ['codex', 'read-only', undefined]);
  assert.deepEqual([steps.implement?.tools, steps.respond?.tools], [undefined, undefined]);
});

test('review is the review workflows/ ships — codex, read-only, the same prose and the same findings — less its loop', () => {
  // workflows/ loops its review back to implement. ui/ does not: its respond is a fan-in of two reviewers, and a
  // loop whose steps fork is refused at load. Everything else is the same review, and held to it here.
  const shipped = loadWorkflows(WORKFLOWS).find((s) => s.name === 'review')!;
  const { again: _, ...findings } = shipped.output!.schema.properties;
  const schema = { ...shipped.output!.schema, properties: findings, required: shipped.output!.schema.required.filter((f) => f !== 'again') };
  assert.deepEqual(steps.review, { ...shipped, loop: undefined, rounds: undefined, output: { ...shipped.output!, schema } });
  assert.equal(steps.review?.permissionMode, 'read-only');
  assert.deepEqual([shipped.loop, steps.review?.loop], ['implement', undefined], 'the one difference');
});

test('respond is the fan-in: after review and look, reading both, continuing implement, in a workspace that merges all three', () => {
  const respond = steps.respond!;
  assert.deepEqual([...respond.after].sort(), ['implement', 'look', 'review']);
  assert.equal(respond.resume, 'implement');
  assert.deepEqual(respond.input, ['review', 'look']);
  assert.deepEqual(workspacePlan(ui, respond), { kind: 'merge', from: 'implement', also: ['look', 'review'] });
  assert.deepEqual(terminalSteps(ui).map((s) => s.name), ['respond']);
  // The two reviewers work beside each other, each in a worktree of its own off implement's branch.
  assert.deepEqual([workspacePlan(ui, steps.review!), workspacePlan(ui, steps.look!)], [{ kind: 'fork', from: 'implement' }, { kind: 'fork', from: 'implement' }]);
});

test("look is handed implement's screenshots and pages, and not its summary", () => {
  const run: Run = {
    id: 'r-1', repo: '/repo', workspace: '/repo', baseRef: 'abc123', branch: 'main', isolate: true, brief: 'Make the Factory darker',
    workflowDir: path.join(WORKFLOWS, 'ui'), createdAt: '2026-09-13T00:00:00Z', steps: { implement: { taskId: 't1' }, look: { taskId: null } },
  };
  const shot = '/wf/runs/r-1/artifacts/implement/factory-dark.png';
  const said: Closeout = { outcome: 'done', summary: 'IMPLEMENTER-ACCOUNT', artifacts: [shot], output: { screenshots: [shot], pages: ['/'] } };
  const brief = composeBrief(steps.look!, run, ui, (name) => (name === 'implement' ? said : undefined), '/wf/runs/r-1/artifacts/look');
  assert.match(brief, /\n## From implement\n/);
  assert.ok(brief.includes(JSON.stringify(shot)), brief);
  assert.doesNotMatch(brief, /IMPLEMENTER-ACCOUNT/);
  assert.deepEqual(closeoutSchemaOf(steps.look!).required, ['outcome', 'summary', 'artifacts', 'needs', 'findings']);
});
