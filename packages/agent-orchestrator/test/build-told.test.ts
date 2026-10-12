/**
 * What this repository's own steps are told and fenced by, now that its agents and their skills say nothing of it
 * (`team-portable.test.ts`): each line taken out of an agent or a skill is said by the step that needs it (`TOLD`) — in its note, as a
 * skill it adds to its agent's, as a deny of its own, or as a field its own `output:` declares. `untold` reads each step as `nemia start`
 * freezes it, and is first made to refuse a copy of the shipped team with one of each taken away.
 *
 * The build workflow's review declares its own closeout, the reviewer's and the mutants it judged: `schemaDrift` holds the copy to the
 * agent's schema, field for field.
 *
 * The design system kit's skills sit in a folder of the board's, which no step can be given: build's design, implement and review are
 * told to load them (`KIT_SKILLS_TOLD`), and `kitDrift` holds the names told to the folders that are there and to what the trigger skill
 * `change-the-board` says of each.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { loadWorkflows } from '../src/folder/folder.store.ts';
import { outputFields } from '../src/step/step.ts';
import { skillFolders } from '../src/skills/skills.store.ts';
import { scratch } from './scratch.ts';
import { REPO, SHIPPED_HOLDERS, placesOf } from './team.ts';

/** This repository's own team: its `workflows/`. */
const HOLDER = SHIPPED_HOLDERS[0];

type Step = ReturnType<typeof loadWorkflows>[number];

/** What a shipped step must still be told: sentences of its note, skills it adds, denies of its own and fields its `output:` declares. */
type Told = { workflow: string; step: string; says: string[]; adds: string[]; denies: string[]; declares: string[] };

const SHADCN_READ = 'read `.claude/skills/shadcn/SKILL.md` with Read';
const NO_BUILD = ['Bash(npm run build)', 'Bash(npm run e2e)'];
const WHOLE_SUITE = [
  'Bash(npm test)',
  'Bash(npx turbo run test)',
  'Bash(npx turbo run test --force)',
  'Bash(npx turbo run test --continue)',
  'Bash(npx turbo run test --force --continue)',
  'Bash(npx turbo run test --continue --force)',
];

/** What a step given the browser denies itself: the unsafe tool its agent denies, and the live board's ports, in the tab or a new one. */
const BROWSER_FENCE = [
  'mcp__playwright__browser_run_code_unsafe',
  ...['console_messages', 'evaluate', 'network_request', 'network_requests', 'snapshot', 'take_screenshot'].map(
    (tool) => `mcp__playwright__browser_${tool}(filename:*)`,
  ),
  'mcp__playwright__browser_navigate(url:*:8787*)',
  'mcp__playwright__browser_navigate(url:*:5173*)',
  'mcp__playwright__browser_tabs(url:*:8787*)',
  'mcp__playwright__browser_tabs(url:*:5173*)',
];
const NO_LIVE_BOARD = 'Never the live board on :8787 or :5173, which your fence refuses by address.';
const NO_FILENAME = 'Give no browser tool a `filename`, which your fence refuses';
const STOP_BOARD = 'Run `npm run board:stop` before you sign off.';

/** What implement is told of the base: to merge it into its branch before it signs off, and what it runs and measures again after. */
const MERGES_THE_BASE = [
  '**Merge the base before you sign off**',
  '`git merge main-worktree/HEAD`',
  'Then run again the tests of what the merge touched',
  'Measure again whatever your change wrote by a measure, a baseline or a count that only shrinks',
  'Try your mutants again on the merged result',
  'never your branch into the base',
  'merge the commit it names and no other',
];

/** What review is told of the base: to say whether the branch holds it, and when a branch behind is a finding that sends the work back. */
const HOLDS_THE_BASE = [
  '**Say whether the branch holds the base**',
  '`git merge-base --is-ancestor main-worktree/HEAD HEAD`',
  'that the branch holds it or how many commits it lacks',
  'is a finding with `again: true` only where the base moved under the change',
  'Any other branch behind is no finding',
  'read the change alone with `git diff main-worktree/HEAD...HEAD`',
];

/** Where the design system kit's install writes its skills, from the repository's root: a folder no step's `skills:` reaches. */
const KIT_SKILLS = 'apps/web/.claude/skills';

/** The trigger skill of a change to the board, from the repository's root: it says once how a kit skill is loaded. */
const TRIGGER = '.claude/skills/change-the-board/SKILL.md';

/**
 * What design, implement and review are told of the kit's skills: to load each as the trigger skill says, then one sentence a skill, which
 * opens with its name and says when the work is its own.
 */
const KIT_SKILLS_TOLD = [
  "the design system kit's skills where the work is theirs, each loaded as `change-the-board` says",
  "`ds-build` before you design, write or judge anything drawn with the kit's parts or its roles",
  '`ds-theme` before a change to `apps/web/DESIGN.md` or the theme',
  '`ds-spec` when a decision cites Material',
];

const TOLD: Told[] = [
  {
    workflow: 'build',
    step: 'design',
    says: [
      SHADCN_READ,
      'The checks you may run here, each bare: `npx turbo run test --force --continue`, `npm run typecheck`, `npm run lint`.',
      "the owner's line for a run, which this factory's rules give",
      'To see a board in the browser, run `npm run board:serve`, bare, and open the address it prints with the `look` skill',
      NO_LIVE_BOARD,
      NO_FILENAME,
      STOP_BOARD,
      ...KIT_SKILLS_TOLD,
    ],
    adds: ['shadcn', 'look'],
    denies: ['Bash(cd:*)', ...NO_BUILD, ...BROWSER_FENCE],
    declares: [],
  },
  {
    workflow: 'build',
    step: 'implement',
    says: [
      ...MERGES_THE_BASE,
      "load `shadcn` for the board's components",
      '**Name your mutants** in the closeout: one per rule or guard the change adds',
      'Try them first: `node workflows/build/mutants.ts <closeout.json>` after you commit.',
      'saying why in `noMutants`',
      'When the change touches `tools/observe`',
      '`node tools/observe/render/render.ts --out <your files directory>` starts a throwaway stack from this workspace',
      'the check refuses a changed dashboard whose picture and',
      ...KIT_SKILLS_TOLD,
    ],
    adds: ['shadcn', 'look', 'see-a-dashboard'],
    denies: [],
    declares: ['mutants', 'noMutants'],
  },
  {
    workflow: 'build',
    step: 'review',
    says: [
      ...HOLDS_THE_BASE,
      SHADCN_READ,
      "Implement's check ran the whole test suite on this round's tree, forced",
      'Run the typecheck and the lint yourself, each bare and one command per call: `npx turbo run typecheck --force`, `npm run lint`.',
      "Run a package's tests, `npx turbo run test --force --continue --filter=<package>`, only where a finding needs a run to stand on.",
      '**Judge the mutants, do not run them**',
      "Quote each `wf mutants:` line you judged in your closeout's `mutants`.",
      'Never build or run the e2e',
      '**Open the change when a picture cannot show it**: when it changes what a page does when pressed, typed into or hovered, or a state no picture shows.',
      'Run `npm run board:serve`, bare',
      'say in your closeout what you opened and what it showed',
      'The pictures are enough for a change of layout or of words that they show.',
      NO_LIVE_BOARD,
      NO_FILENAME,
      STOP_BOARD,
      "When the change touches `tools/observe`, read each dashboard's picture and text the implement step named in its `artifacts`",
      'You do not render one yourself: your fence refuses the command and Docker.',
      ...KIT_SKILLS_TOLD,
    ],
    adds: ['shadcn', 'look', 'see-a-dashboard'],
    denies: ['Bash(cd:*)', ...NO_BUILD, ...WHOLE_SUITE, ...BROWSER_FENCE],
    declares: ['findings', 'mutants', 'again'],
  },
  { workflow: 'intake', step: 'intake', says: [], adds: [], denies: ['Bash(cd:*)', ...NO_BUILD], declares: [] },
  {
    workflow: 'janitor',
    step: 'argus',
    says: [
      'Here the CLI is reached as `npx nemia`.',
      '**Run each read bare**: `npx nemia stats --json --workflow janitor`',
      '`npx nemia stats --json --by agent --from <day> --to <day>`',
      '`npx nemia stats --json --by step --from <day> --to <day>`',
      '`npx nemia inbox`',
    ],
    adds: [],
    denies: NO_BUILD,
    declares: [],
  },
];

/** A sentence as a pattern of a note, whatever line it breaks on. */
const across = (sentence: string): RegExp =>
  new RegExp(
    sentence
      .split(/\s+/)
      .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s+'),
  );

/**
 * What of `TOLD` the steps of the workflow `workflow`, as loaded, no longer hold: a line each, `<workflow>/<step>: says "<sentence>"`,
 * `skill <name>`, `denies <rule>` or `declares <field>`; `is not there` for a step the workflow has no more.
 */
function untold(workflow: string, steps: readonly Step[]): string[] {
  return TOLD.filter((told) => told.workflow === workflow).flatMap((told) => {
    const step = steps.find((s) => s.name === told.step);
    const at = `${workflow}/${told.step}`;
    if (!step) return [`${at}: is not there`];
    return [
      ...told.says.filter((sentence) => !across(sentence).test(step.body)).map((sentence) => `${at}: says "${sentence}"`),
      ...told.adds.filter((skill) => !(step.agent?.addedSkills ?? []).includes(skill)).map((skill) => `${at}: skill ${skill}`),
      ...told.denies.filter((rule) => !(step.disallowedTools ?? []).includes(rule)).map((rule) => `${at}: denies ${rule}`),
      ...told.declares.filter((field) => !outputFields(step).includes(field)).map((field) => `${at}: declares ${field}`),
    ];
  });
}

/** The steps of the shipped `workflow`, read from a scratch copy of the team whose step file `step` `edit` rewrote. */
function shippedEdited(workflow: string, step: string, edit: (text: string) => string): Step[] {
  const root = scratch('wf-told-');
  fs.cpSync(HOLDER, root, { recursive: true });
  const file = path.join(root, workflow, `${step}.md`);
  const text = fs.readFileSync(file, 'utf8');
  const changed = edit(text);
  assert.notEqual(changed, text, `${workflow}/${step} has what the edit takes away`);
  fs.writeFileSync(file, changed);
  return loadWorkflows(path.join(root, workflow), { repo: REPO });
}

test('each shipped step still says, adds, denies and declares what its agent and its skill said before', () => {
  for (const workflow of new Set(TOLD.map((told) => told.workflow))) {
    const dir = path.join(HOLDER, workflow);
    assert.deepEqual(untold(workflow, loadWorkflows(dir, placesOf(dir))), [], workflow);
  }
});

test('REFUSED: a step that adds a skill no more, or declares its closeout no more, is named', () => {
  const unskilled = shippedEdited('build', 'implement', (text) =>
    text.replace('skills: effect, shadcn, change-the-board, look, see-a-dashboard\n', 'skills: effect, shadcn, change-the-board, look\n'),
  );
  assert.deepEqual(untold('build', unskilled), ['build/implement: skill see-a-dashboard']);
  const undeclared = shippedEdited('build', 'implement', (text) => text.replace('output: implement.schema.json\n', ''));
  assert.deepEqual(untold('build', undeclared), ['build/implement: declares mutants', 'build/implement: declares noMutants']);
});

test('REFUSED: a step that denies a command no more is named', () => {
  const review = shippedEdited('build', 'review', (text) => text.replace(' Bash(npm run e2e),', ''));
  assert.deepEqual(untold('build', review), ['build/review: denies Bash(npm run e2e)']);
  const intake = shippedEdited('intake', 'intake', (text) => text.replace(', Bash(npm run build)', ''));
  assert.deepEqual(untold('intake', intake), ['intake/intake: denies Bash(npm run build)']);
  const janitor = shippedEdited('janitor', 'argus', (text) => text.replace(/^disallowedTools: .*\n/m, ''));
  assert.deepEqual(
    untold('janitor', janitor),
    NO_BUILD.map((rule) => `janitor/argus: denies ${rule}`),
  );
});

test('REFUSED: a step whose note says a sentence no more is named, whatever line the sentence broke on', () => {
  const design = shippedEdited('build', 'design', (text) => text.replace(/^The checks you may run here.*\n/m, ''));
  assert.deepEqual(untold('build', design), [`build/design: says "${TOLD[0].says[1]}"`]);
  const review = shippedEdited('build', 'review', (text) => text.replace('**Judge the mutants, do not run them**', '**Run the mutants**'));
  assert.deepEqual(untold('build', review), ['build/review: says "**Judge the mutants, do not run them**"']);
  assert.match('Run a\n   check   bare.', across('Run a check bare.'));
  assert.deepEqual(untold('build', []), ['build/design: is not there', 'build/implement: is not there', 'build/review: is not there']);
});

test('REFUSED: design or review told no more to open a served board, when the pictures are enough, or to stop it, is named', () => {
  const cut = (step: string, from: RegExp): string[] =>
    untold(
      'build',
      shippedEdited('build', step, (text) => text.replace(from, '')),
    );
  assert.deepEqual(cut('review', /The pictures are enough for a change of layout\s+or of words that they show\. /), [
    'build/review: says "The pictures are enough for a change of layout or of words that they show."',
  ]);
  assert.deepEqual(cut('review', / Run\s+`npm run board:stop` before you sign off\./), [`build/review: says "${STOP_BOARD}"`]);
  assert.deepEqual(cut('review', /Give no browser tool a\s+`filename`, which your fence refuses/), [`build/review: says "${NO_FILENAME}"`]);
  assert.deepEqual(cut('review', /\*\*Open the change when a picture cannot show it\*\*/), [
    'build/review: says "**Open the change when a picture cannot show it**: when it changes what a page does when pressed, typed into or hovered, or a state no picture shows."',
  ]);
  assert.deepEqual(cut('design', / Run `npm run board:stop` before you sign off\./), [`build/design: says "${STOP_BOARD}"`]);
  assert.deepEqual(cut('design', /Never the live\s+board on :8787 or :5173, which your fence refuses by address\. /), [
    `build/design: says "${NO_LIVE_BOARD}"`,
  ]);
  assert.deepEqual(cut('design', /, mcp__playwright__browser_tabs\(url:\*:5173\*\)/), [
    'build/design: denies mcp__playwright__browser_tabs(url:*:5173*)',
  ]);
  assert.deepEqual(cut('review', /, mcp__playwright__browser_navigate\(url:\*:8787\*\)/), [
    'build/review: denies mcp__playwright__browser_navigate(url:*:8787*)',
  ]);
});

test('REFUSED: implement told no more to merge the base, or review to say whether the branch holds it, is named', () => {
  const cut = (step: string, sentence: string): string[] =>
    untold(
      'build',
      shippedEdited('build', step, (text) => text.replace(across(sentence), '')),
    );
  for (const sentence of MERGES_THE_BASE) assert.deepEqual(cut('implement', sentence), [`build/implement: says "${sentence}"`]);
  for (const sentence of HOLDS_THE_BASE) assert.deepEqual(cut('review', sentence), [`build/review: says "${sentence}"`]);
});

/** The sentences of `sentences` that open with a skill's name in backticks, each with that name. */
const namedIn = (sentences: readonly string[]): { name: string; sentence: string }[] =>
  sentences.flatMap((sentence) => {
    const name = /^`([^`]+)`/.exec(sentence)?.[1];
    return name ? [{ name, sentence }] : [];
  });

/**
 * What the kit's skills told by `sentences`, the skill folders `folders` of the kit and the trigger skill's text `trigger` do not hold
 * together, a line each: a skill told that has no folder, a folder no step is told of, a skill told whose sentence the trigger skill does
 * not say, and a trigger skill that names no file to read a kit skill from.
 */
function kitDrift(sentences: readonly string[], folders: readonly string[], trigger: string): string[] {
  const told = namedIn(sentences);
  return [
    ...told.filter(({ name }) => !folders.includes(name)).map(({ name }) => `${name}: told to a step, and no folder in ${KIT_SKILLS}`),
    ...folders.filter((folder) => !told.some(({ name }) => name === folder)).map((folder) => `${folder}: a folder no step is told of`),
    ...told
      .filter(({ sentence }) => !across(sentence).test(trigger))
      .map(({ name }) => `${name}: change-the-board says no "${name}" sentence`),
    ...(trigger.includes(`\`${KIT_SKILLS}/<name>/SKILL.md\``) ? [] : [`change-the-board names no ${KIT_SKILLS}/<name>/SKILL.md to read`]),
  ];
}

/** A scratch copy of the kit's skill folders, which `edit` changed, as the names of the skill folders it then holds. */
function kitFoldersEdited(edit: (dir: string) => void): string[] {
  const dir = scratch('wf-told-kit-');
  fs.cpSync(path.join(REPO, KIT_SKILLS), dir, { recursive: true });
  edit(dir);
  return skillFolders(dir);
}

test("every kit skill build's steps are told to load has a folder, every kit skill folder is told, and change-the-board says each", () => {
  const folders = skillFolders(path.join(REPO, KIT_SKILLS));
  assert.deepEqual(folders, ['ds-build', 'ds-spec', 'ds-theme']);
  assert.deepEqual(kitDrift(KIT_SKILLS_TOLD, folders, fs.readFileSync(path.join(REPO, TRIGGER), 'utf8')), []);
});

test('REFUSED: a kit skill told to a step that has no folder, and a kit skill folder no step is told of, are named', () => {
  const trigger = fs.readFileSync(path.join(REPO, TRIGGER), 'utf8');
  const renamed = kitFoldersEdited((dir) => fs.renameSync(path.join(dir, 'ds-build'), path.join(dir, 'ds-builds')));
  assert.deepEqual(kitDrift(KIT_SKILLS_TOLD, renamed, trigger), [
    `ds-build: told to a step, and no folder in ${KIT_SKILLS}`,
    'ds-builds: a folder no step is told of',
  ]);
  const added = kitFoldersEdited((dir) => {
    fs.mkdirSync(path.join(dir, 'ds-new'));
    fs.writeFileSync(path.join(dir, 'ds-new', 'SKILL.md'), '---\nname: ds-new\ndescription: New.\n---\n');
    fs.mkdirSync(path.join(dir, 'ds-notes'));
  });
  assert.deepEqual(kitDrift(KIT_SKILLS_TOLD, added, trigger), ['ds-new: a folder no step is told of']);
  assert.deepEqual(kitDrift(KIT_SKILLS_TOLD.slice(0, 3), skillFolders(path.join(REPO, KIT_SKILLS)), trigger), [
    'ds-spec: a folder no step is told of',
  ]);
});

test('REFUSED: a trigger skill that says a kit skill no more, or names no file to read one from, is named', () => {
  const trigger = fs.readFileSync(path.join(REPO, TRIGGER), 'utf8');
  const folders = skillFolders(path.join(REPO, KIT_SKILLS));
  const plain = trigger.replace('`ds-theme` before', 'the theme skill before');
  assert.notEqual(plain, trigger);
  assert.deepEqual(kitDrift(KIT_SKILLS_TOLD, folders, plain), ['ds-theme: change-the-board says no "ds-theme" sentence']);
  const elsewhere = trigger.replace(`${KIT_SKILLS}/<name>/SKILL.md`, '.claude/skills/<name>/SKILL.md');
  assert.notEqual(elsewhere, trigger);
  assert.deepEqual(kitDrift(KIT_SKILLS_TOLD, folders, elsewhere), [`change-the-board names no ${KIT_SKILLS}/<name>/SKILL.md to read`]);
});

test("REFUSED: design, implement or review told a sentence of the kit's skills no more is named", () => {
  for (const step of ['design', 'implement', 'review'])
    for (const sentence of KIT_SKILLS_TOLD)
      assert.deepEqual(
        untold(
          'build',
          shippedEdited('build', step, (text) => text.replace(across(sentence), '')),
        ),
        [`build/${step}: says "${sentence}"`],
      );
});

type Schema = { properties: Record<string, unknown>; required: string[] };

/**
 * Why the schema a step declares, `ours`, is not the agent's `theirs` with the field `field` added and required: undefined when it is.
 */
function schemaDrift(ours: string, theirs: string, field: string): string | undefined {
  const step = JSON.parse(ours) as Schema;
  if (!Object.hasOwn(step.properties, field) || !step.required.includes(field)) return `declares no required ${field}`;
  const { [field]: _added, ...properties } = step.properties;
  const less = { ...step, properties, required: step.required.filter((name) => name !== field) };
  return isDeepStrictEqual(less, JSON.parse(theirs)) ? undefined : `is not the agent's schema with ${field} added`;
}

test("the build review's schema is the reviewer's with `mutants` added, field for field", () => {
  const ours = fs.readFileSync(path.join(HOLDER, 'build', 'review.schema.json'), 'utf8');
  const theirs = fs.readFileSync(path.join(HOLDER, 'agents', 'review.schema.json'), 'utf8');
  assert.equal(schemaDrift(ours, theirs, 'mutants'), undefined);
  assert.ok(theirs.includes('"again"') && theirs.includes('"findings"'), 'the reviewer declares its findings and the round');
  assert.equal(
    schemaDrift(ours.replace('one finding each', 'a finding each'), theirs, 'mutants'),
    "is not the agent's schema with mutants added",
  );
  assert.equal(schemaDrift(theirs, theirs, 'mutants'), 'declares no required mutants');
  assert.equal(
    schemaDrift(ours.replace('["findings", "mutants", "again"]', '["findings", "again"]'), theirs, 'mutants'),
    'declares no required mutants',
  );
});
