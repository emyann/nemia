/**
 * What a workflow node starts and a backlog node files: the brief of the run a `workflow:` node starts (`childBrief`) — by default the
 * producer's title with why it was started, with `brief: card` the run's own card as it was given and the producer's reason — and the
 * card a `card: backlog` node files back (`sentCardText`), read as the inbox reads it: naming no workflow, unqueued, its labels after the
 * edits its `relabel:` lists.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import type { Run } from '../record/record.ts';
import { parseWorkflow } from '../workflow/step-file.ts';
import { parseInboxCard } from '../inbox/index.ts';
import { childBrief, filesLeftOff, sentCardText } from './send.verb.ts';

const RUN: Run = {
  id: 'r-door',
  repo: '/repo',
  workspace: '/wt',
  baseRef: 'abc123',
  branch: 'main',
  isolate: true,
  brief: 'The brief the run was started on.',
  workflowDir: '/wf',
  steps: {},
  createdAt: '2026-11-19T00:00:00Z',
  factory: 'mill',
};
const WHY = { condition: 'door', route: 'quick', reason: 'It settles its change.' };
const GIVEN = { body: 'Make the list sort by name.', labels: { ready: 'yes', area: 'board' } };

/** The node `name` after the condition, its frontmatter `keys`. */
const nodeOf = (name: string, keys: string) => parseWorkflow(name, `---\nplace: git\nafter: door\n${keys}\n---\nfile it\n`);

/** The card a backlog node files, read back as the inbox reads it. */
const filed = (keys: string, given = GIVEN) =>
  parseInboxCard('sent.md', sentCardText(RUN, nodeOf('to', keys), WHY, { team: 'core' }, given));

describe('the brief of the run a workflow node starts, by its brief:', () => {
  test('title, the default: the producer\'s title, then why it was started, with no reason', () => {
    const brief = childBrief(RUN, nodeOf('to', 'workflow: quick'), WHY, 'A title', GIVEN);
    assert.ok(brief.startsWith('A title'));
    assert.ok(brief.includes('## From run r-door'));
    assert.ok(!brief.includes(WHY.reason));
    assert.ok(!brief.includes(GIVEN.body));
  });
  test("card: the run's own card, its body, then why it was started and the producer's reason", () => {
    const brief = childBrief(RUN, nodeOf('to', 'workflow: quick\nbrief: card'), WHY, 'A title', GIVEN);
    assert.ok(brief.startsWith(GIVEN.body));
    assert.ok(brief.includes(WHY.reason));
  });
  test("card, with no card the run was started from: the run's brief", () => {
    const brief = childBrief(RUN, nodeOf('to', 'workflow: quick\nbrief: card'), WHY, 'A title', undefined);
    assert.ok(brief.startsWith(RUN.brief));
  });
});

describe('the card a backlog node files', () => {
  test('the card back to the inbox, naming no workflow and unqueued, its labels after the edits relabel: lists, every other kept', () => {
    const labelled = { ...GIVEN, labels: { ...GIVEN.labels, 'team.example/stage': 'sprint', 'team.example/sprint': 'w48' } };
    const card = filed('card: backlog\nrelabel: [team.example/stage=backlog, ready-]', labelled);
    assert.deepEqual(
      [card.workflow, card.queued, card.labels],
      [undefined, undefined, { area: 'board', 'team.example/stage': 'backlog', 'team.example/sprint': 'w48' }],
    );
    assert.ok(card.body.startsWith(GIVEN.body));
    assert.deepEqual(card.from, ['r-door']);
  });
});

describe("the given card's files, on what a node carries on", () => {
  const files = [
    { name: 'shot.png', file: `file_${'a'.repeat(32)}` },
    { name: 'run.log', file: `file_${'b'.repeat(32)}` },
  ];
  const rows: [string, string, string, string[]][] = [
    ["brief: card, the card of the run's factory: none left off", 'workflow: quick\nbrief: card', 'mill', []],
    ['backlog, the same', 'card: backlog', 'mill', []],
    ['the default brief carries none, so leaves none off', 'workflow: quick', 'other', []],
    ['brief: card, the card of another factory: each named as left off', 'workflow: quick\nbrief: card', 'other', ['shot.png', 'run.log']],
    ['backlog, of another factory: the same', 'card: backlog', 'other', ['shot.png', 'run.log']],
  ];
  for (const [what, keys, namespace, leftOff] of rows)
    test(what, () => {
      assert.deepEqual(filesLeftOff(RUN, nodeOf('to', keys), { ...GIVEN, files, namespace }), leftOff);
    });
  test('a backlog card of the run\'s factory carries the files, the same Files', () => {
    assert.deepEqual(filed('card: backlog', { ...GIVEN, files, namespace: 'mill' } as typeof GIVEN).files, files);
  });
});
