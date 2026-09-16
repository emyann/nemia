/**
 * An inbox is cards before they are started: the card, and what `wf inbox` makes of the folder and the run records — pure, as data.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ideaCard, INBOX_KEYS, inboxLines, inboxListing, inboxNameOf, inboxNameRefusal, noCardLine, noWorkflowRefusal, parseInboxCard, startedRefusal, type InboxListing } from '../src/inbox.ts';
import { fromNote } from '../src/run.ts';

/** Refused by name: exit 2, and the message — never `String(err)`, which starts with `Error: `. */
const refusedWith = (pattern: RegExp) => (err: Error & { exitCode?: number }) => err.exitCode === 2 && pattern.test(err.message);

/** The directories there are, for a card's `repo:`. */
const DIRS = new Set(['/home/me/code/app', '/home/me/code/other']);
const isDirectory = (at: string) => DIRS.has(at);
const read = (text: string, file = 'cache-the-views-k2q9.md') => parseInboxCard(file, text, isDirectory);

test('an inbox card is its file: the name without .md, `workflow:` and `repo:` from its frontmatter when set — each optional — and the body', () => {
  assert.deepEqual(INBOX_KEYS, ['workflow', 'repo']);
  assert.deepEqual(read('---\nworkflow: dev\nrepo: /home/me/code/app\n---\nCache the views.\n\nBetween passes.\n'),
    { name: 'cache-the-views-k2q9', file: 'cache-the-views-k2q9.md', workflow: 'dev', repo: '/home/me/code/app', body: 'Cache the views.\n\nBetween passes.' });
  assert.deepEqual(read('Cache the views.\n'), { name: 'cache-the-views-k2q9', file: 'cache-the-views-k2q9.md', body: 'Cache the views.' }, 'no frontmatter: an idea, and nothing else');
  assert.deepEqual(read('---\nrepo: /home/me/code/other\n---\nCache the views.\n'), { name: 'cache-the-views-k2q9', file: 'cache-the-views-k2q9.md', repo: '/home/me/code/other', body: 'Cache the views.' });
  assert.deepEqual(read('---\nworkflow: ../workflows/mine\n---\nx\n'), { name: 'cache-the-views-k2q9', file: 'cache-the-views-k2q9.md', workflow: '../workflows/mine', body: 'x' });
  // Saved on Windows, with a comment and a blank line in the frontmatter; and a frontmatter of only a comment, over a body that opens with a rule.
  assert.deepEqual(read('﻿---\r\n# what runs it\r\nworkflow: dev\r\n\r\n---\r\nCache the views.\r\n'), { name: 'cache-the-views-k2q9', file: 'cache-the-views-k2q9.md', workflow: 'dev', body: 'Cache the views.' });
  assert.deepEqual(read('---\n# no keys\n---\n---\ntitle: a brief that opens with a rule\n---\nx\n'), { name: 'cache-the-views-k2q9', file: 'cache-the-views-k2q9.md', body: '---\ntitle: a brief that opens with a rule\n---\nx' });
});

test('REFUSED by name at shipped defaults: a key an inbox card does not have — `after:` with where it is said instead — `workflow:` or `repo:` set to nothing or twice, a `repo:` that is not absolute or names no directory, an empty body, and a frontmatter that never closes', () => {
  assert.throws(() => read('---\nworkflow: dev\nharness: codex\n---\nx\n'),
    refusedWith(/^cache-the-views-k2q9\.md: `harness` is not a key an inbox card has\. An inbox card's keys are: workflow, repo, each optional — what runs it, and the repository it is about;/));
  assert.throws(() => read('---\nrepos: /home/me/code/app\n---\nx\n'), refusedWith(/^cache-the-views-k2q9\.md: `repos` is not a key an inbox card has\./));
  assert.throws(() => read('---\nworkflow: dev\nafter: parse-the-flag-1x2y\n---\nx\n'),
    refusedWith(/^cache-the-views-k2q9\.md: `after` is not a key an inbox card has: what a card waits on is said when it is started, once the runs it could wait on are known — wf start <inbox>\/cache-the-views-k2q9\.md --after <runId>\. Delete the line\.$/));
  assert.throws(() => read('---\nworkflow:\n---\nx\n'), refusedWith(/^cache-the-views-k2q9\.md: `workflow` has no value\. Delete the line rather than leaving it blank/));
  assert.throws(() => read('---\nrepo:   \n---\nx\n'), refusedWith(/^cache-the-views-k2q9\.md: `repo` has no value\./));
  assert.throws(() => read('---\nrepo: /home/me/code/app\nrepo: /home/me/code/other\n---\nx\n'), refusedWith(/^cache-the-views-k2q9\.md: `repo` is set twice/));
  assert.throws(() => read('---\nrepo: code/app\n---\nx\n'),
    refusedWith(/^cache-the-views-k2q9\.md: `repo: code\/app` is not an absolute path\. `repo:` is the repository the idea is about, from the root/));
  assert.throws(() => read('---\nrepo: ./app\n---\nx\n'), refusedWith(/^cache-the-views-k2q9\.md: `repo: \.\/app` is not an absolute path\./));
  assert.throws(() => read('---\nrepo: /home/me/code/gone\n---\nx\n'),
    refusedWith(/^cache-the-views-k2q9\.md: `repo: \/home\/me\/code\/gone` names no directory\. Correct it to the repository the idea is about, or delete the line/));
  assert.throws(() => read('---\nworkflow: dev\n---\n'), refusedWith(/^cache-the-views-k2q9\.md: the body is empty\./));
  assert.throws(() => read('   \n'), refusedWith(/^cache-the-views-k2q9\.md: the body is empty\./));
  assert.throws(() => read('---\nworkflow dev\n---\nx\n'), refusedWith(/^cache-the-views-k2q9\.md: `workflow dev` is not `key: value`\./));
  assert.throws(() => read('---\nworkflow: dev\nCache the views.\n'), refusedWith(/^cache-the-views-k2q9\.md: the frontmatter opened on the first line never closes/));
});

test("`inboxListing`: each card by file name, with the runs whose record's `from` names it — an entry that is not a card listed with why, never hidden — and neither a hidden file nor a README", () => {
  const files = [
    { file: 'parse-the-flag-1x2y.md', text: '---\nworkflow: dev\n---\nParse the flag.\n\nIn cli.ts.\n' },
    { file: 'README.md', text: '# ideas\n' },
    { file: '.cache-the-views-k2q9.md.swp', text: '' },
    { file: 'cache-the-views-k2q9.md', text: '---\nrepo: /home/me/code/app\n---\nCache the views between passes.\n' },
    { file: 'broken-a1b2.md', text: '---\nafter: parse-the-flag-1x2y\n---\nx\n' },
    { file: 'notes.txt', text: '' },
    { file: 'drafts/', text: '' },
  ];
  const runs = [
    { id: 'parse-the-flag-ab12', from: { inbox: 'parse-the-flag-1x2y' } },
    { id: 'add-a-flag-cd34' },
    { id: 'parse-the-flag-ef56', from: { inbox: 'parse-the-flag-1x2y' } },
    { id: 'broken-gh78', from: { inbox: 'broken-a1b2' } },
  ];
  const listing = inboxListing(files, runs, isDirectory);
  assert.deepEqual(listing, [
    { name: 'broken-a1b2', file: 'broken-a1b2.md', title: null, workflow: null, repo: null, startedAs: ['broken-gh78'], error: "broken-a1b2.md: `after` is not a key an inbox card has: what a card waits on is said when it is started, once the runs it could wait on are known — wf start <inbox>/broken-a1b2.md --after <runId>. Delete the line." },
    { name: 'cache-the-views-k2q9', file: 'cache-the-views-k2q9.md', title: 'Cache the views between passes.', workflow: null, repo: '/home/me/code/app', startedAs: [], error: null },
    { name: 'drafts/', file: 'drafts/', title: null, workflow: null, repo: null, startedAs: [], error: 'drafts/: not a card. The inbox holds one markdown file per card, <name>.md — move it out, or, for a card, name it <name>.md.' },
    { name: 'notes.txt', file: 'notes.txt', title: null, workflow: null, repo: null, startedAs: [], error: 'notes.txt: not a card. The inbox holds one markdown file per card, <name>.md — move it out, or, for a card, name it <name>.md.' },
    { name: 'parse-the-flag-1x2y', file: 'parse-the-flag-1x2y.md', title: 'Parse the flag.', workflow: 'dev', repo: null, startedAs: ['parse-the-flag-ab12', 'parse-the-flag-ef56'], error: null },
  ] satisfies InboxListing[]);
  assert.deepEqual(inboxListing([], runs, isDirectory), []);
  // A record naming a card no longer there lists nothing: that card was started, and removed.
  assert.deepEqual(inboxListing([files[3]!], [{ id: 'gone-1234', from: { inbox: 'parse-the-flag-1x2y' } }], isDirectory).map((l) => l.startedAs), [[]]);
});

test('`wf inbox` prints a line per entry: the name, the first line of the body, workflow and repo when set, and started as — or why it is not a card', () => {
  const listing = inboxListing([
    { file: 'parse-the-flag-1x2y.md', text: '---\nworkflow: dev\nrepo: /home/me/code/app\n---\nParse the flag option in cli.ts, and every option after it on the same line.\n' },
    { file: 'cache-a1.md', text: 'Cache the views.\n' },
    { file: 'notes.txt', text: '' },
  ], [{ id: 'cache-the-views-ab12', from: { inbox: 'cache-a1' } }], isDirectory);
  assert.deepEqual(inboxLines(listing), [
    'cache-a1             Cache the views.  started as cache-the-views-ab12',
    'notes.txt            notes.txt: not a card. The inbox holds one markdown file per card, <name>.md — move it out, or, for a card, name it <name>.md.',
    'parse-the-flag-1x2y  Parse the flag option in cli.ts, and every option after  workflow: dev  repo: /home/me/code/app',
  ]);
  assert.deepEqual(inboxLines([]), []);
});

test('`noCardLine` says the inbox has no card of that name, and which it has — the name without its .md when that is one', () => {
  assert.equal(noCardLine('cache-the-views', ['parse-the-flag-1x2y', 'cache-the-views-k2q9']), 'no card cache-the-views in the inbox. Its cards are: cache-the-views-k2q9, parse-the-flag-1x2y.');
  assert.equal(noCardLine('cache-the-views-k2q9.md', ['cache-the-views-k2q9']), 'no card cache-the-views-k2q9.md in the inbox. A card is named without its .md: `cache-the-views-k2q9`. Its cards are: cache-the-views-k2q9.');
  assert.equal(noCardLine('anything', []), 'no card anything in the inbox. The inbox is empty.');
});

test('REFUSED by name at shipped defaults: a name that would leave the inbox — a slash, `..`, `.` — a hidden file, and no name at all', () => {
  assert.equal(inboxNameRefusal('cache-the-views-k2q9'), undefined);
  assert.equal(inboxNameRefusal('a..b'), undefined, 'two dots inside a name stay in the folder');
  for (const name of ['../runs/r-1', '..', '.', 'drafts/idea', '/etc/passwd', 'a\\b', 'a\0b']) {
    assert.match(inboxNameRefusal(name) ?? '', /^`.*` is not a card's name: a name stays in the inbox, with no slash and not \. or \.\., since it names a file there\./s, name);
  }
  assert.match(inboxNameRefusal('.cache-the-views-k2q9') ?? '', /^`\.cache-the-views-k2q9` is not a card's name: a name that starts with a dot is a hidden file, and wf inbox lists none\./);
  assert.match(inboxNameRefusal('') ?? '', /^A card is named by its file in the inbox, minus \.md, as wf inbox lists it, and this name is empty\./);
  assert.match(inboxNameRefusal('  ') ?? '', /this name is empty/);
});

test("`ideaCard`: a note is the body; a file whose frontmatter is an inbox card's gives its keys; any other text is the body whole — and `--workflow`, `--repo` are written over the text's own", () => {
  assert.deepEqual(ideaCard('the idea', 'Cache the views.\n\nBetween passes.  \n', {}, isDirectory), { text: 'Cache the views.\n\nBetween passes.\n', body: 'Cache the views.\n\nBetween passes.' });
  assert.deepEqual(ideaCard('the idea', 'Cache the views.', { workflow: 'dev', repo: '/home/me/code/app' }, isDirectory),
    { text: '---\nworkflow: dev\nrepo: /home/me/code/app\n---\nCache the views.\n', body: 'Cache the views.' });
  assert.deepEqual(ideaCard('./idea.md', '---\n# mine\nworkflow: ui\nrepo: /home/me/code/app\n---\nCache the views.\n', { repo: '/home/me/code/other' }, isDirectory),
    { text: '---\nworkflow: ui\nrepo: /home/me/code/other\n---\nCache the views.\n', body: 'Cache the views.' });
  assert.equal(ideaCard('./idea.md', '---\nrepo: code/app\n---\nx\n', { repo: '/home/me/code/app' }, isDirectory).text, '---\nrepo: /home/me/code/app\n---\nx\n', 'what is written over is not asked to hold');
  assert.deepEqual(ideaCard('./idea.md', '﻿Cache the views.\r\nBetween passes.\r\n', {}, isDirectory), { text: 'Cache the views.\nBetween passes.\n', body: 'Cache the views.\nBetween passes.' });
  // Not a card's frontmatter, so the text is the body whole — kept from being read as frontmatter by a comment before it; and a rule that never closes.
  const brief = '---\ntitle: the flag\nworkflow: dev\n---\nParse it.';
  const kept = ideaCard('./brief.md', `${brief}\n`, {}, isDirectory);
  assert.deepEqual(kept, { text: `---\n# the idea below opens with a rule of its own\n---\n${brief}\n`, body: brief });
  assert.equal(parseInboxCard('brief-ab12.md', kept.text, isDirectory).body, brief, 'the card it writes reads back as the text it was given');
  assert.equal(ideaCard('./brief.md', brief, { workflow: 'dev' }, isDirectory).text, `---\nworkflow: dev\n---\n${brief}\n`);
  assert.equal(ideaCard('the idea', '---\nA note that opens with a rule.\n', {}, isDirectory).body, '---\nA note that opens with a rule.');
});

test("REFUSED by name at shipped defaults: `wf inbox add` with nothing in the idea, a file whose card has `after:` or a key it does not have, a workflow or repo given empty or on two lines, and a repo that is not an absolute directory", () => {
  for (const text of ['', '   ', '\n\n']) {
    assert.throws(() => ideaCard('the idea', text, {}, isDirectory),
      refusedWith(/^wf inbox add takes the idea, and the idea has nothing in it\. Give it as text — wf inbox add "<idea>" — or as a file: wf inbox add \.\/idea\.md\. Nothing was filed\.$/));
  }
  assert.throws(() => ideaCard('./empty.md', '---\nworkflow: dev\n---\n', {}, isDirectory), refusedWith(/^\.\/empty\.md: the body is empty\./));
  assert.throws(() => ideaCard('./d.md', '---\nworkflow: dev\nafter: b, c\n---\nShow the flag.\n', {}, isDirectory), refusedWith(/^\.\/d\.md: `after` is not a key an inbox card has:/));
  assert.throws(() => ideaCard('./d.md', '---\nworkflow: dev\nrepo: /home/me/code/app\nrepo: /home/me/code/app\n---\nx\n', {}, isDirectory), refusedWith(/^\.\/d\.md: `repo` is set twice/));
  assert.throws(() => ideaCard('the idea', 'x', { workflow: '' }, isDirectory), refusedWith(/^the idea: `workflow` has no value\./));
  assert.throws(() => ideaCard('the idea', 'x', { repo: ' ' }, isDirectory), refusedWith(/^the idea: `repo` has no value\./));
  assert.throws(() => ideaCard('the idea', 'x', { repo: 'code/app' }, isDirectory), refusedWith(/^the idea: `repo: code\/app` is not an absolute path\./));
  assert.throws(() => ideaCard('the idea', 'x', { repo: '/home/me/code/gone' }, isDirectory), refusedWith(/^the idea: `repo: \/home\/me\/code\/gone` names no directory\./));
  assert.throws(() => ideaCard('the idea', 'x', { workflow: 'dev\nharness: codex' }, isDirectory),
    refusedWith(/^the idea: the workflow given, "dev\\nharness: codex", is more than one line, and a card's workflow: is one\. Give the one line it names\.$/));
  assert.throws(() => ideaCard('the idea', 'x', { repo: '/home/me/code/app\r\n---' }, isDirectory), refusedWith(/^the idea: the repo given, .* is more than one line/));
});

test('`inboxNameOf`: a path to `<inbox>/<name>.md`, directly in the inbox, is that card — any other path is not, a card of a plan and a folder inside the inbox included', () => {
  const inbox = '/home/me/.agent-workflows/inbox';
  assert.equal(inboxNameOf(`${inbox}/cache-the-views-k2q9.md`, inbox), 'cache-the-views-k2q9');
  assert.equal(inboxNameOf(`${inbox}/gone-a1b2.md`, inbox), 'gone-a1b2', 'whether it is there is the start\'s to say');
  assert.equal(inboxNameOf(`${inbox}/.md`, inbox), '', 'and whether it is a name, the start\'s too');
  for (const at of [`${inbox}/drafts/idea.md`, `${inbox}/notes.txt`, inbox, '/home/me/plans/q3/a.md', '/home/me/.agent-workflows/inbox-old/idea.md', '/home/me/.agent-workflows/idea.md']) {
    assert.equal(inboxNameOf(at, inbox), null, at);
  }
});

test('a card with no workflow is refused naming the workflows the repository has, and how to name one — or that it has none; a card a record names as started, naming the run and how to drop it; `wf decide` names the card a run came from', () => {
  const card = { name: 'cache-the-views-k2q9', file: 'cache-the-views-k2q9.md' };
  const where = '/home/me/.agent-workflows/inbox/cache-the-views-k2q9.md';
  assert.equal(noWorkflowRefusal(card, where, '/home/me/code/app', ['dev', 'ui']),
    'cache-the-views-k2q9.md: no workflow — the card names none, and none was given, so nothing says what runs it. The repository\'s workflows are: dev, ui, in /home/me/code/app/workflows. Name one: wf start /home/me/.agent-workflows/inbox/cache-the-views-k2q9.md --workflows dev, or write `workflow: dev` in the card.');
  assert.equal(noWorkflowRefusal(card, where, '/home/me/code/app', []),
    'cache-the-views-k2q9.md: no workflow — the card names none, and none was given, so nothing says what runs it. /home/me/code/app/workflows has no workflows. Give a workflow folder: wf start /home/me/.agent-workflows/inbox/cache-the-views-k2q9.md --workflows <dir>, or write `workflow:` in the card.');
  assert.equal(startedRefusal(card, where, ['cache-the-views-ab12']),
    `cache-the-views-k2q9.md: this card was started as cache-the-views-ab12 — that run's record says so — and is still in the inbox because its removal failed. Drop it with wf inbox rm cache-the-views-k2q9; to run the idea again, park it again under a name of its own first: wf inbox add ${where}.`);
  assert.match(startedRefusal(card, where, ['a-1', 'b-2']), /^cache-the-views-k2q9\.md: this card was started as a-1, b-2 — their records say so — /);
  assert.equal(fromNote({ from: { inbox: 'cache-the-views-k2q9' } }), 'from inbox card cache-the-views-k2q9');
  assert.equal(fromNote({}), undefined);
});
