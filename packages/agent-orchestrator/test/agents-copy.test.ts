/**
 * `nemia agents copy`, told as a person's stories on the stage (`story.ts`): an agent copied into the library with its schema and skills,
 * hired into a step and frozen on a run under its new name, copied again as it is or once its source moved, and said on `nemia agents`
 * with where it came from; then a repository's agents, listed by `nemia agents sources` and each copied as a start would find its skills.
 * And a table: each copy the library or its source cannot take, refused by its kind and exit 2 before a byte is written, and a write
 * that fails part-way, which removes what this copy wrote and no other.
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
import { names } from './assessed.ts';
import { staged, story } from './story.ts';

const ROOT = scratch('wf-agents-copy-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
const { addFactoryAt } = await import('../src/factory/factory.store.ts');
const { addFactory, attachWorkflow, hireAgent, runWith: runEngine, startRun, TABLE } = await import('../src/runner.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { main } = await import('../src/cli/main.ts');
const { AGENTS_COPY } = await import('../src/sources/copy.verb.ts');
const { agentsRead } = await import('../src/roster/roster.store.ts');
const { agentsLines } = await import('../src/roster/roster.ts');
const { agentSources } = await import('../src/sources/sources.store.ts');
const { sourcesLines } = await import('../src/sources/sources.ts');
const stage = staged({ runWith: runEngine, main, engineOf });

/**
 * The fixture repository: `.claude/agents/` with `scout` and `counted`, `workflows/agents/` with `planner`, and a planted `docs/agents/`.
 */
const FIXTURE = path.join(import.meta.dirname, 'fixtures', 'agents-copy', 'repo');

/** The copy `args` asks for, into the library of the store `home`. */
const copy = (args: Record<string, string | readonly string[]>, home: string) =>
  stage.runWith(stage.board().e, AGENTS_COPY.handler(args, undefined, home));

/** Refused by kind, exit 2, naming each of `facts` — what it refused and the flag or the command that fixes it. */
const refusedWith =
  (tag: 'Missing' | 'Conflict' | 'Invalid', ...facts: string[]) =>
  (err: Error & { exitCode?: number; _tag?: string }) => {
    assert.deepEqual([err._tag, err.exitCode], [tag, 2], err.message);
    names(err.message, ...facts);
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
const NOTHING = { agents: {}, skills: {}, records: {} };

/** The reviewer's parts, as a copy of it lists them. */
const PARTS = (agent: string) => [`agents/${agent}.md`, 'ask-for-another-round', 'review-a-change', 'review.schema.json'];

test('copy an agent into the library: hired and run under its new name, copied again as it is or once its source moved, and said where it came from', async (t) => {
  const s = story(t);
  const team = teamCopy();
  const file = path.join(team, 'agents', 'reviewer.md');
  const record = path.join(libraryOf(ROOT).records, 'critic.json');
  const none = scratch('wf-agents-copy-none-');
  const copiedLines = () => agentsLines(agentsRead({ repo: none, home: ROOT })).filter((l) => l.includes('copied from'));
  const reading = () => agentsRead({ repo: none, home: ROOT }).agents.find((a) => a.name === 'critic')?.copied;
  let version = '';

  await s.test(
    'copied under --as with its schema and its skills, a record of where from, and the folder copied from left as it was',
    async () => {
      const before = snapshot(team);
      const copied = await copy({ file, as: 'critic' }, ROOT);
      assert.deepEqual(copied.copied.sort(), PARTS('critic'));
      const { agents, skills } = libraryOf(ROOT);
      assert.match(fs.readFileSync(path.join(agents, 'critic.md'), 'utf8'), /^output: review\.schema\.json$/m);
      assert.equal(
        fs.readFileSync(path.join(agents, 'review.schema.json'), 'utf8'),
        fs.readFileSync(path.join(team, 'agents', 'review.schema.json'), 'utf8'),
      );
      for (const skill of ['review-a-change', 'ask-for-another-round'])
        assert.ok(fs.existsSync(path.join(skills, skill, 'SKILL.md')), skill);
      const read = JSON.parse(fs.readFileSync(record, 'utf8'));
      assert.deepEqual(Object.keys(read).sort(), ['at', 'source', 'version']);
      assert.equal(read.source, file);
      version = read.version;
      assert.deepEqual(snapshot(team), before);
    },
  );

  await s.test('hired into a step, it runs as its new name on the frozen run', async () => {
    const build = path.join(team, 'build');
    fs.mkdirSync(build);
    fs.writeFileSync(path.join(build, 'implement.md'), '---\nplace: git\n---\nBuild what was asked.\n');
    fs.writeFileSync(path.join(build, 'review.md'), '---\nafter: implement\nplace: git\n---\nReview it.\n');
    const repo = scratch('wf-agents-copy-repo-');
    fs.writeFileSync(path.join(repo, 'README.md'), 'x\n');
    stage.place().world.repository(repo, {});
    stage.place().world.commit(repo, 'base');
    addFactory({ name: 'acme', repos: [repo] });
    attachWorkflow({ factory: 'acme', workflow: 'build' });
    hireAgent({ factory: 'acme', agent: 'implementer', step: 'build/implement' });
    hireAgent({ factory: 'acme', agent: 'critic', step: 'build/review' });
    const run = await stage.runPlaced(startRun({ brief: 'build it', repo, workflowDir: build, isolate: false, factory: 'acme' }));
    assert.equal(run.workflow?.find((step) => step.name === 'review')?.agent?.name, 'critic');
  });

  await s.test('a second copy of the same agent reuses every part, and writes nothing', async () => {
    backdated(ROOT);
    const before = written(ROOT);
    const again = await copy({ file, as: 'critic' }, ROOT);
    assert.deepEqual(again.copied, []);
    assert.deepEqual(again.reused.sort(), PARTS('critic'));
    assert.deepEqual(written(ROOT), before);
  });

  await s.test('nemia agents says where it came from, at the version it was copied at', () => {
    assert.deepEqual(reading(), { source: file, version, now: 'same' });
    assert.deepEqual(copiedLines(), [`   copied from ${file} at ${version}`]);
  });

  await s.test(
    'its source changed: said so, a copy refused naming --keep, and the copy kept moving the record to the version now',
    async () => {
      fs.appendFileSync(path.join(team, 'skills', 'review-a-change', 'SKILL.md'), 'Read the tests first.\n');
      assert.equal(reading()?.now, 'changed');
      assert.deepEqual(copiedLines(), [`   copied from ${file} at ${version}; the source has changed since`]);
      await assert.rejects(copy({ file, as: 'critic' }, ROOT), refusedWith('Conflict', '--keep review-a-change'));
      await copy({ file, as: 'critic', keep: ['review-a-change'] }, ROOT);
      const now = JSON.parse(fs.readFileSync(record, 'utf8'));
      assert.equal(now.source, file);
      assert.notEqual(now.version, version, 'the version moved');
      version = now.version;
      assert.deepEqual(copiedLines(), [`   copied from ${file} at ${version}`]);
    },
  );

  await s.test('its source gone: said so', () => {
    fs.rmSync(file);
    assert.equal(reading()?.now, 'gone');
    assert.deepEqual(copiedLines(), [`   copied from ${file} at ${version}; the source is gone`]);
  });
});

test('copy from a repository: its places listed by nemia agents sources, each agent copied with the skills a start would find', async (t) => {
  const s = story(t);
  const repo = scratch('wf-agents-copy-known-');
  fs.cpSync(FIXTURE, repo, { recursive: true });

  await s.test(
    'nemia agents sources lists each repository the store knows, workflows/agents then .claude/agents, then yours, then --path',
    async () => {
      const home = scratch('wf-agents-copy-home-');
      const unknown = scratch('wf-agents-copy-unknown-');
      fs.cpSync(FIXTURE, unknown, { recursive: true });
      addFactoryAt(home, { name: 'sources', repos: [repo] });
      const team = teamCopy();
      await copy({ file: path.join(team, 'agents', 'implementer.md') }, home);
      const { sources } = agentSources({ at: path.join(team, 'agents'), home });
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
        stage.runWith(stage.board().e, Effect.try({ try: () => agentSources({ at: path.join(home, 'none'), home }), catch: (err) => err })),
        refusedWith('Missing', 'none is not a folder'),
      );
    },
  );

  await s.test('an agent never copied, and every agent of a repository, has no record', () => {
    const home = scratch('wf-agents-copy-home-');
    const only = scratch('wf-agents-copy-repo-');
    fs.cpSync(path.join(FIXTURE, 'workflows'), path.join(only, 'workflows'), { recursive: true });
    fs.mkdirSync(path.join(home, 'agent-sources'), { recursive: true });
    fs.writeFileSync(path.join(home, 'agent-sources', 'planner.json'), JSON.stringify({ source: '/x.md', version: 'v', at: 'now' }));
    assert.deepEqual(
      agentsRead({ repo: only, home }).agents.map((a) => [a.from, a.name, a.copied]),
      [['repo', 'planner', null]],
    );
  });

  await s.test('a scout from .claude/ brings its skill from the repository, and reads as the store would run it', async () => {
    const home = scratch('wf-agents-copy-home-');
    const copied = await copy({ file: path.join(repo, '.claude', 'agents', 'scout.md') }, home);
    assert.deepEqual(copied.copied.sort(), ['agents/scout.md', 'scouting']);
    assert.ok(fs.existsSync(path.join(libraryOf(home).skills, 'scouting', 'SKILL.md')));
    assert.doesNotMatch(fs.readFileSync(path.join(libraryOf(home).agents, 'scout.md'), 'utf8'), /^(name|color):/m);
  });

  await s.test("an agent of the repository's workflows/agents brings a skill only its other place holds, as a start finds it", async () => {
    const home = scratch('wf-agents-copy-home-');
    const surveyor = path.join(repo, 'workflows', 'agents', 'surveyor.md');
    fs.writeFileSync(surveyor, '---\ndescription: Surveys the ground.\nskills: scouting\n---\nSurvey it.\n');
    const copied = await copy({ file: surveyor }, home);
    assert.deepEqual(copied.copied.sort(), ['agents/surveyor.md', 'scouting']);
    assert.ok(fs.existsSync(path.join(libraryOf(home).skills, 'scouting', 'SKILL.md')));
  });

  await s.test(
    'the place skill Nemia ships, and a skill named with its folder, are not copied: the agent keeps the name, the library holds none',
    async () => {
      for (const line of ['git', 'app:y']) {
        const home = scratch('wf-agents-copy-home-');
        const from = scratch('wf-agents-copy-hand-');
        fs.mkdirSync(path.join(from, 'agents'));
        fs.mkdirSync(path.join(from, 'app', '.claude', 'skills', 'y'), { recursive: true });
        fs.writeFileSync(path.join(from, 'app', '.claude', 'skills', 'y', 'SKILL.md'), '---\ndescription: Nested.\n---\nDo it.\n');
        fs.writeFileSync(path.join(from, 'agents', 'hand.md'), `---\ndescription: Lends a hand.\nskills: ${line}\n---\nHelp.\n`);
        const copied = await copy({ file: path.join(from, 'agents', 'hand.md') }, home);
        assert.deepEqual([copied.copied, copied.reused], [['agents/hand.md'], []], line);
        const skills = libraryOf(home).skills;
        assert.equal(fs.existsSync(skills) && fs.readdirSync(skills).length > 0, false, `no skill is filed for ${line}`);
        assert.match(fs.readFileSync(path.join(libraryOf(home).agents, 'hand.md'), 'utf8'), new RegExp(`^skills: ${line}$`, 'm'));
      }
    },
  );

  await s.test('the copy is classed a prompt write, served on its generated route', () => {
    assert.equal(TABLE.find((c) => c.name === 'agents copy')?.class, 'ask');
    assert.equal(AGENTS_COPY.class, 'ask');
    assert.deepEqual(AGENTS_COPY.route, { method: 'POST', path: '/api/agents/yours/copy', status: 200 });
  });
});

test('REFUSED: a copy the library or its source cannot take, by kind and exit 2 naming the fix, and nothing written; one failing part-way takes back only its own writes', async (t) => {
  const reviewer = (team: string) => path.join(team, 'agents', 'reviewer.md');

  await t.test('a skill the library holds otherwise, naming --keep; kept, the library keeps its own', async () => {
    const home = scratch('wf-agents-copy-home-');
    const team = teamCopy();
    const ours = path.join(libraryOf(home).skills, 'review-a-change');
    fs.mkdirSync(ours, { recursive: true });
    fs.writeFileSync(path.join(ours, 'SKILL.md'), '---\nname: review-a-change\ndescription: "Ours."\n---\nOur own way.\n');
    const before = written(home);
    await assert.rejects(
      copy({ file: reviewer(team) }, home),
      refusedWith('Conflict', 'the skill review-a-change in', 'differs', '--keep review-a-change', 'nothing was copied'),
    );
    assert.deepEqual(written(home), before);
    const kept = await copy({ file: reviewer(team), keep: ['review-a-change'] }, home);
    assert.ok(kept.copied.includes('agents/reviewer.md'));
    assert.ok(!kept.copied.includes('review-a-change'));
    assert.match(fs.readFileSync(path.join(ours, 'SKILL.md'), 'utf8'), /Our own way\./);
  });

  await t.test('another agent of the same name in the library, naming --as; copied under another name, it is written', async () => {
    const home = scratch('wf-agents-copy-home-');
    const team = teamCopy();
    fs.mkdirSync(libraryOf(home).agents, { recursive: true });
    fs.writeFileSync(path.join(libraryOf(home).agents, 'reviewer.md'), '---\ndescription: Ours.\n---\nOur reviewer.\n');
    const before = written(home);
    await assert.rejects(
      copy({ file: reviewer(team) }, home),
      refusedWith('Conflict', 'reviewer.md is another agent of that name', '--as <name>'),
    );
    assert.deepEqual(written(home), before);
    assert.ok((await copy({ file: reviewer(team), as: 'second' }, home)).copied.includes('agents/second.md'));
    assert.match(fs.readFileSync(path.join(libraryOf(home).agents, 'reviewer.md'), 'utf8'), /Our reviewer\./);
  });

  await t.test('a result schema the library holds otherwise, naming --keep', async () => {
    const home = scratch('wf-agents-copy-home-');
    fs.mkdirSync(libraryOf(home).agents, { recursive: true });
    fs.writeFileSync(path.join(libraryOf(home).agents, 'review.schema.json'), '{"type":"object"}\n');
    const before = written(home);
    await assert.rejects(
      copy({ file: reviewer(teamCopy()) }, home),
      refusedWith('Conflict', 'review.schema.json differs from the schema beside', '--keep review.schema.json'),
    );
    assert.deepEqual(written(home), before);
  });

  await t.test('a Claude Code key the run refuses, naming the key and the copy to make without it', async () => {
    const home = scratch('wf-agents-copy-home-');
    await assert.rejects(
      copy({ file: path.join(FIXTURE, '.claude', 'agents', 'counted.md') }, home),
      refusedWith('Invalid', "`maxTurns` is Claude Code's own subagent key", 'delete that line there, and copy from that path'),
    );
    assert.deepEqual(written(home), NOTHING);
  });

  await t.test('an agent file not there, naming it and nemia agents sources', async () => {
    const home = scratch('wf-agents-copy-home-');
    const file = path.join(home, 'nowhere', 'ghost.md');
    await assert.rejects(copy({ file }, home), refusedWith('Missing', `${file} is not there`, 'nemia agents sources'));
    assert.deepEqual(written(home), NOTHING);
  });

  await t.test('a --keep naming no part of the copy', async () => {
    const home = scratch('wf-agents-copy-home-');
    await assert.rejects(
      copy({ file: reviewer(teamCopy()), keep: ['nothing-of-it'] }, home),
      refusedWith('Invalid', '--keep nothing-of-it names no skill nor schema of this copy'),
    );
    assert.deepEqual(written(home), NOTHING);
  });

  await t.test(
    'a link where the schema would be, dangling or not, beside the agent it holds or none, and nothing written through it',
    async () => {
      const home = scratch('wf-agents-copy-home-');
      const file = reviewer(teamCopy());
      const { agents } = libraryOf(home);
      const schema = path.join(agents, 'review.schema.json');
      const outside = scratch('wf-agents-copy-outside-');
      fs.mkdirSync(agents, { recursive: true });
      fs.symlinkSync(path.join(outside, 'x.json'), schema);
      const before = written(home);
      const link = refusedWith('Invalid', `${schema} is a link, and an agent's result schema is its own`);
      await assert.rejects(copy({ file }, home), link);
      assert.deepEqual(written(home), before, 'no skill copied before the refusal');
      fs.rmSync(schema);
      await copy({ file }, home);
      fs.rmSync(schema);
      fs.symlinkSync(path.join(outside, 'x.json'), schema);
      backdated(home);
      const held = written(home);
      await assert.rejects(copy({ file }, home), link);
      assert.deepEqual(written(home), held, 'the library as it was');
      assert.deepEqual(fs.readdirSync(outside), [], 'nothing written through the link, outside the library');
    },
  );

  await t.test('a write that fails after the skills are copied removes the skills this copy wrote, and no other', async (sub) => {
    const home = scratch('wf-agents-copy-home-');
    const team = teamCopy();
    const { agents, skills } = libraryOf(home);
    fs.mkdirSync(path.join(skills, 'review-a-change'), { recursive: true });
    fs.cpSync(path.join(team, 'skills', 'review-a-change'), path.join(skills, 'review-a-change'), { recursive: true });
    fs.mkdirSync(agents, { recursive: true });
    fs.chmodSync(agents, 0o555);
    sub.after(() => fs.chmodSync(agents, 0o755));
    await assert.rejects(copy({ file: reviewer(team) }, home), /EACCES/);
    assert.deepEqual(fs.readdirSync(skills), ['review-a-change']);
    assert.deepEqual(fs.readdirSync(agents), []);
    assert.ok(!fs.existsSync(path.join(home, 'agent-sources')));
  });

  await t.test(
    "a record that cannot be written removes the skills, the schema and the agent this copy wrote, and the library's own stay",
    async () => {
      const home = scratch('wf-agents-copy-home-');
      const team = teamCopy();
      const { agents, skills } = libraryOf(home);
      fs.mkdirSync(path.join(skills, 'review-a-change'), { recursive: true });
      fs.cpSync(path.join(team, 'skills', 'review-a-change'), path.join(skills, 'review-a-change'), { recursive: true });
      fs.writeFileSync(path.join(home, 'agent-sources'), 'not a folder\n');
      await assert.rejects(copy({ file: reviewer(team) }, home), /EEXIST|ENOTDIR/);
      assert.deepEqual(fs.readdirSync(skills), ['review-a-change'], "the library's own skill stays, the one this copy wrote goes");
      assert.deepEqual(fs.readdirSync(agents), [], 'neither the agent nor its schema stays');
    },
  );
});
