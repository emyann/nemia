/**
 * What ships with Nemia (`nemia/`) is any factory's, never this repository's: her instruction and her skills name no agent of this
 * repository's team, no file of its own and no playbook of its operator, and each skill her instruction and her skills name is one she
 * ships, under `nemia/skills/`, its `name:` its folder's. Its wording is judged by a person, at the gate; this holds only what it names.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './team.ts';

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
    ['skills/x/SKILL.md', `Commission ${TEAM[0]!.toUpperCase()} to read the stats.`],
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
