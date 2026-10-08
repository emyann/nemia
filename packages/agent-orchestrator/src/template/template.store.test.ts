/**
 * A template's folder on disk: `nemia template export` of the tests' team into a folder that passes `nemia template check`, what it
 * writes read back as it was written, what it refuses with nothing written, and each problem of a folder at its file and line. `WF_ROOT`
 * is set before the import, since the store's modules read it as they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { scratch } from '../../test/scratch.ts';
import { promised } from '../../test/promised.ts';
import { teamCopy } from '../../test/team.ts';

const ROOT = scratch('wf-template-');
process.env.WF_ROOT = ROOT;
const { checkTemplateAt, exportTemplate, problemLine } = await import('./template.store.ts');
const { addFactory, attachWorkflow, hireAgent } = await import('../runner.ts');
const { main } = await import('../cli/main.ts');
const { instructionOf } = await import('./template.verb.ts');

/** The factory `name`, as `--factory` names it to an export. */
const asked = (name: string) => ({ name, instruction: instructionOf });

/** Refused by kind, exit 2, and the message — never `String(err)`, which starts with `Error: `. */
const refusedWith = (tag: 'Missing' | 'Conflict' | 'Invalid', pattern: RegExp) => (err: Error & { exitCode?: number; _tag?: string }) =>
  err._tag === tag && err.exitCode === 2 && pattern.test(err.message);

/** A repository holding the tests' team as its `workflows/`: `dev`, its agents and skills. */
function repoWithTeam(): string {
  const repo = scratch('wf-template-repo-');
  fs.renameSync(teamCopy(), path.join(repo, 'workflows'));
  return repo;
}

/** A folder to export into, not there yet. */
const target = (name = 'team'): string => path.join(scratch('wf-template-out-'), name);

/** The document at `file` of the folder `dir`, read back. */
const readBack = (dir: string, file: string): Record<string, unknown> => parse(fs.readFileSync(path.join(dir, file), 'utf8'));

/** The steps of the workflow `name` exported to `dir`, by name. */
const stepsOf = (dir: string, name: string): Map<string, Record<string, unknown>> => {
  const spec = readBack(dir, `workflows/${name}/workflow.yaml`).spec as { steps: Array<Record<string, unknown>> };
  return new Map(spec.steps.map((step) => [step.name as string, step]));
};

test("the tests' team exports into a folder that passes its check, each part said with where it came from, a place skill left out", () => {
  const repo = repoWithTeam();
  const reviewer = path.join(repo, 'workflows', 'agents', 'reviewer.md');
  fs.writeFileSync(reviewer, fs.readFileSync(reviewer, 'utf8').replace('skills: review-a-change,', 'skills: git, review-a-change,'));
  const dir = target();
  const { from } = exportTemplate({ dir, from: repo });
  assert.deepEqual(checkTemplateAt(dir), []);
  const said = new Map(from.map(({ part, from: at }) => [part, at]));
  assert.equal(said.get('workflows/dev/'), path.join(repo, 'workflows', 'dev'));
  assert.equal(said.get('agents/reviewer/'), reviewer);
  assert.equal(said.get('skills/review-a-change/'), path.join(repo, 'workflows', 'skills', 'review-a-change'));
  assert.equal(said.get('nemia.yaml hires dev/review: reviewer'), `${path.join(repo, 'workflows', 'dev', 'review.md')}, its agent: line`);
  assert.match(said.get('skills/git/') ?? '', /left out: a place skill nemia ships/);
  assert.equal(fs.existsSync(path.join(dir, 'skills', 'git')), false, 'a place skill nemia ships is not carried');
  assert.deepEqual(readBack(dir, 'nemia.yaml').spec, {
    version: '0.1.0',
    hires: { 'dev/implement': 'implementer', 'dev/review': 'reviewer', 'dev/ship': 'shipper' },
  });
  const agent = readBack(dir, 'agents/reviewer/agent.yaml').spec as Record<string, Record<string, unknown>>;
  assert.deepEqual(agent.claude, {
    model: 'opus',
    effort: 'high',
    context: '200k',
    fence: { permissionMode: 'dontAsk', tools: ['Read', 'Grep', 'Glob', 'Bash', 'Skill'] },
  });
  assert.deepEqual(agent.output, { path: 'agents/reviewer/output.schema.json' });
  assert.equal(
    fs.readFileSync(path.join(dir, 'agents/reviewer/output.schema.json'), 'utf8'),
    fs.readFileSync(path.join(repo, 'workflows/agents/review.schema.json'), 'utf8'),
  );
});

test('what export writes reads back as it was written, a long line whole, and a step with no fence of its own writes no overrides fence', () => {
  const repo = repoWithTeam();
  const long = `npm test && ${Array.from({ length: 12 }, (_, i) => `node "scripts/check-${i}.ts" --mode: 'strict' # ${i}`).join(' && ')}`;
  const ship = path.join(repo, 'workflows', 'dev', 'ship.md');
  fs.writeFileSync(ship, fs.readFileSync(ship, 'utf8').replace(/^check: .*$/m, `check: ${long}`));
  const review = path.join(repo, 'workflows', 'dev', 'review.md');
  fs.writeFileSync(review, fs.readFileSync(review, 'utf8').replace('budget: 20', 'budget: 20\neffort: low\nskills: review-a-change'));
  const dir = target();
  exportTemplate({ dir, from: repo });
  assert.deepEqual(checkTemplateAt(dir), []);
  const steps = stepsOf(dir, 'dev');
  assert.equal(steps.get('ship')?.check, long);
  assert.ok(fs.readFileSync(path.join(dir, 'workflows/dev/workflow.yaml'), 'utf8').includes(`check: "${long.replace(/"/g, '\\"')}"`));
  assert.deepEqual(steps.get('ship'), { name: 'ship', after: ['review'], place: 'git', workspace: 'main', gate: true, check: long });
  assert.equal(steps.get('implement')?.overrides, undefined, 'a step with no harness key of its own writes no overrides');
  assert.deepEqual(steps.get('review')?.overrides, { skills: ['review-a-change'], claude: { effort: 'low' } });
  assert.deepEqual(steps.get('review'), {
    name: 'review',
    after: ['implement'],
    place: 'git',
    budget: 20,
    loop: 'implement',
    rounds: 3,
    overrides: { skills: ['review-a-change'], claude: { effort: 'low' } },
  });
});

test("a workflow's README and its files that are no .md or .yaml are carried with their modes, and so is a skill's", () => {
  const repo = repoWithTeam();
  const script = path.join(repo, 'workflows', 'dev', 'tools', 'gate.sh');
  fs.mkdirSync(path.dirname(script));
  fs.writeFileSync(script, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const helper = path.join(repo, 'workflows', 'skills', 'review-a-change', 'look.sh');
  fs.writeFileSync(helper, '#!/bin/sh\n', { mode: 0o750 });
  const dir = target();
  exportTemplate({ dir, from: repo });
  assert.deepEqual(checkTemplateAt(dir), []);
  assert.equal(fs.statSync(path.join(dir, 'workflows/dev/tools/gate.sh')).mode & 0o777, 0o755);
  assert.equal(fs.statSync(path.join(dir, 'skills/review-a-change/look.sh')).mode & 0o777, 0o750);
  assert.equal(
    fs.readFileSync(path.join(dir, 'workflows/dev/README.md'), 'utf8'),
    fs.readFileSync(path.join(repo, 'workflows/dev/README.md'), 'utf8'),
  );
  assert.equal(readBack(dir, 'workflows/dev/workflow.yaml').metadata !== undefined, true);
});

test('a key a template has no place for is refused by name, and nothing is written', () => {
  const repo = repoWithTeam();
  const review = path.join(repo, 'workflows', 'dev', 'review.md');
  fs.writeFileSync(review, fs.readFileSync(review, 'utf8').replace('budget: 20', 'budget: 20\nbackground: true\nslot: night'));
  const dir = target();
  assert.throws(
    () => exportTemplate({ dir, from: repo }),
    refusedWith('Invalid', /review\.md: `background:` has no place in a template[^]*review\.md: `slot:` has no place/),
  );
  assert.equal(fs.existsSync(dir), false);
  assert.deepEqual(fs.readdirSync(path.dirname(dir)), [], 'no staging folder is left beside it');
});

test('a folder that holds files, or is no name, is refused, and left as it was', () => {
  const repo = repoWithTeam();
  const dir = target();
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'mine.txt'), 'mine');
  assert.throws(() => exportTemplate({ dir, from: repo }), refusedWith('Conflict', /holds files already/));
  assert.deepEqual(fs.readdirSync(dir), ['mine.txt']);
  assert.throws(() => exportTemplate({ dir: target('My_Team'), from: repo }), refusedWith('Invalid', /My_Team is not a name/));
  const empty = target();
  fs.mkdirSync(empty);
  exportTemplate({ dir: empty, from: repo });
  assert.deepEqual(checkTemplateAt(empty), []);
});

/** A repository holding the team and a second workflow, `solo`, whose one step names no agent; and a factory on it attaching `solo`. */
function factoryOnTeam(name: string): string {
  const repo = repoWithTeam();
  fs.mkdirSync(path.join(repo, 'workflows', 'solo'));
  fs.writeFileSync(path.join(repo, 'workflows', 'solo', 'work.md'), '---\nplace: git\n---\nDo the work.\n');
  addFactory({ name, repos: [repo] });
  attachWorkflow({ factory: name, workflow: 'solo' });
  hireAgent({ factory: name, agent: 'implementer', step: 'solo/work' });
  return repo;
}

test("with --factory, the draft holds that factory's attached workflows only, its hires and its instruction", () => {
  const repo = factoryOnTeam('crew');
  fs.writeFileSync(path.join(repo, 'NEMIA.md'), 'Run the crew.\n');
  const dir = target();
  const { from } = exportTemplate({ dir, from: repo, factory: asked('crew') });
  assert.deepEqual(checkTemplateAt(dir), []);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'workflows')), ['solo']);
  assert.deepEqual(readBack(dir, 'nemia.yaml').spec, { version: '0.1.0', hires: { 'solo/work': 'implementer' } });
  assert.equal(fs.readFileSync(path.join(dir, 'NEMIA.md'), 'utf8'), 'Run the crew.\n');
  const said = new Map(from.map(({ part, from: at }) => [part, at]));
  assert.equal(said.get('NEMIA.md'), path.join(repo, 'NEMIA.md'));
  assert.equal(said.get('nemia.yaml hires solo/work: implementer'), `${path.join(ROOT, 'factories', 'crew.json')}, its hire`);
  assert.equal(said.get('agents/reviewer/'), undefined, 'an agent only an unattached workflow names is left out');
});

test('with --factory: a workflow it attaches that the repository lacks, a step hired and filled by its own agent:, and another repository', () => {
  const repo = factoryOnTeam('gaps');
  attachWorkflow({ factory: 'gaps', workflow: 'ghost' });
  const factoryFile = path.join(ROOT, 'factories', 'gaps.json');
  const record = JSON.parse(fs.readFileSync(factoryFile, 'utf8'));
  fs.writeFileSync(
    factoryFile,
    JSON.stringify({ ...record, workflows: [...record.workflows, 'dev'], hires: { ...record.hires, 'dev/review': 'shipper' } }),
  );
  const dir = target();
  assert.throws(
    () => exportTemplate({ dir, from: repo, factory: asked('gaps') }),
    refusedWith(
      'Invalid',
      /the factory gaps attaches ghost, and [^\n]* holds no workflow ghost[^]*`agent: reviewer` fills this step, and the factory gaps hires shipper into it too/,
    ),
  );
  assert.equal(fs.existsSync(dir), false);
  assert.throws(
    () => exportTemplate({ dir, from: repoWithTeam(), factory: asked('gaps') }),
    refusedWith('Invalid', /the factory gaps works on [^]*--from /),
  );
  assert.equal(fs.existsSync(dir), false);
});

test('a problem of a folder stands at its file and line, every one at once, sorted by file then line', () => {
  const dir = target();
  exportTemplate({ dir, from: repoWithTeam() });
  const agent = path.join(dir, 'agents', 'reviewer', 'agent.yaml');
  const lines = fs.readFileSync(agent, 'utf8').split('\n');
  const effort = lines.findIndex((line) => line.trim() === 'effort: high');
  lines[effort] = lines[effort].replace('high', 'extreme');
  fs.writeFileSync(agent, lines.join('\n'));
  fs.writeFileSync(
    path.join(dir, 'skills', 'review-a-change', 'skill.yaml'),
    'apiVersion: nemia.dev/v1alpha1\nkind: Skill\napiVersion: again\n',
  );
  fs.writeFileSync(path.join(dir, 'workflows', 'dev', 'notes.yaml'), 'a: 1\n');
  const problems = checkTemplateAt(dir);
  assert.deepEqual(
    problems.map((p) => [p.file, p.line]),
    [
      ['agents/reviewer/agent.yaml', effort + 1],
      ['skills/review-a-change/skill.yaml', 3],
      ['workflows/dev/notes.yaml', undefined],
    ],
  );
  assert.match(problemLine(problems[0]), new RegExp(`^agents/reviewer/agent\\.yaml:${effort + 1}:\\d+: .*no effort`));
  assert.match(problems[1].message, /does not parse/);
  assert.match(problems[2].message, /outside the template's layout/);
});

test('a link in a folder is refused by name, and so is a file of two documents, at the second', () => {
  const dir = target();
  exportTemplate({ dir, from: repoWithTeam() });
  fs.symlinkSync(path.join(dir, 'nemia.yaml'), path.join(dir, 'workflows', 'dev', 'linked.sh'));
  const workflow = path.join(dir, 'workflows', 'dev', 'workflow.yaml');
  const text = fs.readFileSync(workflow, 'utf8');
  fs.writeFileSync(workflow, `${text}---\nkind: Workflow\n`);
  const problems = checkTemplateAt(dir);
  assert.deepEqual(
    problems.map((p) => [p.file, p.line]),
    [
      ['workflows/dev/linked.sh', undefined],
      ['workflows/dev/workflow.yaml', text.split('\n').length],
    ],
  );
  assert.match(problems[0].message, /is a link/);
  assert.match(problems[1].message, /a second document/);
});

test('nemia template check prints that a folder passes, and refuses one that does not with every problem at its line', async (t) => {
  const dir = target();
  exportTemplate({ dir, from: repoWithTeam() });
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  try {
    await main(['template', 'check', dir], promised({}));
  } finally {
    log.mock.restore();
  }
  assert.deepEqual(printed, [`${dir} passes`]);
  fs.writeFileSync(path.join(dir, 'nemia.yaml'), fs.readFileSync(path.join(dir, 'nemia.yaml'), 'utf8').replace('v1alpha1', 'v2'));
  await assert.rejects(
    main(['template', 'check', dir], promised({})),
    refusedWith('Invalid', /does not pass, with 1 problem:\nnemia\.yaml:1:\d+: apiVersion is "nemia\.dev\/v2"/),
  );
});
