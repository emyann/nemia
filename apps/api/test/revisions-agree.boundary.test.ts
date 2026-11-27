/**
 * The orchestrator and the api answer one `resourceVersion` for one object: the orchestrator's own read in process (its verbs for an
 * agent, a skill and a workflow, `hireObject` for a Hire) and the api's GET of it, read with nothing written between, carry the same
 * revision.
 *
 * One agent, one skill and one workflow each have one `resourceVersion`, whichever way they are read: the orchestrator's verbs (what
 * `nemia agents`, `skills show` and the writers answer, in process as `--local` runs them) and the api's GET, with nothing written between,
 * and again after each file is edited by hand. On the code before the readings spoke revisions, the agent and the skill legs fail (the
 * verbs answered a 16-hex digest while the api stamped a revision); the workflow leg held then too, since the api's stamp overwrote the
 * listing's digest.
 */
import { root } from './harness.ts';
import { AGENTS, definitionRevisionsNow, engine, hireObject, SKILLS_READ, WORKFLOWS_WRITE } from 'agent-orchestrator';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Agent, Hire, Skill, Workflow } from 'objects';
import { TEAM } from './team.ts';
import { app, runtime } from '../src/app.ts';
import { runWith } from './builtin-place.ts';

const STORE = path.join(root, 'workflows');
fs.cpSync(path.join(TEAM, 'agents'), path.join(STORE, 'agents'), { recursive: true });
fs.cpSync(path.join(TEAM, 'skills'), path.join(STORE, 'skills'), { recursive: true });
fs.cpSync(path.join(TEAM, 'dev'), path.join(STORE, 'dev'), { recursive: true });
fs.mkdirSync(path.join(root, 'factories'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'factories', 'agree.json'),
  JSON.stringify({ volumes: [{ path: root, readOnly: false }], workflows: ['dev'], hires: {}, schedules: {} }),
);

const SKILL = 'implement-a-change';

/** A verb of the orchestrator run in process on this store, as `nemia --local` runs it. */
const verb = <A, E>(program: Parameters<typeof runWith<A, E>>[1]) => runWith(engine(process.env), program);

/** The agent, the skill and the workflow each read as the orchestrator's verbs read them, and as the api serves them. */
const readAll = async () => {
  const { agents } = await verb(AGENTS.handler({}));
  const table = await runtime.runPromise(definitionRevisionsNow());
  const skill = await verb(SKILLS_READ.handler({ name: SKILL, dir: path.join(STORE, 'skills', SKILL), namespace: 'default' }));
  const served = async <T>(url: string) => (await (await app.request(url)).json()) as T;
  const listed = await served<{ items: Workflow[] }>('/api/namespaces/default/workflows');
  return {
    verb: {
      agent: agents.find((a) => a.name === 'implementer')?.version,
      skill: skill.version,
      workflow: String(table.of('Workflow', 'default', 'dev')),
    },
    api: {
      agent: (await served<Agent>('/api/namespaces/default/agents/implementer?origin=user')).metadata.resourceVersion,
      skill: (await served<Skill>(`/api/namespaces/default/skills/${SKILL}?origin=user`)).metadata.resourceVersion,
      workflow: (await served<Workflow>('/api/namespaces/default/workflows/dev?origin=user')).metadata.resourceVersion,
    },
    listed: listed.items.find((w) => w.metadata.name === 'dev')?.metadata.resourceVersion,
  };
};

test('an agent, a skill and a workflow have one resourceVersion, through the orchestrator and through the api', async () => {
  const before = await readAll();
  assert.match(before.verb.agent ?? '', /^\d+$/, 'the agent reading is a revision, not a digest');
  assert.match(before.verb.skill ?? '', /^\d+$/, 'and so is the skill page');
  assert.deepEqual(before.api, before.verb, 'the api serves the numbers the orchestrator reads');
  assert.equal(before.listed, before.api.workflow, "and a list's item the number a read of it does");

  fs.appendFileSync(path.join(STORE, 'agents', 'implementer.md'), '\nA line added by hand.\n');
  fs.appendFileSync(path.join(STORE, 'skills', SKILL, 'SKILL.md'), '\nA line added by hand.\n');
  fs.appendFileSync(path.join(STORE, 'dev', 'README.md'), '\nA line added by hand.\n');
  const after = await readAll();
  assert.deepEqual(after.api, after.verb, 'after an edit by hand they still agree');
  assert.equal(after.listed, after.api.workflow);
});

test("a workflow written through the orchestrator's verb is served at the revision the verb answered, read and listed", async () => {
  const draft = [{ name: 'plan', after: [], place: 'git' as const, body: 'Plan it.' }];
  const written = await verb(WORKFLOWS_WRITE.handler({ from: 'user', name: 'agreed', draft }));
  assert.match(written.version, /^\d+$/, 'the verb answers a revision');
  const served = (await (await app.request('/api/namespaces/default/workflows/agreed?origin=user')).json()) as Workflow;
  assert.equal(served.metadata.resourceVersion, written.version, "the api's read of it");
  const listed = (await (await app.request('/api/namespaces/default/workflows')).json()) as { items: Workflow[] };
  assert.equal(listed.items.find((w) => w.metadata.name === 'agreed')?.metadata.resourceVersion, written.version, "and its list's item");
});

test('a Hire has one resourceVersion, in process and through the api', async () => {
  const listed = (await (await app.request('/api/namespaces/agree/hires')).json()) as { items: Hire[] };
  const name = listed.items[0]?.metadata.name;
  assert.ok(name !== undefined, 'the factory offers a workflow with a step to hire for');
  const inProcess = await runtime.runPromise(hireObject(root, 'agree', name));
  const served = (await (await app.request(`/api/namespaces/agree/hires/${name}`)).json()) as Hire;
  assert.equal(served.metadata.resourceVersion, inProcess.metadata.resourceVersion);
});
