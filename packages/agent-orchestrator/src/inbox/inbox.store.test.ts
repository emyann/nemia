/**
 * The inbox on disk: `$WF_ROOT/inbox/`, filed, listed and dropped through the verbs, as a person types them.
 *
 * What a card is and what the listing says are pure, and live in inbox.test.ts. This is the part that is not: the folder, the name a card
 * is filed under, and the run records a listing reads. `WF_ROOT` is set before the import, since the module reads it as it loads, and
 * `WF_VERIFY_REST=0` with it: nothing here ticks, and a warm read counted under `1` reads every record afresh to verify it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Run } from '../record/record.ts';
import { scratch } from '../../test/scratch.ts';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runGiven } from '../../test/placed.ts';
import { heldUnasked } from '../../test/unasked.ts';

const ROOT = scratch('wf-inbox-');
const INBOX = path.join(ROOT, 'inbox');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '0';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { addToInbox, dropFromInbox, inboxDir, readInbox, startRun, startFromInbox } = await import('../runner.ts');
const stand = eachTest(testPlace);
const runPlaced = runGiven(() => stand().layer);
const { readRun } = await import('../record/record.store.ts');
const { runStore } = await import('../record/files.store.ts');
const { recordMemo } = await import('../rest/index.ts');
const { metered } = await import('../meter/tally.store.ts');
const { main: cli } = await import('../cli/main.ts');
/** `nemia`, as a person types it, its commands given this test's place. */
const main = (argv: string[], e?: Parameters<typeof cli>[1]) => cli(argv, e, undefined, stand().place);

const { engineOf } = await import('../runtime-client.ts');
const engine = eachTest(testEngine);
heldUnasked(engine);

/** The engine of this test: the stand-in, which no command here files on, stops, says to or forgets from (`heldUnasked`). */
const noEngine = () => engineOf(engine().layer);

/**
 * Refused by kind and exit 2, its message naming each of `named` — the command, flag or field its fix names, and the card or path it is
 * about — never its sentence, which is nobody's to check. Read off the message, never `String(err)`, which starts with `Error: `.
 */
const refusedWith =
  (tag: 'Missing' | 'Conflict' | 'Invalid', ...named: string[]) =>
  (err: Error & { exitCode?: number; _tag?: string }) => {
    assert.equal(err._tag, tag, err.message);
    assert.equal(err.exitCode, 2, err.message);
    for (const n of named) assert.ok(err.message.includes(n), `${n} is not named in: ${err.message}`);
    return true;
  };
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** What `main` printed, line by line, for one verb. */
const printedBy = async (
  t: { mock: { method: (o: object, m: string, f: (...a: unknown[]) => void) => { mock: { restore: () => void } } } },
  ...argv: string[]
): Promise<string[]> => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  try {
    await main(argv, noEngine());
  } finally {
    log.mock.restore();
  }
  return printed.join('\n').split('\n');
};

/** The cards in the inbox, by file. */
const inInbox = () => (fs.existsSync(INBOX) ? fs.readdirSync(INBOX).sort() : []);
const emptyInbox = () => fs.rmSync(INBOX, { recursive: true, force: true });

/** A repository with one commit, so a start has a base to record — and a workflow of one step under its workflows/ for each name. */
const aRepoWith = (...workflows: string[]): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stand().world.repository(repo, {});
  for (const name of workflows) {
    fs.mkdirSync(path.join(repo, 'workflows', name), { recursive: true });
    fs.writeFileSync(path.join(repo, 'workflows', name, 'implement.md'), `---\nplace: git\n---\nimplement it, on ${name}\n`);
  }
  return repo;
};

const runsWritten = () => fs.readdirSync(path.join(ROOT, 'runs')).filter((f) => f.endsWith('.json')).length;

/** A run record, as `start()` writes one — only what the listing reads of it matters here. */
const writeRecord = (id: string, from?: Run['from']) =>
  fs.writeFileSync(
    path.join(ROOT, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo: '/repo',
      workspace: '/repo',
      baseRef: 'abc123',
      branch: 'main',
      isolate: false,
      brief: 'x',
      workflowDir: '/wf',
      steps: {},
      createdAt: '2026-09-16T00:00:00Z',
      ...(from ? { from } : {}),
    }),
  );

test('the inbox is `$WF_ROOT/inbox/`, beside runs/ — and with no folder yet, `nemia inbox` says it is empty', async (t) => {
  emptyInbox();
  assert.equal(inboxDir(), path.join(ROOT, 'inbox'));
  assert.deepEqual(readInbox(), []);
  assert.deepEqual(await printedBy(t, 'inbox'), ['the inbox is empty — park an idea with nemia inbox add "<idea>"']);
  assert.match((await printedBy(t, 'inbox', '--help'))[0], /^nemia inbox$/);
  assert.ok(
    (await printedBy(t, 'help')).some((l) => l.startsWith('  nemia inbox add "<idea>"|<file> [--workflow <name>] [--repo <path>]')),
    'on the general help',
  );
});

test('`nemia inbox add` files a card under the slug of its first line and a suffix — two ideas alike are two cards — `--workflow` and `--repo` write its keys, a file is read as a card when its frontmatter is one; `nemia inbox` lists each, with started as for a card a record names', async (t) => {
  emptyInbox();
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const added = await printedBy(t, 'inbox', 'add', "Cache the engine's views between passes\n\nThe tick reads each task twice.");
  const [name] = inInbox();
  assert.match(name, /^cache-the-engine-s-views-bet-[a-z0-9]{4}\.md$/, 'the slug runId makes of the first line, suffix included');
  const card = path.join(INBOX, name);
  assert.equal(
    fs.readFileSync(card, 'utf8'),
    "Cache the engine's views between passes\n\nThe tick reads each task twice.\n",
    'no keys, no frontmatter',
  );
  assert.deepEqual(added, [
    `${name.slice(0, -3)}  Cache the engine's views between passes`,
    `filed: ${card} — start it with nemia start ${card} --workflows <w>`,
  ]);

  await printedBy(
    t,
    'inbox',
    'add',
    "Cache the engine's views between passes",
    '--workflow',
    'dev',
    `--repo=${path.relative(process.cwd(), repo)}`,
  );
  const second = inInbox().find((f) => f !== name)!;
  assert.ok(second && second !== name, 'a second card, not the first written over');
  assert.equal(
    fs.readFileSync(path.join(INBOX, second), 'utf8'),
    `---\nworkflow: dev\nrepo: ${repo}\n---\nCache the engine's views between passes\n`,
    '--repo written absolute',
  );

  const given = path.join(fs.mkdtempSync(path.join(ROOT, 'given-')), 'idea.md');
  fs.writeFileSync(given, `---\nworkflow: ui\nrepo: /nowhere/at/all\n---\nShow the flag on the settings page.\n`);
  await printedBy(t, 'inbox', 'add', given, '--repo', repo);
  const third = inInbox().find((f) => f.startsWith('show-the-flag'))!;
  assert.equal(
    fs.readFileSync(path.join(INBOX, third), 'utf8'),
    `---\nworkflow: ui\nrepo: ${repo}\n---\nShow the flag on the settings page.\n`,
    "a file's card keys are read, and --repo written over its own",
  );
  assert.equal(fs.readFileSync(given, 'utf8').includes('/nowhere/at/all'), true, 'the file given is left as it was');
  const byPath = addToInbox({ text: 'Store the flag', workflow: path.join(repo, 'workflows', 'dev') });
  assert.equal(byPath.card.workflow, path.join(repo, 'workflows', 'dev'), 'a workflow given as a path is kept absolute');
  const relative = path.relative(process.cwd(), path.join(repo, 'workflows', 'ui'));
  assert.match(relative, /\//, 'a path, not a name');
  await printedBy(t, 'inbox', 'add', 'Store the flag by path', '--workflow', relative);
  const fourth = inInbox().find((f) => f.startsWith('store-the-flag-by-path'))!;
  assert.equal(
    fs.readFileSync(path.join(INBOX, fourth), 'utf8'),
    `---\nworkflow: ${path.join(repo, 'workflows', 'ui')}\n---\nStore the flag by path\n`,
    '--workflow given as a path from here is written absolute, so the inbox reads the same folder',
  );
  fs.rmSync(path.join(INBOX, fourth));

  writeRecord('show-the-flag-on-the-settin-zz99', { inbox: third.slice(0, -3) });
  writeRecord('an-unrelated-run-yy88');
  fs.writeFileSync(path.join(INBOX, 'broken-a1b2.md'), '---\nharness: codex\n---\nx\n');
  fs.writeFileSync(path.join(INBOX, 'notes.txt'), 'x');
  fs.writeFileSync(path.join(INBOX, '.idea.md.swp'), 'x');
  fs.writeFileSync(path.join(INBOX, 'README.md'), '# ideas\n');
  const listed = readInbox();
  assert.deepEqual(
    listed.map((l) => [l.name, l.startedAs, l.error === null]),
    [
      ['broken-a1b2', [], false],
      [name.slice(0, -3), [], true],
      [second.slice(0, -3), [], true],
      ['notes.txt', [], false],
      [third.slice(0, -3), ['show-the-flag-on-the-settin-zz99'], true],
      [byPath.card.name, [], true],
    ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    'started, broken and non-card listed; hidden and README not',
  );
  const lines = await printedBy(t, 'inbox');
  assert.ok(
    lines.some((l) =>
      new RegExp(`^${escaped(second.slice(0, -3))} +Cache the engine's views between passes  workflow: dev  repo: ${escaped(repo)}$`).test(
        l,
      ),
    ),
    lines.join('\n'),
  );
  assert.ok(
    lines.some((l) =>
      new RegExp(
        `^${escaped(third.slice(0, -3))} +Show the flag on the settings page\\.  workflow: ui  repo: ${escaped(repo)}  started as show-the-flag-on-the-settin-zz99$`,
      ).test(l),
    ),
    lines.join('\n'),
  );
  assert.ok(
    lines.some((l) => /^broken-a1b2 +broken-a1b2\.md: `harness` is not a key an inbox card has\./.test(l)),
    lines.join('\n'),
  );
  assert.deepEqual(lines.slice(-2), [
    '',
    `start one: nemia start ${path.join(INBOX, '<name>.md')} [--workflows <w>] [--repo <r>] [--factory <f>] — queue one: nemia inbox queue <name> — drop one: nemia inbox rm <name>`,
  ]);
  fs.rmSync(path.join(ROOT, 'runs', 'show-the-flag-on-the-settin-zz99.json'));
  fs.rmSync(path.join(ROOT, 'runs', 'an-unrelated-run-yy88.json'));
});

test("`nemia inbox add --factory` files a card that names its factory, over the text's own, and says it — REFUSED by name: a name that is not a factory's, and the flag twice; nothing filed", async (t) => {
  emptyInbox();
  const { card, file } = addToInbox({ text: 'Build the page', factory: 'pipao' });
  assert.equal(card.factory, 'pipao');
  assert.equal(fs.readFileSync(file, 'utf8'), '---\nfactory: pipao\n---\nBuild the page\n');
  const idea = path.join(fs.mkdtempSync(path.join(ROOT, 'given-')), 'idea.md');
  fs.writeFileSync(idea, '---\nfactory: nemia\nworkflow: build\n---\nShip it\n');
  const printed = await printedBy(t, 'inbox', 'add', idea, '--factory', 'pipao');
  const [name] = printed[0].split('  ');
  assert.equal(printed[0], `${name}  Ship it  workflow: build  factory: pipao`);
  assert.equal(fs.readFileSync(path.join(INBOX, `${name}.md`), 'utf8'), '---\nworkflow: build\nfactory: pipao\n---\nShip it\n');
  assert.equal(readInbox().find((l) => l.name === name)?.factory, 'pipao');

  emptyInbox();
  assert.throws(
    () => addToInbox({ text: 'an idea', factory: 'Pipao' }),
    refusedWith('Invalid', '`factory: Pipao`', 'pipao, say', 'nemia factory ls'),
  );
  await assert.rejects(
    main(['inbox', 'add', 'an idea', '--factory', 'pipao', '--factory', 'nemia'], noEngine()),
    refusedWith('Invalid', 'nemia inbox add takes --factory once'),
  );
  assert.deepEqual(inInbox(), [], 'nothing filed');
});

test('`nemia inbox rm` drops a card without starting it — a name with no card is normal: it says so, and which cards there are, exit 0', async (t) => {
  emptyInbox();
  const { card, file } = addToInbox({ text: 'Drop me' });
  const kept = addToInbox({ text: 'Keep me' });
  assert.deepEqual(await printedBy(t, 'inbox', 'rm', card.name), [`${card.name}  dropped, and nothing started — ${file} removed`]);
  assert.equal(fs.existsSync(file), false);
  assert.deepEqual(dropFromInbox(card.name), { removed: false, cards: [kept.card.name] });
  assert.deepEqual(await printedBy(t, 'inbox', 'rm', card.name), [
    `no card ${card.name} in the inbox. Its cards are: ${kept.card.name}. Nothing to drop.`,
  ]);
  assert.deepEqual(await printedBy(t, 'inbox', 'rm', `${kept.card.name}.md`), [
    `no card ${kept.card.name}.md in the inbox. A card is named without its .md: \`${kept.card.name}\`. Its cards are: ${kept.card.name}. Nothing to drop.`,
  ]);
  assert.ok(fs.existsSync(kept.file), 'the other card is left');
  emptyInbox();
  assert.deepEqual(await printedBy(t, 'inbox', 'rm', 'anything'), ['no card anything in the inbox. The inbox is empty. Nothing to drop.']);
});

test('REFUSED by name at shipped defaults: `nemia inbox add` with no idea, an empty one, a directory, a file whose card has `after:`, a repo that is not a directory, a flag with no value or twice — and `nemia inbox rm` with a name that would leave the inbox, a hidden one, none, or two; nothing filed, nothing removed', async () => {
  emptyInbox();
  const add = (...argv: string[]) => main(['inbox', 'add', ...argv], noEngine());
  await assert.rejects(
    add(),
    refusedWith('Invalid', 'takes the idea, first', 'nemia inbox add "<idea>"', '[--factory <name>]', 'nemia inbox add ./idea.md'),
  );
  await assert.rejects(add('--workflow', 'dev'), refusedWith('Invalid', 'takes the idea, first', 'nemia inbox add "<idea>"'));
  await assert.rejects(add(''), refusedWith('Invalid', 'the idea has nothing in it', 'nemia inbox add "<idea>"'));
  await assert.rejects(add('   '), refusedWith('Invalid', 'the idea has nothing in it', 'nemia inbox add "<idea>"'));
  const dir = fs.mkdtempSync(path.join(ROOT, 'given-'));
  const empty = path.join(dir, 'empty.md');
  fs.writeFileSync(empty, '\n');
  await assert.rejects(add(empty), refusedWith('Invalid', `${empty} has nothing in it`, 'nemia inbox add ./idea.md'));
  await assert.rejects(add(dir), refusedWith('Invalid', `${dir} is a directory`, 'nemia inbox add ./idea.md'));
  const waits = path.join(dir, 'd.md');
  fs.writeFileSync(waits, '---\nworkflow: dev\nafter: b, c\n---\nShow the flag.\n');
  await assert.rejects(add(waits), refusedWith('Invalid', `${waits}: \`after\``, 'nemia start <inbox>/<name>.md --after <runId>'));
  await assert.rejects(add('an idea', '--repo', empty), refusedWith('Invalid', `\`repo: ${empty}\` names no directory`));
  await assert.rejects(
    add('an idea', '--repo', path.join(ROOT, 'no-such-repo')),
    refusedWith('Invalid', `\`repo: ${path.join(ROOT, 'no-such-repo')}\` names no directory`),
  );
  assert.throws(
    () => addToInbox({ text: 'an idea', repo: 'code/app' }),
    refusedWith('Invalid', '`repo: code/app` is not an absolute path', '`repo: /home/me/code/app`'),
  );
  await assert.rejects(add('an idea', '--workflow'), refusedWith('Invalid', 'nemia inbox add "<idea>" --workflow <name>'));
  await assert.rejects(add('an idea', '--workflow='), refusedWith('Invalid', 'nemia inbox add "<idea>" --workflow <name>'));
  await assert.rejects(add('an idea', '--repo', ROOT, '--repo', ROOT), refusedWith('Invalid', 'nemia inbox add takes --repo once'));
  await assert.rejects(
    add('an idea', '--workflows', 'dev'),
    refusedWith('Invalid', 'does not take --workflows', '--workflow <name>', '--repo <path>', '--factory <name>'),
  );
  await assert.rejects(add('an', 'idea'), refusedWith('Invalid', 'idea is a second', 'nemia inbox add "<idea>"'));
  assert.deepEqual(inInbox(), [], 'nothing filed');

  const { card, file } = addToInbox({ text: 'Stay where you are' });
  const rm = (...argv: string[]) => main(['inbox', 'rm', ...argv], noEngine());
  writeRecord('r-outside');
  for (const name of ['../runs/r-outside.json', '../runs/r-outside', 'sub/card', '..']) {
    await assert.rejects(
      rm(name),
      refusedWith('Invalid', `\`${name}\` is not a card's name`, 'no slash', 'the name nemia inbox lists'),
      name,
    );
  }
  assert.throws(() => dropFromInbox('../runs/r-outside'), refusedWith('Invalid', "`../runs/r-outside` is not a card's name"));
  await assert.rejects(rm('.hidden'), refusedWith('Invalid', "`.hidden` is not a card's name", 'hidden file'));
  await assert.rejects(rm(), refusedWith('Invalid', 'nemia inbox rm <name>'));
  await assert.rejects(rm(card.name, 'another'), refusedWith('Invalid', 'another is a second', 'nemia inbox rm <name>, once per card'));
  await assert.rejects(
    main(['inbox', 'list'], noEngine()),
    refusedWith(
      'Invalid',
      'does not take list',
      'nemia inbox add "<idea>"',
      'nemia inbox queue <name>',
      'nemia inbox rm <name>',
      'nemia inbox --help',
    ),
  );
  assert.ok(fs.existsSync(path.join(ROOT, 'runs', 'r-outside.json')), 'the record outside the inbox is still there');
  assert.ok(fs.existsSync(file), 'and so is the card');
  fs.rmSync(path.join(ROOT, 'runs', 'r-outside.json'));
});

test("`nemia start <inbox>/<name>.md` starts the card — its body the brief, its `workflow:` found in its `repo:` — writes `from` on the record and removes the card; `nemia decide` names the card under the run's line; a plan's card started so stays where it is", async (t) => {
  emptyInbox();
  const repo = aRepoWith('dev', 'ui');
  const { card, file } = addToInbox({ text: 'Cache the views between passes\n\nThe tick reads each task twice.', workflow: 'dev', repo });
  const printed = await printedBy(t, 'start', file);
  const id = printed[0].split(' ')[0];
  assert.match(id, /^cache-the-views-between-pass-[a-z0-9]{4}$/, 'the run id from the body');
  const run = readRun(id);
  assert.deepEqual(
    [run.brief, run.repo, run.workflowDir, run.from],
    ['Cache the views between passes\n\nThe tick reads each task twice.', repo, path.join(repo, 'workflows', 'dev'), { inbox: card.name }],
  );
  assert.deepEqual(printed.slice(0, 3), [
    `${id}  1 step(s): implement`,
    `from inbox card ${card.name} — removed from the inbox`,
    `workspace: ${repo}`,
  ]);
  assert.equal(fs.existsSync(file), false, 'the card left the inbox');
  assert.deepEqual(readInbox(), []);
  const decided = await printedBy(t, 'decide', id);
  assert.deepEqual(decided.slice(0, 2), [`${id}  Cache the views between passes`, `  from inbox card ${card.name}`]);
  const typed = await runPlaced(startRun({ brief: 'typed', repo, workflowDir: path.join(repo, 'workflows', 'dev') }));
  assert.equal(
    Object.hasOwn(JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${typed.id}.json`), 'utf8')), 'from'),
    false,
    'a run typed at nemia start carries no from',
  );
  assert.doesNotMatch((await printedBy(t, 'decide', typed.id)).join('\n'), /from inbox card/, 'and its decide screen names no card');

  const plan = fs.mkdtempSync(path.join(ROOT, 'plan-'));
  fs.writeFileSync(path.join(plan, 'a.md'), '---\nworkflow: dev\n---\nParse the flag\n');
  const planned = readRun((await printedBy(t, 'start', path.join(plan, 'a.md'), '--repo', repo))[0].split(' ')[0]);
  assert.deepEqual([planned.brief, planned.from], ['Parse the flag', undefined], "a plan's card is started by nemia start, with no from");
  assert.ok(fs.existsSync(path.join(plan, 'a.md')), "the plan's card stays");
});

test('`nemia start <inbox>/<name>`, the name as `nemia inbox` lists it, starts the card as `<name>.md` does — and a path under the inbox that names no card is refused by name, never started as a brief whose text is the path or the file', async (t) => {
  emptyInbox();
  const repo = aRepoWith('dev');
  const { card, file } = addToInbox({ text: 'Cache the views between passes', workflow: 'dev', repo });
  const other = addToInbox({ text: 'Show the flag', workflow: 'dev', repo });
  const before = runsWritten();
  const starting = (...argv: string[]) => main(['start', ...argv], noEngine());

  await assert.rejects(
    starting(path.join(INBOX, 'cache-the-views'), '--repo', repo),
    refusedWith('Missing', 'no card cache-the-views in', `Its cards are: ${[card.name, other.card.name].sort().join(', ')}.`),
    'a name with no card, typed without its .md, is refused, never started as a run asked to do its own path',
  );
  fs.writeFileSync(path.join(INBOX, 'notes.txt'), 'Refactor everything.\n');
  await assert.rejects(
    starting(path.join(INBOX, 'notes.txt'), '--workflows', 'dev', '--repo', repo),
    refusedWith('Missing', 'no card notes.txt in'),
    'a file in the inbox that is not a card is refused, not read as a brief',
  );
  fs.mkdirSync(path.join(INBOX, 'drafts'));
  fs.writeFileSync(path.join(INBOX, 'drafts', 'idea.md'), 'Refactor everything.\n');
  await assert.rejects(
    starting(path.join(INBOX, 'drafts', 'idea.md'), '--workflows', 'dev', '--repo', repo),
    refusedWith('Invalid', "`drafts/idea` is not a card's name", 'no slash'),
    'and so is one in a folder inside it',
  );
  assert.equal(runsWritten(), before, 'no run written');

  const printed = await printedBy(t, 'start', path.join(INBOX, card.name));
  const run = readRun(printed[0].split(' ')[0]);
  assert.deepEqual(
    [run.brief, run.workflowDir, run.from],
    ['Cache the views between passes', path.join(repo, 'workflows', 'dev'), { inbox: card.name }],
  );
  assert.equal(printed[1], `from inbox card ${card.name} — removed from the inbox`);
  assert.equal(fs.existsSync(file), false, 'the card left the inbox');
  assert.ok(fs.existsSync(other.file), 'and the other card is where it was');
});

test("`nemia inbox add <file>` writes a path in the file's own `workflow:` absolute against the file's folder, so the card starts on the workflow the file meant — not on the store's workflow of that name, read from the inbox", async (t) => {
  emptyInbox();
  const repo = aRepoWith('dev');
  const theStores = path.join(ROOT, 'workflows', 'dev');
  fs.mkdirSync(theStores, { recursive: true });
  fs.writeFileSync(path.join(theStores, 'implement.md'), "the store's own\n");
  fs.mkdirSync(path.join(repo, 'plans'));
  const idea = path.join(repo, 'plans', 'idea.md');
  fs.writeFileSync(idea, `---\nworkflow: ../workflows/dev\nrepo: ${repo}\n---\nCache the views between passes\n`);
  try {
    await printedBy(t, 'inbox', 'add', idea);
    const [filed] = inInbox();
    assert.equal(
      fs.readFileSync(path.join(INBOX, filed), 'utf8'),
      `---\nworkflow: ${path.join(repo, 'workflows', 'dev')}\nrepo: ${repo}\n---\nCache the views between passes\n`,
    );
    const run = readRun((await printedBy(t, 'start', path.join(INBOX, filed)))[0].split(' ')[0]);
    assert.equal(
      run.workflowDir,
      path.join(repo, 'workflows', 'dev'),
      "the workflow the file meant, not the store's of the same name, which ../workflows/dev names when read from the inbox",
    );
    assert.equal(fs.readFileSync(idea, 'utf8').includes('workflow: ../workflows/dev'), true, 'the file given is left as it was');
  } finally {
    fs.rmSync(path.join(ROOT, 'workflows'), { recursive: true, force: true });
  }
});

test("a start says what the card does not, over what it does: --workflows over `workflow:`, --repo over `repo:`, the caller's repository without either, --brief in place of the body, and --after to wait on", async (t) => {
  emptyInbox();
  const repo = aRepoWith('dev');
  const other = aRepoWith('ui');
  const mine = fs.mkdtempSync(path.join(ROOT, 'mine-'));
  fs.writeFileSync(path.join(mine, 'implement.md'), '---\nplace: git\n---\nimplement it, mine\n');

  const over = addToInbox({ text: 'Show the flag', workflow: 'dev', repo });
  const run = readRun(
    (
      await printedBy(
        t,
        'start',
        over.file,
        '--workflows',
        mine,
        '--repo',
        other,
        '--brief',
        'Show the flag on the settings page, beside the theme toggle.',
      )
    )[0].split(' ')[0],
  );
  assert.deepEqual(
    [run.workflowDir, run.repo, run.brief, run.from],
    [mine, other, 'Show the flag on the settings page, beside the theme toggle.', { inbox: over.card.name }],
  );
  assert.match(run.id, /^show-the-flag-on-the-setting-[a-z0-9]{4}$/, 'the id from the brief it was started with');

  const bare = addToInbox({ text: 'Store the flag', workflow: 'ui' });
  const cwd = process.cwd();
  process.chdir(other);
  let here: Run;
  try {
    here = readRun((await printedBy(t, 'start', bare.file))[0].split(' ')[0]);
  } finally {
    process.chdir(cwd);
  }
  assert.deepEqual(
    [here.repo, here.workflowDir],
    [fs.realpathSync(other), path.join(fs.realpathSync(other), 'workflows', 'ui')],
    "no repo: on the card and none given: the caller's, nemia start's `.`, and its workflow: found there, by name",
  );
  const given = addToInbox({ text: 'Document the flag' });
  const byBoard = await runPlaced(
    startFromInbox({ name: given.card.name, workflow: path.join(repo, 'workflows', 'dev'), callerRepo: repo }),
  );
  assert.deepEqual([byBoard.run.repo, byBoard.run.workflowDir, byBoard.removed], [repo, path.join(repo, 'workflows', 'dev'), true]);

  const brief = path.join(mine, 'work.md');
  fs.writeFileSync(brief, 'Parse the flag in cli.ts.\n');
  const waits = addToInbox({ text: 'Parse the flag', workflow: 'dev', repo });
  const child = readRun((await printedBy(t, 'start', waits.file, '--brief', brief, '--after', byBoard.run.id))[0].split(' ')[0]);
  assert.deepEqual(
    [child.brief, child.after, child.from],
    ['Parse the flag in cli.ts.', [byBoard.run.id], { inbox: waits.card.name }],
    'a brief from a file, and what the card waits on, said at start',
  );
});

test("a card's `from:` is set and taken off by `nemia inbox from`, and its run is handed it as context before `--from`'s, a run both name once — REFUSED: a `from:` run also waited on, nothing written", async (t) => {
  emptyInbox();
  const repo = aRepoWith('dev');
  writeRecord('source-a1');
  writeRecord('source-b2');
  const card = addToInbox({ text: 'Read the sources', workflow: 'dev', repo });
  const set = await printedBy(t, 'inbox', 'from', card.card.name, 'source-a1');
  assert.match(set[0], /from: source-a1 — its run is handed what each concluded, as context, and waits on none/);
  assert.match(fs.readFileSync(card.file, 'utf8'), /^from: source-a1$/m);
  const off = await printedBy(t, 'inbox', 'from', card.card.name, '--off');
  assert.match(off[0], /from: taken off \(was source-a1\)/);
  assert.doesNotMatch(fs.readFileSync(card.file, 'utf8'), /^from:/m);

  await printedBy(t, 'inbox', 'from', card.card.name, 'source-a1');
  const before = runsWritten();
  await assert.rejects(
    async () =>
      await runPlaced(
        startFromInbox({ name: card.card.name, workflow: path.join(repo, 'workflows', 'dev'), callerRepo: repo, after: ['source-a1'] }),
      ),
    refusedWith('Invalid', 'from: source-a1', '--after source-a1'),
  );
  assert.equal(runsWritten(), before, 'nothing written');
  assert.ok(fs.existsSync(card.file), 'the card is kept');

  const started = await runPlaced(
    startFromInbox({
      name: card.card.name,
      workflow: path.join(repo, 'workflows', 'dev'),
      callerRepo: repo,
      context: ['source-b2', 'source-a1'],
    }),
  );
  assert.deepEqual(readRun(started.run.id).context, ['source-a1', 'source-b2']);
  assert.equal(readRun(started.run.id).after, undefined, 'it waits on none');
});

test('REFUSED by name at shipped defaults, before a run is written and with the card left in the inbox: a card not there — naming those there are — a name that would leave the inbox, no workflow from the card or the flag, a workflow that does not load, a card that does not read, an empty --brief, --brief on anything but an inbox card, and an --after start() refuses', async () => {
  emptyInbox();
  const repo = aRepoWith('dev', 'ui');
  const kept = addToInbox({ text: 'Cache the views', repo });
  const before = runsWritten();
  const starting = (...argv: string[]) => main(['start', ...argv], noEngine());

  await assert.rejects(
    starting(path.join(INBOX, 'cache-the-view.md')),
    refusedWith(
      'Missing',
      'no card cache-the-view in',
      `Its cards are: ${kept.card.name}.`,
      `nemia start ${path.join(INBOX, '<name>.md')}`,
      'nemia inbox add "<idea>"',
    ),
  );
  await assert.rejects(
    async () => await runPlaced(startFromInbox({ name: '../runs/x', callerRepo: repo })),
    refusedWith('Invalid', "`../runs/x` is not a card's name", 'no slash'),
  );
  await assert.rejects(
    async () => await runPlaced(startFromInbox({ name: 'a/b', callerRepo: repo })),
    refusedWith('Invalid', "`a/b` is not a card's name"),
  );
  await assert.rejects(
    async () => await runPlaced(startFromInbox({ name: '', callerRepo: repo })),
    refusedWith('Invalid', 'this name is empty', 'nemia inbox lists'),
  );

  await assert.rejects(
    starting(kept.file),
    refusedWith(
      'Invalid',
      `${kept.card.file}: no workflow`,
      `workflows are: dev, ui, in ${path.join(repo, 'workflows')}.`,
      `nemia start ${kept.file} --workflows dev`,
      '`workflow: dev`',
    ),
  );
  const loose = addToInbox({ text: 'Anywhere at all' });
  await assert.rejects(
    async () => await runPlaced(startFromInbox({ name: loose.card.name, callerRepo: fs.mkdtempSync(path.join(ROOT, 'bare-')) })),
    refusedWith('Invalid', `${loose.card.file}: no workflow`, 'has no workflows', `nemia start ${loose.file} --workflows <dir>`),
  );

  const nope = addToInbox({ text: 'Store the flag', workflow: 'nope', repo });
  await assert.rejects(
    starting(nope.file),
    refusedWith(
      'Invalid',
      `${nope.card.file}: \`workflow: nope\``,
      `no workflow folder at ${path.join(INBOX, 'nope')},`,
      `named nope in ${path.join(repo, 'workflows')}.`,
      'workflows are: dev, ui',
    ),
  );
  await assert.rejects(
    starting(kept.file, '--workflows', 'nope'),
    refusedWith('Invalid', 'no workflow folder at ', `named nope in ${path.join(repo, 'workflows')}.`, 'workflows are: dev, ui'),
  );

  fs.writeFileSync(
    path.join(INBOX, 'hand-written-a1b2.md'),
    `---\nworkflow: dev\nrepo: ${repo}\nafter: ${kept.card.name}\n---\nShow the flag\n`,
  );
  await assert.rejects(
    starting(path.join(INBOX, 'hand-written-a1b2.md')),
    refusedWith('Invalid', 'hand-written-a1b2.md: `after`', 'nemia start <inbox>/hand-written-a1b2.md --after <runId>'),
  );
  fs.writeFileSync(
    path.join(INBOX, 'moved-repo-a1b2.md'),
    `---\nworkflow: dev\nrepo: ${path.join(ROOT, 'moved-away')}\n---\nShow the flag\n`,
  );
  await assert.rejects(
    starting(path.join(INBOX, 'moved-repo-a1b2.md')),
    refusedWith('Invalid', 'moved-repo-a1b2.md: `repo: ', `${path.join(ROOT, 'moved-away')}\` names no directory`),
  );

  await assert.rejects(
    starting(kept.file, '--workflows', 'dev', '--brief', ''),
    refusedWith('Invalid', 'nemia start <inbox>/<name>.md --brief "<brief>"'),
  );
  await assert.rejects(
    async () => await runPlaced(startFromInbox({ name: kept.card.name, workflow: 'dev', brief: '  \n', callerRepo: repo })),
    refusedWith('Invalid', `${kept.card.file}: the brief`, 'is empty', 'Give what the run is asked to do', 'leave it out'),
  );
  await assert.rejects(
    starting('add a flag', '--workflows', path.join(repo, 'workflows', 'dev'), '--repo', repo, '--brief', 'x'),
    refusedWith('Invalid', `nemia start ${path.join(INBOX, '<name>.md')} --brief "<brief>"`, 'nemia start "<brief>"'),
  );
  await assert.rejects(
    starting(kept.file, '--workflows', 'dev', '--brief', 'x', '--brief', 'y'),
    refusedWith('Invalid', 'nemia start takes --brief once'),
  );
  await assert.rejects(
    starting(kept.file, '--workflows', 'dev', '--after', 'no-such-run-zz99'),
    refusedWith('Invalid', '--after no-such-run-zz99', 'nemia ls'),
  );

  assert.equal(runsWritten(), before, 'no run written');
  for (const f of [kept.file, loose.file, nope.file, path.join(INBOX, 'hand-written-a1b2.md'), path.join(INBOX, 'moved-repo-a1b2.md')])
    assert.ok(fs.existsSync(f), `${f} is still in the inbox`);
});

test(
  'REFUSED at shipped defaults: a card whose removal fails after its run is written is listed `started as` that run, and not started again until a person drops it',
  { skip: process.getuid?.() === 0 && 'root removes a file from a folder it may not write' },
  async (t) => {
    emptyInbox();
    const repo = aRepoWith('dev');
    const { card, file } = addToInbox({ text: 'Cache the views', workflow: 'dev', repo });
    const before = runsWritten();
    fs.chmodSync(INBOX, 0o555);
    let printed: string[];
    try {
      printed = await printedBy(t, 'start', file);
    } finally {
      fs.chmodSync(INBOX, 0o755);
    }
    const id = printed[0].split(' ')[0];
    assert.equal(runsWritten(), before + 1, 'the run is written');
    assert.deepEqual(readRun(id).from, { inbox: card.name });
    assert.match(
      printed[1],
      new RegExp(
        `^from inbox card ${escaped(card.name)} — still in the inbox: ${escaped(file)} could not be removed — .*\\. nemia inbox lists it as started as ${escaped(id)}: drop it with nemia inbox rm ${escaped(card.name)}$`,
      ),
    );
    assert.deepEqual(
      readInbox().map((l) => [l.name, l.startedAs]),
      [[card.name, [id]]],
    );
    assert.match(
      (await printedBy(t, 'inbox'))[0],
      new RegExp(`^${escaped(card.name)}  Cache the views  workflow: dev  repo: ${escaped(repo)}  started as ${escaped(id)}$`),
    );

    await assert.rejects(
      main(['start', file], noEngine()),
      refusedWith('Conflict', `${card.file}: this card was started as ${id}`, `nemia inbox rm ${card.name};`),
    );
    await assert.rejects(
      async () => await runPlaced(startFromInbox({ name: card.name, callerRepo: repo })),
      refusedWith('Conflict', `${card.file}: this card was started as ${id}`, `nemia inbox rm ${card.name};`),
    );
    assert.equal(runsWritten(), before + 1, 'not started twice');
    await printedBy(t, 'inbox', 'rm', card.name);
    assert.deepEqual(readInbox(), []);
  },
);

test('a card gone between its start and its removal — removed by someone else once the run is written — is still said removed, and the run stands', async (t) => {
  emptyInbox();
  const repo = aRepoWith('dev');
  const { card, file } = addToInbox({ text: 'Cache the views', workflow: 'dev', repo });
  const create = runStore.runs.create;
  t.mock.method(runStore.runs, 'create', (run: Run) => {
    create(run);
    fs.rmSync(file);
  });
  const started = await runPlaced(startFromInbox({ name: card.name, callerRepo: repo }));
  assert.equal(started.removed, true, 'a card already gone is not a removal that failed');
  assert.deepEqual(readRun(started.run.id).from, { inbox: card.name });
  assert.deepEqual(readInbox(), []);
});

test("a warm read of the inbox reads no finished run's record, however many there are, and answers a cold read's own", async () => {
  emptyInbox();
  for (const file of fs.readdirSync(path.join(ROOT, 'runs'))) fs.rmSync(path.join(ROOT, 'runs', file), { recursive: true });
  const { card } = addToInbox({ text: 'Cache the inbox' });
  writeRecord('r-started', { inbox: card.name });
  const memo = recordMemo<Pick<Run, 'id' | 'from'>>();
  const warm = async () => {
    readInbox(memo);
    return (await metered(async () => readInbox(memo))).tallies?.records;
  };

  const few = await warm();
  for (let n = 0; n < 200; n++) writeRecord(`fin-${String(n).padStart(3, '0')}`);
  const many = await warm();
  assert.equal(few, 0, 'nothing moved since the last read, so no record is read');
  assert.equal(many, few, "a warm read reads no finished run's record, however many there are");
  assert.deepEqual(readInbox(memo), readInbox(), "the warm answer is a cold read's own: nothing the board shows changes");
  assert.deepEqual(readInbox(memo).find((l) => l.name === card.name)?.startedAs, ['r-started'], 'and it still says what started the card');
});
