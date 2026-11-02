/**
 * A SKILL.md as code reads and writes it, pure, in two tables. Written: a draft rendered as Nemia ships a skill (`renderSkill`), an edit
 * keeping every key the form does not write, a draft the card reader would refuse, and its preload switched by one line alone
 * (`withPreload`). Read beyond its card: the paths it says its work is on (`appliesOf`) and whether a file is one of them
 * (`appliesMatch`) — a glob matches a path whole, `*` and `?` within one folder, `**` across folders — and what it costs a turn
 * (`skillTurnCost`). A skill written into the library, at the store, is the story of `test/skill-life.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { splitFrontmatter, WorkflowError } from '../step/step.ts';
import { skillTurnCost, tokensAbout } from '../agents/agents.ts';
import { preloads } from './read.store.ts';
import { appliesMatch, appliesOf, renderSkill, skillDraftOf, skillEntryOf, withPreload, type SkillDraft } from './skills.ts';
import { TEAM } from '../../test/team.ts';
import { names } from '../../test/assessed.ts';

const DRAFT: SkillDraft = {
  name: 'tidy-notes',
  title: 'Tidy notes',
  description: 'Rewrites a folder of notes: "one fact a line".',
  tags: ['notes', 'writing'],
  examples: ['tidy my notes', 'make these notes one fact a line'],
  body: '# Tidy notes\n\nRead each note, then write it again, one fact a line.',
};

/** A SKILL.md's frontmatter as YAML reads it. */
const keysOf = (text: string) => yaml.load(splitFrontmatter('SKILL.md', text).block!) as Record<string, unknown>;

/** The refusal `fn` throws, a `WorkflowError`, by its message. */
function refusal(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof WorkflowError, String(err));
    return err.message;
  }
  return assert.fail('it was not refused');
}

test('a SKILL.md written from a draft, and its preload switched: every other key as it was', async (t) => {
  await t.test('a skill given only a description is written with no title, tags or examples, and preload writes its line', () => {
    const text = renderSkill({ name: 'bare', description: 'Does one thing.', body: 'Do it.', preload: true, title: '  ', tags: null });
    assert.equal(text, '---\nname: bare\ndescription: Does one thing.\npreload: true\n---\nDo it.\n');
    assert.deepEqual(skillDraftOf('SKILL.md', 'bare', text), {
      name: 'bare',
      title: null,
      description: 'Does one thing.',
      tags: null,
      examples: null,
      preload: true,
      body: 'Do it.',
    });
  });

  await t.test(
    'an edit keeps every key the form does not write, line for line, and the preload the file had when the draft says none',
    () => {
      const was = [
        '---',
        'name: tidy-notes',
        '# written by hand',
        'allowed-tools: Read, Grep',
        'description: old words',
        'metadata:',
        '  owner: me',
        '  since: 2026',
        'tags:',
        '  - old',
        'preload: true',
        '---',
        'Old body.',
      ].join('\n');
      const text = renderSkill({ ...DRAFT, preload: undefined }, was);
      assert.deepEqual(splitFrontmatter('SKILL.md', text).block!.split('\n'), [
        'name: tidy-notes',
        'title: Tidy notes',
        `description: 'Rewrites a folder of notes: "one fact a line".'`,
        'tags: [ notes, writing ]',
        'examples: [ tidy my notes, make these notes one fact a line ]',
        '# written by hand',
        'allowed-tools: Read, Grep',
        'metadata:',
        '  owner: me',
        '  since: 2026',
        'preload: true',
        '',
      ]);
      assert.equal(skillDraftOf('SKILL.md', 'tidy-notes', text).preload, true);
      assert.equal(
        renderSkill({ ...DRAFT, preload: false }, was).includes('preload'),
        false,
        'a draft that says false takes the line away',
      );
    },
  );

  for (const [what, draft, ...facts] of [
    ['no description', { ...DRAFT, description: '  ' }, '`description:`', 'REQUIRED'],
    ['empty tags', { ...DRAFT, tags: [] }, '`tags`', 'empty list'],
    ['empty examples', { ...DRAFT, examples: [' '] }, '`examples`', 'empty list'],
    ['a line break in the description', { ...DRAFT, description: 'one\npreload: true' }, '`description`', 'line break'],
    ['a line break in the title', { ...DRAFT, title: 'one\rtwo' }, '`title`', 'line break'],
    ['a line break in a tag', { ...DRAFT, tags: ['a', 'b\nc'] }, '`tags`', 'line break'],
    ['a name that is no skill’s', { ...DRAFT, name: 'Tidy Notes' }, 'lowercase'],
  ] as const)
    await t.test(`REFUSED: a draft the card reader would refuse, in its words: ${what}`, () => {
      names(
        refusal(() => renderSkill(draft)),
        ...facts,
      );
    });

  await t.test('withPreload changes that one key and nothing else of the file; a preload: inside another key is not the skill’s', () => {
    const was = '---\nname: x\ndescription: "Does x."\npreload: false\nmetadata:\n  a: 1\n---\n\nBody, with its blank line above.\n';
    const on = withPreload('SKILL.md', was, true);
    assert.equal(on, '---\nname: x\ndescription: "Does x."\npreload: true\nmetadata:\n  a: 1\n---\n\nBody, with its blank line above.\n');
    assert.equal(
      withPreload('SKILL.md', on, false),
      '---\nname: x\ndescription: "Does x."\nmetadata:\n  a: 1\n---\n\nBody, with its blank line above.\n',
    );
    names(
      refusal(() => withPreload('SKILL.md', 'no frontmatter', true)),
      'SKILL.md',
      'frontmatter',
    );
    const nested = '---\ndescription: d\nmetadata:\n  preload: true\n---\n';
    assert.deepEqual(keysOf(withPreload('SKILL.md', nested, false)), keysOf(nested));
  });

  await t.test("withPreload leaves every other key's reading equal: a quoted value, a YAML list, a comment", () => {
    const was = [
      '---',
      'name: x',
      '# by hand',
      "description: 'Reviews a change: what it breaks.'",
      'tags:',
      '  - code',
      '  - review',
      'allowed-tools: [Read, Grep]',
      '---',
      'Body.',
      '',
    ].join('\n');
    const on = withPreload('SKILL.md', was, true);
    const { preload, ...others } = keysOf(on);
    assert.equal(preload, true);
    assert.deepEqual(others, keysOf(was));
    assert.ok(on.includes('# by hand\n'), on);
    assert.deepEqual(skillEntryOf('SKILL.md', 'x', on), skillEntryOf('SKILL.md', 'x', was));
    const off = withPreload('SKILL.md', on, false);
    assert.deepEqual(keysOf(off), keysOf(was));
    assert.equal(skillDraftOf('SKILL.md', 'x', off).preload, false);
    assert.equal(skillDraftOf('SKILL.md', 'x', on).preload, true);
  });
});

const skill = (applies?: string) =>
  `---\nname: a\ndescription: Do it.\n${applies === undefined ? '' : `applies: ${applies}\n`}---\nDo it.\n`;

test('a SKILL.md read beyond its card: the paths it applies to, a path matched against them, and what it costs a turn', async (t) => {
  await t.test("a skill's paths are read as a list, one glob written alone or quoted as one, and as none where it declares none", () => {
    assert.deepEqual(appliesOf(skill('["apps/web/**", "src/**/*.verb.ts"]')), ['apps/web/**', 'src/**/*.verb.ts']);
    assert.deepEqual(appliesOf(skill('apps/web/x.ts')), ['apps/web/x.ts']);
    assert.deepEqual(appliesOf(skill('"apps/web/**"')), ['apps/web/**']);
    assert.deepEqual(appliesOf(skill()), []);
    assert.deepEqual(appliesOf(skill('["apps/web/**", [x]]')), [], 'a list holding anything but a glob declares none');
    assert.deepEqual(appliesOf(skill('["apps/web/**", ""]')), [], 'an empty item too');
    assert.deepEqual(appliesOf(skill('\n  - apps/web/**\n  - src/**')), ['apps/web/**', 'src/**'], 'a block sequence reads as its list');
    assert.deepEqual(appliesOf(skill('["apps/web/**"')), [], 'a list that does not read declares none');
  });

  await t.test('a glob matches a path whole: `**` across folders or none, `*` and `?` within one, every other character as written', () => {
    const web = ['apps/web/**'];
    assert.ok(appliesMatch('apps/web/src/routes/a.tsx', web));
    assert.ok(!appliesMatch('apps/website/a.tsx', web), 'a folder is matched by its whole name');
    assert.ok(!appliesMatch('apps/web', web), 'a folder is not a file under it');
    assert.ok(!appliesMatch('x/apps/web/a.tsx', web), 'a glob matches from the checkout');
    const verbs = ['src/**/*.verb.ts'];
    assert.ok(appliesMatch('src/a.verb.ts', verbs), '`**/` matches no folder');
    assert.ok(appliesMatch('src/stats/deep/a.verb.ts', verbs));
    assert.ok(!appliesMatch('src/a.verb.tsx', verbs));
    assert.ok(!appliesMatch('src/stats/a.store.ts', verbs));
    assert.ok(!appliesMatch('src/a/b.ts', ['src/*.ts']), '`*` stays within one folder');
    assert.ok(appliesMatch('a.b', ['a?b']));
    assert.ok(!appliesMatch('a/b', ['a?b']), '`?` stays within one folder');
    assert.ok(!appliesMatch('axb', ['a.b']), 'a dot is a dot');
    assert.ok(appliesMatch('b.ts', ['a.ts', 'b.ts']), 'a path matches where one glob of the list does');
    assert.ok(!appliesMatch('b.ts', []));
  });

  await t.test('a skill costs a turn its listing, and its body too when it is preloaded', () => {
    const named = skillTurnCost(
      'write-a-note',
      '---\nname: write-a-note\ndescription: "Writes a note."\n---\n# Write\n\nA body of some length.\n',
    );
    assert.equal(named.preload, false);
    assert.equal(named.listed, tokensAbout('write-a-note: Writes a note.'), 'the listing is its name and description, quotes read off');
    assert.equal(named.body, tokensAbout('# Write\n\nA body of some length.'));
    assert.equal(named.perTurn, named.listed, 'named, a turn carries its listing alone');
    assert.equal(
      skillTurnCost('ask', '---\ndescription: >-\n  Asks: what is it\n  for?\n---\nBody.\n').listed,
      tokensAbout('ask: Asks: what is it for?'),
      'a description is read as YAML reads it, a folded block too',
    );
    const preloaded = skillTurnCost('ask', '---\ndescription: Asks.\npreload: true\n---\nThe whole body, every turn.\n');
    assert.equal(preloaded.preload, true);
    assert.equal(preloaded.perTurn, preloaded.listed + preloaded.body, 'preloaded, a turn carries its body too');
    assert.equal(skillTurnCost('bare', '# Bare\n').preload, false, 'no frontmatter is no preload, and no refusal');
    assert.equal(
      skillTurnCost('open', '---\ndescription: never closed\n').body,
      tokensAbout('---\ndescription: never closed\n'),
      'a frontmatter that never closes is costed as its text',
    );
    const shipped = path.join(TEAM, 'skills');
    for (const name of fs.readdirSync(shipped))
      assert.equal(
        skillTurnCost(name, fs.readFileSync(path.join(shipped, name, 'SKILL.md'), 'utf8')).preload,
        preloads(path.join(shipped, name)),
        `${name}: every skill of the team is read the same way the render reads it`,
      );
  });
});
