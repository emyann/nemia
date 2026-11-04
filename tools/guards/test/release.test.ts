/**
 * The release tool's rules (`tools/release/release.ts`), as data: which tags are releases, the bump a set of labels gives, the next
 * version with its floor, and the `release-label` check's verdict through `main`. Nothing here spawns: `release.boundary.test.ts` runs
 * the verbs that read git and GitHub on a scratch repository and a stub `gh`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bump, FIRST, LABELS, main, nextVersion, releaseTag } from '../../release/release.ts';

test('a release is a tag v<x.y.z> and nothing else: the legacy tag and the local nemia-* tags are never read as one', () => {
  assert.equal(releaseTag('v0.3.0'), '0.3.0');
  assert.equal(releaseTag('v1.0.0'), '1.0.0');
  for (const tag of ['v1-final', 'legacy/v1-final', 'nemia-2026.11.03', 'nemia-2026.11.03.2', 'v1.2', 'v1.2.3-rc.1', 'xv1.2.3'])
    assert.equal(releaseTag(tag), undefined, `${tag} is no release`);
});

test('the bump is the highest a label gives: breaking a major, feature a minor, fix and docs a patch, internal and none nothing', () => {
  assert.equal(bump(['internal']), 'none');
  assert.equal(bump(['fix', 'docs']), 'patch');
  assert.equal(bump(['feature', 'fix']), 'minor');
  assert.equal(bump(['breaking']), 'major');
  assert.equal(bump(['breaking', 'internal', 'docs']), 'major');
  assert.equal(bump([]), 'none', 'an unlabelled pull request counts for no bump');
  assert.equal(bump(['dependencies']), 'none', 'a label of no release counts for none');
});

test('the next version bumps the last release and is never below FIRST', () => {
  assert.equal(FIRST, '1.0.0');
  assert.equal(nextVersion('0.3.0', 'patch'), '1.0.0', 'the floor lifts a patch of 0.3.0');
  assert.equal(nextVersion('0.3.0', 'minor'), '1.0.0', 'the floor lifts a minor of 0.3.0');
  assert.equal(nextVersion('1.0.0', 'patch'), '1.0.1');
  assert.equal(nextVersion('1.0.0', 'minor'), '1.1.0');
  assert.equal(nextVersion('1.2.3', 'major'), '2.0.0');
  assert.equal(nextVersion('1.0.0', 'none'), undefined, 'nothing released, no version');
  assert.equal(nextVersion(undefined, 'patch'), FIRST, 'no release yet: the first');
});

test('the labels are five, in their order, each with its bump, a colour and a description', () => {
  assert.deepEqual(
    LABELS.map((label) => [label.name, label.bump]),
    [
      ['breaking', 'major'],
      ['feature', 'minor'],
      ['fix', 'patch'],
      ['docs', 'patch'],
      ['internal', 'none'],
    ],
  );
  for (const label of LABELS) {
    assert.match(label.color, /^[0-9a-f]{6}$/, `${label.name}'s colour is six hex digits, as GitHub takes it`);
    assert.ok(label.description.length > 0 && label.description.length <= 100, `${label.name}'s description fits GitHub's 100`);
  }
});

/** `release.ts check` on `labels`, as the pull_request event hands them: its exit code and what it said. */
const check = async (labels: unknown): Promise<{ code: number; said: string }> => {
  const lines: string[] = [];
  const code = await main(['check'], { LABELS: JSON.stringify(labels), PR_NUMBER: '7' }, (line) => lines.push(line));
  return { code, said: lines.join('\n') };
};

test('REFUSED: a pull request with no release label, or with two, naming the five and how to add one', async () => {
  for (const labels of [[], ['fix', 'feature'], ['dependencies']]) {
    const { code, said } = await check(labels);
    assert.equal(code, 1, `${JSON.stringify(labels)} is refused`);
    for (const label of LABELS) assert.ok(said.includes(label.name), `the refusal names ${label.name}`);
    assert.ok(said.includes('issues/7/labels'), 'the refusal says how to add one to this pull request');
  }
  assert.equal((await check(['fix'])).code, 0);
  assert.equal((await check(['fix', 'dependencies'])).code, 0, 'a label of no release beside one is no second');
  assert.equal(await main(['check'], { LABELS: '{' }, () => {}), 1, 'labels that are no JSON array are refused');
  assert.equal(await main(['check'], {}, () => {}), 1, 'neither LABELS nor PR_NUMBER: refused, naming both');
});

test('REFUSED: a verb the tool does not have', async () => {
  assert.equal(await main(['publish'], {}, () => {}), 2);
  assert.equal(await main(['proof'], {}, () => {}), 2, 'the proof is gone: the release dispatches nothing to prove');
  assert.equal(await main([], {}, () => {}), 2);
});
