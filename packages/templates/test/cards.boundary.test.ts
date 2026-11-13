/**
 * sdlc's janitor's filing script (`workflows/janitor/cards.ts`), driven as Argus's check drives it: `node cards.ts <closeout>`, with a
 * scratch store as `WF_ROOT`, a bounded subprocess, and `nemia` on the PATH as a factory has it: the client (`apps/cli`), asking the
 * api served on the scratch store, in whose factories each card is filed, since the subject is the card really filed in the inbox. It
 * files each card through `nemia inbox add`, ready to start, never a card whose title the inbox already has, and starts nothing; each
 * refusal has a fixture that breaks its rule, and files nothing at all. A refusal is held by its exit and by what it filed, never by its
 * words.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { SDLC } from './template.ts';
import { inbox, world } from './janitor-world.ts';

const SCRIPT = path.join(SDLC, 'workflows', 'janitor', 'cards.ts');

/** A card as Argus's closeout declares it, ready to start, with `over` written over its fields. */
const card = (title: string, over: Record<string, string> = {}) => ({
  title,
  kind: 'fence',
  correction: 'Allow Bash(git log:*) in agora',
  evidence: 'review: 12 refused calls of Bash(git log) against 3',
  agent: 'agora',
  factory: 'acme',
  workflow: 'build',
  ...over,
});

const PERIOD = { period: { from: '2026-09-15', to: '2026-09-28' }, against: { from: '2026-09-01', to: '2026-09-14' } };

/** A closeout as the check is handed it (`WF_CLOSEOUT`), written to a scratch file: its path. */
function closeoutFile(fields: Record<string, unknown>): string {
  const file = path.join(scratch('nemia-janitor-closeout-'), 'closeout.json');
  fs.writeFileSync(file, JSON.stringify({ outcome: 'done', summary: 's', artifacts: [], report: '# r', ...PERIOD, ...fields }));
  return file;
}

/** Run the script over the closeout `args` names in the world `env`, bounded; its exit and streams. */
function run(env: NodeJS.ProcessEnv, args: string[]): { code: number | null; out: string; err: string } {
  const tmp = scratch('nemia-janitor-tmp-');
  const cwd = path.dirname(env.HOME!);
  const ran = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    env: { ...env, WF_WORKSPACE: cwd, WF_RUN: 'read-the-stats-ab12', TMPDIR: tmp },
    encoding: 'utf8',
    timeout: 120_000,
  });
  assert.deepEqual(
    fs.readdirSync(tmp).filter((f) => f.startsWith('nemia-janitor-')),
    [],
    'the cards written for nemia inbox add are gone',
  );
  return { code: ran.status, out: ran.stdout, err: ran.stderr };
}

test('each card is filed through nemia inbox add, ready to start, with its numbers, and nothing is started or queued', async (t) => {
  const { env, root } = await world(t);
  const first = card('Allow agora the log it reads');
  const second = card('Send seldon’s reads to Grep', { kind: 'skill', agent: 'seldon', factory: 'pipao', workflow: 'intake' });
  const ran = run(env, [closeoutFile({ cards: [first, second] })]);
  assert.equal(ran.code, 0, ran.err);
  const cards = Object.values(inbox(root));
  assert.equal(cards.length, 2);
  for (const [given, text] of [first, second].map((c) => [c, cards.find((t) => t.includes(c.title))] as const)) {
    assert.ok(text, `${given.title} is filed`);
    assert.doesNotMatch(text, /^repo:/m, 'a card names no repository');
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
    assert.ok(text.includes('read-the-stats-ab12'), 'the run that filed it');
    assert.doesNotMatch(text, /^queued:/m);
  }
  assert.ok(ran.out.includes('Allow agora the log it reads'), ran.out);
  assert.deepEqual(fs.existsSync(path.join(root, 'runs')) ? fs.readdirSync(path.join(root, 'runs')) : [], [], 'no run started');
});

test('REFUSED: a card whose title the inbox has, in other case and spacing, is not filed again, and a second check files nothing', async (t) => {
  const { env, root } = await world(t);
  fs.mkdirSync(path.join(root, 'inbox'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'inbox', 'allow-agora-the-log-k2q9.md'),
    `---\nfactory: acme\n---\n#  ALLOW agora   the Log it reads\n\nfiled by hand\n`,
  );
  const closeout = closeoutFile({ cards: [card('Allow agora the log it reads'), card('Keep git push refused')] });
  const ran = run(env, [closeout]);
  assert.equal(ran.code, 0, ran.err);
  assert.equal(Object.keys(inbox(root)).length, 2, 'only the new card is filed');
  const before = inbox(root);
  const again = run(env, [closeout]);
  assert.equal(again.code, 0, again.err);
  assert.deepEqual(inbox(root), before, 'the check run again files nothing');
});

for (const key of ['factory', 'workflow'])
  test(`REFUSED: a card with no ${key} is not ready to start, and nothing is filed, not even the card beside it`, async (t) => {
    const { env, root } = await world(t);
    const ran = run(env, [closeoutFile({ cards: [card('A ready card'), card('A card half said', { [key]: ' ' })] })]);
    assert.equal(ran.code, 1);
    assert.ok(ran.err.includes(key), 'it names the field');
    assert.deepEqual(inbox(root), {});
  });

test('REFUSED: a card whose title is more than one line, or empty, files nothing, not even the card beside it', async (t) => {
  const { env, root } = await world(t);
  const twoLines = run(env, [closeoutFile({ cards: [card('A ready card'), card('Allow agora\nthe log it reads')] })]);
  assert.equal(twoLines.code, 1);
  assert.ok(twoLines.err.includes('#2'), 'it names the card');
  const empty = run(env, [closeoutFile({ cards: [card('A ready card'), card('  ')] })]);
  assert.equal(empty.code, 1);
  assert.deepEqual(inbox(root), {});
});

test('REFUSED: a card of a kind that is not fence, body, skill or on-purpose files nothing, not even the card beside it', async (t) => {
  const { env, root } = await world(t);
  const ran = run(env, [closeoutFile({ cards: [card('A ready card'), card('Deny agora the push', { kind: 'deny' })] })]);
  assert.equal(ran.code, 1);
  for (const kind of ['fence', 'body', 'skill', 'on-purpose']) assert.ok(ran.err.includes(kind), `it names the kind ${kind}`);
  assert.deepEqual(inbox(root), {});
});

test('REFUSED: an inbox card whose file starts with a byte order mark still reads its title, so it is not filed again', async (t) => {
  const { env, root } = await world(t);
  fs.mkdirSync(path.join(root, 'inbox'), { recursive: true });
  const bom = String.fromCharCode(0xfeff);
  fs.writeFileSync(path.join(root, 'inbox', 'keep-git-push-refu-b0m1.md'), `${bom}---\nfactory: acme\n---\nKeep git push refused\n`);
  const ran = run(env, [closeoutFile({ cards: [card('Keep git push refused')] })]);
  assert.equal(ran.code, 0, ran.err);
  assert.deepEqual(Object.keys(inbox(root)), ['keep-git-push-refu-b0m1.md']);
});

test('REFUSED: a card nemia inbox add refuses fails the check, and the cards before it stay filed for the next check', async (t) => {
  const { env, root } = await world(t);
  const ran = run(env, [closeoutFile({ cards: [card('A ready card'), card('A card on a workflow path', { workflow: 'flows/build' })] })]);
  assert.equal(ran.code, 1);
  assert.ok(ran.err.includes('#2'), 'it names the card');
  assert.deepEqual(
    Object.values(inbox(root)).map((text) => text.includes('A ready card')),
    [true],
  );
});

test('REFUSED: two cards with the same title, in other case and spacing, file nothing', async (t) => {
  const { env, root } = await world(t);
  const ran = run(env, [closeoutFile({ cards: [card('Keep git push refused'), card('keep  GIT push refused')] })]);
  assert.equal(ran.code, 1);
  assert.deepEqual(inbox(root), {});
});

test('REFUSED: a period compared with that is not as long as the period read, or does not end the day before it, files nothing', async (t) => {
  const { env, root } = await world(t);
  const cards = [card('Keep git push refused')];
  const shorter = run(env, [closeoutFile({ cards, against: { from: '2026-09-02', to: '2026-09-14' } })]);
  assert.equal(shorter.code, 1);
  const apart = run(env, [closeoutFile({ cards, against: { from: '2026-08-31', to: '2026-09-13' } })]);
  assert.equal(apart.code, 1);
  assert.ok(apart.err.includes('2026-09-14'), 'it names the day it should end');
  const backwards = run(env, [closeoutFile({ cards, period: { from: '2026-09-28', to: '2026-09-15' } })]);
  assert.equal(backwards.code, 1);
  assert.deepEqual(inbox(root), {});
});

test('REFUSED: no closeout, or one that is not there, files nothing and names it', async (t) => {
  const { env, root } = await world(t);
  const none = run(env, ['']);
  assert.equal(none.code, 1);
  assert.ok(none.err.includes('WF_CLOSEOUT'), 'it names where the closeout comes from');
  const gone = run(env, [path.join(root, 'gone.json')]);
  assert.equal(gone.code, 1);
  assert.ok(gone.err.includes(path.join(root, 'gone.json')), gone.err);
  assert.deepEqual(inbox(root), {});
});
