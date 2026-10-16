/**
 * This repository's team is another software factory's as it is: its agents (`workflows/agents/*.md`, frontmatter and body), the closeout
 * schemas beside them, and the skills that are their own (`OWN_SKILLS`, each `SKILL.md` and its `rules.json`) say no word of this
 * repository (`REPOSITORY_WORDS`): no path of it, no command or tool of its check, no file of its lint, no step of its workflows, none of
 * its owner's settings. What is this repository's is told by the layer that owns it: a step of its workflows, its `.claude/settings.json`,
 * its `CLAUDE.md` files, its factory's rules. A link to Anthropic's own documentation is not a path of this repository, and no word is
 * read inside one (`DOCUMENTATION`). An agent's `skills:` names only its own skills, the place's and the vendored interview
 * (`ROLE_SKILLS`): a skill about this repository is added by the step that needs it.
 *
 * Each word is first refused in planted text (`PLANTED`), and each file is read for a name it must hold, so a file moved or emptied
 * cannot make the guard pass by reading nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { splitFrontmatter } from '../src/step/step.ts';
import { REPO } from './team.ts';

/** This repository's words, which no agent of the team, no schema beside one, no skill of theirs may say, each with text that says it. */
const PLANTED: Record<string, string> = {
  'apps/': 'When the change touches `apps/web`, picture its pages.',
  'packages/': 'Read packages/agent-runtime/README.md first.',
  'workflows/': 'Try them first: `node workflows/build/mutations.ts`.',
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
  mutant: 'name a mutant for each rule',
  mutants: '"required": ["mutants"]',
  noMutants: 'saying why in `noMutants`',
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

/** The skills that are the team's own, written for its roles. */
const OWN_SKILLS = ['write-a-spec', 'implement-a-change', 'review-a-change', 'land-a-branch', 'read-the-stats'];

/** The skills an agent of the team may name itself: its own, the place's, and the vendored interview. */
const ROLE_SKILLS = [...OWN_SKILLS, 'git', 'grilling'];

/** The team's agents folder, from the repository's root. */
const AGENTS = 'workflows/agents';

/** Every file of `folder` whose name ends in `suffix`, by its path from the repository's root. */
const filesOf = (folder: string, suffix: string): string[] =>
  fs
    .readdirSync(path.join(REPO, folder))
    .filter((name) => name.endsWith(suffix))
    .sort()
    .map((name) => `${folder}/${name}`);

/** Each file of the team the guard reads, by its path from the repository's root, with a name it must hold. */
const TEAM_FILES: Array<{ file: string; holds: string }> = [
  ...filesOf(AGENTS, '.md').map((file) => ({ file, holds: 'role:' })),
  ...filesOf(AGENTS, '.schema.json').map((file) => ({ file, holds: '"properties"' })),
  ...OWN_SKILLS.flatMap((skill) => [
    { file: `.claude/skills/${skill}/SKILL.md`, holds: `name: ${skill}\n` },
    ...filesOf(`.claude/skills/${skill}`, 'rules.json').map((file) => ({ file, holds: '"breaks"' })),
  ]),
];

/** The team's files as they are on disk, by path. */
const team = (): Map<string, string> => new Map(TEAM_FILES.map(({ file }) => [file, fs.readFileSync(path.join(REPO, file), 'utf8')]));

/** Each skill an agent file of `files` names in its `skills:` that is not a role's (`ROLE_SKILLS`): a line each, `<file>: <skill>`. */
const foreignSkills = (files: Map<string, string>): string[] =>
  [...files]
    .filter(([file]) => file.endsWith('.md') && file.startsWith(`${AGENTS}/`))
    .flatMap(([file, text]) => {
      const line = /^skills:(.*)$/m.exec(splitFrontmatter(file, text).block ?? '')?.[1] ?? '';
      return line
        .split(',')
        .map((skill) => skill.trim())
        .filter((skill) => skill !== '' && !ROLE_SKILLS.includes(skill))
        .map((skill) => `${file}: ${skill}`);
    });

test("REFUSED: each of this repository's words, planted in an agent's body, in its fence and in a skill", () => {
  for (const [word, says] of Object.entries(PLANTED)) {
    const files = new Map([
      ['workflows/agents/x.md', `---\nrole: X\n---\nYou are X. ${says}\n`],
      ['workflows/agents/y.md', `---\nrole: Y\nallowedTools: Agent\nnote: ${says}\n---\nYou are Y.\n`],
      ['.claude/skills/x/SKILL.md', `# X\n\n1. ${says}\n`],
    ]);
    assert.deepEqual(
      oursIn(files, [word]),
      [...files.keys()].map((file) => `${file}: ${word}`),
      word,
    );
  }
  assert.ok(REPOSITORY_WORDS.length >= 22, 'the list only grows');
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
    ['e.md', 'a wfx of the workflows, $800, the implementer, a transmutant, From designs'],
  ]);
  assert.deepEqual(oursIn(generic), []);
});

test('every file of the team is read, and holds a name it must', () => {
  const files = team();
  assert.deepEqual(filesOf(AGENTS, '.md').length, 6, 'the six agents');
  for (const { file, holds } of TEAM_FILES) assert.ok(files.get(file)?.includes(holds), `${file} holds ${holds}`);
  for (const skill of ['write-a-spec', 'review-a-change'])
    assert.ok(files.has(`.claude/skills/${skill}/rules.json`), `${skill}'s rules are read`);
});

test('no agent of the team, no schema beside one and no skill of theirs says a word of this repository', () => {
  assert.deepEqual(oursIn(team()), []);
});

test('REFUSED: an agent whose `skills:` names a skill that is not a role’s own', () => {
  const files = new Map([
    ['workflows/agents/x.md', '---\nrole: X\nskills: implement-a-change, git, look\n---\nYou are X.\n'],
    ['workflows/agents/y.md', '---\nrole: Y\nskills: grilling\n---\nYou are Y. Mind your skills: look, board.\n'],
    ['workflows/agents/z.md', '---\nrole: Z\nskills: implement-a-change, apps/web:ds-build\n---\nYou are Z.\n'],
    ['.claude/skills/x/SKILL.md', '---\nname: x\nskills: look\n---\n# X\n'],
  ]);
  assert.deepEqual(foreignSkills(files), ['workflows/agents/x.md: look', 'workflows/agents/z.md: apps/web:ds-build']);
});

test("each agent of the team names only its role's skills", () => {
  assert.deepEqual(foreignSkills(team()), []);
});

/** Each agent file of `files` whose frontmatter has an `mcp:` line, a server of one repository's `.mcp.json`: a line each, as written. */
const namedServers = (files: Map<string, string>): string[] =>
  [...files]
    .filter(([file]) => file.endsWith('.md') && file.startsWith(`${AGENTS}/`))
    .flatMap(([file, text]) => {
      const line = /^mcp:.*$/m.exec(splitFrontmatter(file, text).block ?? '')?.[0];
      return line === undefined ? [] : [`${file}: ${line}`];
    });

test("REFUSED: an MCP server named in an agent's file, which the step that needs it names", () => {
  const files = new Map([
    ['workflows/agents/x.md', '---\nrole: X\nmcp: playwright\n---\nYou are X.\n'],
    ['workflows/agents/y.md', '---\nrole: Y\n---\nYou are Y, and mcp: playwright is no line of yours.\n'],
    ['workflows/build/implement.md', '---\nplace: git\nagent: x\nmcp: playwright\n---\nBuild.\n'],
  ]);
  assert.deepEqual(namedServers(files), ['workflows/agents/x.md: mcp: playwright']);
});

test('no agent of the team names an MCP server', () => {
  assert.deepEqual(namedServers(team()), []);
});
