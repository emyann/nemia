/**
 * An inbox is cards before they are started: the card, and what `nemia inbox` makes of the folder and the run records — pure, as data.
 */
import { test } from 'node:test';
import { queueFactoryRefusal } from './queue-factory.ts';
import assert from 'node:assert/strict';
import {
  fromText,
  ideaCard,
  INBOX_KEY_MEANINGS,
  INBOX_KEYS,
  inboxLines,
  inboxListing,
  inboxNameOf,
  inboxNameRefusal,
  nextQueued,
  noCardLine,
  noWorkflowRefusal,
  parseInboxCard,
  queuedText,
  queueLine,
  queueOrder,
  queueRefusal,
  queueRepo,
  startedRefusal,
  unfactoredCardRefusal,
  workflowAt,
  type InboxListing,
} from './inbox.ts';
import { fromNote } from '../start/index.ts';

/**
 * A table of one line of meaning per key, as the board lays a card's keys out: why `meanings` is not one, or null (as
 * workflow.test.ts's).
 */
function meaningsRefusal(keys: readonly string[], meanings: Readonly<Record<string, string>>): string | null {
  if (JSON.stringify(Object.keys(meanings)) !== JSON.stringify(keys))
    return `keys ${Object.keys(meanings).join(', ')} are not ${keys.join(', ')}, in that order`;
  const bad = Object.entries(meanings).find(([, line]) => typeof line !== 'string' || !line.trim() || /[\r\n]/.test(line));
  return bad ? `${bad[0]}'s meaning is not one line: ${JSON.stringify(bad[1])}` : null;
}

/** Refused by name: exit 2, and the message — never `String(err)`, which starts with `Error: `. */
const refusedWith = (pattern: RegExp) => (err: Error & { exitCode?: number }) => err.exitCode === 2 && pattern.test(err.message);

/** The directories there are, for a card's `repo:`. */
const DIRS = new Set(['/home/me/code/app', '/home/me/code/other']);
const isDirectory = (at: string) => DIRS.has(at);
const read = (text: string, file = 'cache-the-views-k2q9.md') => parseInboxCard(file, text, isDirectory);

test("each of an inbox card's keys has one line of meaning, in the keys' order", () => {
  assert.equal(meaningsRefusal(INBOX_KEYS, INBOX_KEY_MEANINGS), null);
  const { workflow } = INBOX_KEY_MEANINGS;
  assert.match(String(meaningsRefusal(INBOX_KEYS, { workflow })), /are not workflow, repo/, 'refused: repo without a line');
  assert.match(
    String(meaningsRefusal(INBOX_KEYS, { ...INBOX_KEY_MEANINGS, repo: '' })),
    /^repo's meaning is not one line/,
    'refused: an empty line',
  );
});

test('an inbox card is its file: the name without .md, `workflow:` and `repo:` from its frontmatter when set — each optional — and the body', () => {
  assert.deepEqual(INBOX_KEYS, ['workflow', 'repo', 'queued', 'gate', 'factory', 'from']);
  assert.deepEqual(read('---\nworkflow: dev\nrepo: /home/me/code/app\n---\nCache the views.\n\nBetween passes.\n'), {
    name: 'cache-the-views-k2q9',
    file: 'cache-the-views-k2q9.md',
    workflow: 'dev',
    repo: '/home/me/code/app',
    body: 'Cache the views.\n\nBetween passes.',
  });
  assert.deepEqual(
    read('Cache the views.\n'),
    { name: 'cache-the-views-k2q9', file: 'cache-the-views-k2q9.md', body: 'Cache the views.' },
    'no frontmatter: an idea, and nothing else',
  );
  assert.deepEqual(read('---\nrepo: /home/me/code/other\n---\nCache the views.\n'), {
    name: 'cache-the-views-k2q9',
    file: 'cache-the-views-k2q9.md',
    repo: '/home/me/code/other',
    body: 'Cache the views.',
  });
  assert.deepEqual(read('---\nworkflow: ../workflows/mine\n---\nx\n'), {
    name: 'cache-the-views-k2q9',
    file: 'cache-the-views-k2q9.md',
    workflow: '../workflows/mine',
    body: 'x',
  });
  assert.deepEqual(
    read('﻿---\r\n# what runs it\r\nworkflow: dev\r\n\r\n---\r\nCache the views.\r\n'),
    {
      name: 'cache-the-views-k2q9',
      file: 'cache-the-views-k2q9.md',
      workflow: 'dev',
      body: 'Cache the views.',
    },
    'saved on Windows, with a comment and a blank line in the frontmatter',
  );
  assert.deepEqual(
    read('---\n# no keys\n---\n---\ntitle: a brief that opens with a rule\n---\nx\n'),
    {
      name: 'cache-the-views-k2q9',
      file: 'cache-the-views-k2q9.md',
      body: '---\ntitle: a brief that opens with a rule\n---\nx',
    },
    'a frontmatter of only a comment, over a body that opens with a rule',
  );
});

test('REFUSED by name at shipped defaults: a key an inbox card does not have — `after:` with where it is said instead — `workflow:` or `repo:` set to nothing or twice, a `repo:` that is not absolute or names no directory, an empty body, and a frontmatter that never closes', () => {
  assert.throws(
    () => read('---\nworkflow: dev\nharness: codex\n---\nx\n'),
    refusedWith(
      /^cache-the-views-k2q9\.md: `harness` is not a key an inbox card has\. An inbox card's keys are: workflow, repo, queued, gate, factory, from, each optional — what runs it, the repository it is about, when it was queued to start on its own, the step its run waits at for a person, the factory that processes it, and the runs it is handed as context;/,
    ),
  );
  assert.throws(
    () => read('---\nrepos: /home/me/code/app\n---\nx\n'),
    refusedWith(/^cache-the-views-k2q9\.md: `repos` is not a key an inbox card has\./),
  );
  assert.throws(
    () => read('---\nworkflow: dev\nafter: parse-the-flag-1x2y\n---\nx\n'),
    refusedWith(
      /^cache-the-views-k2q9\.md: `after` is not a key an inbox card has: what a card waits on is said when it is started, once the runs it could wait on are known — nemia start <inbox>\/cache-the-views-k2q9\.md --after <runId>\. Delete the line\.$/,
    ),
  );
  assert.throws(
    () => read('---\nworkflow:\n---\nx\n'),
    refusedWith(/^cache-the-views-k2q9\.md: `workflow` has no value\. Delete the line rather than leaving it blank/),
  );
  assert.throws(() => read('---\nrepo:   \n---\nx\n'), refusedWith(/^cache-the-views-k2q9\.md: `repo` has no value\./));
  assert.throws(
    () => read('---\nrepo: /home/me/code/app\nrepo: /home/me/code/other\n---\nx\n'),
    refusedWith(/^cache-the-views-k2q9\.md: `repo` is set twice/),
  );
  assert.throws(
    () => read('---\nrepo: code/app\n---\nx\n'),
    refusedWith(
      /^cache-the-views-k2q9\.md: `repo: code\/app` is not an absolute path\. `repo:` is the repository the idea is about, from the root/,
    ),
  );
  assert.throws(
    () => read('---\nrepo: ./app\n---\nx\n'),
    refusedWith(/^cache-the-views-k2q9\.md: `repo: \.\/app` is not an absolute path\./),
  );
  assert.throws(
    () => read('---\nrepo: /home/me/code/gone\n---\nx\n'),
    refusedWith(
      /^cache-the-views-k2q9\.md: `repo: \/home\/me\/code\/gone` names no directory\. Correct it to the repository the idea is about, or delete the line/,
    ),
  );
  assert.throws(() => read('---\nworkflow: dev\n---\n'), refusedWith(/^cache-the-views-k2q9\.md: the body is empty\./));
  assert.throws(() => read('   \n'), refusedWith(/^cache-the-views-k2q9\.md: the body is empty\./));
  assert.throws(() => read('---\nworkflow dev\n---\nx\n'), refusedWith(/^cache-the-views-k2q9\.md: `workflow dev` is not `key: value`\./));
  assert.throws(
    () => read('---\nworkflow: dev\nCache the views.\n'),
    refusedWith(/^cache-the-views-k2q9\.md: the frontmatter opened on the first line never closes/),
  );
});

test("`gate:` names the step a card's run waits at for a person, carried by the card, its listing, its line, a queue and a filing — REFUSED by name: more than one step, a step's own `true`, no value, and the line twice", () => {
  const card = read('---\nworkflow: dev-planned\ngate: plan\n---\nCache the views.\n');
  assert.deepEqual(card, {
    name: 'cache-the-views-k2q9',
    file: 'cache-the-views-k2q9.md',
    workflow: 'dev-planned',
    gate: 'plan',
    body: 'Cache the views.',
  });
  assert.equal(read('---\nworkflow: dev\n---\nx\n').gate, undefined, 'no gate unless it says so');

  const [listed] = inboxListing(
    [{ file: 'cache-the-views-k2q9.md', text: '---\nworkflow: dev-planned\ngate: plan\n---\nCache the views.\n' }],
    [],
    isDirectory,
  );
  assert.equal(listed.gate, 'plan');
  assert.equal(
    Object.hasOwn(inboxListing([{ file: 'bare-a1b2.md', text: 'A bare idea.\n' }], [], isDirectory)[0], 'gate'),
    false,
    'a card with no gate lists none — the listing is what it was',
  );
  assert.deepEqual(inboxLines([listed]), ['cache-the-views-k2q9  Cache the views.  workflow: dev-planned  gate: plan']);

  assert.equal(
    queuedText(card, '2026-09-16T10:00:00.000Z', isDirectory),
    '---\nworkflow: dev-planned\nqueued: 2026-09-16T10:00:00.000Z\ngate: plan\n---\nCache the views.\n',
    'queued, and taken back: the gate stays',
  );
  assert.equal(
    ideaCard('./idea.md', '---\nworkflow: dev-planned\ngate: plan\n---\nCache the views.\n', {}, isDirectory).text,
    '---\nworkflow: dev-planned\ngate: plan\n---\nCache the views.\n',
    "filed from a file whose frontmatter is a card's: the gate is kept",
  );

  assert.throws(
    () => read('---\nworkflow: dev\ngate: plan, review\n---\nx\n'),
    refusedWith(
      /^cache-the-views-k2q9\.md: `gate: plan, review` names more than one step\. A card gates one step of its workflow — `gate: plan` — and its start gates any other: nemia start <inbox>\/cache-the-views-k2q9\.md --gate <step>\.$/,
    ),
  );
  assert.throws(
    () => read('---\nworkflow: dev\ngate: true\n---\nx\n'),
    refusedWith(
      /^cache-the-views-k2q9\.md: `gate: true` is how a step's own file gates it, and a card names the step its run waits at — `gate: plan` — since a card is not a step\. Name the step, or delete the line\.$/,
    ),
  );
  assert.throws(() => read('---\ngate:\n---\nx\n'), refusedWith(/^cache-the-views-k2q9\.md: `gate` has no value\./));
  assert.throws(() => read('---\ngate: plan\ngate: review\n---\nx\n'), refusedWith(/^cache-the-views-k2q9\.md: `gate` is set twice/));
});

test("`factory:` names the factory that processes a card, carried by the card, its listing, its line, a queue and a filing, written last — REFUSED by name: a value that is not a factory's name, no value, the line twice, and a misspelling", () => {
  const text = '---\nworkflow: build\nfactory: pipao\n---\nCache the views.\n';
  const card = read(text);
  assert.deepEqual(card, {
    name: 'cache-the-views-k2q9',
    file: 'cache-the-views-k2q9.md',
    workflow: 'build',
    factory: 'pipao',
    body: 'Cache the views.',
  });
  assert.equal(
    Object.hasOwn(read('---\nworkflow: dev\n---\nx\n'), 'factory'),
    false,
    "no factory unless it says so: the default factory's",
  );
  assert.equal(read('---\nfactory: default\n---\nx\n').factory, 'default', 'the default factory by name, read as written');

  const [listed] = inboxListing([{ file: 'cache-the-views-k2q9.md', text }], [], isDirectory);
  assert.equal(listed.factory, 'pipao');
  assert.equal(inboxListing([{ file: 'bare-a1b2.md', text: 'A bare idea.\n' }], [], isDirectory)[0].factory, null);
  assert.deepEqual(inboxLines([listed]), ['cache-the-views-k2q9  Cache the views.  workflow: build  factory: pipao']);

  assert.equal(
    queuedText(card, '2026-09-16T10:00:00.000Z', isDirectory),
    '---\nworkflow: build\nqueued: 2026-09-16T10:00:00.000Z\nfactory: pipao\n---\nCache the views.\n',
    'queued: the factory stays, last',
  );
  assert.equal(read(queuedText(card, null, isDirectory, 'dev')).factory, 'pipao', 'taken back, with another workflow: the factory stays');
  assert.equal(
    ideaCard('./idea.md', '---\nfactory: pipao\ngate: plan\nworkflow: build\n---\nCache the views.\n', {}, isDirectory).text,
    '---\nworkflow: build\ngate: plan\nfactory: pipao\n---\nCache the views.\n',
    "filed from a file whose frontmatter is a card's: the factory is kept, and the keys written in their order",
  );
  assert.equal(
    ideaCard('the idea', 'Cache the views.', { workflow: 'build', factory: 'pipao' }, isDirectory).text,
    '---\nworkflow: build\nfactory: pipao\n---\nCache the views.\n',
  );
  assert.equal(
    ideaCard('./idea.md', '---\nfactory: pipao\n---\nx\n', { factory: 'nemia-2', workflow: undefined }, isDirectory).text,
    '---\nfactory: nemia-2\n---\nx\n',
    "the factory given over the text's own, and a key given as undefined leaves none",
  );

  assert.throws(
    () => read('---\nfactory: Pipao\n---\nx\n'),
    refusedWith(
      /^cache-the-views-k2q9\.md: `factory: Pipao` — `Pipao` is not a factory's name: .* — pipao, say\. Correct it to a factory nemia factory ls lists\.$/,
    ),
  );
  assert.throws(
    () => ideaCard('the idea', 'x', { factory: 'my factory' }, isDirectory),
    refusedWith(/^the idea: `factory: my factory` — `my factory` is not a factory's name/),
    'a factory given to nemia inbox add is refused as the card would be',
  );
  assert.throws(
    () => ideaCard('the idea', 'x', { factory: 'pipao\nqueued: 2026-09-16T10:00:00.000Z' }, isDirectory),
    refusedWith(/^the idea: the factory given, .* is more than one line, and a card's factory: is one\./),
  );
  assert.throws(() => read('---\nfactory:\n---\nx\n'), refusedWith(/^cache-the-views-k2q9\.md: `factory` has no value\./));
  assert.throws(
    () => read('---\nfactory: pipao\nfactory: nemia\n---\nx\n'),
    refusedWith(/^cache-the-views-k2q9\.md: `factory` is set twice/),
  );
  assert.throws(
    () => read('---\nfactry: pipao\n---\nx\n'),
    refusedWith(
      /^cache-the-views-k2q9\.md: `factry` is not a key an inbox card has\. An inbox card's keys are: workflow, repo, queued, gate, factory,/,
    ),
  );
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
    {
      name: 'broken-a1b2',
      file: 'broken-a1b2.md',
      title: null,
      workflow: null,
      repo: null,
      factory: null,
      startedAs: ['broken-gh78'],
      from: [],
      error:
        'broken-a1b2.md: `after` is not a key an inbox card has: what a card waits on is said when it is started, once the runs it could wait on are known — nemia start <inbox>/broken-a1b2.md --after <runId>. Delete the line.',
    },
    {
      name: 'cache-the-views-k2q9',
      file: 'cache-the-views-k2q9.md',
      title: 'Cache the views between passes.',
      workflow: null,
      repo: '/home/me/code/app',
      factory: null,
      startedAs: [],
      from: [],
      error: null,
    },
    {
      name: 'drafts/',
      file: 'drafts/',
      title: null,
      workflow: null,
      repo: null,
      factory: null,
      startedAs: [],
      from: [],
      error: 'drafts/: not a card. The inbox holds one markdown file per card, <name>.md — move it out, or, for a card, name it <name>.md.',
    },
    {
      name: 'notes.txt',
      file: 'notes.txt',
      title: null,
      workflow: null,
      repo: null,
      factory: null,
      startedAs: [],
      from: [],
      error:
        'notes.txt: not a card. The inbox holds one markdown file per card, <name>.md — move it out, or, for a card, name it <name>.md.',
    },
    {
      name: 'parse-the-flag-1x2y',
      file: 'parse-the-flag-1x2y.md',
      title: 'Parse the flag.',
      workflow: 'dev',
      repo: null,
      factory: null,
      startedAs: ['parse-the-flag-ab12', 'parse-the-flag-ef56'],
      from: [],
      error: null,
    },
  ] satisfies InboxListing[]);
  assert.deepEqual(inboxListing([], runs, isDirectory), []);
  assert.deepEqual(
    inboxListing([files[3]], [{ id: 'gone-1234', from: { inbox: 'parse-the-flag-1x2y' } }], isDirectory).map((l) => l.startedAs),
    [[]],
    'a record naming a card no longer there lists nothing: that card was started, and removed',
  );
});

test('`nemia inbox` prints a line per entry: the name, the first line of the body, workflow and repo when set, and started as — or why it is not a card', () => {
  const listing = inboxListing(
    [
      {
        file: 'parse-the-flag-1x2y.md',
        text: '---\nworkflow: dev\nrepo: /home/me/code/app\n---\nParse the flag option in cli.ts, and every option after it on the same line.\n',
      },
      { file: 'cache-a1.md', text: 'Cache the views.\n' },
      { file: 'notes.txt', text: '' },
    ],
    [{ id: 'cache-the-views-ab12', from: { inbox: 'cache-a1' } }],
    isDirectory,
  );
  assert.deepEqual(inboxLines(listing), [
    'cache-a1             Cache the views.  started as cache-the-views-ab12',
    'notes.txt            notes.txt: not a card. The inbox holds one markdown file per card, <name>.md — move it out, or, for a card, name it <name>.md.',
    'parse-the-flag-1x2y  Parse the flag option in cli.ts, and every option after  workflow: dev  repo: /home/me/code/app',
  ]);
  assert.deepEqual(inboxLines([]), []);
});

test('`noCardLine` says the inbox has no card of that name, and which it has — the name without its .md when that is one', () => {
  assert.equal(
    noCardLine('cache-the-views', ['parse-the-flag-1x2y', 'cache-the-views-k2q9']),
    'no card cache-the-views in the inbox. Its cards are: cache-the-views-k2q9, parse-the-flag-1x2y.',
  );
  assert.equal(
    noCardLine('cache-the-views-k2q9.md', ['cache-the-views-k2q9']),
    'no card cache-the-views-k2q9.md in the inbox. A card is named without its .md: `cache-the-views-k2q9`. Its cards are: cache-the-views-k2q9.',
  );
  assert.equal(noCardLine('anything', []), 'no card anything in the inbox. The inbox is empty.');
});

test('REFUSED by name at shipped defaults: a name that would leave the inbox — a slash, `..`, `.` — a hidden file, and no name at all', () => {
  assert.equal(inboxNameRefusal('cache-the-views-k2q9'), undefined);
  assert.equal(inboxNameRefusal('a..b'), undefined, 'two dots inside a name stay in the folder');
  for (const name of ['../runs/r-1', '..', '.', 'drafts/idea', '/etc/passwd', 'a\\b', 'a\0b']) {
    assert.match(
      inboxNameRefusal(name) ?? '',
      /^`.*` is not a card's name: a name stays in the inbox, with no slash and not \. or \.\., since it names a file there\./s,
      name,
    );
  }
  assert.match(
    inboxNameRefusal('.cache-the-views-k2q9') ?? '',
    /^`\.cache-the-views-k2q9` is not a card's name: a name that starts with a dot is a hidden file, and nemia inbox lists none\./,
  );
  assert.match(
    inboxNameRefusal('') ?? '',
    /^A card is named by its file in the inbox, minus \.md, as nemia inbox lists it, and this name is empty\./,
  );
  assert.match(inboxNameRefusal('  ') ?? '', /this name is empty/);
});

test("`ideaCard`: a note is the body; a file whose frontmatter is an inbox card's gives its keys; any other text is the body whole — and `--workflow`, `--repo` are written over the text's own", () => {
  assert.deepEqual(ideaCard('the idea', 'Cache the views.\n\nBetween passes.  \n', {}, isDirectory), {
    text: 'Cache the views.\n\nBetween passes.\n',
    body: 'Cache the views.\n\nBetween passes.',
  });
  assert.deepEqual(ideaCard('the idea', 'Cache the views.', { workflow: 'dev', repo: '/home/me/code/app' }, isDirectory), {
    text: '---\nworkflow: dev\nrepo: /home/me/code/app\n---\nCache the views.\n',
    body: 'Cache the views.',
  });
  assert.deepEqual(
    ideaCard(
      './idea.md',
      '---\n# mine\nworkflow: ui\nrepo: /home/me/code/app\n---\nCache the views.\n',
      { repo: '/home/me/code/other' },
      isDirectory,
    ),
    { text: '---\nworkflow: ui\nrepo: /home/me/code/other\n---\nCache the views.\n', body: 'Cache the views.' },
  );
  assert.equal(
    ideaCard('./idea.md', '---\nrepo: code/app\n---\nx\n', { repo: '/home/me/code/app' }, isDirectory).text,
    '---\nrepo: /home/me/code/app\n---\nx\n',
    'what is written over is not asked to hold',
  );
  assert.deepEqual(ideaCard('./idea.md', '﻿Cache the views.\r\nBetween passes.\r\n', {}, isDirectory), {
    text: 'Cache the views.\nBetween passes.\n',
    body: 'Cache the views.\nBetween passes.',
  });
  const brief = '---\ntitle: the flag\nworkflow: dev\n---\nParse it.';
  const kept = ideaCard('./brief.md', `${brief}\n`, {}, isDirectory);
  assert.deepEqual(
    kept,
    { text: `---\n# the idea below opens with a rule of its own\n---\n${brief}\n`, body: brief },
    "not a card's frontmatter, so the text is the body whole, kept from being read as frontmatter by a comment before it",
  );
  assert.equal(
    parseInboxCard('brief-ab12.md', kept.text, isDirectory).body,
    brief,
    'the card it writes reads back as the text it was given',
  );
  assert.equal(ideaCard('./brief.md', brief, { workflow: 'dev' }, isDirectory).text, `---\nworkflow: dev\n---\n${brief}\n`);
  assert.equal(
    ideaCard('the idea', '---\nA note that opens with a rule.\n', {}, isDirectory).body,
    '---\nA note that opens with a rule.',
    'a rule that never closes is the body',
  );
});

test("`ideaCard` writes a file's own `workflow:` that is a path absolute against the file's folder — as a plan card's is read from its plan folder — and leaves a name a name, an absolute path as it is, and a flag's over it", () => {
  const plans = '/home/me/code/app/plans';
  const filed = (workflow: string, given: { workflow?: string } = {}, dir: string | null = plans) =>
    parseInboxCard(
      'x-ab12.md',
      ideaCard('./plans/idea.md', `---\nworkflow: ${workflow}\n---\nCache the views.\n`, given, isDirectory, dir ?? undefined).text,
      isDirectory,
    ).workflow;
  assert.equal(filed('../workflows/dev'), '/home/me/code/app/workflows/dev', "not the store's workflows/dev, read from the inbox");
  assert.equal(filed('./flows/ui'), '/home/me/code/app/plans/flows/ui');
  assert.equal(filed('..'), '/home/me/code/app');
  assert.equal(filed('dev'), 'dev', "a name is the repository's, found at start");
  assert.equal(filed('/srv/workflows/dev'), '/srv/workflows/dev');
  assert.equal(filed('../workflows/dev', { workflow: '/home/me/mine' }), '/home/me/mine', 'the flag over it, as the CLI resolved it');
  assert.equal(filed('../workflows/dev', {}, null), '../workflows/dev', 'with no folder given, as written');
  assert.deepEqual(
    ['dev', '../workflows/dev', 'flows/ui', '.', '/abs/dev'].map((w) => workflowAt(w, '/home/me/code/app/plans')),
    ['dev', '/home/me/code/app/workflows/dev', '/home/me/code/app/plans/flows/ui', '/home/me/code/app/plans', '/abs/dev'],
  );
});

test('REFUSED by name at shipped defaults: `nemia inbox add` with nothing in the idea, a file whose card has `after:` or a key it does not have, a workflow or repo given empty or on two lines, and a repo that is not an absolute directory', () => {
  for (const text of ['', '   ', '\n\n']) {
    assert.throws(
      () => ideaCard('the idea', text, {}, isDirectory),
      refusedWith(
        /^nemia inbox add takes the idea, and the idea has nothing in it\. Give it as text — nemia inbox add "<idea>" — or as a file: nemia inbox add \.\/idea\.md\. Nothing was filed\.$/,
      ),
    );
  }
  assert.throws(
    () => ideaCard('./empty.md', '---\nworkflow: dev\n---\n', {}, isDirectory),
    refusedWith(/^\.\/empty\.md: the body is empty\./),
  );
  assert.throws(
    () => ideaCard('./ideas/d.md', '---\nworkflow: dev\nafter: b, c\n---\nShow the flag.\n', {}, isDirectory),
    refusedWith(
      /^\.\/ideas\/d\.md: `after` is not a key an inbox card has: what a card waits on is said when it is started, once the runs it could wait on are known\. Delete the line and file the idea, then give the wait when you start the card nemia inbox add names: nemia start <inbox>\/<name>\.md --after <runId>\.$/,
    ),
    "not a card yet, so the refusal names no card's path: file the idea, then give the wait at start",
  );
  assert.throws(
    () => ideaCard('./d.md', '---\nworkflow: dev\nrepo: /home/me/code/app\nrepo: /home/me/code/app\n---\nx\n', {}, isDirectory),
    refusedWith(/^\.\/d\.md: `repo` is set twice/),
  );
  assert.throws(() => ideaCard('the idea', 'x', { workflow: '' }, isDirectory), refusedWith(/^the idea: `workflow` has no value\./));
  assert.throws(() => ideaCard('the idea', 'x', { repo: ' ' }, isDirectory), refusedWith(/^the idea: `repo` has no value\./));
  assert.throws(
    () => ideaCard('the idea', 'x', { repo: 'code/app' }, isDirectory),
    refusedWith(/^the idea: `repo: code\/app` is not an absolute path\./),
  );
  assert.throws(
    () => ideaCard('the idea', 'x', { repo: '/home/me/code/gone' }, isDirectory),
    refusedWith(/^the idea: `repo: \/home\/me\/code\/gone` names no directory\./),
  );
  assert.throws(
    () => ideaCard('the idea', 'x', { workflow: 'dev\nharness: codex' }, isDirectory),
    refusedWith(
      /^the idea: the workflow given, "dev\\nharness: codex", is more than one line, and a card's workflow: is one\. Give the one line it names\.$/,
    ),
  );
  assert.throws(
    () => ideaCard('the idea', 'x', { repo: '/home/me/code/app\r\n---' }, isDirectory),
    refusedWith(/^the idea: the repo given, .* is more than one line/),
  );
});

test('`inboxNameOf`: every path under the inbox names a card — `<inbox>/<name>.md`, and `<inbox>/<name>` as `nemia inbox` lists it — for the start to refuse by name when it is not one; a path outside the inbox, and the inbox itself, names none', () => {
  const inbox = '/home/me/.agent-workflows/inbox';
  assert.equal(inboxNameOf(`${inbox}/cache-the-views-k2q9.md`, inbox), 'cache-the-views-k2q9');
  assert.equal(
    inboxNameOf(`${inbox}/cache-the-views-k2q9`, inbox),
    'cache-the-views-k2q9',
    'the name nemia inbox lists, typed after the folder',
  );
  assert.equal(inboxNameOf(`${inbox}/gone-a1b2.md`, inbox), 'gone-a1b2', "whether it is there is the start's to say");
  assert.equal(inboxNameOf(`${inbox}/notes.txt`, inbox), 'notes.txt', 'and whether it is a card');
  assert.equal(inboxNameOf(`${inbox}/drafts/idea.md`, inbox), 'drafts/idea', 'and whether it is a name');
  assert.equal(inboxNameOf(`${inbox}/.md`, inbox), '');
  assert.equal(inboxNameOf(`${inbox}/..hidden.md`, inbox), '..hidden');
  for (const at of [
    inbox,
    `${inbox}/`,
    '/home/me/plans/q3/a.md',
    '/home/me/.agent-workflows/inbox-old/idea.md',
    '/home/me/.agent-workflows/idea.md',
    `${inbox}/../runs/r-1.json`,
    '/',
  ]) {
    assert.equal(inboxNameOf(at, inbox), null, at);
  }
});

test('a card with no workflow is refused naming the workflows the repository has, and how to name one — or that it has none; a card a record names as started, naming the run and how to drop it; `nemia decide` names the card a run came from', () => {
  const card = { name: 'cache-the-views-k2q9', file: 'cache-the-views-k2q9.md' };
  const where = '/home/me/.agent-workflows/inbox/cache-the-views-k2q9.md';
  assert.equal(
    noWorkflowRefusal(card, where, '/home/me/code/app', ['dev', 'ui']),
    "cache-the-views-k2q9.md: no workflow — the card names none, and none was given, so nothing says what runs it. The repository's workflows are: dev, ui, in /home/me/code/app/workflows. Name one: nemia start /home/me/.agent-workflows/inbox/cache-the-views-k2q9.md --workflows dev, or write `workflow: dev` in the card.",
  );
  assert.equal(
    noWorkflowRefusal(card, where, '/home/me/code/app', []),
    'cache-the-views-k2q9.md: no workflow — the card names none, and none was given, so nothing says what runs it. /home/me/code/app/workflows has no workflows. Give a workflow folder: nemia start /home/me/.agent-workflows/inbox/cache-the-views-k2q9.md --workflows <dir>, or write `workflow:` in the card.',
  );
  assert.equal(
    startedRefusal(card, where, ['cache-the-views-ab12']),
    `cache-the-views-k2q9.md: this card was started as cache-the-views-ab12 — that run's record says so — and is still in the inbox because its removal failed. Drop it with nemia inbox rm cache-the-views-k2q9; to run the idea again, park it again under a name of its own first: nemia inbox add ${where}.`,
  );
  assert.match(
    startedRefusal(card, where, ['a-1', 'b-2']),
    /^cache-the-views-k2q9\.md: this card was started as a-1, b-2 — their records say so — /,
  );
  assert.equal(fromNote({ from: { inbox: 'cache-the-views-k2q9' } }), 'from inbox card cache-the-views-k2q9');
  assert.equal(fromNote({}), undefined);
});

test('a queued card is a card with `queued:`, the ISO time it was queued — REFUSED by name at shipped defaults: a `queued:` that is not a time, one on a card with no `workflow:`, and a `queued:` carried into `nemia inbox add` by a file', () => {
  assert.deepEqual(read('---\nworkflow: dev\nqueued: 2026-09-16T10:00:00.000Z\n---\nCache the views.\n'), {
    name: 'cache-the-views-k2q9',
    file: 'cache-the-views-k2q9.md',
    workflow: 'dev',
    queued: '2026-09-16T10:00:00.000Z',
    body: 'Cache the views.',
  });
  assert.equal(read('---\nworkflow: dev\nqueued: 2026-09-16T10:00:00Z\n---\nx\n').queued, '2026-09-16T10:00:00Z', 'to the second');
  for (const bad of ['tomorrow', '2026-09-16', '2026-09-16 10:00:00', '2026-09-16T10:00:00+02:00', '2026-13-40T10:00:00.000Z', '1']) {
    assert.throws(
      () => read(`---\nworkflow: dev\nqueued: ${bad}\n---\nx\n`),
      refusedWith(
        new RegExp(
          `^cache-the-views-k2q9\\.md: \`queued: ${bad.replace(/[.+]/g, '\\$&')}\` is not a time\\. \`queued:\` is when the card was queued to start on its own, as nemia inbox queue writes it — \`queued: 2026-09-16T10:00:00\\.000Z\` — which orders the queue\\. Delete the line, and queue the card with nemia inbox queue cache-the-views-k2q9\\.$`,
        ),
      ),
      bad,
    );
  }
  assert.throws(
    () => read('---\nrepo: /home/me/code/app\nqueued: 2026-09-16T10:00:00.000Z\n---\nx\n'),
    refusedWith(
      /^cache-the-views-k2q9\.md: `queued:` with no `workflow:` — a card that starts on its own has nothing to say what runs it\. Write `workflow:`, or delete the `queued:` line and queue the card with its workflow: nemia inbox queue cache-the-views-k2q9 --workflow <w> writes both\.$/,
    ),
  );
  assert.throws(
    () => read('---\nworkflow: dev\nqueued: 2026-09-16T10:00:00.000Z\nqueued: 2026-09-16T11:00:00.000Z\n---\nx\n'),
    refusedWith(/`queued` is set twice/),
  );
  assert.throws(
    () => ideaCard('./idea.md', '---\nworkflow: dev\nqueued: 2026-09-16T10:00:00.000Z\n---\nCache the views.\n', {}, isDirectory),
    refusedWith(
      /^\.\/idea\.md: `queued` is not a key a filed idea keeps: a card is queued once it is in the inbox, at the time it is queued\. Delete the line and file the idea, then queue the card nemia inbox add names: nemia inbox queue <name>\.$/,
    ),
  );
});

test('`queuedText` writes `queued:` on a card, or takes it off, with `--workflow` over its own and its repo kept — and `queueRefusal` REFUSES by name a card a run was started from, one already queued, and one with no workflow and none given', () => {
  const card = read('---\nrepo: /home/me/code/app\n---\nCache the views.\n');
  assert.equal(
    queuedText(card, '2026-09-16T10:00:00.000Z', isDirectory, 'dev'),
    '---\nworkflow: dev\nrepo: /home/me/code/app\nqueued: 2026-09-16T10:00:00.000Z\n---\nCache the views.\n',
  );
  const queued = read('---\n# mine\nworkflow: dev\nqueued: 2026-09-16T10:00:00.000Z\n---\nCache the views.\n');
  assert.equal(queuedText(queued, null, isDirectory), '---\nworkflow: dev\n---\nCache the views.\n', 'taken off, its comment with it');
  const ruled = read('---\n# no keys\n---\n---\ntitle: a rule of its own\n---\nx\n');
  assert.equal(
    parseInboxCard(
      'x-ab12.md',
      queuedText({ ...ruled, workflow: 'dev', queued: '2026-09-16T10:00:00.000Z' }, null, isDirectory, undefined),
      isDirectory,
    ).body,
    ruled.body,
    'a body that opens with a rule still reads as the body',
  );
  assert.throws(
    () => queuedText(card, '2026-09-16T10:00:00.000Z', isDirectory),
    refusedWith(/`queued:` with no `workflow:`/),
    'the text it gives reads back as a card, or is refused as one',
  );

  const where = '/home/me/.agent-workflows/inbox/cache-the-views-k2q9.md';
  assert.equal(queueRefusal(card, where, [], null, 'dev'), undefined);
  assert.equal(queueRefusal(read('---\nworkflow: dev\n---\nx\n'), where, [], null), undefined);
  assert.equal(
    queueRefusal(card, where, [], null),
    'cache-the-views-k2q9.md: no workflow — a queued card starts on its own, and nothing says what runs it. Queue it with its workflow: nemia inbox queue cache-the-views-k2q9 --workflow <w> writes both.',
  );
  assert.equal(
    queueRefusal(queued, where, [], 2),
    "cache-the-views-k2q9.md: already queued, at 2026-09-16T10:00:00.000Z, 2 in the queue's order: the tick starts it when its turn comes and a run slot is free. To queue it again, take it back first: nemia inbox queue cache-the-views-k2q9 --off.",
  );
  assert.match(
    queueRefusal(card, where, ['cache-the-views-ab12'], null, 'dev') ?? '',
    /^cache-the-views-k2q9\.md: this card was started as cache-the-views-ab12 — that run's record says so — and is still in the inbox because its removal failed\./,
  );
});

test("`inboxListing` gives each queued card its place in the order — by when it was queued, then by name, a card a run was started from out of it — and the tick's last try only while the card reads as it did; `nextQueued` passes over a card refused on the repository it would be tried on, never one that failed otherwise; `nemia inbox` says it all", () => {
  const card = (workflow: string, queued?: string, title = 'x') =>
    `---\nworkflow: ${workflow}\n${queued ? `queued: ${queued}\n` : ''}---\n${title}\n`;
  const files = [
    { file: 'b-late.md', text: card('dev', '2026-09-16T10:05:00.000Z', 'Late') },
    { file: 'a-tied.md', text: card('dev', '2026-09-16T10:01:00.000Z', 'Tied, and first by name') },
    { file: 'c-tied.md', text: card('dev', '2026-09-16T10:01:00.000Z', 'Tied') },
    { file: 'd-first.md', text: card('nope', '2026-09-16T09:00:00.000Z', 'First, and refused') },
    { file: 'e-started.md', text: card('dev', '2026-09-16T08:00:00.000Z', 'Started by hand') },
    { file: 'f-parked.md', text: card('dev', undefined, 'Parked') },
  ];
  const app = '/home/me/code/app';
  const noGit = 'Command failed: git rev-parse HEAD / fatal: not a git repository (or any of the parent directories): .git';
  const tries = new Map([
    [
      'd-first',
      {
        at: '2026-09-16T10:06:00.000Z',
        text: files[3].text,
        repo: app,
        why: 'd-first.md: `workflow: nope` — no workflow folder.',
        refused: true,
      },
    ],
    [
      'b-late',
      { at: '2026-09-16T10:06:00.000Z', text: 'the card as it was before an edit', repo: app, why: 'refused once', refused: true },
    ],
    ['a-tied', { at: '2026-09-16T10:07:00.000Z', text: files[1].text, repo: app, why: noGit, refused: false }],
  ]);
  const listing = inboxListing(files, [{ id: 'started-by-hand-ab12', from: { inbox: 'e-started' } }], isDirectory, tries);
  assert.deepEqual(
    listing.map((l) => [l.name, l.queued, l.tried]),
    [
      ['a-tied', { at: '2026-09-16T10:01:00.000Z', place: 2 }, { at: '2026-09-16T10:07:00.000Z', repo: app, why: noGit, refused: false }],
      ['b-late', { at: '2026-09-16T10:05:00.000Z', place: 4 }, undefined],
      ['c-tied', { at: '2026-09-16T10:01:00.000Z', place: 3 }, undefined],
      [
        'd-first',
        { at: '2026-09-16T09:00:00.000Z', place: 1 },
        { at: '2026-09-16T10:06:00.000Z', repo: app, why: 'd-first.md: `workflow: nope` — no workflow folder.', refused: true },
      ],
      ['e-started', { at: '2026-09-16T08:00:00.000Z', place: null }, undefined],
      ['f-parked', undefined, undefined],
    ],
  );
  assert.equal(
    Object.hasOwn(
      listing.find((l) => l.name === 'f-parked')!,
      'queued',
    ),
    false,
    'a card not queued has no key of it',
  );
  assert.deepEqual(
    queueOrder(listing).map((l) => l.name),
    ['d-first', 'a-tied', 'c-tied', 'b-late'],
  );
  assert.equal(
    nextQueued(listing, app)?.name,
    'a-tied',
    'the refused card passed over, and the one after it next — which failed, and is tried again',
  );
  assert.equal(
    nextQueued(listing, '/home/me/code/other')?.name,
    'd-first',
    'a card that names no repository, refused on another, is tried on this one',
  );
  assert.equal(nextQueued(inboxListing(files.slice(5), [], isDirectory), app), undefined, 'nothing queued');

  assert.deepEqual(inboxLines(listing, true), [
    `a-tied     Tied, and first by name  workflow: dev  queued 2 of 4 — failed at 2026-09-16T10:07:00.000Z on ${app}: ${noGit} — not a refusal: the tick tries it again on every pass, where it keeps its place`,
    'b-late     Late  workflow: dev  queued 4 of 4',
    'c-tied     Tied  workflow: dev  queued 3 of 4',
    `d-first    First, and refused  workflow: nope  queued 1 of 4 — not started at 2026-09-16T10:06:00.000Z on ${app}: d-first.md: \`workflow: nope\` — no workflow folder. Edit the card, or take it back and queue it again, or run nemia up in the repository it is about, and the tick tries it again`,
    'e-started  Started by hand  workflow: dev  started as started-by-hand-ab12',
    'f-parked   Parked  workflow: dev',
  ]);
  assert.equal(
    inboxLines(listing).find((line) => line.startsWith('d-first')),
    `d-first    First, and refused  workflow: nope  queued 1 of 4 — not started at 2026-09-16T10:06:00.000Z: d-first.md: \`workflow: nope\` — no workflow folder. Edit the card, or take it back and queue it again, and the tick tries it again`,
    'as shipped, a card that names no factory is told of no repository to run a daemon in',
  );
  const named = inboxListing(
    [{ file: 'g-named.md', text: `---\nworkflow: nope\nrepo: ${app}\nqueued: 2026-09-16T09:00:00.000Z\n---\nNamed\n` }],
    [],
    isDirectory,
    new Map([
      [
        'g-named',
        {
          at: '2026-09-16T10:06:00.000Z',
          text: `---\nworkflow: nope\nrepo: ${app}\nqueued: 2026-09-16T09:00:00.000Z\n---\nNamed\n`,
          repo: app,
          why: 'g-named.md: no workflow folder.',
          refused: true,
        },
      ],
    ]),
  );
  assert.equal(nextQueued(named, '/home/me/code/other'), undefined, 'refused on the repository it names, wherever the daemon runs');
  assert.equal(
    inboxLines(named)[0],
    `g-named  Named  workflow: nope  repo: ${app}  queued 1 of 1 — not started at 2026-09-16T10:06:00.000Z: g-named.md: no workflow folder. Edit the card, or take it back and queue it again, and the tick tries it again`,
    'a card that names its repository is not told of another',
  );
});

test("a queued card of a factory is tried on the factory's one repository, and its refusal there is remembered: `nextQueued` passes over it from a daemon anywhere — `queueRepo` says the daemon's repository only when neither the card nor its factory names one", () => {
  const text = '---\nworkflow: build\nqueued: 2026-09-16T09:00:00.000Z\nfactory: solo\n---\nSolo\n';
  const refused = { at: '2026-09-16T10:06:00.000Z', text, repo: '/repos/solo', why: 'build: not offered.', refused: true };
  const listing = inboxListing([{ file: 'solo-a1b2.md', text }], [], isDirectory, new Map([['solo-a1b2', refused]]));
  const factories = new Map([
    ['solo', { repos: ['/repos/solo'] }],
    ['duo', { repos: ['/repos/a', '/repos/b'] }],
  ]);
  assert.equal(nextQueued(listing, '/elsewhere', factories), undefined, "refused on its factory's repository: passed over");
  assert.equal(
    nextQueued(listing, '/elsewhere')?.name,
    'solo-a1b2',
    'with no factory read, it would be tried on the daemon, where it was not refused',
  );

  const card = (repo: string | null, factory: string | null) => ({ repo, factory });
  assert.deepEqual(queueRepo(card(null, 'solo'), '/daemon', factories), { repo: '/repos/solo', fromDaemon: false });
  assert.deepEqual(queueRepo(card('/repos/mine', 'solo'), '/daemon', factories), { repo: '/repos/mine', fromDaemon: false });
  assert.deepEqual(queueRepo(card(null, 'duo'), '/daemon', factories), { repo: '/daemon', fromDaemon: true });
  assert.deepEqual(
    queueRepo(card(null, 'gone'), '/daemon', factories),
    { repo: '/daemon', fromDaemon: true },
    'a factory that does not read',
  );
  assert.deepEqual(queueRepo(card(null, null), '/daemon', factories), { repo: '/daemon', fromDaemon: true });
  assert.deepEqual(queueRepo(card('/repos/mine', null), '/daemon', factories), { repo: '/repos/mine', fromDaemon: false });
});

test('`queueLine`: what `nemia up` logs of the queue — `started <card> as <runId>`, a removal that failed with what then, a start refused with how to have it tried again, and one that failed otherwise, tried again', () => {
  assert.equal(
    queueLine({ card: 'cache-the-views-k2q9', run: 'cache-the-views-between-pass-ab12', removed: true }),
    'started cache-the-views-k2q9 as cache-the-views-between-pass-ab12',
  );
  assert.equal(
    queueLine({
      card: 'cache-the-views-k2q9',
      run: 'cache-ab12',
      removed: false,
      why: '/inbox/cache-the-views-k2q9.md could not be removed — EACCES',
    }),
    'started cache-the-views-k2q9 as cache-ab12 — still in the inbox: /inbox/cache-the-views-k2q9.md could not be removed — EACCES. nemia inbox lists it as started as cache-ab12, and it is not started again: drop it with nemia inbox rm cache-the-views-k2q9',
  );
  assert.equal(
    queueLine({ card: 'cache-the-views-k2q9', refused: 'cache-the-views-k2q9.md: `workflow: nope` — no workflow folder.' }),
    'cache-the-views-k2q9 not started: cache-the-views-k2q9.md: `workflow: nope` — no workflow folder. — left queued as it is, and not tried again while it reads the same: edit the card, or take it back and queue it again (nemia inbox queue cache-the-views-k2q9 --off, then nemia inbox queue cache-the-views-k2q9)',
  );
  assert.equal(
    queueLine({ card: 'cache-the-views-k2q9', refused: 'cache-the-views-k2q9.md: no workflow folder.', on: '/home/me/code/app' }),
    'cache-the-views-k2q9 not started on /home/me/code/app: cache-the-views-k2q9.md: no workflow folder. — left queued as it is, and not tried again while it reads the same: edit the card, or take it back and queue it again (nemia inbox queue cache-the-views-k2q9 --off, then nemia inbox queue cache-the-views-k2q9), or run nemia up in the repository it is about',
  );
  assert.equal(
    queueLine({ card: 'cache-the-views-k2q9', failed: 'Command failed: git rev-parse HEAD / fatal: not a git repository', again: false }),
    'cache-the-views-k2q9 not started: Command failed: git rev-parse HEAD / fatal: not a git repository — not a refusal: tried again on the next pass, where it keeps its place, and said again only if it fails otherwise',
  );
});

test('a queued card whose `repo:` names no directory any more keeps its place in the queue, beside why it does not read — so the tick tries it and the start refuses it by name — while a card that does not read for another reason is in no queue', () => {
  const gone = '---\nworkflow: dev\nrepo: /home/me/code/gone\nqueued: 2026-09-16T09:00:00.000Z\n---\nIts repository is gone\n';
  const files = [
    { file: 'gone-a1b2.md', text: gone },
    { file: 'behind-c3d4.md', text: '---\nworkflow: dev\nrepo: /home/me/code/app\nqueued: 2026-09-16T09:05:00.000Z\n---\nBehind it\n' },
    { file: 'broken-e5f6.md', text: '---\nworkflow: dev\nharness: codex\nqueued: 2026-09-16T08:00:00.000Z\n---\nA key it does not have\n' },
  ];
  const why =
    'gone-a1b2.md: `repo: /home/me/code/gone` names no directory. Correct it to the repository the idea is about, or delete the line, and the card is started on the repository its start names.';
  const listing = inboxListing(files, [], isDirectory);
  assert.deepEqual(
    listing.map((l) => [l.name, l.error?.slice(0, 40) ?? null, l.repo, l.queued]),
    [
      ['behind-c3d4', null, '/home/me/code/app', { at: '2026-09-16T09:05:00.000Z', place: 2 }],
      ['broken-e5f6', 'broken-e5f6.md: `harness` is not a key a', null, undefined],
      ['gone-a1b2', why.slice(0, 40), '/home/me/code/gone', { at: '2026-09-16T09:00:00.000Z', place: 1 }],
    ],
  );
  assert.equal(nextQueued(listing, '/home/me/code/app')?.name, 'gone-a1b2', 'the tick tries it, and the start says why');

  const refused = inboxListing(
    files,
    [],
    isDirectory,
    new Map([['gone-a1b2', { at: '2026-09-16T10:00:00.000Z', text: gone, repo: '/home/me/code/gone', why, refused: true }]]),
  );
  assert.equal(nextQueued(refused, '/home/me/code/app')?.name, 'behind-c3d4', 'once refused as it stands, passed over');
  assert.equal(
    inboxLines(refused).at(-1),
    `gone-a1b2    ${why}  queued 1 of 2 — not started at 2026-09-16T10:00:00.000Z Edit the card, or take it back and queue it again, and the tick tries it again`,
    'nemia inbox says so beside why it does not read, without saying that twice',
  );
});

test("REFUSED: a card that names no factory, naming its file, the line to write with the factories, the start's fix only when it has one, and how a new card names one", () => {
  assert.equal(
    unfactoredCardRefusal('/s/inbox/a.md', ['pipao', 'abc'], '--factory <name>'),
    '/s/inbox/a.md: this card names no factory, and a card is started only in the factory named for it, never one taken from its folder or its repo:, which can be two factories\'. Write `factory: <name>` in its frontmatter — one of abc, pipao, or name it at start: --factory <name>; a new card names it as it is filed: nemia inbox add "<idea>" --factory <name>. Nothing was started.',
  );
  const queued = unfactoredCardRefusal('/s/inbox/a.md', []);
  assert.match(queued, /— once one is filed: nemia factory add <name> --repo <root>; a new card/);
  assert.equal(queued.includes('at start'), false, 'the queue has no start words of its own');
});

test("`from:` names the runs a card's run is handed as context, in the order written, listed and written back — REFUSED by name: a blank run and one named twice; `after:` is still refused", () => {
  const card = read('---\nworkflow: build\nfrom: a-1x2y,  b-3z4w\n---\nCache the views.\n');
  assert.deepEqual(card.from, ['a-1x2y', 'b-3z4w']);
  assert.equal(Object.hasOwn(read('---\nworkflow: dev\n---\nx\n'), 'from'), false, 'none unless it says so');
  const [listed] = inboxListing([{ file: card.file, text: '---\nfrom: a-1x2y\n---\nx\n' }], [], isDirectory);
  assert.deepEqual(listed.from, ['a-1x2y']);

  const set = fromText(card, ['c-5v6u'], isDirectory);
  assert.equal(set, '---\nworkflow: build\nfrom: c-5v6u\n---\nCache the views.\n');
  assert.equal(fromText(card, [], isDirectory), '---\nworkflow: build\n---\nCache the views.\n', 'taken back: the line goes');

  assert.throws(() => read('---\nfrom: a-1x2y, \n---\nx\n'), refusedWith(/`from:` names runs by id, comma-separated/));
  assert.throws(() => read('---\nfrom: a-1x2y, a-1x2y\n---\nx\n'), refusedWith(/names a-1x2y twice/));
  assert.throws(() => read('---\nafter: a-1x2y\n---\nx\n'), refusedWith(/`after` is not a key an inbox card has/));
});

test('REFUSED: `queueFactoryRefusal` refuses a card that names no factory, naming those on file or how one is filed, and one that names default whatever is allowed — a card of a factory passes, and one of none where unfactored starts are allowed', () => {
  const file = '/s/inbox/a.md';
  const loose = { name: 'a', factory: undefined };
  assert.equal(
    queueFactoryRefusal(loose, file, ['pipao', 'abc'], false),
    '/s/inbox/a.md: this card names no factory, and a queued card is started on its own only in the factory named for it. Write `factory: <name>` in its frontmatter — one of abc, pipao, then queue it again: nemia inbox queue a. Nothing was queued.',
  );
  assert.match(
    queueFactoryRefusal(loose, file, [], false) ?? '',
    / — once one is filed: nemia factory add <name> --repo <root>, then queue it again: nemia inbox queue a\. Nothing was queued\.$/,
  );
  for (const allowed of [false, true]) {
    const history = queueFactoryRefusal({ name: 'a', factory: 'default' }, file, ['pipao'], allowed) ?? '';
    assert.match(history, /^`default` is the default factory: .* Name a factory — `factory: <name>` in \/s\/inbox\/a\.md, one of pipao\. /);
    assert.match(history, / Nothing was queued\.$/);
    assert.doesNotMatch(history, /Nothing was started/);
    assert.equal(queueFactoryRefusal({ name: 'a', factory: 'pipao' }, file, ['pipao'], allowed), null);
  }
  assert.equal(queueFactoryRefusal(loose, file, ['pipao'], true), null);
});
