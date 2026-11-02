/**
 * A templated factory's upgrade, on disk, beyond the story of a conflict (`test/upgrade-conflict.test.ts`: the plan, the wait, the
 * choices, the merge, a pass stopped between its writes, a run in flight and the swap only where untouched): what `nemia factory
 * upgrade` refuses with nothing written; an upgrade with no conflict, up or down; the factory's rules, `RULES.md`, carried as any file of
 * the tree is; choices made for another version; a status lost; and a swap whose rename fails. `WF_ROOT` is set before the import,
 * since the store's modules read it as they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { scratch } from '../../test/scratch.ts';
import { testEngine } from 'agent-runtime/testing';
import { teamCopy } from '../../test/team.ts';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runOver } from '../../test/placed.ts';
import { heldUnasked } from '../../test/unasked.ts';

const ROOT = scratch('wf-upgrade-');
process.env.WF_ROOT = ROOT;
const FACTORIES = path.join(ROOT, 'factories');
const { templated: programsAt } = await import('../../test/templated.ts');
const { exportTemplate, reconciled } = programsAt(ROOT);
const { FACTORY_RULES, factoryRules, readFactory, runWith: runEngine } = await import('../runner.ts');
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);
const { main: cli } = await import('../cli/main.ts');
/** `nemia`, as a person types it, its commands given this test's place. */
const main = (argv: string[], e?: Parameters<typeof cli>[1]) => cli(argv, e, undefined, stand().place);
const { appliedDir, digestOf, entriesIn, resolutionsFile, statusFile, swapTree, treeDir } = await import('../applied/applied.store.ts');

const { engineOf } = await import('../runtime-client.ts');
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
  readFactory(name) as ReturnType<typeof readFactory> & { template: NonNullable<ReturnType<typeof readFactory>['template']> };

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

/** What `args` printed, run as the command line runs them. */
async function printedBy(t: { mock: { method: Function } }, ...args: string[]): Promise<string[]> {
  const printed: string[] = [];
  t.mock.method(console, 'log', (...words: unknown[]) => printed.push(words.join(' ')));
  await main(args, noEngine());
  return printed.flatMap((p) => p.split('\n'));
}

test('upgrade refuses, writing nothing: no template, no render, a --to that is no version, the template at another, the same, a downgrade', async (t) => {
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
    refusedWith('Conflict', /is at version 0\.1\.0, not 0\.2\.0: /, /--template <folder\|archive>/),
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
    assert.match(textIn(treeDir('lowered'), REVIEW), /^rounds: 5$/m);
  });
  await t.test(
    "a clean upgrade writes the factory's file alone; the controller swaps the tree, then the base, and a second pass writes nothing",
    async (t) => {
      t.mock.method(console, 'log', () => {});
      const { dir } = await applied('clean');
      const file = path.join(FACTORIES, 'clean.json');
      const filedAs = JSON.parse(fs.readFileSync(file, 'utf8'));
      rewrite(treeDir('clean'), REVIEW, 'budget: 7', 'budget: 9');
      released(dir, '0.2.0', 5);
      const folder = bytesUnder(path.join(FACTORIES, 'clean'));
      const printed = await printedBy(t, 'factory', 'upgrade', 'clean', '--to', '0.2.0');
      assert.deepEqual(printed, ['clean: 0.1.0 → 0.2.0', `filed: ${file}`, 'the daemon merges it on its next pass (nemia up)']);
      assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { ...filedAs, template: { ...filedAs.template, version: '0.2.0' } });
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
      assert.match(textIn(treeDir('clean'), REVIEW), /^budget: 9\nloop: implement\nrounds: 5$/m, "the template's change and the person's");
      assert.match(textIn(appliedDir('clean'), REVIEW), /^budget: 7\nloop: implement\nrounds: 5$/m, 'the base is the render');
      assert.equal(status.digest, digestOf(entriesIn(appliedDir('clean'))));
      assert.equal(fs.statSync(path.join(appliedDir('clean'), REVIEW)).mode & 0o222, 0, 'the base is read-only again');
      const written = fs.statSync(statusFile('clean')).mtimeMs;
      const tree = bytesUnder(treeDir('clean'));
      assert.deepEqual(reconciled(templated('clean')), status);
      assert.equal(fs.statSync(statusFile('clean')).mtimeMs, written, 'a second pass writes no status');
      assert.deepEqual(bytesUnder(treeDir('clean')), tree, 'nor a tree');
      await assert.rejects(
        main(['factory', 'upgrade', 'clean', '--to', '0.2.0'], noEngine()),
        refusedWith('Conflict', /clean is already applied at 0\.2\.0/),
      );
    },
  );
});

test("a factory's rules carried by an upgrade: taken where the tree has none, a conflict where both added them, merged by line", async (t) => {
  await t.test("a factory's rules are carried by an upgrade: taken from a template that adds them, where the tree has none", async (t) => {
    t.mock.method(console, 'log', () => {});
    const { dir } = await applied('ruled');
    assert.equal(fs.existsSync(path.join(treeDir('ruled'), RULES)), false, 'the template had none, and the tree has none');
    released(dir, '0.2.0', 5);
    fs.writeFileSync(path.join(dir, RULES), 'Never push on a Friday.\n');
    await main(['factory', 'upgrade', 'ruled', '--to', '0.2.0'], noEngine());
    const status = reconciled(templated('ruled'));
    assert.equal(status.version, '0.2.0');
    assert.equal(status.upgrade, undefined, 'no conflict');
    assert.equal(textIn(treeDir('ruled'), RULES), 'Never push on a Friday.\n');
    assert.equal(textIn(appliedDir('ruled'), RULES), 'Never push on a Friday.\n');
    assert.deepEqual(factoryRules('ruled'), {
      name: 'ruled',
      file: path.join(treeDir('ruled'), RULES),
      words: 'Never push on a Friday.',
      error: null,
    });
  });
  await t.test(
    'rules the person wrote and rules the template adds, with none in the base, are one conflict at RULES.md, resolved by a choice',
    async (t) => {
      t.mock.method(console, 'log', () => {});
      const { dir } = await applied('both');
      await runWith(noEngine(), FACTORY_RULES.handler({ factory: 'both', words: 'Ours: push whenever.' }, undefined, ROOT));
      assert.equal(textIn(treeDir('both'), RULES), 'Ours: push whenever.\n', "a templated factory's rules are its tree's");
      released(dir, '0.2.0', 5);
      fs.writeFileSync(path.join(dir, RULES), 'Theirs: never push on a Friday.\n');
      await main(['factory', 'upgrade', 'both', '--to', '0.2.0'], noEngine());
      const waiting = reconciled(templated('both'));
      assert.equal(waiting.version, '0.1.0');
      assert.deepEqual(waiting.upgrade?.conflicts, [
        { at: RULES, base: null, ours: 'Ours: push whenever.\n', theirs: 'Theirs: never push on a Friday.\n' },
      ]);
      assert.equal(textIn(treeDir('both'), RULES), 'Ours: push whenever.\n', 'left as it is while the conflict waits');
      await main(['factory', 'resolve', 'both', RULES, '--theirs'], noEngine());
      const merged = reconciled(templated('both'));
      assert.equal(merged.version, '0.2.0');
      assert.equal(merged.upgrade, undefined);
      assert.equal(textIn(treeDir('both'), RULES), 'Theirs: never push on a Friday.\n');
    },
  );
  await t.test('rules changed by the person and by the template on different lines, from a common base, merge by line', async (t) => {
    t.mock.method(console, 'log', () => {});
    const lines = ['Never push on a Friday.', '', 'Write the tests first.', '', 'Ask before a migration.', ''];
    const { dir } = await applied('lined', lines.join('\n'));
    assert.equal(textIn(treeDir('lined'), RULES), lines.join('\n'));
    rewrite(treeDir('lined'), RULES, 'on a Friday', 'on a Friday, nor on a Monday');
    released(dir, '0.2.0', 5);
    rewrite(dir, RULES, 'before a migration', 'before any migration');
    await main(['factory', 'upgrade', 'lined', '--to', '0.2.0'], noEngine());
    const status = reconciled(templated('lined'));
    assert.equal(status.version, '0.2.0');
    assert.equal(status.upgrade, undefined, 'no conflict');
    assert.equal(
      textIn(treeDir('lined'), RULES),
      ['Never push on a Friday, nor on a Monday.', '', 'Write the tests first.', '', 'Ask before any migration.', ''].join('\n'),
    );
  });
});

test('choices made for another version are not merged, and the next resolve drops them', async (t) => {
  t.mock.method(console, 'log', () => {});
  const { dir } = await applied('stale');
  rewrite(treeDir('stale'), REVIEW, 'rounds: 3', 'rounds: 4');
  rewrite(treeDir('stale'), README, '# dev\n', '# dev, ours\n');
  released(dir, '0.2.0', 5);
  rewrite(dir, README, '# dev\n', '# dev, theirs\n');
  await main(['factory', 'upgrade', 'stale', '--to', '0.2.0'], noEngine());
  await main(['factory', 'resolve', 'stale', `${REVIEW}#rounds`, '--theirs'], noEngine());
  await main(['factory', 'resolve', 'stale', `${README}:1-1`, '--ours'], noEngine());
  released(dir, '0.3.0', 6);
  rewrite(dir, README, '# dev, theirs\n', '# dev, three\n');
  await main(['factory', 'upgrade', 'stale', '--to', '0.3.0'], noEngine());
  const tree = bytesUnder(treeDir('stale'));
  const waiting = reconciled(templated('stale'));
  assert.deepEqual(
    waiting.upgrade?.conflicts.map((c) => c.at),
    [`${README}:1-1`, `${REVIEW}#rounds`],
    'the choices for 0.2.0 answer no conflict of 0.3.0',
  );
  assert.deepEqual(bytesUnder(treeDir('stale')), tree, 'and nothing is merged with them');
  await main(['factory', 'resolve', 'stale', `${README}:1-1`, '--theirs'], noEngine());
  assert.deepEqual(JSON.parse(fs.readFileSync(resolutionsFile('stale'), 'utf8')), {
    to: '0.3.0',
    choices: { [`${README}:1-1`]: 'theirs' },
  });
  assert.deepEqual(
    reconciled(templated('stale')).upgrade?.conflicts.map((c) => c.at),
    [`${REVIEW}#rounds`],
  );
});

test('a status lost while an upgrade waits leaves the version unknown, and an upgrade naming the base version brings it back', async (t) => {
  t.mock.method(console, 'log', () => {});
  const { dir } = await applied('lost');
  const old = path.join(scratch('wf-upgrade-old-'), 'team');
  fs.cpSync(dir, old, { recursive: true });
  released(dir, '0.2.0', 5);
  await main(['factory', 'upgrade', 'lost', '--to', '0.2.0'], noEngine());
  fs.rmSync(statusFile('lost'));
  const tree = bytesUnder(treeDir('lost'));
  const base = bytesUnder(appliedDir('lost'));
  const unknown = reconciled(templated('lost'));
  assert.equal(unknown.version, null, 'the base is not the render, and no status names its version');
  assert.deepEqual([unknown.conditions[0].status, unknown.conditions[0].reason], ['False', 'VersionUnknown']);
  assert.match(unknown.conditions[0].message, /nemia factory upgrade lost --to <it>/);
  assert.deepEqual(bytesUnder(treeDir('lost')), tree, 'the tree is left as it is');
  assert.deepEqual(bytesUnder(appliedDir('lost')), base, 'and the base');
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
  assert.match(textIn(treeDir('lost'), REVIEW), /^rounds: 5$/m);
});

test("a swap whose new tree cannot be renamed in puts the person's tree back, or keeps it aside and says where", async (t) => {
  t.mock.method(console, 'log', () => {});
  await applied('stuck');
  rewrite(treeDir('stuck'), REVIEW, 'budget: 7', 'budget: 8');
  const tree = bytesUnder(treeDir('stuck'));
  const merge = entriesIn(appliedDir('stuck'));
  const rename = fs.renameSync;
  const renamingIn = (from: fs.PathLike, to: fs.PathLike) => to === treeDir('stuck') && !String(from).endsWith('.old');
  const failing = t.mock.method(fs, 'renameSync', (from: fs.PathLike, to: fs.PathLike) => {
    if (renamingIn(from, to)) throw Object.assign(new Error('EIO: i/o error, rename'), { code: 'EIO' });
    rename(from, to);
  });
  assert.throws(
    () => swapTree('stuck', merge, digestOf(entriesIn(treeDir('stuck')))),
    (err: Error) => /EIO/.test(err.message),
  );
  failing.mock.restore();
  assert.deepEqual(bytesUnder(treeDir('stuck')), tree, "the person's tree is put back whole");
  assert.deepEqual(fs.readdirSync(path.join(FACTORIES, 'stuck')).sort(), ['applied', 'status.json', 'tree']);

  t.mock.method(fs, 'renameSync', (from: fs.PathLike, to: fs.PathLike) => {
    if (renamingIn(from, to)) fs.mkdirSync(path.join(treeDir('stuck'), 'seeded'), { recursive: true });
    rename(from, to);
  });
  let kept = '';
  assert.throws(
    () => swapTree('stuck', merge, digestOf(entriesIn(treeDir('stuck')))),
    (err: Error) => {
      kept = /kept in (\S+);/.exec(err.message)?.[1] ?? '';
      return /could not be replaced[^]*nor put back[^]*move it back onto/.test(err.message);
    },
  );
  assert.deepEqual(bytesUnder(kept), tree, "a tree made in between: the person's is kept aside, where the error says");
});
