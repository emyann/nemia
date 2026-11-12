/**
 * The library's reads decode the api's answers where they enter: the agents, the skills and the workflows as the objects serve them
 * (`objects.ts`), each seen as the board's view of its kind, and a step's page, the builder's form and the repository: a key the board
 * does not know is dropped, and one the api leaves out stays out. Which keys each answer has is `objects`' own.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReadRefusal, UnreadAnswer } from '../src/lib/api/read.ts';
import { agentsQuery, readAgent, type LibraryAgent } from '../src/lib/api/agents.ts';
import { skillQuery, skillsQuery, type SkillDetail, type SkillPlace } from '../src/lib/api/skills.ts';
import { stepQuery, workflowsInQuery, workflowsQuery, type WorkflowListing, type WorkflowStepPage } from '../src/lib/api/workflows.ts';
import {
  agentObject,
  consistentSkill,
  listedAgent,
  listOfItems,
  skillEntry,
  skillObject,
  skillRow,
  stepPage,
  workflow,
  workflowObject,
} from './library-fixtures.ts';

/**
 * Every read answered by `answer` of the path and query it asks, as JSON, for the length of the test; a status of its own where `answer`
 * gives one. Returns the paths asked, in order.
 */
function serving(t: { after: (fn: () => void) => void }, answer: (asked: string) => unknown, status = 200): string[] {
  const asked: string[] = [];
  const before = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://board.invalid');
    const path = `${url.pathname}${url.search}`;
    asked.push(path);
    return new Response(JSON.stringify(answer(path)), { status, headers: { 'content-type': 'application/json' } });
  };
  t.after(() => {
    globalThis.fetch = before;
  });
  return asked;
}

/** Every read answering `body`, whatever it asks. */
const answering = (t: { after: (fn: () => void) => void }, body: unknown, status = 200) => serving(t, () => body, status);

const readAgents = agentsQuery.queryFn as unknown as () => Promise<LibraryAgent[]>;
const readSkill = skillQuery('yours', 'review-a-change').queryFn as unknown as () => Promise<SkillDetail>;
const readSkills = skillsQuery.queryFn as unknown as () => Promise<SkillPlace[]>;
const readWorkflows = workflowsQuery.queryFn as unknown as () => Promise<WorkflowListing[]>;

/** `workflow()` as its object's view reads it: its graph with a node for each step. */
const viewed = (listing: WorkflowListing = workflow()): WorkflowListing => ({
  ...listing,
  graph: { ...listing.graph, nodes: listing.steps.map((step) => ({ name: step.name, kind: 'step' })) },
});

/** `value` without `keys`, as an api that does not send them answers. */
const without = <T extends object>(value: T, ...keys: string[]): T =>
  Object.fromEntries(Object.entries(value).filter(([k]) => !keys.includes(k))) as T;

test("a step's page and a list of workflows are read in the place named, under a key of that place", async (t) => {
  await t.test(
    "a step's page is read in the place named, keyed by it, with what a run of it will be told, its hires and its recent runs",
    async (t) => {
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
          { name: 'alpha', from: 'yours', foundIn: null },
          { name: 'apps/site:set-type', from: null, foundIn: 'apps/site/.claude/skills/set-type' },
          { name: 'gamma', from: null, foundIn: null },
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
      const read = await (placed.queryFn as unknown as () => Promise<WorkflowStepPage>)();
      assert.deepEqual(read, page);
      assert.equal(
        read.skillsFrom[1].foundIn,
        'apps/site/.claude/skills/set-type',
        'where a skill named with its folder was found is kept',
      );
      assert.equal(asked.at(-1), '/api/namespaces/f/workflows/w/steps/review?origin=yours');
      assert.notDeepEqual(placed.queryKey, stepQuery('yours', 'w', 'review').queryKey, 'two places, two answers kept apart');
      assert.notDeepEqual(placed.queryKey, stepQuery('yours', 'w', 'review', { factory: 'g' }).queryKey);
      await (stepQuery('yours', 'w', 'review', { factory: 'f', repo: '/code/app' }).queryFn as unknown as () => Promise<unknown>)();
      assert.equal(asked.at(-1), '/api/namespaces/f/workflows/w/steps/review?origin=yours&repo=%2Fcode%2Fapp');
    },
  );
  await t.test("a Workflow is read as the board's view of it, and a step its object spells `workspace: main` is unread", async (t) => {
    answering(t, listOfItems('Workflow', [workflowObject()]));
    assert.deepEqual(await readWorkflows(), [viewed()], "each step resolved with every key, its own keys and note, the graph's nodes");
    const object = workflowObject();
    const former = {
      ...object,
      status: { ...object.status, steps: object.status.steps.map((step) => ({ ...step, spec: { ...step.spec, workspace: 'main' } })) },
    };
    answering(t, listOfItems('Workflow', [former]));
    await assert.rejects(readWorkflows(), UnreadAnswer, "the former spelling is no word of the object's: its api spells it `base`");
  });
  await t.test(
    "REFUSED: a list of workflows is read in its place — with none, the list the builder drafts from; in a factory, the factory's, under the key its start reads",
    async (t) => {
      const asked = answering(t, listOfItems('Workflow', [workflowObject()]));
      const every = workflowsInQuery(null);
      await (every.queryFn as unknown as () => Promise<unknown>)();
      assert.equal(asked.at(-1), '/api/namespaces/default/workflows?limit=500');
      assert.deepEqual([...every.queryKey], ['workflows']);
      const placed = workflowsInQuery({ factory: 'f', repo: '/code/app' });
      await (placed.queryFn as unknown as () => Promise<unknown>)();
      assert.equal(asked.at(-1), '/api/namespaces/f/workflows?limit=500&repo=%2Fcode%2Fapp');
      assert.deepEqual([...placed.queryKey], ['factory-workflows', 'f', '/code/app']);
    },
  );
});

test("get, the library's reads: each decodes what the api gives, keeps out what it leaves out, drops what the board does not know, and keeps a refusal of the api's", async (t) => {
  await t.test(
    'what the api leaves out stays out: a card entry without examples, a draft without preload, an edge without a guard',
    async (t) => {
      const { examples: _, ...bare } = skillEntry();
      const asked = serving(t, (path) =>
        listOfItems('Agent', path.includes('origin=yours') ? [agentObject(listedAgent({ card: [bare], untried: null }))] : []),
      );
      const [read, ...more] = await readAgents();
      assert.deepEqual(more, [], "the repository's answered none");
      assert.deepEqual(
        [...asked].sort(),
        ['/api/namespaces/default/agents?limit=500&origin=repo', '/api/namespaces/default/agents?limit=500&origin=yours'],
        'each origin of the default namespace read whole, shadowed or not',
      );
      assert.equal(Object.hasOwn(read.card?.[0] ?? {}, 'examples'), false);
      assert.deepEqual(read, listedAgent({ card: [bare], untried: null }));

      const draft = without(consistentSkill().draft ?? assert.fail('the fixture has a draft'), 'preload', 'title');
      const skillAsked = answering(t, skillObject(consistentSkill({ draft })));
      const skill = await readSkill();
      assert.equal(skillAsked.at(-1), '/api/namespaces/default/skills/review-a-change?origin=yours');
      assert.equal(Object.hasOwn(skill.draft ?? {}, 'preload') || Object.hasOwn(skill.draft ?? {}, 'title'), false);
      assert.deepEqual(skill, consistentSkill({ draft }));
    },
  );
  await t.test('a key the board does not know is dropped, not refused', async (t) => {
    serving(t, (path) => listOfItems('Agent', path.includes('origin=yours') ? [{ ...agentObject(), colour: 'blue' }] : []));
    const [read] = await readAgents();
    assert.equal(Object.hasOwn(read, 'colour'), false);
    assert.deepEqual(read, listedAgent());

    const object = workflowObject();
    const [step] = object.status.steps;
    answering(
      t,
      listOfItems('Workflow', [{ ...object, status: { ...object.status, steps: [{ ...step, spec: { ...step.spec, mood: 'calm' } }] } }]),
    );
    const [listed] = await readWorkflows();
    assert.equal(Object.hasOwn(listed.steps[0].spec, 'mood'), false);
    assert.deepEqual(listed, viewed());
  });
  await t.test("an agent the api refused still rejects in the api's words and status, not as an answer unread", async (t) => {
    answering(t, { error: 'no agent agora of yours' }, 404);
    const err: unknown = await readAgent('yours', 'agora').then(
      () => assert.fail('a 404 was read'),
      (e: unknown) => e,
    );
    assert.ok(err instanceof ReadRefusal && !(err instanceof UnreadAnswer), String(err));
    assert.equal(err.status, 404);
    assert.equal(err.message, 'no agent agora of yours');
  });
});

test('the skills are read a place at a time, by origin, each place its folder; a list read page by page', async (t) => {
  const builtin = skillRow();
  const asked = serving(t, (path) => {
    if (path.includes('origin=builtin') && !path.includes('continue'))
      return { ...listOfItems('Skill', []), metadata: { continue: 'next' } };
    if (path.includes('origin=builtin')) return listOfItems('Skill', [skillObject(consistentSkill({ skill: builtin, users: [] }))]);
    return listOfItems('Skill', []);
  });
  const places = await readSkills();
  assert.deepEqual(
    places.map((place) => place.from),
    ['yours', 'repo', 'builtin'],
    'in the order an agent of yours finds a name, the builtin last',
  );
  assert.deepEqual(places[2], { from: 'builtin', dir: '/work/workflows/skills', skills: [{ ...builtin, usedBy: [] }] });
  assert.equal(places[0].dir, null, 'a place with no skill says no folder');
  assert.ok(
    asked.some((path) => path.includes('origin=builtin') && path.includes('continue=next')),
    `the next page asked by its token: ${asked.join(', ')}`,
  );
});
