/**
 * `workflows/dev-planned/`, the workflow for a brief that warrants a plan before the work, held to its shape at shipped defaults — so an
 * edit that gives the plan a tool that writes, drops the question it may ask, or unhooks implement from the plan fails the suite rather
 * than a run.
 *
 *   plan → implement ⇄ review
 *
 * Plan mode and AskUserQuestion are withheld from a session nobody sits beside, since nobody is there to answer them, so planning is a
 * step on tools that cannot write, whose closeout is the plan, and asking is that step's `blocked` with the question in `needs`, answered
 * by `wf retry --message`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Ajv } from 'ajv';
import { composeBrief, workspacePlan, type Run } from '../src/run.ts';
import { closeoutSchemaOf, type Closeout } from '../src/closeout.ts';
import { loopSpan, terminalSteps, type Workflow } from '../src/workflow.ts';
import { loadWorkflows } from '../src/workflow-store.ts';
import { toldIn } from './told.ts';

const REPO = path.join(import.meta.dirname, '..', '..', '..');
const PLANNED = path.join(REPO, 'workflows', 'dev-planned');
const DEV = path.join(REPO, 'workflows', 'dev');
const planned = loadWorkflows(PLANNED);
const steps = Object.fromEntries(planned.map((s) => [s.name, s]));
const dev = Object.fromEntries(loadWorkflows(DEV).map((s) => [s.name, s]));

/** A step's prose with its line breaks as spaces, so a sentence is found wherever the file wraps it. */
const said = (text: string) => text.replace(/\s+/g, ' ');

/** The tools that write into a workspace. */
const WRITES = ['Edit', 'Write', 'NotebookEdit', 'MultiEdit'];

/**
 * Why a step could write into its workspace, or `[]`: no `tools:` line, which is every tool; a tool that writes; or a mode other than
 * dontAsk, in which a Bash command the settings do not allow is asked about, or run, rather than denied.
 */
function writesBy(step: Workflow): string[] {
  if (!step.tools) return ['no tools: line, so every tool'];
  return [
    ...step.tools.filter((t) => WRITES.includes(t)).map((t) => `${t} writes`),
    ...(step.permissionMode === 'dontAsk' ? [] : [`permissionMode: ${step.permissionMode ?? 'the default'}, not dontAsk`]),
  ];
}

test("dev-planned loads, at shipped defaults, as plan → implement ⇄ review → ship: the plan first, implement reading it, dev's loop after, and the ending last", () => {
  assert.deepEqual(
    planned.map((s) => s.name),
    ['plan', 'implement', 'review', 'ship'],
    "in the order the steps run, not the folder's",
  );
  assert.deepEqual(
    [steps.plan.after, steps.implement.after, steps.review.after, steps.ship.after],
    [[], ['plan'], ['implement'], ['review']],
  );
  assert.deepEqual([steps.plan.input, steps.implement.input, steps.review.input], [undefined, ['plan'], undefined]);
  assert.deepEqual([steps.review.loop, steps.review.rounds], ['implement', 3]);
  assert.deepEqual(loopSpan(planned, steps.review), ['implement', 'review'], 'a round goes back to implement, not to planning');
  assert.deepEqual(
    terminalSteps(planned).map((s) => s.name),
    ['ship'],
  );
  assert.deepEqual(
    workspacePlan(planned, steps.implement),
    { kind: 'inherit', from: 'plan' },
    'a chain: implement works where the plan looked',
  );
  assert.deepEqual(workspacePlan(planned, steps.review), { kind: 'inherit', from: 'implement' }, 'and review where implement worked');
  assert.deepEqual(
    [steps.plan.check, steps.plan.retries, steps.plan.resume],
    [undefined, undefined, undefined],
    'a plan is its word, and a person reads it',
  );
});

test('REFUSED by machinery: plan has no tool that writes — read-only tools and Bash in dontAsk, denied the build and the e2e by name, as review is', () => {
  const { harness, model, tools, permissionMode, disallowedTools, output } = steps.plan;
  assert.deepEqual(
    { harness, model, tools, permissionMode, disallowedTools, output: output?.file },
    {
      harness: 'claude',
      model: 'opus',
      tools: ['Read', 'Grep', 'Glob', 'Bash', 'Skill', 'WebFetch', 'WebSearch'],
      permissionMode: 'dontAsk',
      disallowedTools: ['Bash(npm run build)', 'Bash(npm run e2e)'],
      output: 'plan.schema.json',
    },
  );
  assert.deepEqual(writesBy(steps.plan), []);
  assert.deepEqual(
    [tools, permissionMode, disallowedTools],
    [steps.review.tools, steps.review.permissionMode, steps.review.disallowedTools],
    "review's fence, word for word",
  );

  assert.deepEqual(
    writesBy({ ...steps.plan, tools: [...tools!, 'Edit'] }),
    ['Edit writes'],
    'the guard refuses a plan given a tool that writes',
  );
  assert.deepEqual(writesBy({ ...steps.plan, tools: undefined }), ['no tools: line, so every tool'], 'or every tool');
  assert.deepEqual(
    writesBy({ ...steps.plan, permissionMode: 'acceptEdits' }),
    ['permissionMode: acceptEdits, not dontAsk'],
    'or a mode that does not deny',
  );
  assert.deepEqual(writesBy(steps.implement), ['no tools: line, so every tool'], 'implement writes, and is not a plan');
});

test("plan's closeout is the plan, strict — approach, files with a line each, steps, risks — whether it signs off done or blocked, and nothing short of it", () => {
  const validate = new Ajv({ strict: true, allowUnionTypes: true }).compile(closeoutSchemaOf(steps.plan, Object.values(steps)));
  const plan = {
    approach: 'Carry the answer on the ask file, and compose it into the try’s brief.',
    files: [{ path: 'packages/agent-orchestrator/src/cli.ts', change: 'parse --message' }],
    steps: ['parse the flag', 'refuse an empty one', 'test both'],
    risks: [],
  };
  const closeout = (rest: object, outcome = 'done', needs: string | null = null) => ({
    outcome,
    summary: 'for the person',
    artifacts: [],
    needs,
    ...rest,
  });
  assert.equal(validate(closeout(plan)), true, JSON.stringify(validate.errors));
  assert.equal(
    validate(closeout(plan, 'blocked', 'Carry it on the ask, or on the record?')),
    true,
    'a question, beside the plan for the reading it would take',
  );
  assert.deepEqual(closeoutSchemaOf(steps.plan, Object.values(steps)).required, [
    'outcome',
    'summary',
    'artifacts',
    'needs',
    'approach',
    'files',
    'steps',
    'risks',
  ]);

  for (const field of Object.keys(plan)) {
    const { [field as keyof typeof plan]: _, ...without } = plan;
    assert.equal(validate(closeout(without)), false, `without ${field}`);
  }
  assert.equal(validate(closeout({ ...plan, files: [{ path: 'a.ts' }] })), false, 'a file without its line');
  assert.equal(validate(closeout({ ...plan, files: [{ path: 'a.ts', change: 'x', why: 'y' }] })), false, 'nothing undeclared');
  assert.equal(validate(closeout({ ...plan, steps: 'do it' })), false, 'steps are a list');
});

test("plan's brief says when to sign off done and when blocked with the question in needs, and that the answer comes back as `## Your answer`", () => {
  const body = said(toldIn(PLANNED, steps.plan));
  for (const sentence of [
    'When what was asked for reads one way, sign off `done` with the plan.',
    'When it admits two materially different readings',
    'do not choose between them. Sign off `blocked`, with the plan for the reading you would take, and put the question in `needs`',
    "A person answers with `wf retry`, and the answer comes back to you in the try's brief, under `## Try <n>`, as `## Your answer`.",
    'You work read-only: write nothing into the workspace.',
  ])
    assert.ok(
      body.includes(sentence),
      `${sentence}\n\nis told by the planner's skill ask-when-it-reads-two-ways, given whole after its instructions:\n\n${body}`,
    );
});

test("implement is dev's, after the plan and reading it: the plan reaches it under `## From plan`, as data, and never plan's summary — review is dev's, file for file", () => {
  const { after, input, body, agent, ...keys } = steps.implement;
  const { after: _after, input: _input, body: devBody, agent: devAgent, ...devKeys } = dev.implement;
  assert.deepEqual([after, input], [['plan'], ['plan']]);
  assert.deepEqual(keys, devKeys, "harness, model, check and disallowedTools as dev's");
  assert.deepEqual([agent?.name, devAgent?.name], ['implementer', 'implementer'], 'the same agent does the work');
  for (const paragraph of devBody.split('\n\n')) assert.ok(said(body).includes(said(paragraph)), paragraph);
  for (const file of ['review.md', 'ship.md']) {
    assert.equal(fs.readFileSync(path.join(PLANNED, file), 'utf8'), fs.readFileSync(path.join(DEV, file), 'utf8'), file);
  }

  const run: Run = {
    id: 'r-1',
    repo: '/repo',
    workspace: '/wt',
    baseRef: 'abc123',
    branch: 'main',
    isolate: true,
    brief: 'add --message to wf retry',
    workflowDir: PLANNED,
    createdAt: '2026-09-14T00:00:00Z',
    steps: { plan: { taskId: 't1' }, implement: { taskId: null }, review: { taskId: null } },
  };
  const output = {
    approach: 'on the ask file',
    files: [{ path: 'src/cli.ts', change: 'parse --message' }],
    steps: ['parse it'],
    risks: ['a legacy ask file'],
  };
  const signed: Closeout = { outcome: 'done', summary: 'PLANNER-ACCOUNT', artifacts: [], output };
  const brief = composeBrief(steps.implement, run, planned, (name) => (name === 'plan' ? signed : undefined));
  assert.ok(
    brief.includes(
      '\n## From plan\n\nWhat plan declared in its closeout — `approach`, `files`, `steps`, `risks` — given to you because this step reads it (`input: plan`).',
    ),
    brief,
  );
  assert.deepEqual(JSON.parse(/## From plan\n[\s\S]*?\n(`{3,})json\n([\s\S]*?)\n\1/.exec(brief)![2]), output);
  assert.doesNotMatch(brief, /PLANNER-ACCOUNT/);
});

test("dev-planned-build is dev-planned with dev-build's check on implement: the plan first, the same fence, the build before implement is verified and the e2e on the merged tree", () => {
  const built = path.join(REPO, 'workflows', 'dev-planned-build');
  const steps = loadWorkflows(built);
  assert.deepEqual(
    steps.map((s) => s.name),
    loadWorkflows(PLANNED).map((s) => s.name),
    'the same steps in the same order',
  );
  const byName = Object.fromEntries(steps.map((s) => [s.name, s]));
  assert.equal(
    byName.implement?.check,
    loadWorkflows(path.join(REPO, 'workflows', 'dev-build')).find((s) => s.name === 'implement')?.check,
  );
  assert.match(
    byName.implement.check!,
    /^npm test && npm run typecheck && npm run lint && npm run build && if \[ -n "\$\{WF_BASE_REF:-\}" \]; then .*; else npm run e2e; fi$/,
  );
  const plannedByName = Object.fromEntries(loadWorkflows(PLANNED).map((s) => [s.name, s]));
  for (const name of ['plan', 'review'])
    assert.deepEqual({ ...byName[name], body: '' }, { ...plannedByName[name], body: '' }, `${name} is dev-planned's, key for key`);
  assert.equal(
    fs.readFileSync(path.join(built, 'ship.md'), 'utf8'),
    fs.readFileSync(path.join(REPO, 'workflows', 'dev-build', 'ship.md'), 'utf8'),
    "its ending is dev-build's, file for file: the same step, with the build and the e2e in the check it runs itself",
  );
});
