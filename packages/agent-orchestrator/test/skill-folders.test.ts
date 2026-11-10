/**
 * A skill named with its folder (`apps/x:kit-build`) on a team's agents is found in that folder of the repository, frozen with its files
 * under its bare name, told by that name, and refused by name once its folder is renamed, with no run left: on a copy of the tests' team
 * (`teamCopy`) whose implementer and reviewer each add two skills of the repository's nested folder `apps/x`, as a board's kit does. A
 * skill named with its folder at a start, of any folder, is told in the story of `step-skills.test.ts`; the reader's rule beside its code
 * (`src/skills/read.store.test.ts`). `WF_ROOT` is set before the modules are imported, since they read it as they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { teamCopy } from './team.ts';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runGiven } from './placed.ts';
import { rootNow } from './config-given.ts';

const ROOT = scratch('wf-skill-folders-');
process.env.WF_ROOT = ROOT;
const { startRun } = await import('../src/runner.ts');
const { loadWorkflows } = await import('../src/workflows/workflows.store.ts');
const { agentFilesDir } = await import('../src/agents/agents.store.ts');
const { runRecord } = await import('../src/record/record.store.ts');
const stand = eachTest(testPlace);
const runPlaced = runGiven(() => stand().layer);

const RUNS = path.join(ROOT, 'runs');

/** The runs the store holds, by what their folder lists. */
const runsNow = (): string[] => (fs.existsSync(RUNS) ? fs.readdirSync(RUNS).sort() : []);

/** The skill `name` of the folder `folder` of `repo`, where a session there finds it. */
const nested = (repo: string, folder: string, name: string): string => path.join(repo, folder, '.claude', 'skills', name);
/** The folder of skills the run froze for its step `step`, whose agent is `agent`. */
const frozen = (run: { id: string }, step = 'implement', agent = 'implementer'): string =>
  path.join(agentFilesDir(rootNow(), run, step), `nemia-${agent}`, 'skills');

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

/** The steps of the team's `dev` given the nested folder's skills, each with its agent. */
const KIT_STEPS = [
  ['implement', 'implementer'],
  ['review', 'reviewer'],
] as const;

/** The nested folder's skills as the agents' lines write them, in the lines' order. */
const KIT_GIVEN = ['apps/x:kit-build', 'apps/x:kit-spec'];

/** A copy of the tests' team whose implementer and reviewer each add `KIT_GIVEN` to their own skills: its `dev` folder. */
function kitTeam(): string {
  const team = teamCopy('wf-skill-folders-team-');
  for (const [file, line] of [
    ['implementer.md', 'skills: implement-a-change\n'],
    ['reviewer.md', 'skills: review-a-change, ask-for-another-round\n'],
  ] as const) {
    const agent = path.join(team, 'agents', file);
    const text = fs.readFileSync(agent, 'utf8');
    assert.ok(text.includes(line), `${file} holds ${line}`);
    fs.writeFileSync(agent, text.replace(line, `${line.trimEnd()}, ${KIT_GIVEN.join(', ')}\n`));
  }
  return path.join(team, 'dev');
}

/** A repository the stand-in knows, holding the two skills of its nested folder `apps/x`, one with a script and a file beside it. */
function kitRepo(): string {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  for (const name of ['kit-build', 'kit-spec']) {
    fs.mkdirSync(nested(repo, 'apps/x', name), { recursive: true });
    fs.writeFileSync(
      path.join(nested(repo, 'apps/x', name), 'SKILL.md'),
      `---\nname: ${name}\ndescription: The kit's ${name}.\n---\nUse the kit.\n`,
    );
  }
  fs.writeFileSync(path.join(nested(repo, 'apps/x', 'kit-spec'), 'reader.mjs'), 'export const read = 1;\n');
  fs.writeFileSync(path.join(nested(repo, 'apps/x', 'kit-spec'), 'notes.md'), 'What the reader reads.\n');
  stand().world.repository(repo, {});
  return repo;
}

test('a skill named with its folder is given to each agent that adds it, and a start freezes it with its files under its bare name', async () => {
  const dev = kitTeam();
  const repo = kitRepo();
  const loaded = loadWorkflows(dev, { repo });
  for (const [name] of KIT_STEPS)
    assert.deepEqual(
      (loaded.find((step) => step.name === name)?.agent?.skills ?? []).filter((skill) => skill.includes(':')),
      KIT_GIVEN,
      name,
    );
  const run = await runPlaced(startRun({ brief: 'change the board', repo, workflowDir: dev }));
  for (const [name, agent] of KIT_STEPS) {
    const step = (runRecord(rootNow(), run.id).workflow ?? []).find((s) => s.name === name)!;
    assert.deepEqual(
      (step.agent?.skills ?? []).filter((skill) => skill.includes(':')),
      KIT_GIVEN,
      `${name}, on the record`,
    );
    for (const given of KIT_GIVEN) {
      const bare = given.slice('apps/x:'.length);
      assert.deepEqual(filesOf(path.join(frozen(run, name, agent), bare)), filesOf(nested(repo, 'apps/x', bare)), `${name}: ${bare}`);
    }
    assert.ok(Object.keys(filesOf(path.join(frozen(run, name, agent), 'kit-spec'))).includes('reader.mjs'), `${name}: the reader's script`);
    const prompt = fs.readFileSync(path.join(agentFilesDir(rootNow(), run, name), 'prompt.md'), 'utf8');
    for (const bare of ['kit-build', 'kit-spec']) assert.ok(prompt.includes(`\`nemia-${agent}:${bare}\``), prompt);
    assert.ok(!prompt.includes('apps/x:kit-'), prompt);
  }
});

test('REFUSED at a start and at the load: a skill named with its folder whose folder is renamed, by the name its line gives, and no run is left', async () => {
  const dev = kitTeam();
  const repo = kitRepo();
  fs.renameSync(nested(repo, 'apps/x', 'kit-build'), nested(repo, 'apps/x', 'kit-built'));
  const before = runsNow();
  const said = refusal(() => loadWorkflows(dev, { repo }));
  assert.ok(said.includes('`apps/x:kit-build`'), said);
  assert.ok(said.includes(nested(repo, 'apps/x', 'kit-build')), said);
  assert.equal(await rejection(() => runPlaced(startRun({ brief: 'change the board', repo, workflowDir: dev }))), said);
  assert.deepEqual(runsNow(), before);
});
