/**
 * What this repository's own steps are told and fenced by, now that its agents and their skills say nothing of it
 * (`team-portable.test.ts`): each line taken out of an agent or a skill is said by the step that needs it (`TOLD`) — in its note, as a
 * skill it adds to its agent's, as a deny of its own, or as a field its own `output:` declares. `untold` reads each step as `nemia start`
 * freezes it, and is first made to refuse a copy of the shipped team with one of each taken away.
 *
 * No step of the build workflow declares a closeout of its own: review's fields are the reviewer's own schema's, its findings and the
 * round, merged into one output with one owner a field (`mergedOutput`).
 *
 * The design system kit's skills sit in a folder of the board's (`KIT_SKILLS`): build's design, implement and review are each given
 * every one on their `skills:` line, named with the folder, and `kitDrift` holds the names given to the folders that are there and to
 * what the trigger skill `change-the-board` says of each (`KIT_SKILLS_SAID`). Design and review, which are fenced, are told to load
 * the trigger skill first and where `ds-spec`'s reader runs from (`KIT_READER_TOLD`). The three are told of the look's own parts too,
 * by the folder's name (`LOOK_PARTS_TOLD`).
 *
 * Both implement steps are told how the pull request is opened (`OPENS_THE_PULL_REQUEST`): the frozen script read from the base, the
 * address named on the closeout, and what the check then does with it; review is told what its check did run and the two reads of the
 * pull request that are its own (`READS_THE_PULL_REQUEST`), and claims no more that the check ran the whole suite.
 *
 * The quick workflow's implement is told what build's is (`IMPLEMENT_TOLD`), and what makes a build quick (`QUICK_TOLD`): its plan
 * first, no decision of its own, the bound and the pages it names; it is given the kit's skills as build's steps are.
 *
 * The four steps that touch the board — build's design, implement and review, and quick's implement — are each given `react-aria`, this
 * repository's vendored skill for the board's own parts, on their `skills:` line and not on a team-portable agent's.
 *
 * And what becomes of Claude Code's own prompt for each agent of the team (`PROMPTS`, `promptsWrong`): `harnessPrompt: no-coding` for the
 * five who write no code, nothing for Ada, who writes it. An agent the table does not name is refused, so a new one says its value.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadWorkflows } from '../src/folder/folder.store.ts';
import { parseAgent, type Agent } from '../src/workflow.ts';
import { isReadme } from '../src/step/step.ts';
import { outputFields } from '../src/step/step.ts';
import { skillFolders } from '../src/skills/skills.store.ts';
import { givenSkillOf } from '../src/keys/given-skill.ts';
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
  'never your branch into the base',
  'merge the commit it names and no other',
];

/**
 * What review is told of CI and of the pull request: what implement's check did run, that `ci` judged the suite on the pushed commit,
 * and the two reads of its own — never a write, which its fence refuses.
 */
const READS_THE_PULL_REQUEST = [
  "Implement's check ran the declarations, the typecheck and the lint on this round's tree, and waited on CI",
  "GitHub's `ci` context judged the suite, the types, the lint, the whole e2e and the build on the commit implement pushed",
  '**Read the pull request and its checks**, read-only, by the address implement named in its `artifacts` as a value',
  'A red, cancelled or absent `ci` is a finding',
  "You open, edit, merge and close none: those are refused you, and a person's.",
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

/** The board's folder, from the repository's root, as a `skills:` line names it before a kit skill's name. */
const KIT_FOLDER = 'apps/web';

/** Where the design system kit's install writes its skills, from the repository's root: the folder a `skills:` line reads them from. */
const KIT_SKILLS = `${KIT_FOLDER}/.claude/skills`;

/** The trigger skill of a change to the board, from the repository's root: it says once how a kit skill is loaded. */
const TRIGGER = '.claude/skills/change-the-board/SKILL.md';

/** The steps of the build workflow that are given the kit's skills, each on its own `skills:` line. */
const KIT_STEPS = ['design', 'implement', 'review'];

/** What the trigger skill says of the kit's skills: one sentence a skill, which opens with its name and says when the work is its own. */
const KIT_SKILLS_SAID = [
  "`ds-build` before you design, write or judge anything drawn with the kit's parts or its roles",
  '`ds-theme` before a change to `apps/web/DESIGN.md` or the theme',
  '`ds-spec` when a decision cites Material',
];

/** A skill of the kit named in backticks, as the trigger skill writes one: the kit names each of its skills `ds-` and a word or more. */
const KIT_NAMED = /`(ds-[a-z0-9]+(?:-[a-z0-9]+)*)`/g;

/**
 * What design and review, the fenced steps, are told of the kit: to load the trigger skill first, and the command of `ds-spec`'s
 * reader from the repository's root, the workspace's script and not the copy the step is given.
 */
const KIT_READER_TOLD = [
  'When the change touches `apps/web`, load `change-the-board` first',
  "`ds-spec`'s reader runs from the root as `node apps/web/.claude/skills/ds-spec/md3.mjs <command>`, typed whole and alone",
  "this workspace's script, never the copy your skills hold, nor the path the skill's own text prints, which is no file here.",
];

/**
 * What design, implement and review are told of the look's own parts: where they are, to take one before drawing one, and that the
 * trigger skill says which.
 */
const LOOK_PARTS_TOLD = [
  "a change that draws a cut, a plate, a tile or a rail on the board takes the look's part for it from `apps/web/src/components/look`",
  'through its door, before it draws one of its own: `change-the-board` says which part.',
];

/**
 * What implement is told of the pull request: to open it through the frozen script, read from the base, since it may type neither a push
 * nor a `gh` call; to name its address on its closeout; and what its check then does with it.
 */
const OPENS_THE_PULL_REQUEST = [
  '**Open the pull request before you sign off**, once a round and after you merged the base',
  'git show main-worktree/HEAD:workflows/build/pull-request.ts',
  'node "$p/pull-request.ts" open --title "<the card\'s line>" --body-file "$WF_STEP_FILES/pr-body.md"',
  'The script pushes your own branch, never another and never the base and never forced',
  'Name the address it prints (`wf pr: <url>`) in your `artifacts` as a value',
  "Your check then pushes again through the same script, so CI's verdict is for the commit it judges, and waits on the `ci` context",
  "a red, cancelled or missing `ci` comes back as the check's refusal, with the Actions URL, the failing jobs and the tail of their log",
];

/** What an implement step is told, build's and quick's alike: the base, the board's components, a dashboard rendered. */
const IMPLEMENT_TOLD = [
  ...MERGES_THE_BASE,
  ...OPENS_THE_PULL_REQUEST,
  "load `shadcn` for the board's components",
  'When the change touches `tools/observe`',
  '`node tools/observe/render/render.ts --out <your files directory>` starts a throwaway stack from this workspace',
  'the check refuses a changed dashboard whose picture and',
  ...LOOK_PARTS_TOLD,
];

/** What quick's implement is told that build's is not: to plan first, to decide nothing, the bound, to run its tests and name its pages. */
const QUICK_TOLD = [
  'no spec was written for you and no review follows',
  '**Write your plan first**, before you build: what changes, where, and what proves it',
  "It goes in your closeout's `plan`",
  '**Decide nothing the card does not give.**',
  'sign off `blocked` and say in `needs` what is undecided; do not choose for them.',
  'The check measures it first (`workflows/quick/change.ts`) and refuses a change past either number',
  'do not trim it to fit, split it or drop its tests: sign off `blocked`',
  "**Name the pages** the change touches in your closeout's `pages`",
  '**Nothing runs your tests for you before the gate.**',
  "Run them yourself before you sign off, as `CLAUDE.md`, *Check your work*, says of a step's session",
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
      ...KIT_READER_TOLD,
      ...LOOK_PARTS_TOLD,
    ],
    adds: ['shadcn', 'look', 'react-aria'],
    denies: ['Bash(cd:*)', ...NO_BUILD, ...BROWSER_FENCE],
    declares: [],
  },
  {
    workflow: 'build',
    step: 'implement',
    says: IMPLEMENT_TOLD,
    adds: ['shadcn', 'look', 'react-aria', 'see-a-dashboard'],
    denies: [],
    declares: [],
  },
  {
    workflow: 'build',
    step: 'review',
    says: [
      ...HOLDS_THE_BASE,
      SHADCN_READ,
      ...READS_THE_PULL_REQUEST,
      'Run the typecheck and the lint yourself, each bare and one command per call: `npx turbo run typecheck --force`, `npm run lint`.',
      "Run a package's tests, `npx turbo run test --force --continue --filter=<package>`, only where a finding needs a run to stand on.",
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
      ...KIT_READER_TOLD,
      ...LOOK_PARTS_TOLD,
    ],
    adds: ['shadcn', 'look', 'react-aria', 'see-a-dashboard'],
    denies: ['Bash(cd:*)', ...NO_BUILD, ...WHOLE_SUITE, ...BROWSER_FENCE],
    declares: ['findings', 'again'],
  },
  {
    workflow: 'quick',
    step: 'implement',
    says: [...IMPLEMENT_TOLD, ...QUICK_TOLD],
    adds: ['shadcn', 'look', 'react-aria', 'see-a-dashboard'],
    denies: [],
    declares: ['plan', 'pages'],
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

type Schema = { properties: Record<string, unknown>; required: string[] };

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

/**
 * What becomes of Claude Code's own prompt for each agent of this repository's team (`harnessPrompt:`): `no-coding`, which drops its
 * `# Doing tasks` section, for the five who write no code, and none — `keep` — for Ada, who is the one who does. A new agent of the team
 * fails `promptsWrong` until it is named here.
 */
const PROMPTS: Readonly<Record<string, string | undefined>> = {
  ada: undefined,
  agora: 'no-coding',
  argus: 'no-coding',
  iris: 'no-coding',
  otto: 'no-coding',
  seldon: 'no-coding',
};

/** The agents of the team in `dir`, each by its file's name, with its frontmatter parsed. */
const agentsOf = (dir: string): Agent[] =>
  fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !isReadme(f))
    .sort()
    .map((f) =>
      parseAgent(path.basename(f, '.md'), fs.readFileSync(path.join(dir, f), 'utf8'), (beside) => {
        try {
          return fs.readFileSync(path.resolve(dir, beside), 'utf8');
        } catch {
          return undefined;
        }
      }),
    );

/**
 * A line for each agent of the team in `dir` whose `harnessPrompt:` is not what `PROMPTS` says, `<name>: harnessPrompt <what it says>`,
 * and one for an agent `PROMPTS` does not name at all.
 */
function promptsWrong(dir: string): string[] {
  return agentsOf(dir)
    .map((agent) =>
      !Object.hasOwn(PROMPTS, agent.name)
        ? `${agent.name}: is in no table`
        : agent.harnessPrompt === PROMPTS[agent.name]
          ? ''
          : `${agent.name}: harnessPrompt ${agent.harnessPrompt ?? 'none'}`,
    )
    .filter(Boolean);
}

test("the five of this repository's team who write no code drop Claude Code's coding instructions, and Ada alone keeps them", () => {
  const dir = path.join(HOLDER, 'agents');
  assert.deepEqual(promptsWrong(dir), [], 'every agent says what PROMPTS says, and none is missing from it');
  assert.deepEqual(
    agentsOf(dir).map((a) => a.name),
    Object.keys(PROMPTS),
    'the table names the team and no one else',
  );
});

test('REFUSED: one of the five without `harnessPrompt: no-coding`, or Ada with it, is named', () => {
  const edited = (name: string, edit: (text: string) => string): string[] => {
    const root = scratch('wf-told-prompts-');
    fs.cpSync(path.join(HOLDER, 'agents'), root, { recursive: true });
    const file = path.join(root, `${name}.md`);
    const text = fs.readFileSync(file, 'utf8');
    const changed = edit(text);
    assert.notEqual(changed, text, `${name}.md has what the edit changes`);
    fs.writeFileSync(file, changed);
    return promptsWrong(root);
  };
  for (const name of Object.keys(PROMPTS).filter((n) => PROMPTS[n] === 'no-coding')) {
    assert.deepEqual(
      edited(name, (text) => text.replace('harnessPrompt: no-coding\n', '')),
      [`${name}: harnessPrompt none`],
    );
    assert.deepEqual(
      edited(name, (text) => text.replace('harnessPrompt: no-coding', 'harnessPrompt: keep')),
      [`${name}: harnessPrompt keep`],
    );
  }
  assert.deepEqual(
    edited('ada', (text) =>
      text.replace('skills: implement-a-change, git\n', 'skills: implement-a-change, git\nharnessPrompt: no-coding\n'),
    ),
    ['ada: harnessPrompt no-coding'],
    'Ada writes the code, and keeps the instructions for it',
  );
});

test('each shipped step still says, adds, denies and declares what its agent and its skill said before', () => {
  for (const workflow of new Set(TOLD.map((told) => told.workflow))) {
    const dir = path.join(HOLDER, workflow);
    assert.deepEqual(untold(workflow, loadWorkflows(dir, placesOf(dir))), [], workflow);
  }
});

test('REFUSED: a step that adds a skill no more, or declares its closeout no more, is named', () => {
  const unskilled = shippedEdited('build', 'implement', (text) => text.replace(' see-a-dashboard,', ''));
  assert.deepEqual(untold('build', unskilled), ['build/implement: skill see-a-dashboard']);
  for (const step of KIT_STEPS) {
    const dropped = shippedEdited('build', step, (text) => text.replace(' react-aria,', ''));
    assert.deepEqual(untold('build', dropped), [`build/${step}: skill react-aria`], `${step} without react-aria is named`);
  }
  const quick = shippedEdited('quick', 'implement', (text) => text.replace(' react-aria,', ''));
  assert.deepEqual(untold('quick', quick), ['quick/implement: skill react-aria']);
  const undeclared = shippedEdited('quick', 'implement', (text) => text.replace('output: implement.schema.json\n', ''));
  assert.deepEqual(untold('quick', undeclared), ['quick/implement: declares plan', 'quick/implement: declares pages']);
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
  const review = shippedEdited('build', 'review', (text) => text.replace('Never build or run the e2e', 'Build and run the e2e'));
  assert.deepEqual(untold('build', review), ['build/review: says "Never build or run the e2e"']);
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

test('REFUSED: implement told no more to open the pull request, or review to read it, is named', () => {
  const cut = (workflow: string, step: string, sentence: string): string[] =>
    untold(
      workflow,
      shippedEdited(workflow, step, (text) => text.replace(across(sentence), '')),
    );
  for (const sentence of OPENS_THE_PULL_REQUEST) {
    assert.deepEqual(cut('build', 'implement', sentence), [`build/implement: says "${sentence}"`]);
    assert.deepEqual(cut('quick', 'implement', sentence), [`quick/implement: says "${sentence}"`]);
  }
  for (const sentence of READS_THE_PULL_REQUEST) assert.deepEqual(cut('build', 'review', sentence), [`build/review: says "${sentence}"`]);
  const steps = loadWorkflows(path.join(HOLDER, 'build'), placesOf(path.join(HOLDER, 'build')));
  const review = steps.find((step) => step.name === 'review')!;
  assert.doesNotMatch(review.body, /ran the whole test suite/, "review no longer claims implement's check ran the suite");
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

/** The kit's skills the step `step` is given on its own `skills:` line, each by its bare name: those named with the kit's folder. */
const kitGiven = (step: Step | undefined): string[] =>
  (step?.agent?.addedSkills ?? []).flatMap((written) => {
    const given = givenSkillOf(written);
    return given?.folder === KIT_FOLDER ? [given.name] : [];
  });

/**
 * What the build workflow's steps `steps`, the skill folders `folders` of the kit and the trigger skill's text `trigger` do not hold
 * together, a line each: for each step of `given`, `KIT_STEPS` where none is named, a kit skill it is given that has no folder and a
 * folder it is not given; a folder whose sentence (`KIT_SKILLS_SAID`) the trigger skill does not say; a sentence of
 * `KIT_SKILLS_SAID` whose skill has no folder, and a kit skill the trigger skill names (`KIT_NAMED`) that has none; and a trigger
 * skill that names no file to read a kit skill from.
 */
function kitDrift(steps: readonly Step[], folders: readonly string[], trigger: string, given: readonly string[] = KIT_STEPS): string[] {
  const said = namedIn(KIT_SKILLS_SAID);
  const named = [...new Set([...trigger.matchAll(KIT_NAMED)].map((span) => span[1]))];
  return [
    ...given.flatMap((name) => {
      const given = kitGiven(steps.find((step) => step.name === name));
      return [
        ...given
          .filter((skill) => !folders.includes(skill))
          .map((skill) => `${name}: given ${KIT_FOLDER}:${skill}, and no folder in ${KIT_SKILLS}`),
        ...folders.filter((folder) => !given.includes(folder)).map((folder) => `${name}: not given ${KIT_FOLDER}:${folder}`),
      ];
    }),
    ...folders
      .filter((folder) => !said.some(({ name, sentence }) => name === folder && across(sentence).test(trigger)))
      .map((folder) => `${folder}: change-the-board says no "${folder}" sentence`),
    ...said
      .filter(({ name }) => !folders.includes(name))
      .map(({ name }) => `${name}: KIT_SKILLS_SAID holds its sentence, and no folder in ${KIT_SKILLS}`),
    ...named.filter((name) => !folders.includes(name)).map((name) => `${name}: change-the-board names it, and no folder in ${KIT_SKILLS}`),
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

/** The shipped build workflow's steps, as a start in this checkout reads them. */
const buildSteps = (): Step[] => loadWorkflows(path.join(HOLDER, 'build'), { repo: REPO });

/** The trigger skill's text, as shipped. */
const triggerText = (): string => fs.readFileSync(path.join(REPO, TRIGGER), 'utf8');

test("build's design, implement and review are each given every kit skill there is a folder of, and change-the-board says each", () => {
  const folders = skillFolders(path.join(REPO, KIT_SKILLS));
  assert.deepEqual(folders, ['ds-build', 'ds-spec', 'ds-theme']);
  assert.deepEqual(kitDrift(buildSteps(), folders, triggerText()), []);
});

test('REFUSED: a kit skill given to a step that has no folder, and a kit skill folder a step is not given, are named', () => {
  const steps = buildSteps();
  const renamed = kitFoldersEdited((dir) => fs.renameSync(path.join(dir, 'ds-build'), path.join(dir, 'ds-builds')));
  assert.deepEqual(kitDrift(steps, renamed, triggerText()), [
    ...KIT_STEPS.flatMap((step) => [
      `${step}: given apps/web:ds-build, and no folder in ${KIT_SKILLS}`,
      `${step}: not given apps/web:ds-builds`,
    ]),
    'ds-builds: change-the-board says no "ds-builds" sentence',
    `ds-build: KIT_SKILLS_SAID holds its sentence, and no folder in ${KIT_SKILLS}`,
    `ds-build: change-the-board names it, and no folder in ${KIT_SKILLS}`,
  ]);
  const added = kitFoldersEdited((dir) => {
    fs.mkdirSync(path.join(dir, 'ds-new'));
    fs.writeFileSync(path.join(dir, 'ds-new', 'SKILL.md'), '---\nname: ds-new\ndescription: New.\n---\n');
    fs.mkdirSync(path.join(dir, 'ds-notes'));
  });
  assert.deepEqual(kitDrift(steps, added, triggerText()), [
    ...KIT_STEPS.map((step) => `${step}: not given apps/web:ds-new`),
    'ds-new: change-the-board says no "ds-new" sentence',
  ]);
  const folders = skillFolders(path.join(REPO, KIT_SKILLS));
  const ungiven = shippedEdited('build', 'review', (text) => text.replace(', apps/web:ds-spec\n', '\n'));
  assert.deepEqual(kitDrift(ungiven, folders, triggerText()), ['review: not given apps/web:ds-spec']);
  const bare = shippedEdited('build', 'design', (text) => text.replace(', apps/web:ds-theme,', ','));
  assert.deepEqual(kitDrift(bare, folders, triggerText()), ['design: not given apps/web:ds-theme']);
});

test('REFUSED: a kit skill gone from the kit and from the three lines, which the sentences here or change-the-board still say, is named', () => {
  const root = scratch('wf-told-gone-');
  fs.cpSync(HOLDER, root, { recursive: true });
  for (const step of KIT_STEPS) {
    const file = path.join(root, 'build', `${step}.md`);
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(text.includes(', apps/web:ds-theme'), file);
    fs.writeFileSync(file, text.replace(', apps/web:ds-theme', ''));
  }
  const steps = loadWorkflows(path.join(root, 'build'), { repo: REPO });
  const gone = kitFoldersEdited((dir) => fs.rmSync(path.join(dir, 'ds-theme'), { recursive: true }));
  assert.deepEqual(gone, ['ds-build', 'ds-spec']);
  const sentence = `ds-theme: KIT_SKILLS_SAID holds its sentence, and no folder in ${KIT_SKILLS}`;
  const trigger = `ds-theme: change-the-board names it, and no folder in ${KIT_SKILLS}`;
  assert.deepEqual(kitDrift(steps, gone, triggerText()), [sentence, trigger]);
  const silent = triggerText().replaceAll('`ds-theme`', 'the theme’s skill');
  assert.deepEqual(kitDrift(steps, gone, silent), [sentence], 'a trigger that names it no more leaves the sentence held here');
  assert.deepEqual(kitDrift(buildSteps(), skillFolders(path.join(REPO, KIT_SKILLS)), triggerText()), [], 'with its folder, neither');
});

test('REFUSED: a trigger skill that says a kit skill no more, or names no file to read one from, is named', () => {
  const trigger = triggerText();
  const steps = buildSteps();
  const folders = skillFolders(path.join(REPO, KIT_SKILLS));
  const plain = trigger.replace('`ds-theme` before', 'the theme skill before');
  assert.notEqual(plain, trigger);
  assert.deepEqual(kitDrift(steps, folders, plain), ['ds-theme: change-the-board says no "ds-theme" sentence']);
  const elsewhere = trigger.replace(`${KIT_SKILLS}/<name>/SKILL.md`, '.claude/skills/<name>/SKILL.md');
  assert.notEqual(elsewhere, trigger);
  assert.deepEqual(kitDrift(steps, folders, elsewhere), [`change-the-board names no ${KIT_SKILLS}/<name>/SKILL.md to read`]);
});

test("quick's implement is given every kit skill there is a folder of, and REFUSED: one it is given no more is named", () => {
  const folders = skillFolders(path.join(REPO, KIT_SKILLS));
  const quick = loadWorkflows(path.join(HOLDER, 'quick'), { repo: REPO });
  assert.deepEqual(kitDrift(quick, folders, triggerText(), ['implement']), []);
  const ungiven = shippedEdited('quick', 'implement', (text) => text.replace(', apps/web:ds-theme,', ','));
  assert.deepEqual(kitDrift(ungiven, folders, triggerText(), ['implement']), ['implement: not given apps/web:ds-theme']);
});

test("REFUSED: quick's implement told no more what build's is told, or what makes a build quick, or that declares its plan no more, is named", () => {
  for (const sentence of [...IMPLEMENT_TOLD, ...QUICK_TOLD])
    assert.deepEqual(
      untold(
        'quick',
        shippedEdited('quick', 'implement', (text) => text.replace(across(sentence), '')),
      ),
      [`quick/implement: says "${sentence}"`],
    );
  const schema = path.join('quick', 'implement.schema.json');
  const root = scratch('wf-told-quick-');
  fs.cpSync(HOLDER, root, { recursive: true });
  const declared = JSON.parse(fs.readFileSync(path.join(root, schema), 'utf8')) as Schema;
  const { plan: _plan, ...properties } = declared.properties;
  fs.writeFileSync(
    path.join(root, schema),
    JSON.stringify({ ...declared, properties, required: declared.required.filter((name) => name !== 'plan') }),
  );
  assert.deepEqual(untold('quick', loadWorkflows(path.join(root, 'quick'), { repo: REPO })), ['quick/implement: declares plan']);
  assert.deepEqual(new Set(declared.required), new Set(['plan', 'pages']), 'each is required of the closeout');
});

test("REFUSED: design or review told no more to load change-the-board first, or where ds-spec's reader runs from, is named", () => {
  for (const step of ['design', 'review'])
    for (const sentence of KIT_READER_TOLD)
      assert.deepEqual(
        untold(
          'build',
          shippedEdited('build', step, (text) => text.replace(across(sentence), '')),
        ),
        [`build/${step}: says "${sentence}"`],
      );
});

test("REFUSED: design, implement or review told of the look's parts no more is named", () => {
  for (const step of ['design', 'implement', 'review'])
    for (const sentence of LOOK_PARTS_TOLD)
      assert.deepEqual(
        untold(
          'build',
          shippedEdited('build', step, (text) => text.replace(across(sentence), '')),
        ),
        [`build/${step}: says "${sentence}"`],
      );
  assert.match(fs.readFileSync(path.join(REPO, TRIGGER), 'utf8'), /`apps\/web\/src\/components\/look`,\s+taken\s+through\s+its\s+door/);
});

test("the shipped review declares no closeout of its own: Agora's schema gives `findings` and `again`, each field with one owner", () => {
  const review = buildSteps().find((s) => s.name === 'review')!;
  assert.deepEqual(outputFields(review), ['findings', 'again']);
  assert.deepEqual(Object.fromEntries(Object.entries(review.output!.owners!).map(([field, o]) => [field, `${o.by} ${o.name} ${o.file}`])), {
    findings: 'agent agora review.schema.json',
    again: 'agent agora review.schema.json',
  });
  assert.equal(review.loop, 'implement');
  for (const step of ['implement', 'review'])
    assert.equal(
      fs.existsSync(path.join(HOLDER, 'build', `${step}.schema.json`)),
      false,
      `build's ${step} declares no closeout of its own, so no schema sits beside it`,
    );
});
