/**
 * A template's folder on disk: `nemia template export` of the tests' team into a folder that passes `nemia template check`, what it
 * writes read back as it was written, what it refuses with nothing written, and each problem of a folder at its file and line; and
 * `nemia template pack` and `unpack`, the folder back byte for byte with its modes, an archive checked as its folder, and every refusal
 * with nothing written. `WF_ROOT` is set before the import, since the store's modules read it as they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { parse } from 'yaml';
import { scratch } from '../../test/scratch.ts';
import { testEngine } from 'agent-runtime/testing';
import { eachTest } from '../../test/placed.ts';
import { heldUnasked } from '../../test/unasked.ts';
import { rawTar } from '../../test/tar.ts';
import { teamCopy } from '../../test/team.ts';
import { packArchive } from '../archive/archive.ts';

const ROOT = scratch('wf-template-');
process.env.WF_ROOT = ROOT;
const { checkTemplateAt, exportTemplate, packTemplate, problemLine, readTemplate, unpackTemplate } = await import('./template.store.ts');
const { addFactory, attachWorkflow, hireAgent } = await import('../runner.ts');
const { writeRules } = await import('../rules/rules.store.ts');
const { main } = await import('../cli/main.ts');
const { engineOf } = await import('../runtime-client.ts');
const engine = eachTest(testEngine);
heldUnasked(engine);
const { factoryRulesOf, instructionOf } = await import('./template.verb.ts');

/** The factory `name`, as `--factory` names it to an export. */
const asked = (name: string) => ({ name, instruction: instructionOf, rules: factoryRulesOf });

/**
 * Refused by kind, exit 2, and what the message names — the fix, the file, the key — each a pattern it matches or a token it holds;
 * never `String(err)`, which starts with `Error: `.
 */
const refusedWith =
  (tag: 'Missing' | 'Conflict' | 'Invalid', ...named: Array<RegExp | string>) =>
  (err: Error & { exitCode?: number; _tag?: string }) =>
    err._tag === tag && err.exitCode === 2 && named.every((n) => (typeof n === 'string' ? err.message.includes(n) : n.test(err.message)));

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
    fence: {
      permissionMode: 'dontAsk',
      tools: ['Read', 'Grep', 'Glob', 'Bash', 'Skill'],
      allowedTools: ['Bash(git diff:*)', 'Bash(git log:*)', 'Bash(git show:*)', 'Bash(git status)'],
    },
  });
  assert.deepEqual(agent.output, { path: 'agents/reviewer/output.schema.json' });
  assert.equal(
    fs.readFileSync(path.join(dir, 'agents/reviewer/output.schema.json'), 'utf8'),
    fs.readFileSync(path.join(repo, 'workflows/agents/review.schema.json'), 'utf8'),
  );
});

/** A repository holding the tests' team, its step `implement` given the skill `x`, a link of `.claude/skills/` to the folder `to`. */
function repoGivenLinked(to: (repo: string) => string): string {
  const repo = repoWithTeam();
  fs.mkdirSync(path.join(repo, 'skills', 'x'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'skills', 'x', 'SKILL.md'), '---\ndescription: Linked.\n---\nDo it.\n');
  fs.writeFileSync(path.join(repo, 'skills', 'x', 'notes.md'), 'Notes.\n');
  fs.mkdirSync(path.join(repo, '.claude', 'skills'), { recursive: true });
  fs.symlinkSync(to(repo), path.join(repo, '.claude', 'skills', 'x'));
  const implement = path.join(repo, 'workflows', 'dev', 'implement.md');
  fs.writeFileSync(implement, fs.readFileSync(implement, 'utf8').replace('agent: implementer\n', 'agent: implementer\nskills: x\n'));
  return repo;
}

test('an export carries the real files of a skill linked inside the repository, and writes no link', () => {
  const repo = repoGivenLinked(() => '../../skills/x');
  const dir = target();
  const { from } = exportTemplate({ dir, from: repo });
  assert.equal(new Map(from.map(({ part, from: at }) => [part, at])).get('skills/x/'), path.join(repo, '.claude', 'skills', 'x'));
  assert.equal(fs.lstatSync(path.join(dir, 'skills', 'x')).isDirectory(), true);
  assert.equal(fs.lstatSync(path.join(dir, 'skills', 'x', 'SKILL.md')).isFile(), true);
  assert.equal(fs.readFileSync(path.join(dir, 'skills', 'x', 'SKILL.md'), 'utf8'), '---\ndescription: Linked.\n---\nDo it.\n');
  assert.equal(fs.readFileSync(path.join(dir, 'skills', 'x', 'notes.md'), 'utf8'), 'Notes.\n');
  const links = (fs.readdirSync(dir, { recursive: true }) as string[]).filter((entry) =>
    fs.lstatSync(path.join(dir, entry)).isSymbolicLink(),
  );
  assert.deepEqual(links, []);
  assert.deepEqual(checkTemplateAt(dir), []);
});

test('REFUSED: an export of a workflow given a skill whose link leaves the repository, by name, nothing written', () => {
  const outside = scratch('wf-template-outside-');
  fs.writeFileSync(path.join(outside, 'SKILL.md'), '---\ndescription: Outside.\n---\nSecret.\n');
  const repo = repoGivenLinked(() => outside);
  const dir = target();
  assert.throws(
    () => exportTemplate({ dir, from: repo }),
    refusedWith('Invalid', /x is a link/, 'outside the folder of skills', 'make it a folder of its own'),
  );
  assert.equal(fs.existsSync(dir), false);
});

/** A repository holding the tests' team, its step `implement` given the nested skill `app:y`, which the repository holds when `held`. */
function repoGivenNested(held = true): string {
  const repo = repoWithTeam();
  if (held) {
    fs.mkdirSync(path.join(repo, 'app', '.claude', 'skills', 'y'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'app', '.claude', 'skills', 'y', 'SKILL.md'), '---\ndescription: Nested.\n---\nDo it.\n');
  }
  const implement = path.join(repo, 'workflows', 'dev', 'implement.md');
  fs.writeFileSync(implement, fs.readFileSync(implement, 'utf8').replace('agent: implementer\n', 'agent: implementer\nskills: app:y\n'));
  return repo;
}

test('an export names a skill named with its folder and never carries it: left out and said, its step keeps the name, and the check passes', () => {
  const repo = repoGivenNested();
  const dir = target();
  const { from } = exportTemplate({ dir, from: repo });
  assert.equal(
    new Map(from.map(({ part, from: at }) => [part, at])).get('app:y'),
    `left out: a skill of the repository's folder, named and not carried, read from ${path.join(repo, 'app', '.claude', 'skills', 'y')}`,
  );
  const carried = (fs.readdirSync(dir, { recursive: true }) as string[]).filter((entry) => /(^|\/)(y|app|app:y)(\/|$)/.test(entry));
  assert.deepEqual(carried, []);
  assert.deepEqual(stepsOf(dir, 'dev').get('implement')?.overrides, { skills: ['app:y'] });
  assert.deepEqual(checkTemplateAt(dir), []);
});

test('REFUSED: an export of a workflow given a skill named with its folder that the repository lacks, by name, nothing written', () => {
  const repo = repoGivenNested(false);
  const dir = target();
  assert.throws(
    () => exportTemplate({ dir, from: repo }),
    refusedWith('Invalid', '`app:y` is the skill `y`', 'folder `app`', /\S+\/app\/\.claude\/skills\/y holds no SKILL\.md/),
  );
  assert.equal(fs.existsSync(dir), false);
});

test('what export writes reads back as it was written, a long line whole, and a step with no fence of its own writes no overrides fence', () => {
  const repo = repoWithTeam();
  const long = `npm test && ${Array.from({ length: 12 }, (_, i) => `node "scripts/check-${i}.ts" --mode: 'strict' # ${i}`).join(' && ')}`;
  const ship = path.join(repo, 'workflows', 'dev', 'ship.md');
  fs.writeFileSync(ship, fs.readFileSync(ship, 'utf8').replace(/^check: .*$/m, `check: ${long}`));
  const review = path.join(repo, 'workflows', 'dev', 'review.md');
  fs.writeFileSync(
    review,
    fs.readFileSync(review, 'utf8').replace('budget: 20', 'budget: 20\neffort: low\nskills: review-a-change\nmcp: docs'),
  );
  const dir = target();
  exportTemplate({ dir, from: repo });
  assert.deepEqual(checkTemplateAt(dir), []);
  const steps = stepsOf(dir, 'dev');
  assert.equal(steps.get('ship')?.check, long);
  assert.ok(fs.readFileSync(path.join(dir, 'workflows/dev/workflow.yaml'), 'utf8').includes(`check: "${long.replace(/"/g, '\\"')}"`));
  assert.deepEqual(steps.get('ship'), { name: 'ship', after: ['review'], place: 'git', workspace: 'main', gate: true, check: long });
  assert.equal(steps.get('implement')?.overrides, undefined, 'a step with no harness key of its own writes no overrides');
  assert.deepEqual(steps.get('review')?.overrides, { skills: ['review-a-change'], mcp: ['docs'], claude: { effort: 'low' } });
  assert.deepEqual(steps.get('review'), {
    name: 'review',
    after: ['implement'],
    place: 'git',
    budget: 20,
    loop: 'implement',
    rounds: 3,
    overrides: { skills: ['review-a-change'], mcp: ['docs'], claude: { effort: 'low' } },
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
  fs.writeFileSync(review, fs.readFileSync(review, 'utf8').replace('budget: 20', 'budget: 20\nremote: true\nslot: night'));
  const dir = target();
  assert.throws(
    () => exportTemplate({ dir, from: repo }),
    refusedWith('Invalid', 'review.md: `remote:` has no place', 'review.md: `slot:` has no place'),
  );
  assert.equal(fs.existsSync(dir), false);
  assert.deepEqual(fs.readdirSync(path.dirname(dir)), [], 'no staging folder is left beside it');
});

test("an agent's harness prompt and remote have no place in a template, each refused at the agent's file, and nothing is written", () => {
  const repo = repoWithTeam();
  const reviewer = path.join(repo, 'workflows', 'agents', 'reviewer.md');
  const written = fs.readFileSync(reviewer, 'utf8').replace('harness: claude', 'harness: claude\nharnessPrompt: replace\nremote: true');
  fs.writeFileSync(reviewer, written);
  const dir = target();
  assert.throws(
    () => exportTemplate({ dir, from: repo }),
    refusedWith('Invalid', 'reviewer.md: `remote:` has no place', 'reviewer.md: `harnessPrompt:` has no place'),
  );
  assert.equal(fs.existsSync(dir), false);
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

test("with --factory, the draft holds the factory's rules as RULES.md, read from the store; none where it has none, and rules that do not read refuse it", () => {
  const repo = factoryOnTeam('ruled');
  const none = target();
  exportTemplate({ dir: none, from: repo, factory: asked('ruled') });
  assert.equal(fs.existsSync(path.join(none, 'RULES.md')), false, 'a factory with no rules writes none');
  const kept = writeRules({ name: 'ruled' }, 'Never push on a Friday.');
  const dir = target();
  const { from } = exportTemplate({ dir, from: repo, factory: asked('ruled') });
  assert.deepEqual(checkTemplateAt(dir), []);
  assert.equal(fs.readFileSync(path.join(dir, 'RULES.md'), 'utf8'), 'Never push on a Friday.\n');
  assert.equal(new Map(from.map(({ part, from: at }) => [part, at])).get('RULES.md'), kept);
  assert.equal(kept, path.join(ROOT, 'factories', 'ruled', 'RULES.md'));
  fs.writeFileSync(kept, '---\nmodel: opus\n---\nBe kind.\n');
  const refused = target();
  assert.throws(
    () => exportTemplate({ dir: refused, from: repo, factory: asked('ruled') }),
    refusedWith('Invalid', "the factory ruled's rules: ", /RULES\.md opens with a frontmatter/),
  );
  assert.equal(fs.existsSync(refused), false);
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
      'the factory gaps attaches ghost',
      'holds no workflow ghost',
      '`agent: reviewer` fills this step',
      'the factory gaps hires shipper',
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
  const skill = lines.findIndex((line) => line.trim() === '- ask-for-another-round');
  lines[skill] = lines[skill].replace('ask-for-another-round', 'no-such-skill');
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
      ['agents/reviewer/agent.yaml', skill + 1],
      ['agents/reviewer/agent.yaml', effort + 1],
      ['skills/review-a-change/skill.yaml', 3],
      ['workflows/dev/notes.yaml', undefined],
    ],
  );
  assert.ok(skill < effort, 'the skill stands above the effort, so the order is the lines and not the checks');
  assert.match(problems[0].message, /skill no-such-skill is not in skills/);
  assert.match(problemLine(problems[1]), new RegExp(`^agents/reviewer/agent\\.yaml:${effort + 1}:\\d+: .*no effort`));
  assert.match(problems[2].message, /does not parse/);
  assert.match(problems[3].message, /outside the template's layout/);
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
    await main(['template', 'check', dir], engineOf(engine().layer));
  } finally {
    log.mock.restore();
  }
  assert.deepEqual(printed, [`${dir} passes`, `digest of the content: ${readTemplate(dir).digest}`]);
  assert.match(printed[1], /^digest of the content: sha256:[0-9a-f]{64}$/);
  fs.writeFileSync(path.join(dir, 'nemia.yaml'), fs.readFileSync(path.join(dir, 'nemia.yaml'), 'utf8').replace('v1alpha1', 'v2'));
  await assert.rejects(
    main(['template', 'check', dir], engineOf(engine().layer)),
    refusedWith('Invalid', 'with 1 problem', /\nnemia\.yaml:1:\d+: apiVersion /, '"nemia.dev/v2"'),
  );
});

/** The files under `dir`, each with its mode and its bytes in hex, by path from it. */
function filesOf(dir: string, under = ''): Array<[string, number, string]> {
  return fs
    .readdirSync(path.join(dir, under), { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((entry): Array<[string, number, string]> => {
      const file = under ? `${under}/${entry.name}` : entry.name;
      const at = path.join(dir, file);
      if (entry.isDirectory()) return filesOf(dir, file);
      return [[file, fs.statSync(at).mode & 0o777, fs.readFileSync(at).toString('hex')]];
    });
}

/** The tests' team exported to a folder named `team`, with a script of mode 0755 and a file of all 256 bytes. */
function exported(): string {
  const dir = target();
  const repo = repoWithTeam();
  fs.writeFileSync(path.join(repo, 'workflows', 'skills', 'review-a-change', 'look.sh'), '#!/bin/sh\n', { mode: 0o755 });
  fs.writeFileSync(
    path.join(repo, 'workflows', 'skills', 'review-a-change', 'data.bin'),
    Uint8Array.from({ length: 256 }, (_, i) => i),
  );
  exportTemplate({ dir, from: repo });
  return dir;
}

test('a folder packs into <name>-<version>.tgz, and unpacks into <dir>/<name> byte for byte with its modes, one digest for all three', () => {
  const dir = exported();
  const cwd = scratch('wf-template-pack-');
  const { out, digest } = packTemplate({ dir, cwd });
  assert.equal(out, path.join(cwd, 'team-0.1.0.tgz'));
  assert.deepEqual(fs.readdirSync(cwd), ['team-0.1.0.tgz'], 'no staged file is left beside it');
  const parent = path.join(scratch('wf-template-unpack-'), 'new');
  const unpacked = unpackTemplate({ archive: out, dir: parent });
  assert.deepEqual(unpacked, { dir: path.join(parent, 'team'), digest });
  assert.deepEqual(fs.readdirSync(parent), ['team'], 'no staged folder is left beside it');
  assert.deepEqual(filesOf(unpacked.dir), filesOf(dir));
  assert.ok(filesOf(dir).some(([file, mode]) => file === 'skills/review-a-change/look.sh' && mode === 0o755));
  assert.deepEqual(checkTemplateAt(out), []);
  assert.deepEqual(checkTemplateAt(unpacked.dir), []);
  assert.deepEqual([readTemplate(dir).digest, readTemplate(out).digest, readTemplate(unpacked.dir).digest], [digest, digest, digest]);
  assert.equal(packTemplate({ dir, out: 'again.tgz', cwd }).digest, digest);
  assert.deepEqual(fs.readFileSync(path.join(cwd, 'again.tgz')), fs.readFileSync(out), 'the same folder packs to the same bytes');
});

test("the system's tar opens an archive into the same files and modes as unpack writes", () => {
  const dir = exported();
  const { out } = packTemplate({ dir, cwd: scratch('wf-template-pack-') });
  const byTar = scratch('wf-template-tar-');
  execFileSync('tar', ['-xzf', out, '-C', byTar], { stdio: ['ignore', 'pipe', 'pipe'] });
  assert.deepEqual(fs.readdirSync(byTar), ['team']);
  assert.deepEqual(filesOf(path.join(byTar, 'team')), filesOf(dir));
});

test('pack refuses a folder that does not pass, at its line, and an --out that is there, and writes nothing', () => {
  const dir = exported();
  const cwd = scratch('wf-template-pack-');
  const manifest = path.join(dir, 'nemia.yaml');
  const text = fs.readFileSync(manifest, 'utf8');
  fs.writeFileSync(manifest, text.replace('v1alpha1', 'v2'));
  assert.throws(() => packTemplate({ dir, cwd }), refusedWith('Invalid', 'was not packed', /\n {2}nemia\.yaml:1:\d+: apiVersion/));
  assert.deepEqual(fs.readdirSync(cwd), []);
  fs.writeFileSync(manifest, text);
  fs.writeFileSync(path.join(cwd, 'mine.tgz'), 'mine');
  assert.throws(() => packTemplate({ dir, out: 'mine.tgz', cwd }), refusedWith('Conflict', /mine\.tgz is there already/));
  assert.equal(fs.readFileSync(path.join(cwd, 'mine.tgz'), 'utf8'), 'mine');
  assert.deepEqual(fs.readdirSync(cwd), ['mine.tgz']);
  assert.throws(() => packTemplate({ dir: path.join(cwd, 'mine.tgz'), cwd }), refusedWith('Missing', /is no folder/));
});

test('pack refuses a version that names no file where --out names none, and writes nothing in its folder or outside it', () => {
  const dir = exported();
  const manifest = path.join(dir, 'nemia.yaml');
  const text = fs.readFileSync(manifest, 'utf8');
  const outer = scratch('wf-template-outer-');
  const cwd = path.join(outer, 'a', 'b');
  fs.mkdirSync(cwd, { recursive: true });
  for (const version of ['1/../../x', '1.0/x', '..', '1\\x']) {
    fs.writeFileSync(manifest, text.replace(/version: .*/, `version: ${JSON.stringify(version)}`));
    assert.deepEqual(checkTemplateAt(dir), [], `${version} passes the check`);
    assert.throws(() => packTemplate({ dir, cwd }), refusedWith('Invalid', 'names no file', '<name>-<version>.tgz', 'with --out'), version);
    assert.deepEqual(fs.readdirSync(cwd), [], version);
    assert.deepEqual(fs.readdirSync(outer), ['a'], version);
    assert.deepEqual(fs.readdirSync(path.join(outer, 'a')), ['b'], version);
  }
  assert.equal(packTemplate({ dir, out: 'named.tgz', cwd }).out, path.join(cwd, 'named.tgz'), '--out names it whatever the version');
});

test('unpack refuses a <dir>/<name> that holds files or is no folder, and leaves it as it was', () => {
  const { out } = packTemplate({ dir: exported(), cwd: scratch('wf-template-pack-') });
  const parent = scratch('wf-template-unpack-');
  fs.mkdirSync(path.join(parent, 'team'));
  fs.writeFileSync(path.join(parent, 'team', 'mine.txt'), 'mine');
  assert.throws(
    () => unpackTemplate({ archive: out, dir: parent }),
    refusedWith('Conflict', /team holds files already, and unpack writes/),
  );
  assert.deepEqual(fs.readdirSync(path.join(parent, 'team')), ['mine.txt']);
  const beside = scratch('wf-template-unpack-');
  fs.writeFileSync(path.join(beside, 'team'), 'mine');
  assert.throws(() => unpackTemplate({ archive: out, dir: beside }), refusedWith('Conflict', /team is there, and is no folder/));
  assert.equal(fs.readFileSync(path.join(beside, 'team'), 'utf8'), 'mine');
  assert.throws(() => unpackTemplate({ archive: path.join(beside, 'none.tgz'), dir: beside }), refusedWith('Missing', /is no file/));
});

test('export refuses a folder that is a file, and leaves it as it was', () => {
  const dir = target();
  fs.writeFileSync(dir, 'mine');
  assert.throws(() => exportTemplate({ dir, from: repoWithTeam() }), refusedWith('Conflict', /team is there, and is no folder: export/));
  assert.equal(fs.readFileSync(dir, 'utf8'), 'mine');
});

test('unpack refuses an archive whose entry climbs out of its folder, and writes nothing at all', () => {
  const archive = path.join(scratch('wf-template-evil-'), 'evil.tgz');
  fs.writeFileSync(
    archive,
    gzipSync(
      rawTar([
        { name: 'team/nemia.yaml', body: 'a' },
        { name: 'team/../escape', body: 'pwned' },
        { name: 'team/x', body: 'b' },
      ]),
    ),
  );
  const parent = scratch('wf-template-unpack-');
  assert.throws(
    () => unpackTemplate({ archive, dir: parent }),
    refusedWith('Invalid', 'evil.tgz was refused', /\n {2}team\/\.\.\/escape: has a part/),
  );
  assert.deepEqual(fs.readdirSync(parent), [], 'no escape, no team, no staged folder');
  assert.equal(fs.existsSync(path.join(path.dirname(parent), 'escape')), false);
});

test('check reads an archive as the folder it holds, every problem at its line; and refuses what is neither folder nor file', async () => {
  const dir = exported();
  const manifest = path.join(dir, 'nemia.yaml');
  fs.writeFileSync(manifest, fs.readFileSync(manifest, 'utf8').replace('v1alpha1', 'v2'));
  const { files } = readTemplate(dir);
  const archive = path.join(scratch('wf-template-pack-'), 'bad.tgz');
  fs.writeFileSync(archive, packArchive('team', files).archive);
  await assert.rejects(
    main(['template', 'check', archive], engineOf(engine().layer)),
    refusedWith('Invalid', 'bad.tgz does not pass', 'with 1 problem', /\nnemia\.yaml:1:\d+: apiVersion /, '"nemia.dev/v2"'),
  );
  await assert.rejects(
    main(['template', 'check', path.join(dir, 'none')], engineOf(engine().layer)),
    refusedWith('Missing', 'is neither a folder nor a file', "name a template's folder", 'or an archive'),
  );
});

test('a folder entry that is neither a file nor a folder is refused by name, never read', () => {
  const dir = exported();
  execFileSync('mkfifo', [path.join(dir, 'workflows', 'dev', 'pipe.yaml')], { stdio: ['ignore', 'pipe', 'pipe'] });
  const problems = checkTemplateAt(dir);
  assert.deepEqual(
    problems.map((p) => p.file),
    ['workflows/dev/pipe.yaml'],
  );
  assert.ok(problems[0].message.startsWith('workflows/dev/pipe.yaml is neither a file nor a folder'), problems[0].message);
  assert.ok(problems[0].message.includes('remove it'), problems[0].message);
});

test('nemia template pack and unpack print what they wrote, the digest of its content, and how to check it', async (t) => {
  const dir = exported();
  const out = path.join(scratch('wf-template-pack-'), 'shared.tgz');
  const parent = scratch('wf-template-unpack-');
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  try {
    await main(['template', 'pack', dir, '--out', out], engineOf(engine().layer));
    await main(['template', 'unpack', out, parent], engineOf(engine().layer));
  } finally {
    log.mock.restore();
  }
  const digest = `digest of the content: ${readTemplate(dir).digest}`;
  const team = path.join(parent, 'team');
  assert.deepEqual(printed, [`written: ${out}`, digest, `written: ${team}`, digest, `check it: nemia template check ${team}`]);
});
