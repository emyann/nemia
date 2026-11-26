/**
 * The orchestrator and the api answer one `resourceVersion` for one object: the orchestrator's own read in process (`definitionRevisionNow`
 * for a library agent, `hireObject` for a Hire) and the api's GET of it, read with nothing written between, carry the same revision.
 */
import { root } from './harness.ts';
import { definitionRevisionNow, hireObject } from 'agent-orchestrator';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Agent, Hire } from 'objects';
import { TEAM } from './team.ts';
import { app, runtime } from '../src/app.ts';

const STORE = path.join(root, 'workflows');
fs.cpSync(path.join(TEAM, 'agents'), path.join(STORE, 'agents'), { recursive: true });
fs.cpSync(path.join(TEAM, 'skills'), path.join(STORE, 'skills'), { recursive: true });
fs.cpSync(path.join(TEAM, 'dev'), path.join(STORE, 'dev'), { recursive: true });
fs.mkdirSync(path.join(root, 'factories'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'factories', 'agree.json'),
  JSON.stringify({ volumes: [{ path: root, readOnly: false }], workflows: ['dev'], hires: {}, schedules: {} }),
);

test('a library agent has one resourceVersion, in process and through the api', async () => {
  const inProcess = String(await runtime.runPromise(definitionRevisionNow('Agent', undefined, 'implementer')));
  const served = (await (await app.request('/api/agents/implementer?origin=user')).json()) as Agent;
  assert.equal(served.metadata.resourceVersion, inProcess);
});

test('a Hire has one resourceVersion, in process and through the api', async () => {
  const listed = (await (await app.request('/api/namespaces/agree/hires')).json()) as { items: Hire[] };
  const name = listed.items[0]?.metadata.name;
  assert.ok(name !== undefined, 'the factory offers a workflow with a step to hire for');
  const inProcess = await runtime.runPromise(hireObject(root, 'agree', name));
  const served = (await (await app.request(`/api/namespaces/agree/hires/${name}`)).json()) as Hire;
  assert.equal(served.metadata.resourceVersion, inProcess.metadata.resourceVersion);
});
