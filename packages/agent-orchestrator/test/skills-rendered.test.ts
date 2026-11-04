/**
 * Every SKILL.md there is, read as a session's harness reads it. How a step's skills are rendered by `nemia start` — named, a preloaded
 * one told whole, every one told whole in the brief when the rendered folder is gone — is the story of `step-skills.test.ts`.
 *
 * A SKILL.md whose frontmatter is not YAML is dropped by Claude Code with nothing said — the session is simply not given it — so every
 * SKILL.md there is, the tests' team's, the package's builtin ones, Nemia's and the repository's own, is parsed here as YAML, as a card
 * entry reads it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { skillEntryOf, splitFrontmatter } from '../src/workflow.ts';
import { appliesOf, renderSkill, skillDraftOf, withPreload } from '../src/skills/skills.ts';
import { REPO, TEAM } from './team.ts';

/** The package's builtin skills, which a step that names one finds last. */
const BUILTIN_SKILLS = path.join(import.meta.dirname, '..', 'skills');
/** Nemia's own skills, her plugin's. */
const NEMIA_SKILLS = path.join(import.meta.dirname, '..', 'nemia', 'skills');
/** Every folder of skills there is: the tests' team's, the package's builtin ones, Nemia's own, and the repository's for Claude Code. */
const SKILL_FOLDERS = [path.join(TEAM, 'skills'), BUILTIN_SKILLS, NEMIA_SKILLS, path.join(REPO, '.claude', 'skills')];

/** A SKILL.md's frontmatter as YAML reads it, or a throw saying why it does not read: what a skill that Claude Code would drop fails on. */
function frontmatterOf(file: string, text: string): Record<string, unknown> {
  const { block } = splitFrontmatter(file, text);
  if (block === null) throw new Error(`${file} has no frontmatter`);
  const read = yaml.load(block);
  if (read === null || typeof read !== 'object' || Array.isArray(read)) throw new Error(`${file}: its frontmatter is not a map of keys`);
  return read as Record<string, unknown>;
}

test("a card entry and a skill's paths read a SKILL.md's frontmatter as YAML does, on every SKILL.md there is: the tests' team's, builtin, Nemia's or the repository's own", () => {
  const files = SKILL_FOLDERS.flatMap((dir) =>
    fs.existsSync(dir) ? fs.readdirSync(dir).map((name) => path.join(dir, name, 'SKILL.md')) : [],
  ).filter((file) => fs.existsSync(file));
  for (const dir of SKILL_FOLDERS)
    assert.ok(
      files.some((file) => file.startsWith(dir)),
      `${dir} is read: ${files.join('\n')}`,
    );
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const id = path.basename(path.dirname(file));
    const keys = frontmatterOf(file, text);
    const words = (v: unknown) => (typeof v === 'string' ? v.trim() || undefined : undefined);
    const expected = {
      id,
      name: words(keys.title) ?? words(keys.name) ?? id,
      description: (keys.description as string).trim(),
      tags: (keys.tags as string[] | undefined) ?? [id],
      ...(keys.examples ? { examples: keys.examples } : {}),
    };
    assert.deepEqual(skillEntryOf(file, id, text), expected, file);
    assert.deepEqual(appliesOf(text), keys.applies === undefined ? [] : [keys.applies].flat(), `${file}: its applies:`);
  }
});

test('every SKILL.md there is, written again from its draft or its preload switched, reads as YAML with each of its keys as it was', () => {
  const files = SKILL_FOLDERS.flatMap((dir) =>
    fs.existsSync(dir) ? fs.readdirSync(dir).map((name) => path.join(dir, name, 'SKILL.md')) : [],
  ).filter((file) => fs.existsSync(file));
  assert.ok(files.length > 3, files.join('\n'));
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const id = path.basename(path.dirname(file));
    const { name: _, title, preload, ...keys } = frontmatterOf(file, text);
    const draft = skillDraftOf(file, id, text);
    const { name, title: written, preload: on, ...again } = frontmatterOf(file, renderSkill(draft, text));
    assert.equal(name, id, file);
    assert.equal(written, typeof title === 'string' && title.trim() ? title.trim() : undefined, file);
    assert.equal(on, preload === true || preload === 'true' ? true : undefined, file);
    assert.deepEqual(again, { ...keys, description: draft.description }, file);
    const switched = frontmatterOf(file, withPreload(file, text, !draft.preload));
    assert.equal(switched.preload === true, !draft.preload, file);
    delete switched.preload;
    const { preload: __, ...before } = frontmatterOf(file, text);
    assert.deepEqual(switched, before, `${file}: its preload switched`);
  }
});
