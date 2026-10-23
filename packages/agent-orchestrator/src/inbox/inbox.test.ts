/**
 * An inbox is cards before they are started: the card, and what `nemia inbox` makes of the folder and the run records — pure, as data.
 * What each refuses is a table at the end, one per function (`parseInboxCard`, `ideaCard`, `inboxNameRefusal`, `queueRefusal`,
 * `queueFactoryRefusal`), each row refused as `Invalid`, exit 2, or said, naming its facts. The inbox on disk is `inbox.store.test.ts`,
 * and the queue the tick drains `test/queue-store.test.ts`.
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
import { names } from '../../test/assessed.ts';

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

/**
 * Refused by name: exit 2, and every one of `patterns` in the message — never `String(err)`, which starts with `Error: ` — each a fact
 * the refusal carries (the file, the key at fault, the fix it names), never its sentence.
 */
const refusedWith =
  (...patterns: RegExp[]) =>
  (err: Error & { exitCode?: number }) =>
    err.exitCode === 2 && patterns.every((pattern) => pattern.test(err.message));

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

test("`gate:` names the step a card's run waits at for a person, carried by the card, its listing, its line, a queue and a filing", () => {
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
});

test('`factory:` names the factory that processes a card, carried by the card, its listing, its line, a queue and a filing, written last', () => {
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
  const said = new Map(listing.map((l) => [l.name, l.error]));
  assert.deepEqual(
    listing.map((l) => ({ ...l, error: l.error === null ? null : 'refused' })),
    [
      {
        name: 'broken-a1b2',
        file: 'broken-a1b2.md',
        title: null,
        workflow: null,
        repo: null,
        factory: null,
        startedAs: ['broken-gh78'],
        from: [],
        factoryRepo: null,
        error: 'refused',
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
        factoryRepo: null,
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
        factoryRepo: null,
        error: 'refused',
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
        factoryRepo: null,
        error: 'refused',
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
        factoryRepo: null,
        error: null,
      },
    ] satisfies InboxListing[],
  );
  const broken = said.get('broken-a1b2')!;
  assert.match(broken, /^broken-a1b2\.md: `after` is not a key/);
  assert.match(broken, /nemia start <inbox>\/broken-a1b2\.md --after <runId>/);
  assert.match(broken, /Delete the line\.$/);
  for (const name of ['drafts/', 'notes.txt']) {
    const error = said.get(name)!;
    assert.ok(error.startsWith(`${name}: not a card.`), error);
    assert.ok(error.includes('name it <name>.md'), error);
  }
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

test('`ideaCard` reads a YAML card — quoted values, `from:` as a list — and writes it back as YAML, quoting a value that needs it', () => {
  const yaml = '---\nworkflow: "dev"\nrepo: /home/me/code/app\nfrom:\n  - a-1x2y\n  - b-3z4w\n---\nCache the views.\n';
  const filed = ideaCard('./idea.md', yaml, {}, isDirectory);
  assert.equal(
    filed.text,
    '---\nworkflow: dev\nrepo: /home/me/code/app\nfrom: a-1x2y, b-3z4w\n---\nCache the views.\n',
    'a card, its keys read as YAML and written in the line form wherever it reads back the same',
  );
  const odd = ideaCard('the idea', 'Cache the views.', { workflow: 'dev #2: the views' }, isDirectory);
  assert.equal(read(odd.text).workflow, 'dev #2: the views', 'a value YAML would read otherwise is quoted, and reads back');
  assert.equal(read(fromText(read(odd.text), ['a-1x2y'], isDirectory)).workflow, 'dev #2: the views', 'and written again the same');
  assert.equal(
    ideaCard('./brief.md', '---\nIn short: cache the views\n---\nBetween passes.\n', {}, isDirectory).body,
    '---\nIn short: cache the views\n---\nBetween passes.',
    "a block whose key is no card's is the body whole",
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

test('a queued card is a card with `queued:`, the ISO time it was queued, to the millisecond or the second', () => {
  assert.deepEqual(read('---\nworkflow: dev\nqueued: 2026-09-16T10:00:00.000Z\n---\nCache the views.\n'), {
    name: 'cache-the-views-k2q9',
    file: 'cache-the-views-k2q9.md',
    workflow: 'dev',
    queued: '2026-09-16T10:00:00.000Z',
    body: 'Cache the views.',
  });
  assert.equal(read('---\nworkflow: dev\nqueued: 2026-09-16T10:00:00Z\n---\nx\n').queued, '2026-09-16T10:00:00Z', 'to the second');
});

test('`queuedText` writes `queued:` on a card, or takes it off, with `--workflow` over its own and its repo kept, and reads back as a card or is refused as one', () => {
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
  const dFirstWhy = 'd-first.md: `workflow: nope` — no workflow folder.';
  const tries = new Map([
    [
      'd-first',
      {
        at: '2026-09-16T10:06:00.000Z',
        text: files[3].text,
        repo: app,
        why: dFirstWhy,
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

  const lines = inboxLines(listing, true);
  assert.deepEqual(
    lines.map((line) => line.split(' — ')[0]),
    [
      'a-tied     Tied, and first by name  workflow: dev  queued 2 of 4',
      'b-late     Late  workflow: dev  queued 4 of 4',
      'c-tied     Tied  workflow: dev  queued 3 of 4',
      'd-first    First, and refused  workflow: nope  queued 1 of 4',
      'e-started  Started by hand  workflow: dev  started as started-by-hand-ab12',
      'f-parked   Parked  workflow: dev',
    ],
    'each card on one line, its try said after it only where there is one',
  );
  assert.equal(lines.filter((line) => line.includes(' — ')).length, 2);
  const [failed, , , notStarted] = lines;
  assert.ok(failed.includes(` — failed at 2026-09-16T10:07:00.000Z on ${app}: ${noGit} — `), failed);
  assert.match(failed, /not a refusal: the tick tries it again/);
  assert.ok(notStarted.includes(` — not started at 2026-09-16T10:06:00.000Z on ${app}: ${dFirstWhy} `), notStarted);
  assert.match(notStarted, /Edit the card/);
  assert.match(notStarted, /run nemia up in the repository it is about/);

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

  const listed = (factory: string, repo: string, own = '') =>
    inboxListing(
      [{ file: `${factory}-a1b2.md`, text: text.replace('factory: solo', `factory: ${factory}${own}`) }],
      [],
      isDirectory,
      new Map([[`${factory}-a1b2`, { ...refused, text: text.replace('factory: solo', `factory: ${factory}${own}`), repo }]]),
      factories,
    );
  const solo = listed('solo', '/repos/solo');
  assert.equal(solo[0].factoryRepo, '/repos/solo');
  assert.equal(listed('duo', '/daemon')[0].factoryRepo, null, 'a factory of several repositories picks none');
  assert.equal(listed('gone', '/daemon')[0].factoryRepo, null, 'a factory that does not read picks none');
  assert.equal(listed('solo', '/home/me/code/app', '\nrepo: /home/me/code/app')[0].factoryRepo, null, 'a card that names its repository');
  assert.equal(listing[0].factoryRepo, null, 'no factories handed');
  assert.deepEqual(inboxLines(solo), [
    "solo-a1b2  Solo  workflow: build  factory: solo  queued 1 of 1 — not started at 2026-09-16T10:06:00.000Z on /repos/solo, its factory's one repository: build: not offered. Edit the card, or take it back and queue it again, and the tick tries it again",
  ]);
  assert.match(
    inboxLines(listed('duo', '/daemon'))[0],
    /on \/daemon: build: not offered\. Edit the card, or take it back and queue it again, or run nemia up in the repository it is about, and the tick tries it again$/,
  );
});

test('`queueLine`: what `nemia up` logs of the queue — `started <card> as <runId>`, a removal that failed with what then, a start refused with how to have it tried again, and one that failed otherwise, tried again', () => {
  assert.equal(
    queueLine({ card: 'cache-the-views-k2q9', run: 'cache-the-views-between-pass-ab12', removed: true }),
    'started cache-the-views-k2q9 as cache-the-views-between-pass-ab12',
  );
  const removal = '/inbox/cache-the-views-k2q9.md could not be removed — EACCES';
  const stillIn = queueLine({ card: 'cache-the-views-k2q9', run: 'cache-ab12', removed: false, why: removal });
  assert.ok(stillIn.startsWith('started cache-the-views-k2q9 as cache-ab12 — '), stillIn);
  assert.ok(stillIn.includes(`still in the inbox: ${removal}. `), stillIn);
  assert.match(stillIn, /it is not started again/);
  assert.match(stillIn, /nemia inbox rm cache-the-views-k2q9$/);

  const noFolder = 'cache-the-views-k2q9.md: `workflow: nope` — no workflow folder.';
  const notStarted = queueLine({ card: 'cache-the-views-k2q9', refused: noFolder });
  assert.ok(notStarted.startsWith(`cache-the-views-k2q9 not started: ${noFolder} — `), notStarted);
  assert.match(notStarted, /left queued as it is/);
  assert.match(notStarted, /nemia inbox queue cache-the-views-k2q9 --off/);
  assert.match(notStarted, /then nemia inbox queue cache-the-views-k2q9\)$/);

  const elsewhere = queueLine({ card: 'cache-the-views-k2q9', refused: noFolder, on: '/home/me/code/app' });
  assert.ok(elsewhere.startsWith(`cache-the-views-k2q9 not started on /home/me/code/app: ${noFolder} — `), elsewhere);
  assert.match(elsewhere, /nemia inbox queue cache-the-views-k2q9 --off/);
  assert.match(elsewhere, /, or run nemia up in the repository it is about$/);
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
    'said beside why it does not read, once',
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

test("`from:` names the runs a card's run is handed as context, in the order written, listed and written back", () => {
  const card = read('---\nworkflow: build\nfrom: a-1x2y,  b-3z4w\n---\nCache the views.\n');
  assert.deepEqual(card.from, ['a-1x2y', 'b-3z4w']);
  assert.equal(Object.hasOwn(read('---\nworkflow: dev\n---\nx\n'), 'from'), false, 'none unless it says so');
  const [listed] = inboxListing([{ file: card.file, text: '---\nfrom: a-1x2y\n---\nx\n' }], [], isDirectory);
  assert.deepEqual(listed.from, ['a-1x2y']);

  const set = fromText(card, ['c-5v6u'], isDirectory);
  assert.equal(set, '---\nworkflow: build\nfrom: c-5v6u\n---\nCache the views.\n');
  assert.equal(fromText(card, [], isDirectory), '---\nworkflow: build\n---\nCache the views.\n', 'taken back: the line goes');
});

/** Refused as `Invalid`, exit 2, its words naming each of `facts`: the file or idea, the key at fault, the fix. */
const refusedNaming =
  (...facts: string[]) =>
  (err: Error & { exitCode?: number; _tag?: string }) => {
    assert.deepEqual([err._tag, err.exitCode], ['Invalid', 2], err.message);
    names(err.message, ...facts);
    return true;
  };

test("REFUSED by name at shipped defaults: `parseInboxCard` refuses a card's keys — one it does not have, one with no value or set twice, a value it does not take — an empty body and a frontmatter that never closes", async (t) => {
  const F = 'cache-the-views-k2q9.md';
  const rows: Record<string, [text: string, facts: string[]]> = {
    'a key it does not have, naming the keys it has': [
      '---\nworkflow: dev\nharness: codex\n---\nx\n',
      [F, '`harness`', 'workflow, repo, queued, gate, factory, from', 'Correct the spelling or delete the line'],
    ],
    'a key spelt as another': ['---\nrepos: /home/me/code/app\n---\nx\n', [F, '`repos`']],
    'a misspelt `factory`': ['---\nfactry: pipao\n---\nx\n', [F, '`factry`', 'workflow, repo, queued, gate, factory,']],
    '`after:`, with where it is said instead': [
      '---\nworkflow: dev\nafter: parse-the-flag-1x2y\n---\nx\n',
      [F, '`after`', `nemia start <inbox>/${F}`, '--after <runId>', 'Delete the line.'],
    ],
    '`after:`, still, beside `from:`': ['---\nafter: a-1x2y\n---\nx\n', ['`after` is not a key an inbox card has']],
    '`workflow:` with no value': ['---\nworkflow:\n---\nx\n', [F, '`workflow` has no value', 'Delete the line']],
    '`repo:` with nothing but spaces': ['---\nrepo:   \n---\nx\n', [F, '`repo` has no value']],
    '`gate:` with no value': ['---\ngate:\n---\nx\n', [F, '`gate` has no value']],
    '`factory:` with no value': ['---\nfactory:\n---\nx\n', [F, '`factory` has no value']],
    '`repo:` twice': ['---\nrepo: /home/me/code/app\nrepo: /home/me/code/other\n---\nx\n', [F, '`repo` is set twice']],
    '`gate:` twice': ['---\ngate: plan\ngate: review\n---\nx\n', [F, '`gate` is set twice']],
    '`factory:` twice': ['---\nfactory: pipao\nfactory: nemia\n---\nx\n', [F, '`factory` is set twice']],
    '`queued:` twice': [
      '---\nworkflow: dev\nqueued: 2026-09-16T10:00:00.000Z\nqueued: 2026-09-16T11:00:00.000Z\n---\nx\n',
      ['`queued` is set twice'],
    ],
    '`repo:` not absolute': [
      '---\nrepo: code/app\n---\nx\n',
      [F, '`repo: code/app`', 'is not an absolute path', '`repo: /home/me/code/app`'],
    ],
    '`repo:` dotted': ['---\nrepo: ./app\n---\nx\n', [F, '`repo: ./app`', 'is not an absolute path']],
    '`repo:` naming no directory': [
      '---\nrepo: /home/me/code/gone\n---\nx\n',
      [F, '`repo: /home/me/code/gone`', 'names no directory', 'or delete the line'],
    ],
    'an empty body': ['---\nworkflow: dev\n---\n', [F, 'the body is empty']],
    'nothing but spaces': ['   \n', [F, 'the body is empty']],
    'a line that is not `key: value`, by its line': ['---\nworkflow dev\n---\nx\n', [`${F}:2: `]],
    'a frontmatter that never closes': [
      '---\nworkflow: dev\nCache the views.\n',
      [F, 'the frontmatter', 'never closes', 'a line that is just `---`'],
    ],
    '`gate:` naming more than one step': [
      '---\nworkflow: dev\ngate: plan, review\n---\nx\n',
      [F, '`gate: plan, review`', 'names more than one step', `nemia start <inbox>/${F}`, '--gate <step>.'],
    ],
    "`gate:` a step's own `true`": [
      '---\nworkflow: dev\ngate: true\n---\nx\n',
      [F, '`gate: true`', '`gate: plan`', 'Name the step, or delete the line.'],
    ],
    "`factory:` not a factory's name": [
      '---\nfactory: Pipao\n---\nx\n',
      [F, '`factory: Pipao`', "`Pipao` is not a factory's name", 'pipao, say', 'nemia factory ls'],
    ],
    '`queued:` with no `workflow:`': [
      '---\nrepo: /home/me/code/app\nqueued: 2026-09-16T10:00:00.000Z\n---\nx\n',
      [
        F,
        '`queued:` with no `workflow:`',
        'Write `workflow:`, or delete the `queued:` line',
        'nemia inbox queue cache-the-views-k2q9 --workflow <w>',
      ],
    ],
    '`from:` with a blank run': ['---\nfrom: a-1x2y, \n---\nx\n', ['`from:` names runs by id, comma-separated']],
    '`from:` naming a run twice': ['---\nfrom: a-1x2y, a-1x2y\n---\nx\n', ['names a-1x2y twice']],
  };
  for (const [name, [text, facts]] of Object.entries(rows))
    await t.test(name, () => assert.throws(() => read(text), refusedNaming(...facts)));
  await t.test('`queued:` that is not a time — a word, a day, a space, an offset, no such day, a number', () => {
    for (const bad of ['tomorrow', '2026-09-16', '2026-09-16 10:00:00', '2026-09-16T10:00:00+02:00', '2026-13-40T10:00:00.000Z', '1'])
      assert.throws(
        () => read(`---\nworkflow: dev\nqueued: ${bad}\n---\nx\n`),
        refusedNaming(
          F,
          `\`queued: ${bad}\` is not a time`,
          '`queued: 2026-09-16T10:00:00.000Z`',
          'nemia inbox queue cache-the-views-k2q9.',
        ),
        bad,
      );
  });
});

test('REFUSED by name at shipped defaults: `ideaCard` refuses what `nemia inbox add` is given — nothing in the idea, a card with a key it does not keep, a key given empty, on two lines or not a directory', async (t) => {
  const rows: Record<string, [thrown: () => unknown, facts: string[]]> = {
    'an empty body in a file': [
      () => ideaCard('./empty.md', '---\nworkflow: dev\n---\n', {}, isDirectory),
      ['./empty.md: the body is empty'],
    ],
    "`after:` in a file: not a card yet, so no card's path is named — file the idea, then give the wait at start": [
      () => ideaCard('./ideas/d.md', '---\nworkflow: dev\nafter: b, c\n---\nShow the flag.\n', {}, isDirectory),
      ['./ideas/d.md: `after`', 'Delete the line and file the idea', 'nemia start <inbox>/<name>.md --after <runId>.'],
    ],
    '`queued:` carried in by a file': [
      () => ideaCard('./idea.md', '---\nworkflow: dev\nqueued: 2026-09-16T10:00:00.000Z\n---\nCache the views.\n', {}, isDirectory),
      ['./idea.md: `queued`', 'Delete the line and file the idea', 'nemia inbox queue <name>.'],
    ],
    '`repo:` twice in a file': [
      () => ideaCard('./d.md', '---\nworkflow: dev\nrepo: /home/me/code/app\nrepo: /home/me/code/app\n---\nx\n', {}, isDirectory),
      ['./d.md: `repo` is set twice'],
    ],
    'a workflow given empty': [() => ideaCard('the idea', 'x', { workflow: '' }, isDirectory), ['the idea: `workflow` has no value']],
    'a repo given blank': [() => ideaCard('the idea', 'x', { repo: ' ' }, isDirectory), ['the idea: `repo` has no value']],
    'a repo given not absolute': [
      () => ideaCard('the idea', 'x', { repo: 'code/app' }, isDirectory),
      ['the idea: `repo: code/app` is not an absolute path'],
    ],
    'a repo given naming no directory': [
      () => ideaCard('the idea', 'x', { repo: '/home/me/code/gone' }, isDirectory),
      ['the idea: `repo: /home/me/code/gone`', 'names no directory'],
    ],
    'a workflow given on two lines': [
      () => ideaCard('the idea', 'x', { workflow: 'dev\nharness: codex' }, isDirectory),
      ['the idea: the workflow given, "dev\\nharness: codex"', 'is more than one line', 'Give the one line it names.'],
    ],
    'a repo given on two lines': [
      () => ideaCard('the idea', 'x', { repo: '/home/me/code/app\r\n---' }, isDirectory),
      ['the idea: the repo given', 'is more than one line'],
    ],
    "a factory given that is not a factory's name, refused as the card would be": [
      () => ideaCard('the idea', 'x', { factory: 'my factory' }, isDirectory),
      ['the idea: `factory: my factory`', "`my factory` is not a factory's name"],
    ],
    'a factory given on two lines': [
      () => ideaCard('the idea', 'x', { factory: 'pipao\nqueued: 2026-09-16T10:00:00.000Z' }, isDirectory),
      ['the idea: the factory given, ', 'is more than one line', "a card's factory: is one"],
    ],
  };
  for (const [name, [thrown, facts]] of Object.entries(rows)) await t.test(name, () => assert.throws(thrown, refusedNaming(...facts)));
  await t.test('nothing in the idea — empty, spaces, blank lines', () => {
    for (const text of ['', '   ', '\n\n'])
      assert.throws(
        () => ideaCard('the idea', text, {}, isDirectory),
        refusedNaming(
          'nemia inbox add takes the idea, ',
          'the idea has nothing in it',
          'nemia inbox add "<idea>"',
          'nemia inbox add ./idea.md',
          'Nothing was filed.',
        ),
        JSON.stringify(text),
      );
  });
});

test('REFUSED by name at shipped defaults: `inboxNameRefusal` refuses a name that would leave the inbox, a hidden file, and no name at all', async (t) => {
  const rows: Record<string, [name: string, facts: string[] | undefined]> = {
    'a name of the inbox passes': ['cache-the-views-k2q9', undefined],
    'two dots inside a name stay in the folder': ['a..b', undefined],
    'a hidden file': ['.cache-the-views-k2q9', ["`.cache-the-views-k2q9` is not a card's name", 'a hidden file', 'nemia inbox lists none']],
    'no name': ['', ['this name is empty', 'nemia inbox lists it']],
    'a blank name': ['  ', ['this name is empty']],
  };
  for (const name of ['../runs/r-1', '..', '.', 'drafts/idea', '/etc/passwd', 'a\\b', 'a\0b'])
    rows[`a name that leaves the inbox: ${JSON.stringify(name)}`] = [name, [`\`${name}\` is not a card's name`, 'no slash', 'not . or ..']];
  for (const [row, [name, facts]] of Object.entries(rows))
    await t.test(row, () => {
      const said = inboxNameRefusal(name);
      if (facts === undefined) assert.equal(said, undefined);
      else names(said, ...facts);
    });
});

test('REFUSED by name at shipped defaults: `queueRefusal` refuses a card with no workflow and none given, one already queued, and one a run was started from', async (t) => {
  const where = '/home/me/.agent-workflows/inbox/cache-the-views-k2q9.md';
  const card = read('---\nrepo: /home/me/code/app\n---\nCache the views.\n');
  const queued = read('---\nworkflow: dev\nqueued: 2026-09-16T10:00:00.000Z\n---\nCache the views.\n');
  const rows: Record<string, [said: () => string | undefined, facts: string[] | undefined]> = {
    'a card with no workflow, given one, queues': [() => queueRefusal(card, where, [], null, 'dev'), undefined],
    'a card with its workflow queues': [() => queueRefusal(read('---\nworkflow: dev\n---\nx\n'), where, [], null), undefined],
    'no workflow and none given': [
      () => queueRefusal(card, where, [], null),
      ['cache-the-views-k2q9.md: no workflow', 'nemia inbox queue cache-the-views-k2q9 --workflow <w>'],
    ],
    'already queued, at its place': [
      () => queueRefusal(queued, where, [], 2),
      [
        'cache-the-views-k2q9.md: already queued',
        '2026-09-16T10:00:00.000Z',
        '2 in the queue',
        'nemia inbox queue cache-the-views-k2q9 --off.',
      ],
    ],
    'started already, its removal failed': [
      () => queueRefusal(card, where, ['cache-the-views-ab12'], null, 'dev'),
      ['cache-the-views-k2q9.md: this card was started as cache-the-views-ab12', 'its removal failed'],
    ],
  };
  for (const [row, [said, facts]] of Object.entries(rows))
    await t.test(row, () => (facts === undefined ? assert.equal(said(), undefined) : names(said(), ...facts)));
});

test('REFUSED: `queueFactoryRefusal` refuses a card that names no factory, naming those on file or how one is filed, and one that names default whatever is allowed — a card of a factory passes, and one of none where unfactored starts are allowed', async (t) => {
  const file = '/s/inbox/a.md';
  const loose = { name: 'a', factory: undefined };
  const rows: Record<string, [said: () => string | null, facts: string[] | null]> = {
    'no factory, with factories on file': [
      () => queueFactoryRefusal(loose, file, ['pipao', 'abc'], false),
      [file, 'names no factory', '`factory: <name>`', 'one of abc, pipao', 'nemia inbox queue a.', 'Nothing was queued.'],
    ],
    'no factory, and none on file': [
      () => queueFactoryRefusal(loose, file, [], false),
      ['nemia factory add <name> --repo <root>', 'nemia inbox queue a.', 'Nothing was queued.'],
    ],
    'no factory, where unfactored starts are allowed': [() => queueFactoryRefusal(loose, file, ['pipao'], true), null],
  };
  for (const allowed of [false, true]) {
    rows[`default, unfactored starts ${allowed ? '' : 'not '}allowed`] = [
      () => queueFactoryRefusal({ name: 'a', factory: 'default' }, file, ['pipao'], allowed),
      ['`default` is the default factory', `\`factory: <name>\` in ${file}`, 'one of pipao.', 'Nothing was queued.'],
    ];
    rows[`a card of a factory, unfactored starts ${allowed ? '' : 'not '}allowed`] = [
      () => queueFactoryRefusal({ name: 'a', factory: 'pipao' }, file, ['pipao'], allowed),
      null,
    ];
  }
  for (const [row, [said, facts]] of Object.entries(rows))
    await t.test(row, () => {
      const got = said();
      if (facts === null) return assert.equal(got, null);
      names(got, ...facts);
      assert.equal(got!.includes('Nothing was started'), false, 'a queue says nothing of a start');
    });
});
