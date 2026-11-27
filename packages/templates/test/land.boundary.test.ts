/**
 * sdlc's landing program (`sdlc/carried/land.ts`, the program `programs/land/program.yaml` the daemon keeps running per factory): one
 * pass (`--once`) over a fixture of the factory's unfinished runs, served by a stub `nemia` first on the PATH, against a stub `gh`
 * answering from a fixture (`test/origin.ts`), in a scratch checkout whose `origin` is a bare repository and whose runs each have a
 * branch in a worktree of its own (`test/land.ts`). Each case reads what the program wrote as the calls of `nemia condition` the stub
 * recorded, what it did to GitHub as the calls of `gh`, and what it did to the checkout as git says.
 *
 * The pure decisions are proved by `contracts/land-write.contract.ts`; here is only that the program reads them from the world and acts on
 * them: two runs landed one at a time, a head that lacks a base moved outside the derived paths merged as judged and one moved inside
 * them refused, a pull request merged by hand read as landed, a restart that lands nothing twice, a merge GitHub
 * declines, the merge's message, a landing with no remote, one a stopped program left staged, and a condition written by hand. The
 * refresh the program makes before it gives a turn is `refresh.boundary.test.ts`'s.
 *
 * Its subject is a spawned script, git and `gh`: a boundary file.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { gitIn } from './origin.ts';
import { BASE_RULE, DERIVED, type World, asked, commit, listed, pass, parents, resultOf, served, stands, world } from './land.ts';

/** The pull request's title and description, which are the merge commit's message on GitHub. */
const TITLE = { title: 'Add the thing', body: 'With its reasons, said by Grace.' };

/** `gh pr view`'s two answers: the title and body, and the checks, `ci` green. */
const VIEWS = [
  { when: 'title,body', out: JSON.stringify(TITLE) },
  { when: 'statusCheckRollup', out: JSON.stringify({ statusCheckRollup: [{ name: 'ci', status: 'COMPLETED', conclusion: 'SUCCESS' }] }) },
];

/** The refresh a fixture gives the factory: it derives the one file, and the paths it owns. */
const REFRESH = { refresh: `printf 'cut\\n' > ${DERIVED} && git add ${DERIVED}`, derives: DERIVED };

/** A served run of the world `w`, started at `at`, its land step on `land`. */
const run = (w: World, id: string, at: string, land: Parameters<typeof served>[1]['land'] = {}, github = true) =>
  served(id, { repo: w.repo, workspace: w.runs[id].run, startedAt: `2026-11-27T10:${at}:00Z`, github, land });

/** The tip of the run's branch in the checkout now. */
const tipOf = (w: World, id: string) => gitIn(w.repo, 'rev-parse', resultOf(id)).trim();

/** The merge commit GitHub would have made of `id`'s branch: made on the base here, the pull request then answered MERGED with it. */
function mergedBy(w: World, id: string) {
  gitIn(w.repo, 'merge', '-q', '--no-ff', '-m', 'Merge the pull request', w.runs[id].tip);
  return gitIn(w.repo, 'rev-parse', 'HEAD').trim();
}

/** The one write of a pass, which every case here reads. */
function only(r: ReturnType<typeof pass>) {
  assert.equal(r.code, 0, r.err);
  assert.equal(r.written.length, 1, JSON.stringify(r.written));
  return r.written[0];
}

/** The conditions of a land step served True for its try: `turn` and `ci`, the two before `landed`. */
const TURNED = { turn: { status: 'True' as const, message: 'the landing’s turn' }, ci: { status: 'True' as const, message: 'passed' } };

test('two runs are landed one at a time: the older takes the turn, the other waits behind it, and takes it once the first landed', () => {
  const w = world('derived', ['r-1', 'r-2']);
  const first = tipOf(w, 'r-1');
  const open = (id: string, number: number, head: string) => listed(id, head, 'MERGEABLE', { number });
  const pulls = (a: string, b: string) => [
    BASE_RULE,
    ...VIEWS,
    { when: 'pr list', out: JSON.stringify([open('r-1', 7, a), open('r-2', 8, b)]) },
  ];

  const one = pass([run(w, 'r-1', '00'), run(w, 'r-2', '05')], pulls(first, tipOf(w, 'r-2')), REFRESH);
  assert.equal(one.code, 0, one.err);
  assert.deepEqual(
    one.written.map((it) => [it.run, it.name, it.status]),
    [
      ['r-1', 'turn', 'True'],
      ['r-2', 'turn', 'Unknown'],
    ],
  );
  assert.ok(one.written[1].message.includes('r-1'), `r-2 says whom it waits behind:\n${one.written[1].message}`);
  const refreshed = tipOf(w, 'r-1');
  assert.notEqual(refreshed, first, 'r-1 is refreshed onto the base');
  assert.deepEqual(parents(w.repo, refreshed), [first, w.moved]);
  assert.equal(tipOf(w, 'r-2'), w.runs['r-2'].tip, 'r-2 is not touched while it waits');

  const waiting = { turn: { status: 'Unknown' as const, message: one.written[1].message } };
  const two = pass([run(w, 'r-1', '00', TURNED), run(w, 'r-2', '05', waiting)], pulls(refreshed, tipOf(w, 'r-2')), REFRESH);
  assert.deepEqual(
    two.written.map((it) => [it.run, it.name, it.status]),
    [
      ['r-1', 'landed', 'True'],
      ['r-2', 'turn', 'True'],
    ],
    two.err,
  );
  const merges = asked(two.calls, 'pr', 'merge');
  assert.equal(merges.length, 1, 'one merge');
  assert.deepEqual(merges[0].argv.slice(0, 5), ['pr', 'merge', '7', '--merge', '--match-head-commit']);
  assert.equal(merges[0].argv[5], refreshed, 'merged at the refreshed head ci judged');

  assert.notEqual(tipOf(w, 'r-2'), w.runs['r-2'].tip, 'r-2 is refreshed in the pass where r-1 landed, which frees the slot');
});

/** A refresh that derives the file as the branch has it, whatever the base's other files: a base moved elsewhere changes nothing of it. */
const STEADY = { refresh: `printf '{ "v": 1 }\\n' > ${DERIVED} && git add ${DERIVED}`, derives: DERIVED };

test('a head that lacks a base moved outside the derived paths is merged as ci judged it: the turn refreshes nothing, and landed merges', () => {
  const w = world('clean');
  const tip = w.runs['r-1'].tip;
  const rules = [BASE_RULE, ...VIEWS, { when: 'pr list', out: JSON.stringify([listed('r-1', tip)]) }];
  const turned = only(pass([run(w, 'r-1', '00')], rules, STEADY));
  assert.deepEqual([turned.name, turned.status], ['turn', 'True']);
  assert.ok(turned.message.includes('changed nothing the refresh derives'), turned.message);
  assert.equal(gitIn(w.bare, 'rev-parse', resultOf('r-1')).trim(), tip, 'nothing is pushed');

  const r = pass([run(w, 'r-1', '00', TURNED)], rules, STEADY);
  const landed = only(r);
  assert.deepEqual([landed.name, landed.status], ['landed', 'True'], landed.message);
  const merges = asked(r.calls, 'pr', 'merge');
  assert.equal(merges.length, 1);
  assert.equal(merges[0].argv[5], tip, 'merged at the head ci judged');
  assert.deepEqual(
    stands(w.runs['r-1'].run),
    { branch: resultOf('r-1'), head: tip, clean: true, merging: false },
    'the trial is taken back',
  );
});

test('REFUSED: a base that moves a derived path after the turn is not merged at the old head, and landed names the refresh', () => {
  const w = world('clean');
  const tip = w.runs['r-1'].tip;
  const rules = [BASE_RULE, ...VIEWS, { when: 'pr list', out: JSON.stringify([listed('r-1', tip)]) }];
  assert.equal(only(pass([run(w, 'r-1', '00')], rules, STEADY)).status, 'True');
  commit(w.repo, { [DERIVED]: '{ "v": 2 }\n' }, 'a landing that moves the derived file');
  gitIn(w.repo, 'push', '-q', 'origin', 'main');

  const r = pass([run(w, 'r-1', '00', TURNED)], rules, STEADY);
  const landed = only(r);
  assert.deepEqual([landed.name, landed.status], ['landed', 'False']);
  assert.ok(landed.message.includes(STEADY.refresh), `it names the refresh:\n${landed.message}`);
  assert.equal(asked(r.calls, 'pr', 'merge').length, 0, 'nothing is merged');
  assert.equal(gitIn(w.bare, 'rev-parse', resultOf('r-1')).trim(), tip, 'nothing is pushed');
  assert.deepEqual(
    stands(w.runs['r-1'].run),
    { branch: resultOf('r-1'), head: tip, clean: true, merging: false },
    'the trial is taken back',
  );
});

test('a run whose pull request a person merged by hand reads as landed, and nothing is merged', () => {
  const w = world('held');
  const oid = mergedBy(w, 'r-1');
  const merged = listed('r-1', w.runs['r-1'].tip, 'UNKNOWN', { state: 'MERGED', mergeCommit: { oid } });
  const r = pass([run(w, 'r-1', '00', TURNED)], [BASE_RULE, ...VIEWS, { when: 'pr list', out: JSON.stringify([merged]) }]);
  const landed = only(r);
  assert.deepEqual([landed.name, landed.status], ['landed', 'True']);
  assert.ok(landed.message.includes(oid.slice(0, 12)), `it names the merge commit:\n${landed.message}`);
  assert.equal(asked(r.calls, 'pr', 'merge').length, 0);
});

test('a restart lands nothing twice: the pull request the first pass merged reads as merged in the next, and a landed condition is left alone', () => {
  const w = world('held');
  const oid = mergedBy(w, 'r-1');
  const open = listed('r-1', w.runs['r-1'].tip);
  const merged = listed('r-1', w.runs['r-1'].tip, 'UNKNOWN', { state: 'MERGED', mergeCommit: { oid } });
  const rules = [BASE_RULE, ...VIEWS, { when: 'pr list', outs: [JSON.stringify([open]), JSON.stringify([merged])] }];
  const first = pass([run(w, 'r-1', '00', TURNED)], rules);
  assert.deepEqual(only(first).status, 'True');
  assert.equal(asked(first.calls, 'pr', 'merge').length, 1);
  const again = pass([run(w, 'r-1', '00', TURNED)], rules, {}, first.gh);
  assert.deepEqual(only(again).status, 'True', 'the restart reads it as landed');
  assert.equal(asked(again.calls, 'pr', 'merge').length, 1, 'one merge across both passes');

  const decided = pass([run(w, 'r-1', '00', { ...TURNED, landed: { status: 'True', message: 'by hand' } })], rules);
  assert.deepEqual([decided.written, decided.calls], [[], []], 'a condition written by hand is left alone: no write, no gh');
});

test('a merge GitHub declines writes False, naming the pull request and the retry, and lands nothing', () => {
  const w = world('held');
  const rules = [
    BASE_RULE,
    ...VIEWS,
    { when: 'pr list', out: JSON.stringify([listed('r-1', w.runs['r-1'].tip)]) },
    { when: 'pr merge', status: 1, err: 'the base branch policy prohibits the merge' },
  ];
  const r = pass([run(w, 'r-1', '00', TURNED)], rules);
  const landed = only(r);
  assert.deepEqual([landed.name, landed.status], ['landed', 'False']);
  assert.ok(landed.message.includes('#7') && landed.message.includes('nemia retry r-1 land --recheck'), landed.message);
  assert.ok(landed.message.includes('prohibits the merge'), 'GitHub’s own words are said');
});

test("the merge's message is the pull request's title and description, read as GitHub holds them", () => {
  const w = world('held');
  const rules = [BASE_RULE, ...VIEWS, { when: 'pr list', out: JSON.stringify([listed('r-1', w.runs['r-1'].tip)]) }];
  const r = pass([run(w, 'r-1', '00', TURNED)], rules);
  assert.equal(only(r).status, 'True');
  const [merge] = asked(r.calls, 'pr', 'merge');
  assert.deepEqual(merge.argv.slice(6), ['--subject', TITLE.title, '--body', TITLE.body]);
});

test('a pull request that is not the run’s own, or leaves a result branch out, is refused with False and merged by no one', () => {
  const w = world('held');
  const draft = listed('r-1', w.runs['r-1'].tip, 'MERGEABLE', { isDraft: true });
  const r = pass([run(w, 'r-1', '00', TURNED)], [BASE_RULE, ...VIEWS, { when: 'pr list', out: JSON.stringify([draft]) }]);
  assert.equal(only(r).status, 'False');
  assert.equal(asked(r.calls, 'pr', 'merge').length, 0);
});

test('with no remote, the result is merged in the checkout once the local check passes: one merge commit, the brief’s line and the commits’ subjects', () => {
  const w = world('held');
  const before = gitIn(w.repo, 'rev-parse', 'main').trim();
  const r = pass([run(w, 'r-1', '00', {}, false)], [], { github: false, localCheck: 'true' });
  const landed = only(r);
  assert.deepEqual([landed.name, landed.status], ['landed', 'True']);
  const head = gitIn(w.repo, 'rev-parse', 'main').trim();
  assert.notEqual(head, before);
  assert.deepEqual(parents(w.repo, head), [before, w.runs['r-1'].tip], 'a merge commit of the base and the result');
  assert.equal(gitIn(w.repo, 'log', '-1', '--format=%s', head).trim(), 'Add the thing', 'the subject is the brief’s first line');
  assert.equal(gitIn(w.repo, 'log', '-1', '--format=%b', head).trim(), '- work of r-1', 'the body is the result’s commit subjects');
  assert.ok(landed.message.includes(head.slice(0, 12)));
  assert.equal(r.calls.length, 0, 'no gh');
  assert.deepEqual(stands(w.repo), { branch: 'main', head, clean: true, merging: false });
  const again = pass([run(w, 'r-1', '00', {}, false)], [], { github: false, localCheck: 'true' });
  assert.equal(only(again).status, 'True', 'a second pass reads it as landed, and merges nothing');
  assert.equal(gitIn(w.repo, 'rev-parse', 'main').trim(), head);
});

test('with no remote, a local check that fails writes False, takes the merge back and leaves the base where it was', () => {
  const w = world('held');
  const before = gitIn(w.repo, 'rev-parse', 'main').trim();
  const r = pass([run(w, 'r-1', '00', {}, false)], [], { github: false, localCheck: 'echo broke the build >&2; exit 1' });
  const landed = only(r);
  assert.deepEqual([landed.name, landed.status], ['landed', 'False']);
  assert.ok(landed.message.includes('broke the build') && landed.message.includes('nemia retry r-1 land --recheck'), landed.message);
  assert.deepEqual(stands(w.repo), { branch: 'main', head: before, clean: true, merging: false });
});

test('with no remote, a conflict is taken back and written False, naming the path', () => {
  const w = world('other');
  const before = gitIn(w.repo, 'rev-parse', 'main').trim();
  const r = pass([run(w, 'r-1', '00', {}, false)], [], { github: false, localCheck: 'true' });
  const landed = only(r);
  assert.equal(landed.status, 'False');
  assert.ok(landed.message.includes('other.txt'), landed.message);
  assert.deepEqual(stands(w.repo), { branch: 'main', head: before, clean: true, merging: false });
});

test('with no remote, a merge a stopped program left staged is taken back, written of nothing, and landed on the next pass', () => {
  const w = world('held');
  const before = gitIn(w.repo, 'rev-parse', 'main').trim();
  gitIn(w.repo, 'merge', '-q', '--no-ff', '--no-commit', w.runs['r-1'].tip);
  assert.equal(stands(w.repo).merging, true);
  const one = pass([run(w, 'r-1', '00', {}, false)], [], { github: false, localCheck: 'true' });
  assert.deepEqual(one.written, [], one.err);
  assert.deepEqual(stands(w.repo), { branch: 'main', head: before, clean: true, merging: false }, 'taken back, never committed unjudged');
  const two = pass([run(w, 'r-1', '00', {}, false)], [], { github: false, localCheck: 'true' });
  assert.equal(only(two).status, 'True');
});

test('with no remote, a checkout that is a person’s is waited on and left as it is: another merge in progress, or another branch', () => {
  const w = world('held');
  gitIn(w.repo, 'switch', '-q', '-c', 'other', 'main');
  commit(w.repo, { 'o.txt': 'o\n' }, 'other work');
  gitIn(w.repo, 'switch', '-q', 'main');
  gitIn(w.repo, 'merge', '-q', '--no-ff', '--no-commit', 'other');
  const r = pass([run(w, 'r-1', '00', {}, false)], [], { github: false, localCheck: 'true' });
  const waiting = only(r);
  assert.equal(waiting.status, 'Unknown');
  assert.equal(stands(w.repo).merging, true, "the person's merge is left as it is");
  gitIn(w.repo, 'merge', '--abort');
  gitIn(w.repo, 'switch', '-q', 'other');
  const moved = pass([run(w, 'r-1', '00', {}, false)], [], { github: false, localCheck: 'true' });
  assert.equal(only(moved).status, 'Unknown');
  assert.equal(stands(w.repo).branch, 'other');
});

test('a run whose land step has not reached the condition is left alone, and a program that cannot read the runs says so', () => {
  const w = world('held');
  const notDue = run(w, 'r-1', '00', { turn: { status: 'Unknown' } });
  notDue.status.steps[1].status = 'queued';
  const r = pass([notDue], [BASE_RULE, { when: 'pr list', out: '[]' }]);
  assert.deepEqual([r.written, r.calls], [[], []]);

  const unread = pass([], [], { unreadable: true });
  assert.equal(unread.code, 0, 'a pass that cannot read the runs does not stop the program');
  assert.ok(unread.err.includes('nemia land:'), unread.err);
  assert.deepEqual(unread.written, []);
});
