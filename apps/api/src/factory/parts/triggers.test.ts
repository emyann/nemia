/**
 * A factory's Triggers (`/api/namespaces/<factory>/triggers/<name>`, factory/parts/triggers.ts, over `nemia factory trigger`, `untrigger`
 * and `schedule`): a story of a card trigger written, read with whether it can spend quota and the cards it queues, a schedule read as
 * the time kind, and the card trigger taken back; and what a write refuses, by status alone — in a scratch store whose factory is filed
 * with the package's own verbs. A trigger whose target reaches only a script condition and card nodes reads `free`, however many cards it
 * queues; one whose target has a session reads `spends`.
 */
import { root } from '../../../test/harness.ts';
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { addFactory, attachWorkflow, recordText } from 'agent-orchestrator/testing';
import { scratch } from 'test-kit/scratch';
import { story } from 'test-kit/checkpoints';
import { app } from '../../app.ts';

const folder = scratch('nemia-api-triggers-folder-');
/** A step file `step` of the workflow `workflow` in the folder's `workflows/`, its frontmatter `keys`. */
const stepIn = (workflow: string, step: string, keys: string) => {
  const file = path.join(folder, 'workflows', workflow, `${step}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `---\nplace: git\n${keys}---\nDo ${step}.\n`);
};
stepIn('sort', 'pick', 'routes: [make, later]\nroute: { script: pick.ts }\n');
stepIn('sort', 'to-make', 'after: pick\nwhen: make\nworkflow: make\nbrief: card\n');
stepIn('sort', 'back', 'after: pick\nwhen: later\ncard: backlog\nrelabel: ready-\n');
stepIn('tidy', 'sweep', 'routes: [a, b]\nroute: { script: sweep.ts }\nends: [a, b]\n');
stepIn('make', 'code', '');
for (const [workflow, script] of [
  ['sort', 'pick.ts'],
  ['tidy', 'sweep.ts'],
] as const)
  fs.writeFileSync(path.join(folder, 'workflows', workflow, script), 'console.log("a")\n');
addFactory({ name: 'mill', volumes: [folder].map((r) => `${r}:rw`) });
for (const workflow of ['sort', 'tidy', 'make']) attachWorkflow({ factory: 'mill', workflow });

const RECORD = '/registry/factories/mill';
const json = { 'content-type': 'application/json' };
const send = (method: string, url: string, body?: unknown) =>
  app.request(url, { method, headers: json, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

type Trigger = import('objects').Trigger;
type TriggerList = import('objects').TriggerList;

/** What the request answered, its status asserted. */
async function answered<T>(res: Response | Promise<Response>, status = 200) {
  const answer = await res;
  const body = (await answer.json()) as T;
  assert.equal(answer.status, status, JSON.stringify(body));
  return body;
}

/** A request refused with `status`, the factory's file left as it was. */
async function refusedWith(res: () => Response | Promise<Response>, status: number) {
  const before = recordText(root, RECORD) ?? '';
  const answer = await res();
  assert.equal(answer.status, status, JSON.stringify(await answer.json()));
  assert.equal(recordText(root, RECORD) ?? '', before, 'a refused request leaves the factory as it was');
}

const onCards = (labelSelector: string, to: string) => ({
  when: { kind: 'cards', labelSelector },
  target: { kind: 'Workflow', name: to },
});

describe('a person sets a card trigger, reads what it can spend, and takes it back', () => {
  const s = story(test);
  s.test('PUT writes a card trigger to sort, which reaches make by its card node and so can spend quota', async () => {
    const t = await answered<Trigger>(send('PUT', '/api/namespaces/mill/triggers/ready', onCards('ready=yes', 'sort')));
    assert.deepEqual(
      [t.kind, t.spec.when.kind, t.status.from, t.status.quota, t.status.quotaBy],
      ['Trigger', 'cards', 'factory', 'spends', 'make'],
    );
    assert.ok(t.written?.file, 'the write answers the file it wrote');
  });
  s.test('a card trigger to tidy, whose one step is a script condition, costs no quota', async () => {
    const t = await answered<Trigger>(send('PUT', '/api/namespaces/mill/triggers/sweep', onCards('tidy=yes', 'tidy')));
    assert.equal(t.status.quota, 'free');
  });
  s.test('a schedule of make reads as a trigger of the time kind that spends, named by its workflow', async () => {
    const time = { when: { kind: 'time', cron: '0 3 * * *', brief: 'make it' }, target: { kind: 'Workflow', name: 'make' } };
    await answered<Trigger>(send('PUT', '/api/namespaces/mill/triggers/make', time));
    const list = await answered<TriggerList>(app.request('/api/namespaces/mill/triggers'));
    const make = list.items.find((t) => t.metadata.name === 'make');
    assert.deepEqual([make?.spec.when.kind, make?.status.quota], ['time', 'spends']);
    assert.ok(make?.status.next, 'a time trigger says its next fire beside its quota');
  });
  s.test('DELETE takes the card trigger back, and the factory holds it no more', async () => {
    await answered<Trigger>(send('DELETE', '/api/namespaces/mill/triggers/sweep'));
    const file = JSON.parse(recordText(root, RECORD) ?? '') as { triggers?: Record<string, unknown> };
    assert.deepEqual(Object.keys(file.triggers ?? {}), ['ready']);
  });
});

describe('what a trigger write refuses', () => {
  test('a time trigger named apart from its target is a 422', async () => {
    const time = { when: { kind: 'time', cron: '0 3 * * *', brief: 'b' }, target: { kind: 'Workflow', name: 'make' } };
    await refusedWith(() => send('PUT', '/api/namespaces/mill/triggers/nightly', time), 422);
  });
  test('a card trigger to a workflow the factory does not offer is a 422', async () => {
    await refusedWith(() => send('PUT', '/api/namespaces/mill/triggers/x', onCards('a=b', 'nowhere')), 422);
  });
  test('a labelSelector that does not read is a 422', async () => {
    await refusedWith(() => send('PUT', '/api/namespaces/mill/triggers/x', onCards('a in (b', 'sort')), 422);
  });
  test('taking back a trigger the factory does not have is a 404', async () => {
    await refusedWith(() => send('DELETE', '/api/namespaces/mill/triggers/none'), 404);
  });
});
