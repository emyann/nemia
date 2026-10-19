/**
 * A skill named with its folder (`app:y`), at `nemia start` and at the folder's check (`loadWorkflows`): a step's line or its agent's
 * names it, the run reads it from that folder of the repository and freezes its files under its bare name, the name the prompt gives
 * and a session lists, while the record, the versions and the settings say it as the line writes it. Refused by name, with no run left:
 * a folder that holds no such skill, a read with no repository, and two skills of one bare name in one step — which two steps of one
 * run are each given. The reader's rule is held beside its code (`src/skills/read.store.test.ts`). The shipped build folder gives
 * the design system kit's three skills to its design, implement and review this way: loaded and started at shipped defaults on a copy
 * of the checkout's skills (`checkoutCopy`), and refused by name once a kit skill's folder is renamed. `WF_ROOT` is set before the
 * modules are imported, since they read it as they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { REPO, teamCopy } from './team.ts';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runGiven } from './placed.ts';

const ROOT = scratch('wf-skill-folders-');
process.env.WF_ROOT = ROOT;
const { startRun } = await import('../src/runner.ts');
const { loadWorkflows } = await import('../src/folder/folder.store.ts');
const { workflowVersion } = await import('../src/folder/version.store.ts');
const { skillVersion } = await import('../src/skills/read.store.ts');
const { agentFilesDir, renderedSkillVersions } = await import('../src/agents/agents.store.ts');
const { renderedFlags } = await import('../src/agents/agents.ts');
const { readRun } = await import('../src/record/record.store.ts');
const stand = eachTest(testPlace);
const runPlaced = runGiven(() => stand().layer);

/** A SKILL.md named `name` whose body is `body`. */
const skill = (name: string, body = 'Do it.'): string => `---\nname: ${name}\ndescription: Do the thing.\n---\n${body}\n`;
const RUNS = path.join(ROOT, 'runs');

/** The runs the store holds, by what their folder lists. */
const runsNow = (): string[] => (fs.existsSync(RUNS) ? fs.readdirSync(RUNS).sort() : []);

/** The skill `name` of the folder `folder` of `repo`, where a session there finds it. */
const nested = (repo: string, folder: string, name: string): string => path.join(repo, folder, '.claude', 'skills', name);

/** A repository the stand-in knows, holding the nested skill `app:y`, with `notes.md` beside its SKILL.md. */
function repository(): string {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  fs.mkdirSync(nested(repo, 'app', 'y'), { recursive: true });
  fs.writeFileSync(path.join(nested(repo, 'app', 'y'), 'SKILL.md'), skill('y'));
  fs.writeFileSync(path.join(nested(repo, 'app', 'y'), 'notes.md'), 'Notes.\n');
  stand().world.repository(repo, {});
  return repo;
}

/** The tests' team, copied, its step `implement` given `line` by its own `skills:` line: the workflow's folder. */
function byStep(line = 'app:y'): string {
  const root = teamCopy('wf-skill-folders-team-');
  fs.writeFileSync(path.join(root, 'dev', 'implement.md'), `---\nplace: git\nagent: implementer\nskills: ${line}\n---\n`);
  return path.join(root, 'dev');
}

/** The tests' team, copied, its agent `implementer` given `line` after its own skill: the workflow's folder. */
function byAgent(line = 'app:y'): string {
  const root = teamCopy('wf-skill-folders-team-');
  const file = path.join(root, 'agents', 'implementer.md');
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.includes('skills: implement-a-change\n'), text);
  fs.writeFileSync(file, text.replace('skills: implement-a-change\n', `skills: implement-a-change, ${line}\n`));
  return path.join(root, 'dev');
}

/** The folder of skills the run froze for its step `step`, whose agent is `agent`. */
const frozen = (run: { id: string }, step = 'implement', agent = 'implementer'): string =>
  path.join(agentFilesDir(run, step), `nemia-${agent}`, 'skills');

/** The files of `dir`, by name, each with its text. */
const filesOf = (dir: string): Record<string, string> =>
  Object.fromEntries(
    fs
      .readdirSync(dir)
      .sort()
      .map((name) => [name, fs.readFileSync(path.join(dir, name), 'utf8')]),
  );

/** The refusal `fn` throws, by its message. */
function refusal(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    return (err as Error).message;
  }
  return assert.fail('not refused');
}

/** The refusal the program `ran` is rejected with, by its message. */
async function rejection(ran: () => Promise<unknown>): Promise<string> {
  try {
    await ran();
  } catch (err) {
    return (err as Error).message;
  }
  return assert.fail('not refused');
}

for (const [by, workflow] of [
  ["a step's `skills:`", byStep],
  ["its agent's `skills:`", byAgent],
] as const) {
  test(`a start gives a skill named with its folder by ${by}: frozen as files under its bare name, recorded as the line writes it`, async () => {
    const repo = repository();
    const run = await runPlaced(startRun({ brief: 'use a nested skill', repo, workflowDir: workflow() }));
    assert.deepEqual(filesOf(path.join(frozen(run), 'y')), { 'SKILL.md': skill('y'), 'notes.md': 'Notes.\n' });
    assert.deepEqual(fs.readdirSync(frozen(run)).sort(), ['implement-a-change', 'y'], 'no folder named for the line');
    const step = (readRun(run.id).workflow ?? []).find((s) => s.name === 'implement')!;
    assert.deepEqual(step.agent?.skills, ['implement-a-change', 'app:y']);
    assert.equal(renderedSkillVersions(run, step).get('app:y'), skillVersion(nested(repo, 'app', 'y')));
    assert.equal(renderedSkillVersions(run, step).has('y'), false);
    const prompt = fs.readFileSync(path.join(agentFilesDir(run, 'implement'), 'prompt.md'), 'utf8');
    assert.ok(prompt.includes('`nemia-implementer:implement-a-change`, `nemia-implementer:y`.'), prompt);
    assert.ok(!prompt.includes('app:y'), prompt);
    assert.equal(
      renderedFlags(step, agentFilesDir(run, 'implement'))?.settings,
      JSON.stringify({ skillOverrides: { 'implement-a-change': 'off', y: 'off', 'app:y': 'off' } }),
      'the bare name and the name of the nested folder are both hidden: the frozen copy is the one `y` the session sees',
    );
  });
}

test('REFUSED at a start and at the folder’s check: a folder that holds no such skill, by name, and no run is left', async () => {
  const repo = repository();
  const workflowDir = byStep('app:nope');
  const before = runsNow();
  const at = nested(repo, 'app', 'nope');
  const said =
    'implement: `skills: app:nope` adds the skill `app:nope`, which cannot be used — `app:nope` is the skill `nope` of the ' +
    `repository's folder \`app\`, and ${at} holds no SKILL.md. A skill is a folder holding a SKILL.md: write ${path.join(at, 'SKILL.md')}, ` +
    'or take `app:nope` off the `skills:` line.';
  assert.equal(await rejection(() => runPlaced(startRun({ brief: 'x', repo, workflowDir }))), said);
  assert.deepEqual(runsNow(), before);
  assert.equal(
    refusal(() => loadWorkflows(workflowDir, { repo })),
    said,
  );
  const agents = refusal(() => loadWorkflows(byAgent('app:nope'), { repo }));
  assert.ok(agents.startsWith('implement: `agent: implementer` gives the skill `app:nope`, which cannot be used — `app:nope` is'), agents);
});

test('REFUSED: a skill named with its folder read with no repository, in words that say none is read', () => {
  const said = refusal(() => loadWorkflows(byStep()));
  assert.ok(said.startsWith('implement: `skills: app:y` adds the skill `app:y`, which cannot be used — `app:y` is the skill `y`'), said);
  assert.ok(said.includes('this is read with no repository'), said);
  assert.ok(said.includes('Start the run on that repository, or take `app:y` off the `skills:` line.'), said);
});

test('two steps of one run are each given their skill of one bare name, the root’s and a nested folder’s', async () => {
  const repo = repository();
  fs.mkdirSync(nested(repo, 'app', 'x'), { recursive: true });
  fs.writeFileSync(path.join(nested(repo, 'app', 'x'), 'SKILL.md'), skill('x', 'The nested one.'));
  fs.mkdirSync(path.join(repo, '.claude', 'skills', 'x'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.claude', 'skills', 'x', 'SKILL.md'), skill('x', 'The root one.'));
  const workflowDir = byStep('app:x');
  const review = fs.readFileSync(path.join(workflowDir, 'review.md'), 'utf8');
  fs.writeFileSync(path.join(workflowDir, 'review.md'), review.replace('agent: reviewer\n', 'agent: reviewer\nskills: x\n'));
  const run = await runPlaced(startRun({ brief: 'one name, two steps', repo, workflowDir }));
  assert.equal(fs.readFileSync(path.join(frozen(run), 'x', 'SKILL.md'), 'utf8'), skill('x', 'The nested one.'));
  assert.equal(fs.readFileSync(path.join(frozen(run, 'review', 'reviewer'), 'x', 'SKILL.md'), 'utf8'), skill('x', 'The root one.'));
});

test('REFUSED at a start: two skills of one bare name in one step, the agent’s and the step’s, naming both, and no run is left', async () => {
  const repo = repository();
  fs.mkdirSync(path.join(repo, '.claude', 'skills', 'implement-a-change'), { recursive: true });
  fs.mkdirSync(nested(repo, 'app', 'implement-a-change'), { recursive: true });
  fs.writeFileSync(path.join(nested(repo, 'app', 'implement-a-change'), 'SKILL.md'), skill('implement-a-change'));
  const workflowDir = byStep('app:implement-a-change');
  const before = runsNow();
  const said =
    "implement: its session would be given `implement-a-change`, on agents/implementer.md's `skills:`, and `app:implement-a-change`, on " +
    "this step's `skills:`: two skills named `implement-a-change`. A session loads a skill by its bare name, so one step holds one " +
    'skill of a name. Keep one of them here, and give the other to another step.';
  assert.equal(await rejection(() => runPlaced(startRun({ brief: 'x', repo, workflowDir }))), said);
  assert.deepEqual(runsNow(), before);
});

test('a folder’s version moves with a skill named with its folder, of one segment or two, and with a bare one on the same line', () => {
  const repo = repository();
  for (const at of [nested(repo, 'apps/web', 'z'), path.join(repo, '.claude', 'skills', 'x')]) {
    fs.mkdirSync(at, { recursive: true });
    fs.writeFileSync(path.join(at, 'SKILL.md'), skill(path.basename(at)));
  }
  for (const [line, edited] of [
    ['app:y', nested(repo, 'app', 'y')],
    ['x, apps/web:z', nested(repo, 'apps/web', 'z')],
    ['x, apps/web:z', path.join(repo, '.claude', 'skills', 'x')],
  ] as const) {
    const workflowDir = byStep(line);
    const before = workflowVersion(workflowDir, { repo });
    assert.equal(workflowVersion(workflowDir, { repo }), before);
    fs.appendFileSync(path.join(edited, 'SKILL.md'), 'Edited.\n');
    assert.notEqual(workflowVersion(workflowDir, { repo }), before, `skills: ${line}, after an edit of ${edited}`);
  }
});

/** The shipped build workflow's folder, and the steps of it that are given the kit's skills, each with its agent. */
const BUILD = path.join(REPO, 'workflows', 'build');
const KIT_STEPS = [
  ['design', 'seldon'],
  ['implement', 'ada'],
  ['review', 'agora'],
] as const;

/** The kit's skills as the three steps' lines write them, in the lines' order. */
const KIT_GIVEN = ['apps/web:ds-build', 'apps/web:ds-theme', 'apps/web:ds-spec'];

/**
 * A repository the stand-in knows, holding a copy of the checkout's own skills and of the board's nested ones, each link followed, and
 * of the checkout's own settings, which grant a step's session the calls the shipped agents are given (`unallowedRefusal`).
 */
function checkoutCopy(): string {
  const repo = fs.mkdtempSync(path.join(ROOT, 'checkout-'));
  for (const folder of ['.', 'apps/web'])
    fs.cpSync(path.join(REPO, folder, '.claude', 'skills'), path.join(repo, folder, '.claude', 'skills'), {
      recursive: true,
      dereference: true,
    });
  fs.cpSync(path.join(REPO, '.claude', 'settings.json'), path.join(repo, '.claude', 'settings.json'));
  stand().world.repository(repo, {});
  return repo;
}

test('the shipped build folder gives the kit’s three skills to design, implement and review, and a start freezes each with its files', async () => {
  const loaded = loadWorkflows(BUILD, { repo: REPO });
  for (const [name] of KIT_STEPS)
    assert.deepEqual(
      (loaded.find((step) => step.name === name)?.agent?.skills ?? []).filter((skill) => skill.includes(':')),
      KIT_GIVEN,
      name,
    );
  const repo = checkoutCopy();
  const run = await runPlaced(startRun({ brief: 'change the board', repo, workflowDir: BUILD }));
  for (const [name, agent] of KIT_STEPS) {
    const step = (readRun(run.id).workflow ?? []).find((s) => s.name === name)!;
    assert.deepEqual(
      (step.agent?.skills ?? []).filter((skill) => skill.includes(':')),
      KIT_GIVEN,
      `${name}, on the record`,
    );
    for (const given of KIT_GIVEN) {
      const bare = given.slice('apps/web:'.length);
      assert.deepEqual(filesOf(path.join(frozen(run, name, agent), bare)), filesOf(nested(REPO, 'apps/web', bare)), `${name}: ${bare}`);
    }
    assert.ok(Object.keys(filesOf(path.join(frozen(run, name, agent), 'ds-spec'))).includes('md3.mjs'), `${name}: the reader's script`);
    assert.ok(Object.keys(filesOf(path.join(frozen(run, name, agent), 'ds-theme'))).includes('design-md.md'), `${name}: ds-theme's file`);
    const prompt = fs.readFileSync(path.join(agentFilesDir(run, name), 'prompt.md'), 'utf8');
    for (const bare of ['ds-build', 'ds-theme', 'ds-spec']) assert.ok(prompt.includes(`\`nemia-${agent}:${bare}\``), prompt);
    assert.ok(!prompt.includes('apps/web:ds-'), prompt);
  }
});

test('REFUSED at a start and at the check of the shipped build folder: a kit skill’s folder renamed, by the name its line gives, and no run is left', async () => {
  const repo = checkoutCopy();
  fs.renameSync(nested(repo, 'apps/web', 'ds-build'), nested(repo, 'apps/web', 'ds-built'));
  const before = runsNow();
  const said = refusal(() => loadWorkflows(BUILD, { repo }));
  assert.ok(said.includes('adds the skill `apps/web:ds-build`, which cannot be used'), said);
  assert.ok(said.includes("`apps/web:ds-build` is the skill `ds-build` of the repository's folder `apps/web`"), said);
  assert.ok(said.includes(`${nested(repo, 'apps/web', 'ds-build')} holds no SKILL.md`), said);
  assert.equal(await rejection(() => runPlaced(startRun({ brief: 'change the board', repo, workflowDir: BUILD }))), said);
  assert.deepEqual(runsNow(), before);
});
