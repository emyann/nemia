/**
 * Nemia's `verbs` skill is the command table's, generated (`verbsSkill`): the shipped file is what the table renders today, a command added
 * without regenerating it is refused, and every verb the CLI serves her is listed under its class, none out of her reach.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

process.env.WF_ROOT = scratch('wf-verbs-skill-');
const { REGENERATE, verbsSkill, verbsSkillOf } = await import('../src/nemia/verbs.verb.ts');
const { TABLE } = await import('../src/command/commands.verb.ts');
const { CLI_VERBS } = await import('../src/command/command.ts');
const { VERBS } = await import('../src/cli/main.ts');
const { ANSWERS, PENDING, REFUSED_FLAGS, REFUSED_WORDS } = await import('./command-words.ts');

const SKILL = path.join(import.meta.dirname, '..', 'nemia', 'skills', 'verbs', 'SKILL.md');

/** The section of `text` under the heading `heading`, to the next heading. */
const sectionOf = (text: string, heading: string): string => {
  const at = text.indexOf(`\n## ${heading}\n`);
  assert.notEqual(at, -1, `the skill has a section ${heading}`);
  const next = text.indexOf('\n## ', at + 1);
  return text.slice(at, next === -1 ? undefined : next);
};

/** Whether `text` lists the command `name` as a usage line of its own. */
const lists = (text: string, name: string): boolean =>
  new RegExp(`^  nemia ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: |$)`, 'm').test(text);

test('the shipped verbs skill is what the command table renders today', () => {
  assert.equal(
    fs.readFileSync(SKILL, 'utf8'),
    verbsSkill(),
    `nemia/skills/verbs/SKILL.md is not the table's: regenerate it from the repository's root: ${REGENERATE}`,
  );
});

test('REFUSED: a command added to the table without regenerating the skill renders apart from the shipped file, under its class', () => {
  const planted = { name: 'planted', usage: '<x>', help: ['a planted verb'], class: 'act' as const };
  const rendered = verbsSkillOf([...TABLE, planted], CLI_VERBS);
  assert.notEqual(rendered, fs.readFileSync(SKILL, 'utf8'));
  assert.ok(lists(sectionOf(rendered, 'Yours'), 'planted'), 'the planted verb is listed under Yours');
  assert.ok(!lists(sectionOf(rendered, 'Reads'), 'planted'), 'and under no other class');
});

test('every command the CLI serves her is listed, and none out of her reach nor one the api alone serves but the CLI’s own verbs', () => {
  const text = verbsSkill();
  const served = TABLE.filter((c) => c.only?.side !== 'api' && c.class !== 'none');
  assert.deepEqual(
    served.filter((c) => !lists(text, c.name)).map((c) => c.name),
    [],
  );
  for (const name of ['tick', 'up']) assert.ok(!lists(text, name), `${name} is not listed`);
  for (const verb of CLI_VERBS) assert.ok(lists(sectionOf(text, 'Reads'), verb.name), `${verb.name} is listed as a read`);
});

test('the library’s writers are listed by who answers for them: a write or a removal prompts the person, a try is hers', () => {
  const text = verbsSkill();
  for (const name of ['agents write', 'agents rm', 'skills write', 'workflows write', 'workflows rm'])
    assert.ok(lists(sectionOf(text, 'Prompts the person'), name), `${name} prompts the person`);
  assert.ok(lists(sectionOf(text, 'Yours'), 'agents run'), 'agents run is hers to run unasked');
});

test('the CLI’s own verbs are said once, each with the entry that classes it', () => {
  assert.deepEqual(
    CLI_VERBS.map((v) => v.name),
    [...VERBS.keys()],
  );
  for (const verb of CLI_VERBS)
    assert.ok(
      TABLE.some((c) => c.name === verb.name),
      `${verb.name} has an entry of the table`,
    );
});

test('a command that reads bare is listed as a read, with the words that make it prompt the person', () => {
  const reads = sectionOf(verbsSkill(), 'Reads');
  assert.ok(lists(reads, 'level'), 'level is a read');
  assert.match(reads, /reads bare; prompts the person given manual, semi-auto/);
  assert.match(reads, /reads bare; prompts the person given --path, --store, --clear/);
  assert.ok(!lists(sectionOf(verbsSkill(), 'Prompts the person'), 'level'), 'and not listed with what prompts');
});

test('a class the person answers is listed with what it answers, and the skill that brings it first', () => {
  const answers = sectionOf(verbsSkill(), 'Answers what waits');
  const listed = [...answers.matchAll(/^ {2}nemia (\S+)/gm)].map((m) => m[1]);
  assert.deepEqual(listed.sort(), [...ANSWERS].sort(), 'approve and retry alone answer what waits');
  assert.match(answers, /`bring-what-waits` skill/);
  assert.match(answers, /--round/, 'another round is said as retry --round');
  assert.match(answers, /--continue/, "a try that continues its session is said as retry's --continue");
});

test('the skill lists no verb named by a refused word but those pending, and no renamed flag', () => {
  const pending = new Set(PENDING.map((p) => p.name));
  const usages = [...verbsSkill().matchAll(/^ {2}nemia (.+)$/gm)].map((m) => m[1]);
  const named = TABLE.map((c) => c.name).filter((n) => usages.some((u) => u === n || u.startsWith(`${n} `)));
  assert.deepEqual(
    named.filter((n) => !pending.has(n) && n.split(' ').some((w) => REFUSED_WORDS.includes(w))),
    [],
  );
  assert.deepEqual(
    usages.filter((u) => REFUSED_FLAGS.some((f) => u.includes(f))),
    [],
  );
  assert.ok(
    usages.some((u) => u.startsWith('refresh ') && u.includes('--base')),
    'the base is taken by refresh --base',
  );
});
