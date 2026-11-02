/**
 * A template's folder on disk, beyond the round trip of `test/template-trip.test.ts`: three tables, what `nemia template export`
 * writes from a repository and a factory, each draft passing `nemia template lint`; what export, pack, unpack and lint refuse, each
 * writing nothing; and each problem of a folder at its file and line. The system's own `tar` and a named pipe, which start a real
 * process, are `test/template-tar.boundary.test.ts`. `WF_ROOT` is set before the import, since the store's modules read it as they
 * load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
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
import { Cause, Effect, Exit } from 'effect';
import type { StoreRoot as Root } from '../config/root.store.ts';
import { packArchive } from '../archive/archive.ts';

const ROOT = scratch('wf-template-');
process.env.WF_ROOT = ROOT;
const { checkedTree, placeSkillNames, problemLine } = await import('./template.store.ts');
const { TemplateDoor } = await import('../templates/templates.store.ts');
const { TemplateSource } = await import('../templates/templates.model.ts');
const { StoreRoot } = await import('../config/root.store.ts');
const { addFactory, attachWorkflow, hireAgent } = await import('../runner.ts');
const { writeRules } = await import('../rules/rules.store.ts');
const { setRevisions } = await import('../factory/factory.store.ts');
const { main } = await import('../cli/main.ts');
const { engineOf } = await import('../runtime-client.ts');
const engine = eachTest(testEngine);
heldUnasked(engine);
const { exportedTemplate, packedTemplate, unpackedTemplate } = await import('./template.verb.ts');

/** `program` run at the store's root, as the CLI runs a verb's: what it answers, or the refusal it failed with, thrown. */
function run<A>(program: Effect.Effect<A, unknown, Root>): A {
  const exit = Effect.runSyncExit(Effect.provideService(program, StoreRoot, ROOT));
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}

/** `nemia template export`'s program, `factory` the name `--factory` gives. */
const exportTemplate = (ask: { dir: string; from: string; factory?: string }) => run(exportedTemplate(ask.dir, ask.from, ask.factory));

/** `nemia template pack`'s program. */
const packTemplate = (ask: { dir: string; out?: string; cwd: string }) => run(packedTemplate(ask.dir, ask.out, ask.cwd));

/** `nemia template unpack`'s program. */
const unpackTemplate = (ask: { archive: string; dir: string }) => run(unpackedTemplate(ask.archive, ask.dir));

/** The template at `source`, a folder or an archive, read through the Template door. */
const readTemplate = (source: string) =>
  run(
    Effect.gen(function* () {
      return yield* (yield* TemplateDoor).templates.read(TemplateSource.read(path.resolve(source)));
    }),
  );

/** Every problem of the template at `source`, as `nemia template lint` finds them. */
const checkTemplateAt = (source: string) => checkedTree(readTemplate(source), placeSkillNames()).problems;

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

test('what export writes from a repository and a factory, read back as it was written, each draft passing its check', async (t) => {
  await t.test('an export carries the real files of a skill linked inside the repository, and writes no link', () => {
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
  await t.test(
    'an export names a skill named with its folder and never carries it: left out and said, its step keeps the name, and the check passes',
    () => {
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
    },
  );
  await t.test(
    'what export writes reads back as it was written, a long line whole, and a step with no fence of its own writes no overrides fence',
    () => {
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
      assert.deepEqual(
        steps.get('ship'),
        { name: 'ship', after: ['review'], place: 'git', workspace: 'base', gate: true, check: long },
        'a step file that says `workspace: base`, the former spelling, is exported as `base`',
      );
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
    },
  );
  await t.test("a workflow's README and its files that are no .md or .yaml are carried with their modes, and so is a skill's", () => {
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
  await t.test(
    "with --factory, the draft holds that factory's attached workflows only, its hires, its revisions policy and its instruction",
    () => {
      const repo = factoryOnTeam('crew');
      setRevisions({ factory: 'crew', revisions: 'follow' });
      fs.writeFileSync(path.join(repo, 'NEMIA.md'), 'Run the crew.\n');
      const dir = target();
      const { from } = exportTemplate({ dir, from: repo, factory: 'crew' });
      assert.deepEqual(checkTemplateAt(dir), []);
      assert.deepEqual(fs.readdirSync(path.join(dir, 'workflows')), ['solo']);
      assert.deepEqual(readBack(dir, 'nemia.yaml').spec, { version: '0.1.0', hires: { 'solo/work': 'implementer' }, revisions: 'follow' });
      assert.equal(fs.readFileSync(path.join(dir, 'NEMIA.md'), 'utf8'), 'Run the crew.\n');
      const said = new Map(from.map(({ part, from: at }) => [part, at]));
      assert.equal(said.get('NEMIA.md'), path.join(repo, 'NEMIA.md'));
      assert.equal(said.get('nemia.yaml hires solo/work: implementer'), `${path.join(ROOT, 'factories', 'crew.json')}, its hire`);
      assert.equal(said.get('agents/reviewer/'), undefined, 'an agent only an unattached workflow names is left out');
    },
  );
  await t.test(
    "with --factory, the draft holds the factory's rules as RULES.md, read from the store; none where it has none, and rules that do not read refuse it",
    () => {
      const repo = factoryOnTeam('ruled');
      const none = target();
      exportTemplate({ dir: none, from: repo, factory: 'ruled' });
      assert.equal(fs.existsSync(path.join(none, 'RULES.md')), false, 'a factory with no rules writes none');
      const kept = writeRules({ name: 'ruled' }, 'Never push on a Friday.');
      const dir = target();
      const { from } = exportTemplate({ dir, from: repo, factory: 'ruled' });
      assert.deepEqual(checkTemplateAt(dir), []);
      assert.equal(fs.readFileSync(path.join(dir, 'RULES.md'), 'utf8'), 'Never push on a Friday.\n');
      assert.equal(new Map(from.map(({ part, from: at }) => [part, at])).get('RULES.md'), kept);
      assert.equal(kept, path.join(ROOT, 'factories', 'ruled', 'RULES.md'));
      fs.writeFileSync(kept, '---\nmodel: opus\n---\nBe kind.\n');
      const refused = target();
      assert.throws(
        () => exportTemplate({ dir: refused, from: repo, factory: 'ruled' }),
        refusedWith('Invalid', "the factory ruled's rules: ", /RULES\.md opens with a frontmatter/),
      );
      assert.equal(fs.existsSync(refused), false);
    },
  );
});

test('what export, pack, unpack and lint refuse, by kind and exit 2, each writing nothing', async (t) => {
  await t.test('REFUSED: an export of a workflow given a skill whose link leaves the repository, by name, nothing written', () => {
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
  await t.test(
    'REFUSED: an export of a workflow given a skill named with its folder that the repository lacks, by name, nothing written',
    () => {
      const repo = repoGivenNested(false);
      const dir = target();
      assert.throws(
        () => exportTemplate({ dir, from: repo }),
        refusedWith('Invalid', '`app:y` is the skill `y`', 'folder `app`', /\S+\/app\/\.claude\/skills\/y holds no SKILL\.md/),
      );
      assert.equal(fs.existsSync(dir), false);
    },
  );
  await t.test('a key a template has no place for is refused by name, and nothing is written', () => {
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
  await t.test(
    "an agent's harness prompt and remote have no place in a template, each refused at the agent's file, and nothing is written",
    () => {
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
    },
  );
  await t.test(
    'with --factory: a workflow it attaches that the repository lacks, a step hired and filled by its own agent:, and another repository',
    () => {
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
        () => exportTemplate({ dir, from: repo, factory: 'gaps' }),
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
        () => exportTemplate({ dir, from: repoWithTeam(), factory: 'gaps' }),
        refusedWith('Invalid', /the factory gaps works on [^]*--from /),
      );
      assert.equal(fs.existsSync(dir), false);
    },
  );
  await t.test('lint refuses a folder that does not pass, with every problem at its line', async () => {
    const dir = target();
    exportTemplate({ dir, from: repoWithTeam() });
    fs.writeFileSync(path.join(dir, 'nemia.yaml'), fs.readFileSync(path.join(dir, 'nemia.yaml'), 'utf8').replace('v1alpha1', 'v2'));
    await assert.rejects(
      main(['template', 'lint', dir], engineOf(engine().layer)),
      refusedWith('Invalid', 'with 1 problem', /\nnemia\.yaml:1:\d+: apiVersion /, '"nemia.dev/v2"'),
    );
  });
  await t.test('pack refuses a folder that does not pass, at its line, and a file that is no folder, and writes nothing', () => {
    const dir = exported();
    const cwd = scratch('wf-template-pack-');
    const manifest = path.join(dir, 'nemia.yaml');
    const text = fs.readFileSync(manifest, 'utf8');
    fs.writeFileSync(manifest, text.replace('v1alpha1', 'v2'));
    assert.throws(() => packTemplate({ dir, cwd }), refusedWith('Invalid', 'was not packed', /\n {2}nemia\.yaml:1:\d+: apiVersion/));
    assert.deepEqual(fs.readdirSync(cwd), []);
    fs.writeFileSync(path.join(cwd, 'mine.tgz'), 'mine');
    assert.throws(() => packTemplate({ dir: path.join(cwd, 'mine.tgz'), cwd }), refusedWith('Missing', /is no folder/));
  });
  await t.test('pack refuses a version that names no file where --out names none, and writes nothing in its folder or outside it', () => {
    const dir = exported();
    const manifest = path.join(dir, 'nemia.yaml');
    const text = fs.readFileSync(manifest, 'utf8');
    const outer = scratch('wf-template-outer-');
    const cwd = path.join(outer, 'a', 'b');
    fs.mkdirSync(cwd, { recursive: true });
    for (const version of ['1/../../x', '1.0/x', '..', '1\\x']) {
      fs.writeFileSync(manifest, text.replace(/version: .*/, `version: ${JSON.stringify(version)}`));
      assert.deepEqual(checkTemplateAt(dir), [], `${version} passes the check`);
      assert.throws(
        () => packTemplate({ dir, cwd }),
        refusedWith('Invalid', 'names no file', '<name>-<version>.tgz', 'with --out'),
        version,
      );
      assert.deepEqual(fs.readdirSync(cwd), [], version);
      assert.deepEqual(fs.readdirSync(outer), ['a'], version);
      assert.deepEqual(fs.readdirSync(path.join(outer, 'a')), ['b'], version);
    }
    assert.equal(packTemplate({ dir, out: 'named.tgz', cwd }).out, path.join(cwd, 'named.tgz'), '--out names it whatever the version');
  });
  await t.test('unpack refuses an archive that is no file, and writes nothing', () => {
    const beside = scratch('wf-template-unpack-');
    assert.throws(() => unpackTemplate({ archive: path.join(beside, 'none.tgz'), dir: beside }), refusedWith('Missing', /is no file/));
    assert.deepEqual(fs.readdirSync(beside), []);
  });
  await t.test('unpack refuses an archive whose entry climbs out of its folder, and writes nothing at all', () => {
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
  await t.test(
    'check reads an archive as the folder it holds, every problem at its line; and refuses what is neither folder nor file',
    async () => {
      const dir = exported();
      const manifest = path.join(dir, 'nemia.yaml');
      fs.writeFileSync(manifest, fs.readFileSync(manifest, 'utf8').replace('v1alpha1', 'v2'));
      const { files } = readTemplate(dir);
      const archive = path.join(scratch('wf-template-pack-'), 'bad.tgz');
      fs.writeFileSync(archive, packArchive('team', files).archive);
      await assert.rejects(
        main(['template', 'lint', archive], engineOf(engine().layer)),
        refusedWith('Invalid', 'bad.tgz does not pass', 'with 1 problem', /\nnemia\.yaml:1:\d+: apiVersion /, '"nemia.dev/v2"'),
      );
      await assert.rejects(
        main(['template', 'lint', path.join(dir, 'none')], engineOf(engine().layer)),
        refusedWith('Missing', 'is neither a folder nor a file', "name a template's folder", 'or an archive'),
      );
    },
  );
});

test('each problem of a folder stands at its file and line, every one at once, sorted by file then line', async (t) => {
  await t.test('a problem of a folder stands at its file and line, every one at once, sorted by file then line', () => {
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
  await t.test('a link in a folder is refused by name, and so is a file of two documents, at the second', () => {
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
});
