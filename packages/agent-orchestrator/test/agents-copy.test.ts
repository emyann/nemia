/**
 * `nemia agents copy`: an agent file copied into a person's library with its schema and skills, then hired into a step and frozen on a
 * run under its new name; a part the library holds as it is reused, and written again by none; a part it holds otherwise, a key the run
 * refuses, a file not there and a link where the schema would be each refused before a byte is written; what the copy wrote removed when
 * a later write fails, the record's included; the record of the copy said on `nemia agents`, and whether its source has changed or gone.
 * And `nemia agents sources`: the agent files the store knows of, each repository's then the library's then a folder named, and no other.
 *
 * `WF_ROOT` is set before the runner is imported, since it is read as the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from './scratch.ts';
import { teamCopy } from './team.ts';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-agents-copy-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
const { addFactory, attachWorkflow, engine, hireAgent, runWith: runEngine, startRun, TABLE } = await import('../src/runner.ts');
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
const { AGENTS_COPY } = await import('../src/sources/copy.verb.ts');
const { agentsRead } = await import('../src/roster/roster.store.ts');
const { agentsLines } = await import('../src/roster/roster.ts');
const { agentSources } = await import('../src/sources/sources.store.ts');
const { sourcesLines } = await import('../src/sources/sources.ts');

const e = engine();

/**
 * The fixture repository: `.claude/agents/` with `scout` and `counted`, `workflows/agents/` with `planner`, and a planted `docs/agents/`.
 */
const FIXTURE = path.join(import.meta.dirname, 'fixtures', 'agents-copy', 'repo');

/** The copy `args` asks for, into the library of the store `home`. */
const copy = (args: Record<string, string | readonly string[]>, home: string) => runWith(e, AGENTS_COPY.handler(args, undefined, home));

/** Refused by kind, exit 2, its message matching each of `patterns` — never `String(err)`, which starts with `Error: `. */
const refusedWith =
  (tag: 'Missing' | 'Conflict' | 'Invalid', ...patterns: RegExp[]) =>
  (err: Error & { exitCode?: number; _tag?: string }) => {
    assert.equal(err._tag, tag, err.message);
    assert.equal(err.exitCode, 2);
    for (const pattern of patterns) assert.match(err.message, pattern);
    return true;
  };

/** Every file under `dir`, by its path in it, with its inode and when it was last written: what a write would change. */
function snapshot(dir: string): Record<string, string> {
  if (!fs.existsSync(dir)) return {};
  const files = (fs.readdirSync(dir, { recursive: true }) as string[]).sort();
  return Object.fromEntries(
    files.map((file) => {
      const stat = fs.lstatSync(path.join(dir, file));
      return [file, `${stat.ino}:${stat.mtimeMs}`];
    }),
  );
}

/** Every file a copy writes in the store `home` set back a minute, so a write the same millisecond as the copy still moves its time. */
function backdated(home: string): void {
  const past = new Date(Date.now() - 60_000);
  for (const dir of Object.values(libraryOf(home)).filter((d) => fs.existsSync(d)))
    for (const file of fs.readdirSync(dir, { recursive: true }) as string[]) fs.lutimesSync(path.join(dir, file), past, past);
}

/** The library's own folder in the store `home`: its agents, its skills and the records of copies. */
const libraryOf = (home: string) => ({
  agents: path.join(home, 'workflows', 'agents'),
  skills: path.join(home, 'workflows', 'skills'),
  records: path.join(home, 'agent-sources'),
});

/** What the store `home` holds that a copy writes, whole. */
const written = (home: string) => {
  const { agents, skills, records } = libraryOf(home);
  return { agents: snapshot(agents), skills: snapshot(skills), records: snapshot(records) };
};

test('an agent copied in with its schema and skills, hired into a step, runs as its new name on the frozen run', async () => {
  const team = teamCopy();
  const before = snapshot(team);
  const copied = await copy({ file: path.join(team, 'agents', 'reviewer.md'), as: 'critic' }, ROOT);
  assert.deepEqual(copied.copied.sort(), ['agents/critic.md', 'ask-for-another-round', 'review-a-change', 'review.schema.json']);
  const { agents, skills } = libraryOf(ROOT);
  assert.match(fs.readFileSync(path.join(agents, 'critic.md'), 'utf8'), /^output: review\.schema\.json$/m);
  assert.equal(
    fs.readFileSync(path.join(agents, 'review.schema.json'), 'utf8'),
    fs.readFileSync(path.join(team, 'agents', 'review.schema.json'), 'utf8'),
  );
  for (const skill of ['review-a-change', 'ask-for-another-round']) assert.ok(fs.existsSync(path.join(skills, skill, 'SKILL.md')), skill);
  const record = JSON.parse(fs.readFileSync(path.join(ROOT, 'agent-sources', 'critic.json'), 'utf8'));
  assert.deepEqual(Object.keys(record).sort(), ['at', 'source', 'version']);
  assert.equal(record.source, path.join(team, 'agents', 'reviewer.md'));
  assert.deepEqual(snapshot(team), before, 'the folder copied from is left as it was');

  const build = path.join(team, 'build');
  fs.mkdirSync(build);
  fs.writeFileSync(path.join(build, 'implement.md'), '---\nplace: git\n---\nBuild what was asked.\n');
  fs.writeFileSync(path.join(build, 'review.md'), '---\nafter: implement\nplace: git\n---\nReview it.\n');
  const repo = scratch('wf-agents-copy-repo-');
  fs.writeFileSync(path.join(repo, 'README.md'), 'x\n');
  stand().world.repository(repo, {});
  stand().world.commit(repo, 'base');
  addFactory({ name: 'pipao', repos: [repo] });
  attachWorkflow({ factory: 'pipao', workflow: 'build' });
  hireAgent({ factory: 'pipao', agent: 'implementer', step: 'build/implement' });
  hireAgent({ factory: 'pipao', agent: 'critic', step: 'build/review' });
  const run = await runPlaced(startRun({ brief: 'build it', repo, workflowDir: build, isolate: false, factory: 'pipao' }));
  const review = run.workflow?.find((step) => step.name === 'review');
  assert.equal(review?.agent?.name, 'critic');
});

test('a second copy of the same agent reuses every part, and writes nothing', async () => {
  const home = scratch('wf-agents-copy-home-');
  const team = teamCopy();
  const file = path.join(team, 'agents', 'reviewer.md');
  await copy({ file }, home);
  backdated(home);
  const before = written(home);
  const again = await copy({ file }, home);
  assert.deepEqual(again.copied, []);
  assert.deepEqual(again.reused.sort(), ['agents/reviewer.md', 'ask-for-another-round', 'review-a-change', 'review.schema.json']);
  assert.deepEqual(written(home), before);
});

test("the same agent copied again once its source has changed moves the record to the source's version now", async () => {
  const home = scratch('wf-agents-copy-home-');
  const team = teamCopy();
  const file = path.join(team, 'agents', 'reviewer.md');
  await copy({ file }, home);
  const record = path.join(libraryOf(home).records, 'reviewer.json');
  const was = JSON.parse(fs.readFileSync(record, 'utf8'));
  fs.appendFileSync(path.join(team, 'skills', 'review-a-change', 'SKILL.md'), 'Read the tests first.\n');
  await assert.rejects(copy({ file }, home), refusedWith('Conflict', /--keep review-a-change/));
  await copy({ file, keep: ['review-a-change'] }, home);
  const now = JSON.parse(fs.readFileSync(record, 'utf8'));
  assert.equal(now.source, file);
  assert.notEqual(now.version, was.version, 'the version moved');
  assert.deepEqual(
    agentsLines(agentsRead({ repo: scratch('wf-agents-copy-none-'), home })).filter((l) => l.includes('copied from')),
    [`   copied from ${file} at ${now.version}`],
  );
});

test('REFUSED: a skill the library holds otherwise, naming --keep, and nothing written; kept, the library keeps its own', async () => {
  const home = scratch('wf-agents-copy-home-');
  const team = teamCopy();
  const ours = path.join(libraryOf(home).skills, 'review-a-change');
  fs.mkdirSync(ours, { recursive: true });
  fs.writeFileSync(path.join(ours, 'SKILL.md'), '---\nname: review-a-change\ndescription: "Ours."\n---\nOur own way.\n');
  const before = written(home);
  const file = path.join(team, 'agents', 'reviewer.md');
  await assert.rejects(
    copy({ file }, home),
    refusedWith('Conflict', /the skill review-a-change in .* differs/, /--keep review-a-change/, /^nothing was copied/),
  );
  assert.deepEqual(written(home), before);
  const kept = await copy({ file, keep: ['review-a-change'] }, home);
  assert.ok(kept.copied.includes('agents/reviewer.md'));
  assert.ok(!kept.copied.includes('review-a-change'));
  assert.match(fs.readFileSync(path.join(ours, 'SKILL.md'), 'utf8'), /Our own way\./);
});

test('REFUSED: another agent of the same name in the library, naming --as; copied under another name, it is written', async () => {
  const home = scratch('wf-agents-copy-home-');
  const team = teamCopy();
  fs.mkdirSync(libraryOf(home).agents, { recursive: true });
  fs.writeFileSync(path.join(libraryOf(home).agents, 'reviewer.md'), '---\ndescription: Ours.\n---\nOur reviewer.\n');
  const before = written(home);
  const file = path.join(team, 'agents', 'reviewer.md');
  await assert.rejects(copy({ file }, home), refusedWith('Conflict', /reviewer\.md is another agent of that name/, /--as <name>/));
  assert.deepEqual(written(home), before);
  const renamed = await copy({ file, as: 'second' }, home);
  assert.ok(renamed.copied.includes('agents/second.md'));
  assert.match(fs.readFileSync(path.join(libraryOf(home).agents, 'reviewer.md'), 'utf8'), /Our reviewer\./);
});

test('REFUSED: a result schema the library holds otherwise, naming --keep, and nothing written', async () => {
  const home = scratch('wf-agents-copy-home-');
  const team = teamCopy();
  fs.mkdirSync(libraryOf(home).agents, { recursive: true });
  fs.writeFileSync(path.join(libraryOf(home).agents, 'review.schema.json'), '{"type":"object"}\n');
  const before = written(home);
  await assert.rejects(
    copy({ file: path.join(team, 'agents', 'reviewer.md') }, home),
    refusedWith('Conflict', /review\.schema\.json differs from the schema beside/, /--keep review\.schema\.json/),
  );
  assert.deepEqual(written(home), before);
});

test('REFUSED: a Claude Code key the run refuses, naming the key and the copy to make without it, and nothing written', async () => {
  const home = scratch('wf-agents-copy-home-');
  await assert.rejects(
    copy({ file: path.join(FIXTURE, '.claude', 'agents', 'counted.md') }, home),
    refusedWith('Invalid', /`maxTurns` is Claude Code's own subagent key/, /delete that line there, and copy from that path/),
  );
  assert.deepEqual(written(home), { agents: {}, skills: {}, records: {} });
});

test('REFUSED: an agent file not there, naming it and nemia agents sources, and nothing written', async () => {
  const home = scratch('wf-agents-copy-home-');
  const file = path.join(home, 'nowhere', 'ghost.md');
  await assert.rejects(copy({ file }, home), refusedWith('Missing', new RegExp(`^${file} is not there`), /nemia agents sources/));
  assert.deepEqual(written(home), { agents: {}, skills: {}, records: {} });
});

test('REFUSED: a --keep naming no part of the copy, and nothing written', async () => {
  const home = scratch('wf-agents-copy-home-');
  const team = teamCopy();
  await assert.rejects(
    copy({ file: path.join(team, 'agents', 'reviewer.md'), keep: ['nothing-of-it'] }, home),
    refusedWith('Invalid', /--keep nothing-of-it names no skill nor schema of this copy/),
  );
  assert.deepEqual(written(home), { agents: {}, skills: {}, records: {} });
});

test('a write that fails after the skills are copied removes the skills this copy wrote, and no other', async (t) => {
  const home = scratch('wf-agents-copy-home-');
  const team = teamCopy();
  const { agents, skills } = libraryOf(home);
  fs.mkdirSync(path.join(skills, 'review-a-change'), { recursive: true });
  fs.cpSync(path.join(team, 'skills', 'review-a-change'), path.join(skills, 'review-a-change'), { recursive: true });
  fs.mkdirSync(agents, { recursive: true });
  fs.chmodSync(agents, 0o555);
  t.after(() => fs.chmodSync(agents, 0o755));
  await assert.rejects(copy({ file: path.join(team, 'agents', 'reviewer.md') }, home), /EACCES/);
  assert.deepEqual(fs.readdirSync(skills), ['review-a-change']);
  assert.deepEqual(fs.readdirSync(agents), []);
  assert.ok(!fs.existsSync(path.join(home, 'agent-sources')));
});

test("a record that cannot be written removes the skills, the schema and the agent this copy wrote, and the library's own stay", async () => {
  const home = scratch('wf-agents-copy-home-');
  const team = teamCopy();
  const { agents, skills } = libraryOf(home);
  fs.mkdirSync(path.join(skills, 'review-a-change'), { recursive: true });
  fs.cpSync(path.join(team, 'skills', 'review-a-change'), path.join(skills, 'review-a-change'), { recursive: true });
  fs.writeFileSync(path.join(home, 'agent-sources'), 'not a folder\n');
  await assert.rejects(copy({ file: path.join(team, 'agents', 'reviewer.md') }, home), /EEXIST|ENOTDIR/);
  assert.deepEqual(fs.readdirSync(skills), ['review-a-change'], "the library's own skill stays, the one this copy wrote goes");
  assert.deepEqual(fs.readdirSync(agents), [], 'neither the agent nor its schema stays');
});

test('REFUSED: a link where the schema would be in the library, dangling or not, beside the agent it holds or none, and nothing written through it', async () => {
  const home = scratch('wf-agents-copy-home-');
  const team = teamCopy();
  const file = path.join(team, 'agents', 'reviewer.md');
  const { agents } = libraryOf(home);
  const outside = scratch('wf-agents-copy-outside-');
  fs.mkdirSync(agents, { recursive: true });
  fs.symlinkSync(path.join(outside, 'x.json'), path.join(agents, 'review.schema.json'));
  const before = written(home);
  const link = new RegExp(`^${path.join(agents, 'review.schema.json')} is a link, and an agent's result schema is its own`);
  await assert.rejects(copy({ file }, home), refusedWith('Invalid', link));
  assert.deepEqual(written(home), before, 'no skill copied before the refusal');

  fs.rmSync(path.join(agents, 'review.schema.json'));
  await copy({ file }, home);
  fs.rmSync(path.join(agents, 'review.schema.json'));
  fs.symlinkSync(path.join(outside, 'x.json'), path.join(agents, 'review.schema.json'));
  backdated(home);
  const held = written(home);
  await assert.rejects(copy({ file }, home), refusedWith('Invalid', link));
  assert.deepEqual(written(home), held, 'the library as it was');
  assert.deepEqual(fs.readdirSync(outside), [], 'nothing written through the link, outside the library');
});

test('nemia agents says where a copied agent came from, and whether its source has changed since or is gone', async () => {
  const home = scratch('wf-agents-copy-home-');
  const team = teamCopy();
  const file = path.join(team, 'agents', 'reviewer.md');
  await copy({ file }, home);
  const record = JSON.parse(fs.readFileSync(path.join(home, 'agent-sources', 'reviewer.json'), 'utf8'));
  const repo = scratch('wf-agents-copy-empty-');
  const linesOf = () => agentsLines(agentsRead({ repo, home })).filter((line) => line.includes('copied from'));
  const reading = () => agentsRead({ repo, home }).agents.find((a) => a.name === 'reviewer')?.copied;
  assert.deepEqual(reading(), { source: file, version: record.version, now: 'same' });
  assert.deepEqual(linesOf(), [`   copied from ${file} at ${record.version}`]);
  fs.appendFileSync(path.join(team, 'skills', 'review-a-change', 'SKILL.md'), 'One more line.\n');
  assert.equal(reading()?.now, 'changed');
  assert.deepEqual(linesOf(), [`   copied from ${file} at ${record.version}; the source has changed since`]);
  fs.rmSync(file);
  assert.equal(reading()?.now, 'gone');
  assert.deepEqual(linesOf(), [`   copied from ${file} at ${record.version}; the source is gone`]);
});

test('an agent never copied, and every agent of a repository, has no record', async () => {
  const home = scratch('wf-agents-copy-home-');
  const repo = scratch('wf-agents-copy-repo-');
  fs.cpSync(path.join(FIXTURE, 'workflows'), path.join(repo, 'workflows'), { recursive: true });
  fs.mkdirSync(path.join(home, 'agent-sources'), { recursive: true });
  fs.writeFileSync(path.join(home, 'agent-sources', 'planner.json'), JSON.stringify({ source: '/x.md', version: 'v', at: 'now' }));
  const { agents } = agentsRead({ repo, home });
  assert.deepEqual(
    agents.map((a) => [a.from, a.name, a.copied]),
    [['repo', 'planner', null]],
  );
});

test('nemia agents sources lists each repository the store knows, workflows/agents then .claude/agents, then yours, then --path', async () => {
  const home = scratch('wf-agents-copy-home-');
  const repo = scratch('wf-agents-copy-known-');
  fs.cpSync(FIXTURE, repo, { recursive: true });
  const unknown = scratch('wf-agents-copy-unknown-');
  fs.cpSync(FIXTURE, unknown, { recursive: true });
  addFactory({ name: 'sources', repos: [repo] });
  const team = teamCopy();
  await copy({ file: path.join(team, 'agents', 'implementer.md') }, home);
  const named = path.join(team, 'agents');
  const { sources } = agentSources({ at: named, home });
  const ours = sources.filter((s) => s.repo === null || s.repo === repo);
  assert.deepEqual(
    ours.map((s) => [s.place, s.name]),
    [
      ['repository', 'planner'],
      ['repository', 'counted'],
      ['repository', 'scout'],
      ['library', 'implementer'],
      ['path', 'implementer'],
      ['path', 'reviewer'],
      ['path', 'shipper'],
    ],
  );
  assert.ok(!sources.some((s) => s.file.includes(`${path.sep}docs${path.sep}`)), 'a folder no place names is never listed');
  assert.ok(!sources.some((s) => s.repo === unknown), 'a repository the store does not know is never listed');
  const scout = sources.find((s) => s.name === 'scout')!;
  assert.equal(scout.description, 'Reads a codebase ahead of a change and says where it lands.');
  assert.match(scout.version ?? '', /^[0-9a-f]{16}$/);
  assert.match(sources.find((s) => s.name === 'counted')?.error ?? '', /`maxTurns`/);
  const lines = sourcesLines({ sources: ours });
  assert.equal(lines.at(-1), 'copy one into your library: nemia agents copy <file> [--as <name>]');
  assert.ok(lines.includes(`${path.join(repo, '.claude', 'agents')}  (the repository ${repo})`));
  await assert.rejects(
    runWith(e, Effect.try({ try: () => agentSources({ at: path.join(home, 'none'), home }), catch: (err) => err })),
    refusedWith('Missing', /none is not a folder/),
  );
});

test('a copied scout from .claude/ brings its skill from the repository, and reads as the store would run it', async () => {
  const home = scratch('wf-agents-copy-home-');
  const repo = scratch('wf-agents-copy-claude-');
  fs.cpSync(FIXTURE, repo, { recursive: true });
  const copied = await copy({ file: path.join(repo, '.claude', 'agents', 'scout.md') }, home);
  assert.deepEqual(copied.copied.sort(), ['agents/scout.md', 'scouting']);
  assert.ok(fs.existsSync(path.join(libraryOf(home).skills, 'scouting', 'SKILL.md')));
  assert.doesNotMatch(fs.readFileSync(path.join(libraryOf(home).agents, 'scout.md'), 'utf8'), /^(name|color):/m);
});

test("an agent of a repository's workflows/agents brings a skill only the repository's other place holds, as a start finds it", async () => {
  const home = scratch('wf-agents-copy-home-');
  const repo = scratch('wf-agents-copy-surveyor-');
  fs.cpSync(FIXTURE, repo, { recursive: true });
  fs.writeFileSync(
    path.join(repo, 'workflows', 'agents', 'surveyor.md'),
    '---\ndescription: Surveys the ground.\nskills: scouting\n---\nSurvey it.\n',
  );
  const copied = await copy({ file: path.join(repo, 'workflows', 'agents', 'surveyor.md') }, home);
  assert.deepEqual(copied.copied.sort(), ['agents/surveyor.md', 'scouting']);
  assert.ok(fs.existsSync(path.join(libraryOf(home).skills, 'scouting', 'SKILL.md')));
});

test("an agent given the place skill Nemia ships copies without it: a start finds the package's own, and the library holds none", async () => {
  const home = scratch('wf-agents-copy-home-');
  const from = scratch('wf-agents-copy-place-');
  fs.mkdirSync(path.join(from, 'agents'));
  fs.writeFileSync(path.join(from, 'agents', 'hand.md'), '---\ndescription: Lends a hand.\nskills: git\n---\nHelp.\n');
  const copied = await copy({ file: path.join(from, 'agents', 'hand.md') }, home);
  assert.deepEqual(copied.copied, ['agents/hand.md']);
  assert.deepEqual(copied.reused, []);
  assert.equal(fs.existsSync(path.join(libraryOf(home).skills, 'git')), false, 'no copy of the place skill');
  assert.match(fs.readFileSync(path.join(libraryOf(home).agents, 'hand.md'), 'utf8'), /^skills: git$/m);
});

test('the copy is classed a prompt write, served on its generated route', () => {
  const entry = TABLE.find((c) => c.name === 'agents copy');
  assert.equal(entry && 'nemia' in entry ? entry.nemia : undefined, 'prompts');
  assert.equal(AGENTS_COPY.nemia, 'prompts');
  assert.deepEqual(AGENTS_COPY.route, { method: 'POST', path: '/api/agents/yours/copy', status: 200 });
});
