/**
 * Every list of the `Api` answers a page, never the whole store: over a store planted with more of each kind than a page holds, each
 * `page` read of `READS` answers at most `LIST_PAGE.byDefault` objects where no `limit` is asked, with the `continue` of the rest; at most
 * `LIST_PAGE.most` however large a `limit` is asked; and its `continue` followed reaches every planted object once. Each kind is planted
 * as its store keeps it, in files, never through the api's writes but one delegation, cloned. Past the most (`MANY`): the cards, the
 * factories, a factory's MCP servers, proposals and delegations, the subscriptions and the feed's events. Past a default page alone
 * (`SOME`): the runs, the workflows with their hires and schedules, your agents and your skills, whose lists read each object whole on
 * every page. The builtin templates and MCP servers are as many as the package ships, fewer than a page, and the volumes none: their pages
 * are read, and not planted past one.
 */
import { root } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { type ApiGetName, LIST_PAGE, READS } from 'objects';
import { app } from '../src/app.ts';

/** More of each kind than a page may hold. */
const MANY = LIST_PAGE.most + 7;
/**
 * More than a default page holds, fewer than the most: the kinds whose list reads each object whole on every page (a run judged, a
 * workflow, an agent or a skill loaded, about 16 ms each), which planted past the most would make this file minutes long.
 */
const SOME = LIST_PAGE.byDefault + 7;
const names = (prefix: string, count = MANY): string[] =>
  Array.from({ length: count }, (_, i) => `${prefix}-${String(i).padStart(4, '0')}`);

const write = (file: string, text: string): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** The factory the namespaced kinds are planted in but the workflows; `repo` holds the workflows the other offers. */
const FACTORY = 'pf';
const repo = path.join(root, 'pf-repo');

const RUNS = names('r-paged', SOME);
for (const id of RUNS)
  write(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo: '/code/app',
      workspace: '/code/app',
      baseRef: 'abc123',
      branch: 'main',
      isolate: true,
      brief: `Page ${id}`,
      workflowDir: path.join(root, 'no-such-workflow'),
      createdAt: '2026-11-02T06:00:00.000Z',
      workflow: [{ name: 'implement', after: [], body: 'Implement it.', harness: 'claude' }],
      steps: { implement: { taskId: null } },
    }),
  );

const CARDS = names('c-paged');
for (const name of CARDS) write(path.join(root, 'inbox', `${name}.md`), `Do ${name}.\n`);

const FACTORIES = names('f-paged');
for (const name of FACTORIES) write(path.join(root, 'factories', `${name}.json`), JSON.stringify({ repos: [repo] }));

const WORKFLOWS = names('wf-paged', SOME);
const STEPS = WORKFLOWS.map((wf) => `${wf}/implement`);
for (const wf of WORKFLOWS) write(path.join(repo, 'workflows', wf, 'implement.md'), '---\nharness: claude\n---\nImplement it.\n');
const AGENTS = names('agent-paged', SOME);
/** Your agents, planted once your skills are read and taken away: see `SKILLS`. */
const agentsPlanted = (): void => {
  for (const name of AGENTS) write(path.join(root, 'workflows', 'agents', `${name}.md`), `---\nharness: claude\n---\nYou are ${name}.\n`);
};
const SKILLS = names('skill-paged', SOME);
/**
 * Your skills, planted for their own read and taken away after it, before your agents are planted: a skill's list reads every agent of
 * yours for each skill, so a hundred of each together cost a page eighteen seconds.
 */
const skillsDir = path.join(root, 'workflows', 'skills');
const skillsPlanted = (): void => {
  for (const name of SKILLS)
    write(path.join(skillsDir, name, 'SKILL.md'), `---\nname: ${name}\ndescription: The skill ${name}.\n---\nDo it.\n`);
};
const skillsGone = (): void => {
  for (const name of SKILLS) fs.rmSync(path.join(skillsDir, name), { recursive: true, force: true });
};

const SERVERS = names('server-paged');
write(
  path.join(root, 'factories', FACTORY, 'servers.json'),
  JSON.stringify({ servers: Object.fromEntries(SERVERS.map((n) => [n, { type: 'http', url: `https://${n}.example/mcp` }])) }),
);
write(path.join(root, 'factories', `${FACTORY}.json`), JSON.stringify({ repos: [repo] }));

/**
 * The factory the workflows are attached in, each hired and scheduled: a Hire is a step of a workflow it offers, read with it, and a
 * schedule is of one it offers, so the three are as many as the workflows.
 */
const WORKFLOW_FACTORY = 'pw';
const HIRES = WORKFLOWS.map((wf) => `${wf}.implement`);
const SCHEDULES = WORKFLOWS;
write(
  path.join(root, 'factories', `${WORKFLOW_FACTORY}.json`),
  JSON.stringify({
    repos: [repo],
    workflows: WORKFLOWS,
    hires: Object.fromEntries(STEPS.map((step, i) => [step, AGENTS[i]])),
    schedules: Object.fromEntries(
      SCHEDULES.map((wf) => [wf, { cron: '0 9 * * *', brief: `Run ${wf}.`, since: '2026-11-02T06:00:00.000Z' }]),
    ),
  }),
);

const PROPOSALS = names('p-paged');
for (const name of PROPOSALS)
  write(
    path.join(root, 'factories', FACTORY, 'proposals', `${name}.json`),
    JSON.stringify({
      apiVersion: 'nemia/v1',
      kind: 'Proposal',
      metadata: { name, namespace: FACTORY, creationTimestamp: '2026-11-02T06:00:00.000Z', resourceVersion: '1' },
      spec: { objects: [] },
      status: { phase: 'waiting', proposedBy: {}, changes: [], widens: false },
    }),
  );

const DELEGATIONS = names('d-paged');
const SUBSCRIPTIONS = names('s-paged');
for (const name of SUBSCRIPTIONS)
  write(
    path.join(root, 'subscriptions', `${name}.json`),
    JSON.stringify({ task: 'nemia', selectors: ['reason=AwaitingAnswer'], digestEvery: 60, from: 0 }),
  );

const EVENTS = names('r-event');
write(
  path.join(root, 'feed.jsonl'),
  EVENTS.map((run) => `${JSON.stringify({ at: '2026-11-05T10:00:00.000Z', run, word: 'running' })}\n`).join(''),
);

/**
 * The delegations, each cloned from one the api wrote (`PUT …/delegations/:name`), its file the store's own format with its name in
 * place of the first's.
 */
async function delegationsPlanted(): Promise<void> {
  const dir = path.join(root, 'factories', FACTORY, 'delegations');
  const [first = '', ...rest] = DELEGATIONS;
  const put = await app.request(`/api/namespaces/${FACTORY}/delegations/${first}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify({ rules: [{ resources: ['workflows'], resourceNames: [], verbs: ['update'] }] }),
  });
  assert.equal(put.status, 200, `the first delegation is written: ${await put.text()}`);
  const [file = ''] = fs.readdirSync(dir);
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  for (const name of rest) fs.writeFileSync(path.join(dir, file.replace(first, name)), text.replaceAll(first, name));
}

/** Each `page` read of `READS` with the URL it is read at and the names planted for it; none where it is not planted past a page. */
const PAGES: Readonly<
  Record<string, { readonly url: string; readonly planted?: readonly string[]; readonly before?: () => void; readonly after?: () => void }>
> = {
  'runs.listAll': { url: '/api/runs', planted: RUNS },
  'runs.list': { url: '/api/namespaces/default/runs', planted: RUNS },
  'cards.listAll': { url: '/api/cards', planted: CARDS },
  'cards.list': { url: '/api/namespaces/default/cards', planted: CARDS },
  'factories.listAll': { url: '/api/factories', planted: FACTORIES },
  'mcpservers.list': { url: `/api/namespaces/${FACTORY}/mcpservers`, planted: SERVERS },
  'builtin.mcpservers': { url: '/api/builtin/mcpservers' },
  'schedules.list': { url: `/api/namespaces/${WORKFLOW_FACTORY}/schedules`, planted: SCHEDULES },
  'hires.list': { url: `/api/namespaces/${WORKFLOW_FACTORY}/hires`, planted: HIRES },
  'volumes.list': { url: `/api/namespaces/${FACTORY}/volumes` },
  'workflows.list': { url: `/api/namespaces/${WORKFLOW_FACTORY}/workflows`, planted: WORKFLOWS },
  'templates.listAll': { url: '/api/templates' },
  'templates.workflows': { url: '/api/templates/sdlc/workflows' },
  'templates.agents': { url: '/api/templates/sdlc/agents' },
  'templates.skills': { url: '/api/templates/sdlc/skills' },
  'subscriptions.listAll': { url: '/api/subscriptions', planted: SUBSCRIPTIONS },
  'events.listAll': { url: '/api/events', planted: EVENTS },
  'events.list': { url: '/api/namespaces/default/events', planted: EVENTS },
  'proposals.list': { url: `/api/namespaces/${FACTORY}/proposals`, planted: PROPOSALS },
  'delegations.list': { url: `/api/namespaces/${FACTORY}/delegations`, planted: DELEGATIONS },
  'skills.list': { url: '/api/namespaces/default/skills', planted: SKILLS, before: skillsPlanted, after: skillsGone },
  'agents.list': { url: '/api/namespaces/default/agents', planted: AGENTS, before: agentsPlanted },
};

/** A page of a list, as every list of the `Api` answers one. */
type Page = {
  readonly items: readonly { metadata: { name: string }; involved?: { name: string } }[];
  readonly metadata: { continue?: string };
};

/** The page `url` answers with `query`, which must be a 200. */
async function pageOf(url: string, query = ''): Promise<Page> {
  const res = await app.request(`${url}${query === '' ? '' : `${url.includes('?') ? '&' : '?'}${query}`}`);
  assert.equal(res.status, 200, `${url}?${query}: ${res.status}`);
  return (await res.json()) as Page;
}

/** The name an item of a list is planted by: an event's, the object it is about. */
const nameOf = (item: Page['items'][number]): string => item.involved?.name ?? item.metadata.name;

test('every page read of READS is read here', () => {
  const pages = Object.entries(READS)
    .filter(([, bound]) => bound.shape === 'page')
    .map(([read]) => read);
  assert.deepEqual(pages.sort(), Object.keys(PAGES).sort());
});

test('every list answers a page of its default, at most its most however much is asked, and its continue reaches every object once', async () => {
  await delegationsPlanted();
  const wrong: string[] = [];
  for (const [read, { url, planted, before, after }] of Object.entries(PAGES)) {
    before?.();
    const first = await pageOf(url);
    if (first.items.length > LIST_PAGE.byDefault) wrong.push(`${read}: ${first.items.length} items where no limit is asked`);
    const most = await pageOf(url, 'limit=10000');
    if (most.items.length > LIST_PAGE.most) wrong.push(`${read}: ${most.items.length} items asked 10000`);
    if (planted === undefined) continue;
    if (first.items.length !== LIST_PAGE.byDefault || first.metadata.continue === undefined)
      wrong.push(`${read}: a first page of ${first.items.length}, its continue ${first.metadata.continue ?? 'none'}`);
    if (most.items.length < Math.min(planted.length, LIST_PAGE.most))
      wrong.push(`${read}: ${most.items.length} items asked 10000 of ${planted.length} planted`);
    const seen: string[] = first.items.map(nameOf);
    for (let next = first.metadata.continue, pages = 0; next !== undefined && pages < 50; pages++) {
      const page = await pageOf(url, `limit=${LIST_PAGE.most}&continue=${encodeURIComponent(next)}`);
      seen.push(...page.items.map(nameOf));
      next = page.metadata.continue;
    }
    const counted = new Map<string, number>();
    for (const name of seen) counted.set(name, (counted.get(name) ?? 0) + 1);
    const missing = planted.filter((name) => counted.get(name) !== 1);
    if (missing.length > 0) wrong.push(`${read}: ${missing.length} planted objects not reached once (${missing.slice(0, 3).join(', ')}…)`);
    after?.();
  }
  assert.deepEqual(wrong, []);
});

test('a read named in PAGES is a page of READS', () => {
  for (const read of Object.keys(PAGES)) assert.equal(READS[read as ApiGetName].shape, 'page', read);
});
