/**
 * A skill folder read off disk, as the board's picker and page read one, in two tables. Read: its entry or why it has none
 * (`skillRead`), and a SKILL.md's text read through a link (`skillText`) — a link the rule lets through read, every other one refused
 * unread. Found: the skill folders of a folder of skills (`skillFolders`), the first of several folders that has a skill
 * (`skillDirIn`), and the skills an agent gives, each read where it was found (`givenSkills`). A skill's text read back, and none where
 * no skill is, are the Skill door's walks (`test/skill-walks.ts`). `WF_ROOT` is set before the import, since the store reads it as it
 * loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { names } from '../../test/assessed.ts';

process.env.WF_ROOT = scratch('wf-skills-root-');
const { givenSkills, skillDirIn, skillFolders, skillRead, skillText } = await import('./skills.store.ts');
const { WorkflowError } = await import('../step/step.ts');

/** A skill `name` written into the folder of skills `root`, its SKILL.md `text`; its folder. */
function skillAt(root: string, name: string, text: string): string {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), text);
  return dir;
}

const SKILL = '---\nname: tidy\ndescription: Tidy a change before it is reviewed.\n---\nTidy it.\n';

/** A checkout holding the real skill `skills/x` and an empty `.claude/skills/`; the folder its given skill `x` goes in. */
function checkoutSkill(): string {
  const repo = scratch('wf-skills-checkout-');
  skillAt(path.join(repo, 'skills'), 'x', SKILL);
  fs.mkdirSync(path.join(repo, '.claude', 'skills'), { recursive: true });
  return path.join(repo, '.claude', 'skills', 'x');
}

/** `read` refused unread for the link `link`: no entry and no cost, the link named and the fix — a folder of its own. */
function refusedLink(read: ReturnType<typeof skillRead>, link: string): void {
  assert.deepEqual({ ...read, error: null }, { entry: null, error: null, preload: false, cost: null });
  names(read.error, `${link} is a link`, 'a folder of its own');
}

test('a skill folder read as the board reads it: its entry and its cost, or why it has none', async (t) => {
  await t.test('a skill that reads has its card entry, no error, and what it costs a turn', () => {
    const read = skillRead('tidy', skillAt(scratch('wf-skills-'), 'tidy', SKILL));
    assert.equal(read.error, null);
    assert.equal(read.entry?.id, 'tidy');
    assert.equal(read.preload, false);
    assert.ok(read.cost !== null && read.cost.perTurn > 0, JSON.stringify(read.cost));
  });

  await t.test(
    "a skill of a checkout's .claude/skills/ linked inside the checkout is read through the link: its entry, its cost, its text",
    () => {
      const at = checkoutSkill();
      fs.symlinkSync('../../skills/x', at);
      const read = skillRead('x', at);
      assert.equal(read.error, null);
      assert.equal(read.entry?.id, 'x');
      assert.ok(read.cost !== null && read.cost.perTurn > 0, JSON.stringify(read.cost));
      assert.equal(skillText(at), SKILL);
    },
  );

  await t.test('REFUSED unread: a SKILL.md that is a link, whatever it points at', () => {
    const root = scratch('wf-skills-');
    const outside = path.join(scratch('wf-skills-outside-'), 'SKILL.md');
    fs.writeFileSync(outside, SKILL);
    fs.mkdirSync(path.join(root, 'tidy'));
    fs.symlinkSync(outside, path.join(root, 'tidy', 'SKILL.md'));
    refusedLink(skillRead('tidy', path.join(root, 'tidy')), 'tidy/SKILL.md');
  });

  await t.test('REFUSED unread: a skill folder that is a link', () => {
    const root = scratch('wf-skills-');
    fs.symlinkSync(skillAt(scratch('wf-skills-outside-'), 'tidy', SKILL), path.join(root, 'far'));
    refusedLink(skillRead('far', path.join(root, 'far')), 'far');
  });

  await t.test("REFUSED unread: a skill of a checkout's .claude/skills/ linked outside the checkout, its text unread too", () => {
    const at = checkoutSkill();
    fs.symlinkSync(skillAt(scratch('wf-skills-outside-'), 'x', SKILL), at);
    refusedLink(skillRead('x', at), 'x');
    assert.equal(skillText(at), '');
  });

  await t.test('REFUSED unread: a library skill with a file under it that is a link', () => {
    const dir = skillAt(scratch('wf-skills-'), 'tidy', SKILL);
    const outside = path.join(scratch('wf-skills-outside-'), 'notes.txt');
    fs.writeFileSync(outside, 'Not the skill.\n');
    fs.symlinkSync(outside, path.join(dir, 'notes.txt'));
    refusedLink(skillRead('tidy', dir), 'tidy/notes.txt');
  });

  await t.test('REFUSED: a skill folder with no SKILL.md says it cannot be read, naming the file', () => {
    const dir = path.join(scratch('wf-skills-'), 'tidy');
    fs.mkdirSync(dir);
    const read = skillRead('tidy', dir);
    assert.equal(read.entry, null);
    assert.equal(read.cost, null);
    names(read.error, path.join(dir, 'SKILL.md'), 'ENOENT');
  });

  await t.test("REFUSED: a SKILL.md with no description has the card reader's refusal, and its cost all the same", () => {
    const read = skillRead('tidy', skillAt(scratch('wf-skills-'), 'tidy', '---\nname: tidy\n---\nTidy it.\n'));
    assert.equal(read.entry, null);
    names(read.error, 'description');
    assert.ok(read.cost !== null, 'a SKILL.md that reads has its cost');
  });
});

test('where a skill is: the skill folders of a folder, the first folder that has one, and the skills an agent gives', async (t) => {
  await t.test('the skill folders of a folder of skills, sorted: a folder with no SKILL.md is none; a folder not there has none', () => {
    const root = scratch('wf-skills-');
    skillAt(root, 'tidy', SKILL);
    skillAt(root, 'audit', SKILL);
    fs.mkdirSync(path.join(root, 'empty'));
    assert.deepEqual(skillFolders(root), ['audit', 'tidy']);
    assert.deepEqual(skillFolders(path.join(root, 'nowhere')), []);
  });

  await t.test('the first folder of skills that has a skill is where it is: the order decides, and none has it is null', () => {
    const first = scratch('wf-skills-first-');
    const second = scratch('wf-skills-second-');
    skillAt(first, 'tidy', SKILL);
    skillAt(second, 'tidy', SKILL);
    skillAt(second, 'audit', SKILL);
    assert.equal(skillDirIn([first, second], 'tidy'), path.join(first, 'tidy'));
    assert.equal(skillDirIn([second, first], 'tidy'), path.join(second, 'tidy'));
    assert.equal(skillDirIn([first, second], 'audit'), path.join(second, 'audit'));
    assert.equal(skillDirIn([first, second], 'gone'), null);
  });

  await t.test(
    "REFUSED: a given skill no folder has, naming where a start looked; one two folders of a place have, in the package's words",
    () => {
      const root = scratch('wf-skills-');
      const both = new WorkflowError("twice is in both of the repository's folders of skills: say which.");
      const all = new Map<string, string | InstanceType<typeof WorkflowError>>([
        ['tidy', skillAt(root, 'tidy', SKILL)],
        ['twice', both],
      ]);
      const [gone, twice, tidy] = givenSkills(['gone', 'twice', 'tidy'], { at: all, all, looked: [root, '/elsewhere/skills'] });
      const unread = { dir: null, entry: null, preload: false, cost: null };
      assert.deepEqual({ ...gone, error: null }, { name: 'gone', ...unread, error: null });
      names(gone.error, '`gone`', root, '/elsewhere/skills');
      assert.deepEqual(twice, { name: 'twice', ...unread, error: both.message }, "the place's own words, whole");
      assert.deepEqual(tidy, { name: 'tidy', dir: path.join(root, 'tidy'), ...skillRead('tidy', path.join(root, 'tidy')) });
      assert.equal(tidy.error, null);
    },
  );
});
