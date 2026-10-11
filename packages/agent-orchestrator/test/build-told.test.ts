/**
 * What this repository's own steps are told and fenced by, now that its agents and their skills say nothing of it
 * (`team-portable.test.ts`): each line taken out of an agent or a skill is said by the step that needs it (`TOLD`) — in its note, as a
 * skill it adds to its agent's, as a deny of its own, or as a field its own `output:` declares. `untold` reads each step as `nemia start`
 * freezes it, and is first made to refuse a copy of the shipped team with one of each taken away.
 *
 * The build workflow's review declares its own closeout, the reviewer's and the mutants it judged: `schemaDrift` holds the copy to the
 * agent's schema, field for field.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { loadWorkflows } from '../src/folder/folder.store.ts';
import { outputFields } from '../src/step/step.ts';
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

const TOLD: Told[] = [
  {
    workflow: 'build',
    step: 'design',
    says: [
      SHADCN_READ,
      'The checks you may run here, each bare: `npx turbo run test --force --continue`, `npm run typecheck`, `npm run lint`.',
      "the owner's line for a run, which this factory's rules give",
    ],
    adds: ['shadcn'],
    denies: ['Bash(cd:*)', ...NO_BUILD],
    declares: [],
  },
  {
    workflow: 'build',
    step: 'implement',
    says: [
      "load `shadcn` for the board's components",
      '**Name your mutants** in the closeout: one per rule or guard the change adds',
      'Try them first: `node workflows/build/mutants.ts <closeout.json>` after you commit.',
      'saying why in `noMutants`',
      'When the change touches `tools/observe`',
      '`node tools/observe/render/render.ts --out <your files directory>` starts a throwaway stack from this workspace',
      'the check refuses a changed dashboard whose picture and',
    ],
    adds: ['shadcn', 'look', 'see-a-dashboard'],
    denies: [],
    declares: ['mutants', 'noMutants'],
  },
  {
    workflow: 'build',
    step: 'review',
    says: [
      SHADCN_READ,
      "Implement's check ran the whole test suite on this round's tree, forced",
      'Run the typecheck and the lint yourself, each bare and one command per call: `npx turbo run typecheck --force`, `npm run lint`.',
      "Run a package's tests, `npx turbo run test --force --continue --filter=<package>`, only where a finding needs a run to stand on.",
      '**Judge the mutants, do not run them**',
      "Quote each `wf mutants:` line you judged in your closeout's `mutants`.",
      'Never build or run the e2e',
      "When the change touches `tools/observe`, read each dashboard's picture and text the implement step named in its `artifacts`",
      'You do not render one yourself: your fence refuses the command and Docker.',
    ],
    adds: ['shadcn', 'look', 'see-a-dashboard'],
    denies: ['Bash(cd:*)', ...NO_BUILD, ...WHOLE_SUITE],
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
