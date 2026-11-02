/**
 * A library skill's life: a person's story on the stage (`story.ts`), through the board's skill entries (`SKILLS_WRITE`, `SKILLS_READ`,
 * `SKILLS_LIST`) and the store's writers beneath them (`writeSkill`, `copySkill`). A skill written from its form as Nemia ships one,
 * read back for its page and in the list, given to the store's agents; its preload switched by one line; a file beside it moving its
 * version; one that no longer reads mended; and each write moving the version of every agent that gives it. Then one copied whole from
 * another place, a copy over it refused, and the files' own refusals — a card that does not read, a link, a place the board does not
 * list — each with the library as it was. A skill made, changed at its version, made twice, a stale or gone version and a description
 * refused are the Skill door's walks (`test/skill-walks.ts`); what a SKILL.md is rendered and switched to, line by line, is the table
 * beside its code (`src/skills/skills.test.ts`). `WF_ROOT` is set before the modules are imported, since they read it as they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { renderSkill, skillDraftOf, skillEntryOf, splitFrontmatter, type SkillDraft } from '../src/workflow.ts';
import { scratch } from './scratch.ts';
import { TEAM } from './team.ts';
import { names } from './assessed.ts';
import { staged, story } from './story.ts';

const ROOT = scratch('wf-skill-life-');
process.env.WF_ROOT = ROOT;
const { addFactory, isRefusal, runWith: runEngine } = await import('../src/runner.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { main } = await import('../src/cli/main.ts');
const { SKILLS_LIST, SKILLS_READ, SKILLS_WRITE } = await import('../src/skills/skills.verb.ts');
const { copySkill, writeSkill } = await import('../src/skills/skills.store.ts');
const { preloads, skillsFor, skillVersion } = await import('../src/skills/read.store.ts');
const { agentVersion } = await import('../src/agents/read.store.ts');
const stage = staged({ runWith: runEngine, main, engineOf });
type Refusal = import('../src/refusal/refusal.ts').Refusal;

const LIBRARY = path.join(ROOT, 'workflows', 'skills');
const AGENTS = path.join(ROOT, 'workflows', 'agents');
const SHIPPED = path.join(TEAM, 'skills');

const DRAFT: SkillDraft = {
  name: 'tidy-notes',
  title: 'Tidy notes',
  description: 'Rewrites a folder of notes: "one fact a line".',
  tags: ['notes', 'writing'],
  examples: ['tidy my notes', 'make these notes one fact a line'],
  body: '# Tidy notes\n\nRead each note, then write it again, one fact a line.',
};

/** Every file under `dir`, by its path in it, with what it holds. */
function snapshot(dir: string): Record<string, string> {
  if (!fs.existsSync(dir)) return {};
  return Object.fromEntries(
    fs
      .readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() || e.isSymbolicLink())
      .map((e) => {
        const at = path.join(e.parentPath, e.name);
        return [path.relative(dir, at), e.isSymbolicLink() ? `-> ${fs.readlinkSync(at)}` : fs.readFileSync(at, 'utf8')];
      }),
  );
}

/** Every hidden file or folder anywhere under `dir`: what a write that failed part-way would leave. */
const hidden = (dir: string): string[] =>
  fs.existsSync(dir) ? (fs.readdirSync(dir, { recursive: true }) as string[]).filter((p) => path.basename(p).startsWith('.')) : [];

/** `fn` refused as the kind `tag`, naming each of `facts`, and the library as it was, no half-written file left. */
function refuses(fn: () => unknown, tag: Refusal['_tag'], ...facts: string[]): void {
  const before = snapshot(LIBRARY);
  assert.throws(fn, (err: unknown) => {
    assert.ok(isRefusal(err), `a refusal, not ${String(err)}`);
    assert.equal(err._tag, tag, err.message);
    names(err.message, ...facts);
    return true;
  });
  assert.deepEqual(snapshot(LIBRARY), before, 'nothing is written on a refusal');
  assert.deepEqual(hidden(LIBRARY), [], 'and no half-written file is left');
}

/** A folder of skills of the test's own, outside the library, holding `skills`: each a name and its SKILL.md. */
function source(skills: Record<string, string>): string {
  const dir = path.join(scratch('wf-skill-life-source-'), 'skills');
  for (const [name, text] of Object.entries(skills)) {
    fs.mkdirSync(path.join(dir, name), { recursive: true });
    fs.writeFileSync(path.join(dir, name, 'SKILL.md'), text);
  }
  return dir;
}

const read = (name: string): string => fs.readFileSync(path.join(LIBRARY, name, 'SKILL.md'), 'utf8');

/** The version of each of the store's agents that `names` lists. */
const versions = (...agents: string[]): Record<string, string | null> =>
  Object.fromEntries(agents.map((name) => [name, agentVersion(AGENTS, name)]));

test("a library skill's life: written as Nemia ships one, given, switched, mended, moving its agents, and copied in", async (t) => {
  const s = story(t);
  const dir = path.join(LIBRARY, 'tidy-notes');
  const e = stage.board().e;
  let version = '';

  await s.test(
    "a skill written from the board's form is written as Nemia ships its own, and read back by the card reader and YAML",
    async () => {
      const made = await stage.runWith(e, SKILLS_WRITE.handler({ from: 'yours', change: JSON.stringify(DRAFT) }, undefined, ROOT));
      assert.ok('version' in made, JSON.stringify(made));
      version = made.version;
      const text = read('tidy-notes');
      assert.equal(
        text,
        [
          '---',
          'name: tidy-notes',
          'title: Tidy notes',
          `description: 'Rewrites a folder of notes: "one fact a line".'`,
          'tags: [ notes, writing ]',
          'examples: [ tidy my notes, make these notes one fact a line ]',
          '---',
          '# Tidy notes',
          '',
          'Read each note, then write it again, one fact a line.',
          '',
        ].join('\n'),
      );
      const { block } = splitFrontmatter('SKILL.md', text);
      const keys = { title: 'Tidy notes', description: DRAFT.description, tags: ['notes', 'writing'], examples: DRAFT.examples };
      assert.deepEqual(yaml.load(block!), { name: 'tidy-notes', ...keys });
      const { title: _, ...entry } = keys;
      assert.deepEqual(skillEntryOf('SKILL.md', 'tidy-notes', text), { id: 'tidy-notes', name: 'Tidy notes', ...entry });
      assert.deepEqual(skillDraftOf('SKILL.md', 'tidy-notes', text), { ...DRAFT, preload: false });
    },
  );

  await s.test(
    'it reads back for its page and in the list, at the version its write answered; a read given no root is refused',
    async () => {
      const page = await stage.runWith(e, SKILLS_READ.handler({ from: 'yours', name: 'tidy-notes', dir }, undefined, ROOT));
      assert.equal(page.version, version);
      assert.match(page.text, /one fact a line\./);
      assert.equal(page.entry?.id, 'tidy-notes');
      const listed = await stage.runWith(e, SKILLS_LIST.handler({ skills: [dir] }, undefined, ROOT));
      assert.deepEqual(Object.keys(listed), [dir]);
      assert.equal(listed[dir]?.entry?.id, 'tidy-notes');
      await assert.rejects(stage.runWith(e, SKILLS_LIST.handler({ skills: [dir] })), (err: { _tag?: string }) => err._tag === 'Invalid');
    },
  );

  await s.test("an agent of the store is given it now, and a change of its words moves every agent that gives it, and no other's", () => {
    assert.equal(skillsFor(path.join(ROOT, 'workflows', '_'), { home: ROOT }).at.get('tidy-notes'), dir);
    fs.mkdirSync(AGENTS, { recursive: true });
    fs.writeFileSync(path.join(AGENTS, 'scribe.md'), '---\nskills: tidy-notes\n---\nYou write.\n');
    fs.writeFileSync(path.join(AGENTS, 'clerk.md'), '---\nskills: tidy-notes, other\n---\nYou file.\n');
    fs.writeFileSync(path.join(AGENTS, 'porter.md'), '---\nskills: other\n---\nYou carry.\n');
    writeSkill(ROOT, LIBRARY, { ...DRAFT, name: 'other' }, { version: null });
    const before = versions('scribe', 'clerk', 'porter');
    version = writeSkill(ROOT, LIBRARY, { ...DRAFT, description: 'Something else.' }, { version }).version;
    const after = versions('scribe', 'clerk', 'porter');
    assert.notEqual(after.scribe, before.scribe);
    assert.notEqual(after.clerk, before.clerk);
    assert.equal(after.porter, before.porter);
    version = writeSkill(ROOT, LIBRARY, DRAFT, { version }).version;
  });

  await s.test('the preload switch writes that one line, the run reads it, and the agents that give it move with it', () => {
    assert.equal(preloads(dir), false);
    const before = versions('scribe');
    const on = writeSkill(ROOT, LIBRARY, { name: 'tidy-notes', preload: true }, { version });
    assert.equal(preloads(dir), true);
    assert.equal(read('tidy-notes'), renderSkill({ ...DRAFT, preload: true }));
    assert.notEqual(versions('scribe').scribe, before.scribe, 'and so does the switch');
    version = writeSkill(ROOT, LIBRARY, { name: 'tidy-notes', preload: false }, { version: on.version }).version;
    assert.equal(preloads(dir), false);
    assert.equal(read('tidy-notes'), renderSkill(DRAFT));
  });

  await s.test('REFUSED: a file added beside SKILL.md moves its version, so a change at the version read before it is a Conflict', () => {
    fs.writeFileSync(path.join(dir, 'reference.md'), 'more');
    refuses(() => writeSkill(ROOT, LIBRARY, { name: 'tidy-notes', preload: true }, { version }), 'Conflict', 'tidy-notes');
    version = skillVersion(dir)!;
  });

  await s.test('a skill that no longer reads is mended by a write, its version read without reading it; none where no skill is', () => {
    fs.mkdirSync(path.join(LIBRARY, 'broken'), { recursive: true });
    fs.writeFileSync(path.join(LIBRARY, 'broken', 'SKILL.md'), '---\nname: broken\n---\nNo description.\n');
    assert.throws(() => skillEntryOf('SKILL.md', 'broken', read('broken')), 'it does not read as a card');
    const broken = skillVersion(path.join(LIBRARY, 'broken'))!;
    assert.match(broken, /^[0-9a-f]{16}$/);
    writeSkill(ROOT, LIBRARY, { ...DRAFT, name: 'broken' }, { version: broken });
    assert.equal(skillEntryOf('SKILL.md', 'broken', read('broken')).description, DRAFT.description);
    assert.equal(skillVersion(path.join(LIBRARY, 'nothing-here')), null);
  });

  const copied = fs.readdirSync(SHIPPED).sort()[0];

  await s.test(
    "a skill of another place is copied whole into the library, byte for byte, and the store's agents are given it",
    async () => {
      const made = await stage.runWith(e, SKILLS_WRITE.handler({ from: 'yours', copy: copied, builtin: SHIPPED }, undefined, ROOT));
      assert.deepEqual(made, { dir: path.join(LIBRARY, copied), name: copied, written: ['SKILL.md'] });
      assert.deepEqual(snapshot(path.join(LIBRARY, copied)), snapshot(path.join(SHIPPED, copied)), 'byte for byte');
      assert.equal(skillsFor(path.join(ROOT, 'workflows', '_'), { home: ROOT }).at.get(copied), path.join(LIBRARY, copied));
      const from = source({ notes: '---\ndescription: Two files.\n---\nBody.\n' });
      fs.mkdirSync(path.join(from, 'notes', 'more'));
      fs.writeFileSync(path.join(from, 'notes', 'more', 'ref.md'), 'Ref.\n');
      const two = copySkill(ROOT, from, LIBRARY, 'notes');
      assert.deepEqual(two.written, ['SKILL.md', path.join('more', 'ref.md')], 'every file under it');
      assert.deepEqual(snapshot(two.dir), snapshot(path.join(from, 'notes')));
    },
  );

  await s.test('REFUSED: a copy over a skill the library has, naming the folder, and nothing written', async () => {
    const before = snapshot(LIBRARY);
    await assert.rejects(
      stage.runWith(e, SKILLS_WRITE.handler({ from: 'yours', copy: copied, builtin: SHIPPED }, undefined, ROOT)),
      (err: unknown) => {
        assert.ok(isRefusal(err), String(err));
        names(err.message, `skills/${copied}`, LIBRARY);
        return true;
      },
    );
    assert.deepEqual(snapshot(LIBRARY), before);
  });

  await s.test('REFUSED: a copy of a skill whose SKILL.md is no card entry, one holding a link, one that is a link', () => {
    const from = source({
      bare: '# Bare\n\nNo frontmatter.\n',
      undescribed: '---\nname: undescribed\n---\nNothing said.\n',
      linking: '---\ndescription: Links out.\n---\nBody.\n',
    });
    refuses(() => copySkill(ROOT, from, LIBRARY, 'bare'), 'Invalid', 'SKILL.md', 'frontmatter');
    refuses(() => copySkill(ROOT, from, LIBRARY, 'undescribed'), 'Invalid', 'SKILL.md', '`description:`');
    const outside = scratch('wf-skill-life-outside-');
    fs.writeFileSync(path.join(outside, 'secret.txt'), "not the skill's");
    fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(from, 'linking', 'notes.txt'));
    refuses(() => copySkill(ROOT, from, LIBRARY, 'linking'), 'Invalid', 'notes.txt is a link');
    fs.mkdirSync(path.join(outside, 'real'));
    fs.writeFileSync(path.join(outside, 'real', 'SKILL.md'), '---\ndescription: Real.\n---\nBody.\n');
    fs.symlinkSync(path.join(outside, 'real'), path.join(from, 'linked'));
    refuses(() => copySkill(ROOT, from, LIBRARY, 'linked'), 'Invalid', 'linked is a link');
  });

  await s.test("REFUSED: a copy of a checkout's skill linked inside the checkout, which a start is given: a copy follows no link", () => {
    const repo = scratch('wf-skill-life-checkout-');
    fs.mkdirSync(path.join(repo, 'skills', 'x'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'skills', 'x', 'SKILL.md'), '---\ndescription: Linked inside.\n---\nBody.\n');
    fs.mkdirSync(path.join(repo, '.claude', 'skills'), { recursive: true });
    fs.symlinkSync('../../skills/x', path.join(repo, '.claude', 'skills', 'x'));
    assert.equal(skillsFor(path.join(repo, 'workflows', 'dev'), { repo }).at.get('x'), path.join(repo, '.claude', 'skills', 'x'));
    refuses(() => copySkill(ROOT, path.join(repo, '.claude', 'skills'), LIBRARY, 'x'), 'Invalid', 'x is a link');
  });

  await s.test('REFUSED: a write or a copy into a place that is no skills/ the board lists, or through a link; anywhere writes it', () => {
    refuses(() => writeSkill(ROOT, path.join(ROOT, 'workflows', 'elsewhere'), DRAFT, { version: null }), 'Invalid', 'elsewhere');
    const nowhere = path.join(scratch('wf-skill-life-nowhere-'), 'skills');
    refuses(() => writeSkill(ROOT, nowhere, DRAFT, { version: null }), 'Invalid', nowhere);
    refuses(() => copySkill(ROOT, SHIPPED, nowhere, copied), 'Invalid', nowhere);
    assert.equal(fs.existsSync(nowhere), false, 'nothing is made there');
    refuses(() => copySkill(ROOT, SHIPPED, AGENTS, copied), 'Invalid', AGENTS);
    const outside = scratch('wf-skill-life-outside-');
    fs.symlinkSync(outside, path.join(LIBRARY, 'linked'));
    refuses(() => writeSkill(ROOT, LIBRARY, { ...DRAFT, name: 'linked' }, { version: null }), 'Invalid', 'is a link');
    assert.deepEqual(fs.readdirSync(outside), []);
    assert.equal(copySkill(ROOT, SHIPPED, nowhere, copied, { anywhere: true }).dir, path.join(nowhere, copied), 'written with anywhere');
  });

  await s.test("REFUSED: a skill written into the workflows/ of a checkout no factory names; written once a factory's repository", () => {
    const checkout = scratch('wf-skill-life-known-');
    fs.mkdirSync(path.join(checkout, '.git'));
    const library = path.join(checkout, 'workflows', 'skills');
    refuses(() => writeSkill(ROOT, library, DRAFT, { version: null }), 'Invalid', library, 'nemia factory add <name> --repo <repo>');
    assert.equal(fs.existsSync(path.join(library, DRAFT.name)), false, 'a .git beside it makes no repository known');
    addFactory({ name: 'skill-known', repos: [checkout] });
    writeSkill(ROOT, library, DRAFT, { version: null });
    assert.ok(fs.existsSync(path.join(library, DRAFT.name, 'SKILL.md')), "a factory's repository");
  });
});
