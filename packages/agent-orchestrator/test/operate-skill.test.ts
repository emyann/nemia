/**
 * Nemia's `operate` skill is her definition's, generated (`operateSkillOf`): the shipped file is what `agents/nemia.md` renders today,
 * and a definition changed without regenerating it renders apart from the shipped file, so the skill an outside session loads says her
 * role in her definition's own words.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { operateSkillOf, REGENERATE_OPERATE } from '../src/nemia/operate.ts';
import { nemiaDefinition } from '../src/nemia/level.store.ts';
import { splitFrontmatter } from '../src/step/step.ts';
import { frontmatterValues } from '../src/frontmatter/frontmatter.ts';

const SKILL = path.join(import.meta.dirname, '..', 'nemia', 'skills', 'operate', 'SKILL.md');

test('the shipped operate skill is what her definition renders today', () => {
  assert.equal(
    fs.existsSync(SKILL) ? fs.readFileSync(SKILL, 'utf8') : '',
    operateSkillOf(fs.readFileSync(nemiaDefinition(), 'utf8')),
    `nemia/skills/operate/SKILL.md is not her definition's: regenerate it from the repository's root: ${REGENERATE_OPERATE}`,
  );
});

test('REFUSED: a sentence planted in her definition without regenerating renders apart from the shipped file, named operate', () => {
  const definition = fs.readFileSync(nemiaDefinition(), 'utf8');
  const planted = operateSkillOf(`${definition}\nA planted sentence.\n`);
  assert.notEqual(planted, fs.readFileSync(SKILL, 'utf8'));
  assert.ok(planted.includes('A planted sentence.'), 'the body is carried');
  const { block } = splitFrontmatter('operate', planted);
  assert.equal((frontmatterValues(block ?? '') as { name?: unknown }).name, 'operate');
});
