/**
 * A factory made from a template, on disk, beyond the round trip of `test/template-trip.test.ts` (apply of an archive, the render, the
 * tree seeded once, a start and a schedule on the tree): what apply and a start refuse with nothing written; the controller's rest at
 * its shipped five seconds; what it says of a template or parameters moved since the render; and the factory's verbs reading and
 * writing its tree, and the places apply trusts. Its store is at `ROOT`, given as `ENV`.
 */
import { configGiven } from '../../../test/config-given.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { scratch } from 'test-kit/scratch';
import { testEngine, until, WAITED } from 'agent-runtime/testing';
import { teamCopy } from '../../../test/team.ts';
import { testPlace } from '../../../place/memory/index.ts';
import { eachTest, runOver } from '../../../test/placed.ts';
import { heldUnasked } from '../../../test/unasked.ts';
import { steeredClock } from '../../../test/steered.ts';
import { templated as programsAt } from '../../../test/templated.ts';
import { attachWorkflowAt, fireAgentAt, hireAgentAt, readFactoriesAt, readFactoryAt } from '../factory.store.ts';
import { main as cli } from '../../cli/main.ts';
import { reconcile } from './applied.verb.ts';
import { appliedDir, readStatus, statusFile, treeDir } from './applied.store.ts';
import { detached, followed } from '../../../test/factory-planted.ts';
import { Effect, Fiber } from 'effect';
import { StoreRoot } from '../../config/root.store.ts';
import { engineOf } from '../../runtime-client.ts';
import { FACTORY_APPLY } from './applied.verb.ts';
import { FACTORY_UPGRADE } from '../upgrade/upgrade.verb.ts';
import { runWith as runEngine } from '../../runtime-client.ts';
import { withBuiltins } from '../../../test/templated.ts';
import { agentDraftOf, skillDraftOf, type StepDraft } from '../../workflow.ts';
import { AGENTS_WRITE, draftSteps, factoryDraftOf, SKILLS_WRITE, WORKFLOWS_WRITE } from '../../runner.ts';
import type { Env } from '../../config/config.store.ts';

const ROOT = scratch('wf-applied-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT };
const FACTORIES = path.join(ROOT, 'factories');
const { exportTemplate, reconciled, reconciledAt } = programsAt(ROOT);
const stand = eachTest(testPlace);
/** `nemia`, as a person types it, its commands given this test's place. */
const main = (argv: string[], e?: Parameters<typeof cli>[1]) => cli(argv, e, undefined, stand().place, ENV);

const engine = eachTest(testEngine);
heldUnasked(engine);

/** The engine of this test: the stand-in, which no command here files on, stops, says to or forgets from (`heldUnasked`). */
const noEngine = () => engineOf(engine().layer);

/** A program — a writer's handler, as the api calls it — run at this test's store, on its place. */
const runWith = runOver(runEngine, () => stand().layer, ENV);

/** Refused by kind, exit 2, and the message — never `String(err)`, which starts with `Error: `. */
const refusedWith = (tag: 'Missing' | 'Conflict' | 'Invalid', pattern: RegExp) => (err: Error & { exitCode?: number; _tag?: string }) =>
  err._tag === tag && err.exitCode === 2 && pattern.test(err.message);

/** A refusal of kind `tag`, exit 2, whose message names each of `tokens`: the facts it carries and the fix it names. */
const refusedNaming =
  (tag: 'Missing' | 'Conflict' | 'Invalid', ...tokens: string[]) =>
  (err: Error & { exitCode?: number; _tag?: string }) =>
    err._tag === tag && err.exitCode === 2 && tokens.every((token) => err.message.includes(token));

/** A repository holding the tests' team as its `workflows/`, in one commit, so a start has a base to record. */
function repoWithTeam(): string {
  const repo = scratch('wf-applied-repo-');
  fs.renameSync(teamCopy(), path.join(repo, 'workflows'));
  stand().world.repository(repo, {});
  stand().world.commit(repo, 'base');
  return repo;
}

/** The tests' team exported as a template, `budget` a parameter of the review step with no default, and `model` one with a default. */
function template(): { dir: string; repo: string } {
  const repo = repoWithTeam();
  const dir = path.join(scratch('wf-applied-template-'), 'team');
  exportTemplate({ dir, from: repo });
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
  return { dir, repo };
}

/** The document `file` of `dir`, its spec changed by `change`. */
function edit(dir: string, file: string, change: (spec: Record<string, any>) => void): void {
  const doc = parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  change(doc.spec);
  fs.writeFileSync(path.join(dir, file), stringify(doc, { lineWidth: 0 }));
}

/** Every file under the factories folder, by its path in it, so a refusal is seen to have written nothing. */
const filed = (): string[] => (fs.existsSync(FACTORIES) ? (fs.readdirSync(FACTORIES, { recursive: true }) as string[]).sort() : []);

/** `nemia factory apply` of the template `dir` as `name`, in the repository `repo`, with `rest` after. */
const apply = (name: string, dir: string, repo: string, ...rest: string[]) =>
  main(['factory', 'apply', name, '--template', dir, '--repo', repo, ...rest], noEngine());

/** The factory `name`, read as the controller reads it. */
const templated = (name: string) =>
  readFactoryAt(ROOT, name) as ReturnType<typeof readFactoryAt> & { template: NonNullable<ReturnType<typeof readFactoryAt>['template']> };

test('what apply and a start of a templated factory refuse, by kind and exit 2, writing nothing', async (t) => {
  await t.test(
    'apply refuses a key not declared, a value of the wrong type and a required one not given, every one at once, and writes nothing',
    async (t) => {
      t.mock.method(console, 'log', () => {});
      const { dir, repo } = template();
      const before = filed();
      await assert.rejects(
        apply('refused', dir, repo, '--set', 'colour=red', '--set', 'model=x'),
        refusedNaming('Invalid', '2 problems', '--set colour=red', 'colour', 'budget', '--set'),
      );
      await assert.rejects(
        apply('refused', dir, repo, '--set', 'budget=lots'),
        refusedWith('Invalid', /--set budget=lots: budget is a number/),
      );
      await assert.rejects(apply('refused', dir, repo), refusedWith('Invalid', /budget has no default, and no --set gives it/));
      await assert.rejects(
        main(['factory', 'apply', 'refused', '--repo', repo], noEngine()),
        refusedNaming('Invalid', '--template <name|folder|archive>'),
      );
      fs.writeFileSync(path.join(dir, 'nemia.yaml'), fs.readFileSync(path.join(dir, 'nemia.yaml'), 'utf8').replace('v1alpha1', 'v2'));
      await assert.rejects(
        apply('refused', dir, repo, '--set', 'budget=3'),
        refusedWith('Invalid', /nemia\.yaml:1:\d+: apiVersion is "nemia\.dev\/v2"/),
      );
      assert.deepEqual(filed(), before);
    },
  );
  await t.test(
    "REFUSED: apply of a template whose step names its own `output:` as a bare file, not the {path:} from the template's root it takes",
    async () => {
      const { dir, repo } = template();
      edit(dir, 'workflows/dev/workflow.yaml', (spec) => {
        spec.steps[2].output = 'own.schema.json';
      });
      fs.writeFileSync(
        path.join(dir, 'workflows', 'dev', 'own.schema.json'),
        JSON.stringify({ type: 'object', properties: { message: { type: 'string' } }, required: ['message'], additionalProperties: false }),
      );
      const before = filed();
      await assert.rejects(
        apply('owned', dir, repo, '--set', 'budget=3'),
        refusedWith('Invalid', /spec\.steps\[2\]\.output is a map of keys/),
      );
      assert.deepEqual(filed(), before);
    },
  );
  await t.test(
    'REFUSED: a start of a template whose step names a skill named with its folder, on a repository that lacks it, by name',
    async () => {
      const from = repoWithTeam();
      fs.mkdirSync(path.join(from, 'app', '.claude', 'skills', 'y'), { recursive: true });
      fs.writeFileSync(path.join(from, 'app', '.claude', 'skills', 'y', 'SKILL.md'), '---\ndescription: Nested.\n---\nDo it.\n');
      const implement = path.join(from, 'workflows', 'dev', 'implement.md');
      fs.writeFileSync(
        implement,
        fs.readFileSync(implement, 'utf8').replace('agent: implementer\n', 'agent: implementer\nskills: app:y\n'),
      );
      const dir = path.join(scratch('wf-applied-template-'), 'team');
      exportTemplate({ dir, from });
      const lacking = repoWithTeam();
      await apply('nested', dir, lacking);
      reconciled(templated('nested'));
      const step = fs.readFileSync(path.join(treeDir(ROOT, 'nested'), 'workflows', 'dev', 'implement.md'), 'utf8');
      assert.match(step, /^skills: app:y$/m, 'the applied step names the skill as the template does');
      assert.equal(fs.existsSync(path.join(treeDir(ROOT, 'nested'), 'workflows', 'skills', 'y')), false, 'and the tree carries none');
      const at = path.join(lacking, 'app', '.claude', 'skills', 'y');
      await assert.rejects(
        async () => await main(['start', 'Use the nested skill', '--factory', 'nested', '--workflows', 'dev'], noEngine()),
        (err: Error) =>
          err.message.includes(
            `implement: \`skills: app:y\` adds the skill \`app:y\`, which cannot be used — \`app:y\` is the skill \`y\` of the repository's folder \`app\`, and ${at} holds no SKILL.md.`,
          ),
      );
    },
  );
});

test(
  'REFUSED at shipped defaults: a factory applied after a pass is not rendered before five seconds, and is at the next pass',
  WAITED,
  async (t) => {
    t.mock.method(console, 'log', () => {});
    const clock = steeredClock();
    const loop = Effect.runFork(reconcile().pipe(Effect.provide(clock.layer), Effect.provideService(StoreRoot, ROOT)));
    t.after(() => Effect.runPromise(Fiber.interrupt(loop)));
    await until(t, () => clock.asked.length === 1, 'the first pass done', { bell: clock.bell });
    assert.deepEqual(clock.asked, [5_000], 'the controller rests the shipped five seconds');
    const { dir, repo } = template();
    await apply('paced', dir, repo, '--set', 'budget=7');
    await clock.adjust(4_999);
    assert.deepEqual([clock.woken, readStatus(ROOT, 'paced')], [[], undefined], 'a millisecond early, no pass');
    await clock.adjust(1);
    await until(t, () => clock.asked.length === 2, 'the second pass done', { bell: clock.bell });
    assert.equal(readStatus(ROOT, 'paced')?.version, '0.1.0', 'rendered by the pass at five seconds');
  },
);

test('what the controller says of a template or parameters moved since the render, its base and tree kept', async (t) => {
  await t.test('a template moved to another version is drift: the base and tree are left as they are, and Applied says so', async (t) => {
    t.mock.method(console, 'log', () => {});
    const { dir, repo } = template();
    await apply('drifted', dir, repo, '--set', 'budget=7');
    const first = reconciled(templated('drifted'));
    edit(dir, 'nemia.yaml', (spec) => {
      spec.version = '0.2.0';
    });
    edit(dir, 'workflows/dev/workflow.yaml', (spec) => {
      spec.steps[1].rounds = 5;
    });
    const listed = () => readFactoriesAt(ROOT).find((f) => f.name === 'drifted') as { status?: unknown };
    assert.deepEqual(listed().status, { applied: '0.1.0', conditions: first.conditions }, 'the listing reads what the controller wrote');
    const status = reconciled(templated('drifted'));
    assert.deepEqual(listed().status, { applied: '0.1.0', conditions: status.conditions });
    const { message: drift, lastTransitionTime: _driftedAt, ...drifted } = status.conditions[0];
    assert.deepEqual(drifted, { type: 'Applied', status: 'False', reason: 'VersionDrift' });
    assert.ok(drift.includes('nemia factory diff drifted --to 0.2.0'), drift);
    assert.ok(drift.includes('nemia factory upgrade drifted --to 0.2.0'), drift);
    assert.equal(status.digest, first.digest);
    assert.doesNotMatch(fs.readFileSync(path.join(treeDir(ROOT, 'drifted'), 'workflows/dev/review.md'), 'utf8'), /^rounds: 5$/m);
    fs.writeFileSync(path.join(dir, 'nemia.yaml'), 'not: [yaml');
    assert.equal(reconciled(templated('drifted')).conditions[0].reason, 'TemplateInvalid');
  });
  await t.test(
    "parameters changed in the factory's file alone are merged at its version; changed with the template's files under it, said by Applied, base and tree kept",
    async (t) => {
      t.mock.method(console, 'log', () => {});
      const { dir, repo } = template();
      await apply('moved', dir, repo, '--set', 'budget=7');
      const first = reconciled(templated('moved'));
      const file = path.join(FACTORIES, 'moved.json');
      const params = (budget: number) => {
        const content = JSON.parse(fs.readFileSync(file, 'utf8'));
        content.template.params.budget = budget;
        fs.writeFileSync(file, JSON.stringify(content));
      };
      const review = (folder: string) => fs.readFileSync(path.join(folder, 'workflows/dev/review.md'), 'utf8');
      params(9);
      const merged = reconciled(templated('moved'));
      assert.deepEqual([merged.version, merged.conditions[0].reason, merged.params.budget], ['0.1.0', 'Upgraded', 9]);
      assert.match(review(appliedDir(ROOT, 'moved')), /^budget: 9$/m);
      assert.match(review(treeDir(ROOT, 'moved')), /^budget: 9$/m);
      const workflow = path.join(dir, 'workflows/dev/workflow.yaml');
      const released = fs.readFileSync(workflow, 'utf8');
      edit(dir, 'workflows/dev/workflow.yaml', (spec) => {
        spec.steps[1].rounds = 5;
      });
      params(11);
      const both = reconciled(templated('moved'));
      const { message: moved, lastTransitionTime: _movedAt, ...together } = both.conditions[0];
      assert.deepEqual(together, { type: 'Applied', status: 'False', reason: 'ParamsChanged' });
      assert.ok(moved.includes('nemia factory diff moved --to <version> --set'), moved);
      assert.ok(moved.includes('put the template'), moved);
      assert.deepEqual([both.digest, both.params], [merged.digest, merged.params]);
      assert.match(review(appliedDir(ROOT, 'moved')), /^budget: 9$/m);
      assert.match(review(treeDir(ROOT, 'moved')), /^budget: 9$/m);
      fs.writeFileSync(workflow, released);
      const restored = reconciled(templated('moved'));
      assert.deepEqual(
        [restored.conditions[0].reason, restored.params.budget],
        ['Upgraded', 11],
        "the template's files put back, the parameters merge",
      );
      assert.match(review(treeDir(ROOT, 'moved')), /^budget: 11$/m);
      edit(dir, 'workflows/dev/workflow.yaml', (spec) => {
        spec.steps[1].rounds = 5;
      });
      const edited = reconciled(templated('moved'));
      const { message: changedWords, lastTransitionTime: _editedAt, ...contentChanged } = edited.conditions[0];
      assert.deepEqual(contentChanged, { type: 'Applied', status: 'False', reason: 'ContentChanged' });
      assert.ok(changedWords.includes('0.1.0'), changedWords);
      assert.ok(changedWords.includes('a new version'), changedWords);
      assert.equal(edited.digest, restored.digest);
      assert.notEqual(edited.digest, first.digest);
      assert.doesNotMatch(review(appliedDir(ROOT, 'moved')), /^rounds: 5$/m);
      assert.doesNotMatch(review(treeDir(ROOT, 'moved')), /^rounds: 5$/m);
    },
  );
});

test("the controller stamps each condition with when its status last moved, and the factory's generation it read", async (t) => {
  t.mock.method(console, 'log', () => {});
  const { repo, dir } = template();
  await apply('stamped', dir, repo, '--set', 'budget=7');
  const file = path.join(FACTORIES, 'stamped.json');
  const times = (status: { conditions: readonly { type: string; status: string; lastTransitionTime?: string }[] }) =>
    status.conditions.map((c) => [c.type, c.status, c.lastTransitionTime]);
  const at = ['2026-11-01T09:00:00.000Z', '2026-11-01T09:00:05.000Z', '2026-11-01T09:00:10.000Z', '2026-11-01T09:00:15.000Z'];
  await t.test('a condition the factory did not have is stamped with the time of the pass', () => {
    assert.deepEqual(times(reconciledAt(templated('stamped'), at[0])), [
      ['Applied', 'True', at[0]],
      ['ConflictsPending', 'False', at[0]],
    ]);
  });
  await t.test('a pass that observes the same status keeps the time each condition moved, and writes nothing', () => {
    const before = fs.readFileSync(statusFile(ROOT, 'stamped'), 'utf8');
    assert.deepEqual(times(reconciledAt(templated('stamped'), at[1])), [
      ['Applied', 'True', at[0]],
      ['ConflictsPending', 'False', at[0]],
    ]);
    assert.equal(fs.readFileSync(statusFile(ROOT, 'stamped'), 'utf8'), before);
  });
  await t.test("a condition whose status flips is stamped with the pass's time, the other keeps its own", () => {
    edit(dir, 'workflows/dev/workflow.yaml', (spec) => {
      spec.steps[1].rounds = 5;
    });
    assert.deepEqual(times(reconciledAt(templated('stamped'), at[2])), [
      ['Applied', 'False', at[2]],
      ['ConflictsPending', 'False', at[0]],
    ]);
  });
  await t.test('a status written before the field is stamped with the time of the pass that reads it', () => {
    const status = JSON.parse(fs.readFileSync(statusFile(ROOT, 'stamped'), 'utf8'));
    for (const c of status.conditions) delete c.lastTransitionTime;
    fs.writeFileSync(statusFile(ROOT, 'stamped'), JSON.stringify(status));
    assert.deepEqual(times(reconciledAt(templated('stamped'), at[3])), [
      ['Applied', 'False', at[3]],
      ['ConflictsPending', 'False', at[3]],
    ]);
  });
  await t.test("observedGeneration is the factory's generation the pass read: 1 for a file without one, else its own", () => {
    const content = JSON.parse(fs.readFileSync(file, 'utf8'));
    delete content.generation;
    fs.writeFileSync(file, JSON.stringify(content));
    assert.equal(reconciledAt(templated('stamped'), at[3]).observedGeneration, 1);
    fs.writeFileSync(file, JSON.stringify({ ...content, generation: 5 }));
    assert.equal(reconciledAt(templated('stamped'), at[3]).observedGeneration, 5);
    assert.equal(readStatus(ROOT, 'stamped')?.observedGeneration, 5, 'and it is written');
  });
});

/** The status of `name` rewritten as the controller wrote it before it named templates: with no `template`, changed by `change`. */
function unnamed(name: string, change: (status: Record<string, unknown>) => void = () => {}): void {
  const { template: _named, ...status } = JSON.parse(fs.readFileSync(statusFile(ROOT, name), 'utf8'));
  change(status);
  fs.writeFileSync(statusFile(ROOT, name), JSON.stringify(status));
}

test('the controller names the template a base holds, even where the base is no longer the render, so a switch from it can be told', async (t) => {
  await t.test('a base that is the render is named after its template', async (t) => {
    t.mock.method(console, 'log', () => {});
    const { dir, repo } = template();
    await apply('as-rendered', dir, repo, '--set', 'budget=7');
    assert.equal(reconciled(templated('as-rendered')).template, 'team');
  });
  await t.test(
    "the template's files changed under its version (ContentChanged): the base is named after the template the file names",
    async (t) => {
      t.mock.method(console, 'log', () => {});
      const { dir, repo } = template();
      await apply('content', dir, repo, '--set', 'budget=7');
      reconciled(templated('content'));
      edit(dir, 'workflows/dev/workflow.yaml', (spec) => {
        spec.steps[1].rounds = 5;
      });
      unnamed('content');
      const status = reconciled(templated('content'));
      assert.deepEqual([status.conditions[0].reason, status.template], ['ContentChanged', 'team']);
      assert.equal(readStatus(ROOT, 'content')?.template, 'team', 'and written');
    },
  );
  await t.test('the template moved to another version (VersionDrift): named', async (t) => {
    t.mock.method(console, 'log', () => {});
    const { dir, repo } = template();
    await apply('drift', dir, repo, '--set', 'budget=7');
    reconciled(templated('drift'));
    edit(dir, 'nemia.yaml', (spec) => {
      spec.version = '0.2.0';
    });
    unnamed('drift');
    const status = reconciled(templated('drift'));
    assert.deepEqual([status.conditions[0].reason, status.template], ['VersionDrift', 'team']);
  });
  await t.test(
    "the parameters in the factory's file changed with the template's files under its version (ParamsChanged): named",
    async (t) => {
      t.mock.method(console, 'log', () => {});
      const { dir, repo } = template();
      await apply('params', dir, repo, '--set', 'budget=7');
      reconciled(templated('params'));
      edit(dir, 'workflows/dev/workflow.yaml', (spec) => {
        spec.steps[1].rounds = 5;
      });
      const file = path.join(FACTORIES, 'params.json');
      const content = JSON.parse(fs.readFileSync(file, 'utf8'));
      content.template.params.budget = 9;
      fs.writeFileSync(file, JSON.stringify(content));
      unnamed('params');
      const status = reconciled(templated('params'));
      assert.deepEqual([status.conditions[0].reason, status.template], ['ParamsChanged', 'team']);
    },
  );
  await t.test("an upgrade under way: the factory's file names the template wanted, not the base's, so no name is written", async (t) => {
    t.mock.method(console, 'log', () => {});
    const { dir, repo } = template();
    await apply('under-way', dir, repo, '--set', 'budget=7');
    reconciled(templated('under-way'));
    edit(dir, 'workflows/dev/workflow.yaml', (spec) => {
      spec.steps[1].rounds = 5;
    });
    unnamed('under-way', (status) => {
      status.upgrade = { from: '0.1.0', to: '0.2.0', conflicts: [] };
    });
    assert.equal(reconciled(templated('under-way')).template, undefined);
  });
});

test("what a templated factory's verbs read and write: its tree's wiring, instruction and parts, and the places apply trusts", async (t) => {
  await t.test(
    "a templated factory reads its tree's wiring, and attach, hire, fire, detach and revisions write the tree; none while it is not rendered",
    async (t) => {
      t.mock.method(console, 'log', () => {});
      const { dir, repo } = template();
      await apply('wired', dir, repo, '--set', 'budget=7');
      await assert.rejects(
        async () => attachWorkflowAt(ROOT, { factory: 'wired', workflow: 'other' }),
        refusedNaming('Conflict', 'nemia up'),
      );
      await assert.rejects(async () => followed(ROOT, 'wired', 'follow'), refusedNaming('Conflict', 'nemia up'));
      reconciled(templated('wired'));
      const own = fs.readFileSync(path.join(FACTORIES, 'wired.json'), 'utf8');
      const wiring = () => JSON.parse(fs.readFileSync(path.join(treeDir(ROOT, 'wired'), 'factory.json'), 'utf8'));
      assert.deepEqual(readFactoryAt(ROOT, 'wired').workflows, ['dev', 'triage']);
      assert.deepEqual(readFactoryAt(ROOT, 'wired').hires, {
        'dev/implement': 'implementer',
        'dev/review': 'reviewer',
        'dev/ship': 'shipper',
        'triage/build-backend': 'implementer',
        'triage/build-web': 'implementer',
        'triage/notes': 'implementer',
        'triage/plan': 'reviewer',
      });
      fireAgentAt(ROOT, { factory: 'wired', step: 'dev/review' });
      hireAgentAt(ROOT, { factory: 'wired', agent: 'implementer', step: 'dev/review' });
      assert.equal(wiring().hires['dev/review'], 'implementer');
      attachWorkflowAt(ROOT, { factory: 'wired', workflow: 'other' });
      assert.deepEqual(wiring().workflows, ['dev', 'other', 'triage']);
      detached(ROOT, 'wired', 'other');
      assert.deepEqual(readFactoryAt(ROOT, 'wired').workflows, ['dev', 'triage']);
      attachWorkflowAt(ROOT, { factory: 'wired', workflow: 'dev', repo: path.basename(repo) });
      assert.deepEqual(
        [wiring().workflowRepos, readFactoryAt(ROOT, 'wired').workflowRepos],
        [{ dev: path.basename(repo) }, { dev: path.basename(repo) }],
        "a workflow's repository is written into the tree's wiring, as the attach is, and read back",
      );
      followed(ROOT, 'wired', 'follow');
      assert.deepEqual(
        [wiring().revisions, readFactoryAt(ROOT, 'wired').revisions],
        ['follow', 'follow'],
        "the policy is the tree wiring's, read back",
      );
      assert.deepEqual(
        JSON.parse(fs.readFileSync(path.join(FACTORIES, 'wired.json'), 'utf8')),
        { ...JSON.parse(own), generation: 7 },
        "the factory's own file is written only for its generation, one more for each change of the tree's wiring: fire, hire, attach, detach, a workflow's repository, revisions",
      );
      const tree = fs.readFileSync(path.join(treeDir(ROOT, 'wired'), 'factory.json'), 'utf8');
      const notes = scratch('wf-applied-volume-');
      await main(['factory', 'volume', 'add', 'wired', `${notes}:ro`], noEngine());
      const file = JSON.parse(fs.readFileSync(path.join(FACTORIES, 'wired.json'), 'utf8'));
      const volume = { path: notes, readOnly: true, name: path.basename(notes).toLowerCase() };
      assert.deepEqual(file.volumes, [volume], "a volume is the factory's own, in its file, under the name its folder gives it");
      assert.equal(fs.readFileSync(path.join(treeDir(ROOT, 'wired'), 'factory.json'), 'utf8'), tree, 'and never in its tree');
      assert.deepEqual(readFactoryAt(ROOT, 'wired').volumes, [volume]);
    },
  );
  await t.test(
    "a templated factory's instruction is its tree's NEMIA.md, written by instruct; and rm removes it all, its read-only base included",
    async (t) => {
      t.mock.method(console, 'log', () => {});
      const { dir, repo } = template();
      await apply('told', dir, repo, '--set', 'budget=7');
      const words = path.join(scratch('wf-applied-words-'), 'words.md');
      fs.writeFileSync(words, 'Operate the tree.\n');
      await assert.rejects(
        main(['factory', 'instruct', 'told', '--file', words], noEngine()),
        refusedWith('Conflict', /its tree is not rendered yet/),
      );
      assert.equal(fs.existsSync(treeDir(ROOT, 'told')), false, 'an instruct refused seeds no tree');
      reconciled(templated('told'));
      await main(['factory', 'instruct', 'told', '--file', words], noEngine());
      assert.equal(fs.readFileSync(path.join(treeDir(ROOT, 'told'), 'NEMIA.md'), 'utf8'), 'Operate the tree.\n');
      await assert.rejects(
        main(['factory', 'instruction', 'told', '--store'], noEngine()),
        refusedWith('Invalid', /its instruction is its tree's NEMIA\.md/),
      );
      await main(['factory', 'rm', 'told'], noEngine());
      assert.deepEqual(
        filed().filter((f) => f.startsWith('told')),
        [],
      );
    },
  );
  await t.test(
    "the writers' place factory writes a templated factory's tree through each writer's handler; refused without a factory, for an untemplated one, and before its render",
    async (t) => {
      t.mock.method(console, 'log', () => {});
      const { dir, repo } = template();
      await apply('written', dir, repo, '--set', 'budget=7');
      await main(['factory', 'add', 'plain', '--repo', repo], noEngine());
      const drafts = scratch('wf-applied-drafts-');
      const beside = path.join(drafts, 'workflows', 'lean');
      fs.cpSync(path.join(repo, 'workflows', 'dev'), beside, { recursive: true });
      for (const part of ['agents', 'skills'])
        fs.cpSync(path.join(repo, 'workflows', part), path.join(drafts, 'workflows', part), { recursive: true });
      const bare = path.join(scratch('wf-applied-bare-'), 'lean');
      fs.cpSync(path.join(repo, 'workflows', 'dev'), bare, { recursive: true });
      const agent = agentDraftOf('scout', fs.readFileSync(path.join(repo, 'workflows', 'agents', 'implementer.md'), 'utf8'));
      const skill = skillDraftOf('tidy/SKILL.md', 'tidy', '---\nname: tidy\ndescription: Tidy a folder.\n---\nTidy it.\n');
      const handled = <A, E>(program: Parameters<typeof runWith<A, E>>[1]) => runWith(noEngine(), program);
      const besideDraft = await handled(draftSteps(beside, { home: ROOT }));
      const writes = (draft: StepDraft[], factory?: string, from = 'factory') => {
        const at = { from, ...(factory !== undefined && { factory }) };
        return [
          WORKFLOWS_WRITE.handler({ ...at, name: 'lean', draft }),
          AGENTS_WRITE.handler({ ...at, draft: agent, schema: null }),
          SKILLS_WRITE.handler({ ...at, change: skill }),
        ] as Parameters<typeof runWith<unknown, unknown>>[1][];
      };
      for (const write of writes(besideDraft)) await assert.rejects(handled(write), refusedNaming('Invalid', '--factory <name>'));
      for (const write of writes(besideDraft, 'written')) await assert.rejects(handled(write), refusedNaming('Conflict', 'nemia up'));
      for (const write of writes(besideDraft, 'plain'))
        await assert.rejects(handled(write), refusedWith('Invalid', /plain is not made from a template/));
      for (const write of writes(besideDraft, 'written', 'yours'))
        await assert.rejects(handled(write), refusedWith('Invalid', /yours is the store's, and --factory names a factory's tree/));
      assert.equal(fs.existsSync(path.join(ROOT, 'workflows', 'lean')), false, 'a refused write writes nothing of yours');
      reconciled(templated('written'));
      const { places, fills } = factoryDraftOf(ROOT, 'written', 'lean');
      for (const write of writes(await handled(draftSteps(bare, places, fills)), 'written')) await handled(write);
      const tree = path.join(treeDir(ROOT, 'written'), 'workflows');
      assert.ok(
        fs.existsSync(path.join(tree, 'lean', 'review.md')),
        "the workflow is written into the tree's, its agents read in the tree",
      );
      assert.ok(fs.existsSync(path.join(tree, 'agents', 'scout.md')), "the agent is written into the tree's agents");
      assert.ok(fs.existsSync(path.join(tree, 'skills', 'tidy', 'SKILL.md')), "the skill is written into the tree's skills");
      assert.equal(fs.existsSync(path.join(ROOT, 'workflows', 'lean')), false, 'nothing of yours is written');
    },
  );
  await t.test(
    'apply trusts the places it files, a workspace on the repository it was cut from, and says the place and the way back; --no-trust writes nothing',
    async (t) => {
      const before = process.env.CLAUDE_CONFIG_DIR;
      const config = scratch('wf-applied-harness-');
      process.env.CLAUDE_CONFIG_DIR = config;
      t.after(() => {
        process.env.CLAUDE_CONFIG_DIR = before;
      });
      const printed: string[] = [];
      t.mock.method(console, 'log', (...args: unknown[]) => printed.push(args.join(' ')));
      const { dir, repo } = template();
      const workspace = path.join(scratch('wf-applied-ws-'), 'one');
      assert.ok('answer' in stand().place.askNow('make', { repo, at: workspace, run: 'r', leaf: 'one', from: 'main', also: [] }));
      const plain = scratch('wf-applied-plain-');

      await apply('quiet', dir, repo, '--set', 'budget=3', '--no-trust');
      assert.deepEqual(trustedIn(config), []);
      assert.deepEqual(
        printed.filter((l) => /trusted for|not trusted/.test(l)),
        [],
      );

      await apply('trusting', dir, workspace, '--repo', plain, '--set', 'budget=3');
      assert.deepEqual(trustedIn(config).sort(), [plain, repo].sort());
      const lines = printed.join('\n').split('\n');
      assert.ok(lines.includes(`trusted for Claude Code: ${workspace} (kept under ${repo})`), lines.join('\n'));
      assert.ok(
        lines.includes(`  take it back: set projects["${plain}"].hasTrustDialogAccepted to false in ${path.join(config, '.claude.json')}`),
        lines.join('\n'),
      );
    },
  );
});

/** The folders the harness's file in `dir` says are trusted, in order. */
const trustedIn = (dir: string): string[] => {
  const file = path.join(dir, '.claude.json');
  if (!fs.existsSync(file)) return [];
  const { projects } = JSON.parse(fs.readFileSync(file, 'utf8')) as { projects: Record<string, { hasTrustDialogAccepted?: boolean }> };
  return Object.keys(projects).filter((key) => projects[key].hasTrustDialogAccepted === true);
};

/** `nemia factory apply`'s handler, its template the word `given`, with `builtins` as the folder of the builtin templates. */
const applyNamed = (builtins: string, name: string, given: string, repo: string, ...sets: string[]) =>
  runEngine(
    noEngine(),
    withBuiltins(FACTORY_APPLY.handler({ name, template: given, repos: [repo], sets, noTrust: true }), builtins).pipe(
      Effect.provide(stand().layer),
      Effect.provide(configGiven(ROOT, ENV)),
    ),
  );

test('a builtin template, named: applied, recorded by its name, read wherever Nemia keeps it, and upgraded when it moves', async (t) => {
  const s = { builtins: '', repo: '', file: path.join(FACTORIES, 'named.json') };
  await t.test('applied by its name: the factory records the name and the version, and a pass renders it', async () => {
    const { dir, repo } = template();
    Object.assign(s, { builtins: path.dirname(dir), repo });
    const done = await applyNamed(s.builtins, 'named', 'team', repo, 'budget=3');
    assert.deepEqual([done.template.source, done.template.version, done.place], ['team', '0.1.0', dir]);
    assert.deepEqual(JSON.parse(fs.readFileSync(s.file, 'utf8')).template, {
      source: 'team',
      version: '0.1.0',
      params: done.template.params,
    });
    const status = programsAt(ROOT, s.builtins).reconciled(templated('named'));
    assert.deepEqual([status.conditions[0].reason, status.version], ['Rendered', '0.1.0']);
    assert.ok(fs.existsSync(path.join(treeDir(ROOT, 'named'), 'workflows/dev/review.md')), 'the tree is seeded');
  });
  await t.test(
    'the name, not the folder: the templates moved elsewhere, the old folder gone, read the same, and the file is unchanged',
    async () => {
      const moved = scratch('wf-applied-moved-');
      fs.cpSync(s.builtins, moved, { recursive: true });
      fs.rmSync(s.builtins, { recursive: true });
      const before = fs.readFileSync(s.file, 'utf8');
      assert.equal(programsAt(ROOT, moved).reconciled(templated('named')).conditions[0].reason, 'Rendered');
      assert.equal(fs.readFileSync(s.file, 'utf8'), before);
      s.builtins = moved;
    },
  );
  await t.test('the builtin template moved to 0.2.0 is drift, and upgrade --to with no --template takes it by its name', async () => {
    const dir = path.join(s.builtins, 'team');
    edit(dir, 'nemia.yaml', (spec) => {
      spec.version = '0.2.0';
    });
    edit(dir, 'workflows/dev/workflow.yaml', (spec) => {
      spec.steps[1].rounds = 5;
    });
    const drift = programsAt(ROOT, s.builtins).reconciled(templated('named'));
    assert.equal(drift.conditions[0].reason, 'VersionDrift');
    const volumes = [{ path: scratch('wf-applied-kept-'), readOnly: false }];
    const harnessSettings = { claude: { attribution: { commit: '', pr: '' } } };
    fs.writeFileSync(s.file, JSON.stringify({ ...JSON.parse(fs.readFileSync(s.file, 'utf8')), volumes, harnessSettings }));
    await runEngine(
      noEngine(),
      withBuiltins(FACTORY_UPGRADE.handler({ factory: 'named', to: '0.2.0' }), s.builtins).pipe(
        Effect.provide(stand().layer),
        Effect.provide(configGiven(ROOT, ENV)),
      ),
    );
    const { source, version } = JSON.parse(fs.readFileSync(s.file, 'utf8')).template;
    assert.deepEqual([source, version], ['team', '0.2.0']);
    assert.deepEqual(JSON.parse(fs.readFileSync(s.file, 'utf8')).volumes, volumes, 'an upgrade keeps the volumes');
    assert.deepEqual(JSON.parse(fs.readFileSync(s.file, 'utf8')).harnessSettings, harnessSettings, 'and the harness settings');
    assert.equal(programsAt(ROOT, s.builtins).reconciled(templated('named')).conditions[0].reason, 'Upgraded');
  });
  await t.test(
    'REFUSED by the controller: a recorded name no builtin template has any longer is TemplateInvalid, its base and tree kept',
    async () => {
      const digest = readStatus(ROOT, 'named')?.digest;
      const { template: _named, ...unnamed } = JSON.parse(fs.readFileSync(statusFile(ROOT, 'named'), 'utf8'));
      fs.writeFileSync(statusFile(ROOT, 'named'), JSON.stringify(unnamed));
      const gone = programsAt(ROOT, scratch('wf-applied-none-')).reconciled(templated('named'));
      assert.equal(gone.template, 'team', 'a builtin is named by the name it is recorded by, even where none has it any longer');
      const { message, lastTransitionTime: _goneAt, ...applied } = gone.conditions[0];
      assert.deepEqual(applied, { type: 'Applied', status: 'False', reason: 'TemplateInvalid' });
      assert.ok(message.includes('./team'), message);
      assert.equal(gone.digest, digest);
      assert.ok(fs.existsSync(path.join(treeDir(ROOT, 'named'), 'workflows/dev/review.md')));
    },
  );
  await t.test('REFUSED Missing, nothing filed: a name no builtin template has, and any name where there is none', async () => {
    const before = filed();
    await assert.rejects(applyNamed(s.builtins, 'nope', 'nope', s.repo, 'budget=3'), refusedNaming('Missing', 'team', './nope'));
    const none = path.join(scratch('wf-applied-none-'), 'templates');
    await assert.rejects(applyNamed(none, 'nope', 'team', s.repo, 'budget=3'), refusedNaming('Missing', 'no builtin template', './team'));
    assert.deepEqual(filed(), before);
  });
});
