/**
 * The builtin templates on the api, on a scratch builtin folder, never the package's own: listed and read as `Template`s, and each one's
 * documents — its workflows, agents and skills — served as the Workflows, Agents and Skills a namespace serves, read from its render with
 * its parameters' defaults, origin `builtin`, in no namespace and with no revision of the ledger's; a document it lacks a 404, an unknown
 * template a 404, and one that does not render with its defaults a 422 on its documents while the template itself still reads.
 *
 * Over the stand-ins (`appOver`), the builtin folder and the folder of renders given to the app's layer.
 */
import '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Layer, Schema } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { BuiltinTemplates, testPlace } from 'agent-orchestrator/testing';
import { TemplateRenders } from 'agent-orchestrator';
import { Agent, AgentList, Skill, SkillList, Template, TemplateList, Workflow, WorkflowList } from 'objects';
import { appOver, eachTest } from '../../test/placed.ts';
import { scratch } from '../../test/scratch.ts';

const write = (file: string, text: string): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** The manifest of the template `name`, its `parameters` given as the YAML lines under `spec.parameters`, where it has any. */
const manifest = (name: string, parameters?: string): string =>
  [
    'apiVersion: nemia.dev/v1alpha1',
    'kind: FactoryTemplate',
    'metadata:',
    `  name: ${name}`,
    '  description: A mill that presses drafts.',
    'spec:',
    '  version: 0.1.0',
    ...(parameters === undefined ? [] : ['  parameters:', parameters]),
    '  hires:',
    '    press/draft: drafter',
    '',
  ].join('\n');

/** The template `name` in `folder`: one workflow, `press`, whose step `draft` the agent `drafter` fills, and one skill, `inking`. */
function template(folder: string, name: string, parameters?: string): void {
  const at = path.join(folder, name);
  write(path.join(at, 'nemia.yaml'), manifest(name, parameters));
  write(
    path.join(at, 'workflows', 'press', 'workflow.yaml'),
    [
      'apiVersion: nemia.dev/v1alpha1',
      'kind: Workflow',
      'metadata:',
      '  name: press',
      '  description: Press a draft.',
      'spec:',
      '  steps:',
      '    - name: draft',
      '      place: git',
      '',
    ].join('\n'),
  );
  write(path.join(at, 'workflows', 'press', 'draft.md'), 'Draft the page.\n');
  write(
    path.join(at, 'agents', 'drafter', 'agent.yaml'),
    [
      'apiVersion: nemia.dev/v1alpha1',
      'kind: Agent',
      'metadata:',
      '  name: drafter',
      'spec:',
      '  role: Drafter',
      '  description: Drafts a page.',
      '  skills: [inking]',
      '  harness: claude',
      '',
    ].join('\n'),
  );
  write(path.join(at, 'agents', 'drafter', 'instructions.md'), 'You draft.\n');
  write(path.join(at, 'skills', 'inking', 'SKILL.md'), '---\nname: inking\ndescription: Ink a draft.\n---\n\nInk it.\n');
}

/** A builtin folder holding `mill`, and `asks`, the same with a parameter that has no default. */
const folder = scratch('nemia-api-builtins-');
template(folder, 'mill');
template(folder, 'asks', '    budget:\n      type: number\n      description: dollars for a draft\n');

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const renders = scratch('nemia-api-renders-');
const app = eachTest(() => appOver(standIn(), stand(), Layer.succeed(BuiltinTemplates)(folder), Layer.succeed(TemplateRenders)(renders)));

/** The api's answer to a GET of `url`: its status and its body. */
async function get(url: string): Promise<{ status: number; body: unknown }> {
  const res = await app().request(url);
  return { status: res.status, body: await res.json() };
}

/** A template's documents, each as an object no namespace holds: read from its render, `builtin`, with no ledger revision. */
const outsideNamespaces = (o: { metadata: { namespace?: string }; status: { origin: string; revision?: number; shadowedBy?: string } }) => {
  assert.equal(o.metadata.namespace, undefined, 'a template is in no namespace');
  assert.equal(o.status.origin, 'builtin', "a template's document is Nemia's builtin");
  assert.equal(Object.hasOwn(o.status, 'revision'), false, 'the ledger counts no revision of a template document');
  assert.equal(Object.hasOwn(o.status, 'shadowedBy'), false, "a template's document shadows nothing and nothing shadows it");
};

test('the builtin templates are listed and read as Templates', async () => {
  const list = await get('/api/templates');
  assert.equal(list.status, 200);
  const items = Schema.decodeUnknownSync(TemplateList)(list.body).items;
  assert.deepEqual(
    items.map((o) => o.metadata.name),
    ['asks', 'mill'],
  );
  const one = await get('/api/templates/mill');
  assert.equal(one.status, 200);
  const mill = Schema.decodeUnknownSync(Template)(one.body);
  assert.deepEqual(mill.status.workflows, ['press']);
  assert.equal(mill.status.problems, undefined, 'the scratch template reads');
});

test("a template's workflows are served as Workflows read from its render", async () => {
  const list = await get('/api/templates/mill/workflows');
  assert.equal(list.status, 200);
  const items = Schema.decodeUnknownSync(WorkflowList)(list.body).items;
  assert.deepEqual(
    items.map((o) => o.metadata.name),
    ['press'],
  );
  const one = await get('/api/templates/mill/workflows/press');
  assert.equal(one.status, 200);
  const press = Schema.decodeUnknownSync(Workflow)(one.body);
  outsideNamespaces(press);
  assert.deepEqual(
    press.spec.steps.map((step) => step.name),
    ['draft'],
  );
  assert.ok(press.status.dir.startsWith(renders), 'read from the render, under the folder of renders');
  assert.deepEqual(items[0], press, 'the list holds the object a read answers');
});

test("a template's agents are served as Agents read from its render", async () => {
  const list = await get('/api/templates/mill/agents');
  assert.equal(list.status, 200);
  const items = Schema.decodeUnknownSync(AgentList)(list.body).items;
  assert.deepEqual(
    items.map((o) => o.metadata.name),
    ['drafter'],
  );
  const one = await get('/api/templates/mill/agents/drafter');
  assert.equal(one.status, 200);
  const drafter = Schema.decodeUnknownSync(Agent)(one.body);
  outsideNamespaces(drafter);
  assert.equal(drafter.spec.role, 'Drafter');
  const inking = drafter.status.given.find((g) => g.name === 'inking');
  assert.ok(inking?.from !== null && inking?.from !== undefined, "the agent's skill is found in the template's own render");
  assert.ok(drafter.status.file.startsWith(renders), 'read from the render, under the folder of renders');
});

test("a template's skills are served as Skills read from its render", async () => {
  const list = await get('/api/templates/mill/skills');
  assert.equal(list.status, 200);
  const items = Schema.decodeUnknownSync(SkillList)(list.body).items;
  assert.deepEqual(
    items.map((o) => o.metadata.name),
    ['inking'],
  );
  const one = await get('/api/templates/mill/skills/inking');
  assert.equal(one.status, 200);
  const inking = Schema.decodeUnknownSync(Skill)(one.body);
  outsideNamespaces(inking);
  assert.equal(inking.spec.description, 'Ink a draft.');
  assert.ok(inking.status.dir.startsWith(renders), 'read from the render, under the folder of renders');
});

test('a page of a document list is cut by its limit', async () => {
  const page = await get('/api/templates/mill/workflows?limit=1');
  assert.equal(page.status, 200);
  assert.equal(Schema.decodeUnknownSync(WorkflowList)(page.body).metadata.remainingItemCount, 0);
});

test('a document the template lacks is a 404, and so is every read of a template Nemia does not build in', async () => {
  for (const plural of ['workflows', 'agents', 'skills'])
    assert.equal((await get(`/api/templates/mill/${plural}/nowhere`)).status, 404, `no ${plural} document named nowhere`);
  assert.equal((await get('/api/templates/nowhere')).status, 404);
  for (const plural of ['workflows', 'agents', 'skills']) {
    assert.equal((await get(`/api/templates/nowhere/${plural}`)).status, 404, `no template's ${plural}`);
    assert.equal((await get(`/api/templates/nowhere/${plural}/press`)).status, 404, `no template's ${plural} document`);
  }
});

test('a template with a parameter that has no default does not render: its documents a 422, the template itself still read', async () => {
  assert.equal((await get('/api/templates/asks')).status, 200);
  for (const plural of ['workflows', 'agents', 'skills']) {
    assert.equal((await get(`/api/templates/asks/${plural}`)).status, 422, `its ${plural} listed`);
    assert.equal((await get(`/api/templates/asks/${plural}/press`)).status, 422, `one of its ${plural} read`);
  }
});
