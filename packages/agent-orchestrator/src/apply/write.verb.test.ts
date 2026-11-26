/**
 * A LibraryAdd proposal applied (`objectWritten`, `write.verb.ts`): the factory's record of its adds written as the proposal says, and the
 * proposal's read of what is there now (`currentOf`) agreeing with it, an add made and then taken off. A Workflow proposal applied writes
 * its README as the api's write does: the spec read (`currentOf`, the api's GET) proposed back writes it byte for byte, a readme with a
 * frontmatter of its own is written as given, its needs with it, and an instruction alone under the README's own frontmatter; the spec it
 * will hold once written (`mergedSpec`) shows each so, beside what is there now; and an undo, which proposes the spec read before, writes
 * the README back byte for byte.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import type { ProposedObject } from 'objects';
import { scratch } from 'test-kit/scratch';
import { TEAM } from '../../test/team.ts';
import { objectWritten } from './write.verb.ts';
import { currentOf } from '../propose/current.verb.ts';
import { mergedSpec } from '../propose/propose.verb.ts';
import { needsDeclaredIn, workflowNeeds, workflowReadme } from '../folder/folder.store.ts';
import { plantFactory } from '../../testing.ts';
import { readLibraryAdds } from '../library/library.store.ts';
import type { Refusal } from '../refusal/refusal.ts';
import { StoreRoot } from '../config/root.store.ts';

/** `program` run with what a LibraryAdd's write and read reach alone: the store's root, which they are given. */
const ran = <A>(program: Effect.Effect<A, Refusal, unknown>) =>
  Effect.runPromise(program as Effect.Effect<A, Refusal>) satisfies Promise<A>;

test('a LibraryAdd proposal applied writes the add, then its removal takes it off, each read back as the proposal reads it', async () => {
  const home = scratch('wf-apply-adds-');
  fs.cpSync(TEAM, path.join(home, 'workflows'), { recursive: true });
  const place = { home };
  const add: ProposedObject = {
    kind: 'LibraryAdd',
    metadata: { name: 'Skill.create-an-agent' },
    verb: 'create',
    spec: { kind: 'Skill', name: 'create-an-agent' },
  };
  assert.equal((await ran(currentOf(place, 'default', 'LibraryAdd', add.metadata.name))).version, null, 'not added yet');
  await ran(objectWritten(place, 'default', add));
  assert.ok(
    readLibraryAdds(home, 'default')?.some((a) => a.kind === 'Skill' && a.name === 'create-an-agent'),
    'the record holds it',
  );
  assert.notEqual((await ran(currentOf(place, 'default', 'LibraryAdd', add.metadata.name))).version, null, 'read as there now');
  await ran(objectWritten(place, 'default', { kind: 'LibraryAdd', metadata: { name: add.metadata.name }, verb: 'delete' }));
  assert.equal(
    readLibraryAdds(home, 'default')?.some((a) => a.kind === 'Skill' && a.name === 'create-an-agent'),
    false,
    'a removal named alone, with no spec, takes it off by its name',
  );
});

test('REFUSED: a LibraryAdd whose name is no add, and one of an item the library does not hold, each by its kind', async () => {
  const home = scratch('wf-apply-adds-refused-');
  const refused = (object: ProposedObject) =>
    ran(objectWritten({ home }, FACTORY, object)).then(
      () => assert.fail('written'),
      (e: { _tag?: string }) => e._tag,
    );
  assert.equal(await refused({ kind: 'LibraryAdd', metadata: { name: 'nothing' }, verb: 'create' }), 'Invalid');
  assert.equal(
    await refused({ kind: 'LibraryAdd', metadata: { name: 'Skill.nowhere' }, verb: 'create', spec: { kind: 'Skill', name: 'nowhere' } }),
    'Missing',
  );
});

/** The needs a planted README declares: two, each a name, a message and a check. */
const NEEDS = [
  { name: 'gh', message: 'GitHub CLI', check: 'gh --version' },
  { name: 'browser', message: 'a browser', check: 'which chromium' },
];

/** The README planted: a frontmatter with another key beside the needs, then the instruction. */
const README = `---\nowner: team\nneeds:\n${NEEDS.map((n) => `  - name: ${n.name}\n    message: ${n.message}\n    check: ${n.check}\n`).join('')}---\n# dev\n\nBuild it.\n`;

/** The factory made from a template whose tree the Workflow proposals write. */
const FACTORY = 'acme';

/**
 * A store with `FACTORY`, made from a template, its tree the tests' team rendered by hand, its `dev` README declaring `NEEDS`: the store's
 * root and the README's path.
 */
function plantedNeeds(prefix: string) {
  const home = scratch(prefix);
  const factories = path.join(home, 'factories');
  fs.mkdirSync(factories, { recursive: true });
  plantFactory(
    home,
    FACTORY,
    JSON.stringify({
      volumes: [{ path: scratch(`${prefix}repo-`), readOnly: false }],
      template: { source: '/t/team', version: '0.1.0', params: {} },
    }),
  );
  const tree = path.join(factories, FACTORY, 'tree');
  fs.cpSync(TEAM, path.join(tree, 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(tree, 'factory.json'), JSON.stringify({ workflows: ['dev'], hires: {} }));
  const readme = path.join(tree, 'workflows', 'dev', 'README.md');
  fs.writeFileSync(readme, README);
  return { home, readme } satisfies { home: string; readme: string };
}

/** What there is now of `name`'s `kind` in `FACTORY`, read at the store's root `home`, which the Workflow door reads at. */
const nowIn = (home: string, kind: 'Workflow' = 'Workflow', name = 'dev') =>
  ran(Effect.provideService(currentOf({ home }, FACTORY, kind, name), StoreRoot, home));

/** `dev` as the api serves it, read now: its spec as its files hold it, at the version it was read. */
async function servedDev(home: string) {
  const now = await nowIn(home);
  return { version: now.version ?? '', spec: now.spec as Record<string, unknown> } satisfies {
    version: string;
    spec: Record<string, unknown>;
  };
}

/** The spec `object` will hold once written over `now` (`mergedSpec`), its README read: its needs are declared there, never apart. */
const previewOf = (object: ProposedObject, now: unknown) => mergedSpec(object, now) as { readme?: string };

/** `dev` proposed back as an update at `version` with `spec`. */
const devProposed = (version: string, spec: ProposedObject['spec']) =>
  ({
    kind: 'Workflow',
    metadata: { name: 'dev', resourceVersion: version },
    verb: 'update',
    spec,
  }) satisfies ProposedObject;

describe('a Workflow read as the api serves it and proposed back writes its README byte for byte, the preview showing it unchanged', () => {
  for (const [label, line] of [
    ['line ends of LF', (text: string) => text],
    ['line ends of CRLF', (text: string) => text.replace(/\n/g, '\r\n')],
  ] as const) {
    test(label, async () => {
      const { home, readme } = plantedNeeds('wf-apply-read-back-');
      fs.writeFileSync(readme, line(README));
      const { version, spec } = await servedDev(home);
      assert.equal(spec.readme, line(README), 'the read serves the README whole');
      const object = devProposed(version, spec);
      assert.equal(previewOf(object, spec).readme, line(README), 'the preview shows the README unchanged');
      await ran(objectWritten({ home }, FACTORY, object));
      assert.equal(fs.readFileSync(readme, 'utf8'), line(README));
      assert.deepEqual(workflowNeeds(path.dirname(readme)), NEEDS, 'the needs are still declared');
    });
  }
});

test("a Workflow given its instruction alone writes it under the README's own frontmatter, its needs kept", async () => {
  const { home, readme } = plantedNeeds('wf-apply-instruction-');
  const { version, spec } = await servedDev(home);
  const object = devProposed(version, { ...spec, readme: '# dev\n\nBuild it again.\n' });
  assert.equal(needsDeclaredIn(previewOf(object, spec).readme ?? '').needs.length, NEEDS.length, 'the preview keeps the needs');
  await ran(objectWritten({ home }, FACTORY, object));
  assert.deepEqual(workflowNeeds(path.dirname(readme)), NEEDS);
  assert.match(fs.readFileSync(readme, 'utf8'), /^---\nowner: team\n/, "the frontmatter's other key is kept");
  assert.equal(workflowReadme(path.dirname(readme)), '# dev\n\nBuild it again.\n');
});

test('a Workflow whose readme carries its own frontmatter is written as given, its needs those it declares', async () => {
  const { home, readme } = plantedNeeds('wf-apply-needs-composed-');
  const { version, spec } = await servedDev(home);
  const given =
    '---\nneeds:\n  - name: git-identity\n    message: a git identity\n    check: git config user.name\n---\n# dev\n\nComposed.\n';
  const object = devProposed(version, { ...spec, readme: given });
  assert.equal(previewOf(object, spec).readme, given, 'the preview shows the readme as given');
  await ran(objectWritten({ home }, FACTORY, object));
  assert.equal(fs.readFileSync(readme, 'utf8'), given);
  assert.deepEqual(workflowNeeds(path.dirname(readme)), [
    { name: 'git-identity', message: 'a git identity', check: 'git config user.name' },
  ]);
});

test("an undo of a Workflow proposal writes the README back byte for byte, its frontmatter's comment and order kept", async () => {
  const { home, readme } = plantedNeeds('wf-apply-needs-undo-');
  const was = `---\n# who runs it\nneeds:\n  - name: gh\n    message: "GitHub CLI"\n    check: gh --version\nowner: team\n---\n# dev\n\nBuild it.\n`;
  fs.writeFileSync(readme, was);
  const before = await nowIn(home);
  assert.equal((before.spec as { needs?: unknown }).needs, undefined, 'the current read says the needs in the README alone');
  const { version, spec } = await servedDev(home);
  await ran(objectWritten({ home }, FACTORY, devProposed(version, { ...spec, readme: '---\nowner: team\n---\n# dev\n\nBuild it.\n' })));
  assert.notEqual(fs.readFileSync(readme, 'utf8'), was, 'the proposal changed the README');
  const after = await nowIn(home);
  await ran(objectWritten({ home }, FACTORY, devProposed(after.version ?? '', before.spec)));
  assert.equal(fs.readFileSync(readme, 'utf8'), was, 'the undo, which proposes the spec read before, puts the bytes back');
});
