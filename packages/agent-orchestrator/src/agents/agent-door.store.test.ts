/**
 * The Agent door's files layer: the door's walks (`test/agent-walks.ts`) on a fresh scratch store each, and what only the files can be
 * asked — the default door's root, an agent's file that is a link, and a step beside the agents that still names one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from '../../test/scratch.ts';
import { act, done, doorFrom, walksOn } from '../../test/door-walks.ts';
import { AGENT_WALKS, anAgent, yoursAt } from '../../test/agent-walks.ts';
import { AgentDoor, agentDoorFiles } from './agent-door.store.ts';
import { AgentName } from './agents.model.ts';
import { StoreRoot } from '../config/root.store.ts';

for (const [name, body] of walksOn(AGENT_WALKS, () => {
  const root = scratch('wf-agent-door-');
  return { door: doorFrom(AgentDoor, agentDoorFiles(root)), root, layer: 'files' };
}))
  test(name, body);

/** A fresh store and its Agent door over the files. */
const store = () => {
  const root = scratch('wf-agent-door-');
  return { root, side: { root, door: doorFrom(AgentDoor, agentDoorFiles(root)), layer: 'files' } };
};

const scribe = AgentName.read('scribe');

test('the default door reads the files at the store root the program is given, and refuses Invalid where it was given none', () => {
  const { root, side } = store();
  done(side.door.agents.write(scribe, anAgent(), undefined, yoursAt(side)));
  const list = Effect.gen(function* () {
    return yield* (yield* AgentDoor).agents.list(path.join(root, 'workflows', 'agents'));
  });
  assert.deepEqual(act(Effect.provideService(list, StoreRoot, root)), ['scribe']);
  assert.deepEqual(act(list), { refused: 'Invalid' });
});

test("REFUSED: an agent's file that is a link is neither written through nor removed, and what it points at is left as it was", () => {
  const { root, side } = store();
  const outside = path.join(root, 'outside.md');
  fs.writeFileSync(outside, 'mine\n');
  fs.mkdirSync(yoursAt(side).dir, { recursive: true });
  fs.symlinkSync(outside, path.join(yoursAt(side).dir, 'scribe.md'));
  const there = done(side.door.agents.there(scribe, yoursAt(side)));
  const version = there.kind === 'held' ? there.version : undefined;
  assert.deepEqual(
    [act(side.door.agents.write(scribe, anAgent(), version, yoursAt(side))), act(side.door.agents.remove(scribe, version, yoursAt(side)))],
    [{ refused: 'Invalid' }, { refused: 'Invalid' }],
  );
  assert.equal(fs.readFileSync(outside, 'utf8'), 'mine\n');
});

test('REFUSED: a rename or a removal of an agent a step beside it still names is a Conflict naming the step, the agent kept', () => {
  const { root, side } = store();
  const { version } = done(side.door.agents.write(scribe, anAgent(), undefined, yoursAt(side)));
  fs.mkdirSync(path.join(root, 'workflows', 'dev'), { recursive: true });
  fs.writeFileSync(path.join(root, 'workflows', 'dev', 'notes.md'), '---\nplace: git\nagent: scribe\n---\nTake the notes.\n');
  const users = (answer: unknown) => answer;
  const renamed = Effect.runSyncExit(side.door.agents.write(scribe, anAgent('notary'), version, yoursAt(side)));
  const removed = Effect.runSyncExit(side.door.agents.remove(scribe, version, yoursAt(side)));
  for (const exit of [renamed, removed]) {
    assert.ok(exit._tag === 'Failure');
    const failure = exit.cause.reasons.find((r) => r._tag === 'Fail');
    const err = failure?._tag === 'Fail' ? failure.error : undefined;
    assert.equal(err?._tag, 'Conflict');
    assert.deepEqual(users(err?._tag === 'Conflict' && err.users), ['dev/notes']);
  }
  assert.deepEqual(done(side.door.agents.list(yoursAt(side).dir)), ['scribe']);
});
