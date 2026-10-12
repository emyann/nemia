/**
 * A skill folder read off disk, as the board's picker and page read one: its entry or why it has none (`skillRead`), the skill folders of
 * a folder of skills (`skillFolders`), the skills an agent gives, each read where it was found (`givenSkills`), the first of several
 * folders that has a skill (`skillDirIn`), and a SKILL.md's text (`skillText`). `WF_ROOT` is set before the import, since the store reads
 * it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';

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

test('a skill that reads has its card entry, no error, and what it costs a turn', () => {
  const read = skillRead('tidy', skillAt(scratch('wf-skills-'), 'tidy', SKILL));
  assert.equal(read.error, null);
  assert.equal(read.entry?.id, 'tidy');
  assert.equal(read.preload, false);
  assert.ok(read.cost !== null && read.cost.perTurn > 0, JSON.stringify(read.cost));
});

test('REFUSED unread: a SKILL.md that is a link, whatever it points at', () => {
  const root = scratch('wf-skills-');
  const outside = path.join(scratch('wf-skills-outside-'), 'SKILL.md');
  fs.writeFileSync(outside, SKILL);
  fs.mkdirSync(path.join(root, 'tidy'));
  fs.symlinkSync(outside, path.join(root, 'tidy', 'SKILL.md'));
  assert.deepEqual(skillRead('tidy', path.join(root, 'tidy')), {
    entry: null,
    error: 'tidy/SKILL.md is a link, and what it points at is outside the folder of skills: make it a folder of its own.',
    preload: false,
    cost: null,
  });
});

test('REFUSED unread: a skill folder that is a link', () => {
  const root = scratch('wf-skills-');
  fs.symlinkSync(skillAt(scratch('wf-skills-outside-'), 'tidy', SKILL), path.join(root, 'far'));
  assert.equal(
    skillRead('far', path.join(root, 'far')).error,
    'far is a link, and what it points at is outside the folder of skills: make it a folder of its own.',
  );
});

/** A checkout holding the real skill `skills/x` and an empty `.claude/skills/`; the folder its given skill `x` goes in. */
function checkoutSkill(): { repo: string; at: string } {
  const repo = scratch('wf-skills-checkout-');
  skillAt(path.join(repo, 'skills'), 'x', SKILL);
  fs.mkdirSync(path.join(repo, '.claude', 'skills'), { recursive: true });
  return { repo, at: path.join(repo, '.claude', 'skills', 'x') };
}

test("a skill of a checkout's .claude/skills/ linked inside the checkout is read through the link: its entry, its cost, its text", () => {
  const { at } = checkoutSkill();
  fs.symlinkSync('../../skills/x', at);
  const read = skillRead('x', at);
  assert.equal(read.error, null);
  assert.equal(read.entry?.id, 'x');
  assert.ok(read.cost !== null && read.cost.perTurn > 0, JSON.stringify(read.cost));
  assert.equal(skillText(at), SKILL);
});

test("REFUSED unread: a skill of a checkout's .claude/skills/ linked outside the checkout, its text unread too", () => {
  const { at } = checkoutSkill();
  fs.symlinkSync(skillAt(scratch('wf-skills-outside-'), 'x', SKILL), at);
  assert.deepEqual(skillRead('x', at), {
    entry: null,
    error: 'x is a link, and what it points at is outside the folder of skills: make it a folder of its own.',
    preload: false,
    cost: null,
  });
  assert.equal(skillText(at), '');
});

test('REFUSED unread: a library skill with a file under it that is a link', () => {
  const dir = skillAt(scratch('wf-skills-'), 'tidy', SKILL);
  const outside = path.join(scratch('wf-skills-outside-'), 'notes.txt');
  fs.writeFileSync(outside, 'Not the skill.\n');
  fs.symlinkSync(outside, path.join(dir, 'notes.txt'));
  assert.deepEqual(skillRead('tidy', dir), {
    entry: null,
    error: 'tidy/notes.txt is a link, and what it points at is outside the folder of skills: make it a folder of its own.',
    preload: false,
    cost: null,
  });
});

test('REFUSED: a skill folder with no SKILL.md says it cannot be read, naming the file', () => {
  const dir = path.join(scratch('wf-skills-'), 'tidy');
  fs.mkdirSync(dir);
  const read = skillRead('tidy', dir);
  assert.equal(read.entry, null);
  assert.equal(read.cost, null);
  assert.ok(read.error?.startsWith(`${path.join(dir, 'SKILL.md')} cannot be read (ENOENT`), read.error ?? '');
});

test("REFUSED: a SKILL.md with no description has the card reader's refusal, and its cost all the same", () => {
  const read = skillRead('tidy', skillAt(scratch('wf-skills-'), 'tidy', '---\nname: tidy\n---\nTidy it.\n'));
  assert.equal(read.entry, null);
  assert.match(read.error ?? '', /description/);
  assert.ok(read.cost !== null, 'a SKILL.md that reads has its cost');
});

test('the skill folders of a folder of skills, sorted: a folder with no SKILL.md is none; a folder not there has none', () => {
  const root = scratch('wf-skills-');
  skillAt(root, 'tidy', SKILL);
  skillAt(root, 'audit', SKILL);
  fs.mkdirSync(path.join(root, 'empty'));
  assert.deepEqual(skillFolders(root), ['audit', 'tidy']);
  assert.deepEqual(skillFolders(path.join(root, 'nowhere')), []);
});

test('the first folder of skills that has a skill is where it is: the order decides, and none has it is null', () => {
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

test("a SKILL.md's text, or empty where it cannot be read", () => {
  const root = scratch('wf-skills-');
  assert.equal(skillText(skillAt(root, 'tidy', SKILL)), SKILL);
  assert.equal(skillText(path.join(root, 'gone')), '');
});

test("REFUSED: a given skill no folder has, naming where a start looked; one two folders of a place have, in the package's words", () => {
  const root = scratch('wf-skills-');
  const all = new Map<string, string | InstanceType<typeof WorkflowError>>([
    ['tidy', skillAt(root, 'tidy', SKILL)],
    ['twice', new WorkflowError("twice is in both of the repository's folders of skills: say which.")],
  ]);
  const found = { at: all, all, looked: [root, '/elsewhere/skills'] };
  const [gone, twice, tidy] = givenSkills(['gone', 'twice', 'tidy'], found);
  assert.deepEqual(gone, {
    name: 'gone',
    dir: null,
    entry: null,
    error: `No skills folder has \`gone\` — looked in ${root}, /elsewhere/skills.`,
    preload: false,
    cost: null,
  });
  assert.deepEqual(twice, {
    name: 'twice',
    dir: null,
    entry: null,
    error: "twice is in both of the repository's folders of skills: say which.",
    preload: false,
    cost: null,
  });
  assert.deepEqual(tidy, { name: 'tidy', dir: path.join(root, 'tidy'), ...skillRead('tidy', path.join(root, 'tidy')) });
  assert.equal(tidy.error, null);
});
