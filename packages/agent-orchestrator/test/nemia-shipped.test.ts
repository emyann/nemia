/**
 * What ships with Nemia (`nemia/`) is any factory's, never this repository's: her instruction and her skills name no agent of this
 * repository's team, no file of its own and no playbook of its operator, and each skill her instruction and her skills name is one she
 * ships, under `nemia/skills/`, its `name:` its folder's, read as Claude Code reads her plugin. "Gate" names a step's gate alone
 * (`gateWordsIn`), but in her generated verbs skill, whose words are the command table's. Its wording is judged by a person at the landing
 * step; this holds only what it names.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './team.ts';
import { skillFolders, skillRead } from '../src/skills/skills.store.ts';
import { WAITS_ON_PERSON } from '../src/retry/waits.ts';

const SHIPPED = path.join(import.meta.dirname, '..', 'nemia');

/** Every file that ships with her, by its path under `nemia/`, with its text. */
const shipped = (dir = SHIPPED): Map<string, string> =>
  new Map(
    fs
      .readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .filter((f) => fs.statSync(path.join(dir, f)).isFile())
      .sort()
      .map((f) => [f.split(path.sep).join('/'), fs.readFileSync(path.join(dir, f), 'utf8')]),
  );

/** This repository's team, by the agent files of `workflows/agents/`. */
const TEAM = fs
  .readdirSync(path.join(REPO, 'workflows', 'agents'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.slice(0, -'.md'.length));

/** The words of this repository that what ships must not say: its team, its operator's playbook, its docs. */
const OURS = [...TEAM, 'playbook-operator', 'architecture.md', 'CLAUDE.md', 'features.md'];

/** Where `files` say one of `OURS`, whole and in any case: a line each, `<file>: <word>`. */
const oursIn = (files: Map<string, string>): string[] =>
  [...files].flatMap(([file, text]) =>
    OURS.filter((word) => new RegExp(`(?<![\\w$])${word.replace(/[.\\-]/g, '\\$&')}(?![\\w$])`, 'i').test(text)).map(
      (word) => `${file}: ${word}`,
    ),
  );

/** The skills `files` name, as "the `<name>` skill" says one: a line each, `<file>: <name>`. */
const skillsNamed = (files: Map<string, string>): string[] =>
  [...files].flatMap(([file, text]) => [...text.matchAll(/`([a-z][a-z-]*)` skill/g)].map((m) => `${file}: ${m[1]}`));

test("what ships with Nemia names no agent of this repository's team, no doc of its own and no playbook of its operator", () => {
  assert.ok(TEAM.length > 0, 'the team is read');
  assert.deepEqual(oursIn(shipped()), []);
});

test('REFUSED: a skill of hers that names an agent of the team, or the playbook, is named', () => {
  const files = new Map([
    ['skills/x/SKILL.md', `Commission ${TEAM[0].toUpperCase()} to read the stats.`],
    ['nemia.md', 'Follow docs/playbook-operator.md.'],
  ]);
  assert.deepEqual(oursIn(files), [`skills/x/SKILL.md: ${TEAM[0]}`, 'nemia.md: playbook-operator']);
});

test('each skill her instruction and her skills name ships under nemia/skills/, with its folder as its name', () => {
  const files = shipped();
  const named = skillsNamed(files);
  assert.ok(named.length >= 3, `her instruction names her skills: ${named.join(', ')}`);
  const missing = named.filter((line) => !files.has(`skills/${line.split(': ')[1]}/SKILL.md`));
  assert.deepEqual(missing, []);
  for (const [file, text] of files) {
    const at = /^skills\/([^/]+)\/SKILL\.md$/.exec(file);
    if (at) assert.match(text, new RegExp(`^---\\nname: ${at[1]}\\n`), file);
  }
  assert.deepEqual(skillsNamed(new Map([['nemia.md', 'use the `grant-access` skill']])), ['nemia.md: grant-access']);
});

/** The phrases that name a step's gate: its key, its flag, a step at its gate, any step's gate, a step gated at one. */
const STEP_GATE = /`gate:`|--gate\b|\bits gate\b|\bstep's gate\b|\bgated at\b/gi;

/**
 * Where `files` say "gate" of anything but a step's gate (`STEP_GATE`), across line breaks: a line each, `<file>: <the words before it and
 * the word>`.
 */
const gateWordsIn = (files: Map<string, string>): string[] =>
  [...files].flatMap(([file, text]) => {
    const flat = text.replace(/\s+/g, ' ').replace(STEP_GATE, (said) => said.replace(/gat/gi, '—'));
    return [...flat.matchAll(/(?:\S+ ){0,3}\S*\bgat(?:e|es|ed|ing)\b/gi)].map((m) => `${file}: ${m[0]}`);
  });

test('what ships with Nemia, and this factory\'s instruction to her, say "gate" only for a step\'s gate, but in her generated verbs skill', () => {
  const files = shipped();
  files.delete('skills/verbs/SKILL.md');
  assert.ok(files.has('nemia.md') && files.has('skills/bring-what-waits/SKILL.md'), 'her instruction and her skills are read');
  files.set('NEMIA.md', fs.readFileSync(path.join(REPO, 'NEMIA.md'), 'utf8'));
  assert.deepEqual(gateWordsIn(files), []);
});

test('REFUSED: "gate" said of what is not a step\'s gate is named, across a line break; a step\'s gate is not', () => {
  const files = new Map([
    ['NEMIA.md', "His check files cards. Bring each card to the person as a gate. The landing step's gate is the person's."],
    ['skills/recap/SKILL.md', 'Offer to bring a waiting\ngate, rather than unasked.'],
    [
      'skills/bring-what-waits/SKILL.md',
      "A step at its\ngate: a step's gate, the design step's\ngate, its `gate:`, --gate <step>, a run gated at plan.",
    ],
  ]);
  assert.deepEqual(gateWordsIn(files), ['NEMIA.md: person as a gate', 'skills/recap/SKILL.md: bring a waiting gate']);
});

test('each of her skills reads as Claude Code reads her plugin, and the skill bring-what-waits replaced is gone', () => {
  const dir = path.join(SHIPPED, 'skills');
  const names = skillFolders(dir);
  assert.ok(names.includes('bring-what-waits') && names.includes('verbs'), `her skills are read: ${names.join(', ')}`);
  assert.deepEqual(
    names.map((name) => [name, skillRead(name, path.join(dir, name)).error]).filter(([, error]) => error !== null),
    [],
  );
  assert.ok(!fs.existsSync(path.join(dir, 'bring-a-gate')), 'bring-a-gate is gone');
  const plugin = JSON.parse(fs.readFileSync(path.join(SHIPPED, '.claude-plugin', 'plugin.json'), 'utf8')) as { name?: unknown };
  assert.equal(plugin.name, 'nemia');
});

/** The section of `bring-what-waits` that brings a step in each status that waits on the person (`WAITS_ON_PERSON`). */
const BROUGHT_IN: Record<string, string> = {
  'awaiting approval': 'A step at its gate',
  blocked: "A step's question to the person",
  exhausted: 'A loop out of rounds',
  'over budget': 'A step at its cap',
  'budget exhausted': 'A step at its cap',
};

test('each status that waits on the person has a section of bring-what-waits that brings it', () => {
  const waiting = Object.entries(WAITS_ON_PERSON)
    .filter(([, waits]) => waits)
    .map(([status]) => status);
  assert.deepEqual(waiting.toSorted(), Object.keys(BROUGHT_IN).toSorted(), 'a status that waits on the person is given its section here');
  const skill = fs.readFileSync(path.join(SHIPPED, 'skills', 'bring-what-waits', 'SKILL.md'), 'utf8');
  assert.deepEqual(
    waiting.filter((status) => !skill.includes(`\n## ${BROUGHT_IN[status]}\n`)),
    [],
  );
});
