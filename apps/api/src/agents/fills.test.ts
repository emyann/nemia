/**
 * The Agents page in a factory (the package's `stepsFilled` and `inFactory`, answered by agents.ts): the agents a factory has — those it
 * hires into a step and those its attached workflows' steps name — each with the steps it fills, and in the default factory every agent,
 * tagged with the factories it fills a step in. A step is credited to the agent file a start would run it with, found as the loader finds
 * it (`lookupRoots`), never to every agent of that name.
 *
 * The api's own repository (`HKB_REPO`) is `repoR`. Its `alpha` has `implement`, naming no agent, and `review`, naming `iris`; `gamma/plan`
 * names `cleo`; `delta/ship` names none; `broken/named` names `bo` beside `broken/bad`, a step the loader refuses, and `broken/stray`,
 * which names `../agents/cleo`, no agent's name. `repoR` has `ada`,
 * `iris`, `cleo` and `bo` in `workflows/agents/`, and `max` in `.claude/agents/`. Yours has `ada`, `max` and `zed`, and the workflow
 * `omega`, whose `step` names none. `repoS` is a second repository with no workflow.
 *
 * Factories: `hired` (repoR) attaches alpha and hires ada into `alpha/implement`; `empty` (repoR) attaches delta and hires no one;
 * `shadow` (repoR) attaches delta and hires max into `delta/ship`; `other` (repoS) attaches omega and hires zed into `omega/step`.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { app } from '../app.ts';
import { addFactory, attachWorkflow, hireAgent } from 'agent-orchestrator';

type LibraryAgent = import('./agents.ts').LibraryAgent;
type WorkflowListing = import('../workflows/workflows.ts').WorkflowListing;

const write = (file: string, text: string): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const agentText = (does: string): string => `---\nharness: claude\n---\n${does}\n`;

const repoR = scratch('nemia-api-fills-r-');
process.env.HKB_REPO = repoR;
const repoS = scratch('nemia-api-fills-s-');
const STORE = path.join(root, 'workflows');

write(path.join(repoR, 'workflows', 'alpha', 'implement.md'), 'Implement it.\n');
write(path.join(repoR, 'workflows', 'alpha', 'review.md'), '---\nagent: iris\n---\nReview it.\n');
write(path.join(repoR, 'workflows', 'gamma', 'plan.md'), '---\nagent: cleo\n---\nPlan it.\n');
write(path.join(repoR, 'workflows', 'delta', 'ship.md'), 'Ship it.\n');
write(path.join(repoR, 'workflows', 'broken', 'named.md'), '---\nagent: bo\n---\nDo it.\n');
write(path.join(repoR, 'workflows', 'broken', 'bad.md'), '---\nnotakey: 1\n---\nDo it.\n');
write(path.join(repoR, 'workflows', 'broken', 'stray.md'), '---\nagent: ../agents/cleo\n---\nDo it.\n');
for (const name of ['ada', 'iris', 'cleo', 'bo'])
  write(path.join(repoR, 'workflows', 'agents', `${name}.md`), agentText(`You are ${name}.`));
write(path.join(repoR, '.claude', 'agents', 'max.md'), agentText('You are the repository max.'));
for (const name of ['ada', 'max', 'zed']) write(path.join(STORE, 'agents', `${name}.md`), agentText(`You are your ${name}.`));
write(path.join(STORE, 'omega', 'step.md'), 'Step it.\n');

for (const [name, repo, workflow] of [
  ['hired', repoR, 'alpha'],
  ['empty', repoR, 'delta'],
  ['shadow', repoR, 'delta'],
  ['other', repoS, 'omega'],
] as const) {
  addFactory({ name, repos: [repo] });
  attachWorkflow({ factory: name, workflow });
}
hireAgent({ factory: 'hired', agent: 'ada', step: 'alpha/implement' });
hireAgent({ factory: 'shadow', agent: 'max', step: 'delta/ship' });
hireAgent({ factory: 'other', agent: 'zed', step: 'omega/step' });

const get = async <T>(url: string): Promise<T> => {
  const res = await app.request(url);
  const body = (await res.json()) as T;
  assert.equal(res.status, 200, JSON.stringify(body));
  return body;
};
const agents = (url: string): Promise<LibraryAgent[]> => get<LibraryAgent[]>(url);
const who = (listed: LibraryAgent[]): string[] => listed.map((a) => `${a.from}:${a.name}`);
const one = (listed: LibraryAgent[], from: string, name: string): LibraryAgent => {
  const found = listed.find((a) => a.from === from && a.name === name);
  assert.ok(found, `${from}:${name} is listed: ${who(listed).join(', ')}`);
  return found;
};

test("a factory's Agents page lists the agent it hires, with the step it fills, hired — and not yours of the same name", async () => {
  const listed = await agents('/api/agents?factory=hired');
  assert.deepEqual(who(listed), ['repo:ada', 'repo:iris'], 'the hire, and the agent the attached alpha names: nothing else');
  assert.deepEqual(one(listed, 'repo', 'ada').fills, [{ from: 'repo', workflow: 'alpha', step: 'implement', hired: true }]);
});

test('a factory that hires no one, into workflows whose steps name no agent, has no agents', async () => {
  assert.deepEqual(await agents('/api/agents?factory=empty'), []);
});

test("a step's written agent counts in a factory only when the factory attaches its workflow", async () => {
  const listed = await agents('/api/agents?factory=hired');
  assert.deepEqual(one(listed, 'repo', 'iris').fills, [{ from: 'repo', workflow: 'alpha', step: 'review', hired: false }]);
  assert.ok(!who(listed).includes('repo:cleo'), 'gamma/plan names cleo, and hired has not attached gamma');
});

test("a hire is credited to the file a start would run, the workflow's own agents/ before yours, and yours when the repository has none", async () => {
  const listed = await agents('/api/agents');
  assert.deepEqual(one(listed, 'repo', 'ada').factories, ['hired']);
  assert.deepEqual([one(listed, 'yours', 'ada').fills, one(listed, 'yours', 'ada').factories], [[], []]);

  const theirs = path.join(repoR, 'workflows', 'agents', 'ada.md');
  const text = fs.readFileSync(theirs, 'utf8');
  fs.rmSync(theirs);
  try {
    const fallen = await agents('/api/agents?factory=hired');
    assert.deepEqual(one(fallen, 'yours', 'ada').fills, [{ from: 'repo', workflow: 'alpha', step: 'implement', hired: true }]);
    assert.deepEqual(one(await agents('/api/agents'), 'yours', 'ada').factories, ['hired']);
  } finally {
    fs.writeFileSync(theirs, text);
  }
});

test("the repository's .claude/agents/ comes before yours: a hire it answers is not credited to yours of the same name", async () => {
  assert.deepEqual(await agents('/api/agents?factory=shadow'), [], "the repository's max is not on the page, and yours does not fill it");
  const max = one(await agents('/api/agents'), 'yours', 'max');
  assert.deepEqual([max.fills, max.factories], [[], []]);
});

test('in the default factory every agent is listed, each tagged with the factories it fills a step in — on any repository of theirs', async () => {
  const listed = await agents('/api/agents');
  assert.deepEqual(who(listed), ['repo:ada', 'repo:bo', 'repo:cleo', 'repo:iris', 'yours:ada', 'yours:max', 'yours:zed']);
  assert.deepEqual(one(listed, 'yours', 'zed').factories, ['other'], 'hired by a factory on repoS, into a workflow of yours');
  assert.deepEqual(one(listed, 'yours', 'zed').fills, [], 'the default factory hires no one');
  assert.deepEqual(one(listed, 'repo', 'iris').factories, ['hired'], 'named by a step of a workflow hired attaches');
  assert.deepEqual(one(listed, 'repo', 'cleo').factories, [], 'named only in gamma, which no factory attaches');
  assert.deepEqual(one(listed, 'repo', 'cleo').fills, [{ from: 'repo', workflow: 'gamma', step: 'plan', hired: false }]);
});

test('a factory whose file does not read tags nothing, and hides no other', async () => {
  write(path.join(root, 'factories', 'broken.json'), '{ not json');
  try {
    const listed = await agents('/api/agents');
    assert.deepEqual(one(listed, 'yours', 'zed').factories, ['other']);
    assert.deepEqual(one(listed, 'repo', 'ada').factories, ['hired']);
  } finally {
    fs.rmSync(path.join(root, 'factories', 'broken.json'));
  }
});

test('?factory=default is the default factory for the Agents page: the same answer as naming none', async () => {
  assert.deepEqual(await agents('/api/agents?factory=default'), await agents('/api/agents'));
});

test('a step of a folder the loader refuses still credits the agent it names', async () => {
  const broken = (await get<WorkflowListing[]>('/api/workflows')).find((w) => w.name === 'broken');
  assert.ok(broken?.error, 'the folder does not load');
  assert.deepEqual(one(await agents('/api/agents'), 'repo', 'bo').fills, [
    { from: 'repo', workflow: 'broken', step: 'named', hired: false },
  ]);
});

test("the workflow listing's `hired` is the factory's hire into the step: null for a step it does not hire into, and in the default factory", async () => {
  const hired = (await get<WorkflowListing[]>('/api/workflows?factory=hired'))[0];
  assert.deepEqual(
    hired.steps.map((s) => [s.name, s.hired, s.spec.agent]),
    [
      ['implement', 'ada', 'ada'],
      ['review', null, 'iris'],
    ],
  );
  const all = await get<WorkflowListing[]>('/api/workflows');
  assert.deepEqual(
    all.flatMap((w) => w.steps.map((s) => s.hired)),
    all.flatMap((w) => w.steps.map(() => null)),
  );
});

test('REFUSED: a step whose `agent:` holds a path separator credits no agent, not even the file the path would reach', async () => {
  assert.deepEqual(
    one(await agents('/api/agents'), 'repo', 'cleo').fills,
    [{ from: 'repo', workflow: 'gamma', step: 'plan', hired: false }],
    'broken/stray names ../agents/cleo, which the package refuses as a name: gamma/plan is all cleo fills',
  );
});
