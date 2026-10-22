/**
 * The janitor's filing script (`workflows/janitor/cards.ts`), driven as Argus's check drives it: `node cards.ts <closeout>`, in the
 * repository, with a scratch store as `WF_ROOT`, a bounded subprocess. It files each card through `wf inbox add`, ready to start, never a
 * card whose title the inbox already has, and starts nothing; each refusal has a fixture that breaks its rule, and files nothing at all.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './workspaces.ts';
import { scratch } from './scratch.ts';

const SCRIPT = path.join(REPO, 'workflows', 'janitor', 'cards.ts');

/** A card as Argus's closeout declares it, ready to start on `repo`, with `over` written over its fields. */
const card = (title: string, repo: string, over: Record<string, string> = {}) => ({
  title,
  kind: 'fence',
  correction: 'Allow Bash(npx turbo run typecheck --force) in agora.md',
  evidence: 'review: 12 refused calls of Bash(npx) against 3',
  agent: 'agora',
  factory: 'nemia',
  workflow: 'build',
  repo,
  ...over,
});

const PERIOD = { period: { from: '2026-09-15', to: '2026-09-28' }, against: { from: '2026-09-01', to: '2026-09-14' } };

/** A closeout as the check is handed it (`WF_CLOSEOUT`), written to a scratch file: its path. */
function closeoutFile(fields: Record<string, unknown>): string {
  const file = path.join(scratch('wf-janitor-closeout-'), 'closeout.json');
  fs.writeFileSync(file, JSON.stringify({ outcome: 'done', summary: 's', artifacts: [], report: '# r', ...PERIOD, ...fields }));
  return file;
}

/** A scratch store and a scratch repository a card may name. */
function world(): { root: string; repo: string } {
  return { root: scratch('wf-janitor-store-'), repo: scratch('wf-janitor-repo-') };
}

/** The inbox's cards in `root`, by file name, with their text. */
const inbox = (root: string): Record<string, string> => {
  const dir = path.join(root, 'inbox');
  if (!fs.existsSync(dir)) return {};
  return Object.fromEntries(
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]),
  );
};

/** Run the script over the closeout `args` names (none when absent) against the store `root`, bounded; its exit and streams. */
function run(root: string, args: string[]): { code: number | null; out: string; err: string } {
  const tmp = scratch('wf-janitor-tmp-');
  const env: NodeJS.ProcessEnv = { ...process.env, WF_ROOT: root, WF_WORKSPACE: REPO, WF_RUN: 'read-the-stats-ab12', TMPDIR: tmp };
  delete env.NODE_TEST_CONTEXT;
  const ran = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: REPO, env, encoding: 'utf8', timeout: 120_000 });
  assert.deepEqual(
    fs.readdirSync(tmp).filter((f) => f.startsWith('wf-janitor-')),
    [],
    'the cards written for wf inbox add are gone',
  );
  return { code: ran.status, out: ran.stdout, err: ran.stderr };
}

test('each card is filed through wf inbox add, ready to start, with its numbers, and nothing is started or queued', () => {
  const { root, repo } = world();
  const first = card('Allow agora the typecheck it runs', repo);
  const second = card('Send seldon’s reads to Grep', repo, { kind: 'skill', agent: 'seldon', factory: 'pipao', workflow: 'intake' });
  const ran = run(root, [closeoutFile({ cards: [first, second] })]);
  assert.equal(ran.code, 0, ran.err);
  const cards = Object.values(inbox(root));
  assert.equal(cards.length, 2);
  for (const [given, text] of [first, second].map((c) => [c, cards.find((t) => t.includes(c.title))!] as const)) {
    assert.ok(text, `${given.title} is filed`);
    assert.match(text, new RegExp(`^repo: ${repo}$`, 'm'));
    assert.match(text, new RegExp(`^workflow: ${given.workflow}$`, 'm'));
    assert.match(text, new RegExp(`^factory: ${given.factory}$`, 'm'));
    assert.match(text, /^---\n[\s\S]*?\n---\n/);
    assert.equal(
      text
        .replace(/^---\n[\s\S]*?\n---\n/, '')
        .trim()
        .split('\n')[0],
      given.title,
      'its first line is its title',
    );
    assert.ok(text.includes(given.correction) && text.includes(`(${given.kind})`), 'the correction and its kind');
    assert.ok(text.includes(given.evidence) && text.includes('2026-09-15 to 2026-09-28') && text.includes('2026-09-01 to 2026-09-14'));
    assert.ok(text.includes('Filed by Argus in run read-the-stats-ab12'));
    assert.doesNotMatch(text, /^queued:/m);
  }
  assert.match(ran.out, /filed .*Allow agora the typecheck it runs/);
  assert.deepEqual(fs.existsSync(path.join(root, 'runs')) ? fs.readdirSync(path.join(root, 'runs')) : [], [], 'no run started');
});

test('REFUSED: a card whose title the inbox has, in other case and spacing, is not filed again, and a second check files nothing', () => {
  const { root, repo } = world();
  fs.mkdirSync(path.join(root, 'inbox'));
  fs.writeFileSync(
    path.join(root, 'inbox', 'allow-agora-the-typec-k2q9.md'),
    `---\nrepo: ${repo}\n---\n#  ALLOW agora   the Typecheck it runs\n\nfiled by hand\n`,
  );
  const closeout = closeoutFile({ cards: [card('Allow agora the typecheck it runs', repo), card('Keep git push refused', repo)] });
  const ran = run(root, [closeout]);
  assert.equal(ran.code, 0, ran.err);
  assert.equal(Object.keys(inbox(root)).length, 2, 'only the new card is filed');
  assert.match(ran.out, /already in the inbox: Allow agora the typecheck it runs/);
  const before = inbox(root);
  const again = run(root, [closeout]);
  assert.equal(again.code, 0, again.err);
  assert.deepEqual(inbox(root), before, 'the check run again files nothing');
  assert.match(again.out, /already in the inbox: Keep git push refused/);
});

for (const key of ['factory', 'workflow', 'repo'])
  test(`REFUSED: a card with no ${key} is not ready to start, and nothing is filed, not even the card beside it`, () => {
    const { root, repo } = world();
    const ran = run(root, [closeoutFile({ cards: [card('A ready card', repo), card('A card half said', repo, { [key]: ' ' })] })]);
    assert.equal(ran.code, 1);
    assert.match(ran.err, new RegExp(`"A card half said" names no ${key}`));
    assert.deepEqual(inbox(root), {});
  });

test('REFUSED: a card whose title is more than one line, or empty, files nothing, not even the card beside it', () => {
  const { root, repo } = world();
  const twoLines = run(root, [closeoutFile({ cards: [card('A ready card', repo), card('Allow agora\nthe typecheck it runs', repo)] })]);
  assert.equal(twoLines.code, 1);
  assert.ok(twoLines.err.includes('card #2: its title is one line'), twoLines.err);
  assert.ok(twoLines.err.includes('empty or more than one'), twoLines.err);
  const empty = run(root, [closeoutFile({ cards: [card('A ready card', repo), card('  ', repo)] })]);
  assert.equal(empty.code, 1);
  assert.match(empty.err, /card #2: its title is one line/);
  assert.deepEqual(inbox(root), {});
});

test('REFUSED: a card of a kind that is not fence, body, skill or on-purpose files nothing, not even the card beside it', () => {
  const { root, repo } = world();
  const ran = run(root, [closeoutFile({ cards: [card('A ready card', repo), card('Deny agora the push', repo, { kind: 'deny' })] })]);
  assert.equal(ran.code, 1);
  assert.ok(ran.err.includes('card #2: its kind is "deny"'), ran.err);
  assert.ok(ran.err.includes('fence, body, skill, on-purpose'), 'and names the kinds it takes');
  assert.deepEqual(inbox(root), {});
});

test('REFUSED: an inbox card whose file starts with a byte order mark still reads its title, so it is not filed again', () => {
  const { root, repo } = world();
  fs.mkdirSync(path.join(root, 'inbox'));
  const bom = String.fromCharCode(0xfeff);
  fs.writeFileSync(path.join(root, 'inbox', 'keep-git-push-refu-b0m1.md'), `${bom}---\nrepo: ${repo}\n---\nKeep git push refused\n`);
  const ran = run(root, [closeoutFile({ cards: [card('Keep git push refused', repo)] })]);
  assert.equal(ran.code, 0, ran.err);
  assert.match(ran.out, /already in the inbox: Keep git push refused/);
  assert.deepEqual(Object.keys(inbox(root)), ['keep-git-push-refu-b0m1.md']);
});

test('REFUSED: a card whose repository is not an absolute path files nothing', () => {
  const { root, repo } = world();
  const ran = run(root, [closeoutFile({ cards: [card('A ready card', repo), card('A card on a relative path', 'packages')] })]);
  assert.equal(ran.code, 1);
  assert.ok(ran.err.includes('"A card on a relative path": its repo "packages"'), ran.err);
  assert.ok(ran.err.includes('is not an absolute path'), ran.err);
  assert.ok(ran.err.includes('from the root'), 'and names the fix');
  assert.deepEqual(inbox(root), {});
});

test('REFUSED: a card wf inbox add refuses fails the check, naming it, and the cards before it stay filed for the next check', () => {
  const { root, repo } = world();
  const gone = path.join(repo, 'gone');
  const ran = run(root, [closeoutFile({ cards: [card('A ready card', repo), card('A card on no repository', gone)] })]);
  assert.equal(ran.code, 1);
  assert.match(ran.err, /card #2, "A card on no repository": wf inbox add failed/);
  assert.deepEqual(
    Object.values(inbox(root)).map((text) => text.includes('A ready card')),
    [true],
  );
});

test('REFUSED: two cards with the same title, in other case and spacing, file nothing', () => {
  const { root, repo } = world();
  const ran = run(root, [closeoutFile({ cards: [card('Keep git push refused', repo), card('keep  GIT push refused', repo)] })]);
  assert.equal(ran.code, 1);
  assert.match(ran.err, /two cards are titled "keep git push refused"/);
  assert.deepEqual(inbox(root), {});
});

test('REFUSED: a period compared with that is not as long as the period read, or does not end the day before it, files nothing', () => {
  const { root, repo } = world();
  const cards = [card('Keep git push refused', repo)];
  const shorter = run(root, [closeoutFile({ cards, against: { from: '2026-09-02', to: '2026-09-14' } })]);
  assert.equal(shorter.code, 1);
  assert.match(shorter.err, /against, .* is 13 days, and the period 14/);
  const apart = run(root, [closeoutFile({ cards, against: { from: '2026-08-31', to: '2026-09-13' } })]);
  assert.equal(apart.code, 1);
  assert.ok(apart.err.includes('against ends 2026-09-13, not 2026-09-14'), apart.err);
  assert.ok(apart.err.includes('compare the days just before it'), 'and names the fix');
  const backwards = run(root, [closeoutFile({ cards, period: { from: '2026-09-28', to: '2026-09-15' } })]);
  assert.equal(backwards.code, 1);
  assert.match(backwards.err, /period ends before it starts/);
  assert.deepEqual(inbox(root), {});
});

test('REFUSED: no closeout, or one that is not there, files nothing and names the fix', () => {
  const { root } = world();
  const none = run(root, ['']);
  assert.equal(none.code, 1);
  assert.match(none.err, /no closeout reached the check: WF_CLOSEOUT is empty/);
  const gone = run(root, [path.join(root, 'gone.json')]);
  assert.equal(gone.code, 1);
  assert.ok(gone.err.includes('no closeout reached the check: '), gone.err);
  assert.ok(gone.err.includes(path.join(root, 'gone.json')), gone.err);
  assert.ok(gone.err.includes('does not read as JSON'), gone.err);
  assert.deepEqual(inbox(root), {});
});
