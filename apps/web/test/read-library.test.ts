/**
 * The library's reads decode the api's answers where they enter (`get`): the agents, the skills, the workflows and a step's page, the
 * builder's form, the repository and the machines: a key the board does not know is dropped, and one the api leaves out stays out. Which
 * keys each answer has — a step's `place`, `workspace` and `slot` among them, so a save of the builder puts them back — is
 * `test/wire.test.ts`'s.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReadRefusal, UnreadAnswer } from '../src/lib/api/read.ts';
import { agentsQuery, readAgent, type LibraryAgent } from '../src/lib/api/agents.ts';
import { skillQuery, type SkillDetail } from '../src/lib/api/skills.ts';
import { stepQuery, workflowsInQuery, workflowsQuery, type WorkflowListing, type WorkflowStepPage } from '../src/lib/api/workflows.ts';
import { machineQuery, type MachineGraph } from '../src/lib/api/machines.ts';
import { listedAgent, machine, skillDetail, skillEntry, stepPage, workflow } from './library-fixtures.ts';

/** Every read answering `body` as JSON, with `status`, for the length of the test. */
function answering(t: { after: (fn: () => void) => void }, body: unknown, status = 200) {
  const before = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  t.after(() => {
    globalThis.fetch = before;
  });
}

const readAgents = agentsQuery.queryFn as unknown as () => Promise<LibraryAgent[]>;
const readSkill = skillQuery('yours', 'review-a-change').queryFn as unknown as () => Promise<SkillDetail>;
const readWorkflows = workflowsQuery.queryFn as unknown as () => Promise<WorkflowListing[]>;
const readMachine = machineQuery('lifecycle').queryFn as unknown as () => Promise<MachineGraph>;

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
      assert.equal(asked.at(-1), '/api/workflows/yours/w/review?factory=f');
      assert.notDeepEqual(placed.queryKey, stepQuery('yours', 'w', 'review').queryKey, 'two places, two answers kept apart');
      assert.notDeepEqual(placed.queryKey, stepQuery('yours', 'w', 'review', { factory: 'g' }).queryKey);
      await (stepQuery('yours', 'w', 'review', { factory: 'f', repo: '/code/app' }).queryFn as unknown as () => Promise<unknown>)();
      assert.equal(asked.at(-1), '/api/workflows/yours/w/review?factory=f&repo=%2Fcode%2Fapp');
    },
  );
  await t.test(
    "REFUSED: a list of workflows is read in its place — with none, the list the builder drafts from; in a factory, the factory's, under the key its start reads",
    async (t) => {
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
    },
  );
});

test("get, the library's reads: each decodes what the api gives, keeps out what it leaves out, drops what the board does not know, and keeps a refusal of the api's", async (t) => {
  await t.test(
    'what the api leaves out stays out: a card entry without examples, a draft without preload, an edge without a guard',
    async (t) => {
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
    },
  );
  await t.test('a key the board does not know is dropped, not refused', async (t) => {
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
