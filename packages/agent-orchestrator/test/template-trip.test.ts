/**
 * A template's round trip, told as one person's story on the stage (`story.ts`) over a scratch store: the tests' team exported into a
 * folder that passes its check, a parameter added, `nemia template lint` saying it passes with its digest, `pack` and `unpack` giving
 * the folder back byte for byte with its modes under one digest, `nemia factory apply` of the archive with `--set` filing only the
 * factory's file and trusting its repository, the controller rendering the base read-only and seeding the tree once, a bare workflow
 * name started and a due schedule both running the tree's workflow as the person changed it, and a new version packed onto the same
 * archive said as drift and previewed by `nemia factory diff`.
 *
 * What export, pack, unpack and lint write and refuse beyond the trip is `src/template/template.store.test.ts`; what apply refuses
 * and what the controller says of a template moved, `src/applied/applied.verb.test.ts`; what a render writes and refuses,
 * `src/applied/render.test.ts`; the system's own tar, `template-tar.boundary.test.ts`. `WF_ROOT` and `CLAUDE_CONFIG_DIR` are set
 * before `src` is imported, which reads them as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { parse, stringify } from 'yaml';
import { scratch } from './scratch.ts';
import { staged, story } from './story.ts';
import { teamCopy } from './team.ts';

const ROOT = scratch('wf-template-trip-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
const CONFIG = scratch('wf-template-trip-harness-');
process.env.CLAUDE_CONFIG_DIR = CONFIG;
const FACTORIES = path.join(ROOT, 'factories');
const { templated: programsAt } = await import('./templated.ts');
const { exportTemplate, reconciled } = programsAt(ROOT);
const { checkedTree, placeSkillNames } = await import('../src/template/template.store.ts');
const { readFactories, readFactory } = await import('../src/runner.ts');
const { appliedDir, readStatus, statusFile, treeDir } = await import('../src/applied/applied.store.ts');
const { reconcileOnce } = await import('../src/applied/applied.verb.ts');
const { readRun } = await import('../src/record/record.store.ts');
const { startDue } = await import('../src/schedule/schedule.verb.ts');
const { StoreRoot } = await import('../src/config/root.store.ts');
const { TemplateDoor } = await import('../src/templates/templates.store.ts');
const { TemplateSource } = await import('../src/templates/templates.model.ts');
const { main } = await import('../src/cli/main.ts');
const { engineOf, runWith } = await import('../src/runtime-client.ts');
const stage = staged({ runWith, main, engineOf });

/** The document `file` of `dir`, its spec changed by `change`. */
function edit(dir: string, file: string, change: (spec: Record<string, any>) => void): void {
  const doc = parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  change(doc.spec);
  fs.writeFileSync(path.join(dir, file), stringify(doc, { lineWidth: 0 }));
}

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

/** What `argv` printed, as `nemia` prints it, line by line. */
async function printedBy(t: { mock: { method: Function } }, ...argv: string[]): Promise<string[]> {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...words: unknown[]) => printed.push(words.join(' ')));
  try {
    await stage.main(argv);
  } finally {
    log.mock.restore();
  }
  return printed.flatMap((p) => p.split('\n'));
}

/** The folders the harness's file says are trusted. */
const trusted = (): string[] => {
  const file = path.join(CONFIG, '.claude.json');
  if (!fs.existsSync(file)) return [];
  const { projects } = JSON.parse(fs.readFileSync(file, 'utf8')) as { projects: Record<string, { hasTrustDialogAccepted?: boolean }> };
  return Object.keys(projects).filter((key) => projects[key].hasTrustDialogAccepted === true);
};

/** The template at `source`, a folder or an archive, read through the Template door. */
const readTemplate = (source: string) =>
  Effect.runSync(
    Effect.gen(function* () {
      return yield* (yield* TemplateDoor).templates.read(TemplateSource.read(path.resolve(source)));
    }).pipe(Effect.provideService(StoreRoot, ROOT)),
  );

/** The factory `name`, read as the controller reads it. */
const factory = (name: string) =>
  readFactory(name) as ReturnType<typeof readFactory> & { template: NonNullable<ReturnType<typeof readFactory>['template']> };

const REVIEW = 'workflows/dev/review.md';

test("a template's round trip: the team exported, checked, packed, unpacked, applied with --set, rendered, started and diffed", async (t) => {
  const s = story(t);
  const repo = scratch('wf-template-trip-repo-');
  fs.renameSync(teamCopy(), path.join(repo, 'workflows'));
  const dir = path.join(scratch('wf-template-trip-out-'), 'team');
  const archive = path.join(scratch('wf-template-trip-pack-'), 'team.tgz');
  const parent = scratch('wf-template-trip-unpack-');
  const checked = (source: string) => checkedTree(readTemplate(source), placeSkillNames()).problems;

  await s.test("the tests' team exports into a folder that passes its check, each part said with where it came from", () => {
    stage.place().world.repository(repo, {});
    stage.place().world.commit(repo, 'base');
    const reviewer = path.join(repo, 'workflows', 'agents', 'reviewer.md');
    fs.writeFileSync(reviewer, fs.readFileSync(reviewer, 'utf8').replace('skills: review-a-change,', 'skills: git, review-a-change,'));
    fs.writeFileSync(path.join(repo, 'workflows', 'skills', 'review-a-change', 'look.sh'), '#!/bin/sh\n', { mode: 0o755 });
    const { from } = exportTemplate({ dir, from: repo });
    assert.deepEqual(checked(dir), []);
    const said = new Map(from.map(({ part, from: at }) => [part, at]));
    assert.equal(said.get('workflows/dev/'), path.join(repo, 'workflows', 'dev'));
    assert.equal(said.get('agents/reviewer/'), reviewer);
    assert.equal(said.get('skills/review-a-change/'), path.join(repo, 'workflows', 'skills', 'review-a-change'));
    assert.equal(said.get('nemia.yaml hires dev/review: reviewer'), `${path.join(repo, 'workflows', 'dev', 'review.md')}, its agent: line`);
    assert.match(said.get('skills/git/') ?? '', /left out: a builtin place skill/);
    assert.equal(fs.existsSync(path.join(dir, 'skills', 'git')), false, 'a builtin place skill is not carried');
    assert.deepEqual(parse(fs.readFileSync(path.join(dir, 'nemia.yaml'), 'utf8')).spec, {
      version: '0.1.0',
      hires: { 'dev/implement': 'implementer', 'dev/review': 'reviewer', 'dev/ship': 'shipper' },
    });
    const agent = parse(fs.readFileSync(path.join(dir, 'agents/reviewer/agent.yaml'), 'utf8')).spec;
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

  await s.test('a parameter given its place, nemia template lint says the folder passes, with the digest of its content', async (t) => {
    edit(dir, 'nemia.yaml', (spec) => {
      spec.parameters = {
        budget: { type: 'number', description: 'dollars for a review' },
        model: { type: 'string', description: 'the reviewer model', default: 'opus' },
      };
    });
    edit(dir, 'workflows/dev/workflow.yaml', (spec) => {
      spec.steps[1].budget = { param: 'budget' };
    });
    edit(dir, 'agents/reviewer/agent.yaml', (spec) => {
      spec.claude.model = { param: 'model' };
    });
    const printed = await printedBy(t, 'template', 'lint', dir);
    assert.deepEqual(printed, [`${dir} passes`, `digest of the content: ${readTemplate(dir).digest}`]);
    assert.match(printed[1], /^digest of the content: sha256:[0-9a-f]{64}$/);
  });

  await s.test('pack and unpack give the folder back byte for byte with its modes, one digest for all three', async (t) => {
    const digest = `digest of the content: ${readTemplate(dir).digest}`;
    const team = path.join(parent, 'team');
    assert.deepEqual(await printedBy(t, 'template', 'pack', dir, '--out', archive), [`written: ${archive}`, digest]);
    assert.deepEqual(await printedBy(t, 'template', 'unpack', archive, parent), [
      `written: ${team}`,
      digest,
      `lint it: nemia template lint ${team}`,
    ]);
    assert.deepEqual(fs.readdirSync(parent), ['team'], 'no staged folder is left beside it');
    assert.deepEqual(fs.readdirSync(path.dirname(archive)), ['team.tgz'], 'no staged file is left beside it');
    assert.deepEqual(filesOf(team), filesOf(dir));
    assert.ok(filesOf(dir).some(([file, mode]) => file === 'skills/review-a-change/look.sh' && mode === 0o755));
    assert.deepEqual([checked(archive), checked(team)], [[], []]);
    assert.deepEqual([readTemplate(archive).digest, readTemplate(team).digest], [readTemplate(dir).digest, readTemplate(dir).digest]);
    const again = path.join(path.dirname(archive), 'again.tgz');
    await printedBy(t, 'template', 'pack', dir, '--out', again);
    assert.deepEqual(fs.readFileSync(again), fs.readFileSync(archive), 'the same folder packs to the same bytes');
    fs.rmSync(again);
  });

  await s.test("apply of the archive with --set files only the factory's file, and trusts the repository it names", async (t) => {
    const printed = await printedBy(t, 'factory', 'apply', 'trip', '--template', archive, '--repo', repo, '--set', 'budget=7');
    assert.deepEqual(
      (fs.readdirSync(FACTORIES, { recursive: true }) as string[]).filter((f) => f.startsWith('trip')),
      ['trip.json'],
    );
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(FACTORIES, 'trip.json'), 'utf8')), {
      repos: [repo],
      template: { source: archive, version: '0.1.0', params: { budget: 7, model: 'opus' } },
    });
    assert.deepEqual(readFactory('trip').workflows, [], 'a tree not rendered yet offers nothing');
    assert.deepEqual(
      (readFactories().find((f) => f.name === 'trip') as { status?: unknown }).status,
      { applied: null, conditions: [] },
      'none is applied before the controller renders it',
    );
    await assert.rejects(
      stage.main(['factory', 'apply', 'trip', '--template', archive, '--repo', repo, '--set', 'budget=7']),
      (err: Error & { exitCode?: number; _tag?: string }) => err._tag === 'Conflict' && err.exitCode === 2,
    );
    assert.deepEqual(trusted(), [repo]);
    assert.ok(
      printed.some((line) => line.includes(repo) && /trusted for/.test(line)),
      printed.join('\n'),
    );
  });

  await s.test('the controller renders the base read-only and seeds the tree once; the tree, once seeded, is the person’s', async () => {
    const status = reconciled(factory('trip'));
    assert.deepEqual(status.conditions, [
      { type: 'Applied', status: 'True', reason: 'Rendered', message: `The base holds ${archive} at 0.1.0; the tree is yours to change.` },
      {
        type: 'ConflictsPending',
        status: 'False',
        reason: 'NoUpgrade',
        message: 'No upgrade is under way, so no change waits to be merged.',
      },
    ]);
    assert.equal(status.version, '0.1.0');
    assert.match(status.digest ?? '', /^sha256:[0-9a-f]{64}$/);
    assert.deepEqual(readStatus('trip'), status);
    const review = path.join(treeDir('trip'), REVIEW);
    assert.match(fs.readFileSync(review, 'utf8'), /^budget: 7$/m);
    assert.match(fs.readFileSync(path.join(treeDir('trip'), 'workflows/agents/reviewer.md'), 'utf8'), /^model: opus$/m);
    const script = path.join(treeDir('trip'), 'workflows/skills/review-a-change/look.sh');
    assert.equal(fs.statSync(script).mode & 0o111, 0o111, 'a copied file keeps the mode the archive holds');
    assert.equal(fs.statSync(path.join(appliedDir('trip'), REVIEW)).mode & 0o222, 0, 'the base is read-only');
    assert.throws(
      () => fs.writeFileSync(path.join(appliedDir('trip'), 'factory.json'), '{}'),
      (err: Error) => /EACCES/.test(err.message),
    );
    assert.deepEqual(readFactory('trip').workflows, ['dev']);
    fs.writeFileSync(review, fs.readFileSync(review, 'utf8').replace('budget: 7', 'budget: 9'));
    const written = fs.statSync(statusFile('trip')).mtimeMs;
    assert.deepEqual(reconciled(factory('trip')), status, 'a second pass reads the archive to the same base');
    assert.match(fs.readFileSync(review, 'utf8'), /^budget: 9$/m, "the tree, once seeded, is the person's");
    assert.equal(fs.statSync(statusFile('trip')).mtimeMs, written, 'a status that did not change is not written');
  });

  await s.test(
    'a restart reads it all again off the disk, a status it cannot read written again, a tree removed seeded again',
    async () => {
      const status = readStatus('trip')!;
      const tree = path.join(treeDir('trip'), REVIEW);
      const kept = fs.readFileSync(tree, 'utf8');
      fs.rmSync(statusFile('trip'));
      fs.rmSync(treeDir('trip'), { recursive: true });
      await Effect.runPromise(reconcileOnce().pipe(Effect.provideService(StoreRoot, ROOT)));
      assert.deepEqual(readStatus('trip'), status);
      assert.match(fs.readFileSync(tree, 'utf8'), /^budget: 7$/m, 'a tree removed is seeded again from the base');
      const onDisk = JSON.parse(fs.readFileSync(statusFile('trip'), 'utf8'));
      const [applied, conflicts] = status.conditions;
      fs.writeFileSync(statusFile('trip'), JSON.stringify({ ...onDisk, conditions: [{ ...applied, reason: 'Mystery' }, conflicts] }));
      assert.equal(readStatus('trip'), undefined, 'a condition word outside FactoryConditionReason reads as no status');
      assert.deepEqual(reconciled(factory('trip')), status, 'and the next pass writes it again');
      fs.writeFileSync(tree, kept);
    },
  );

  await s.test("a bare workflow name started is the tree's, and the run is told the tree's step as the person changed it", async (t) => {
    const printed = await printedBy(t, 'start', 'Cache the views', '--factory', 'trip', '--workflows', 'dev');
    const run = readRun(printed[0].split(' ')[0]);
    assert.equal(run.workflowDir, path.join(treeDir('trip'), 'workflows', 'dev'));
    assert.equal(run.workflow?.find((step) => step.name === 'review')?.budget, 9);
    assert.equal(run.factory, 'trip');
  });

  await s.test("a due schedule starts the tree's workflow, as a person's start does, never the repository's", async (t) => {
    await printedBy(t, 'factory', 'schedule', 'trip', 'dev', '--cron', '* * * * *', '--brief', 'Cache the views');
    const started = await stage.runWith(stage.board().e, startDue(repo, [], Date.parse('2100-01-01T00:00:00Z')));
    assert.ok(started && 'run' in started, `the due schedule started a run: ${JSON.stringify(started)}`);
    const run = readRun(started.run);
    assert.equal(run.workflowDir, path.join(treeDir('trip'), 'workflows', 'dev'));
    assert.equal(run.workflow?.find((step) => step.name === 'review')?.budget, 9);
  });

  await s.test('a new version packed onto the archive is drift, left as it is, and nemia factory diff previews it', async (t) => {
    const before = readStatus('trip')!;
    edit(dir, 'nemia.yaml', (spec) => {
      spec.version = '0.2.0';
    });
    edit(dir, 'workflows/dev/workflow.yaml', (spec) => {
      spec.steps[1].rounds = 5;
    });
    fs.rmSync(archive);
    await printedBy(t, 'template', 'pack', dir, '--out', archive);
    const status = reconciled(factory('trip'));
    const { message, ...drifted } = status.conditions[0];
    assert.deepEqual(drifted, { type: 'Applied', status: 'False', reason: 'VersionDrift' });
    assert.ok(message.includes('nemia factory diff trip --to 0.2.0'), message);
    assert.equal(status.digest, before.digest);
    assert.doesNotMatch(fs.readFileSync(path.join(treeDir('trip'), REVIEW), 'utf8'), /^rounds: 5$/m);
    const plan = await printedBy(t, 'factory', 'diff', 'trip', '--to', '0.2.0');
    assert.equal(plan[0], 'trip: 0.1.0 → 0.2.0');
    assert.ok(plan.includes(`  ${REVIEW}  from both, merged`), plan.join('\n'));
    assert.ok(plan.includes('conflicts: 0'), plan.join('\n'));
    assert.deepEqual(readStatus('trip'), status, 'the plan writes nothing');
    const board = stage.board();
    assert.deepEqual([board.filings, board.stopped], [[], []], 'no command of the trip filed on the engine');
  });
});
