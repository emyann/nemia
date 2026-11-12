/**
 * The Factory's writes that name a template or a folder, served as endpoints of `objects`' `Api` and calling the package's entries by
 * type: a factory filed (`nemia factory add`), a volume mounted and taken off (`nemia factory volume add`, `rm`), a factory made from a
 * template sent packed by `nemia template pack`'s code, named as a builtin or by its folder's whole path (`nemia factory apply`), a
 * hand-made one previewed and taken over (`nemia factory diff`, `adopt`), a templated one previewed and upgraded by the plan's digest
 * (`nemia factory diff`, `upgrade`), and a conflict's choice sent as its text (`nemia factory resolve`). Each is a story in the harness's
 * store whose answer is read back from disk, then its refusals by status, each leaving the factory's file as it was; an archive sent is
 * kept under the store where a factory is made from it, and gone after a preview or a refusal. A factory filed or applied on a
 * repository's git URL is cloned by the place under the store, and refused with nothing filed where it cannot be. Over the stand-ins
 * (`appOver`), a scratch builtin folder given to the app.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Effect, Layer } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { addFactory, BuiltinTemplates, testPlace } from 'agent-orchestrator/testing';
import { reconcileOnce, sentTemplatesDir, StoreRoot, templateGiven } from 'agent-orchestrator';
import { scratch } from 'test-kit/scratch';
import { story } from 'test-kit/checkpoints';
import { appOver, eachTest } from '../../test/placed.ts';
import { OBJECT_BODY_LIMIT } from '../objects/serve.ts';

type FactoryCreated = import('objects').FactoryCreated;
type VolumeAdded = import('objects').VolumeAdded;
type VolumeRemoved = import('objects').VolumeRemoved;
type FactoryApplied = import('objects').FactoryApplied;
type FactoryAdopted = import('objects').FactoryAdopted;
type FactoryPlan = import('objects').FactoryPlan;
type FactoryUpgraded = import('objects').FactoryUpgraded;
type FactoryResolved = import('objects').FactoryResolved;

const write = (file: string, text: string): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** The template `name` in `folder` at `version`: one workflow, `press`, whose step `draft` the agent `drafter` fills. */
function template(folder: string, name: string, version = '0.1.0'): string {
  const at = path.join(folder, name);
  write(
    path.join(at, 'nemia.yaml'),
    `apiVersion: nemia.dev/v1alpha1\nkind: FactoryTemplate\nmetadata:\n  name: ${name}\n  description: A mill that presses drafts.\nspec:\n  version: ${version}\n  hires:\n    press/draft: drafter\n`,
  );
  write(
    path.join(at, 'workflows', 'press', 'workflow.yaml'),
    'apiVersion: nemia.dev/v1alpha1\nkind: Workflow\nmetadata:\n  name: press\n  description: Press a draft.\nspec:\n  steps:\n    - name: draft\n      place: git\n',
  );
  write(path.join(at, 'workflows', 'press', 'draft.md'), 'Draft the page.\n');
  write(
    path.join(at, 'agents', 'drafter', 'agent.yaml'),
    'apiVersion: nemia.dev/v1alpha1\nkind: Agent\nmetadata:\n  name: drafter\nspec:\n  role: Drafter\n  description: Drafts a page.\n  harness: claude\n',
  );
  write(path.join(at, 'agents', 'drafter', 'instructions.md'), 'You draft.\n');
  return at;
}

/** A builtin folder holding `mill`, and a template folder of the person's, `press`, sent packed. */
const builtins = scratch('nemia-api-templated-builtins-');
template(builtins, 'mill');
const press = template(scratch('nemia-api-templated-own-'), 'press');

/** A factory's places: plain folders, by their whole paths. */
const repo = scratch('nemia-api-templated-repo-');
const data = scratch('nemia-api-templated-data-');
for (const name of ['plain', 'refused']) addFactory({ name, repos: [repo] });

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const app = eachTest(() => appOver(standIn(), stand(), Layer.succeed(BuiltinTemplates)(builtins)));

const json = { 'content-type': 'application/json' };
const send = (method: string, url: string, body: unknown = {}) => app().request(url, { method, headers: json, body: JSON.stringify(body) });

/** What the request answered, its status asserted. */
async function answered<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const answer = await res;
  const body = (await answer.json()) as T;
  assert.equal(answer.status, status, JSON.stringify(body));
  return body;
}

/** The factory's file as it is on disk, or null where there is none: what a refusal must leave as it was. */
const fileOf = (name: string): string | null => {
  const file = path.join(root, 'factories', `${name}.json`);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
};

/** That `res` was refused with `status`, and the factory `name`'s file is as it was before. */
async function refused(name: string, res: () => Response | Promise<Response>, status: number): Promise<void> {
  const before = fileOf(name);
  const answer = await res();
  assert.equal(answer.status, status, await answer.text());
  assert.equal(fileOf(name), before, `${name}'s file is left as it was`);
}

/** The archives the store keeps of the templates sent to it. */
const sent = (): string[] => {
  const dir = sentTemplatesDir(root);
  return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
};

/** The template at `at` as a request sends it: `nemia template pack`'s archive in base64, or a builtin's name. */
const given = (at: string) => Effect.runPromise(templateGiven(at));

/** One pass of the factory controller over the harness's store: each factory made from a template rendered. */
const reconciled = () =>
  Effect.runPromise(reconcileOnce().pipe(Effect.provideService(StoreRoot, root), Effect.provideService(BuiltinTemplates, builtins)));

test('a person files a factory over the api, then mounts a volume and takes it off; each refusal leaves its file as it was', async (t) => {
  const s = story(t);

  await s.test('a POST of the name and its repositories files it, its places left untrusted with noTrust', async () => {
    const body = await answered<FactoryCreated>(send('POST', '/api/factories', { name: 'tiles', repos: [repo], noTrust: true }));
    assert.deepEqual(body.repos, [repo]);
    assert.deepEqual(body.trusts, []);
    assert.deepEqual(JSON.parse(fileOf('tiles') ?? '{}').repos, [repo]);
  });

  await s.test(
    'REFUSED: a repository named from where the api runs is a 422, the default factory a 409, a second filing a 409',
    async () => {
      await refused('stones', () => send('POST', '/api/factories', { name: 'stones', repos: ['repo'], noTrust: true }), 422);
      await refused('default', () => send('POST', '/api/factories', { name: 'default', repos: [repo], noTrust: true }), 409);
      await refused('tiles', () => send('POST', '/api/factories', { name: 'tiles', repos: [repo], noTrust: true }), 409);
    },
  );

  await s.test("a volume mounted read-only is written in the factory's file; its DELETE by path takes it off", async () => {
    const added = await answered<VolumeAdded>(send('POST', '/api/factories/tiles/volumes', { volume: `${data}:ro` }));
    assert.deepEqual([added.volume.path, added.volume.readOnly, added.was], [data, true, null]);
    assert.equal(JSON.parse(fileOf('tiles') ?? '{}').volumes.length, 1);
    const removed = await answered<VolumeRemoved>(
      app().request(`/api/factories/tiles/volumes?path=${encodeURIComponent(data)}`, { method: 'DELETE', headers: json, body: '{}' }),
    );
    assert.equal(removed.removed, data);
    assert.equal(JSON.parse(fileOf('tiles') ?? '{}').volumes, undefined);
  });

  await s.test('REFUSED: a volume with no mark or named from where the api runs is a 422, a path it does not mount a 404', async () => {
    await refused('tiles', () => send('POST', '/api/factories/tiles/volumes', { volume: data }), 422);
    await refused('tiles', () => send('POST', '/api/factories/tiles/volumes', { volume: 'data:ro' }), 422);
    await refused(
      'tiles',
      () => app().request(`/api/factories/tiles/volumes?path=${encodeURIComponent(data)}`, { method: 'DELETE', headers: json, body: '{}' }),
      404,
    );
  });
});

/** A repository of this test's place at a folder of its own, one commit on it, its `file://` URL and where the store keeps its clone. */
function origin(): { url: string; head: string; into: string } {
  const dir = path.join(scratch('nemia-api-templated-origin-'), 'o', 'r');
  fs.mkdirSync(dir, { recursive: true });
  stand().world.repository(dir, { 'a.txt': 'one\n' });
  const into = path.join(root, 'clones', 'localhost', ...dir.split(path.sep).filter(Boolean));
  return { url: pathToFileURL(dir).href, head: stand().world.head(dir), into };
}

test('a person on another machine files a factory by its git URL over the api; the api clones it, and refuses with nothing filed what it cannot clone', async (t) => {
  const s = story(t);
  const { url, head, into } = origin();

  await s.test('a POST naming the repository by its URL clones it under the store and files the factory with its origin', async () => {
    const body = await answered<FactoryCreated>(send('POST', '/api/factories', { name: 'quarry', repos: [url], noTrust: true }));
    assert.deepEqual(body.repos, [into]);
    const file = JSON.parse(fileOf('quarry') ?? '{}');
    assert.deepEqual([file.repos, file.origins], [[into], { [into]: url }]);
    assert.equal(stand().world.head(into), head);
  });

  await s.test('an apply naming the repository by its URL files the factory on the same clone, with its origin', async () => {
    const body = await answered<FactoryApplied>(
      send('POST', '/api/factories/kiln/apply', { template: { name: 'mill' }, repos: [url], noTrust: true }),
    );
    assert.deepEqual(body.repos, [into]);
    const file = JSON.parse(fileOf('kiln') ?? '{}');
    assert.deepEqual([file.repos, file.origins], [[into], { [into]: url }]);
  });

  await s.test(
    'REFUSED: a URL with a password, one naming no repository, and a relative path are 422s, nothing filed or cloned',
    async () => {
      await refused(
        'secret',
        () => send('POST', '/api/factories', { name: 'secret', repos: ['https://u:p@host/o/r'], noTrust: true }),
        422,
      );
      const none = path.join(scratch('nemia-api-templated-none-'), 'none');
      await refused('none', () => send('POST', '/api/factories', { name: 'none', repos: [pathToFileURL(none).href], noTrust: true }), 422);
      assert.equal(fs.existsSync(path.join(root, 'clones', 'localhost', ...none.split(path.sep).filter(Boolean))), false);
      await refused('relative', () => send('POST', '/api/factories', { name: 'relative', repos: ['repo'], noTrust: true }), 422);
      await refused(
        'relative',
        () => send('POST', '/api/factories/relative/apply', { template: { name: 'mill' }, repos: ['repo'], noTrust: true }),
        422,
      );
    },
  );
});

test('a person applies a template sent packed, and a builtin by its name; the archive is kept where the factory names it', async (t) => {
  const s = story(t);

  await s.test("an archive packed by template pack's code makes the factory, read from the store's copy of it", async () => {
    const before = sent();
    const body = await answered<FactoryApplied>(
      send('POST', '/api/factories/pressed/apply', { template: await given(press), repos: [repo], noTrust: true }),
    );
    const kept = sent().filter((f) => !before.includes(f));
    assert.equal(kept.length, 1, 'the archive sent is kept under the store');
    assert.equal(body.template.source, path.join(sentTemplatesDir(root), kept[0] ?? ''));
    assert.equal(JSON.parse(fileOf('pressed') ?? '{}').template.source, body.template.source);
  });

  await s.test("a builtin's name makes the factory from the builtin template of that name, and keeps nothing", async () => {
    const before = sent();
    const body = await answered<FactoryApplied>(
      send('POST', '/api/factories/milled/apply', { template: { name: 'mill' }, repos: [repo], noTrust: true }),
    );
    assert.deepEqual([body.template.source, body.place], ['mill', path.join(builtins, 'mill')]);
    assert.deepEqual(sent(), before);
  });

  await s.test(
    "a template's folder of the api's machine, by its whole path, makes the factory read from it, and keeps nothing",
    async () => {
      const before = sent();
      const body = await answered<FactoryApplied>(
        send('POST', '/api/factories/foldered/apply', { template: { path: press }, repos: [repo], noTrust: true }),
      );
      assert.equal(body.template.source, press);
      assert.equal(JSON.parse(fileOf('foldered') ?? '{}').template.source, press);
      assert.deepEqual(sent(), before);
      await refused('broken', () => send('POST', '/api/factories/broken/apply', { template: { path: 'press' }, repos: [repo] }), 422);
    },
  );

  await s.test(
    'REFUSED: bytes that are no archive and a name that is no template are 422s, nothing kept; a body past the bound a 413',
    async () => {
      const before = sent();
      const bytes = Buffer.from('no archive').toString('base64');
      await refused('broken', () => send('POST', '/api/factories/broken/apply', { template: { archive: bytes }, repos: [repo] }), 422);
      await refused('broken', () => send('POST', '/api/factories/broken/apply', { template: { name: '../mill' }, repos: [repo] }), 422);
      const large = 'A'.repeat(Number(OBJECT_BODY_LIMIT) + 1);
      await refused('broken', () => send('POST', '/api/factories/broken/apply', { template: { archive: large }, repos: [repo] }), 413);
      assert.deepEqual(sent(), before, 'a refused apply keeps no archive');
    },
  );

  await s.test('REFUSED: a template that cannot make the factory is a 422, and the archive it sent is gone', async () => {
    const before = sent();
    const bare = template(scratch('nemia-api-templated-unchecked-'), 'bare');
    fs.rmSync(path.join(bare, 'nemia.yaml'));
    await refused('bare', async () => send('POST', '/api/factories/bare/apply', { template: await given(bare), repos: [repo] }), 422);
    assert.deepEqual(sent(), before);
  });
});

test('a person previews the takeover of a hand-made factory, then takes it over by its digest', async (t) => {
  const s = story(t);
  let digest = '';

  await s.test('a diff with the template sent answers the takeover and its digest, and keeps no archive', async () => {
    const before = sent();
    const plan = await answered<FactoryPlan>(send('POST', '/api/factories/plain/diff', { template: await given(press) }));
    assert.equal(plan.kind, 'adopt');
    if (plan.kind !== 'adopt') return;
    assert.deepEqual(plan.plan.workflows.added, ['press']);
    digest = plan.digest;
    assert.deepEqual(sent(), before, 'a preview keeps none of what it was sent');
  });

  await s.test('REFUSED: an adopt by another digest is a 409, and one with no plan a 422', async () => {
    await refused(
      'plain',
      async () => send('POST', '/api/factories/plain/adopt', { template: await given(press), plan: 'sha256:00' }),
      409,
    );
    await refused('plain', async () => send('POST', '/api/factories/plain/adopt', { template: await given(press) }), 422);
  });

  await s.test('an adopt by the digest takes it over: its file names the template kept under the store', async () => {
    const body = await answered<FactoryAdopted>(send('POST', '/api/factories/plain/adopt', { template: await given(press), plan: digest }));
    assert.equal(body.template.version, '0.1.0');
    assert.equal(JSON.parse(fileOf('plain') ?? '{}').template.source, body.template.source);
    assert.ok(fs.existsSync(body.template.source), 'the archive the factory names is kept');
  });
});

test("a person previews a templated factory's upgrade, files it by its digest, and resolves its conflict with a file's text", async (t) => {
  const s = story(t);
  const folder = template(scratch('nemia-api-templated-next-'), 'press');
  await answered<FactoryApplied>(
    send('POST', '/api/factories/next/apply', { template: await given(folder), repos: [repo], noTrust: true }),
  );
  await reconciled();
  const tree = path.join(root, 'factories', 'next', 'tree');
  const draft = path.join('workflows', 'press', 'draft.md');
  fs.writeFileSync(path.join(tree, draft), 'Draft it our way.\n');
  write(path.join(folder, draft), 'Draft it their way.\n');
  write(path.join(folder, 'nemia.yaml'), fs.readFileSync(path.join(folder, 'nemia.yaml'), 'utf8').replace('0.1.0', '0.2.0'));
  let digest = '';

  await s.test('a diff to 0.2.0 with the template sent answers the merge, its conflict and the digest', async () => {
    const plan = await answered<FactoryPlan>(send('POST', '/api/factories/next/diff', { to: '0.2.0', template: await given(folder) }));
    assert.equal(plan.kind, 'upgrade');
    if (plan.kind !== 'upgrade') return;
    assert.deepEqual([plan.from, plan.to], ['0.1.0', '0.2.0']);
    assert.ok(
      plan.merge.conflicts.some((c) => c.at.startsWith(draft)),
      JSON.stringify(plan.merge.conflicts),
    );
    digest = plan.next.digest;
  });

  await s.test('REFUSED: an upgrade to no version is a 422, and one by another digest a 409', async () => {
    await refused('next', () => send('POST', '/api/factories/next/upgrade', { to: '2' }), 422);
    await refused(
      'next',
      async () => send('POST', '/api/factories/next/upgrade', { to: '0.2.0', template: await given(folder), plan: 'sha256:00' }),
      409,
    );
  });

  await s.test('an upgrade by the digest is filed: the file wants 0.2.0, and one conflict waits', async () => {
    const body = await answered<FactoryUpgraded>(
      send('POST', '/api/factories/next/upgrade', { to: '0.2.0', template: await given(folder), plan: digest }),
    );
    assert.deepEqual([body.from, body.to, body.conflicts], ['0.1.0', '0.2.0', 1]);
    assert.equal(JSON.parse(fileOf('next') ?? '{}').template.version, '0.2.0');
  });

  await s.test('REFUSED: a choice for no conflict is a 404, and one that gives no choice a 422', async () => {
    await refused('next', () => send('POST', '/api/factories/next/resolve', { conflict: 'nowhere.md', text: 'x' }), 404);
    const plan = await answered<FactoryPlan>(send('POST', '/api/factories/next/diff', { to: '0.2.0' }));
    const at = plan.kind === 'upgrade' ? (plan.merge.conflicts[0]?.at ?? '') : '';
    await refused('next', () => send('POST', '/api/factories/next/resolve', { conflict: at }), 422);
  });

  await s.test("the conflict resolved with a file's text sent: its choice kept, none left", async () => {
    const plan = await answered<FactoryPlan>(send('POST', '/api/factories/next/diff', { to: '0.2.0' }));
    const at = plan.kind === 'upgrade' ? (plan.merge.conflicts[0]?.at ?? '') : '';
    const body = await answered<FactoryResolved>(
      send('POST', '/api/factories/next/resolve', { conflict: at, text: 'Draft it together.\n' }),
    );
    assert.deepEqual([body.at, body.to, body.left], [at, '0.2.0', []]);
    assert.ok(fs.readFileSync(body.file, 'utf8').includes('Draft it together.'), 'the text sent is the choice kept');
  });
});
