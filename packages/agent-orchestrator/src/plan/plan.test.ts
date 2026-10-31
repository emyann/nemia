/**
 * A plan is a folder of cards: the format, the order `nemia start <folder>` starts them in, and what it prints — pure, as data.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowError } from '../step/step.ts';
import { CARD_KEYS, cardToStart, parsePlan, planLines, planOrder, planStopped, type PlanFile, type Planned } from './plan.ts';

const card = (name: string, keys: string, body = `do ${name}`): PlanFile => ({ file: `${name}.md`, text: `---\n${keys}\n---\n${body}\n` });

const DIAMOND: readonly PlanFile[] = [
  card('a', 'workflow: dev'),
  card('b', 'workflow: dev\nafter: a'),
  card('c', 'workflow: ./flows/ui\nafter: a'),
  card('d', 'workflow: dev\nafter: b, c'),
];

/**
 * Refused by name: a `WorkflowError`, exit 2, the message opening as `pattern` says — never `String(err)`, which starts with `Error: ` —
 * and naming each of `fixes`, the key, the card or the command its fix turns on.
 */
const refusedWith =
  (pattern: RegExp, ...fixes: string[]) =>
  (err: Error & { exitCode?: number }) =>
    err instanceof WorkflowError && err.exitCode === 2 && pattern.test(err.message) && fixes.every((fix) => err.message.includes(fix));

test('a card is its file: the name without .md, `workflow:` and `after:` from its frontmatter, the body as its brief — and README.md is not a card', () => {
  const cards = parsePlan([
    { file: 'README.md', text: '# The flag\n\nParse it, then store it, then show it.\n' },
    ...[...DIAMOND].reverse(),
  ]);
  assert.deepEqual(cards, [
    { name: 'a', file: 'a.md', workflow: 'dev', after: [], body: 'do a' },
    { name: 'b', file: 'b.md', workflow: 'dev', after: ['a'], body: 'do b' },
    { name: 'c', file: 'c.md', workflow: './flows/ui', after: ['a'], body: 'do c' },
    { name: 'd', file: 'd.md', workflow: 'dev', after: ['b', 'c'], body: 'do d' },
  ]);
  assert.deepEqual(CARD_KEYS, ['workflow', 'after']);
  const [windows] = parsePlan([
    { file: 'a.md', text: '﻿---\r\n# what runs it\r\nworkflow: dev\r\n\r\n---\r\nParse the flag.\r\n\r\nIn cli.ts.\r\n' },
  ]);
  assert.deepEqual(
    windows,
    { name: 'a', file: 'a.md', workflow: 'dev', after: [], body: 'Parse the flag.\n\nIn cli.ts.' },
    'saved on Windows, with a comment and a blank line in its frontmatter, and a brief of more than one paragraph: the same card',
  );
});

test('`planOrder` puts parents first — the diamond is a, b, c, d whatever order its files are in — and among the cards that may go next, by name', () => {
  assert.deepEqual(
    planOrder(parsePlan([...DIAMOND].reverse())).map((c) => c.name),
    ['a', 'b', 'c', 'd'],
  );
  const chain = [card('b', 'workflow: dev\nafter: m'), card('m', 'workflow: dev\nafter: z'), card('z', 'workflow: dev')];
  assert.deepEqual(
    parsePlan(chain).map((c) => c.name),
    ['b', 'm', 'z'],
    'parsed by name',
  );
  assert.deepEqual(
    planOrder(parsePlan(chain)).map((c) => c.name),
    ['z', 'm', 'b'],
    'started parents first',
  );
  assert.deepEqual(
    planOrder(parsePlan([card('y', 'workflow: dev'), card('x', 'workflow: dev\nafter: y'), card('w', 'workflow: dev')])).map((c) => c.name),
    ['w', 'y', 'x'],
    'x waits on y, so w and y, which may go at once, go by name, and x after y',
  );
});

/** A refusal of a card or a plan folder: what refuses, the message's opening, and the fixes it names. */
type Refused = [what: string, refuses: () => unknown, opens: RegExp, ...fixes: string[]];

const PARSE: Refused[] = [
  [
    'a card with no `workflow:`',
    () => parsePlan([{ file: 'a.md', text: 'Parse the flag.\n' }]),
    /^a\.md: no `workflow:`/,
    'Name it in the frontmatter',
    '`workflow: dev`',
  ],
  ['a card with only `after:`', () => parsePlan([card('a', 'after: b'), card('b', 'workflow: dev')]), /^a\.md: no `workflow:`/],
  ['an empty body', () => parsePlan([card('a', 'workflow: dev', '')]), /^a\.md: the body is empty\./, "its run's brief"],
  [
    'a key a card does not have',
    () => parsePlan([card('a', 'workflow: dev\nharness: codex')]),
    /^a\.md: `harness` is not a key a card has\./,
    "A card's keys are: workflow, after",
    "its workflow's to say",
  ],
  [
    'a misspelt key on another card',
    () => parsePlan([card('a', 'workflow: dev'), card('b', 'workflow: dev\nafer: a')]),
    /^b\.md: `afer` is not a key a card has\./,
  ],
  [
    '`workflow` set twice',
    () => parsePlan([card('a', 'workflow: dev\nworkflow: ui')]),
    /^a\.md: `workflow` is set twice/,
    'Keep one line.',
  ],
  [
    '`after` set twice',
    () => parsePlan([card('a', 'workflow: dev'), card('b', 'workflow: dev\nafter: a\nafter: a')]),
    /^b\.md: `after` is set twice/,
    'list every card on it',
    '`after: a, b`',
  ],
  ['a key set to nothing', () => parsePlan([card('a', 'workflow:')]), /^a\.md: `workflow` has no value\./],
  ['a line that is not a key, by its line', () => parsePlan([card('a', 'workflow dev')]), /^a\.md:2: /],
  ['a list on a key of one value, by its line', () => parsePlan([card('a', 'workflow: [dev, ui]')]), /^a\.md:2: /],
  [
    "`repo:`, an inbox card's key: a plan works on the one repository `nemia start <folder> --repo` is given",
    () => parsePlan([card('a', 'workflow: dev\nrepo: /home/me/code/app')]),
    /^a\.md: `repo` is not a key a plan's card has/,
    'nemia start <folder> --repo <r>',
    "nemia start's --repo",
    'delete the line',
    'nemia inbox add <file> --repo <r>',
  ],
  [
    'a frontmatter that never closes',
    () => parsePlan([{ file: 'a.md', text: '---\nworkflow: dev\nParse the flag.\n' }]),
    /^a\.md: the frontmatter opened/,
    'never closes',
  ],
  [
    'an `after:` naming a card the folder does not have',
    () => parsePlan([card('a', 'workflow: dev'), card('b', 'workflow: dev\nafter: e')]),
    /^b\.md: `after: e` names e/,
    'no card e',
    'Its cards are: a, b.',
    'Correct the name',
    'delete it from the line',
  ],
  [
    'an `after:` naming a card by its file',
    () => parsePlan([card('a', 'workflow: dev'), card('b', 'workflow: dev\nafter: a.md')]),
    /^b\.md: `after: a\.md` names a\.md/,
    'no card a.md',
    'without its .md: `a`',
  ],
  ['an `after:` naming the card itself', () => parsePlan([card('a', 'workflow: dev\nafter: a')]), /^a\.md: `after: a` names this card\./],
  [
    'an `after:` naming a card twice',
    () => parsePlan([card('a', 'workflow: dev'), card('b', 'workflow: dev\nafter: a, a')]),
    /^b\.md: `after: a, a` names a twice\./,
  ],
  [
    'an `after:` naming no card',
    () => parsePlan([card('a', 'workflow: dev'), card('b', 'workflow: dev\nafter: ,')]),
    /^b\.md: `after: ,` names no card\./,
  ],
  [
    'a cycle of three, named round, whatever waits on it',
    () =>
      parsePlan([
        card('a', 'workflow: dev\nafter: c'),
        card('b', 'workflow: dev\nafter: a'),
        card('c', 'workflow: dev\nafter: b'),
        card('d', 'workflow: dev\nafter: a'),
        card('e', 'workflow: dev'),
      ]),
    /^a\.md, c\.md, b\.md wait on each other/,
    'a after c, c after b, b after a',
    "out of the other's `after:`",
  ],
  [
    'a cycle `planOrder` is handed refuses on its own',
    () =>
      planOrder([
        { name: 'a', file: 'a.md', workflow: 'dev', after: ['b'], body: 'do a' },
        { name: 'b', file: 'b.md', workflow: 'dev', after: ['a'], body: 'do b' },
      ]),
    /^a\.md, b\.md wait on each other — a after b, b after a —/,
  ],
  [
    'a file that is not .md',
    () => parsePlan([card('a', 'workflow: dev'), { file: 'notes.txt', text: '' }]),
    /^notes\.txt in the plan folder: not a card\./,
    'README.md',
    'Move it out of the folder',
    'name it <card>.md',
  ],
  [
    'a folder inside the plan, beside a file that is not .md',
    () => parsePlan([card('a', 'workflow: dev'), { file: 'notes.txt', text: '' }, { file: 'drafts/', text: '' }], '/plans/q3'),
    /^drafts\/, notes\.txt in \/plans\/q3: not cards\./,
    'Move them out of the folder',
  ],
  ['a folder with no card', () => parsePlan([]), /^the plan folder has no cards in it\./, '<card>.md', '`workflow:` in its frontmatter'],
  [
    'a README alone',
    () => parsePlan([{ file: 'README.md', text: '# Q3\n' }], '/plans/q3'),
    /^\/plans\/q3 has no cards in it/,
    'README.md says what the plan is for',
    'is not a card',
  ],
];

/** A card's `after:` started with no --after; what `nemia start <folder>` refuses of a card, refused at `nemia start <card.md>` too. */
const START: Refused[] = [
  [
    'a card whose after: names cards, started with no --after, whatever the rest of it says',
    () => cardToStart('plans/q3/d.md', '---\nworkflow: dev\nafter: b, c\n---\nShow the flag.\n', []),
    /^plans\/q3\/d\.md: `after: b, c`/,
    'waits on the runs of b and c',
    'given no --after',
    'nemia ls',
    'nemia start plans/q3/d.md',
    "--after <b's run id> --after <c's run id>.",
  ],
  ['three cards named', () => cardToStart('e.md', '---\nafter: a, b, c\n---\nx\n', []), /waits on the runs of a, b and c,/],
  [
    'one card named',
    () => cardToStart('e.md', '---\nafter: a\n---\nx\n', []),
    /^e\.md: `after: a`/,
    'waits on the run of a,',
    "nemia start e.md --after <a's run id>.",
  ],
  ['an empty body', () => cardToStart('a.md', '---\nworkflow: dev\n---\n', []), /^a\.md: the body is empty\./],
  ['a key set twice', () => cardToStart('a.md', '---\nworkflow: dev\nworkflow: ui\n---\nx\n', []), /^a\.md: `workflow` is set twice/],
  ['a key set to nothing', () => cardToStart('a.md', '---\nworkflow:\n---\nx\n', []), /^a\.md: `workflow` has no value\./],
  [
    'a list on `workflow:`, which names one, by its line',
    () => cardToStart('d.md', '---\nworkflow:\n  - dev\n  - ui\n---\nx\n', []),
    /^d\.md:2: /,
  ],
  ['an after: naming no card', () => cardToStart('a.md', '---\nafter: ,\n---\nx\n', ['r-b']), /^a\.md: `after: ,` names no card\./],
  ['an after: naming one twice', () => cardToStart('a.md', '---\nafter: b, b\n---\nx\n', ['r-b']), /^a\.md: `after: b, b` names b twice\./],
  [
    'a card carried out of the inbox: a card, not a brief, its `repo:` refused by name',
    () => cardToStart('idea.md', '---\nworkflow: dev\nrepo: /home/me/code/app\n---\nx\n', []),
    /^idea\.md: `repo` is not a key a plan's card has:/,
    'nemia inbox add idea.md',
  ],
  [
    '`repo:` alone',
    () => cardToStart('idea.md', '---\nrepo: /home/me/code/app\n---\nx\n', []),
    /^idea\.md: `repo` is not a key a plan's card has:/,
  ],
  [
    "an inbox card's frontmatter written outside the inbox: refused at its first key a plan's card lacks",
    () => cardToStart('card.md', '---\nworkflow: build\nrepo: /home/me/code/app\nfactory: nemia\n---\nShip the thing.\n', []),
    /^card\.md: `repo` is not a key a plan's card has: /,
    'nemia inbox add card.md',
  ],
  [
    '`factory:` after `workflow:`',
    () => cardToStart('card.md', '---\nworkflow: build\nfactory: nemia\n---\nShip it.\n', []),
    /^card\.md: `factory` is not a key a plan's card has: /,
    'nemia inbox add card.md',
  ],
  [
    '`factory:` alone',
    () => cardToStart('card.md', '---\nfactory: nemia\n---\nx\n', []),
    /^card\.md: `factory` is not a key a plan's card has: /,
    'nemia inbox add card.md',
  ],
  [
    '`gate:`',
    () => cardToStart('card.md', '---\ngate: plan\n---\nx\n', []),
    /^card\.md: `gate` is not a key a plan's card has: /,
    'nemia inbox add card.md',
  ],
  [
    "a document's own frontmatter, naming its key: nemia start takes no block into a brief",
    () => cardToStart('brief.md', '---\ntitle: the flag\nworkflow: dev\n---\nParse it.\n', []),
    /^brief\.md: `title` is not a key a plan's card has: /,
    'nemia inbox add brief.md',
  ],
  [
    'a key is a word of letters, digits, _ and -, before a colon',
    () => cardToStart('brief.md', '---\nTitle-2 : the flag\n---\nParse it.\n', []),
    /^brief\.md: `Title-2` is not a key a plan's card has: /,
    'nemia inbox add brief.md',
  ],
];

test("REFUSED by name at shipped defaults: a plan's card, its `after:` and its folder, and a card started on its own", async (t) => {
  for (const [what, refuses, opens, ...fixes] of [...PARSE, ...START]) {
    await t.test(what, () => assert.throws(refuses, refusedWith(opens, ...fixes)));
  }
});

const IDS: Record<string, string> = { a: 'parse-the-flag-1x2y', b: 'document-it-3z4w', c: 'store-it-5v6u', d: 'show-it-7t8s' };
const startedOf = (names: readonly string[]): Planned[] =>
  planOrder(parsePlan(DIAMOND))
    .filter((c) => names.includes(c.name))
    .map((c) => ({ card: c, runId: IDS[c.name], workflowDir: `/repo/workflows/${c.workflow}` }));

test('`nemia start <folder>` prints a line per card, parents first: the card, its run, its workflow as the card names it, and what it waits on, by card and by run', () => {
  assert.deepEqual(planLines(startedOf(['a', 'b', 'c', 'd'])), [
    'a  parse-the-flag-1x2y  dev         waits on nothing',
    'b  document-it-3z4w     dev         waits on a (parse-the-flag-1x2y)',
    'c  store-it-5v6u        ./flows/ui  waits on a (parse-the-flag-1x2y)',
    'd  show-it-7t8s         dev         waits on b (document-it-3z4w), c (store-it-5v6u)',
  ]);
  assert.deepEqual(planLines([]), []);
});

test('a plan stopped part-way says which card refused and why, names the runs that stand, and gives a `nemia start --after` for each card left — a run not started yet by what will name it', () => {
  const cards = planOrder(parsePlan(DIAMOND));
  const opts = {
    dir: '/plans/q3/',
    repo: '/repo',
    folderOf: (c: { workflow: string }) => `/repo/workflows/${c.workflow.replace('./flows/', '')}`,
  };
  const startOf = (line: string, file: string, ...args: string[]) => {
    assert.ok(line.startsWith(`  nemia start ${file} `), line);
    for (const arg of args) assert.ok(line.includes(` ${arg}`), `${line} gives ${arg}`);
    assert.equal(line.split(' --').length - 1, args.length, line);
  };
  const stopped = planStopped({ card: cards[2], why: 'the disk is full', rest: [cards[3]] }, startedOf(['a', 'b']), opts).split('\n');
  assert.equal(stopped.length, 5);
  assert.equal(stopped[0], 'nemia start stopped at c.md: the disk is full');
  for (const fact of ['stand', 'a (parse-the-flag-1x2y), b (document-it-3z4w)', 'nemia cancel <runId>'])
    assert.ok(stopped[1].includes(fact), fact);
  for (const fact of ['parents first', 'once what stopped c.md is fixed', '--after']) assert.ok(stopped[2].includes(fact), fact);
  startOf(stopped[3], "'/plans/q3/c.md'", "--workflows '/repo/workflows/ui'", "--repo '/repo'", '--after parse-the-flag-1x2y');
  startOf(
    stopped[4],
    "'/plans/q3/d.md'",
    "--workflows '/repo/workflows/dev'",
    "--repo '/repo'",
    '--after document-it-3z4w',
    "--after <c's run id>",
  );
  const none = planStopped({ card: cards[0], why: 'not a git repository', rest: cards.slice(1) }, [], opts).split('\n');
  assert.equal(none[0], 'nemia start stopped at a.md: not a git repository');
  assert.equal(none[1], 'It started no run.');
  assert.ok(none[2].includes('once what stopped a.md is fixed'), none[2]);
  startOf(none[3], "'/plans/q3/a.md'", "--workflows '/repo/workflows/dev'", "--repo '/repo'");
  const spaced = { dir: "/home/me/plans/q3 it's", repo: '/code/my app', folderOf: () => '/code/my app/workflows/dev' };
  const quotedForTheShell = planStopped({ card: cards[0], why: 'x', rest: [] }, [], spaced).split('\n').at(-1)!;
  startOf(quotedForTheShell, `'/home/me/plans/q3 it'\\''s/a.md'`, "--workflows '/code/my app/workflows/dev'", "--repo '/code/my app'");
});

test('`cardToStart`: a card file starts its body, with its `workflow:` and `after:` — a file with no frontmatter of keys is not a card and is taken whole', () => {
  assert.deepEqual(cardToStart('plans/q3/c.md', '---\nworkflow: ui\nafter: a\n---\nStore the flag.\n\nIn the settings file.\n', ['r-a']), {
    file: 'plans/q3/c.md',
    workflow: 'ui',
    after: ['a'],
    body: 'Store the flag.\n\nIn the settings file.',
  });
  assert.deepEqual(cardToStart('a.md', '\uFEFF---\r\n# what runs it\r\nworkflow: dev\r\n\r\n---\r\nParse the flag.\r\n', []), {
    file: 'a.md',
    workflow: 'dev',
    after: [],
    body: 'Parse the flag.',
  });
  assert.deepEqual(
    cardToStart('b.md', '---\nafter: a\n---\nDocument it.\n', ['r-a']),
    { file: 'b.md', after: ['a'], body: 'Document it.' },
    'no workflow: — --workflows says, or the default',
  );
  assert.deepEqual(
    cardToStart('d.md', '---\nworkflow: "dev"\nafter:\n  - b\n  - c\n---\nShow the flag.\n', ['r-b', 'r-c']),
    { file: 'd.md', workflow: 'dev', after: ['b', 'c'], body: 'Show the flag.' },
    'a YAML card: a quoted value, and `after:` as a block list, read as `after: b, c`',
  );
  assert.deepEqual(
    cardToStart('d.md', '---\nafter: [b, c]\n---\nShow the flag.\n', ['r-b', 'r-c']),
    { file: 'd.md', after: ['b', 'c'], body: 'Show the flag.' },
    'and as a flow list',
  );

  for (const text of [
    'Parse the flag.\n',
    '---\nSome prose between two rules\n---\nParse it.\n',
    '---\nIn short: parse it\n---\nParse it.\n',
    '---\nThis is a brief, with: a colon\n---\nParse it.\n',
    '---\nA brief in prose, opening on a rule\n\nwith a second paragraph.\n---\nParse it.\n',
    '---\n- a list, not keys\n---\nParse it.\n',
    '---\nA brief that opens with a rule, and never closes one.\n',
    '---\n---\nParse it.\n',
    '---\n\n# only a comment\n---\nParse it.\n',
  ]) {
    assert.equal(cardToStart('brief.md', text, []), null, `not a card, so the whole text is the brief: ${JSON.stringify(text)}`);
  }
});
