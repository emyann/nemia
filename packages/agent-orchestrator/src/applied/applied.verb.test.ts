/**
 * A factory made from a template, on disk, beyond the round trip of `test/template-trip.test.ts` (apply of an archive, the render, the
 * tree seeded once, a start and a schedule on the tree): what apply and a start refuse with nothing written; the controller's rest at
 * its shipped five seconds; what it says of a template or parameters moved since the render; and the factory's verbs reading and
 * writing its tree, and the places apply trusts. `WF_ROOT` is set before the import, since the store's modules read it as they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { scratch } from '../../test/scratch.ts';
import { testEngine, until, WAITED } from 'agent-runtime/testing';
import { teamCopy } from '../../test/team.ts';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest } from '../../test/placed.ts';
import { heldUnasked } from '../../test/unasked.ts';
import { steeredClock } from '../../test/steered.ts';

const ROOT = scratch('wf-applied-');
process.env.WF_ROOT = ROOT;
const FACTORIES = path.join(ROOT, 'factories');
const { templated: programsAt } = await import('../../test/templated.ts');
const { exportTemplate, reconciled } = programsAt(ROOT);
const { attachWorkflow, detachWorkflow, fireAgent, hireAgent, readFactories, readFactory } = await import('../runner.ts');
const { main: cli } = await import('../cli/main.ts');
const { reconcile } = await import('./applied.verb.ts');
const { appliedDir, readStatus, treeDir } = await import('./applied.store.ts');
const { setRevisions } = await import('../factory/factory.store.ts');
const stand = eachTest(testPlace);
/** `nemia`, as a person types it, its commands given this test's place. */
const main = (argv: string[], e?: Parameters<typeof cli>[1]) => cli(argv, e, undefined, stand().place);
const { Effect } = await import('effect');
const { StoreRoot } = await import('../config/root.store.ts');

const { engineOf } = await import('../runtime-client.ts');
const engine = eachTest(testEngine);
heldUnasked(engine);

/** The engine of this test: the stand-in, which no command here files on, stops, says to or forgets from (`heldUnasked`). */
const noEngine = () => engineOf(engine().layer);

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
  readFactory(name) as ReturnType<typeof readFactory> & { template: NonNullable<ReturnType<typeof readFactory>['template']> };

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
        refusedNaming('Invalid', '--template <folder|archive>'),
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
    "REFUSED: apply of a template whose step declares an `output:` of its own: a templated step's output is its agent's alone",
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
        refusedWith('Invalid', /spec\.steps\[2\]\.output is no key of spec\.steps\[2\]/),
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
      const step = fs.readFileSync(path.join(treeDir('nested'), 'workflows', 'dev', 'implement.md'), 'utf8');
      assert.match(step, /^skills: app:y$/m, 'the applied step names the skill as the template does');
      assert.equal(fs.existsSync(path.join(treeDir('nested'), 'workflows', 'skills', 'y')), false, 'and the tree carries none');
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
    const { Fiber } = await import('effect');
    const clock = steeredClock();
    const loop = Effect.runFork(reconcile().pipe(Effect.provide(clock.layer), Effect.provideService(StoreRoot, ROOT)));
    t.after(() => Effect.runPromise(Fiber.interrupt(loop)));
    await until(t, () => clock.asked.length === 1, 'the first pass done', { bell: clock.bell });
    assert.deepEqual(clock.asked, [5_000], 'the controller rests the shipped five seconds');
    const { dir, repo } = template();
    await apply('paced', dir, repo, '--set', 'budget=7');
    await clock.adjust(4_999);
    assert.deepEqual([clock.woken, readStatus('paced')], [[], undefined], 'a millisecond early, no pass');
    await clock.adjust(1);
    await until(t, () => clock.asked.length === 2, 'the second pass done', { bell: clock.bell });
    assert.equal(readStatus('paced')?.version, '0.1.0', 'rendered by the pass at five seconds');
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
    const listed = () => readFactories().find((f) => f.name === 'drifted') as { status?: unknown };
    assert.deepEqual(listed().status, { applied: '0.1.0', conditions: first.conditions }, 'the listing reads what the controller wrote');
    const status = reconciled(templated('drifted'));
    assert.deepEqual(listed().status, { applied: '0.1.0', conditions: status.conditions });
    const { message: drift, ...drifted } = status.conditions[0];
    assert.deepEqual(drifted, { type: 'Applied', status: 'False', reason: 'VersionDrift' });
    assert.ok(drift.includes('nemia factory diff drifted --to 0.2.0'), drift);
    assert.ok(drift.includes('nemia factory upgrade drifted --to 0.2.0'), drift);
    assert.equal(status.digest, first.digest);
    assert.doesNotMatch(fs.readFileSync(path.join(treeDir('drifted'), 'workflows/dev/review.md'), 'utf8'), /^rounds: 5$/m);
    fs.writeFileSync(path.join(dir, 'nemia.yaml'), 'not: [yaml');
    assert.equal(reconciled(templated('drifted')).conditions[0].reason, 'TemplateInvalid');
  });
  await t.test(
    "parameters changed in the factory's file, or the template's files changed at its version, are said by Applied; base and tree kept",
    async (t) => {
      t.mock.method(console, 'log', () => {});
      const { dir, repo } = template();
      await apply('moved', dir, repo, '--set', 'budget=7');
      const first = reconciled(templated('moved'));
      const file = path.join(FACTORIES, 'moved.json');
      const filedAs = fs.readFileSync(file, 'utf8');
      const content = JSON.parse(filedAs);
      content.template.params.budget = 9;
      fs.writeFileSync(file, JSON.stringify(content));
      const review = (folder: string) => fs.readFileSync(path.join(folder, 'workflows/dev/review.md'), 'utf8');
      const changed = reconciled(templated('moved'));
      const { message: moved, ...params } = changed.conditions[0];
      assert.deepEqual(params, { type: 'Applied', status: 'False', reason: 'ParamsChanged' });
      assert.ok(moved.includes('nemia factory diff moved --to <version>'), moved);
      assert.ok(moved.includes('nemia factory upgrade moved --to <version>'), moved);
      assert.deepEqual([changed.digest, changed.params], [first.digest, first.params]);
      assert.match(review(appliedDir('moved')), /^budget: 7$/m);
      assert.match(review(treeDir('moved')), /^budget: 7$/m);
      fs.writeFileSync(file, filedAs);
      assert.equal(reconciled(templated('moved')).conditions[0].reason, 'Rendered', 'the parameters put back, the base is as rendered');
      edit(dir, 'workflows/dev/workflow.yaml', (spec) => {
        spec.steps[1].rounds = 5;
      });
      const edited = reconciled(templated('moved'));
      const { message: changedWords, ...contentChanged } = edited.conditions[0];
      assert.deepEqual(contentChanged, { type: 'Applied', status: 'False', reason: 'ContentChanged' });
      assert.ok(changedWords.includes('0.1.0'), changedWords);
      assert.ok(changedWords.includes('a new version'), changedWords);
      assert.equal(edited.digest, first.digest);
      assert.doesNotMatch(review(appliedDir('moved')), /^rounds: 5$/m);
      assert.doesNotMatch(review(treeDir('moved')), /^rounds: 5$/m);
    },
  );
});

test("what a templated factory's verbs read and write: its tree's wiring, instruction and parts, and the places apply trusts", async (t) => {
  await t.test(
    "a templated factory reads its tree's wiring, and attach, hire, fire, detach and revisions write the tree; none while it is not rendered",
    async (t) => {
      t.mock.method(console, 'log', () => {});
      const { dir, repo } = template();
      await apply('wired', dir, repo, '--set', 'budget=7');
      await assert.rejects(async () => attachWorkflow({ factory: 'wired', workflow: 'other' }), refusedNaming('Conflict', 'nemia up'));
      await assert.rejects(async () => setRevisions({ factory: 'wired', revisions: 'follow' }), refusedNaming('Conflict', 'nemia up'));
      reconciled(templated('wired'));
      const own = fs.readFileSync(path.join(FACTORIES, 'wired.json'), 'utf8');
      const wiring = () => JSON.parse(fs.readFileSync(path.join(treeDir('wired'), 'factory.json'), 'utf8'));
      assert.deepEqual(readFactory('wired').workflows, ['dev']);
      assert.deepEqual(readFactory('wired').hires, { 'dev/implement': 'implementer', 'dev/review': 'reviewer', 'dev/ship': 'shipper' });
      fireAgent({ factory: 'wired', step: 'dev/review' });
      hireAgent({ factory: 'wired', agent: 'implementer', step: 'dev/review' });
      assert.equal(wiring().hires['dev/review'], 'implementer');
      attachWorkflow({ factory: 'wired', workflow: 'other' });
      assert.deepEqual(wiring().workflows, ['dev', 'other']);
      detachWorkflow({ factory: 'wired', workflow: 'other' });
      assert.deepEqual(readFactory('wired').workflows, ['dev']);
      setRevisions({ factory: 'wired', revisions: 'follow' });
      assert.deepEqual(
        [wiring().revisions, readFactory('wired').revisions],
        ['follow', 'follow'],
        "the policy is the tree wiring's, read back",
      );
      assert.equal(fs.readFileSync(path.join(FACTORIES, 'wired.json'), 'utf8'), own, "the factory's own file is not written");
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
      assert.equal(fs.existsSync(treeDir('told')), false, 'an instruct refused seeds no tree');
      reconciled(templated('told'));
      await main(['factory', 'instruct', 'told', '--file', words], noEngine());
      assert.equal(fs.readFileSync(path.join(treeDir('told'), 'NEMIA.md'), 'utf8'), 'Operate the tree.\n');
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
    "the writers' place factory writes a templated factory's tree; refused without --factory, for an untemplated one, and before its render",
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
      const agent = path.join(drafts, 'scout.md');
      fs.copyFileSync(path.join(repo, 'workflows', 'agents', 'implementer.md'), agent);
      const skill = path.join(drafts, 'skills', 'tidy', 'SKILL.md');
      fs.mkdirSync(path.dirname(skill), { recursive: true });
      fs.writeFileSync(skill, '---\nname: tidy\ndescription: Tidy a folder.\n---\nTidy it.\n');
      const writes = (folder: string) => [
        ['workflows', 'write', 'factory', 'lean', '--folder', folder],
        ['agents', 'write', 'factory', '--file', agent],
        ['skills', 'write', 'factory', '--file', skill],
      ];
      for (const write of writes(beside)) {
        await assert.rejects(main(write, noEngine()), refusedNaming('Invalid', '--factory <name>'));
        await assert.rejects(main([...write, '--factory', 'written'], noEngine()), refusedNaming('Conflict', 'nemia up'));
        await assert.rejects(
          main([...write, '--factory', 'plain'], noEngine()),
          refusedWith('Invalid', /plain is not made from a template/),
        );
        await assert.rejects(
          main([...write.slice(0, 2), 'yours', ...write.slice(3), '--factory', 'written'], noEngine()),
          refusedWith('Invalid', /yours is the store's, and --factory names a factory's tree/),
        );
      }
      assert.equal(fs.existsSync(path.join(ROOT, 'workflows', 'lean')), false, 'a refused write writes nothing of yours');
      reconciled(templated('written'));
      for (const write of writes(bare)) await main([...write, '--factory', 'written'], noEngine());
      const tree = path.join(treeDir('written'), 'workflows');
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
