/**
 * The schema a frozen step is read back by (`FrozenStepSchema`), held to the parser it reads the output of: every step of every folder
 * shipped and of the tests' team, as `nemia start` freezes it, reads back as it was; the decoded type and `Workflow` are each the other;
 * and a key of `STEP_KEYS` the schema has no field for fails the typecheck.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Result, Schema } from 'effect';
import { FrozenStepSchema, loadWorkflows, type FrozenStepFields } from '../src/folder/folder.store.ts';
import { asNamed, FORMER_KEYS, type Workflow } from '../src/workflow.ts';
import { ownDenies } from '../src/workflow/index.ts';
import { placesOf, shippedFolders, TEAM_DEV } from './team.ts';

/** Every folder shipped (`team.ts`), and the tests' team's `dev`. */
const FOLDERS = [...shippedFolders(), TEAM_DEV];

const decode = Schema.decodeUnknownResult(FrozenStepSchema);

/** A step as a record holds it: through JSON, as `nemia start` writes it and `readRun` reads it. */
const frozen = (step: Workflow): unknown => JSON.parse(JSON.stringify(step));

test("every step of every folder shipped and of the tests' team, frozen, reads back by the schema as it was frozen", () => {
  assert.ok(FOLDERS.includes(TEAM_DEV), `the team is read: ${FOLDERS.join(', ')}`);
  let agents = 0;
  for (const dir of FOLDERS) {
    const steps = loadWorkflows(dir, placesOf(dir));
    assert.ok(steps.length > 0, `${dir} has steps`);
    for (const step of steps) {
      const decoded = decode(frozen(step));
      assert.ok(Result.isSuccess(decoded), `${dir}/${step.name} reads: ${Result.isFailure(decoded) ? String(decoded.failure) : ''}`);
      assert.deepEqual(decoded.success, frozen(step), `${dir}/${step.name} reads as it was frozen, no key dropped`);
      if (step.agent) agents += 1;
    }
  }
  assert.ok(agents > 0, 'a step names an agent, so the agent is read too');
});

test('a step with every key the parser types, its agent and its output reads as it was frozen; one key off, it is refused', () => {
  const step: Workflow = {
    name: 'review',
    after: ['implement'],
    body: 'Read it.',
    resume: 'implement',
    input: ['implement'],
    place: 'folder',
    workspace: 'base',
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
    tally: ['verdict'],
    loop: 'implement',
    rounds: 3,
    agent: {
      name: 'reviewer',
      keys: ['gate'],
      body: 'You review.',
      given: { gate: 'true' },
      instructions: 'Say what is wrong.',
      skills: ['look'],
      harnessPrompt: 'no-coding',
      agentDenies: ['Bash'],
    },
  };
  const decoded = decode(frozen(step));
  assert.ok(Result.isSuccess(decoded));
  assert.deepEqual(decoded.success, frozen(step), "the agent's denies kept apart among them");
  assert.deepEqual(ownDenies(decoded.success as Workflow), [], "and the step's own line is what its agent did not deny");

  for (const [key, value] of [
    ['context', '1M'],
    ['slot', 'all'],
    ['denials', 'warn'],
    ['after', 'implement'],
    ['tally', 3],
    ['tally', 'verdict'],
    ['place', 'cloud'],
    ['workspace', 'worktree'],
    ['background', 'true'],
  ] as const) {
    assert.ok(Result.isFailure(decode({ ...(frozen(step) as object), [key]: value })), `${key}: ${value} is refused`);
  }
  assert.ok(
    Result.isFailure(decode({ ...(frozen(step) as object), agent: { ...step.agent, agentDenies: 'Bash' } })),
    "an agent's denies are a list, or refused",
  );
  for (const agent of [{ harnessPrompt: 'mine' }, { harnessPrompt: 'own' }, { systemPrompt: 'mine' }, { systemPrompt: 'replace' }]) {
    const { harnessPrompt: _, ...rest } = step.agent!;
    assert.ok(
      Result.isFailure(decode({ ...(frozen(step) as object), agent: { ...rest, ...agent } })),
      `${JSON.stringify(agent)} is refused: a harness prompt outside HARNESS_PROMPTS, or a former one outside its three words`,
    );
  }
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

/**
 * A field map without a field for a key of `STEP_KEYS` does not typecheck. Nothing calls this: the typecheck reads its lines, and an
 * `@ts-expect-error` over code that stops erring is the failure.
 */
function _shortFieldMap(fields: FrozenStepFields): FrozenStepFields {
  const { rounds: _, ...rest } = fields;
  // @ts-expect-error -- a field map missing `rounds` is no `FrozenStepFields`, as one missing any key of `STEP_KEYS` is not
  const missing: FrozenStepFields = rest;
  return missing;
}
