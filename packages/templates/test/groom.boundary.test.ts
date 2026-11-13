/**
 * sdlc's janitor's groom (`workflows/janitor/groom.ts`), driven as Argus's check drives it: `node groom.ts <closeout>`, in the served
 * world `cards.boundary.test.ts` files in (`janitor-world.ts`), with a scratch git repository as `WF_WORKSPACE` whose `main` is the base
 * (`WF_BASE_REF`) and a scratch `WF_ARTIFACTS`. The subject is the card really served and really written back by `nemia apply -f`: the
 * check writes the amended card and the report, changes no card, and each refusal writes nothing. A refusal is held by its exit and by
 * what it wrote, never by its words.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { SDLC } from './template.ts';
import type { TestContext } from 'node:test';
import { CLIENT, inbox, nemia, world } from './janitor-world.ts';

const SCRIPT = path.join(SDLC, 'workflows', 'janitor', 'groom.ts');

const PERIOD = { period: { from: '2026-09-15', to: '2026-09-28' }, against: { from: '2026-09-01', to: '2026-09-14' } };

/** A day well before the period, when the planted cards were filed. */
const LONG_AGO = new Date('2026-01-05T10:00:00Z');

/** Plants the card `name` in the inbox of `root`, filed `at`, in the factory acme unless `factory` is null: its path. */
function plant(root: string, name: string, body: string, at = LONG_AGO, factory: string | null = 'acme'): string {
  const dir = path.join(root, 'inbox');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.md`);
  fs.writeFileSync(file, `---\n${factory ? `factory: ${factory}\n` : ''}workflow: build\n---\n${body}`);
  fs.utimesSync(file, at, at);
  return file;
}

/** A scratch repository whose `main` holds one commit and a side branch another: the two commits. */
function repository(): { dir: string; onBase: string; aside: string } {
  const dir = scratch('nemia-groom-repo-');
  const git = (...args: string[]) => {
    const ran = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir, encoding: 'utf8', timeout: 30_000 });
    assert.equal(ran.status, 0, ran.stderr);
    return ran.stdout.trim();
  };
  git('init', '-q', '-b', 'main');
  git('commit', '-q', '--allow-empty', '-m', 'landed');
  const onBase = git('rev-parse', 'HEAD');
  git('checkout', '-q', '-b', 'side');
  git('commit', '-q', '--allow-empty', '-m', 'aside');
  const aside = git('rev-parse', 'HEAD');
  git('checkout', '-q', 'main');
  return { dir, onBase, aside };
}

/** A verdict on `card`, with `over` written over its fields. */
const verdict = (card: string, word: string, over: Record<string, unknown> = {}) => ({
  card,
  verdict: word,
  why: `why ${card}`,
  commit: '',
  by: '',
  facts: [],
  ...over,
});

/** A closeout with `fields` over the period, written to a scratch file: its path. */
function closeoutFile(fields: Record<string, unknown>): string {
  const file = path.join(scratch('nemia-groom-closeout-'), 'closeout.json');
  fs.writeFileSync(file, JSON.stringify({ outcome: 'done', summary: 's', report: '# r', cards: [], ...PERIOD, ...fields }));
  return file;
}

type Ran = { code: number | null; out: string; err: string };

/** The script run over `args` in the world `env`, in `repo`, writing under `artifacts`, bounded. */
function run(env: NodeJS.ProcessEnv, wf: string, repo: string, artifacts: string, args: string[], over: NodeJS.ProcessEnv = {}): Ran {
  const ran = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: repo,
    env: { ...env, WF_WORKSPACE: repo, WF_BASE_REF: 'main', WF_ARTIFACTS: artifacts, WF_RUN: wf, ...over },
    encoding: 'utf8',
    timeout: 120_000,
  });
  return { code: ran.status, out: ran.stdout, err: ran.stderr };
}

/** `nemia <argv>` typed by a person in the world `env`: its exit and streams. */
const typed = (env: NodeJS.ProcessEnv, argv: string[]): Ran => {
  const ran = spawnSync(process.execPath, [CLIENT, ...argv], { env, encoding: 'utf8', timeout: 120_000 });
  return { code: ran.status, out: ran.stdout, err: ran.stderr };
};

/**
 * The served world (`janitor-world.ts`) with a janitor run started in the factory acme, never ticked: the run's name, which the check
 * is handed as `WF_RUN` and reads its factory by. The workflow is a folder step and its agent a stand-in, the run's subject being its
 * namespace alone.
 */
async function groomWorld(t: TestContext): Promise<{ env: NodeJS.ProcessEnv; root: string; wf: string }> {
  const { env, root } = await world(t);
  fs.mkdirSync(path.join(root, 'workflows', 'janitor'), { recursive: true });
  fs.mkdirSync(path.join(root, 'workflows', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(root, 'workflows', 'janitor', 'argus.md'), '---\nplace: folder\n---\nRead the stats.\n');
  fs.writeFileSync(path.join(root, 'workflows', 'agents', 'scout.md'), '---\nharness: claude\n---\nYou are a scout.\n');
  nemia(env, ['factory', 'attach', 'acme', 'janitor']);
  nemia(env, ['factory', 'hire', 'acme', 'scout', '--step', 'janitor/argus']);
  nemia(env, ['start', 'Read the stats', '--workflows', 'janitor', '--factory', 'acme']);
  const listed = typed(env, ['get', 'runs', '-A', '-o', 'name']);
  const wf = listed.out.trim().replace(/^runs\//, '');
  assert.match(wf, /^[\w-]+$/, `one run is started: ${listed.out}${listed.err}`);
  return { env, root, wf };
}

/** What the check wrote under `artifacts`, each file by its path from there, with its text. */
const written = (artifacts: string): Record<string, string> =>
  Object.fromEntries(
    (fs.readdirSync(artifacts, { recursive: true }) as string[])
      .filter((f) => fs.statSync(path.join(artifacts, f)).isFile())
      .sort()
      .map((f) => [f, fs.readFileSync(path.join(artifacts, f), 'utf8')]),
  );

const STALE_BODY = 'Move the reads to src/old.ts\n\nThe verb is `wf ls`, at line 12.\n';

test('the groom writes the amended card and the report, changes no card, and the person applies the amendment by one command', async (t) => {
  const { env, root, wf } = await groomWorld(t);
  const { dir: repo, onBase } = repository();
  const artifacts = scratch('nemia-groom-artifacts-');
  plant(root, 'move-the-reads-st4l', STALE_BODY);
  plant(root, 'land-the-thing-d0n3', 'Land the thing\n');
  plant(root, 'an-old-idea-r3pl', 'An old idea\n');
  plant(root, 'still-good-st4n', 'Still good\n');
  const before = inbox(root);
  const closeout = closeoutFile({
    verdicts: [
      verdict('move-the-reads-st4l', 'stale', {
        facts: [
          { was: 'src/old.ts', now: 'src/new.ts', why: 'moved' },
          { was: '`wf ls`', now: '`nemia ls`', why: 'renamed' },
        ],
      }),
      verdict('land-the-thing-d0n3', 'done', { commit: onBase }),
      verdict('an-old-idea-r3pl', 'replaced', { by: 'the card new-idea-x1y2' }),
      verdict('still-good-st4n', 'standing'),
    ],
  });

  const ran = run(env, wf, repo, artifacts, [closeout]);
  assert.equal(ran.code, 0, ran.err);
  assert.deepEqual(inbox(root), before, 'no card is changed or removed');
  const files = written(artifacts);
  assert.deepEqual(Object.keys(files), ['groom.md', path.join('groom', 'move-the-reads-st4l.json')]);
  const amended = JSON.parse(files[path.join('groom', 'move-the-reads-st4l.json')]);
  assert.equal(amended.spec.body, 'Move the reads to src/new.ts\n\nThe verb is `nemia ls`, at line 12.', 'the body as served, amended');
  assert.equal(amended.status, undefined, 'the status is the server’s, and dropped');
  const report = files['groom.md'];
  for (const name of ['land-the-thing-d0n3', 'an-old-idea-r3pl']) {
    assert.ok(report.includes(`nemia inbox rm ${name}`), `the report says how to remove ${name}`);
    assert.ok(ran.out.includes(`nemia inbox rm ${name}`), `stdout says how to remove ${name}`);
  }
  const apply = `nemia apply -f ${path.join(artifacts, 'groom', 'move-the-reads-st4l.json')}`;
  assert.ok(report.includes(apply) && ran.out.includes(apply), 'the amendment is one command');
  assert.ok(report.includes('still-good-st4n'), 'a standing card is reported');
  assert.doesNotMatch(report, /nemia (inbox rm|apply -f \S+)still-good/);
  assert.equal(ran.out.match(/still-good-st4n/g), null, 'a standing card gets no command');

  const again = run(env, wf, repo, artifacts, [closeout]);
  assert.equal(again.code, 0, again.err);
  assert.deepEqual(written(artifacts), files, 'the check run again writes the same files');

  const applied = typed(env, ['apply', '-f', path.join(artifacts, 'groom', 'move-the-reads-st4l.json')]);
  assert.equal(applied.code, 0, applied.err);
  const card = inbox(root)['move-the-reads-st4l.md'];
  assert.ok(card.trimEnd().endsWith('Move the reads to src/new.ts\n\nThe verb is `nemia ls`, at line 12.'), card);
  assert.ok(card.includes('factory: acme') && card.includes('workflow: build'), 'its frontmatter is kept');
});

test('REFUSED: an amendment applied after the card was edited by hand exits 1 and leaves the edit', async (t) => {
  const { env, root, wf } = await groomWorld(t);
  const { dir: repo } = repository();
  const artifacts = scratch('nemia-groom-artifacts-');
  const file = plant(root, 'move-the-reads-st4l', STALE_BODY);
  const closeout = closeoutFile({
    verdicts: [verdict('move-the-reads-st4l', 'stale', { facts: [{ was: 'src/old.ts', now: 'src/new.ts', why: 'moved' }] })],
  });
  assert.equal(run(env, wf, repo, artifacts, [closeout]).code, 0);
  const edited = fs.readFileSync(file, 'utf8').replace('Move the reads', 'Move every read');
  fs.writeFileSync(file, edited);
  const applied = typed(env, ['apply', '-f', path.join(artifacts, 'groom', 'move-the-reads-st4l.json')]);
  assert.equal(applied.code, 1, `${applied.out}${applied.err}`);
  assert.equal(fs.readFileSync(file, 'utf8'), edited);
});

test('a verdict on a card no longer in play, or of another factory, is skipped; another factory’s cards and a card filed on the period’s last day may have none', async (t) => {
  const { env, root, wf } = await groomWorld(t);
  const { dir: repo } = repository();
  const artifacts = scratch('nemia-groom-artifacts-');
  plant(root, 'filed-today-n3w1', 'Filed on the last day\n', new Date('2026-09-28T12:00:00Z'));
  plant(root, 'still-good-st4n', 'Still good\n');
  plant(root, 'pipao-idea-p1p0', 'Another factory’s idea\n', LONG_AGO, 'pipao');
  plant(root, 'no-factory-d3f0', 'A card of no factory\n', LONG_AGO, null);
  const closeout = closeoutFile({
    verdicts: [
      verdict('gone-away-g0n3', 'replaced', { by: 'nothing' }),
      verdict('pipao-idea-p1p0', 'replaced', { by: 'nothing' }),
      verdict('still-good-st4n', 'standing'),
    ],
  });
  const ran = run(env, wf, repo, artifacts, [closeout]);
  assert.equal(ran.code, 0, ran.err);
  assert.ok(ran.out.includes('gone-away-g0n3') && ran.out.includes('pipao-idea-p1p0'), 'each skipped verdict is said');
  assert.ok(!ran.out.includes('nemia inbox rm'), 'nothing to remove');
});

test('REFUSED: each closeout that breaks a rule writes nothing, and changes no card', async (t) => {
  const { env, root, wf } = await groomWorld(t);
  const { dir: repo, onBase, aside } = repository();
  plant(root, 'move-the-reads-st4l', STALE_BODY);
  plant(root, 'land-the-thing-d0n3', 'Land the thing\n');
  const before = inbox(root);
  const stale = (facts: unknown[]) => verdict('move-the-reads-st4l', 'stale', { facts });
  const standing = verdict('move-the-reads-st4l', 'standing');
  const done = (commit: string) => verdict('land-the-thing-d0n3', 'done', { commit });
  const rows: Array<{ name: string; args?: string[]; verdicts?: unknown; over?: NodeJS.ProcessEnv; names?: string }> = [
    { name: 'a done card whose commit is on a side branch only', verdicts: [standing, done(aside)] },
    { name: 'a done card with no base named', verdicts: [standing, done(onBase)], over: { WF_BASE_REF: '' }, names: 'WF_BASE_REF' },
    { name: 'a replaced card with nothing replacing it', verdicts: [standing, verdict('land-the-thing-d0n3', 'replaced')] },
    { name: 'a stale card with no facts', verdicts: [stale([]), done(onBase)] },
    {
      name: 'a stale card whose fact the card lacks',
      verdicts: [stale([{ was: 'src/elsewhere.ts', now: 'src/new.ts', why: 'moved' }]), done(onBase)],
      names: 'move-the-reads-st4l',
    },
    { name: 'two verdicts on one card', verdicts: [standing, done(onBase), verdict('land-the-thing-d0n3', 'standing')] },
    { name: 'a verdict word not of the four', verdicts: [standing, verdict('land-the-thing-d0n3', 'obsolete')] },
    { name: 'a card in play before the last day with no verdict', verdicts: [standing], names: 'land-the-thing-d0n3' },
    { name: 'no closeout', args: [''], names: 'WF_CLOSEOUT' },
    { name: 'no run named, so no factory', verdicts: [standing, done(onBase)], over: { WF_RUN: '' }, names: 'WF_RUN' },
    { name: 'a closeout with no verdicts list', verdicts: undefined },
  ];
  for (const row of rows) {
    const artifacts = scratch('nemia-groom-artifacts-');
    const ran = run(env, wf, repo, artifacts, row.args ?? [closeoutFile({ verdicts: row.verdicts })], row.over);
    assert.equal(ran.code, 1, `${row.name}: ${ran.out}${ran.err}`);
    assert.doesNotMatch(ran.err, /^\s+at /m, `${row.name}: a refusal, not a crash`);
    if (row.names) assert.ok(ran.err.includes(row.names), `${row.name}: it names ${row.names}`);
    assert.deepEqual(written(artifacts), {}, `${row.name}: nothing is written`);
  }
  assert.deepEqual(inbox(root), before);
});
