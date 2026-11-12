/**
 * A template as it travels to another machine's api and as that api takes it (`given.store.ts`), and the links of the verbs that send
 * one: a `--template` word made the request's — a builtin's name as it is, an archive's bytes, a folder packed as `nemia template pack`
 * packs it, a place that is neither refused as an apply here refuses it — and the source a verb reads of what was sent: a name as it
 * is, an archive kept by its name and the digest of its content, removed after a preview and after a failure, kept where a factory is
 * made from it. Then what the forwarded command line sends of `nemia factory resolve --file` (its text, never its path) and reads back
 * of `nemia factory ls` (the listing its print takes, made of the Factories).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Exit } from 'effect';
import { scratch } from 'test-kit/scratch';
import { API_VERSION } from 'objects';
import { StoreRoot } from '../config/root.store.ts';
import { unpackArchive } from '../archive/archive.ts';
import { sentTemplatesDir, templateGiven, templatePacked, withTemplateTaken } from './given.store.ts';
import { FACTORY_RESOLVE } from '../factory/upgrade/upgrade.verb.ts';
import { FACTORY } from '../factory/factory.verb.ts';

const ROOT = scratch('wf-template-given-');

/** A template's folder named `name` of two files, one executable. */
function folder(name: string): string {
  const at = path.join(scratch('wf-template-given-folder-'), name);
  fs.mkdirSync(path.join(at, 'workflows', 'press'), { recursive: true });
  fs.writeFileSync(path.join(at, 'nemia.yaml'), `kind: FactoryTemplate\nmetadata:\n  name: ${name}\n`);
  fs.writeFileSync(path.join(at, 'workflows', 'press', 'check.sh'), 'exit 0\n', { mode: 0o755 });
  return at;
}

/** What `effect` failed with, or the value it answered. */
const exitOf = <A, E>(effect: Effect.Effect<A, E, StoreRoot>) => Effect.runPromiseExit(Effect.provideService(effect, StoreRoot, ROOT));

/** The archives the store keeps of the templates sent to it. */
const sent = (): string[] => (fs.existsSync(sentTemplatesDir(ROOT)) ? fs.readdirSync(sentTemplatesDir(ROOT)).sort() : []);

/** The tag of the refusal `exit` failed with. */
const refusedAs = (exit: Exit.Exit<unknown, unknown>): string | undefined =>
  Exit.isFailure(exit) ? (exit.cause.reasons[0] as { error?: { _tag?: string } } | undefined)?.error?._tag : undefined;

test("a --template word is made the request's: a name as it is, a folder packed as pack packs it, an archive's bytes; REFUSED: a place that is neither", async () => {
  assert.deepEqual(await Effect.runPromise(templateGiven('sdlc')), { name: 'sdlc' });
  const at = folder('press');
  const packed = await Effect.runPromise(templateGiven(at));
  assert.ok('archive' in packed);
  if (!('archive' in packed)) return;
  const unpacked = unpackArchive(Buffer.from(packed.archive, 'base64'));
  assert.equal(unpacked.name, 'press');
  assert.deepEqual(
    unpacked.files.map((f) => [f.path, f.mode & 0o111]),
    [
      ['nemia.yaml', 0],
      ['workflows/press/check.sh', 0o111],
    ],
  );
  const archive = path.join(scratch('wf-template-given-archive-'), 'press.tgz');
  fs.writeFileSync(archive, Buffer.from(packed.archive, 'base64'));
  assert.deepEqual(await Effect.runPromise(templateGiven(archive)), packed, 'an archive is sent as its bytes');
  const nowhere = await Effect.runPromiseExit(templateGiven(path.join(at, 'nowhere')));
  assert.equal(refusedAs(nowhere), 'Missing');
  assert.deepEqual(await Effect.runPromise(templatePacked({ factory: 'mill', to: '1.0.0' })), { factory: 'mill', to: '1.0.0' });
  assert.deepEqual(await Effect.runPromise(templatePacked({ factory: 'mill', template: 'sdlc' })), {
    factory: 'mill',
    template: { name: 'sdlc' },
  });
});

test('what was sent is the source a verb reads: kept where a factory is made of it, gone after a preview or a failure; REFUSED: no archive, no name', async () => {
  const packed = await Effect.runPromise(templateGiven(folder('press')));
  assert.ok('archive' in packed);
  const read = (source: string) => Effect.sync(() => source);
  const previewed = await exitOf(withTemplateTaken(packed, 'never', read));
  assert.ok(Exit.isSuccess(previewed) && previewed.value.startsWith(path.join(sentTemplatesDir(ROOT), 'press-')));
  assert.deepEqual(sent(), [], 'a preview keeps nothing');
  const failed = await exitOf(withTemplateTaken(packed, 'made', () => Effect.fail('refused')));
  assert.ok(Exit.isFailure(failed));
  assert.deepEqual(sent(), [], 'a failure keeps nothing');
  const made = await exitOf(withTemplateTaken(packed, 'made', read));
  assert.ok(Exit.isSuccess(made) && fs.existsSync(made.value), 'a factory made of it reads it again');
  const again = await exitOf(withTemplateTaken(packed, 'never', read));
  assert.ok(Exit.isSuccess(again) && Exit.isSuccess(made) && again.value === made.value);
  assert.ok(Exit.isSuccess(made) && fs.existsSync(made.value), 'a preview leaves the archive a factory names, which it did not write');
  assert.equal(await Effect.runPromise(Effect.provideService(withTemplateTaken({ name: 'sdlc' }, 'made', read), StoreRoot, ROOT)), 'sdlc');
  assert.equal(refusedAs(await exitOf(withTemplateTaken({ archive: Buffer.from('plain').toString('base64') }, 'made', read))), 'Invalid');
  assert.equal(refusedAs(await exitOf(withTemplateTaken({ name: '../sdlc' }, 'made', read))), 'Invalid');
});

test("a forwarded resolve sends a --file's text, never its path; REFUSED: a file that is not there", async () => {
  const request = FACTORY_RESOLVE.served?.[0].request;
  assert.ok(request);
  const file = path.join(scratch('wf-template-given-choice-'), 'choice.md');
  fs.writeFileSync(file, 'Draft it together.\n');
  assert.deepEqual(await Effect.runPromise(request({ factory: 'mill', conflict: 'RULES.md', file })), {
    factory: 'mill',
    conflict: 'RULES.md',
    text: 'Draft it together.\n',
  });
  assert.deepEqual(await Effect.runPromise(request({ factory: 'mill', conflict: 'RULES.md', ours: true })), {
    factory: 'mill',
    conflict: 'RULES.md',
    ours: true,
  });
  assert.equal(refusedAs(await Effect.runPromiseExit(request({ factory: 'mill', conflict: 'x', file: `${file}.gone` }))), 'Invalid');
});

test('a forwarded factory listing reads the Factories as its print takes them: the default left out, a file that does not read by its error', () => {
  const answer = FACTORY.served?.[0].answer;
  assert.ok(answer);
  const meta = (name: string) => ({ name, creationTimestamp: '2026-11-11T00:00:00.000Z', resourceVersion: 'v' });
  const list = {
    apiVersion: API_VERSION,
    kind: 'FactoryList',
    metadata: {},
    items: [
      {
        apiVersion: API_VERSION,
        kind: 'Factory',
        metadata: meta('default'),
        spec: { repos: ['/r'], hires: {}, volumes: [] },
        status: { conditions: [], untrusted: [] },
      },
      {
        apiVersion: API_VERSION,
        kind: 'Factory',
        metadata: meta('mill'),
        spec: { repos: ['/r'], workflows: ['press'], hires: {}, volumes: [{ path: '/d', readOnly: true }] },
        status: { conditions: [], untrusted: [{ place: '/r', harness: 'Claude Code', withheld: 'its hooks' }] },
      },
      {
        apiVersion: API_VERSION,
        kind: 'Factory',
        metadata: meta('broken'),
        spec: { repos: [], hires: {}, volumes: [] },
        status: { conditions: [], untrusted: [], error: '/s/broken.json does not read as JSON' },
      },
    ],
  };
  const listed = answer(list, {}) as { factories: Array<Record<string, unknown>>; untrusted: Array<Record<string, unknown>> };
  assert.deepEqual(
    listed.factories.map((f) => [f.name, f.repos ?? f.error]),
    [
      ['mill', ['/r']],
      ['broken', 'does not read as JSON'],
    ],
  );
  assert.deepEqual(
    listed.untrusted.map((u) => [u.factory, u.place]),
    [['mill', '/r']],
  );
  const lines = FACTORY.print(listed as Parameters<typeof FACTORY.print>[0], {});
  assert.ok(
    lines.some((l) => l.startsWith('mill') && l.includes('/r')),
    lines.join('\n'),
  );
});
