/**
 * sdlc is any software factory's: no file of it (its agents, its workflows' steps, READMEs and scripts, its RULES.md, its skills) says a
 * word of the repository it was taken from (`REPOSITORY_WORDS`): no path of it, no command or tool of its check, no file of its lint,
 * no step of its workflows, none of its owner's settings. What a factory's repository decides is a parameter of `nemia.yaml`, whose
 * defaults are not read here; a word of one repository goes in its factory's own overlay.
 *
 * What is let through, and only it (`ALLOWED`): a link to Anthropic's own documentation, whose path is that site's; the run's branch
 * prefix `wf/`, which Nemia's machinery names; the layout's own path of a step's schema in a `workflow.yaml` (`path:
 * workflows/<w>/…`) and the store's folder of workflows in a fence (`${{ parameters.storeRoot }}/workflows/**`); and the comment lines
 * of `ci-log.ts`, in the carried folder beside `pull-request.ts`, that say what its generic parser reads of node:test's, tsc's and
 * oxlint's output. An agent names only its own skills, the place's and the interview (`ROLE_SKILLS`), and no MCP server, which the
 * step that needs one names.
 *
 * Each word is first refused in planted text (`PLANTED`), each allowance is held to its place, and each file is read for a name it must
 * hold, so a file moved or emptied cannot make the guard pass by reading nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { filesUnder, SDLC } from './template.ts';

/** This repository's words, which no file of sdlc may say, each with text that says it. */
const PLANTED: Record<string, string> = {
  'apps/': 'When the change touches `apps/api`, read its README.',
  'packages/': 'Read packages/agent-runtime/README.md first.',
  'workflows/': 'Try it first: `node workflows/build/pictures.ts`.',
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
  'tools/observe': 'render the dashboards with tools/observe/render/render.ts',
  ':4317': 'never send a span to localhost:4317',
  ':4318': 'disallowedTools: Bash(*:4318*)',
  pictures: 'hand over the pictures of each page you touched',
  B7: 'as B7 decided, the round is the commit',
  B8: 'B8 holds the landing to its receipt',
  'change-a-contract': 'skills: implement-a-change, change-a-contract',
  tsverify: 'run `npx tsverify` on the contract',
  'apps/web': 'a change under apps/web is photographed',
  'America/Montreal': 'nemia factory schedule f janitor --cron "0 9 * * 1" --tz America/Montreal',
  '--factory nemia': 'nemia template export out --from . --factory nemia',
  'mcp: playwright': 'overrides:\n  mcp: [playwright]\n',
};

/** The words themselves. */
const REPOSITORY_WORDS = Object.keys(PLANTED);

/** A word read by a pattern of its own rather than whole (`wholeWord`): Playwright's server named on a step's or an agent's line. */
const PATTERNS: Record<string, RegExp> = {
  'mcp: playwright': /^\s*mcp:.*\bplaywright\b|^\s*mcp:\s*\n(?:\s*-\s*\S+\s*\n)*?\s*-\s*playwright\s*$/im,
};

/** `word` as a pattern, whole and in any case: no letter, digit or `$` before a word that opens on one, nor after one that ends on one. */
const wholeWord = (word: string): RegExp =>
  PATTERNS[word] ??
  new RegExp(
    `${/^[\w$]/.test(word) ? '(?<![\\w$])' : ''}${word.replace(/[-.*+?^${}()|[\]\\/]/g, '\\$&')}${/[\w$]$/.test(word) ? '(?![\\w$])' : ''}`,
    'i',
  );

/** What is let through where it stands, each taken out of a file's text before a word is read (`readable`). */
const ALLOWED: Array<{ what: string; files: RegExp; pattern: RegExp }> = [
  {
    what: "a link to Anthropic's own documentation",
    files: /./,
    pattern: /https:\/\/(?:(?:code|docs|platform)\.claude\.com|docs\.anthropic\.com)\/\S*/g,
  },
  { what: "the run's branch prefix", files: /./, pattern: /(?<![\w$])wf\\?\//g },
  { what: "the layout's path of a step's schema", files: /^workflows\/[\w-]+\/workflow\.yaml$/, pattern: /^(\s*path:\s*)workflows\//gm },
  {
    what: "the store's folder of workflows",
    files: /^agents\/[\w-]+\/agent\.yaml$/,
    pattern: /\$\{\{\s*parameters\.storeRoot\s*\}\}\/workflows\//g,
  },
  {
    what: "the parser's comment lines",
    files: /^carried\/ci-log\.ts$/,
    pattern: /^\s*\*.*(?:node --test|\btsc\b|oxlint).*$/gm,
  },
  { what: "the parameters' defaults", files: /^nemia\.yaml$/, pattern: /^\s*default:.*$/gm },
];

/** The text of `file` with what `ALLOWED` lets through where it stands taken out. */
const readable = (file: string, text: string): string =>
  ALLOWED.filter(({ files }) => files.test(file)).reduce((left, { pattern }) => left.replace(pattern, ''), text);

/** Where `files` say one of `words`, past what is let through: a line each, `<file>: <word>`. */
const oursIn = (files: Map<string, string>, words: readonly string[] = REPOSITORY_WORDS): string[] =>
  [...files].flatMap(([file, text]) =>
    words.filter((word) => wholeWord(word).test(readable(file, text))).map((word) => `${file}: ${word}`),
  );

/** The skills that are the team's own, which sdlc carries. */
const OWN_SKILLS = ['write-a-spec', 'implement-a-change', 'review-a-change', 'land-a-branch', 'read-the-stats', 'groom-the-inbox'];

/** The skills an agent may name: its own, the place's, and the interview Nemia ships. */
const ROLE_SKILLS = [...OWN_SKILLS, 'git', 'grilling'];

/** What each step's body must hold, by the step's name. */
const STEP_HOLDS: Record<string, string> = {
  design: 'spec',
  implement: 'pull request',
  review: 'diff',
  land: 'landing.ts',
  argus: 'nemia stats',
  next: 'nemia route',
  'to-build': 'workflow: build',
  'to-quick': 'workflow: quick',
};

/** The name each file of sdlc must hold, by its path from the template: the first rule whose pattern takes the path. */
const HOLDS: Array<[RegExp, (file: string) => string]> = [
  [/^nemia\.yaml$/, () => 'kind: FactoryTemplate'],
  [/^RULES\.md$/, () => '${{ parameters.areas }}'],
  [/^fences\/[\w-]+\.(?:allow|deny)\.yaml$/, () => '\n- '],
  [/^agents\/[\w-]+\/agent\.yaml$/, () => 'kind: Agent'],
  [/^agents\/[\w-]+\/instructions\.md$/, () => 'You are '],
  [/\.schema\.json$/, () => '"properties"'],
  [/^skills\/([\w-]+)\/SKILL\.md$/, (file) => `name: ${file.split('/')[1]}\n`],
  [/^skills\/[\w-]+\/rules\.json$/, () => '"breaks"'],
  [/^workflows\/([\w-]+)\/README\.md$/, (file) => `# ${file.split('/')[1]}\n`],
  [/^workflows\/[\w-]+\/workflow\.yaml$/, () => 'kind: Workflow'],
  [/^carried\/ci-log\.ts$/, () => 'export function failures'],
  [/^carried\/exec\.ts$/, () => 'export function run'],
  [/^carried\/refresh\.ts$/, () => 'export function refresh'],
  [/^carried\/rerun\.ts$/, () => 'export function rerunOnce'],
  [/^(?:carried|workflows\/[\w-]+)\/[\w-]+\.ts$/, (file) => `node ${path.basename(file)}`],
  [/^workflows\/[\w-]+\/[\w-]+\.md$/, (file) => STEP_HOLDS[path.basename(file, '.md')] ?? 'a step the guard knows'],
];

/** The name `file` must hold, or none where no rule takes it. */
const holdOf = (file: string): string | undefined => HOLDS.find(([pattern]) => pattern.test(file))?.[1](file);

/** Every file of sdlc, by its path from the template, with its text. */
const sdlc = (): Map<string, string> => new Map(filesUnder(SDLC).map((file) => [file, fs.readFileSync(path.join(SDLC, file), 'utf8')]));

/** Each skill an agent of `files` names that is not a role's, and each MCP server one names: a line each, `<file>: <name>`. */
const foreign = (files: Map<string, string>): string[] =>
  [...files]
    .filter(([file]) => /^agents\/[\w-]+\/agent\.yaml$/.test(file))
    .flatMap(([file, text]) => {
      const spec = ((yaml.load(text) as { spec?: Record<string, unknown> }).spec ?? {}) as { skills?: string[]; mcp?: string[] };
      return [
        ...(spec.skills ?? []).filter((skill) => !ROLE_SKILLS.includes(skill)).map((skill) => `${file}: ${skill}`),
        ...(spec.mcp ?? []).map((server) => `${file}: mcp ${server}`),
      ];
    });

test("REFUSED: each of this repository's words, planted in an agent, a step, a workflow's file, a script and a skill", () => {
  for (const [word, says] of Object.entries(PLANTED)) {
    const files = new Map([
      ['agents/x/agent.yaml', `kind: Agent\nspec:\n  description: ${says}\n`],
      ['agents/x/instructions.md', `You are X.\n${says}\n`],
      ['workflows/w/workflow.yaml', `kind: Workflow\nspec:\n  steps:\n    - name: s\n${says}\n`],
      ['workflows/w/s.md', `Do it. ${says}\n`],
      ['carried/ci-log.ts', `const said = ${JSON.stringify(says)};\n${says}\n`],
      ['skills/x/SKILL.md', `---\nname: x\n---\n1. ${says}\n`],
    ]);
    assert.deepEqual(
      oursIn(files, [word]),
      [...files.keys()].map((file) => `${file}: ${word}`),
      word,
    );
  }
  assert.ok(REPOSITORY_WORDS.length >= 31, 'the list only grows, but for a word that stops being the repository’s: say why in writing');
});

test('REFUSED: each allowance outside its place lets nothing through', () => {
  const link = 'https://code.claude.com/docs/en/agent-sdk/overview';
  const files = new Map([
    ['workflows/w/s.md', `Read ${link}, then docs/architecture.md. Read https://example.test/docs/architecture.md.`],
    ['workflows/w/README.md', 'path: workflows/w/s.schema.json'],
    ['workflows/w/workflow.yaml', 'check: node workflows/w/x.ts'],
    ['agents/x/instructions.md', 'never write ${{ parameters.storeRoot }}/workflows/x'],
    ['carried/landing.ts', ' * a TypeScript error, as tsc prints it, and oxlint'],
    ['workflows/w/ci-log.ts', ' * a TypeScript error, as tsc prints it'],
    ['carried/ci-log.ts', 'const lint = "oxlint";'],
    ['RULES.md', 'default: npm test'],
  ]);
  assert.deepEqual(oursIn(files), [
    'workflows/w/s.md: docs/',
    'workflows/w/README.md: workflows/',
    'workflows/w/workflow.yaml: workflows/',
    'agents/x/instructions.md: workflows/',
    'carried/landing.ts: oxlint',
    'carried/landing.ts: tsc',
    'workflows/w/ci-log.ts: tsc',
    'carried/ci-log.ts: oxlint',
    'RULES.md: npm',
  ]);
});

test('each allowance lets through what stands in its place, and the matcher takes a word whole', () => {
  const files = new Map([
    ['workflows/w/s.md', `Read https://code.claude.com/docs/en/overview. A branch of wf/<run>/<leaf>, \`wf\\/x\`; $WF_RUN.`],
    ['workflows/w/workflow.yaml', 'output:\n  path: workflows/w/s.schema.json\n'],
    ['agents/x/agent.yaml', '- Edit(${{ parameters.storeRoot }}/workflows/**)\n- mcp__playwright__browser_click\n'],
    ['carried/ci-log.ts', ' * oxlint draws its rule; tsc prints `error TS`; node --test prints `not ok`\n'],
    ['nemia.yaml', '      default: npm run --if-present lint\n'],
    ['RULES.md', 'a wfx of the workflows, $800, the implementer, From designs, B78'],
  ]);
  assert.deepEqual(oursIn(files), []);
});

test("every file of sdlc is read, and holds a name it must, and none says this repository's words", () => {
  const files = sdlc();
  assert.ok(files.size >= 51, 'every file of sdlc is read');
  for (const [file, text] of files) {
    const holds = holdOf(file);
    assert.ok(holds !== undefined, `${file} is a kind of file the guard knows: give it a name to hold in HOLDS`);
    assert.ok(text.includes(holds), `${file} holds ${holds}`);
  }
  for (const skill of ['write-a-spec', 'review-a-change']) assert.ok(files.has(`skills/${skill}/rules.json`), `${skill}'s rules are read`);
  assert.deepEqual(oursIn(files), []);
});

test('the parser keeps its generic lines for node:test, tsc and oxlint, which the allowance is for', () => {
  const text = sdlc().get('carried/ci-log.ts') ?? '';
  assert.ok(text.includes('error TS'), "the parser reads tsc's error lines");
  assert.match(text, /^\s*\*.*oxlint/m, "the parser's comment names oxlint's form");
});

test('REFUSED: an agent that names a skill not its role’s, or an MCP server', () => {
  const files = new Map([
    ['agents/x/agent.yaml', 'kind: Agent\nspec:\n  skills: [implement-a-change, git, look]\n'],
    ['agents/y/agent.yaml', 'kind: Agent\nspec:\n  skills: [grilling]\n  mcp: [playwright]\n'],
    ['agents/z/instructions.md', 'Mind your skills: look, board.\n'],
  ]);
  assert.deepEqual(foreign(files), ['agents/x/agent.yaml: look', 'agents/y/agent.yaml: mcp playwright']);
});

test("each agent of sdlc names only its role's skills, and no MCP server", () => {
  const files = sdlc();
  assert.equal([...files.keys()].filter((file) => file.endsWith('/agent.yaml')).length, 6, 'the six agents are read');
  assert.deepEqual(foreign(files), []);
});
