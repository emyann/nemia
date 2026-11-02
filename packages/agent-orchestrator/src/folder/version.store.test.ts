/**
 * A workflow folder's version (`workflowVersion`), read through the Agent and Skill doors: the digest it answers over the files doors is
 * byte-equal to the one the synchronous reader gave before the doors (`syncVersion` below, that reader as it was, kept as the oracle,
 * since the digest names each agent's root by its absolute path and no literal holds across checkouts), and a program given the doors'
 * memory reads its agents there, never the disk.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { scratch } from '../../test/scratch.ts';
import { teamCopy } from '../../test/team.ts';
import { anAgent } from '../../test/agent-walks.ts';

process.env.WF_ROOT = scratch('wf-version-root-');
const { workflowVersion } = await import('./version.store.ts');
const { frontmatterKey } = await import('../former/former.ts');
const { agentVersion } = await import('../agents/read.store.ts');
const { lookupRoots, skillsFor, skillVersion } = await import('../skills/read.store.ts');
const { agentDoorFiles, AgentDoor } = await import('../agents/agent-door.store.ts');
const { agentDoorMemory } = await import('../agents/agent-memory.store.ts');
const { skillDoorFiles } = await import('../skills/skill-door.store.ts');
const { AgentName } = await import('../agents/agents.model.ts');
const { StoreRoot } = await import('../config/root.store.ts');
type Places = import('../skills/read.store.ts').Places;

/** The version as the synchronous reader gave it before the doors: the oracle the program is held equal to. */
function syncVersion(dir: string, places: Places): string {
  const named = (text: string, key: 'agent' | 'skills'): string[] => {
    const value = frontmatterKey(text, key);
    return value && (key === 'skills' || !/[\\/]/.test(value)) ? [value] : [];
  };
  let names: string[];
  try {
    names = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => !e.isDirectory() && /\.(md|json)$/.test(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    names = [];
  }
  const files = names.map((name) => {
    try {
      return [name, fs.readFileSync(path.join(dir, name), 'utf8')] as const;
    } catch (err) {
      return [name, { unreadable: (err as Error).message }] as const;
    }
  });
  const texts = files.flatMap(([, text]) => (typeof text === 'string' ? [text] : []));
  const agentsNamed = [...new Set(texts.flatMap((text) => named(text, 'agent')))].sort();
  const added = [
    ...new Set(
      texts.flatMap((text) =>
        named(text, 'skills').flatMap((line) =>
          line
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ),
    ),
  ].sort();
  const skills = agentsNamed.length || added.length ? skillsFor(dir, places) : undefined;
  const agents = agentsNamed.map((agent) => {
    const root = lookupRoots(dir, places).find((at) => fs.lstatSync(path.join(at, 'agents', `${agent}.md`), { throwIfNoEntry: false }));
    return [agent, root === undefined ? { missing: agent } : { at: root, version: agentVersion(path.join(root, 'agents'), agent, skills) }];
  });
  const skillPairs =
    skills === undefined
      ? []
      : added.map((skill) => {
          const at = skills.at.get(skill);
          return [`skills/${skill}`, typeof at === 'string' ? skillVersion(at) : { missing: skill }];
        });
  return createHash('sha256')
    .update(JSON.stringify([...files, ...agents, ...skillPairs]))
    .digest('hex')
    .slice(0, 16);
}

/** The program's version over the files doors at a store's root. */
const doorVersion = (dir: string, places: Places, root = process.env.WF_ROOT as string): string =>
  Effect.runSync(workflowVersion(dir, places).pipe(Effect.provide(Layer.mergeAll(agentDoorFiles(root), skillDoorFiles(root)))));

/** A step file naming `agent`, and `skills` where given. */
const step = (agent: string, skills?: string) => `---\nagent: ${agent}\n${skills ? `skills: ${skills}\n` : ''}---\nDo it.\n`;

test("the version over the files doors is the synchronous reader's, byte for byte, in each case", async (t) => {
  await t.test("an agent in the folder's own root", () => {
    const team = teamCopy();
    const dir = path.join(team, 'dev');
    assert.equal(doorVersion(dir, {}), syncVersion(dir, {}));
  });
  await t.test("an agent only in home's", () => {
    const team = teamCopy();
    const home = scratch('wf-version-home-');
    fs.mkdirSync(path.join(home, 'workflows', 'agents'), { recursive: true });
    fs.renameSync(path.join(team, 'agents', 'shipper.md'), path.join(home, 'workflows', 'agents', 'shipper.md'));
    const dir = path.join(team, 'dev');
    assert.equal(doorVersion(dir, { home }), syncVersion(dir, { home }));
  });
  await t.test('one agent named by two steps', () => {
    const team = teamCopy();
    const dir = path.join(team, 'dev');
    fs.writeFileSync(path.join(dir, 'again.md'), step('implementer'));
    assert.equal(doorVersion(dir, {}), syncVersion(dir, {}));
  });
  await t.test('an agent no root has', () => {
    const team = teamCopy();
    const dir = path.join(team, 'dev');
    fs.writeFileSync(path.join(dir, 'ghost.md'), step('nobody-here'));
    assert.equal(doorVersion(dir, {}), syncVersion(dir, {}));
  });
  await t.test('a skill a step adds, and one no root has', () => {
    const team = teamCopy();
    const dir = path.join(team, 'dev');
    fs.writeFileSync(path.join(dir, 'extra.md'), step('implementer', 'review-a-change, no-such-skill'));
    assert.equal(doorVersion(dir, {}), syncVersion(dir, {}));
  });
  await t.test('a step file that cannot be read', (t) => {
    if (process.getuid?.() === 0) return t.skip('root reads a file whatever its mode');
    const team = teamCopy();
    const dir = path.join(team, 'dev');
    fs.writeFileSync(path.join(dir, 'locked.md'), step('implementer'));
    fs.chmodSync(path.join(dir, 'locked.md'), 0o000);
    t.after(() => fs.chmodSync(path.join(dir, 'locked.md'), 0o644));
    assert.equal(doorVersion(dir, {}), syncVersion(dir, {}));
  });
  await t.test("an agent's name the Agent door refuses reads as missing, so its digest moves from the old reader's", () => {
    const team = teamCopy();
    const dir = path.join(team, 'dev');
    fs.writeFileSync(path.join(dir, 'odd.md'), step('README'));
    fs.writeFileSync(path.join(team, 'agents', 'README.md'), '---\ndescription: odd\n---\nOdd.\n');
    assert.notEqual(doorVersion(dir, {}), syncVersion(dir, {}));
    fs.rmSync(path.join(team, 'agents', 'README.md'));
    assert.equal(doorVersion(dir, {}), syncVersion(dir, {}), 'with no file there either, both read it missing');
  });
});

test('the version reads the agents of the Agent door it is given, never the disk', () => {
  const root = scratch('wf-version-store-');
  const holder = path.join(root, 'workflows');
  const dir = path.join(holder, 'notes');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'write.md'), step('scribe'));
  const agentsAt = { dir: path.join(holder, 'agents'), anywhere: true };
  const versions = Effect.runSync(
    Effect.gen(function* () {
      const door = yield* AgentDoor;
      const read = workflowVersion(dir, {});
      const none = yield* read;
      yield* door.agents.write(AgentName.read('scribe'), anAgent('scribe'), undefined, agentsAt);
      const held = yield* read;
      const there = yield* door.agents.there(AgentName.read('scribe'), agentsAt);
      yield* door.agents.write(
        AgentName.read('scribe'),
        anAgent('scribe', { body: 'Other words.' }),
        there.kind === 'held' ? there.version : undefined,
        agentsAt,
      );
      return { none, held, edited: yield* read };
    }).pipe(Effect.provide(Layer.mergeAll(agentDoorMemory(), skillDoorFiles(root))), Effect.provideService(StoreRoot, root)),
  );
  assert.notEqual(versions.held, versions.none, 'an agent the memory holds is counted');
  assert.notEqual(versions.edited, versions.held, 'rewriting it in the memory moves the version');
});
