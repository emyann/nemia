/**
 * The trust of a factory's places, at each verb that asks it, told as one story (`story`): `nemia factory add` and `nemia factory
 * trust` typed on a repository, a plain folder and a workspace cut from a repository, each leaving the harness's one key on the folder
 * the harness keeps it under, in a harness file of the test's own; `--no-trust` and a place already trusted writing nothing; the
 * listing saying a place that is not trusted, and nothing once it is; and where nothing is trusted: no factory, a place that does not
 * answer, a harness file that does not read. Each checkpoint opens on a harness file and a store of factories of its own (`anew`).
 * `WF_ROOT` is set before the import, since the store's modules read it as they load.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest } from '../../test/placed.ts';
import { placeOver, unreadBy } from '../../test/place-over.ts';
import { scratch } from '../../test/scratch.ts';
import { heldUnasked } from '../../test/unasked.ts';
import { story } from '../../test/story.ts';

const ROOT = scratch('wf-trust-');
process.env.WF_ROOT = ROOT;
const { main: cli } = await import('../cli/main.ts');
const { engineOf } = await import('../runtime-client.ts');
const { readFactories } = await import('../factory/factory.store.ts');
const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
heldUnasked(engine);

/** The harness's own file, in a folder each checkpoint is given anew. */
let file = '';
/** A harness file of its own, not there yet, and a store with no factory. */
function anew(): void {
  process.env.CLAUDE_CONFIG_DIR = scratch('wf-trust-harness-');
  file = path.join(process.env.CLAUDE_CONFIG_DIR, '.claude.json');
  fs.rmSync(path.join(ROOT, 'factories'), { recursive: true, force: true });
}

/** `nemia`, as a person types it, on `place` (this test's by default): the lines it printed. */
async function typed(t: TestContext, argv: string[], place = stand().place): Promise<string[]> {
  const printed: string[] = [];
  const mock = t.mock.method(console, 'log', (...args: unknown[]) => printed.push(args.join(' ')));
  try {
    await cli(argv, engineOf(engine().layer), undefined, place);
  } finally {
    mock.mock.restore();
  }
  return printed.join('\n').split('\n');
}

/** The folders the harness's file says are trusted, in order. */
const trusted = (): string[] => {
  if (!fs.existsSync(file)) return [];
  const { projects } = JSON.parse(fs.readFileSync(file, 'utf8')) as { projects: Record<string, { hasTrustDialogAccepted?: boolean }> };
  return Object.keys(projects)
    .filter((key) => projects[key].hasTrustDialogAccepted === true)
    .sort();
};

/** A repository of this test's place at `<area>/repo`, a workspace cut from it at `<area>/ws`, and a folder in no repository. */
function places(): { repo: string; workspace: string; plain: string } {
  const area = scratch('wf-trust-places-');
  const [repo, workspace, plain] = [path.join(area, 'repo'), path.join(area, 'ws'), path.join(area, 'plain')];
  fs.mkdirSync(repo);
  fs.mkdirSync(plain);
  stand().world.repository(repo, { 'a.txt': 'one\n' });
  const made = stand().place.askNow('make', { repo, at: workspace, run: 'r', leaf: 'one', from: 'main', also: [] });
  assert.ok('answer' in made, JSON.stringify(made));
  return { repo, workspace, plain };
}

/** The harness's file without its trust of `folder`, as a person takes one back by hand. */
function takenBack(folder: string): void {
  const held = JSON.parse(fs.readFileSync(file, 'utf8')) as { projects: Record<string, { hasTrustDialogAccepted?: boolean }> };
  held.projects[folder].hasTrustDialogAccepted = false;
  fs.writeFileSync(file, JSON.stringify(held, null, 2));
}

test("a factory's places trusted: added, left as they are, listed and trusted by the verb, taken back by hand, and where nothing is", async (t) => {
  const s = story(t);

  await s.test(
    'factory add trusts a repository on its root, a plain folder on itself, and a workspace on the repository it was cut from',
    async () => {
      anew();
      const { repo, workspace, plain } = places();
      const lines = await typed(t, ['factory', 'add', 'one', '--repo', repo, '--repo', plain]);
      assert.deepEqual(trusted(), [plain, repo].sort());
      assert.ok(lines.includes(`trusted for Claude Code: ${repo}`), lines.join('\n'));
      assert.ok(lines.includes(`trusted for Claude Code: ${plain}`), lines.join('\n'));
      assert.ok(
        lines.includes(`  take it back: set projects["${repo}"].hasTrustDialogAccepted to false in ${file}`),
        'the way back names the key and the file',
      );
      assert.ok(
        lines.some((l) => l.startsWith('  it grants ') && l.includes(`${repo}/.claude/settings.json`)),
        lines.join('\n'),
      );
      assert.equal(lines.filter((l) => l.startsWith('trusted for ')).length, 2, 'one line a place, whatever the harnesses that share it');

      fs.rmSync(file);
      const inside = await typed(t, ['factory', 'add', 'two', '--repo', workspace]);
      assert.deepEqual(trusted(), [repo], 'the key is on the main checkout, and none on the workspace');
      assert.ok(inside.includes(`trusted for Claude Code: ${workspace} (kept under ${repo})`), inside.join('\n'));
    },
  );

  await s.test('a place already trusted is left byte for byte and nothing is said of it; --no-trust writes nothing', async () => {
    anew();
    const { repo, plain } = places();
    await typed(t, ['factory', 'add', 'one', '--repo', repo]);
    const bytes = fs.readFileSync(file);
    const again = await typed(t, ['factory', 'add', 'two', '--repo', repo]);
    assert.deepEqual(
      again.filter((l) => /trusted for|not trusted/.test(l)),
      [],
    );
    assert.ok(fs.readFileSync(file).equals(bytes));

    const without = await typed(t, ['factory', 'add', 'three', '--repo', plain, '--no-trust']);
    assert.deepEqual(
      without.filter((l) => /trusted for|not trusted/.test(l)),
      [],
    );
    assert.ok(fs.readFileSync(file).equals(bytes));
    assert.deepEqual(trusted(), [repo]);
  });

  await s.test(
    'the listing says a place that is not trusted with the line that trusts it, and factory trust then does, and it says nothing',
    async () => {
      anew();
      const { repo, workspace, plain } = places();
      await typed(t, ['factory', 'add', 'one', '--repo', workspace, '--repo', plain, '--no-trust']);
      const listed = await typed(t, ['factory', 'ls']);
      const lacking = listed.filter((l) => l.includes('not trusted for Claude Code'));
      assert.equal(lacking.length, 2, listed.join('\n'));
      assert.ok(lacking[0].includes(`: ${workspace} — withheld: `) && lacking[0].endsWith('Trust it: nemia factory trust one'), lacking[0]);
      assert.ok(lacking[1].includes(`: ${plain} — withheld: `) && lacking[1].endsWith('Trust it: nemia factory trust one'), lacking[1]);
      assert.deepEqual(await typed(t, ['factory']), listed, 'the bare form lists the same');

      const done = await typed(t, ['factory', 'trust', 'one']);
      assert.deepEqual(trusted(), [plain, repo].sort());
      assert.ok(done.includes(`trusted for Claude Code: ${workspace} (kept under ${repo})`), done.join('\n'));
      assert.deepEqual(
        (await typed(t, ['factory', 'ls'])).filter((l) => l.includes('not trusted')),
        [],
      );
      assert.deepEqual(await typed(t, ['factory', 'trust', 'one']), ['one  every place is trusted already: nothing was written']);

      takenBack(repo);
      const after = (await typed(t, ['factory', 'ls'])).filter((l) => l.includes('not trusted'));
      assert.equal(after.length, 1, 'a trust taken back by hand is read on the next listing, and never given again by one');
      assert.ok(after[0].includes(`: ${workspace} — `));
      assert.deepEqual(trusted(), [plain]);
      await typed(t, ['factory', 'trust', 'one']);
      assert.deepEqual(trusted(), [plain, repo].sort());
    },
  );

  await s.test('REFUSED: factory trust of a name with no factory, as Missing, and nothing written', async () => {
    anew();
    await assert.rejects(typed(t, ['factory', 'trust', 'nowhere']), (err: Error & { _tag?: string; exitCode?: number }) => {
      assert.equal(err._tag, 'Missing');
      assert.equal(err.exitCode, 2);
      assert.match(err.message, /no factory nowhere in the store\. .* Nothing was trusted\.$/);
      return true;
    });
    assert.equal(fs.existsSync(file), false);
  });

  await s.test(
    'a place whose repository is not answered is neither trusted nor listed as untrusted, and the factory is filed all the same',
    async () => {
      anew();
      const { repo } = places();
      const deaf = placeOver(stand().place, { root: () => unreadBy('root', 'the place did not answer in time') });
      const lines = await typed(t, ['factory', 'add', 'one', '--repo', repo], deaf);
      assert.deepEqual(
        readFactories().map((f) => f.name),
        ['one'],
      );
      assert.equal(fs.existsSync(file), false);
      assert.ok(
        lines.includes(`not trusted: ${repo} was not asked of — the place did not answer in time. Ask again: nemia factory trust one`),
        lines.join('\n'),
      );
      assert.deepEqual(
        (await typed(t, ['factory', 'ls'], deaf)).filter((l) => l.includes('not trusted')),
        [],
      );
    },
  );

  await s.test(
    'a harness file that does not read refuses no add: the factory is filed, the file left as it is, and the line says what to do',
    async () => {
      anew();
      const { repo } = places();
      fs.writeFileSync(file, '{');
      const lines = await typed(t, ['factory', 'add', 'one', '--repo', repo]);
      assert.equal(fs.readFileSync(file, 'utf8'), '{');
      assert.equal(readFactories().length, 1);
      const said = lines.filter((l) => l.startsWith('not trusted for Claude Code'));
      assert.equal(said.length, 1, lines.join('\n'));
      assert.match(said[0], /was left as it is, since it is not JSON: run Claude Code in .* once and accept its prompt$/);
    },
  );
});
