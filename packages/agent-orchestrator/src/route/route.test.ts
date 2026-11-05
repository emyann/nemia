/**
 * What load refuses of a workflow's routing (`routeRefusal`, called by `validate`), one row per refusal of the design's §1, each a
 * `WorkflowError` (an `Invalid`, exit code 2) — never its sentence; then the shapes of `route:` a step file reads (`parseWorkflow`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../workflow/validate.ts';
import { parseWorkflow, renderStep } from '../workflow/step-file.ts';
import { DEFAULT_ROUNDS, WorkflowError, type Workflow } from '../step/step.ts';

const step = (name: string, after: string[] = []): Workflow => ({ name, after, body: `do ${name}` });

/** `plan` declares `surface`, a fact: the surface the change touches, one of three. */
const PLAN_SCHEMA = {
  type: 'object' as const,
  properties: { surface: { type: 'string', enum: ['web', 'backend', 'docs'] } },
  required: ['surface'],
  additionalProperties: false as const,
};
const TABLE = { kind: 'table' as const, from: 'plan.surface', table: { web: 'web', backend: 'backend', docs: 'docs' } };

/** plan → triage (a table over plan's surface, docs ends the run) → build-web | build-backend → notes. */
const TRIAGE = (): Workflow[] => [
  { ...step('plan'), output: { file: 'plan.schema.json', schema: PLAN_SCHEMA } },
  { ...step('triage', ['plan']), input: ['plan'], routes: ['web', 'backend', 'docs'], route: TABLE, ends: ['docs'] },
  { ...step('build-web', ['triage']), when: ['web'] },
  { ...step('build-backend', ['triage']), when: ['backend'] },
  step('notes', ['build-web', 'build-backend']),
];

/** The triage workflow with the step `name` replaced by what `change` makes of it, or added where it has none. */
const changed = (name: string, change: (s: Workflow) => Workflow, steps = TRIAGE()): Workflow[] =>
  steps.some((s) => s.name === name) ? steps.map((s) => (s.name === name ? change(s) : s)) : [...steps, change(step(name))];

/** The triage workflow with triage a judge on the reviewer, read-only (`dontAsk`), with what `keys` change of it. */
const judged = (keys: Partial<Workflow> = {}): Workflow[] =>
  changed('triage', (s) => ({
    ...s,
    route: { kind: 'judge' },
    agent: { name: 'reviewer', keys: [], body: '', given: {} },
    permissionMode: 'dontAsk',
    ...keys,
  }));

const refusedAtLoad = (steps: Workflow[]): void => {
  assert.throws(
    () => validate(steps),
    (e: unknown) => e instanceof WorkflowError && e.exitCode === 2,
  );
};

test('load refuses a workflow whose routes do not close', async (t) => {
  const rows: Array<[string, Workflow[]]> = [
    ['a judge whose agent runs in a mode that writes', judged({ permissionMode: 'acceptEdits' })],
    ['a judge whose agent writes with its tools, unasked', judged({ permissionMode: 'auto', tools: ['Read', 'Edit'] })],
    ['a judge with no agent whose own fence writes', judged({ agent: undefined, permissionMode: 'auto' })],
    ['a judge on codex in a sandbox that writes', judged({ harness: 'codex', permissionMode: undefined, sandbox: 'workspace-write' })],
    [
      'a judge whose output declares route, which the run owes it',
      judged({ output: { file: 'o.json', schema: { ...PLAN_SCHEMA, properties: { route: { type: 'string' } }, required: ['route'] } } }),
    ],
    ['a when: naming a route the condition does not declare', changed('build-web', (s) => ({ ...s, when: ['mobile'] }))],
    ['a when: on a node that waits on no condition', changed('notes', (s) => ({ ...s, when: ['web'] }))],
    [
      'a when: on a node that waits on two conditions',
      changed('build-web', (s) => ({ ...s, after: ['triage', 'again'] }), [
        ...TRIAGE(),
        { ...step('again', ['plan']), input: ['plan'], routes: ['web', 'backend', 'docs'], route: TABLE, ends: ['backend', 'docs'] },
      ]),
    ],
    ['a when: naming a route the condition ends on', changed('build-web', (s) => ({ ...s, when: ['web', 'docs'] }))],
    ['a route nobody takes and not in ends:', changed('triage', (s) => ({ ...s, ends: [] }))],
    ['an ends: naming no route of the condition', changed('triage', (s) => ({ ...s, ends: ['docs', 'mobile'] }))],
    [
      'a workflow: node with an agent',
      changed('to-build', (s) => ({
        ...s,
        after: ['notes'],
        workflow: 'build',
        agent: { name: 'implementer', keys: [], body: '', given: {} },
      })),
    ],
    ['a workflow: node with a workspace', changed('to-build', (s) => ({ ...s, after: ['notes'], workflow: 'build', workspace: 'base' }))],
    ['a workflow: node with a check', changed('to-build', (s) => ({ ...s, after: ['notes'], workflow: 'build', check: 'npm test' }))],
    ['a workflow: node with a gate', changed('to-build', (s) => ({ ...s, after: ['notes'], workflow: 'build', gate: true }))],
    [
      'a table key outside the field’s enum',
      changed('triage', (s) => ({ ...s, route: { ...TABLE, table: { ...TABLE.table, mobile: 'web' } } })),
    ],
    [
      'a value of the field’s enum with no row',
      changed('triage', (s) => ({ ...s, route: { ...TABLE, table: { web: 'web', backend: 'backend' } } })),
    ],
    [
      'a row whose route is not in routes:',
      changed('triage', (s) => ({ ...s, route: { ...TABLE, table: { ...TABLE.table, docs: 'mobile' } } })),
    ],
    [
      'a table reading a step the condition does not wait on',
      changed('triage', (s) => ({ ...s, route: { ...TABLE, from: 'notes.surface' } })),
    ],
    ['a table reading a field its producer does not declare', changed('triage', (s) => ({ ...s, route: { ...TABLE, from: 'plan.size' } }))],
    [
      'a table over a field with no enum',
      changed('plan', (s) => ({
        ...s,
        output: { file: 'plan.schema.json', schema: { ...PLAN_SCHEMA, properties: { surface: { type: 'string' } } } },
      })),
    ],
    [
      'a workspace: on a table condition, the last step',
      [
        { ...step('plan'), output: { file: 'plan.schema.json', schema: PLAN_SCHEMA } },
        {
          ...step('triage', ['plan']),
          input: ['plan'],
          routes: ['web', 'docs'],
          route: { ...TABLE, table: { web: 'web', backend: 'web', docs: 'docs' } },
          ends: ['web', 'docs'],
          workspace: 'base',
          gate: true,
        },
      ],
    ],
    ['a check: on a table condition', changed('triage', (s) => ({ ...s, check: 'npm test' }))],
    ['a retries: on a table condition', changed('triage', (s) => ({ ...s, retries: 1 }))],
    ['a resume: on a table condition', changed('triage', (s) => ({ ...s, resume: 'plan' }))],
    ['a budget: on a table condition', changed('triage', (s) => ({ ...s, budget: 2 }))],
    [
      'a budget: on a script condition',
      changed('triage', (s) => ({ ...s, route: { kind: 'script', script: 'routes/pick.ts' }, budget: 2 })),
    ],
    [
      'a loop whose span holds a condition other than the looping step',
      [
        { ...step('plan'), output: { file: 'plan.schema.json', schema: PLAN_SCHEMA } },
        {
          ...step('triage', ['plan']),
          input: ['plan'],
          routes: ['web', 'docs'],
          route: { ...TABLE, table: { web: 'web', backend: 'web', docs: 'docs' } },
          ends: ['docs'],
        },
        { ...step('build-web', ['triage']), when: ['web'] },
        { ...step('review', ['build-web']), loop: 'plan', rounds: DEFAULT_ROUNDS },
      ],
    ],
  ];
  for (const [name, steps] of rows) await t.test(`REFUSED: ${name}`, () => refusedAtLoad(steps));
});

test('load takes a workflow whose routes close', async (t) => {
  const rows: Array<[string, Workflow[]]> = [
    ['the triage workflow', TRIAGE()],
    ['a node after a condition with no when:, on every route', changed('log', (s) => ({ ...s, after: ['triage'] }))],
    [
      'a loop on one route, its target saying when:',
      changed(
        'review',
        (s) => ({ ...s, after: ['build-web'], loop: 'build-web', rounds: DEFAULT_ROUNDS }),
        TRIAGE().map((s) => (s.name === 'notes' ? { ...s, after: ['build-backend', 'review'] } : s)),
      ),
    ],
    ['a judge with a budget, on a read-only agent', judged({ budget: 2 })],
    ['a judge on an agent whose tools write nothing', judged({ permissionMode: 'auto', tools: ['Read', 'Grep'] })],
    ['a judge on codex, read-only', judged({ harness: 'codex', permissionMode: undefined, sandbox: 'read-only' })],
    ['a judge with no agent nor fence of its own, which a factory hires into', judged({ agent: undefined, permissionMode: undefined })],
    ['a workflow node on a route', changed('build-backend', (s) => ({ ...s, workflow: 'build' }))],
    ['a workflow without the routing keys', [step('implement'), step('review', ['implement'])]],
  ];
  for (const [name, steps] of rows) await t.test(name, () => validate(steps));
});

/** A step file with `keys` in its frontmatter. */
const file = (keys: string): string => `---\nplace: git\n${keys}\n---\nroute the change\n`;

test('a step file reads route: in its three shapes, and refuses any other', async (t) => {
  await t.test('a table', () => {
    const s = parseWorkflow(
      'triage',
      file('after: plan\nroutes: [web, docs]\nroute: { from: plan.surface, table: { web: web, docs: docs } }'),
    );
    assert.deepEqual(s.route, { kind: 'table', from: 'plan.surface', table: { web: 'web', docs: 'docs' } });
    assert.deepEqual(s.routes, ['web', 'docs']);
  });
  await t.test('a script', () => {
    const s = parseWorkflow('triage', file('routes: [web, docs]\nroute: { script: routes/pick.ts }'));
    assert.deepEqual(s.route, { kind: 'script', script: 'routes/pick.ts' });
  });
  await t.test('a judge', () => {
    assert.deepEqual(parseWorkflow('triage', file('routes: [web, docs]\nroute: judge')).route, { kind: 'judge' });
  });
  await t.test('when:, ends: and workflow:', () => {
    const s = parseWorkflow('w', file('after: triage\nwhen: [web, docs]\nworkflow: build'));
    assert.deepEqual([s.when, s.workflow], [['web', 'docs'], 'build']);
    const c = parseWorkflow('triage', file('routes: [web, docs]\nroute: judge\nends: [docs]'));
    assert.deepEqual(c.ends, ['docs']);
  });
  const refused: Array<[string, string]> = [
    ['a word that is no eval', 'routes: [web, docs]\nroute: table'],
    ['a map with neither from and table nor script', 'routes: [web, docs]\nroute: { judge: true }'],
    ['a table with no field', 'routes: [web, docs]\nroute: { from: plan, table: { web: web } }'],
    ['a table that is no map', 'routes: [web, docs]\nroute: { from: plan.surface, table: web }'],
    ['a script naming no file', "routes: [web, docs]\nroute: { script: '' }"],
    ['routes: with one route', 'routes: [web]\nroute: judge'],
    ['routes: with no route:', 'routes: [web, docs]'],
    ['route: with no routes:', 'route: judge'],
    ['ends: on a step that is no condition', 'ends: [docs]'],
    ['a route that is no word', 'routes: [Web, docs]\nroute: judge'],
    ['a workflow: that is no name', 'workflow: ../build'],
  ];
  for (const [name, keys] of refused) {
    await t.test(`REFUSED: ${name}`, () =>
      assert.throws(
        () => parseWorkflow('triage', file(keys)),
        (e: unknown) => e instanceof WorkflowError && e.exitCode === 2,
      ),
    );
  }
});

test('a step file with the routing keys renders to a file that reads back as the same step', async (t) => {
  for (const keys of [
    'after: plan\nroutes: [web, docs]\nroute: { from: plan.surface, table: { web: web, docs: docs } }\nends: [docs]',
    'routes: [web, docs]\nroute: { script: routes/pick.ts }',
    'routes: [web, docs]\nroute: judge',
    'after: triage\nwhen: [web]\nworkflow: build',
  ]) {
    await t.test(keys.split('\n').join('; '), () => {
      const read = parseWorkflow('triage', file(keys));
      assert.deepEqual(parseWorkflow('triage', renderStep(read)), read);
    });
  }
});
