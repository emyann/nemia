/**
 * A templated factory's upgrade, on disk: `nemia factory plan` writing nothing; `nemia factory upgrade` refusing with nothing written, and
 * writing only the version wanted into the factory's file; the controller merging three ways, only the status written while a conflict
 * waits, then the tree, the base and the status; `nemia factory resolve` writing the person's choices; the tree swapped only where no one
 * wrote it since the merge read it; a pass stopped between its writes; and a run in flight keeping its frozen steps. `WF_ROOT` is set
 * before the import, since the store's modules read it as they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { scratch } from '../../test/scratch.ts';
import { promised } from '../../test/promised.ts';
import { teamCopy } from '../../test/team.ts';

const ROOT = scratch('wf-upgrade-');
process.env.WF_ROOT = ROOT;
const FACTORIES = path.join(ROOT, 'factories');
const { exportTemplate } = await import('../template/template.store.ts');
const { readFactory } = await import('../runner.ts');
const { main } = await import('../cli/main.ts');
const { reconcileFactory } = await import('../applied/applied.verb.ts');
const { appliedDir, digestOf, entriesIn, readStatus, replaceBase, resolutionsFile, statusFile, swapTree, treeDir } =
  await import('../applied/applied.store.ts');
const { readRun } = await import('../record/record.store.ts');

/** No verb here asks the engine anything. */
const NO_ENGINE = promised({});

/** Refused by kind, exit 2, and the message — never `String(err)`, which starts with `Error: `. */
const refusedWith = (tag: 'Missing' | 'Conflict' | 'Invalid', pattern: RegExp) => (err: Error & { exitCode?: number; _tag?: string }) =>
  err._tag === tag && err.exitCode === 2 && pattern.test(err.message);

/** A repository holding the tests' team as its `workflows/`, in one commit, so a start has a base to record. */
function repoWithTeam(): string {
  const repo = scratch('wf-upgrade-repo-');
  fs.renameSync(teamCopy(), path.join(repo, 'workflows'));
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  return repo;
}

/** The document `file` of `dir`, its spec changed by `change`. */
function edit(dir: string, file: string, change: (spec: Record<string, any>) => void): void {
  const doc = parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  change(doc.spec);
  fs.writeFileSync(path.join(dir, file), stringify(doc, { lineWidth: 0 }));
}

/** The tests' team exported as a template at 0.1.0, `budget` a parameter of the review step, applied as `name` and rendered once. */
async function applied(name: string): Promise<{ dir: string; repo: string }> {
  const repo = repoWithTeam();
  const dir = path.join(scratch('wf-upgrade-template-'), 'team');
  exportTemplate({ dir, from: repo });
  edit(dir, 'nemia.yaml', (spec) => {
    spec.parameters = { budget: { type: 'number', description: 'dollars for a review' } };
  });
  edit(dir, 'workflows/dev/workflow.yaml', (spec) => {
    spec.steps[1].budget = { param: 'budget' };
  });
  await main(['factory', 'apply', name, '--template', dir, '--repo', repo, '--set', 'budget=7'], NO_ENGINE);
  reconcileFactory(templated(name));
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
  await main(args, NO_ENGINE);
  return printed.flatMap((p) => p.split('\n'));
}

test('plan previews what merges cleanly and each conflict, with the line that resolves it, and writes nothing', async (t) => {
  t.mock.method(console, 'log', () => {});
  const { dir } = await applied('planned');
  rewrite(treeDir('planned'), REVIEW, 'rounds: 3', 'rounds: 4');
  rewrite(treeDir('planned'), REVIEW, 'budget: 7', 'budget: 9');
  released(dir, '0.2.0', 5);
  const before = bytesUnder(FACTORIES);
  const printed = await printedBy(t, 'factory', 'plan', 'planned', '--to', '0.2.0');
  assert.deepEqual(bytesUnder(FACTORIES), before, 'the plan writes nothing');
  assert.equal(printed[0], 'planned: 0.1.0 → 0.2.0');
  assert.ok(printed.includes('conflicts: 1'), printed.join('\n'));
  assert.ok(printed.includes(`  ${REVIEW}#rounds`), printed.join('\n'));
  assert.ok(printed.includes(`    nemia factory resolve planned '${REVIEW}#rounds' --ours|--theirs|--file <path>`), printed.join('\n'));
  assert.equal(printed.at(-1), 'nemia factory upgrade planned --to 0.2.0 files it; the daemon merges once each conflict is resolved.');
});

test('upgrade refuses, writing nothing: no template, no render, a --to that is no version, the template at another, the same, a downgrade', async (t) => {
  t.mock.method(console, 'log', () => {});
  const { dir, repo } = await applied('kept');
  await main(['factory', 'add', 'plain', '--repo', repo], NO_ENGINE);
  await main(['factory', 'apply', 'unrendered', '--template', dir, '--repo', repo, '--set', 'budget=7'], NO_ENGINE);
  const before = bytesUnder(FACTORIES);
  const upgrade = (name: string, ...rest: string[]) => main(['factory', 'upgrade', name, ...rest], NO_ENGINE);
  await assert.rejects(upgrade('plain', '--to', '0.2.0'), refusedWith('Invalid', /plain is not made from a template/));
  await assert.rejects(upgrade('unrendered', '--to', '0.2.0'), refusedWith('Conflict', /unrendered is not rendered yet[^]*nemia up/));
  await assert.rejects(upgrade('kept', '--to', '2'), refusedWith('Invalid', /--to <x\.y\.z>/));
  await assert.rejects(
    upgrade('kept', '--to', '0.2.0'),
    refusedWith('Conflict', /is at version 0\.1\.0, not 0\.2\.0: [^]*--template <folder\|archive>/),
  );
  await assert.rejects(upgrade('kept', '--to', '0.1.0'), refusedWith('Conflict', /kept is already applied at 0\.1\.0/));
  edit(dir, 'workflows/dev/workflow.yaml', (spec) => {
    spec.steps[1].rounds = 5;
  });
  await assert.rejects(
    upgrade('kept', '--to', '0.1.0'),
    refusedWith('Conflict', /the template at 0\.1\.0 now renders other content: [^]*give it a new version/),
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

test('a downgrade asked with --downgrade is filed, and merged as an upgrade is', async (t) => {
  t.mock.method(console, 'log', () => {});
  const { dir } = await applied('lowered');
  released(dir, '0.0.9', 5);
  await main(['factory', 'upgrade', 'lowered', '--to', '0.0.9', '--downgrade'], NO_ENGINE);
  assert.equal(templated('lowered').template.version, '0.0.9');
  assert.equal(reconcileFactory(templated('lowered')).version, '0.0.9');
  assert.match(textIn(treeDir('lowered'), REVIEW), /^rounds: 5$/m);
});

test("a clean upgrade writes the factory's file alone; the controller swaps the tree, then the base, and a second pass writes nothing", async (t) => {
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
  const status = reconcileFactory(templated('clean'));
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
  assert.deepEqual(reconcileFactory(templated('clean')), status);
  assert.equal(fs.statSync(statusFile('clean')).mtimeMs, written, 'a second pass writes no status');
  assert.deepEqual(bytesUnder(treeDir('clean')), tree, 'nor a tree');
  await assert.rejects(
    main(['factory', 'upgrade', 'clean', '--to', '0.2.0'], NO_ENGINE),
    refusedWith('Conflict', /clean is already applied at 0\.2\.0/),
  );
});

test('conflicts wait for a choice with only the status written; resolve writes each, and the controller merges once each has one', async (t) => {
  t.mock.method(console, 'log', () => {});
  const { dir } = await applied('clash');
  rewrite(treeDir('clash'), REVIEW, 'rounds: 3', 'rounds: 4');
  rewrite(treeDir('clash'), README, '# dev\n', '# dev, ours\n');
  released(dir, '0.2.0', 5);
  rewrite(dir, README, '# dev\n', '# dev, theirs\n');
  const printed = await printedBy(t, 'factory', 'upgrade', 'clash', '--to', '0.2.0');
  assert.match(printed[2], /^2 conflicts wait for a choice: nemia factory plan clash --to 0\.2\.0 shows each/);
  const tree = bytesUnder(treeDir('clash'));
  const base = bytesUnder(appliedDir('clash'));
  const waiting = reconcileFactory(templated('clash'));
  assert.deepEqual(bytesUnder(treeDir('clash')), tree, 'the tree is left as it is while a conflict waits');
  assert.deepEqual(bytesUnder(appliedDir('clash')), base, 'and the base');
  assert.equal(waiting.version, '0.1.0');
  assert.deepEqual(
    waiting.conditions.map((c) => [c.type, c.status, c.reason]),
    [
      ['Applied', 'False', 'UpgradePending'],
      ['ConflictsPending', 'True', 'Conflicts'],
    ],
  );
  assert.match(
    waiting.conditions[1].message,
    /nemia factory resolve clash 'workflows\/dev\/README\.md:1-1' --ours\|--theirs\|--file <path>/,
  );
  assert.deepEqual(waiting.upgrade, {
    from: '0.1.0',
    to: '0.2.0',
    conflicts: [
      { at: `${README}:1-1`, base: '# dev\n', ours: '# dev, ours\n', theirs: '# dev, theirs\n' },
      { at: `${REVIEW}#rounds`, base: 'rounds: 3\n', ours: 'rounds: 4\n', theirs: 'rounds: 5\n' },
    ],
  });
  assert.deepEqual(readStatus('clash'), waiting);

  const resolve = (...rest: string[]) => main(['factory', 'resolve', 'clash', ...rest], NO_ENGINE);
  await assert.rejects(resolve('nowhere.md', '--ours'), refusedWith('Invalid', /nowhere\.md is no conflict[^]*its conflicts: /));
  await assert.rejects(resolve(`${REVIEW}#rounds`), refusedWith('Invalid', /takes one choice/));
  await assert.rejects(resolve(`${REVIEW}#rounds`, '--ours', '--theirs'), refusedWith('Invalid', /takes one choice/));
  await assert.rejects(resolve(`${REVIEW}#rounds`, '--file', path.join(dir, 'gone.md')), refusedWith('Missing', /no file at/));
  assert.ok(!fs.existsSync(resolutionsFile('clash')), 'a refused resolve writes nothing');

  assert.match((await printedBy(t, 'factory', 'resolve', 'clash', `${REVIEW}#rounds`, '--theirs'))[1], /^1 conflict still wait/);
  assert.deepEqual(
    reconcileFactory(templated('clash')).upgrade?.conflicts.map((c) => c.at),
    [`${README}:1-1`],
  );
  assert.deepEqual(bytesUnder(treeDir('clash')), tree, 'one conflict left, nothing merged');
  const mine = path.join(scratch('wf-upgrade-choice-'), 'head.md');
  fs.writeFileSync(mine, '# dev, both\n');
  assert.equal(
    (await printedBy(t, 'factory', 'resolve', 'clash', `${README}:1-1`, '--file', mine))[1],
    'every conflict has a choice: the daemon merges on its next pass (nemia up)',
  );
  assert.deepEqual(JSON.parse(fs.readFileSync(resolutionsFile('clash'), 'utf8')), {
    to: '0.2.0',
    choices: { [`${REVIEW}#rounds`]: 'theirs', [`${README}:1-1`]: { text: '# dev, both\n' } },
  });

  const merged = reconcileFactory(templated('clash'));
  assert.equal(merged.version, '0.2.0');
  assert.equal(merged.conditions[0].reason, 'Upgraded');
  assert.equal(merged.upgrade, undefined, 'no conflict is said once merged');
  assert.match(textIn(treeDir('clash'), REVIEW), /^rounds: 5$/m);
  assert.match(textIn(treeDir('clash'), README), /^# dev, both\n/);
  assert.match(textIn(appliedDir('clash'), README), /^# dev, theirs\n/);
  await assert.rejects(resolve(`${README}:1-1`, '--ours'), refusedWith('Conflict', /no upgrade of clash is under way/));
});

test('choices made for another version are not merged, and the next resolve drops them', async (t) => {
  t.mock.method(console, 'log', () => {});
  const { dir } = await applied('stale');
  rewrite(treeDir('stale'), REVIEW, 'rounds: 3', 'rounds: 4');
  rewrite(treeDir('stale'), README, '# dev\n', '# dev, ours\n');
  released(dir, '0.2.0', 5);
  rewrite(dir, README, '# dev\n', '# dev, theirs\n');
  await main(['factory', 'upgrade', 'stale', '--to', '0.2.0'], NO_ENGINE);
  await main(['factory', 'resolve', 'stale', `${REVIEW}#rounds`, '--theirs'], NO_ENGINE);
  await main(['factory', 'resolve', 'stale', `${README}:1-1`, '--ours'], NO_ENGINE);
  released(dir, '0.3.0', 6);
  rewrite(dir, README, '# dev, theirs\n', '# dev, three\n');
  await main(['factory', 'upgrade', 'stale', '--to', '0.3.0'], NO_ENGINE);
  const tree = bytesUnder(treeDir('stale'));
  const waiting = reconcileFactory(templated('stale'));
  assert.deepEqual(
    waiting.upgrade?.conflicts.map((c) => c.at),
    [`${README}:1-1`, `${REVIEW}#rounds`],
    'the choices for 0.2.0 answer no conflict of 0.3.0',
  );
  assert.deepEqual(bytesUnder(treeDir('stale')), tree, 'and nothing is merged with them');
  await main(['factory', 'resolve', 'stale', `${README}:1-1`, '--theirs'], NO_ENGINE);
  assert.deepEqual(JSON.parse(fs.readFileSync(resolutionsFile('stale'), 'utf8')), {
    to: '0.3.0',
    choices: { [`${README}:1-1`]: 'theirs' },
  });
  assert.deepEqual(
    reconcileFactory(templated('stale')).upgrade?.conflicts.map((c) => c.at),
    [`${REVIEW}#rounds`],
  );
});

test('the tree is swapped only where no one wrote it since the merge read it', async (t) => {
  t.mock.method(console, 'log', () => {});
  await applied('raced');
  const read = digestOf(entriesIn(treeDir('raced')));
  rewrite(treeDir('raced'), REVIEW, 'budget: 7', 'budget: 8');
  const tree = bytesUnder(treeDir('raced'));
  const merge = entriesIn(appliedDir('raced'));
  assert.equal(swapTree('raced', merge, read), false, 'a write since the read: refused');
  assert.deepEqual(bytesUnder(treeDir('raced')), tree);
  assert.equal(swapTree('raced', merge, digestOf(entriesIn(treeDir('raced')))), true);
  assert.match(textIn(treeDir('raced'), REVIEW), /^budget: 7$/m);
  assert.deepEqual(
    fs.readdirSync(path.join(FACTORIES, 'raced')).sort(),
    ['applied', 'status.json', 'tree'],
    'no folder is left staged beside it',
  );
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
  assert.throws(() => swapTree('stuck', merge, digestOf(entriesIn(treeDir('stuck')))), (err: Error) => /EIO/.test(err.message));
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

test('a pass stopped after the tree is swapped merges the same tree on the next; stopped after the base, the version is the render', async (t) => {
  t.mock.method(console, 'log', () => {});
  const { dir } = await applied('stopped');
  rewrite(treeDir('stopped'), README, '# dev\n', '# dev, ours\n');
  released(dir, '0.2.0', 5);
  rewrite(dir, README, '# dev\n', '# dev, theirs\n');
  await main(['factory', 'upgrade', 'stopped', '--to', '0.2.0'], NO_ENGINE);
  await main(['factory', 'resolve', 'stopped', `${README}:1-1`, '--ours'], NO_ENGINE);
  const oldBase = entriesIn(appliedDir('stopped'));
  const oldStatus = fs.readFileSync(statusFile('stopped'));
  reconcileFactory(templated('stopped'));
  const tree = bytesUnder(treeDir('stopped'));
  const status = readStatus('stopped');
  replaceBase('stopped', oldBase);
  fs.writeFileSync(statusFile('stopped'), oldStatus);
  assert.deepEqual(reconcileFactory(templated('stopped')), status, 'the tree swapped, the base not: the next pass ends it');
  assert.deepEqual(bytesUnder(treeDir('stopped')), tree, 'composing the same tree');
  fs.writeFileSync(statusFile('stopped'), oldStatus);
  const after = reconcileFactory(templated('stopped'));
  assert.equal(after.version, '0.2.0', 'the base swapped, the status not: the version is the render');
  assert.equal(after.conditions[0].status, 'True');
  assert.deepEqual(bytesUnder(treeDir('stopped')), tree);
});

test("a run in flight keeps the steps frozen on its record while its factory's tree is upgraded", async (t) => {
  const { dir } = await applied('flying');
  const printed: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => printed.push(args.join(' ')));
  await main(['start', 'Cache the views', '--factory', 'flying', '--workflows', 'dev'], NO_ENGINE);
  const id = printed[0].split(' ')[0];
  released(dir, '0.2.0', 5);
  await main(['factory', 'upgrade', 'flying', '--to', '0.2.0'], NO_ENGINE);
  assert.equal(reconcileFactory(templated('flying')).conditions[0].reason, 'Upgraded');
  assert.match(textIn(treeDir('flying'), REVIEW), /^rounds: 5$/m);
  assert.equal(readRun(id).workflow?.find((step) => step.name === 'review')?.rounds, 3, 'its review step as it started');
});
