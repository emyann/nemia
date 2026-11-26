/**
 * The definition writers judge freshness themselves, with no api in the path: a write or a removal names the `resourceVersion` the
 * definition was read at, which the writer holds to the revision the definition stands at now (`definitionRevisionNow`, worked out with no
 * write) and refuses `Conflict` where it moved; a definition no sweep has numbered is written and removed at the revision it was read at,
 * and stands at a real one after (the writer sweeps once it has written). Refusals are asserted by their class, never their sentence.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runOver } from './placed.ts';
import { runWith as runEngine } from '../src/runner.ts';
import { engineOf } from '../src/runtime-client.ts';
import { agentDraftOf } from '../src/agents/agents.ts';
import { AGENTS_WRITE } from '../src/agents/library.verb.ts';
import { WORKFLOWS_REMOVE } from '../src/workflows/workflows.verb.ts';
import { definitionRevisionNow, indexSweep } from '../src/definition-index/definition-index.store.ts';
import { keyspaceHead } from '../src/list-watch/kind-watch.store.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-definition-writers-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT };
const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
const runWith = runOver(runEngine, () => stand().layer, ENV);
const e = () => engineOf(engine().layer);

const AGENT = '---\nrole: coder\ndescription: Writes code.\n---\nWrite it.\n';
const agentFile = path.join(ROOT, 'workflows', 'agents', 'coder.md');
fs.mkdirSync(path.dirname(agentFile), { recursive: true });
fs.writeFileSync(agentFile, AGENT);
const draft = agentDraftOf('coder', AGENT.replace('Write it.', 'Write it well.'));

const revisionOf = () => runWith(e(), definitionRevisionNow('Agent', undefined, 'coder')).then(String);
const head = () => runWith(e(), keyspaceHead());

test('REFUSED: a write at a revision the definition has moved from is refused Conflict by the writer, and the file is untouched', async () => {
  await runWith(e(), indexSweep());
  const read = await revisionOf();
  fs.appendFileSync(agentFile, 'Changed by hand.\n');
  const before = fs.readFileSync(agentFile, 'utf8');
  assert.notEqual(await revisionOf(), read, 'a hand edit moved the revision with no write');
  await assert.rejects(
    runWith(e(), AGENTS_WRITE.handler({ from: 'user', name: 'coder', draft, schema: null, version: read })),
    (err: Error) => (err as { _tag?: string })._tag === 'Conflict',
  );
  assert.equal(fs.readFileSync(agentFile, 'utf8'), before);
});

test('a definition no sweep has numbered is written at the revision it was read at, and stands at a real revision after', async () => {
  const read = await revisionOf();
  const before = await head();
  await runWith(e(), AGENTS_WRITE.handler({ from: 'user', name: 'coder', draft, schema: null, version: read }));
  assert.match(fs.readFileSync(agentFile, 'utf8'), /Write it well\./);
  assert.ok((await head()) > before, 'the writer swept, so the index moved');
  assert.ok(Number(await revisionOf()) <= (await head()), 'the definition stands at a revision the keyspace holds');
});

test('a folder no sweep has numbered is removed at the revision it was read at', async () => {
  const dir = path.join(ROOT, 'workflows', 'gone');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'only.md'), '---\nplace: git\n---\nDo it.\n');
  const read = String(await runWith(e(), definitionRevisionNow('Workflow', undefined, 'gone')));
  await runWith(e(), WORKFLOWS_REMOVE.handler({ from: 'user', name: 'gone', version: read }));
  assert.equal(fs.existsSync(dir), false);
});

test('REFUSED: a removal at a stale revision is refused Conflict and the folder stays', async () => {
  const dir = path.join(ROOT, 'workflows', 'kept');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'only.md'), '---\nplace: git\n---\nDo it.\n');
  await runWith(e(), indexSweep());
  const read = String(await runWith(e(), definitionRevisionNow('Workflow', undefined, 'kept')));
  fs.appendFileSync(path.join(dir, 'only.md'), 'More.\n');
  await assert.rejects(
    runWith(e(), WORKFLOWS_REMOVE.handler({ from: 'user', name: 'kept', version: read })),
    (err: Error) => (err as { _tag?: string })._tag === 'Conflict',
  );
  assert.ok(fs.existsSync(dir));
});
