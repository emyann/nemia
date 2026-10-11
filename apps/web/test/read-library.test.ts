/**
 * The library's reads decode the api's answers where they enter (`get`): the agents, the skills, the workflows and a step's page, the
 * builder's form, the repository and the machines. Each reads back what the api gave; each refuses an answer it does not read, at the key,
 * with the fix; a key the board does not know is dropped, and one the api leaves out stays out. A step's `place`, `workspace` and `slot`
 * are read, so a save of the builder puts them back.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReadRefusal, UnreadAnswer } from '../src/lib/api/read.ts';
import { agentQuery, agentsQuery, readAgent, type AgentListing, type LibraryAgent } from '../src/lib/api/agents.ts';
import { skillQuery, skillsQuery, type SkillDetail, type SkillPlace } from '../src/lib/api/skills.ts';
import {
  repositoryQuery,
  stepQuery,
  workflowsInQuery,
  workflowsQuery,
  type WorkflowListing,
  type WorkflowStepPage,
} from '../src/lib/api/workflows.ts';
import { keyFormQuery, type KeyForm } from '../src/lib/api/builder.ts';
import { machineQuery, machinesQuery, type MachineGraph, type MachineListing } from '../src/lib/api/machines.ts';
import { StepKeySchema, WorkflowStepSpecSchema } from '../src/lib/api/library.ts';
import {
  agent,
  keyForm,
  listedAgent,
  machine,
  skillDetail,
  skillEntry,
  skillPlace,
  stepPage,
  stepSpec,
  workflow,
} from './library-fixtures.ts';

/** Every read answering `body` as JSON, with `status`, for the length of the test. */
function answering(t: { after: (fn: () => void) => void }, body: unknown, status = 200) {
  const before = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  t.after(() => {
    globalThis.fetch = before;
  });
}

const readAgents = agentsQuery.queryFn as unknown as () => Promise<LibraryAgent[]>;
const readAgentPage = agentQuery('yours', 'agora').queryFn as unknown as () => Promise<AgentListing>;
const readSkills = skillsQuery.queryFn as unknown as () => Promise<SkillPlace[]>;
const readSkill = skillQuery('yours', 'review-a-change').queryFn as unknown as () => Promise<SkillDetail>;
const readWorkflows = workflowsQuery.queryFn as unknown as () => Promise<WorkflowListing[]>;
const readStep = stepQuery('repo', 'build', 'ship').queryFn as unknown as () => Promise<WorkflowStepPage>;
const readRepository = repositoryQuery.queryFn as unknown as () => Promise<{ repo: string }>;
const readKeyForm = keyFormQuery.queryFn as unknown as () => Promise<KeyForm>;
const readMachines = machinesQuery.queryFn as unknown as () => Promise<{ machines: MachineListing[] }>;
const readMachine = machineQuery('lifecycle').queryFn as unknown as () => Promise<MachineGraph>;

/** Whether `err` is an `UnreadAnswer` of `route` whose message names `at`, what was found there, and the fix. */
const unread = (route: string, at: string, found: string) => (err: unknown) => {
  assert.ok(err instanceof UnreadAnswer, String(err));
  assert.equal(err.route, `GET ${route}`);
  assert.ok(err.message.startsWith(`GET ${route} answered what this board does not read`), err.message);
  assert.ok(err.message.includes(`at ${at}, `), err.message);
  assert.ok(err.message.includes(found), err.message);
  assert.ok(
    err.message.endsWith('restart the api (npm run dev) and rebuild the board (npm run build), then reload the page.'),
    err.message,
  );
  return true;
};

/** `value` without `keys`, as an api that does not send them answers. */
const without = <T extends object>(value: T, ...keys: string[]): T =>
  Object.fromEntries(Object.entries(value).filter(([k]) => !keys.includes(k))) as T;

test('each read of the library decodes an answer the api gives, as it gave it', async (t) => {
  answering(t, [listedAgent()]);
  assert.deepEqual(await readAgents(), [listedAgent()]);
  answering(t, agent());
  assert.deepEqual(await readAgentPage(), agent());
  assert.deepEqual(await readAgent('yours', 'agora'), agent());
  answering(t, [skillPlace()]);
  assert.deepEqual(await readSkills(), [skillPlace()]);
  answering(t, skillDetail());
  assert.deepEqual(await readSkill(), skillDetail());
  answering(t, [workflow()]);
  assert.deepEqual(await readWorkflows(), [workflow()]);
  answering(t, stepPage());
  assert.deepEqual(await readStep(), stepPage());
  answering(t, { repo: '/work/repo' });
  assert.deepEqual(await readRepository(), { repo: '/work/repo' });
  answering(t, keyForm());
  assert.deepEqual(await readKeyForm(), keyForm());
  answering(t, { machines: [without(machine(), 'initial', 'states', 'final', 'edges', 'verbs')] });
  assert.deepEqual(await readMachines(), { machines: [{ name: 'lifecycle', title: machine().title, source: machine().source }] });
  answering(t, machine());
  assert.deepEqual(await readMachine(), machine());
});

test('what the api leaves out stays out: a card entry without examples, a draft without preload, an edge without a guard', async (t) => {
  const { examples: _, ...bare } = skillEntry();
  answering(t, [listedAgent({ card: [bare], untried: null })]);
  const [read] = await readAgents();
  assert.equal(Object.hasOwn(read.card?.[0] ?? {}, 'examples'), false);
  assert.deepEqual(read, listedAgent({ card: [bare], untried: null }));

  const draft = without(skillDetail().draft ?? assert.fail('the fixture has a draft'), 'preload', 'title');
  answering(t, skillDetail({ draft }));
  const skill = await readSkill();
  assert.equal(Object.hasOwn(skill.draft ?? {}, 'preload') || Object.hasOwn(skill.draft ?? {}, 'title'), false);
  assert.deepEqual(skill, skillDetail({ draft }));

  answering(t, machine());
  const [, unguarded] = (await readMachine()).edges;
  assert.equal(Object.hasOwn(unguarded, 'guard'), false);
});

test("a listed step's workspace and slot are read, so the builder's save puts them back, and the key form reads their fields", async (t) => {
  answering(t, [workflow()]);
  const [listed] = await readWorkflows();
  assert.equal(listed.steps[0].spec.workspace, 'main');
  assert.equal(listed.steps[0].spec.slot, 'none');
  assert.deepEqual(listed.steps[0].own?.keys, ['workspace', 'slot', 'gate']);

  answering(t, keyForm());
  const form = await readKeyForm();
  assert.deepEqual(
    form.keys.map((k) => k.key),
    ['workspace', 'slot', 'effort'],
  );
  assert.deepEqual(form.remote.refuses, ['tools', 'workspace']);
});

test("a listed step's place is read; REFUSED: a step that says `workspace: folder`, the former spelling the api no longer sends", async (t) => {
  const [step] = workflow().steps;
  const folder = { ...step, spec: { ...step.spec, place: 'folder' as const, workspace: null } };
  answering(t, [workflow({ steps: [folder] })]);
  const [listed] = await readWorkflows();
  assert.equal(listed.steps[0].spec.place, 'folder');

  answering(t, [workflow({ steps: [{ ...folder, spec: { ...folder.spec, place: null, workspace: 'folder' as never } }] })]);
  await assert.rejects(readWorkflows(), unread('/api/workflows', '[0].steps[0].spec.workspace', '"folder", where'));

  answering(t, [workflow({ steps: [{ ...folder, spec: { ...folder.spec, place: 'cloud' as never } }] })]);
  await assert.rejects(readWorkflows(), unread('/api/workflows', '[0].steps[0].spec.place', '"cloud", where'));
});

test('the step keys the board reads are every key of a step it reads, no fewer and no more', () => {
  assert.deepEqual([...StepKeySchema.literals].sort(), Object.keys(WorkflowStepSpecSchema.fields).sort());
  assert.deepEqual(Object.keys(WorkflowStepSpecSchema.fields).sort(), Object.keys(stepSpec()).sort());
});

test('a key the board does not know is dropped, not refused', async (t) => {
  answering(t, [{ ...listedAgent(), colour: 'blue' }]);
  const [read] = await readAgents();
  assert.equal(Object.hasOwn(read, 'colour'), false);
  assert.deepEqual(read, listedAgent());

  const [step] = workflow().steps;
  answering(t, [workflow({ steps: [{ ...step, spec: { ...step.spec, mood: 'calm' } as never }] })]);
  const [listed] = await readWorkflows();
  assert.equal(Object.hasOwn(listed.steps[0].spec, 'mood'), false);
  assert.deepEqual(listed, workflow());
});

test("REFUSED, the agents' list: an agent without the factories it fills a step in; one agent's page and a write's answer carry none", async (t) => {
  answering(t, [listedAgent({}, [])]);
  assert.deepEqual(await readAgents(), [listedAgent({}, [])]);
  answering(t, [agent()]);
  await assert.rejects(readAgents(), unread('/api/agents', '[0].factories', 'is missing'));
  answering(t, agent());
  assert.deepEqual(await readAgent('yours', 'agora'), agent());
  assert.equal(Object.hasOwn(await readAgent('yours', 'agora'), 'factories'), false);
});

test('REFUSED, the agents: one from no place the board knows, and a skill it gives whose cost has no turn', async (t) => {
  answering(t, [listedAgent({ from: 'elsewhere' as never })]);
  await assert.rejects(readAgents(), unread('/api/agents', '[0].from', '"elsewhere", where the board reads "repo" | "yours"'));

  const [given] = agent().given;
  const cost = without(given.cost ?? assert.fail('the fixture has a cost'), 'perTurn');
  answering(t, agent({ given: [{ ...given, cost }] }));
  await assert.rejects(readAgent('yours', 'agora'), unread('/api/agents/yours/agora', 'given[0].cost.perTurn', 'is missing'));

  answering(t, agent({ keys: { harness: 7 } as never }));
  await assert.rejects(readAgent('yours', 'agora'), unread('/api/agents/yours/agora', 'keys.harness', '7, where'));
});

test('REFUSED, the skills: a shipped skill found in a place no agent looks, and a draft whose tags are no list', async (t) => {
  answering(t, [skillPlace({ skills: [{ ...skillPlace().skills[0], found: 'shipped' as never }] })]);
  await assert.rejects(readSkills(), unread('/api/skills', '[0].skills[0].found', '"shipped", where'));

  const draft = skillDetail().draft ?? assert.fail('the fixture has a draft');
  answering(t, skillDetail({ draft: { ...draft, tags: 'review' as never } }));
  await assert.rejects(readSkill(), unread('/api/skills/yours/review-a-change', 'draft.tags', '"review", where'));
});

test('REFUSED, the workflows: a step without its workspace, a key row whose value is no word, and a repository with none', async (t) => {
  const [step] = workflow().steps;
  answering(t, [workflow({ steps: [{ ...step, spec: without(step.spec, 'workspace') }] })]);
  await assert.rejects(readWorkflows(), unread('/api/workflows', '[0].steps[0].spec.workspace', 'is missing'));

  answering(t, [workflow({ steps: [{ ...step, own: { keys: ['colour' as never], body: '' } }] })]);
  await assert.rejects(readWorkflows(), unread('/api/workflows', '[0].steps[0].own.keys[0]', '"colour", where'));

  answering(t, stepPage({ keys: [{ key: 'model', value: 7 as never, meaning: 'The model.' }] }));
  await assert.rejects(readStep(), unread('/api/workflows/repo/build/ship', 'keys[0].value', '7, where'));

  answering(t, {});
  await assert.rejects(readRepository(), unread('/api/repository', 'repo', 'is missing'));
});

test("a step's page is read in the place named, keyed by it, with what a run of it will be told, its hires and its recent runs", async (t) => {
  const asked: string[] = [];
  const before = globalThis.fetch;
  const page = stepPage({
    factory: 'f',
    hired: 'writer',
    hiredIn: [{ factory: 'g', agent: 'scribe' }],
    hiring: {
      refused: null,
      agents: [
        { name: 'ada', description: 'Builds it.' },
        { name: 'scribe', description: null },
      ],
    },
    skillsFrom: [
      { name: 'alpha', from: 'yours' },
      { name: 'gamma', from: null },
    ],
    recentRuns: [{ id: 'r-1', brief: 'Do it', createdAt: '2026-10-01T00:00:00Z', factory: 'f', filed: false }],
  });
  globalThis.fetch = async (input) => {
    asked.push(String(input));
    return new Response(JSON.stringify(page), { headers: { 'content-type': 'application/json' } });
  };
  t.after(() => {
    globalThis.fetch = before;
  });
  const placed = stepQuery('yours', 'w', 'review', { factory: 'f' });
  assert.deepEqual(await (placed.queryFn as unknown as () => Promise<WorkflowStepPage>)(), page);
  assert.equal(asked.at(-1), '/api/workflows/yours/w/review?factory=f');
  assert.notDeepEqual(placed.queryKey, stepQuery('yours', 'w', 'review').queryKey, 'two places, two answers kept apart');
  assert.notDeepEqual(placed.queryKey, stepQuery('yours', 'w', 'review', { factory: 'g' }).queryKey);
  await (stepQuery('yours', 'w', 'review', { factory: 'f', repo: '/code/app' }).queryFn as unknown as () => Promise<unknown>)();
  assert.equal(asked.at(-1), '/api/workflows/yours/w/review?factory=f&repo=%2Fcode%2Fapp');
});

test("REFUSED: a list of workflows is read in its place — with none, the list the builder drafts from; in a factory, the factory's, under the key its start reads", async (t) => {
  const asked: string[] = [];
  const before = globalThis.fetch;
  globalThis.fetch = async (input) => {
    asked.push(String(input));
    return new Response(JSON.stringify([workflow()]), { headers: { 'content-type': 'application/json' } });
  };
  t.after(() => {
    globalThis.fetch = before;
  });
  const every = workflowsInQuery(null);
  await (every.queryFn as unknown as () => Promise<unknown>)();
  assert.equal(asked.at(-1), '/api/workflows');
  assert.deepEqual([...every.queryKey], ['workflows']);
  const placed = workflowsInQuery({ factory: 'f', repo: '/code/app' });
  await (placed.queryFn as unknown as () => Promise<unknown>)();
  assert.equal(asked.at(-1), '/api/workflows?factory=f&repo=%2Fcode%2Fapp');
  assert.deepEqual([...placed.queryKey], ['factory-workflows', 'f', '/code/app']);
});

test("REFUSED, a step's page: one without its recent runs, the factories that hire into it, whether it can be hired into, or a skill's place the board knows", async (t) => {
  answering(t, without(stepPage(), 'recentRuns'));
  await assert.rejects(readStep(), unread('/api/workflows/repo/build/ship', 'recentRuns', 'is missing'));
  answering(t, without(stepPage(), 'hiredIn'));
  await assert.rejects(readStep(), unread('/api/workflows/repo/build/ship', 'hiredIn', 'is missing'));
  answering(t, without(stepPage(), 'hiring'));
  await assert.rejects(readStep(), unread('/api/workflows/repo/build/ship', 'hiring', 'is missing'));
  answering(t, stepPage({ hiring: { refused: null, agents: [{ name: 'ada' }] as never } }));
  await assert.rejects(readStep(), unread('/api/workflows/repo/build/ship', 'hiring.agents[0].description', 'is missing'));
  answering(t, stepPage({ skillsFrom: [{ name: 'alpha', from: 'elsewhere' as never }] }));
  await assert.rejects(readStep(), unread('/api/workflows/repo/build/ship', 'skillsFrom[0].from', '"elsewhere", where'));
});

test("REFUSED, the builder's form: a key no step has, and an agent's gate set false, which only a step without the line says", async (t) => {
  answering(t, keyForm({ keys: [{ ...keyForm().keys[0], key: 'colour' as never }] }));
  await assert.rejects(readKeyForm(), unread('/api/workflows/keys', 'keys[0].key', '"colour", where'));

  answering(t, keyForm({ agents: { mine: { gate: false as never } } }));
  await assert.rejects(readKeyForm(), unread('/api/workflows/keys', 'agents.mine.gate', 'false, where'));

  answering(t, keyForm({ keys: [{ ...keyForm().keys[0], kind: 'colour' as never }] }));
  await assert.rejects(readKeyForm(), unread('/api/workflows/keys', 'keys[0].kind', '"colour", where'));
});

test('REFUSED, the machines: a list that is no list, an edge without its action, a verb without its guard, and no verbs', async (t) => {
  answering(t, { machines: 'lifecycle' });
  await assert.rejects(readMachines(), unread('/api/machines', 'machines', '"lifecycle", where the board reads array'));

  const [edge] = machine().edges;
  answering(t, machine({ edges: [without(edge, 'action')] }));
  await assert.rejects(readMachine(), unread('/api/machines/lifecycle', 'edges[0].action', 'is missing'));

  const [verb] = machine().verbs;
  answering(t, machine({ verbs: [without(verb, 'guard')] }));
  await assert.rejects(readMachine(), unread('/api/machines/lifecycle', 'verbs[0].guard', 'is missing'));
  answering(t, without(machine(), 'verbs'));
  await assert.rejects(readMachine(), unread('/api/machines/lifecycle', 'verbs', 'is missing'));
});

test("an agent the api refused still rejects in the api's words and status, not as an answer unread", async (t) => {
  answering(t, { error: 'no agent agora of yours' }, 404);
  const err: unknown = await readAgent('yours', 'agora').then(
    () => assert.fail('a 404 was read'),
    (e: unknown) => e,
  );
  assert.ok(err instanceof ReadRefusal && !(err instanceof UnreadAnswer), String(err));
  assert.equal(err.status, 404);
  assert.equal(err.message, 'no agent agora of yours');
});
