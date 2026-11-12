/**
 * The trust of a factory's places, at each verb that asks it, told as one story (`story`): `nemia factory add` and `nemia factory trust`
 * typed on a repository, a plain folder and a workspace cut from a repository, each leaving the harness's one key on the folder the
 * harness keeps it under, in a harness file of the test's own; `--no-trust` and a place already trusted writing nothing; the listing
 * saying a place that is not trusted, and nothing once it is; and where nothing is trusted: no factory, a place that does not answer, a
 * harness file that does not read. Each verb is run onto its handler as the api calls it (`typed`), and what it answers is read: the
 * client prints it, and its tests hold the lines. Each checkpoint opens on a harness file and a store of factories of its own (`anew`), on
 * a store of its own at `ROOT`, given as `ENV`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest } from '../../test/placed.ts';
import { placeOver, unreadBy } from '../../test/place-over.ts';
import { scratch } from 'test-kit/scratch';
import { heldUnasked } from '../../test/unasked.ts';
import { story } from '../../test/story.ts';
import { typed as handlerOf } from '../../test/typed.ts';
import { engineOf } from '../runtime-client.ts';
import { readFactoriesAt } from '../factory/factory.store.ts';
import type { Env } from '../config/config.store.ts';
import type { PlaceTrust, Untrusted } from './trust.ts';

const ROOT = scratch('wf-trust-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT };
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

/** What `nemia factory add` and `nemia factory trust` answer of the trust they asked of each place. */
type Asked = { name: string; trusts: readonly PlaceTrust[] };

/** `nemia <argv>` run onto its handler on `place` (this test's by default): what it answers. */
const typed = (argv: string[], place = stand().place): Promise<unknown> => handlerOf(argv, engineOf(engine().layer), undefined, place, ENV);

/** What `nemia factory add` or `nemia factory trust` answered on `place`. */
const asked = async (argv: string[], place = stand().place): Promise<Asked> => (await typed(argv, place)) as Asked;

/** The places the listing says are not trusted, on `place`. */
const untrusted = async (place = stand().place): Promise<readonly Untrusted[]> =>
  ((await typed(['factory', 'ls'], place)) as { untrusted: readonly Untrusted[] }).untrusted;

/** The trusts of `answer` written now, with what each grants and the way back. */
const wrote = (answer: Asked) => answer.trusts.flatMap((one) => ('wrote' in one && one.wrote ? [one] : []));

/** The trusts of `answer` that say anything: one written, one refused, one not asked. */
const said = (answer: Asked) => answer.trusts.filter((one) => 'unasked' in one || one.wrote || one.refused !== null);

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
      const added = await asked(['factory', 'add', 'one', '--repo', repo, '--repo', plain]);
      assert.deepEqual(trusted(), [plain, repo].sort());
      const written = wrote(added);
      assert.deepEqual(
        written.map((one) => [one.harness, one.place, one.folder]),
        [
          ['Claude Code', repo, repo],
          ['Claude Code', plain, plain],
        ],
        'one a place, whatever the harnesses that share it',
      );
      assert.equal(
        written[0]?.back,
        `set projects["${repo}"].hasTrustDialogAccepted to false in ${file}`,
        'the way back names the key and the file',
      );
      assert.ok(written[0]?.grants.includes(`${repo}/.claude/settings.json`), written[0]?.grants);

      fs.rmSync(file);
      const inside = await asked(['factory', 'add', 'two', '--repo', workspace]);
      assert.deepEqual(trusted(), [repo], 'the key is on the main checkout, and none on the workspace');
      assert.deepEqual(
        wrote(inside).map((one) => [one.place, one.folder]),
        [[workspace, repo]],
      );
    },
  );

  await s.test('a place already trusted is left byte for byte and nothing is said of it; --no-trust writes nothing', async () => {
    anew();
    const { repo, plain } = places();
    await typed(['factory', 'add', 'one', '--repo', repo]);
    const bytes = fs.readFileSync(file);
    assert.deepEqual(said(await asked(['factory', 'add', 'two', '--repo', repo])), []);
    assert.ok(fs.readFileSync(file).equals(bytes));

    assert.deepEqual((await asked(['factory', 'add', 'three', '--repo', plain, '--no-trust'])).trusts, []);
    assert.ok(fs.readFileSync(file).equals(bytes));
    assert.deepEqual(trusted(), [repo]);
  });

  await s.test(
    'the listing says a place that is not trusted with the line that trusts it, and factory trust then does, and it says nothing',
    async () => {
      anew();
      const { repo, workspace, plain } = places();
      await typed(['factory', 'add', 'one', '--repo', workspace, '--repo', plain, '--no-trust']);
      const lacking = await untrusted();
      assert.deepEqual(
        lacking.map((one) => [one.factory, one.harness, one.place, one.never]),
        [
          ['one', 'Claude Code', workspace, null],
          ['one', 'Claude Code', plain, null],
        ],
        'each with what is withheld, and the trust that gives it, since one can be kept',
      );
      assert.ok(lacking.every((one) => one.withheld !== ''));
      assert.deepEqual(await typed(['factory']), await typed(['factory', 'ls']), 'the bare form lists the same');

      const done = await asked(['factory', 'trust', 'one']);
      assert.deepEqual(trusted(), [plain, repo].sort());
      assert.deepEqual(
        wrote(done).map((one) => [one.place, one.folder]),
        [
          [workspace, repo],
          [plain, plain],
        ],
      );
      assert.deepEqual(await untrusted(), []);
      assert.deepEqual(said(await asked(['factory', 'trust', 'one'])), [], 'every place is trusted already: nothing is written');

      takenBack(repo);
      const after = await untrusted();
      assert.deepEqual(
        after.map((one) => one.place),
        [workspace],
        'a trust taken back by hand is read on the next listing, and never given again by one',
      );
      assert.deepEqual(trusted(), [plain]);
      await typed(['factory', 'trust', 'one']);
      assert.deepEqual(trusted(), [plain, repo].sort());
    },
  );

  await s.test('REFUSED: factory trust of a name with no factory, as Missing, and nothing written', async () => {
    anew();
    await assert.rejects(typed(['factory', 'trust', 'nowhere']), (err: Error & { _tag?: string; exitCode?: number }) => {
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
      const added = await asked(['factory', 'add', 'one', '--repo', repo], deaf);
      assert.deepEqual(
        readFactoriesAt(ROOT).map((f) => f.name),
        ['one'],
      );
      assert.equal(fs.existsSync(file), false);
      assert.deepEqual(
        added.trusts.map((t) => [t.place, 'unasked' in t && typeof t.unasked]),
        [[repo, 'string']],
        'the place is said unasked, with why',
      );
      assert.deepEqual(await untrusted(deaf), []);
    },
  );

  await s.test(
    'a harness file that does not read refuses no add: the factory is filed, the file left as it is, and the line says what to do',
    async () => {
      anew();
      const { repo } = places();
      fs.writeFileSync(file, '{');
      const added = await asked(['factory', 'add', 'one', '--repo', repo]);
      assert.equal(fs.readFileSync(file, 'utf8'), '{');
      assert.equal(readFactoriesAt(ROOT).length, 1);
      const refused = added.trusts.flatMap((one) => ('refused' in one && one.refused !== null ? [one] : []));
      assert.deepEqual(
        refused.map((one) => [one.harness, one.place]),
        [['Claude Code', repo]],
      );
      assert.ok(refused[0]?.refused?.includes('Claude Code'), 'the refusal names the harness to run once in the place');
    },
  );
});
