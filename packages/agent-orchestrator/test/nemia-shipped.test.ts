/**
 * What ships with Nemia (`nemia/`) is any factory's, never this repository's: her instruction and her skills name no agent of this
 * repository's team, no file of its own, no playbook of its operator and none of its owner's settings, and each skill her instruction and
 * her skills name is one she ships, under `nemia/skills/`, its `name:` its folder's, read as Claude Code reads her plugin. "Gate" names a
 * step's gate alone (`gateWordsIn`), but in her generated verbs skill, whose words are the command table's. Her skills and her instruction
 * keep their sections (`SECTIONS`), and the facts of her memory are said by the same names in each file that writes or reads them
 * (`FACTS`). Where her instruction tells her to act on a line of the feed, it names the words that line shows her (`feedLineWords`)
 * beside the reason her selector asks for. Its wording is judged by a person at the landing step; this holds only what it names.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './team.ts';
import { DENIED, feedLineWords, upgraded } from '../src/feed/index.ts';
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

/** The settings of this repository's owner, which what ships must not say: their city, its zone and their cost line. */
const OWNER = ['Montreal', 'America/Montreal', 'EDT', '$80'];

/** The words of this repository that what ships must not say: its team, its operator's playbook, its docs, its owner's settings. */
const OURS = [...TEAM, 'playbook-operator', 'architecture.md', 'CLAUDE.md', 'features.md', ...OWNER];

/** Where `files` say one of `OURS`, whole and in any case: a line each, `<file>: <word>`. */
const oursIn = (files: Map<string, string>): string[] =>
  [...files].flatMap(([file, text]) =>
    OURS.filter((word) => new RegExp(`(?<![\\w$])${word.replace(/[-.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w$])`, 'i').test(text)).map(
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

test("REFUSED: a skill of hers that says the owner's settings is named for each", () => {
  const files = new Map([['skills/x/SKILL.md', 'Say times in Montreal; the line is $80 a card.']]);
  assert.deepEqual(oursIn(files), ['skills/x/SKILL.md: Montreal', 'skills/x/SKILL.md: $80']);
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
  assert.deepEqual([...waiting].sort(), Object.keys(BROUGHT_IN).sort(), 'a status that waits on the person is given its section here');
  const skill = fs.readFileSync(path.join(SHIPPED, 'skills', 'bring-what-waits', 'SKILL.md'), 'utf8');
  assert.deepEqual(
    waiting.filter((status) => !skill.includes(`\n## ${BROUGHT_IN[status]}\n`)),
    [],
  );
});

/** The sections each of these files keeps, by its path under `nemia/`, each a `## <heading>` line of its own. */
const SECTIONS: Record<string, string[]> = {
  'skills/recruit-or-create/SKILL.md': ['When', 'Search', 'Read each against the need', 'Propose', 'Recruit', 'Create'],
  'skills/first-meeting/SKILL.md': ['When', 'Introduce yourself', 'The offer', 'Never unasked'],
  'nemia.md': ['What you learn of the person'],
  'skills/bring-what-waits/SKILL.md': ["A factory's upgrade"],
};

/** The sections of `SECTIONS` that `files` miss, a file not there missing them all: a line each, `<file>: <heading>`. */
const missingSections = (files: Map<string, string>): string[] =>
  Object.entries(SECTIONS).flatMap(([file, headings]) =>
    headings.filter((heading) => !(files.get(file) ?? '').includes(`\n## ${heading}\n`)).map((heading) => `${file}: ${heading}`),
  );

test('her skills recruit-or-create, first-meeting and bring-what-waits, and her instruction, keep their sections', () => {
  assert.deepEqual(missingSections(shipped()), []);
});

test('REFUSED: a first-meeting with a section dropped and another renamed is named for both', () => {
  const files = new Map([
    [
      'skills/first-meeting/SKILL.md',
      '---\nname: first-meeting\n---\n# First meeting\n\n## When\n\n## Introduce yourself\n\n## Never asked\n',
    ],
  ]);
  assert.deepEqual(
    missingSections(files).filter((line) => line.startsWith('skills/first-meeting/')),
    ['skills/first-meeting/SKILL.md: The offer', 'skills/first-meeting/SKILL.md: Never unasked'],
  );
});

/** The facts of her memory each of these files names, by its path under `nemia/`, each said in backticks. */
const FACTS: Record<string, string[]> = {
  'nemia.md': ['met', 'language', 'time-zone', 'cost-line'],
  'skills/first-meeting/SKILL.md': ['met'],
  'skills/write-a-card/SKILL.md': ['cost-line'],
  'skills/recap/SKILL.md': ['feed-cursor'],
};

/** The phrases that name a fact of her memory, across line breaks: "fact named `x`", "the fact `x`", "`x` fact", "kept as `x`". */
const FACT_SAID = /(?:\bfact(?:\s+named)?|\bkept\s+as|\bkeep\s+it\s+as)\s+`([a-z][a-z-]*)`|`([a-z][a-z-]*)`\s+fact\b/g;

/**
 * Where `files` name the facts of her memory otherwise than `FACTS`: a fact a file of `FACTS` does not say in backticks, and a fact said
 * by a phrase of `FACT_SAID` that `FACTS` does not hold: a line each, `<file>: <fact>`.
 */
const unnamedFacts = (files: Map<string, string>): string[] => {
  const known = new Set(Object.values(FACTS).flat());
  const unsaid = Object.entries(FACTS).flatMap(([file, facts]) =>
    facts.filter((fact) => !(files.get(file) ?? '').includes(`\`${fact}\``)).map((fact) => `${file}: ${fact}`),
  );
  const unknown = [...files].flatMap(([file, text]) =>
    [...text.matchAll(FACT_SAID)]
      .map((m) => m[1] ?? m[2])
      .filter((fact) => !known.has(fact))
      .map((fact) => `${file}: ${fact}`),
  );
  return [...unsaid, ...unknown];
};

test('the facts of her memory are named alike in her instruction and in each skill that writes or reads them', () => {
  const files = shipped();
  assert.ok(unnamedFacts(new Map()).length > 0, 'a file of FACTS not there says none of its facts');
  assert.deepEqual(unnamedFacts(files), []);
});

test('REFUSED: a fact named otherwise, or said by another name across a line break, is named', () => {
  const files = new Map([
    ['skills/first-meeting/SKILL.md', 'With no fact named `met`, meet them. Then write the fact `met-person`: the date.'],
    ['skills/x/SKILL.md', 'Ask their zone once, and keep it as\n`timezone`; the `budget` fact too.'],
  ]);
  assert.deepEqual(
    unnamedFacts(files).filter((line) => /^skills\/(first-meeting|x)\//.test(line)),
    ['skills/first-meeting/SKILL.md: met-person', 'skills/x/SKILL.md: timezone', 'skills/x/SKILL.md: budget'],
  );
  assert.deepEqual(
    unnamedFacts(new Map([['skills/first-meeting/SKILL.md', 'Then write the fact `met-person`.']])).filter((line) =>
      line.startsWith('skills/first-meeting/'),
    ),
    ['skills/first-meeting/SKILL.md: met', 'skills/first-meeting/SKILL.md: met-person'],
  );
});

/** A step's denied call as the feed writes one: the one-shot her `reason=ToolDenied` selector takes, and whose words wake her. */
const DENIAL = upgraded({
  at: '2026-10-05T16:00:00.000Z',
  run: 'r-1',
  step: 'build',
  word: `${DENIED}Bash(git push)`,
  note: 'try 2',
  involved: { kind: 'Step', name: 'r-1/build' },
  labels: { run: 'r-1', step: 'build' },
  call: 'Bash(git push)',
  try: 2,
});

/** Each of `said` that `text` does not name in backticks: a line each. */
const unnamedWords = (text: string, said: readonly string[]): string[] => said.filter((word) => !text.includes(`\`${word}\``));

test('her instruction names both the word a denial shows her and the reason her selector asks for', () => {
  assert.equal(
    feedLineWords(DENIAL),
    `16:00:00  r-1  build  ${DENIED}Bash(git push)  · try 2`,
    'the message that wakes her carries the word and the call, and no reason field',
  );
  assert.equal(DENIAL.reason, 'ToolDenied', 'the reason is hers to select on, not hers to read');
  assert.deepEqual(unnamedWords(shipped().get('nemia.md') ?? '', [DENIED.trim(), 'ToolDenied']), []);
});

test('REFUSED: an instruction that names the reason alone, and not the word the message shows, is named for it', () => {
  const only = 'When a line’s reason is `ToolDenied`, read it with the `grant-access` skill.';
  assert.deepEqual(unnamedWords(only, [DENIED.trim(), 'ToolDenied']), [DENIED.trim()]);
  assert.deepEqual(unnamedWords(`${only} A line says \`denied:\` and the call.`, [DENIED.trim(), 'ToolDenied']), []);
});
