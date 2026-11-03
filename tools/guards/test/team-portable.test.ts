/**
 * The role skills under `.claude/skills` (`OWN_SKILLS`, each `SKILL.md` and its `rules.json`), the ones sdlc ships for its agents to
 * write, build, review and land a change and read the stats, are another software factory's as they are: they say no word of this
 * repository (`REPOSITORY_WORDS`): no path of it, no command or tool of its check, no file of its lint, no step of its workflows, none
 * of its owner's settings. What is this repository's is told by the layer that owns it: a step of the nemia factory's workflows, its
 * `.claude/settings.json`, its `CLAUDE.md` files, its factory's rules. A link to Anthropic's own documentation is not a path of this
 * repository, and no word is read inside one (`DOCUMENTATION`). sdlc's agents, and the rest of its tree, are held the same way by
 * `packages/templates/test/portable.test.ts`.
 *
 * Each word is first refused in planted text (`PLANTED`), and each file is read for a name it must hold, so a file moved or emptied
 * cannot make the guard pass by reading nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './workspaces.ts';

/** This repository's words, which no role skill may say, each with text that says it. */
const PLANTED: Record<string, string> = {
  'apps/': 'When the change touches `apps/web`, picture its pages.',
  'packages/': 'Read packages/agent-runtime/README.md first.',
  'workflows/': 'the steps are under workflows/build/, read them first',
  '.claude/skills': 'read `.claude/skills/board/SKILL.md` with Read',
  'docs/': 'the layers are in docs/architecture.md',
  npm: 'allowedTools: Agent, Bash(npm run lint)',
  npx: 'disallowedTools: Bash(npx vitest run)',
  turbo: 'run the typecheck forced, `turbo run typecheck --force`',
  'node --test': 'it is run with node --test from the nearest package.json',
  e2e: 'Never build or run the E2E.',
  oxlint: 'the lint is oxlint, whole',
  oxfmt: '`oxfmt --check` holds the layout',
  '.oxlintrc': 'a ceiling raised in `.oxlintrc.json`',
  tsc: 'the typecheck is `tsc --noEmit`',
  shadcn: "load `shadcn` for the board's components",
  wf: 'allowedTools: Bash(wf stats:*)',
  $80: "the owner's line is about $80 a run",
  'From design': 'the spec, handed to you under *From design*',
  "implement's": "Implement's check ran the whole suite",
};

/** The words themselves. */
const REPOSITORY_WORDS = Object.keys(PLANTED);

/** `word` as a pattern, whole and in any case: no letter, digit or `$` before a word that opens on one, nor after one that ends on one. */
const wholeWord = (word: string): RegExp =>
  new RegExp(
    `${/^[\w$]/.test(word) ? '(?<![\\w$])' : ''}${word.replace(/[-.*+?^${}()|[\]\\/]/g, '\\$&')}${/[\w$]$/.test(word) ? '(?![\\w$])' : ''}`,
    'i',
  );

/**
 * A link to Anthropic's own documentation, on a host of theirs: its path is that site's, never a path of this repository, so the words
 * are not read inside one. A link to anywhere else is read whole.
 */
const DOCUMENTATION = /https:\/\/(?:(?:code|docs|platform)\.claude\.com|docs\.anthropic\.com)\/\S*/g;

/** Where `files` say one of `words`, each link to Anthropic's documentation (`DOCUMENTATION`) left out: a line each, `<file>: <word>`. */
const oursIn = (files: Map<string, string>, words: readonly string[] = REPOSITORY_WORDS): string[] =>
  [...files].flatMap(([file, text]) =>
    words.filter((word) => wholeWord(word).test(text.replace(DOCUMENTATION, ''))).map((word) => `${file}: ${word}`),
  );

/** The skills written for the roles of a team. */
const OWN_SKILLS = ['write-a-spec', 'implement-a-change', 'review-a-change', 'land-a-branch', 'read-the-stats'];

/** Every file of `folder` whose name ends in `suffix`, by its path from the repository's root. */
const filesOf = (folder: string, suffix: string): string[] =>
  fs
    .readdirSync(path.join(REPO, folder))
    .filter((name) => name.endsWith(suffix))
    .sort()
    .map((name) => `${folder}/${name}`);

/** Each file the guard reads, by its path from the repository's root, with a name it must hold. */
const SKILL_FILES: Array<{ file: string; holds: string }> = OWN_SKILLS.flatMap((skill) => [
  { file: `.claude/skills/${skill}/SKILL.md`, holds: `name: ${skill}\n` },
  ...filesOf(`.claude/skills/${skill}`, 'rules.json').map((file) => ({ file, holds: '"breaks"' })),
]);

/** The skills' files as they are on disk, by path. */
const roleSkills = (): Map<string, string> =>
  new Map(SKILL_FILES.map(({ file }) => [file, fs.readFileSync(path.join(REPO, file), 'utf8')]));

test("REFUSED: each of this repository's words, planted in a skill's body, in its frontmatter and in its rules", () => {
  for (const [word, says] of Object.entries(PLANTED)) {
    const files = new Map([
      ['.claude/skills/x/SKILL.md', `---\nname: x\n---\n# X\n\n1. ${says}\n`],
      ['.claude/skills/y/SKILL.md', `---\nname: y\ndescription: ${says}\n---\n# Y\n`],
      ['.claude/skills/x/rules.json', JSON.stringify({ rules: [{ breaks: says }] })],
    ]);
    assert.deepEqual(
      oursIn(files, [word]),
      [...files.keys()].map((file) => `${file}: ${word}`),
      word,
    );
  }
  assert.ok(
    REPOSITORY_WORDS.length >= 19,
    "the list only grows, but for a word that stops being this repository's: `mutant`, `mutants` and `noMutants` went with the " +
      'mutants approach, taking the floor from 22 to 19. Lowering it again asks for the same reason in writing.',
  );
});

test("REFUSED: a word of this repository beside a link to Anthropic's documentation, and inside a link to anywhere else", () => {
  const link = 'https://code.claude.com/docs/en/agent-sdk/overview';
  const beside = new Map([['a.md', `Read ${link}, then docs/architecture.md.`]]);
  assert.deepEqual(oursIn(beside, ['docs/']), ['a.md: docs/'], 'the link is left out, the path beside it is not');
  const elsewhere = new Map([['b.md', 'Read https://example.test/docs/architecture.md.']]);
  assert.deepEqual(oursIn(elsewhere, ['docs/']), ['b.md: docs/'], 'a link to another site is read whole');
  assert.deepEqual(oursIn(new Map([['c.md', `Read ${link}.`]]), ['docs/']), []);
});

test('the matcher takes a word whole, and lets through what any factory says', () => {
  const generic = new Map([
    ['a.md', 'Run each check your step names bare, one command per call; never `cd`, `git -C`, `VAR=` or `for`.'],
    ['b.md', 'disallowedTools: Bash(cd:*), Edit(~/.claude/settings.json)\nallowedTools: Bash(nemia stats:*), Bash(nemia inbox)'],
    ['c.md', "the repository's instruction files (`CLAUDE.md` at the root and in each folder the change touches), its docs"],
    ['d.md', 'never the store (`~/.agent-workflows`), `~/.claude` or `~/.cache`; the packages you touched; a limit raised'],
    ['e.md', 'a wfx of the workflows, $800, the implementer, From designs'],
  ]);
  assert.deepEqual(oursIn(generic), []);
});

test('every file of the role skills is read, and holds a name it must', () => {
  const files = roleSkills();
  for (const { file, holds } of SKILL_FILES) assert.ok(files.get(file)?.includes(holds), `${file} holds ${holds}`);
  for (const skill of ['write-a-spec', 'review-a-change'])
    assert.ok(files.has(`.claude/skills/${skill}/rules.json`), `${skill}'s rules are read`);
});

test('no role skill says a word of this repository', () => {
  assert.deepEqual(oursIn(roleSkills()), []);
});
