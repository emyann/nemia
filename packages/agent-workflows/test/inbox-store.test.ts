/**
 * The inbox on disk: `$WF_ROOT/inbox/`, filed, listed and dropped through the verbs, as a person types them.
 *
 * What a card is and what the listing says are pure, and live in inbox.test.ts. This is the part that is not: the folder, the name a card is
 * filed under, and the run records a listing reads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Engine } from 'agent-engine';
import type { Run } from '../src/run.ts';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-inbox-'));
const INBOX = path.join(ROOT, 'inbox');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

// WF_ROOT is read as the module loads, so it is set before the import rather than after it.
process.env.WF_ROOT = ROOT;
const { addToInbox, dropFromInbox, inboxDir, readInbox } = await import('../src/runner.ts');
const { main } = await import('../src/cli.ts');

/** No verb here asks the engine anything. */
const NO_ENGINE = {} as Engine;

/** Refused by name: exit 2, and the message — never `String(err)`, which starts with `Error: `. */
const refusedWith = (pattern: RegExp) => (err: Error & { exitCode?: number }) => err.exitCode === 2 && pattern.test(err.message);
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** What `main` printed, line by line, for one verb. */
const printedBy = async (t: { mock: { method: (o: object, m: string, f: (...a: unknown[]) => void) => { mock: { restore: () => void } } } }, ...argv: string[]): Promise<string[]> => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => { printed.push(args.join(' ')); });
  try { await main(argv, NO_ENGINE); } finally { log.mock.restore(); }
  return printed.join('\n').split('\n');
};

/** The cards in the inbox, by file. */
const inInbox = () => (fs.existsSync(INBOX) ? fs.readdirSync(INBOX).sort() : []);
const emptyInbox = () => fs.rmSync(INBOX, { recursive: true, force: true });

/** A run record, as `start()` writes one — only what the listing reads of it matters here. */
const writeRecord = (id: string, from?: Run['from']) => fs.writeFileSync(path.join(ROOT, 'runs', `${id}.json`), JSON.stringify({
  id, repo: '/repo', workspace: '/repo', baseRef: 'abc123', branch: 'main', isolate: false, brief: 'x', workflowDir: '/wf', steps: {}, createdAt: '2026-09-16T00:00:00Z',
  ...(from ? { from } : {}),
}));

test('the inbox is `$WF_ROOT/inbox/`, beside runs/ — and with no folder yet, `wf inbox` says it is empty', async (t) => {
  emptyInbox();
  assert.equal(inboxDir(), path.join(ROOT, 'inbox'));
  assert.deepEqual(readInbox(), []);
  assert.deepEqual(await printedBy(t, 'inbox'), ['the inbox is empty — park an idea with wf inbox add "<idea>"']);
  assert.match((await printedBy(t, 'inbox', '--help'))[0]!, /^wf inbox$/);
  assert.ok((await printedBy(t, 'help')).some((l) => l.startsWith('  wf inbox add "<idea>"|<file> [--workflow <name>] [--repo <path>]')), 'on the general help');
});

test("`wf inbox add` files a card under the slug of its first line and a suffix — two ideas alike are two cards — `--workflow` and `--repo` write its keys, a file is read as a card when its frontmatter is one; `wf inbox` lists each, with started as for a card a record names", async (t) => {
  emptyInbox();
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const added = await printedBy(t, 'inbox', 'add', "Cache the engine's views between passes\n\nThe tick reads each task twice.");
  const [name] = inInbox();
  assert.match(name!, /^cache-the-engine-s-views-bet-[a-z0-9]{4}\.md$/, 'the slug runId makes of the first line, suffix included');
  const card = path.join(INBOX, name!);
  assert.equal(fs.readFileSync(card, 'utf8'), "Cache the engine's views between passes\n\nThe tick reads each task twice.\n", 'no keys, no frontmatter');
  assert.deepEqual(added, [`${name!.slice(0, -3)}  Cache the engine's views between passes`, `filed: ${card} — start it with wf start ${card} --workflows <w>`]);

  await printedBy(t, 'inbox', 'add', "Cache the engine's views between passes", '--workflow', 'dev', `--repo=${path.relative(process.cwd(), repo)}`);
  const second = inInbox().find((f) => f !== name)!;
  assert.ok(second && second !== name, 'a second card, not the first written over');
  assert.equal(fs.readFileSync(path.join(INBOX, second), 'utf8'), `---\nworkflow: dev\nrepo: ${repo}\n---\nCache the engine's views between passes\n`, '--repo written absolute');

  // A file: its card's keys are read, the flag written over its own, and a workflow given as a path is kept absolute.
  const given = path.join(fs.mkdtempSync(path.join(ROOT, 'given-')), 'idea.md');
  fs.writeFileSync(given, `---\nworkflow: ui\nrepo: /nowhere/at/all\n---\nShow the flag on the settings page.\n`);
  await printedBy(t, 'inbox', 'add', given, '--repo', repo);
  const third = inInbox().find((f) => f.startsWith('show-the-flag'))!;
  assert.equal(fs.readFileSync(path.join(INBOX, third), 'utf8'), `---\nworkflow: ui\nrepo: ${repo}\n---\nShow the flag on the settings page.\n`);
  assert.equal(fs.readFileSync(given, 'utf8').includes('/nowhere/at/all'), true, 'the file given is left as it was');
  const byPath = addToInbox({ text: 'Store the flag', workflow: path.join(repo, 'workflows', 'dev') });
  assert.equal(byPath.card.workflow, path.join(repo, 'workflows', 'dev'));

  // Listed: a card a record names as started, a card that does not read, a file that is not a card; a hidden file and a README are not.
  writeRecord('show-the-flag-on-the-settin-zz99', { inbox: third.slice(0, -3) });
  writeRecord('an-unrelated-run-yy88');
  fs.writeFileSync(path.join(INBOX, 'broken-a1b2.md'), '---\nharness: codex\n---\nx\n');
  fs.writeFileSync(path.join(INBOX, 'notes.txt'), 'x');
  fs.writeFileSync(path.join(INBOX, '.idea.md.swp'), 'x');
  fs.writeFileSync(path.join(INBOX, 'README.md'), '# ideas\n');
  const listed = readInbox();
  assert.deepEqual(listed.map((l) => [l.name, l.startedAs, l.error === null]), [
    ['broken-a1b2', [], false],
    [name!.slice(0, -3), [], true],
    [second.slice(0, -3), [], true],
    ['notes.txt', [], false],
    [third.slice(0, -3), ['show-the-flag-on-the-settin-zz99'], true],
    [byPath.card.name, [], true],
  ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  const lines = await printedBy(t, 'inbox');
  assert.ok(lines.some((l) => new RegExp(`^${escaped(second.slice(0, -3))} +Cache the engine's views between passes  workflow: dev  repo: ${escaped(repo)}$`).test(l)), lines.join('\n'));
  assert.ok(lines.some((l) => new RegExp(`^${escaped(third.slice(0, -3))} +Show the flag on the settings page\\.  workflow: ui  repo: ${escaped(repo)}  started as show-the-flag-on-the-settin-zz99$`).test(l)), lines.join('\n'));
  assert.ok(lines.some((l) => /^broken-a1b2 +broken-a1b2\.md: `harness` is not a key an inbox card has\./.test(l)), lines.join('\n'));
  assert.deepEqual(lines.slice(-2), ['', `start one: wf start ${path.join(INBOX, '<name>.md')} [--workflows <w>] [--repo <r>] — drop one: wf inbox rm <name>`]);
  fs.rmSync(path.join(ROOT, 'runs', 'show-the-flag-on-the-settin-zz99.json'));
  fs.rmSync(path.join(ROOT, 'runs', 'an-unrelated-run-yy88.json'));
});

test('`wf inbox rm` drops a card without starting it — a name with no card is normal: it says so, and which cards there are, exit 0', async (t) => {
  emptyInbox();
  const { card, file } = addToInbox({ text: 'Drop me' });
  const kept = addToInbox({ text: 'Keep me' });
  assert.deepEqual(await printedBy(t, 'inbox', 'rm', card.name), [`${card.name}  dropped, and nothing started — ${file} removed`]);
  assert.equal(fs.existsSync(file), false);
  assert.deepEqual(dropFromInbox(card.name), { removed: false, cards: [kept.card.name] });
  assert.deepEqual(await printedBy(t, 'inbox', 'rm', card.name), [`no card ${card.name} in the inbox. Its cards are: ${kept.card.name}. Nothing to drop.`]);
  assert.deepEqual(await printedBy(t, 'inbox', 'rm', `${kept.card.name}.md`),
    [`no card ${kept.card.name}.md in the inbox. A card is named without its .md: \`${kept.card.name}\`. Its cards are: ${kept.card.name}. Nothing to drop.`]);
  assert.ok(fs.existsSync(kept.file), 'the other card is left');
  emptyInbox();
  assert.deepEqual(await printedBy(t, 'inbox', 'rm', 'anything'), ['no card anything in the inbox. The inbox is empty. Nothing to drop.']);
});

test("REFUSED by name at shipped defaults: `wf inbox add` with no idea, an empty one, a directory, a file whose card has `after:`, a repo that is not a directory, a flag with no value or twice — and `wf inbox rm` with a name that would leave the inbox, a hidden one, none, or two; nothing filed, nothing removed", async () => {
  emptyInbox();
  const add = (...argv: string[]) => main(['inbox', 'add', ...argv], NO_ENGINE);
  await assert.rejects(add(), refusedWith(/^wf inbox add takes the idea, first: wf inbox add "<idea>" \[--workflow <name>\] \[--repo <path>\], or a file: wf inbox add \.\/idea\.md\. Nothing was filed\.$/));
  await assert.rejects(add('--workflow', 'dev'), refusedWith(/^wf inbox add takes the idea, first:/));
  await assert.rejects(add(''), refusedWith(/^wf inbox add takes the idea, and the idea has nothing in it\./));
  await assert.rejects(add('   '), refusedWith(/^wf inbox add takes the idea, and the idea has nothing in it\./));
  const dir = fs.mkdtempSync(path.join(ROOT, 'given-'));
  const empty = path.join(dir, 'empty.md');
  fs.writeFileSync(empty, '\n');
  await assert.rejects(add(empty), refusedWith(new RegExp(`^wf inbox add takes the idea, and ${escaped(empty)} has nothing in it\\.`)));
  await assert.rejects(add(dir), refusedWith(new RegExp(`^${escaped(dir)} is a directory, and wf inbox add takes the idea as text or as one file`)));
  const waits = path.join(dir, 'd.md');
  fs.writeFileSync(waits, '---\nworkflow: dev\nafter: b, c\n---\nShow the flag.\n');
  await assert.rejects(add(waits), refusedWith(new RegExp(`^${escaped(waits)}: \`after\` is not a key an inbox card has: what a card waits on is said when it is started`)));
  await assert.rejects(add('an idea', '--repo', empty), refusedWith(new RegExp(`^the idea: \`repo: ${escaped(empty)}\` names no directory\\.`)));
  await assert.rejects(add('an idea', '--repo', path.join(ROOT, 'no-such-repo')), refusedWith(/^the idea: `repo: .*no-such-repo` names no directory\./));
  assert.throws(() => addToInbox({ text: 'an idea', repo: 'code/app' }), refusedWith(/^the idea: `repo: code\/app` is not an absolute path\./));
  await assert.rejects(add('an idea', '--workflow'), refusedWith(/^--workflow takes the workflow to start the card on, by name or as a path/));
  await assert.rejects(add('an idea', '--workflow='), refusedWith(/^--workflow takes the workflow to start the card on/));
  await assert.rejects(add('an idea', '--repo', ROOT, '--repo', ROOT), refusedWith(/^wf inbox add takes --repo once: a card names one repository\.$/));
  await assert.rejects(add('an idea', '--workflows', 'dev'), refusedWith(/^wf inbox add does not take --workflows\. It takes the idea, then --workflow <name> and --repo <path>\.$/));
  await assert.rejects(add('an', 'idea'), refusedWith(/^wf inbox add takes one idea, and idea is a second\. Quote an idea with spaces/));
  assert.deepEqual(inInbox(), [], 'nothing filed');

  const { card, file } = addToInbox({ text: 'Stay where you are' });
  const rm = (...argv: string[]) => main(['inbox', 'rm', ...argv], NO_ENGINE);
  // A file the way out of the folder would reach: a run's record.
  writeRecord('r-outside');
  for (const name of ['../runs/r-outside.json', '../runs/r-outside', 'sub/card', '..']) {
    await assert.rejects(rm(name), refusedWith(new RegExp(`^\`${escaped(name)}\` is not a card's name: a name stays in the inbox, with no slash and not \\. or \\.\\., since it names a file there\\.`)), name);
  }
  assert.throws(() => dropFromInbox('../runs/r-outside'), refusedWith(/^`\.\.\/runs\/r-outside` is not a card's name/));
  await assert.rejects(rm('.hidden'), refusedWith(/^`\.hidden` is not a card's name: a name that starts with a dot is a hidden file/));
  await assert.rejects(rm(), refusedWith(/^wf inbox rm takes the name of the card to drop, as wf inbox lists it: wf inbox rm <name>\.$/));
  await assert.rejects(rm(card.name, 'another'), refusedWith(/^wf inbox rm drops one card, and another is a second: wf inbox rm <name>, once per card\.$/));
  await assert.rejects(main(['inbox', 'list'], NO_ENGINE), refusedWith(/^wf inbox does not take list\. It lists the inbox — wf inbox — files a card with wf inbox add "<idea>", and drops one with wf inbox rm <name>/));
  assert.ok(fs.existsSync(path.join(ROOT, 'runs', 'r-outside.json')), 'the record outside the inbox is still there');
  assert.ok(fs.existsSync(file), 'and so is the card');
  fs.rmSync(path.join(ROOT, 'runs', 'r-outside.json'));
});
