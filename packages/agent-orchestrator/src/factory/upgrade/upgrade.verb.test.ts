/**
 * A templated factory's upgrade, on disk, beyond the story of a conflict (`test/upgrade-conflict.test.ts`: the plan, the wait, the
 * choices, the merge, a pass stopped between its writes, a run in flight and the swap only where untouched): what `nemia factory
 * upgrade` refuses with nothing written; an upgrade with no conflict, up or down; a step's own closeout schema; the factory's rules,
 * `RULES.md`, carried as any file of the tree is; choices made for another version; a status lost; and a swap whose rename fails.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { scratch } from 'test-kit/scratch';
import { testEngine } from 'agent-runtime/testing';
import { STEP_OUTPUT_SCHEMA, teamCopy } from '../../../test/team.ts';
import { testPlace } from '../../../place/memory/index.ts';
import { eachTest, runOver } from '../../../test/placed.ts';
import { heldUnasked } from '../../../test/unasked.ts';
import type { Served } from '../../command/entry.verb.ts';
import type { Args } from '../../command/command.ts';
import { templated as programsAt } from '../../../test/templated.ts';
import { FACTORY_RULES, factoryRules, runWith as runEngine } from '../../runner.ts';
import { readFactoryAt } from '../factory.store.ts';
import { factoryTyped } from '../../../test/factory-typed.ts';
import { appliedDir, digestOf, entriesIn, resolutionsFile, statusFile, swapTree, treeDir } from '../applied/applied.store.ts';
import { engineOf } from '../../runtime-client.ts';
import { FACTORY_PLAN, FACTORY_UPGRADE } from './upgrade.verb.ts';
import { withBuiltins } from '../../../test/templated.ts';
import type { Env } from '../../config/config.store.ts';
import { approveProgram } from '../../approval/approve.verb.ts';
import { PERSON } from '../../caller/caller.ts';

const ROOT = scratch('wf-upgrade-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT };
const FACTORIES = path.join(ROOT, 'factories');
const { exportTemplate, reconciled } = programsAt(ROOT);
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer, ENV);
/** `nemia`, as a story of the factories types it (`factoryTyped`), its commands given this test's place. */
const main = (argv: string[], e?: Parameters<typeof factoryTyped>[1]) => factoryTyped(argv, e, undefined, stand().place, ENV);

const stood = eachTest(testEngine);
heldUnasked(stood);

/** The engine of this test: the stand-in, which no command here files on, stops, says to or forgets from (`heldUnasked`). */
const noEngine = () => engineOf(stood().layer);

/** Refused by kind, exit 2, and the message — never `String(err)`, which starts with `Error: `. */
const refusedWith =
  (tag: 'Missing' | 'Conflict' | 'Invalid', ...patterns: RegExp[]) =>
  (err: Error & { exitCode?: number; _tag?: string }) =>
    err._tag === tag && err.exitCode === 2 && patterns.every((pattern) => pattern.test(err.message));

/** A repository holding the tests' team as its `workflows/`, in one commit, so a start has a base to record. */
function repoWithTeam(): string {
  const repo = scratch('wf-upgrade-repo-');
  fs.renameSync(teamCopy(), path.join(repo, 'workflows'));
  stand().world.repository(repo, {});
  stand().world.commit(repo, 'base');
  return repo;
}

/** The document `file` of `dir`, its spec changed by `change`. */
function edit(dir: string, file: string, change: (spec: Record<string, any>) => void): void {
  const doc = parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  change(doc.spec);
  fs.writeFileSync(path.join(dir, file), stringify(doc, { lineWidth: 0 }));
}

/**
 * The tests' team exported as a template at 0.1.0, `budget` a parameter of the review step, applied as `name` and rendered once; with
 * `rules`, the template holds them as its `RULES.md`.
 */
async function applied(name: string, rules?: string): Promise<{ dir: string; repo: string }> {
  const repo = repoWithTeam();
  const dir = path.join(scratch('wf-upgrade-template-'), 'team');
  exportTemplate({ dir, from: repo });
  if (rules !== undefined) fs.writeFileSync(path.join(dir, RULES), rules);
  edit(dir, 'nemia.yaml', (spec) => {
    spec.parameters = { budget: { type: 'number', description: 'dollars for a review' } };
  });
  edit(dir, 'workflows/dev/workflow.yaml', (spec) => {
    spec.steps[1].budget = { param: 'budget' };
  });
  await main(['factory', 'apply', name, '--template', dir, '--repo', repo, '--set', 'budget=7'], noEngine());
  reconciled(templated(name));
  return { dir, repo };
}

/** The template `dir` moved to `version`, its review step's rounds `rounds`. */
function released(dir: string, version: string, rounds: number): void {
  edit(dir, 'nemia.yaml', (spec) => {
    spec.version = version;
  });
  edit(dir, 'workflows/dev/workflow.yaml', (spec) => {
    spec.steps[1].rounds = rounds;
  });
}

/** The factory `name`, read as the controller reads it. */
const templated = (name: string) =>
  readFactoryAt(ROOT, name) as ReturnType<typeof readFactoryAt> & { template: NonNullable<ReturnType<typeof readFactoryAt>['template']> };

/** Every file under `dir`, by its path in it, with its bytes, so a refusal is seen to have written nothing. */
const bytesUnder = (dir: string): Record<string, string> =>
  Object.fromEntries(
    (fs.readdirSync(dir, { recursive: true }) as string[])
      .filter((f) => fs.statSync(path.join(dir, f)).isFile())
      .sort()
      .map((f) => [f, fs.readFileSync(path.join(dir, f), 'base64')]),
  );

/** The text of `file` in the factory `name`'s `folder`, its tree or its base. */
const textIn = (folder: string, file: string): string => fs.readFileSync(path.join(folder, file), 'utf8');

/** The review step's file, as a factory's tree or base holds it. */
const REVIEW = 'workflows/dev/review.md';
const README = 'workflows/dev/README.md';

/** A factory's rules, as its tree, its base and its template hold them. */
const RULES = 'RULES.md';

/** `file` in `folder` with `from` replaced by `to`. */
const rewrite = (folder: string, file: string, from: string, to: string): void => {
  const text = textIn(folder, file);
  assert.ok(text.includes(from), `${file} holds ${from}`);
  fs.writeFileSync(path.join(folder, file), text.replace(from, to));
};

/** What `nemia factory diff <args>` previews of an upgrade: the versions, the switch, and what files it. */
type Previewed = {
  name: string;
  from?: string;
  to: string;
  next: { line: string; digest: string; dropped: readonly string[] };
  switched?: { from: string; to: string };
};

/** The upgrade `nemia factory diff <args>` previews. */
const previewOf = async (...args: string[]): Promise<Previewed> => (await main(['factory', 'diff', ...args], noEngine())) as Previewed;

test('upgrade refuses, writing nothing: no template, no render, a --to that is no version, the template at another, the same, a downgrade; and diff no --template on a hand-made one', async (t) => {
  t.mock.method(console, 'log', () => {});
  const { dir, repo } = await applied('kept');
  await main(['factory', 'add', 'plain', '--repo', repo], noEngine());
  await main(['factory', 'apply', 'unrendered', '--template', dir, '--repo', repo, '--set', 'budget=7'], noEngine());
  const before = bytesUnder(FACTORIES);
  const upgrade = (name: string, ...rest: string[]) => main(['factory', 'upgrade', name, ...rest], noEngine());
  await assert.rejects(upgrade('plain', '--to', '0.2.0'), refusedWith('Invalid', /plain is not made from a template/));
  await assert.rejects(upgrade('unrendered', '--to', '0.2.0'), refusedWith('Conflict', /unrendered is not rendered yet[^]*nemia up/));
  await assert.rejects(upgrade('kept', '--to', '2'), refusedWith('Invalid', /--to <x\.y\.z>/));
  await assert.rejects(
    upgrade('kept', '--to', '0.2.0'),
    refusedWith('Conflict', /is at version 0\.1\.0, not 0\.2\.0: /, /--template <name\|folder\|archive>/),
  );
  await assert.rejects(upgrade('kept', '--to', '0.1.0'), refusedWith('Conflict', /kept is already applied at 0\.1\.0/));
  edit(dir, 'workflows/dev/workflow.yaml', (spec) => {
    spec.steps[1].rounds = 5;
  });
  await assert.rejects(
    upgrade('kept', '--to', '0.1.0'),
    refusedWith('Conflict', /the template at 0\.1\.0 now renders other content: /, /give it a new version/),
  );
  released(dir, '0.0.9', 5);
  await assert.rejects(upgrade('kept', '--to', '0.0.9'), refusedWith('Conflict', /0\.0\.9 is below 0\.1\.0[^]*--to 0\.0\.9 --downgrade/));
  released(dir, '0.2.0', 5);
  const diff = (name: string, ...rest: string[]) => main(['factory', 'diff', name, ...rest], noEngine());
  await assert.rejects(diff('plain', '--to', '0.2.0'), refusedWith('Invalid', /--template </));
  edit(dir, 'nemia.yaml', (spec) => {
    spec.parameters.gated = { type: 'boolean', description: 'a gate before the ship' };
  });
  await assert.rejects(upgrade('kept', '--to', '0.2.0'), refusedWith('Invalid', /gated has no default/));
  assert.deepEqual(bytesUnder(FACTORIES), before, 'every refusal writes nothing');
});

test('an upgrade with no conflict, up or down: filed alone, then merged by the controller', async (t) => {
  await t.test('a downgrade asked with --downgrade is filed, and merged as an upgrade is', async (t) => {
    t.mock.method(console, 'log', () => {});
    const { dir } = await applied('lowered');
    released(dir, '0.0.9', 5);
    await main(['factory', 'upgrade', 'lowered', '--to', '0.0.9', '--downgrade'], noEngine());
    assert.equal(templated('lowered').template.version, '0.0.9');
    assert.equal(reconciled(templated('lowered')).version, '0.0.9');
    assert.match(textIn(treeDir(ROOT, 'lowered'), REVIEW), /^rounds: 5$/m);
  });
  await t.test(
    "a clean upgrade writes the factory's file alone; the controller swaps the tree, then the base, and a second pass writes nothing",
    async (t) => {
      t.mock.method(console, 'log', () => {});
      const { dir } = await applied('clean');
      const file = path.join(FACTORIES, 'clean.json');
      const filedAs = JSON.parse(fs.readFileSync(file, 'utf8'));
      rewrite(treeDir(ROOT, 'clean'), REVIEW, 'budget: 7', 'budget: 9');
      released(dir, '0.2.0', 5);
      const folder = bytesUnder(path.join(FACTORIES, 'clean'));
      const filed = await main(['factory', 'upgrade', 'clean', '--to', '0.2.0'], noEngine());
      assert.deepEqual(filed, { name: 'clean', from: '0.1.0', to: '0.2.0', file, dropped: [], conflicts: 0 });
      assert.deepEqual(
        JSON.parse(fs.readFileSync(file, 'utf8')),
        { ...filedAs, template: { ...filedAs.template, version: '0.2.0' }, generation: 2 },
        'the template wanted is a change of its spec, counted',
      );
      assert.deepEqual(bytesUnder(path.join(FACTORIES, 'clean')), folder, 'the upgrade writes no tree, base nor status');
      const status = reconciled(templated('clean'));
      assert.equal(status.version, '0.2.0');
      assert.deepEqual(
        status.conditions.map((c) => [c.type, c.status, c.reason]),
        [
          ['Applied', 'True', 'Upgraded'],
          ['ConflictsPending', 'False', 'Merged'],
        ],
      );
      assert.match(
        textIn(treeDir(ROOT, 'clean'), REVIEW),
        /^budget: 9\nloop: implement\nrounds: 5$/m,
        "the template's change and the person's",
      );
      assert.match(textIn(appliedDir(ROOT, 'clean'), REVIEW), /^budget: 7\nloop: implement\nrounds: 5$/m, 'the base is the render');
      assert.equal(status.digest, digestOf(entriesIn(appliedDir(ROOT, 'clean'))));
      assert.equal(fs.statSync(path.join(appliedDir(ROOT, 'clean'), REVIEW)).mode & 0o222, 0, 'the base is read-only again');
      const written = fs.statSync(statusFile(ROOT, 'clean')).mtimeMs;
      const tree = bytesUnder(treeDir(ROOT, 'clean'));
      assert.deepEqual(reconciled(templated('clean')), status);
      assert.equal(fs.statSync(statusFile(ROOT, 'clean')).mtimeMs, written, 'a second pass writes no status');
      assert.deepEqual(bytesUnder(treeDir(ROOT, 'clean')), tree, 'nor a tree');
      await assert.rejects(
        main(['factory', 'upgrade', 'clean', '--to', '0.2.0'], noEngine()),
        refusedWith('Conflict', /clean is already applied at 0\.2\.0/),
      );
    },
  );
});

test('a switch onto a template of another name is judged by no version: neither already applied at the same number nor a downgrade', async (t) => {
  for (const [name, version] of [
    ['level', '0.1.0'],
    ['below', '0.0.9'],
  ] as const)
    await t.test(
      `the other template at ${version}, the base at 0.1.0: previewed, then filed with its plan and no --downgrade`,
      async (t) => {
        t.mock.method(console, 'log', () => {});
        const { dir } = await applied(name);
        const other = path.join(scratch('wf-upgrade-other-'), 'renamed');
        fs.cpSync(dir, other, { recursive: true });
        const manifest = parse(fs.readFileSync(path.join(other, 'nemia.yaml'), 'utf8'));
        manifest.metadata.name = 'renamed';
        fs.writeFileSync(path.join(other, 'nemia.yaml'), stringify(manifest, { lineWidth: 0 }));
        released(other, version, 5);
        const preview = await previewOf(name, '--to', version, '--template', other);
        assert.deepEqual([preview.switched, preview.from, preview.to], [{ from: 'team', to: 'renamed' }, '0.1.0', version]);
        const { line } = preview.next;
        assert.doesNotMatch(line, /--downgrade/);
        const plan = /--plan (sha256:[0-9a-f]{64})/.exec(line)?.[1];
        assert.ok(plan, line);
        await main(['factory', 'upgrade', name, '--to', version, '--template', other, '--plan', plan], noEngine());
        assert.deepEqual([templated(name).template.version, templated(name).template.source], [version, other]);
      },
    );
});

test('an upgrade onto a template that declares other parameters: --set given, the undeclared dropped and named, held to the previewed plan', async (t) => {
  t.mock.method(console, 'log', () => {});
  const { dir } = await applied('onto');
  const other = path.join(scratch('wf-upgrade-other-'), 'team');
  fs.cpSync(dir, other, { recursive: true });
  released(other, '0.2.0', 5);
  edit(other, 'nemia.yaml', (spec) => {
    spec.parameters = { cap: { type: 'number', description: 'dollars for a review, capped' } };
  });
  edit(other, 'workflows/dev/workflow.yaml', (spec) => {
    spec.steps[1].budget = { param: 'cap' };
  });
  const file = path.join(FACTORIES, 'onto.json');
  const filedAs = JSON.parse(fs.readFileSync(file, 'utf8'));
  const before = bytesUnder(FACTORIES);
  const onto = ['onto', '--to', '0.2.0', '--template', other];
  await assert.rejects(main(['factory', 'diff', ...onto], noEngine()), refusedWith('Invalid', /cap has no default/));
  const preview = await previewOf(...onto, '--set', 'cap=9');
  assert.deepEqual(preview.next.dropped, ['budget']);
  const { digest } = preview.next;
  assert.match(digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(preview.next.line, `nemia factory upgrade onto --to 0.2.0 --template ${other} --set cap=9 --plan ${digest}`);
  const stale = (await previewOf(...onto, '--set', 'cap=8')).next.digest;
  assert.notEqual(stale, digest, 'another --set is another plan');
  const upgrade = (...rest: string[]) => main(['factory', 'upgrade', ...onto, ...rest], noEngine());
  await assert.rejects(upgrade('--set', 'cap=9'), refusedWith('Invalid', /nemia factory diff onto --to 0\.2\.0/));
  await assert.rejects(upgrade('--set', 'cap=9', '--plan', stale), refusedWith('Conflict', /nemia factory diff onto --to 0\.2\.0/));
  await assert.rejects(
    upgrade('--set', 'cap=9', '--set', 'budget=3', '--plan', digest),
    refusedWith('Invalid', /declares no parameter budget/),
  );
  const defaulted = path.join(scratch('wf-upgrade-defaulted-'), 'team');
  fs.cpSync(other, defaulted, { recursive: true });
  edit(defaulted, 'nemia.yaml', (spec) => {
    spec.parameters.cap.default = 5;
  });
  const bare = ['onto', '--to', '0.2.0', '--template', defaulted];
  const dropping = await previewOf(...bare);
  assert.deepEqual(dropping.next.dropped, ['budget']);
  assert.match(
    dropping.next.line,
    new RegExp(`^nemia factory upgrade onto --to 0\\.2\\.0 --template \\S+ --plan sha256:[0-9a-f]{64}$`),
    'a parameter dropped with no --set given still holds the upgrade to its plan',
  );
  await assert.rejects(main(['factory', 'upgrade', ...bare], noEngine()), refusedWith('Invalid', /nemia factory diff onto --to 0\.2\.0/));
  assert.deepEqual(bytesUnder(FACTORIES), before, 'the previews and every refusal write nothing');
  const folder = bytesUnder(path.join(FACTORIES, 'onto'));
  const filed = (await main(['factory', 'upgrade', ...onto, '--set', 'cap=9', '--plan', digest], noEngine())) as { dropped: string[] };
  assert.deepEqual(filed.dropped, ['budget']);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {
    ...filedAs,
    template: { source: other, version: '0.2.0', params: { cap: 9 } },
    generation: 2,
  });
  assert.deepEqual(bytesUnder(path.join(FACTORIES, 'onto')), folder, 'the upgrade writes no tree, base nor status');
  const status = reconciled(templated('onto'));
  assert.equal(status.version, '0.2.0');
  assert.deepEqual(
    status.conditions.map((c) => [c.type, c.status, c.reason]),
    [
      ['Applied', 'True', 'Upgraded'],
      ['ConflictsPending', 'False', 'Merged'],
    ],
  );
  assert.match(textIn(appliedDir(ROOT, 'onto'), REVIEW), /^budget: 9$/m, 'rendered with the --set');
});

test("a step's own closeout schema carried by an upgrade: its line merged into a step the person changed, its file beside it", async (t) => {
  t.mock.method(console, 'log', () => {});
  const { dir } = await applied('schemed');
  const IMPLEMENT = 'workflows/dev/implement.md';
  const SCHEMA = 'workflows/dev/implement.schema.json';
  assert.doesNotMatch(textIn(treeDir(ROOT, 'schemed'), IMPLEMENT), /^output:/m, 'the template at 0.1.0 names no schema of the step');
  fs.appendFileSync(path.join(treeDir(ROOT, 'schemed'), IMPLEMENT), '\nKeep the commits small.\n');
  released(dir, '0.2.0', 5);
  edit(dir, 'workflows/dev/workflow.yaml', (spec) => {
    spec.steps[0].output = { path: SCHEMA };
  });
  fs.writeFileSync(path.join(dir, SCHEMA), STEP_OUTPUT_SCHEMA);
  await main(['factory', 'upgrade', 'schemed', '--to', '0.2.0'], noEngine());
  const status = reconciled(templated('schemed'));
  assert.equal(status.version, '0.2.0');
  assert.equal(status.upgrade, undefined, 'no conflict');
  const step = textIn(treeDir(ROOT, 'schemed'), IMPLEMENT);
  assert.match(step, /^output: implement\.schema\.json$/m, "the template's line");
  assert.match(step, /^Keep the commits small\.$/m, "the person's words");
  assert.equal(textIn(treeDir(ROOT, 'schemed'), SCHEMA), STEP_OUTPUT_SCHEMA);
  assert.equal(textIn(appliedDir(ROOT, 'schemed'), SCHEMA), STEP_OUTPUT_SCHEMA);
});

test("a factory's rules carried by an upgrade: taken where the tree has none, a conflict where both added them, merged by line", async (t) => {
  await t.test("a factory's rules are carried by an upgrade: taken from a template that adds them, where the tree has none", async (t) => {
    t.mock.method(console, 'log', () => {});
    const { dir } = await applied('ruled');
    assert.equal(fs.existsSync(path.join(treeDir(ROOT, 'ruled'), RULES)), false, 'the template had none, and the tree has none');
    released(dir, '0.2.0', 5);
    fs.writeFileSync(path.join(dir, RULES), 'Never push on a Friday.\n');
    await main(['factory', 'upgrade', 'ruled', '--to', '0.2.0'], noEngine());
    const status = reconciled(templated('ruled'));
    assert.equal(status.version, '0.2.0');
    assert.equal(status.upgrade, undefined, 'no conflict');
    assert.equal(textIn(treeDir(ROOT, 'ruled'), RULES), 'Never push on a Friday.\n');
    assert.equal(textIn(appliedDir(ROOT, 'ruled'), RULES), 'Never push on a Friday.\n');
    assert.deepEqual(factoryRules(ROOT, 'ruled'), {
      name: 'ruled',
      file: path.join(treeDir(ROOT, 'ruled'), RULES),
      words: 'Never push on a Friday.',
      error: null,
    });
  });
  await t.test(
    'rules the person wrote and rules the template adds, with none in the base, are one conflict at RULES.md, resolved by a Factory proposal that a pass leaves fresh',
    async (t) => {
      t.mock.method(console, 'log', () => {});
      const { dir } = await applied('both');
      await runWith(noEngine(), FACTORY_RULES.handler({ factory: 'both', words: 'Ours: push whenever.' }));
      assert.equal(textIn(treeDir(ROOT, 'both'), RULES), 'Ours: push whenever.\n', "a templated factory's rules are its tree's");
      released(dir, '0.2.0', 5);
      fs.writeFileSync(path.join(dir, RULES), 'Theirs: never push on a Friday.\n');
      await main(['factory', 'upgrade', 'both', '--to', '0.2.0'], noEngine());
      const waiting = reconciled(templated('both'));
      assert.equal(waiting.version, '0.1.0');
      assert.deepEqual(waiting.upgrade?.conflicts, [
        { at: RULES, base: null, ours: 'Ours: push whenever.\n', theirs: 'Theirs: never push on a Friday.\n' },
      ]);
      assert.equal(textIn(treeDir(ROOT, 'both'), RULES), 'Ours: push whenever.\n', 'left as it is while the conflict waits');
      await main(['factory', 'resolve', 'both', RULES, '--theirs'], noEngine());
      const proposal: string = JSON.parse(fs.readFileSync(resolutionsFile(ROOT, 'both'), 'utf8')).proposals?.['Factory/both'] ?? '';
      assert.ok(proposal, 'the rules are proposed as the Factory');
      const recorded = reconciled(templated('both'));
      assert.equal(recorded.version, '0.1.0', 'the merge waits on the proposal');
      assert.deepEqual(recorded.upgrade?.conflicts[0]?.proposal, { name: proposal, phase: 'waiting' }, 'the status names it');
      await runWith(noEngine(), approveProgram(PERSON, 'both', proposal, { home: ROOT }));
      const merged = reconciled(templated('both'));
      assert.equal(merged.version, '0.2.0');
      assert.equal(merged.upgrade, undefined);
      assert.equal(textIn(treeDir(ROOT, 'both'), RULES), 'Theirs: never push on a Friday.\n');
    },
  );
  await t.test('rules changed by the person and by the template on different lines, from a common base, merge by line', async (t) => {
    t.mock.method(console, 'log', () => {});
    const lines = ['Never push on a Friday.', '', 'Write the tests first.', '', 'Ask before a migration.', ''];
    const { dir } = await applied('lined', lines.join('\n'));
    assert.equal(textIn(treeDir(ROOT, 'lined'), RULES), lines.join('\n'));
    rewrite(treeDir(ROOT, 'lined'), RULES, 'on a Friday', 'on a Friday, nor on a Monday');
    released(dir, '0.2.0', 5);
    rewrite(dir, RULES, 'before a migration', 'before any migration');
    await main(['factory', 'upgrade', 'lined', '--to', '0.2.0'], noEngine());
    const status = reconciled(templated('lined'));
    assert.equal(status.version, '0.2.0');
    assert.equal(status.upgrade, undefined, 'no conflict');
    assert.equal(
      textIn(treeDir(ROOT, 'lined'), RULES),
      ['Never push on a Friday, nor on a Monday.', '', 'Write the tests first.', '', 'Ask before any migration.', ''].join('\n'),
    );
  });
});

test('choices made for another version are not merged, and the next resolve drops them', async (t) => {
  t.mock.method(console, 'log', () => {});
  const { dir } = await applied('stale');
  rewrite(treeDir(ROOT, 'stale'), REVIEW, 'rounds: 3', 'rounds: 4');
  rewrite(treeDir(ROOT, 'stale'), README, '# dev\n', '# dev, ours\n');
  released(dir, '0.2.0', 5);
  rewrite(dir, README, '# dev\n', '# dev, theirs\n');
  await main(['factory', 'upgrade', 'stale', '--to', '0.2.0'], noEngine());
  await main(['factory', 'resolve', 'stale', `${REVIEW}#rounds`, '--theirs'], noEngine());
  await main(['factory', 'resolve', 'stale', `${README}:1-1`, '--ours'], noEngine());
  released(dir, '0.3.0', 6);
  rewrite(dir, README, '# dev, theirs\n', '# dev, three\n');
  await main(['factory', 'upgrade', 'stale', '--to', '0.3.0'], noEngine());
  const tree = bytesUnder(treeDir(ROOT, 'stale'));
  const waiting = reconciled(templated('stale'));
  assert.deepEqual(
    waiting.upgrade?.conflicts.map((c) => c.at),
    [`${README}:1-1`, `${REVIEW}#rounds`],
    'the choices for 0.2.0 answer no conflict of 0.3.0',
  );
  assert.deepEqual(bytesUnder(treeDir(ROOT, 'stale')), tree, 'and nothing is merged with them');
  await main(['factory', 'resolve', 'stale', `${README}:1-1`, '--theirs'], noEngine());
  assert.deepEqual(JSON.parse(fs.readFileSync(resolutionsFile(ROOT, 'stale'), 'utf8')), {
    to: '0.3.0',
    template: 'team',
    base: digestOf(entriesIn(appliedDir(ROOT, 'stale'))),
    choices: { [`${README}:1-1`]: 'theirs' },
  });
  assert.deepEqual(
    reconciled(templated('stale')).upgrade?.conflicts.map((c) => [c.at, c.proposal]),
    [
      [`${README}:1-1`, undefined],
      [`${REVIEW}#rounds`, undefined],
    ],
    "the proposal made for 0.2.0 answers no conflict of 0.3.0, and a choice for a workflow's conflict is a draft until its proposal",
  );
});

test("REFUSED Invalid, nothing proposed: a workflow's conflict resolved with text its step does not read; the choice stays a draft", async (t) => {
  t.mock.method(console, 'log', () => {});
  const { dir } = await applied('unread');
  rewrite(treeDir(ROOT, 'unread'), REVIEW, 'rounds: 3', 'rounds: 4');
  released(dir, '0.2.0', 5);
  await main(['factory', 'upgrade', 'unread', '--to', '0.2.0'], noEngine());
  const broken = path.join(scratch('wf-upgrade-unread-'), 'rounds.md');
  fs.writeFileSync(broken, 'rounds: [5\n');
  await assert.rejects(main(['factory', 'resolve', 'unread', `${REVIEW}#rounds`, '--file', broken], noEngine()), refusedWith('Invalid'));
  assert.equal(fs.existsSync(path.join(FACTORIES, 'unread', 'proposals')), false, 'nothing is proposed');
  const kept = JSON.parse(fs.readFileSync(resolutionsFile(ROOT, 'unread'), 'utf8'));
  assert.deepEqual([kept.choices, kept.proposals], [{ [`${REVIEW}#rounds`]: { text: 'rounds: [5\n' } }, undefined]);
});

/** The plan's digest `nemia factory diff` previewed in `preview`, and the line that files it. */
const planIn = (preview: Previewed): { plan: string; line: string } => ({ plan: preview.next.digest, line: preview.next.line });

test('a parameter set again at the version applied: previewed, filed with its plan, merged with no new version', async (t) => {
  await t.test("it merges with no conflict, and the factory's file records the new value", async (t) => {
    t.mock.method(console, 'log', () => {});
    await applied('reset');
    const file = path.join(FACTORIES, 'reset.json');
    const filedAs = JSON.parse(fs.readFileSync(file, 'utf8'));
    rewrite(treeDir(ROOT, 'reset'), REVIEW, 'rounds: 3', 'rounds: 4');
    const before = bytesUnder(FACTORIES);
    const preview = await previewOf('reset', '--to', '0.1.0', '--set', 'budget=9');
    assert.deepEqual([preview.from, preview.to, preview.switched], ['0.1.0', '0.1.0', undefined]);
    const { plan, line } = planIn(preview);
    assert.match(plan, /^sha256:[0-9a-f]{64}$/);
    assert.equal(line, `nemia factory upgrade reset --to 0.1.0 --set budget=9 --plan ${plan}`);
    assert.doesNotMatch(line, /--downgrade/);
    const { plan: stale } = planIn(await previewOf('reset', '--to', '0.1.0', '--set', 'budget=8'));
    const upgrade = (...rest: string[]) => main(['factory', 'upgrade', 'reset', '--to', '0.1.0', '--set', 'budget=9', ...rest], noEngine());
    await assert.rejects(upgrade(), refusedWith('Invalid', /nemia factory diff reset --to 0\.1\.0 --set budget=9/));
    await assert.rejects(upgrade('--plan', stale), refusedWith('Conflict', /nemia factory diff reset --to 0\.1\.0/));
    assert.deepEqual(bytesUnder(FACTORIES), before, 'the previews and the refusals write nothing');
    const folder = bytesUnder(path.join(FACTORIES, 'reset'));
    await upgrade('--plan', plan);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {
      ...filedAs,
      template: { ...filedAs.template, params: { budget: 9 } },
      generation: 2,
    });
    assert.deepEqual(bytesUnder(path.join(FACTORIES, 'reset')), folder, 'the upgrade writes no tree, base nor status');
    const status = reconciled(templated('reset'));
    assert.deepEqual([status.version, status.params], ['0.1.0', { budget: 9 }]);
    assert.deepEqual(
      status.conditions.map((c) => [c.type, c.status, c.reason]),
      [
        ['Applied', 'True', 'Upgraded'],
        ['ConflictsPending', 'False', 'Merged'],
      ],
    );
    assert.match(
      textIn(treeDir(ROOT, 'reset'), REVIEW),
      /^budget: 9\nloop: implement\nrounds: 4$/m,
      "the new value and the person's change",
    );
    assert.match(textIn(appliedDir(ROOT, 'reset'), REVIEW), /^budget: 9\nloop: implement\nrounds: 3$/m, 'the base is the new render');
    await assert.rejects(upgrade(), refusedWith('Conflict', /reset is already applied at 0\.1\.0/));
  });
  await t.test('REFUSED Conflict, nothing written: a --set at the version applied, where the template changed under it', async (t) => {
    t.mock.method(console, 'log', () => {});
    const { dir } = await applied('edited');
    edit(dir, 'workflows/dev/workflow.yaml', (spec) => {
      spec.steps[1].rounds = 5;
    });
    const before = bytesUnder(FACTORIES);
    for (const verb of ['diff', 'upgrade'])
      await assert.rejects(
        main(['factory', verb, 'edited', '--to', '0.1.0', '--set', 'budget=9'], noEngine()),
        refusedWith('Conflict', /the template at 0\.1\.0 now renders other content/),
      );
    assert.deepEqual(bytesUnder(FACTORIES), before);
  });
  await t.test(
    'a conflict at the version applied waits for a choice, made against its base, which no later change at that version takes',
    async (t) => {
      t.mock.method(console, 'log', () => {});
      await applied('clash');
      const set = async (value: number) => {
        const sets = ['--to', '0.1.0', '--set', `budget=${value}`];
        const { plan } = planIn(await previewOf('clash', ...sets));
        await main(['factory', 'upgrade', 'clash', ...sets, '--plan', plan], noEngine());
      };
      rewrite(treeDir(ROOT, 'clash'), REVIEW, 'budget: 7', 'budget: 8');
      await set(9);
      const waiting = reconciled(templated('clash'));
      assert.deepEqual(
        [waiting.conditions[1].status, waiting.conditions[1].reason, waiting.upgrade?.conflicts.map((c) => c.at)],
        ['True', 'Conflicts', [`${REVIEW}#budget`]],
      );
      assert.match(textIn(treeDir(ROOT, 'clash'), REVIEW), /^budget: 8$/m, 'left as it is while the conflict waits');
      await main(['factory', 'resolve', 'clash', `${REVIEW}#budget`, '--theirs'], noEngine());
      const resolutions = JSON.parse(fs.readFileSync(resolutionsFile(ROOT, 'clash'), 'utf8'));
      const proposal: string = resolutions.proposals?.['Workflow/dev'] ?? '';
      assert.deepEqual(resolutions, {
        to: '0.1.0',
        template: 'team',
        base: digestOf(entriesIn(appliedDir(ROOT, 'clash'))),
        choices: { [`${REVIEW}#budget`]: 'theirs' },
        proposals: { 'Workflow/dev': proposal },
      });
      assert.equal(reconciled(templated('clash')).conditions[0].reason, 'UpgradePending', 'the workflow waits on its proposal');
      await runWith(noEngine(), approveProgram(PERSON, 'clash', proposal, { home: ROOT }));
      assert.equal(reconciled(templated('clash')).conditions[0].reason, 'Upgraded');
      assert.match(textIn(treeDir(ROOT, 'clash'), REVIEW), /^budget: 9$/m);
      rewrite(treeDir(ROOT, 'clash'), REVIEW, 'budget: 9', 'budget: 6');
      await set(11);
      const again = reconciled(templated('clash'));
      assert.deepEqual(
        again.upgrade?.conflicts.map((c) => c.at),
        [`${REVIEW}#budget`],
        'the choice made before the last merge landed answers no conflict of the next',
      );
      assert.match(textIn(treeDir(ROOT, 'clash'), REVIEW), /^budget: 6$/m);
    },
  );
});

test('a status lost while an upgrade waits leaves the version unknown, and an upgrade naming the base version brings it back', async (t) => {
  t.mock.method(console, 'log', () => {});
  const { dir } = await applied('lost');
  const old = path.join(scratch('wf-upgrade-old-'), 'team');
  fs.cpSync(dir, old, { recursive: true });
  released(dir, '0.2.0', 5);
  await main(['factory', 'upgrade', 'lost', '--to', '0.2.0'], noEngine());
  fs.rmSync(statusFile(ROOT, 'lost'));
  const tree = bytesUnder(treeDir(ROOT, 'lost'));
  const base = bytesUnder(appliedDir(ROOT, 'lost'));
  const unknown = reconciled(templated('lost'));
  assert.equal(unknown.version, null, 'the base is not the render, and no status names its version');
  assert.deepEqual([unknown.conditions[0].status, unknown.conditions[0].reason], ['False', 'VersionUnknown']);
  assert.match(unknown.conditions[0].message, /nemia factory upgrade lost --to <it>/);
  assert.deepEqual(bytesUnder(treeDir(ROOT, 'lost')), tree, 'the tree is left as it is');
  assert.deepEqual(bytesUnder(appliedDir(ROOT, 'lost')), base, 'and the base');
  await assert.rejects(
    main(['factory', 'resolve', 'lost', `${REVIEW}#rounds`, '--ours'], noEngine()),
    refusedWith('Conflict', /no status names the version lost's base was applied at/),
  );

  await main(['factory', 'upgrade', 'lost', '--to', '0.1.0', '--template', old], noEngine());
  const named = reconciled(templated('lost'));
  assert.deepEqual([named.version, named.conditions[0].reason], ['0.1.0', 'Rendered']);
  await main(['factory', 'upgrade', 'lost', '--to', '0.2.0', '--template', dir], noEngine());
  const merged = reconciled(templated('lost'));
  assert.deepEqual([merged.version, merged.conditions[0].reason], ['0.2.0', 'Upgraded']);
  assert.match(textIn(treeDir(ROOT, 'lost'), REVIEW), /^rounds: 5$/m);
});

test("a swap whose new tree cannot be renamed in puts the person's tree back, or keeps it aside and says where", async (t) => {
  t.mock.method(console, 'log', () => {});
  await applied('stuck');
  rewrite(treeDir(ROOT, 'stuck'), REVIEW, 'budget: 7', 'budget: 8');
  const tree = bytesUnder(treeDir(ROOT, 'stuck'));
  const merge = entriesIn(appliedDir(ROOT, 'stuck'));
  const rename = fs.renameSync;
  const renamingIn = (from: fs.PathLike, to: fs.PathLike) => to === treeDir(ROOT, 'stuck') && !String(from).endsWith('.old');
  const failing = t.mock.method(fs, 'renameSync', (from: fs.PathLike, to: fs.PathLike) => {
    if (renamingIn(from, to)) throw Object.assign(new Error('EIO: i/o error, rename'), { code: 'EIO' });
    rename(from, to);
  });
  assert.throws(
    () => swapTree(ROOT, 'stuck', merge, digestOf(entriesIn(treeDir(ROOT, 'stuck')))),
    (err: Error) => /EIO/.test(err.message),
  );
  failing.mock.restore();
  assert.deepEqual(bytesUnder(treeDir(ROOT, 'stuck')), tree, "the person's tree is put back whole");
  assert.deepEqual(fs.readdirSync(path.join(FACTORIES, 'stuck')).sort(), ['applied', 'status.json', 'tree']);

  t.mock.method(fs, 'renameSync', (from: fs.PathLike, to: fs.PathLike) => {
    if (renamingIn(from, to)) fs.mkdirSync(path.join(treeDir(ROOT, 'stuck'), 'seeded'), { recursive: true });
    rename(from, to);
  });
  let kept = '';
  assert.throws(
    () => swapTree(ROOT, 'stuck', merge, digestOf(entriesIn(treeDir(ROOT, 'stuck')))),
    (err: Error) => {
      kept = /kept in (\S+);/.exec(err.message)?.[1] ?? '';
      return /could not be replaced[^]*nor put back[^]*move it back onto/.test(err.message);
    },
  );
  assert.deepEqual(bytesUnder(kept), tree, "a tree made in between: the person's is kept aside, where the error says");
});

/** The handler of `command` over `args`, with `builtins` as the folder of the builtin templates. */
const handledWith = <D extends object>(builtins: string, command: Served<D>, args: Args) =>
  runWith(noEngine(), withBuiltins(command.handler(args), builtins));

test('--template names a builtin template by its name: an upgrade records the name, and a name no builtin has is refused', async (t) => {
  t.mock.method(console, 'log', () => {});
  const { dir } = await applied('from-folder');
  const builtins = scratch('wf-upgrade-builtins-');
  fs.cpSync(dir, path.join(builtins, 'team'), { recursive: true });
  released(path.join(builtins, 'team'), '0.2.0', 5);
  await t.test('REFUSED Missing, nothing written: diff and upgrade to a name no builtin template has', async () => {
    const before = bytesUnder(ROOT);
    for (const command of [FACTORY_PLAN, FACTORY_UPGRADE] as Served<object>[])
      await assert.rejects(
        handledWith(builtins, command, { factory: 'from-folder', to: '0.2.0', template: 'nope' }),
        refusedWith('Missing', /\bteam\b/, /\.\/nope/),
      );
    assert.deepEqual(bytesUnder(ROOT), before);
  });
  await t.test('a factory applied from a folder, upgraded with --template <name>, records the name', async () => {
    await handledWith(builtins, FACTORY_UPGRADE, { factory: 'from-folder', to: '0.2.0', template: 'team' });
    assert.deepEqual(templated('from-folder').template.source, 'team');
    assert.equal(programsAt(ROOT, builtins).reconciled(templated('from-folder')).conditions[0].reason, 'Upgraded');
  });
});
