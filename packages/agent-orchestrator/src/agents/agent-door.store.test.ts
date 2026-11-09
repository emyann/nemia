/**
 * The Agent door's files layer: the door's walks (`test/agent-walks.ts`) on a fresh scratch store each, and what only the files can be
 * asked — the default door's root, an agent's file that is a link, and a step beside the agents that still names one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { seamUses as usesOf, sourcesUnder } from 'test-kit/debt';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
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

/** The functions of the stores the Agent and Skill doors are over that `src`'s code still calls rather than yielding a door. */
const SEAM = [
  'agentsFor',
  'loadAgents',
  'agentVersion',
  'skillsFor',
  'skillRead',
  'skillVersion',
  'skillFolders',
  'writeAgent',
  'removeAgent',
  'writeSkill',
  'copySkill',
  'customInstructionsFor',
  'readCustomInstructions',
  'writeCustomInstructions',
  'clearCustomInstructions',
];

/** The stores the doors are over, and the doors' own files: where the seam is defined, not a debt. */
const OWN = [
  'src/agents/read.store.ts',
  'src/agents/agents.store.ts',
  'src/custom/custom.store.ts',
  'src/skills/read.store.ts',
  'src/skills/skills.store.ts',
  'src/agents/agent-door.store.ts',
  'src/agents/agent-memory.store.ts',
  'src/skills/skill-door.store.ts',
  'src/skills/skill-memory.store.ts',
];

const PKG = path.join(import.meta.dirname, '..', '..');

/** Every file of `src` but the tests and the stores, by its path from the package. */
const sourcesOfSrc = (): Record<string, string> => sourcesUnder(PKG, 'src', OWN);

/**
 * A call of a `SEAM` name, not a method of the same name (`x.loadAgents(`). `src`'s count passes over a spread call too
 * (`[...loadAgents(dir)]`), as its baseline was counted; the api's (`SPREAD_TOO`) counts one, its debt being none.
 */
const SEAM_CALL = `(?<![\\w$.])(?:${SEAM.join('|')})\\s*\\(`;
const SPREAD_TOO = `(?<![\\w$]|[^.]\\.)(?:${SEAM.join('|')})\\s*\\(`;

/**
 * Each file of `sources` that calls the agent and skill stores rather than yielding the doors, with how many times: a refusal, since every
 * caller is converted and none may come back.
 */
function seamRefusals(sources: Record<string, string>, calls = SEAM_CALL): string[] {
  return [...usesOf(sources, new RegExp(calls, 'g'))].map(
    ([file, n]) => `${file} calls the agent and skill stores ${n} time(s): yield AgentDoor or SkillDoor instead`,
  );
}

test('no file of src calls the agent and skill stores: every caller yields AgentDoor or SkillDoor', () => {
  assert.deepEqual(seamRefusals(sourcesOfSrc()), []);
});

test('REFUSED: a file that calls a store again', () => {
  const sources = sourcesOfSrc();
  const again = { ...sources, 'src/skills/skills.verb.ts': `${sources['src/skills/skills.verb.ts']}\nconst x = skillsFor('a');\n` };
  assert.equal(seamRefusals(again).length, 1);
});

const API = path.join(PKG, '..', '..', 'apps', 'api');

/** Every file of the api's `src` but its tests, by its path from the api. */
const sourcesOfApi = (): Record<string, string> => sourcesUnder(API, 'src');

test("no file of the api's src calls the agent and skill stores: its handlers read them through AgentDoor and SkillDoor, its debt none", () => {
  assert.deepEqual(seamRefusals(sourcesOfApi(), SPREAD_TOO), []);
});

test("REFUSED: a file of the api's src that calls an agent store is one break", () => {
  const sources = sourcesOfApi();
  const again = {
    ...sources,
    'src/workflows/builder.ts': `${sources['src/workflows/builder.ts']}\nconst x = loadAgents('a');\n`,
  };
  assert.equal(seamRefusals(again, SPREAD_TOO).length, 1);
  const spread = { ...sources, 'src/agents/skills.ts': `${sources['src/agents/skills.ts']}\nconst y = [...skillsFor('a')];\n` };
  assert.equal(seamRefusals(spread, SPREAD_TOO).length, 1, 'a call spread into a list is a call');
  const method = { ...sources, 'src/agents/skills.ts': `${sources['src/agents/skills.ts']}\nconst z = door.loadAgents('a');\n` };
  assert.deepEqual(seamRefusals(method, SPREAD_TOO), [], 'a method of the same name is no call of the store');
});

test("an agent's version counts the skills its reader found (`AgentAt.skills`), else those beside its own folder", async () => {
  const { agentVersion } = await import('./read.store.ts');
  const { skillsFor } = await import('../skills/read.store.ts');
  const { side } = store();
  const at = yoursAt(side);
  fs.mkdirSync(at.dir, { recursive: true });
  fs.writeFileSync(path.join(at.dir, 'scribe.md'), '---\ndescription: Writes notes.\nskills: tidy-notes\n---\nWrite them.\n');
  const elsewhere = scratch('wf-agent-skills-');
  fs.mkdirSync(path.join(elsewhere, 'skills', 'tidy-notes'), { recursive: true });
  fs.writeFileSync(path.join(elsewhere, 'skills', 'tidy-notes', 'SKILL.md'), '---\ndescription: Tidy the notes.\n---\nTidy.\n');
  const found = skillsFor(path.join(elsewhere, '_'));
  const own = done(side.door.agents.there(scribe, at));
  const counted = done(side.door.agents.there(scribe, { ...at, skills: found }));
  assert.deepEqual(counted, { kind: 'held', version: agentVersion(at.dir, 'scribe', found) }, 'the version the reader would digest');
  assert.notDeepEqual(counted, own, 'and not the one its own folder gives, which holds no tidy-notes');
});
