/**
 * The schema a frozen step is read back by (`FrozenStepSchema`), held to the parser it reads the output of: every step of every shipped
 * folder, as `wf start` freezes it, reads back as it was; the decoded type and `Workflow` are each the other; and a key of `STEP_KEYS` the
 * schema has no field for fails the typecheck.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Result, Schema } from 'effect';
import { FrozenStepSchema, loadWorkflows, workflowsIn, type FrozenStepFields } from '../src/workflow-store.ts';
import { asNamed, FORMER_KEYS, type Workflow } from '../src/workflow.ts';

const REPO = path.join(import.meta.dirname, '..', '..', '..');

/** Every shipped folder: the repository's, and the package's own with its `ui`. */
const FOLDERS = [
  ...workflowsIn(path.join(REPO, 'workflows')).map((name) => path.join(REPO, 'workflows', name)),
  path.join(import.meta.dirname, '..', 'workflows'),
  path.join(import.meta.dirname, '..', 'workflows', 'ui'),
];

const decode = Schema.decodeUnknownResult(FrozenStepSchema);

/** A step as a record holds it: through JSON, as `wf start` writes it and `readRun` reads it. */
const frozen = (step: Workflow): unknown => JSON.parse(JSON.stringify(step));

test('every step of every shipped folder, frozen, reads back by the schema as it was frozen', () => {
  assert.ok(FOLDERS.length >= 8, `the shipped folders are found: ${FOLDERS.join(', ')}`);
  let agents = 0;
  for (const dir of FOLDERS) {
    const steps = loadWorkflows(dir);
    assert.ok(steps.length > 0, `${dir} has steps`);
    for (const step of steps) {
      const decoded = decode(frozen(step));
      assert.ok(Result.isSuccess(decoded), `${dir}/${step.name} reads: ${Result.isFailure(decoded) ? String(decoded.failure) : ''}`);
      assert.deepEqual(decoded.success, frozen(step), `${dir}/${step.name} reads as it was frozen, no key dropped`);
      if (step.agent) agents += 1;
    }
  }
  assert.ok(agents > 0, 'a shipped step names an agent, so the agent is read too');
});

test('a step with every key the parser types, its agent and its output reads as it was frozen; one key off, it is refused', () => {
  const step: Workflow = {
    name: 'review',
    after: ['implement'],
    body: 'Read it.',
    resume: 'implement',
    input: ['implement'],
    workspace: 'folder',
    slot: 'none',
    harness: 'claude',
    model: 'opus',
    effort: 'high',
    context: 1_000_000,
    permissionMode: 'dontAsk',
    sandbox: 'read-only',
    tools: ['Read'],
    disallowedTools: ['Bash'],
    allowedTools: ['Edit(**)'],
    denials: 'fail',
    background: true,
    remote: false,
    deadlineSeconds: 600,
    budget: 2.5,
    check: 'npm test',
    retries: 1,
    gate: true,
    output: {
      file: 'review.json',
      schema: {
        type: 'object',
        properties: { verdict: { type: 'string' } },
        required: ['verdict'],
        additionalProperties: false,
        title: 'a key the parser keeps',
      },
    },
    loop: 'implement',
    rounds: 3,
    agent: {
      name: 'reviewer',
      keys: ['gate'],
      body: 'You review.',
      given: { gate: 'true' },
      instructions: 'Say what is wrong.',
      skills: ['look'],
      systemPrompt: 'no-coding',
    },
  };
  const decoded = decode(frozen(step));
  assert.ok(Result.isSuccess(decoded));
  assert.deepEqual(decoded.success, frozen(step));

  for (const [key, value] of [
    ['context', '1M'],
    ['background', 'true'],
    ['slot', 'all'],
    ['denials', 'warn'],
    ['after', 'implement'],
  ] as const) {
    assert.ok(Result.isFailure(decode({ ...(frozen(step) as object), [key]: value })), `${key}: ${value} is refused`);
  }
  assert.ok(
    Result.isFailure(decode({ ...(frozen(step) as object), agent: { ...step.agent, systemPrompt: 'mine' } })),
    'a system prompt outside SYSTEM_PROMPTS is refused',
  );
});

test('every former name of a key (`FORMER_KEYS`) is checked as the key it is now, on a step and in its agent, and read under the new', () => {
  for (const [former, now] of Object.entries(FORMER_KEYS)) {
    const step = {
      name: 'implement',
      after: [],
      body: '',
      [former]: ['SendMessage'],
      agent: { name: 'implementer', keys: [former], body: '', given: { [former]: 'SendMessage' } },
    };
    const decoded = decode(step);
    assert.ok(Result.isSuccess(decoded), `${former}: ${Result.isFailure(decoded) ? String(decoded.failure) : ''}`);
    assert.deepEqual(asNamed(decoded.success), {
      name: 'implement',
      after: [],
      body: '',
      [now]: ['SendMessage'],
      agent: { name: 'implementer', keys: [now], body: '', given: { [now]: 'SendMessage' } },
    });
    assert.ok(Result.isFailure(decode({ ...step, [former]: 'SendMessage' })), `${former} as text is refused, as ${now} is`);
  }
});

test('the decoded step, read under the names its keys have now, is a `Workflow`, and a `Workflow` is a decoded step', () => {
  type Decoded = typeof FrozenStepSchema.Type;
  const toWorkflow = (step: Decoded): Workflow => asNamed(step);
  const fromWorkflow = (step: Workflow): Decoded => step;
  const step: Workflow = { name: 'implement', after: [], body: '' };
  assert.deepEqual(toWorkflow(fromWorkflow(step)), step);
});

test('a field map without a field for a key of `STEP_KEYS` does not typecheck', () => {
  const short = (fields: FrozenStepFields): FrozenStepFields => {
    const { rounds: _, ...rest } = fields;
    // @ts-expect-error -- a field map missing `rounds` is no `FrozenStepFields`, as one missing any key of `STEP_KEYS` is not
    const missing: FrozenStepFields = rest;
    return missing;
  };
  assert.equal(typeof short, 'function');
});
