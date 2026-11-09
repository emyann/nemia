/**
 * The builtin templates as objects, on a scratch builtin folder (`withBuiltins`), never the package's own: listed and read by name, one
 * whose manifest does not read listed all the same with its problems, an unknown name `Missing`, and a template's render written once
 * into its folder of renders, laid out as a factory's tree, and refused `Invalid` where it does not render. The folder of renders is this
 * user's own: named by uid and made `0700`, a render planted there with other content staged again, and a folder owned by another user
 * (a `RenderOwner` claimed for another uid, since a test cannot chown) refused `Conflict` and never served. `WF_ROOT` is set before the
 * import, since the store's modules read it as they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { Cause, Effect, Exit, Schema } from 'effect';
import { Template, TemplateList } from 'objects';
import { machineTempDir, scratch } from 'test-kit/scratch';
import { teamCopy } from '../../../test/team.ts';

const ROOT = scratch('wf-template-object-');
process.env.WF_ROOT = ROOT;
const { templated, withBuiltins } = await import('../../../test/templated.ts');
const { exportTemplate } = templated(ROOT);
const { StoreRoot } = await import('../../config/root.store.ts');
const { RenderOwner, TemplateRenders, templateDocumentsOf, templateList, templateObject, templateTree } =
  await import('./template.verb.ts');

/**
 * A builtin folder holding `mill`, the tests' team exported; `asks`, the same with a parameter that has no default; `odd`, the same with
 * a revisions policy that is none; and `torn`, whose manifest does not parse.
 */
function builtins(): string {
  const folder = scratch('wf-template-builtins-');
  const repo = scratch('wf-template-repo-');
  fs.renameSync(teamCopy(), path.join(repo, 'workflows'));
  exportTemplate({ dir: path.join(folder, 'mill'), from: repo });
  exportTemplate({ dir: path.join(folder, 'asks'), from: repo });
  const manifest = path.join(folder, 'asks', 'nemia.yaml');
  const doc = parse(fs.readFileSync(manifest, 'utf8'));
  doc.spec.parameters = { budget: { type: 'number', description: 'dollars for a review' } };
  fs.writeFileSync(manifest, stringify(doc, { lineWidth: 0 }));
  exportTemplate({ dir: path.join(folder, 'odd'), from: repo });
  const odd = path.join(folder, 'odd', 'nemia.yaml');
  const oddDoc = parse(fs.readFileSync(odd, 'utf8'));
  oddDoc.spec.revisions = 'sometimes';
  fs.writeFileSync(odd, stringify(oddDoc, { lineWidth: 0 }));
  fs.mkdirSync(path.join(folder, 'torn'));
  fs.writeFileSync(path.join(folder, 'torn', 'nemia.yaml'), 'apiVersion: [unclosed\n');
  return folder;
}

/** `program` run with the store's root, the builtin folder `folder` and the renders under `renders`: its exit. */
const exitOf = <A, E>(program: Effect.Effect<A, E>, folder: string, renders: string) =>
  Effect.runSyncExit(
    Effect.provideService(Effect.provideService(withBuiltins(program, folder), StoreRoot, ROOT), TemplateRenders, renders),
  );

/** The tag `program` failed with, run as `uid` over the renders under `renders`. */
const failedAs = <A, E>(program: Effect.Effect<A, E>, folder: string, renders: string, uid: number): string | undefined => {
  const exit = exitOf(Effect.provideService(program, RenderOwner, uid), folder, renders);
  if (Exit.isSuccess(exit)) return undefined;
  return (Cause.squash(exit.cause) as { _tag?: string })._tag;
};

/** What `program` answers, or a throw of what it failed with. */
const run = <A, E>(program: Effect.Effect<A, E>, folder: string, renders = scratch('wf-template-renders-')): A => {
  const exit = exitOf(program, folder, renders);
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
};

/** The tag `program` failed with. */
const failedWith = <A, E>(program: Effect.Effect<A, E>, folder: string): string | undefined => {
  const exit = exitOf(program, folder, scratch('wf-template-renders-'));
  if (Exit.isSuccess(exit)) return undefined;
  return (Cause.squash(exit.cause) as { _tag?: string })._tag;
};

test('the builtin templates as objects, and their renders', async (t) => {
  const folder = builtins();

  await t.test('the list holds each builtin template by name, each decoding as a Template', () => {
    const list = Schema.decodeUnknownSync(TemplateList)(run(templateList({}), folder));
    assert.deepEqual(
      list.items.map((o) => o.metadata.name),
      ['asks', 'mill', 'odd', 'torn'],
    );
    const mill = list.items.find((o) => o.metadata.name === 'mill');
    assert.ok(mill);
    assert.equal(mill.metadata.namespace, undefined);
    assert.deepEqual(mill.status.workflows, ['dev', 'triage']);
    assert.deepEqual(mill.status.agents, ['implementer', 'reviewer', 'shipper']);
    assert.ok(mill.status.skills.length > 0);
    assert.equal(mill.status.problems, undefined);
    assert.equal(mill.status.source, path.join(folder, 'mill'));
    assert.equal(typeof mill.status.digest, 'string');
    assert.equal(mill.metadata.resourceVersion, mill.status.digest);
    assert.deepEqual(mill.spec.parameters, {});
    assert.equal(mill.spec.hires['dev/review'], 'reviewer');
  });

  await t.test('a page of one, and a selector that is not one refused Invalid', () => {
    const page = run(templateList({ limit: 1 }), folder);
    assert.deepEqual(
      page.items.map((o) => o.metadata.name),
      ['asks'],
    );
    assert.equal(page.metadata.remainingItemCount, 3);
    assert.equal(failedWith(templateList({ labelSelector: ['=='] }), folder), 'Invalid');
  });

  await t.test('a template read by name; a manifest that does not read is served with its problems', () => {
    const mill = Schema.decodeUnknownSync(Template)(run(templateObject('mill'), folder));
    assert.equal(mill.kind, 'Template');
    const torn = Schema.decodeUnknownSync(Template)(run(templateObject('torn'), folder));
    assert.ok(torn.status.problems && torn.status.problems.length > 0);
    assert.deepEqual(torn.spec, { parameters: {}, hires: {} });
    const asks = Schema.decodeUnknownSync(Template)(run(templateObject('asks'), folder));
    assert.deepEqual(Object.keys(asks.spec.parameters), ['budget']);
    const odd = Schema.decodeUnknownSync(Template)(run(templateObject('odd'), folder));
    assert.equal(Object.hasOwn(odd.spec, 'revisions'), false, 'a key of the wrong shape is left out');
    assert.ok(odd.status.problems?.some((p) => p.includes('spec.revisions')));
    assert.equal(odd.spec.hires['dev/review'], 'reviewer', 'the keys that read are kept');
  });

  await t.test('an unknown name is Missing', () => {
    assert.equal(failedWith(templateObject('nowhere'), folder), 'Missing');
    assert.equal(failedWith(templateTree('nowhere'), folder), 'Missing');
  });

  await t.test("a render is written once, as a factory's tree, and read again untouched", () => {
    const renders = scratch('wf-template-renders-');
    const first = run(templateTree('mill'), folder, renders);
    const factoryJson = path.join(first.dir, 'factory.json');
    const written = fs.statSync(factoryJson).mtimeMs;
    const second = run(templateTree('mill'), folder, renders);
    assert.equal(second.dir, first.dir);
    assert.equal(fs.statSync(factoryJson).mtimeMs, written);
    assert.equal(first.dir, path.join(renders, first.digest, 'mill'));
    assert.deepEqual(first.workflows, ['dev', 'triage']);
    assert.equal(first.hires['dev/review'], 'reviewer');
    assert.equal(first.name, 'mill');
    assert.ok(fs.statSync(path.join(first.dir, 'workflows', 'dev', 'review.md')).isFile());
    assert.ok(fs.statSync(path.join(first.dir, 'workflows', 'agents', 'reviewer.md')).isFile());
    assert.ok(fs.statSync(path.join(first.dir, 'workflows', 'skills', 'review-a-change', 'SKILL.md')).isFile());
    assert.deepEqual(fs.readdirSync(path.join(renders, first.digest)), ['mill'], 'no staged folder is left beside it');
  });

  await t.test("the folder of renders is this user's own, by uid, and made 0700", () => {
    const uid = process.getuid?.();
    const named = Effect.runSync(
      Effect.gen(function* () {
        return yield* TemplateRenders;
      }),
    );
    assert.equal(path.dirname(named), machineTempDir());
    assert.equal(path.basename(named), `nemia-templates-${uid ?? os.userInfo().username}`);
    const renders = scratch('wf-template-renders-');
    fs.chmodSync(renders, 0o755);
    run(templateTree('mill'), folder, renders);
    assert.equal(fs.statSync(renders).mode & 0o777, 0o700, 'one found open to others is closed');
    const made = path.join(scratch('wf-template-renders-'), 'fresh');
    run(templateTree('mill'), folder, made);
    assert.equal(fs.statSync(made).mode & 0o777, 0o700, 'one made is made 0700');
  });

  await t.test('a render planted with other content is not served: it is staged again', () => {
    const renders = scratch('wf-template-renders-');
    const { dir } = run(templateTree('mill'), folder, renders);
    fs.rmSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, 'workflows', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'workflows', 'agents', 'reviewer.md'), 'planted\n');
    run(templateTree('mill'), folder, renders);
    assert.notEqual(fs.readFileSync(path.join(dir, 'workflows', 'agents', 'reviewer.md'), 'utf8'), 'planted\n');
    assert.ok(fs.statSync(path.join(dir, 'factory.json')).isFile());
  });

  await t.test(
    'a folder of renders owned by another user is refused Conflict, and what is planted in it is neither served nor touched',
    (t) => {
      const uid = process.getuid?.();
      if (uid === undefined) return t.skip('this platform has no uid');
      const renders = scratch('wf-template-renders-');
      const { dir } = run(templateTree('mill'), folder, renders);
      fs.writeFileSync(path.join(dir, 'workflows', 'agents', 'reviewer.md'), 'planted\n');
      assert.equal(failedAs(templateTree('mill'), folder, renders, uid + 1), 'Conflict');
      assert.equal(fs.readFileSync(path.join(dir, 'workflows', 'agents', 'reviewer.md'), 'utf8'), 'planted\n');
    },
  );

  await t.test('a parameter with no default does not render, Invalid, and is still served as a Template', () => {
    assert.equal(failedWith(templateTree('asks'), folder), 'Invalid');
    assert.equal(failedWith(templateTree('torn'), folder), 'Invalid');
    assert.equal(run(templateObject('asks'), folder).status.problems, undefined);
  });

  await t.test("a template's documents are its workflows, agents and skills, by name, sorted", () => {
    assert.deepEqual(
      templateDocumentsOf([
        'nemia.yaml',
        'workflows/b/workflow.yaml',
        'workflows/a/workflow.yaml',
        'workflows/a/README.md',
        'agents/z/agent.yaml',
        'agents/z/instructions.md',
        'skills/s/SKILL.md',
        'skills/s/more/SKILL.md',
      ]),
      { workflows: ['a', 'b'], agents: ['z'], skills: ['s'] },
    );
  });
});
