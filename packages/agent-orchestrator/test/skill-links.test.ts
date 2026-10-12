/**
 * A skill that is a link, at `nemia start` and at the folder's check (`loadWorkflows`): one of the repository's `.claude/skills/` linked
 * inside the checkout is given, and the run freezes its files, never the link; one linked outside, one holding a link out, and any link
 * of the store's library are refused by name, with no run left in the store. The rule itself is held beside its code
 * (`src/skills/read.store.test.ts`). `WF_ROOT` is set before the modules are imported, since they read it as they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { teamCopy } from './team.ts';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runGiven } from './placed.ts';

const ROOT = scratch('wf-skill-links-start-');
process.env.WF_ROOT = ROOT;
const { startRun } = await import('../src/runner.ts');
const { loadWorkflows } = await import('../src/folder/folder.store.ts');
const { skillsFor, skillVersion } = await import('../src/skills/read.store.ts');
const { agentFilesDir, renderedSkillVersions, writeAgentFiles } = await import('../src/agents/agents.store.ts');
const { readRun } = await import('../src/record/record.store.ts');
const stand = eachTest(testPlace);
const runPlaced = runGiven(() => stand().layer);

const SKILL = '---\nname: x\ndescription: Do the thing.\n---\nDo it.\n';
const LEAVES = ' is a link, and what it points at is outside the folder of skills: make it a folder of its own.';
const RUNS = path.join(ROOT, 'runs');

/** The runs the store holds, by what their folder lists. */
const runsNow = (): string[] => (fs.existsSync(RUNS) ? fs.readdirSync(RUNS).sort() : []);

/** A repository the stand-in knows, holding the real skill `skills/x` and an empty `.claude/skills/`. */
function repository(): string {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  fs.mkdirSync(path.join(repo, 'skills', 'x'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'skills', 'x', 'SKILL.md'), SKILL);
  fs.writeFileSync(path.join(repo, 'skills', 'x', 'notes.md'), 'Notes.\n');
  fs.mkdirSync(path.join(repo, '.claude', 'skills'), { recursive: true });
  stand().world.repository(repo, {});
  return repo;
}

/** The repository's given skill `x`, where a link is put. */
const given = (repo: string): string => path.join(repo, '.claude', 'skills', 'x');

/** The tests' team, copied, its step `implement` given the skill `x` by its own `skills:` line: the workflow's folder. */
function byStep(): string {
  const root = teamCopy('wf-skill-links-team-');
  fs.writeFileSync(path.join(root, 'dev', 'implement.md'), '---\nplace: git\nagent: implementer\nskills: x\n---\n');
  return path.join(root, 'dev');
}

/** The tests' team, copied, its agent `implementer` given the skill `x` by its own `skills:` line: the workflow's folder. */
function byAgent(): string {
  const root = teamCopy('wf-skill-links-team-');
  const file = path.join(root, 'agents', 'implementer.md');
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.includes('skills: implement-a-change\n'), text);
  fs.writeFileSync(file, text.replace('skills: implement-a-change\n', 'skills: implement-a-change, x\n'));
  return path.join(root, 'dev');
}

/** The folder the run froze the skill `x` into for its step `implement`. */
function frozen(run: { id: string }): string {
  const at = agentFilesDir(run, 'implement');
  const plugin = fs.readdirSync(at).find((entry) => fs.statSync(path.join(at, entry)).isDirectory())!;
  return path.join(at, plugin, 'skills', 'x');
}

/** Every entry under `dir`, by its path in it, as what it is: `link`, `folder` or a file's text. */
const entriesOf = (dir: string): Record<string, string> =>
  Object.fromEntries(
    (fs.readdirSync(dir, { recursive: true }) as string[]).sort().map((entry) => {
      const stat = fs.lstatSync(path.join(dir, entry));
      return [entry, stat.isSymbolicLink() ? 'link' : stat.isDirectory() ? 'folder' : fs.readFileSync(path.join(dir, entry), 'utf8')];
    }),
  );

for (const [by, workflow] of [
  ["a step's `skills:`", byStep],
  ["its agent's `skills:`", byAgent],
] as const) {
  test(`a start is given a skill linked inside the checkout by ${by}, and the run freezes its files, not the link`, async () => {
    const repo = repository();
    fs.symlinkSync('../../skills/x', given(repo));
    const run = await runPlaced(startRun({ brief: 'use a linked skill', repo, workflowDir: workflow() }));
    assert.equal(fs.lstatSync(frozen(run)).isDirectory(), true, 'a folder of its own');
    assert.deepEqual(entriesOf(frozen(run)), { 'SKILL.md': SKILL, 'notes.md': 'Notes.\n' });
    const step = (readRun(run.id).workflow ?? []).find((s) => s.name === 'implement')!;
    assert.equal(renderedSkillVersions(run, step).get('x'), skillVersion(given(repo)));
  });
}

test('REFUSED at a start and at the folder’s check: a skill linked outside the checkout, by name, and no run is left', async () => {
  const repo = repository();
  const outside = scratch('wf-skill-links-outside-');
  fs.writeFileSync(path.join(outside, 'SKILL.md'), SKILL);
  fs.symlinkSync(outside, given(repo));
  const workflowDir = byStep();
  const before = runsNow();
  const said = `implement: \`skills: x\` adds the skill \`x\`, which cannot be used — x${LEAVES}`;
  await assert.rejects(
    async () => await runPlaced(startRun({ brief: 'x', repo, workflowDir })),
    (err: Error) => err.message === said,
  );
  assert.deepEqual(runsNow(), before);
  assert.throws(
    () => loadWorkflows(workflowDir, { repo }),
    (err: Error) => err.message === said,
  );
});

test('REFUSED at a start and at the folder’s check: a skill linked inside that holds a link out, by name, and no run is left', async () => {
  const repo = repository();
  const outside = scratch('wf-skill-links-outside-');
  fs.writeFileSync(path.join(outside, 'secret.md'), 'Not the skill.\n');
  fs.symlinkSync(path.join(outside, 'secret.md'), path.join(repo, 'skills', 'x', 'far.md'));
  fs.symlinkSync('../../skills/x', given(repo));
  const workflowDir = byAgent();
  const before = runsNow();
  const ends = `which cannot be used — x/far.md${LEAVES}`;
  await assert.rejects(
    async () => await runPlaced(startRun({ brief: 'x', repo, workflowDir })),
    (err: Error) => err.message.endsWith(ends),
  );
  assert.deepEqual(runsNow(), before);
  assert.throws(
    () => loadWorkflows(workflowDir, { repo }),
    (err: Error) => err.message.endsWith(ends),
  );
});

test("REFUSED at a start: a skill of the store's library that is a link, even one that points inside the repository", async () => {
  const repo = repository();
  const library = path.join(ROOT, 'workflows', 'skills');
  fs.mkdirSync(library, { recursive: true });
  fs.symlinkSync(path.join(repo, 'skills', 'x'), path.join(library, 'x'));
  try {
    const before = runsNow();
    await assert.rejects(
      async () => await runPlaced(startRun({ brief: 'x', repo, workflowDir: byStep() })),
      (err: Error) => err.message === `implement: \`skills: x\` adds the skill \`x\`, which cannot be used — x${LEAVES}`,
    );
    assert.deepEqual(runsNow(), before);
  } finally {
    fs.rmSync(path.join(library, 'x'));
  }
});

test('REFUSED: the freeze of a skill linked outside the checkout, whatever the load found, and nothing of it is frozen', () => {
  const repo = repository();
  const outside = scratch('wf-skill-links-outside-');
  fs.writeFileSync(path.join(outside, 'SKILL.md'), SKILL);
  fs.symlinkSync(outside, given(repo));
  const workflowDir = byStep();
  fs.writeFileSync(path.join(workflowDir, 'implement.md'), '---\nplace: git\nagent: implementer\n---\n');
  const steps = loadWorkflows(workflowDir, { repo }).map((step) =>
    step.name === 'implement' ? { ...step, agent: { ...step.agent!, skills: ['x'] } } : step,
  );
  const found = { ...skillsFor(workflowDir, { repo }), at: new Map([['x', given(repo)]]) };
  const run = { id: 'skill-links-freeze' };
  assert.throws(
    () => writeAgentFiles(run, steps, found),
    (err: Error) => err.message === `x${LEAVES}`,
  );
  assert.deepEqual(
    (fs.readdirSync(agentFilesDir(run, 'implement'), { recursive: true }) as string[]).filter(
      (entry) => path.basename(entry) === 'SKILL.md',
    ),
    [],
  );
});
