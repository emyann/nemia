/**
 * The card a node files, by its `card:` (`sentCardText`), read back as the inbox reads it: a routed card titled and labelled by the run,
 * a given card the run's own card as it was given — its body and its labels — with why it was routed and the producer's reason, and a
 * backlog card the run's card filed back naming no workflow, unqueued, without the label keys its `unlabel:` names.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import type { Run } from '../record/record.ts';
import { parseWorkflow } from '../workflow/step-file.ts';
import { parseInboxCard } from '../inbox/inbox.ts';
import { sentCardText } from './send.verb.ts';

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
const AT = '2026-11-19T10:00:00.000Z';
const WHY = { condition: 'door', route: 'quick', reason: 'It settles its change.' };
const GIVEN = { body: 'Make the list sort by name.', labels: { ready: 'yes', area: 'board' } };

/** The node `name` after the condition, its frontmatter `keys`. */
const nodeOf = (name: string, keys: string) => parseWorkflow(name, `---\nplace: git\nafter: door\n${keys}\n---\nfile it\n`);

/** The card `node` files, read back as the inbox reads it. */
const filed = (keys: string, given = GIVEN) =>
  parseInboxCard('sent.md', sentCardText(RUN, nodeOf('to', keys), WHY, AT, 'A title', { team: 'core' }, given));

describe('what card a node files, by its card:', () => {
  test('routed, the default: titled and labelled by the run, queued on its workflow, with no reason', () => {
    const card = filed('workflow: quick');
    assert.deepEqual([card.workflow, card.queued, card.labels, card.from], ['quick', AT, { team: 'core' }, ['r-door']]);
    assert.ok(card.body.startsWith('A title'));
    assert.ok(!card.body.includes(WHY.reason));
  });
  test("given: the run's own card, its body and labels, queued on the node's workflow, with the producer's reason", () => {
    const card = filed('workflow: quick\ncard: given');
    assert.deepEqual([card.workflow, card.queued, card.labels, card.factory], ['quick', AT, GIVEN.labels, 'mill']);
    assert.ok(card.body.startsWith(GIVEN.body));
    assert.ok(card.body.includes(WHY.reason));
  });
  test("given, with no card the run was started from: the run's brief, the run's labels", () => {
    const text = sentCardText(RUN, nodeOf('to', 'workflow: quick\ncard: given'), WHY, AT, 'A title', { team: 'core' }, undefined);
    const card = parseInboxCard('sent.md', text);
    assert.ok(card.body.startsWith(RUN.brief));
    assert.deepEqual(card.labels, { team: 'core' });
  });
  test('backlog: the card back to the inbox, naming no workflow and unqueued, without the label keys unlabel: names', () => {
    const card = filed('card: backlog\nunlabel: [ready]');
    assert.deepEqual([card.workflow, card.queued, card.labels], [undefined, undefined, { area: 'board' }]);
    assert.ok(card.body.startsWith(GIVEN.body));
  });
});
