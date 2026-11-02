/**
 * The shipped build folder gives the design system kit's three skills, each named with its folder (`apps/web:ds-build`), to its
 * design, implement and review: loaded and started at shipped defaults on a copy of the checkout's skills (`checkoutCopy`), each frozen
 * with its files under its bare name, and refused by name once a kit skill's folder is renamed, with no run left. A skill named with its
 * folder at a start, of any folder, is told in the story of `step-skills.test.ts`; the reader's rule beside its code
 * (`src/skills/read.store.test.ts`). `WF_ROOT` is set before the modules are imported, since they read it as they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { REPO } from './team.ts';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runGiven } from './placed.ts';

const ROOT = scratch('wf-skill-folders-');
process.env.WF_ROOT = ROOT;
const { startRun } = await import('../src/runner.ts');
const { loadWorkflows } = await import('../src/folder/folder.store.ts');
const { agentFilesDir } = await import('../src/agents/agents.store.ts');
const { readRun } = await import('../src/record/record.store.ts');
const stand = eachTest(testPlace);
const runPlaced = runGiven(() => stand().layer);

const RUNS = path.join(ROOT, 'runs');

/** The runs the store holds, by what their folder lists. */
const runsNow = (): string[] => (fs.existsSync(RUNS) ? fs.readdirSync(RUNS).sort() : []);

/** The skill `name` of the folder `folder` of `repo`, where a session there finds it. */
const nested = (repo: string, folder: string, name: string): string => path.join(repo, folder, '.claude', 'skills', name);
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

/** The shipped build workflow's folder, and the steps of it that are given the kit's skills, each with its agent. */
const BUILD = path.join(REPO, 'workflows', 'build');
const KIT_STEPS = [
  ['design', 'seldon'],
  ['implement', 'grace'],
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
