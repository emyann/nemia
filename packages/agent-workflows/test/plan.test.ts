/**
 * A plan is a folder of cards: the format, the order `wf plan` starts them in, and what it prints — pure, as data.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_KEYS, parsePlan, planLines, planOrder, planStopped, type PlanFile, type Planned } from '../src/plan.ts';

const card = (name: string, keys: string, body = `do ${name}`): PlanFile => ({ file: `${name}.md`, text: `---\n${keys}\n---\n${body}\n` });

const DIAMOND: readonly PlanFile[] = [
  card('a', 'workflow: dev'),
  card('b', 'workflow: dev\nafter: a'),
  card('c', 'workflow: ./flows/ui\nafter: a'),
  card('d', 'workflow: dev\nafter: b, c'),
];

/** Refused by name: exit 2, and the message — never `String(err)`, which starts with `Error: `. */
const refusedWith = (pattern: RegExp) => (err: Error & { exitCode?: number }) => err.exitCode === 2 && pattern.test(err.message);

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
  // Saved on Windows, with a comment and a blank line in its frontmatter, and a brief of more than one paragraph: the same card.
  const [windows] = parsePlan([{ file: 'a.md', text: '﻿---\r\n# what runs it\r\nworkflow: dev\r\n\r\n---\r\nParse the flag.\r\n\r\nIn cli.ts.\r\n' }]);
  assert.deepEqual(windows, { name: 'a', file: 'a.md', workflow: 'dev', after: [], body: 'Parse the flag.\n\nIn cli.ts.' });
});

test('`planOrder` puts parents first — the diamond is a, b, c, d whatever order its files are in — and among the cards that may go next, by name', () => {
  assert.deepEqual(planOrder(parsePlan([...DIAMOND].reverse())).map((c) => c.name), ['a', 'b', 'c', 'd']);
  const chain = [card('b', 'workflow: dev\nafter: m'), card('m', 'workflow: dev\nafter: z'), card('z', 'workflow: dev')];
  assert.deepEqual(parsePlan(chain).map((c) => c.name), ['b', 'm', 'z'], 'parsed by name');
  assert.deepEqual(planOrder(parsePlan(chain)).map((c) => c.name), ['z', 'm', 'b'], 'started parents first');
  // x waits on y, so w and y — which may go at once — go by name, and x after y.
  assert.deepEqual(planOrder(parsePlan([card('y', 'workflow: dev'), card('x', 'workflow: dev\nafter: y'), card('w', 'workflow: dev')])).map((c) => c.name), ['w', 'y', 'x']);
});

test('REFUSED by name at shipped defaults: a card with no `workflow:`, an empty body, a key a card does not have, a key set twice or to nothing, and a line that is not a key', () => {
  assert.throws(() => parsePlan([{ file: 'a.md', text: 'Parse the flag.\n' }]),
    refusedWith(/^a\.md: no `workflow:`, so nothing says what runs this card\. Name it in the frontmatter: `workflow: dev`/));
  assert.throws(() => parsePlan([card('a', 'after: b'), card('b', 'workflow: dev')]), refusedWith(/^a\.md: no `workflow:`/));
  assert.throws(() => parsePlan([card('a', 'workflow: dev', '')]),
    refusedWith(/^a\.md: the body is empty\. A card's body is its run's brief/));
  assert.throws(() => parsePlan([card('a', 'workflow: dev\nharness: codex')]),
    refusedWith(/^a\.md: `harness` is not a key a card has\. A card's keys are: workflow, after — what runs it, and what ships first; how its steps run is its workflow's to say\./));
  assert.throws(() => parsePlan([card('a', 'workflow: dev'), card('b', 'workflow: dev\nafer: a')]), refusedWith(/^b\.md: `afer` is not a key a card has\./));
  assert.throws(() => parsePlan([card('a', 'workflow: dev\nworkflow: ui')]), refusedWith(/^a\.md: `workflow` is set twice, and a card that says two things says nothing\. Keep one line\.$/));
  assert.throws(() => parsePlan([card('a', 'workflow: dev'), card('b', 'workflow: dev\nafter: a\nafter: a')]), refusedWith(/^b\.md: `after` is set twice.*list every card on it: `after: a, b`/));
  assert.throws(() => parsePlan([card('a', 'workflow:')]), refusedWith(/^a\.md: `workflow` has no value\./));
  assert.throws(() => parsePlan([card('a', 'workflow dev')]), refusedWith(/^a\.md: `workflow dev` is not `key: value`\./));
  assert.throws(() => parsePlan([{ file: 'a.md', text: '---\nworkflow: dev\nParse the flag.\n' }]), refusedWith(/^a\.md: the frontmatter opened on the first line never closes/));
});

test("REFUSED by name at shipped defaults: an `after:` naming a card the folder does not have, the card itself, a card twice, or no card — and a cycle of three, named round, whatever waits on it", () => {
  assert.throws(() => parsePlan([card('a', 'workflow: dev'), card('b', 'workflow: dev\nafter: e')]),
    refusedWith(/^b\.md: `after: e` names e, and the plan has no card e\. Its cards are: a, b\. Correct the name, or delete it from the line\.$/));
  assert.throws(() => parsePlan([card('a', 'workflow: dev'), card('b', 'workflow: dev\nafter: a.md')]),
    refusedWith(/^b\.md: `after: a\.md` names a\.md, and the plan has no card a\.md\. A card is named without its \.md: `a`\./));
  assert.throws(() => parsePlan([card('a', 'workflow: dev\nafter: a')]), refusedWith(/^a\.md: `after: a` names this card\./));
  assert.throws(() => parsePlan([card('a', 'workflow: dev'), card('b', 'workflow: dev\nafter: a, a')]), refusedWith(/^b\.md: `after: a, a` names a twice\./));
  assert.throws(() => parsePlan([card('a', 'workflow: dev'), card('b', 'workflow: dev\nafter: ,')]), refusedWith(/^b\.md: `after: ,` names no card\./));

  const three = [card('a', 'workflow: dev\nafter: c'), card('b', 'workflow: dev\nafter: a'), card('c', 'workflow: dev\nafter: b'), card('d', 'workflow: dev\nafter: a'), card('e', 'workflow: dev')];
  assert.throws(() => parsePlan(three), refusedWith(/^a\.md, c\.md, b\.md wait on each other — a after c, c after b, b after a — so none of them could ever start\. Take one of those cards out of the other's `after:`\.$/));
  assert.throws(() => planOrder([
    { name: 'a', file: 'a.md', workflow: 'dev', after: ['b'], body: 'do a' },
    { name: 'b', file: 'b.md', workflow: 'dev', after: ['a'], body: 'do b' },
  ]), refusedWith(/^a\.md, b\.md wait on each other — a after b, b after a —/), '`planOrder` refuses it on its own');
});

test('REFUSED by name at shipped defaults: a file that is not .md, a folder inside the plan, and a folder with no card — a README alone included', () => {
  assert.throws(() => parsePlan([card('a', 'workflow: dev'), { file: 'notes.txt', text: '' }]),
    refusedWith(/^notes\.txt in the plan folder: not a card\. A plan folder holds one markdown file per card, <card>\.md, and a README\.md that says what the plan is for\. Move it out of the folder, or, for a card, name it <card>\.md\.$/));
  assert.throws(() => parsePlan([card('a', 'workflow: dev'), { file: 'notes.txt', text: '' }, { file: 'drafts/', text: '' }], '/plans/q3'),
    refusedWith(/^drafts\/, notes\.txt in \/plans\/q3: not cards\..* Move them out of the folder/));
  assert.throws(() => parsePlan([]), refusedWith(/^the plan folder has no cards in it\. A card is one markdown file, <card>\.md: `workflow:` in its frontmatter, and its run's brief below\./));
  assert.throws(() => parsePlan([{ file: 'README.md', text: '# Q3\n' }], '/plans/q3'), refusedWith(/^\/plans\/q3 has no cards in it — README\.md says what the plan is for, and is not a card\./));
});

const IDS: Record<string, string> = { a: 'parse-the-flag-1x2y', b: 'document-it-3z4w', c: 'store-it-5v6u', d: 'show-it-7t8s' };
const startedOf = (names: readonly string[]): Planned[] =>
  planOrder(parsePlan(DIAMOND)).filter((c) => names.includes(c.name)).map((c) => ({ card: c, runId: IDS[c.name]!, workflowDir: `/repo/workflows/${c.workflow}` }));

test('`wf plan` prints a line per card, parents first: the card, its run, its workflow as the card names it, and what it waits on, by card and by run', () => {
  assert.deepEqual(planLines(startedOf(['a', 'b', 'c', 'd'])), [
    'a  parse-the-flag-1x2y  dev         waits on nothing',
    'b  document-it-3z4w     dev         waits on a (parse-the-flag-1x2y)',
    'c  store-it-5v6u        ./flows/ui  waits on a (parse-the-flag-1x2y)',
    'd  show-it-7t8s         dev         waits on b (document-it-3z4w), c (store-it-5v6u)',
  ]);
  assert.deepEqual(planLines([]), []);
});

test('a plan stopped part-way says which card refused and why, names the runs that stand, and gives a `wf start --after` for each card left — a run not started yet by what will name it', () => {
  const cards = planOrder(parsePlan(DIAMOND));
  const opts = { dir: '/plans/q3/', repo: '/repo', folderOf: (c: { workflow: string }) => `/repo/workflows/${c.workflow.replace('./flows/', '')}` };
  assert.deepEqual(planStopped({ card: cards[2]!, why: 'the disk is full', rest: [cards[3]!] }, startedOf(['a', 'b']), opts).split('\n'), [
    'wf plan stopped at c.md: the disk is full',
    'The runs it started stand, and the tick files each as its edges allow: a (parse-the-flag-1x2y), b (document-it-3z4w). Cancel one with wf cancel <runId>.',
    'Start the rest by hand, parents first, once what stopped c.md is fixed — each --after the run of a card it waits on:',
    '  wf start /plans/q3/c.md --workflows /repo/workflows/ui --repo /repo --after parse-the-flag-1x2y',
    "  wf start /plans/q3/d.md --workflows /repo/workflows/dev --repo /repo --after document-it-3z4w --after <c's run id>",
  ]);
  assert.deepEqual(planStopped({ card: cards[0]!, why: 'not a git repository', rest: cards.slice(1) }, [], opts).split('\n').slice(0, 4), [
    'wf plan stopped at a.md: not a git repository',
    'It started no run.',
    'Start the rest by hand, parents first, once what stopped a.md is fixed — each --after the run of a card it waits on:',
    '  wf start /plans/q3/a.md --workflows /repo/workflows/dev --repo /repo',
  ]);
});
