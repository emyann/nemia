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
function sourcesOfSrc(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of fs.readdirSync(path.join(PKG, 'src'), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
    const file = path.relative(PKG, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
    if (!OWN.includes(file)) out[file] = fs.readFileSync(path.join(PKG, file), 'utf8');
  }
  return out;
}

/**
 * A call of a `SEAM` name, not a method of the same name (`x.loadAgents(`). `src`'s count passes over a spread call too
 * (`[...loadAgents(dir)]`), as its baseline was counted; the api's (`SPREAD_TOO`) counts one, its debt being none.
 */
const SEAM_CALL = `(?<![\\w$.])(?:${SEAM.join('|')})\\s*\\(`;
const SPREAD_TOO = `(?<![\\w$]|[^.]\\.)(?:${SEAM.join('|')})\\s*\\(`;

/** Why the uses of `sources` break the baseline `debt`: a file it does not name, a count grown, a count fallen. */
function debtBreaks(sources: Record<string, string>, debt: Readonly<Record<string, number>>, calls = SEAM_CALL): string[] {
  const call = new RegExp(calls, 'g');
  const uses = new Map<string, number>();
  for (const [file, text] of Object.entries(sources)) {
    const code = text
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
      .join('\n');
    const n = [...code.matchAll(call)].length;
    if (n) uses.set(file, n);
  }
  const out: string[] = [];
  for (const [file, n] of uses) {
    const owed = debt[file] ?? 0;
    if (n > owed)
      out.push(
        `${file} calls the agent and skill stores ${n} time(s) where test/agent-door.baseline.ts names ${owed}: yield AgentDoor or SkillDoor instead`,
      );
    if (n < owed)
      out.push(
        `${file} calls the agent and skill stores ${n} time(s): lower its count in test/agent-door.baseline.ts to ${n}, which only shrinks`,
      );
  }
  for (const file of Object.keys(debt))
    if (!uses.has(file)) out.push(`${file} calls the agent and skill stores no more: take its line out of test/agent-door.baseline.ts`);
  return out;
}

test('no file of src calls the agent and skill stores but as test/agent-door.baseline.ts counts it, and the count only shrinks', async () => {
  const { AGENT_DOOR_DEBT } = await import('../../test/agent-door.baseline.ts');
  assert.deepEqual(debtBreaks(sourcesOfSrc(), AGENT_DOOR_DEBT), []);
});

test('REFUSED: a converted file that calls a store again, and a count the baseline holds above what is left', async () => {
  const { AGENT_DOOR_DEBT } = await import('../../test/agent-door.baseline.ts');
  const sources = sourcesOfSrc();
  const again = { ...sources, 'src/skills/skills.verb.ts': `${sources['src/skills/skills.verb.ts']}\nconst x = skillsFor('a');\n` };
  assert.equal(debtBreaks(again, AGENT_DOOR_DEBT).length, 1);
  const [first] = Object.keys(AGENT_DOOR_DEBT);
  assert.equal(debtBreaks(sources, { ...AGENT_DOOR_DEBT, [first]: (AGENT_DOOR_DEBT[first] ?? 0) + 1 }).length, 1);
});

const API = path.join(PKG, '..', '..', 'apps', 'api');

/** Every file of the api's `src` but its tests, by its path from the api. */
function sourcesOfApi(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of fs.readdirSync(path.join(API, 'src'), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
    const file = path.relative(API, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
    out[file] = fs.readFileSync(path.join(API, file), 'utf8');
  }
  return out;
}

test("no file of the api's src calls the agent and skill stores: its handlers read them through AgentDoor and SkillDoor, its debt none", () => {
  assert.deepEqual(debtBreaks(sourcesOfApi(), {}, SPREAD_TOO), []);
});

test("REFUSED: a file of the api's src that calls an agent store is one break", () => {
  const sources = sourcesOfApi();
  const again = {
    ...sources,
    'src/workflows/builder.ts': `${sources['src/workflows/builder.ts']}\nconst x = loadAgents('a');\n`,
  };
  assert.equal(debtBreaks(again, {}, SPREAD_TOO).length, 1);
  const spread = { ...sources, 'src/agents/skills.ts': `${sources['src/agents/skills.ts']}\nconst y = [...skillsFor('a')];\n` };
  assert.equal(debtBreaks(spread, {}, SPREAD_TOO).length, 1, 'a call spread into a list is a call');
  const method = { ...sources, 'src/agents/skills.ts': `${sources['src/agents/skills.ts']}\nconst z = door.loadAgents('a');\n` };
  assert.deepEqual(debtBreaks(method, {}, SPREAD_TOO), [], 'a method of the same name is no call of the store');
});
