/**
 * What a root is handed of other runs: a run read as context in its own words, labelled by whether it shipped, and a task split back
 * into its text and its `## From run` sections — pure, as data.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextSection, fromRunSection, handedParts, handedSection, type ParentCloseout } from './handed.ts';

const source = (over: Partial<Extract<ParentCloseout, { asked: string }>> = {}): ParentCloseout => ({
  run: 'cache-a1b2',
  asked: 'Cache the views between passes.',
  steps: [{ name: 'implement', unreadable: 'its task is gone' }],
  how: 'read',
  shipped: true,
  ...over,
});

test('a shipped context run is labelled shipped, worded as context and never as a wait', () => {
  const section = contextSection(source());
  assert.match(section, /^\n## From run cache-a1b2\n/);
  assert.match(section, /handed cache-a1b2 as context \(`--from`\); it did not wait on it/);
  assert.match(section, /It shipped: a person read this account/);
  assert.doesNotMatch(section, /Not shipped/);
  assert.doesNotMatch(section, /waited on/);
});

test('a context run still in flight is labelled not shipped, not judged, its change not in this workspace', () => {
  const section = contextSection(source({ shipped: false }));
  assert.match(section, /Not shipped, not judged: cache-a1b2 was still in flight/);
  assert.match(section, /Its change is not in this workspace, and nobody has judged this account\./);
  assert.doesNotMatch(section, /It shipped/);
  assert.doesNotMatch(section, /waited on/);
});

test('an unreadable context run says why, and is labelled all the same', () => {
  const section = contextSection({ run: 'gone-x9', unreadable: 'its record does not read', how: 'read', shipped: false });
  assert.match(section, /What it concluded cannot be given here — its record does not read\.\nNot shipped, not judged/);
});

test('a run waited on is handed in --after words, a run read in --from words', () => {
  assert.equal(handedSection(source({ how: 'waited' })), fromRunSection(source({ how: 'waited' })));
  assert.equal(handedSection(source()), contextSection(source()));
  assert.match(handedSection(source({ how: 'waited' })), /waited on cache-a1b2 \(`--after`\)/);
});

test("a task splits into its text and each From run section, a heading quoted inside a closeout's fence staying the fence's", () => {
  const quoting = source({ run: 'quote-c3d4', asked: 'First line.\n## From run x\nA ``` run inside.' });
  const task = ['Do the work.', contextSection(quoting), fromRunSection(source({ how: 'waited' })), '', '## Afterwards', 'Sign off.'];
  const parts = handedParts(task.join('\n'));
  assert.deepEqual(
    parts.map((p) => (p.kind === 'from' ? `from ${p.run}` : 'text')),
    ['text', 'from quote-c3d4', 'from cache-a1b2', 'text'],
  );
  const quoted = parts[1];
  assert.equal(quoted.kind === 'from' && quoted.asked, 'First line.\n## From run x\nA ``` run inside.');
  assert.equal(parts[3].kind === 'text' && parts[3].text, '## Afterwards\nSign off.');
});
