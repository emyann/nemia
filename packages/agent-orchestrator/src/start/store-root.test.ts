/**
 * The store's refusal of a root its steps' permission rules cannot carry (`storeRootRefusal`): asked of each local step whose first filing
 * names a folder under the store in a rule, by the character its harness's rules cannot carry, and in the store's words.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import type { Workflow } from '../step/step.ts';
import { storeRootRefusal } from './store-root.ts';

const IMPLEMENT = { name: 'implement', after: [] } as unknown as Workflow;
const SHIP = { name: 'ship', after: ['implement'], workspace: 'main' } as unknown as Workflow;
const LONE_SHIP = { name: 'ship', after: [], workspace: 'main' } as unknown as Workflow;
const REVIEW = { name: 'review', after: ['implement'] } as unknown as Workflow;
const TRIAGE = { name: 'triage', after: [], reads: ['inbox'] } as unknown as Workflow;

/** The refusal of `steps` in a store at `root`, its run's artifacts folder and inbox under it. */
const refusal = (root: string, steps: readonly Workflow[]) =>
  storeRootRefusal(root, steps, { runArtifacts: path.join(root, 'runs', 'r', 'artifacts'), inbox: path.join(root, 'inbox') });

test("REFUSED: a `(` in the root, under an ending after a step, in the store's words naming WF_ROOT, its value, the `(` and the fix", () => {
  const why = refusal('/srv/my wf (old)', [IMPLEMENT, SHIP]);
  assert.equal(
    why,
    `ship: its harness would be given a read of its run's artifacts folder by a permission rule naming a path under the store, ` +
      `WF_ROOT=/srv/my wf (old) (~/.agent-workflows when WF_ROOT is unset), and such a rule cannot carry the "(" in it: it would name another folder, or none.\n` +
      `Set WF_ROOT to a directory whose path holds only letters, digits, \`-\`, \`_\`, \`.\` and \`/\`, like WF_ROOT=/srv/wf, and move the store's folder there first to keep its runs.`,
  );
  assert.doesNotMatch(why ?? '', /is not a list of permission rules|Mount a folder/);
});

test("REFUSED: a lone ending is given a read of its run's artifacts, a step after another their folders, and one that reads the inbox the inbox", () => {
  assert.match(refusal('/srv/wf*', [LONE_SHIP]) ?? '', /^ship: its harness would be given a read of its run's artifacts folder by/);
  assert.match(
    refusal('/srv/wf?', [IMPLEMENT, REVIEW]) ?? '',
    /^review: its harness would be given the artifacts folders of the steps before it by/,
  );
  assert.match(refusal('/srv/wf[1]', [TRIAGE]) ?? '', /^triage: its harness would be given the inbox by .* cannot carry the "\[" in it/);
});

test('a root every rule carries, a space, a comma and braces in it, starts the same steps', () => {
  assert.equal(refusal('/srv/my wf,{a}', [IMPLEMENT, SHIP, TRIAGE]), undefined);
});

test('a step whose filing names nothing under the store in a rule is let through, whatever the root: alone, on codex, on a remote agent', () => {
  assert.equal(refusal('/srv/wf*', [IMPLEMENT]), undefined);
  assert.equal(refusal('/srv/wf*', [{ ...LONE_SHIP, harness: 'codex' }]), undefined);
  assert.equal(refusal('/srv/wf*', [IMPLEMENT, { ...SHIP, harness: 'codex' }, { ...TRIAGE, harness: 'a2a:x' }]), undefined);
});
