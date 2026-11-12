/**
 * The orchestrator's command line forwarded to another machine's api (`NEMIA_SERVER`, `NEMIA_SERVER_TOKEN`), as the client spawns it
 * under a context naming a remote daemon: the api served on a port over its store, and the orchestrator's bin spawned with a person's
 * token minted through the package's token door and a store of its own that stays empty. Each store verb changes the api's store, leaves
 * the local one untouched, exits 0 and prints what the same command run in process prints on a copy of the api's store, its store's
 * path and a card's generated name said apart. A verb the api answers 404 exits as `Missing` does, and a token it refuses as `Forbidden`.
 *
 * `rm` is left out: the api removes a try alone (`runs.delete`), and refuses a repository run, which the command line forgets with its
 * worktrees; `label inbox`, a store verb of a card, is run in its place.
 */
import { root } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createAdaptorServer } from '@hono/node-server';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { addFactory, setInstruction, testPlace } from 'agent-orchestrator/testing';
import { TokenDoor, tokenDoorFiles } from 'agent-orchestrator';
import { scratch } from 'test-kit/scratch';
import { appOver, eachTest } from './placed.ts';

const BIN = fileURLToPath(import.meta.resolve('agent-orchestrator/bin'));

/** A token of the person's, minted in the api's store through the package's token door. */
const personToken = Effect.runSync(
  Effect.gen(function* () {
    return yield* (yield* TokenDoor).persons.mint('forwarded-laptop');
  }).pipe(Effect.provide(tokenDoorFiles(root))),
);

const folder = scratch('nemia-api-forwarded-folder-');
addFactory({ name: 'mill', repos: [folder] });
setInstruction({ factory: 'mill', at: { store: true } });

const engine = eachTest(testEngine);
const stand = eachTest(testPlace);

/** The address the api over this test's stand-ins is served at, while `serving` holds it. */
let URL_ = '';

/** `work` with the api over this test's stand-ins served on a port of its own (`URL_`), closed after it whatever happened. */
async function serving(work: () => Promise<void>): Promise<void> {
  const server = createAdaptorServer({ fetch: appOver(engine(), stand()).fetch }) as Server;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  URL_ = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await work();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** The laptop's own store, which a forwarded command never writes. */
const laptop = scratch('nemia-api-forwarded-laptop-');
/** Where the laptop's engine would be, which a forwarded command never builds. */
const laptopEngine = scratch('nemia-api-forwarded-engine-');
/** Where the command line is typed, the files it names beside it. */
const here = scratch('nemia-api-forwarded-here-');

/** What a spawned command line did: its exit code, and what it printed on each stream. */
type Ran = { code: number; stdout: string; stderr: string };

/** The orchestrator's bin on `argv` with `env` beside this process's, typed in `here`, run to its end without holding up the server. */
function nemia(argv: readonly string[], env: Readonly<Record<string, string>>): Promise<Ran> {
  const child = spawn(process.execPath, [BIN, ...argv], { cwd: here, env: { ...process.env, AE_ROOT: laptopEngine, ...env } });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

/** `argv` forwarded to the api with `token`, over the laptop's own empty store. */
const forwarded = (argv: readonly string[], token = personToken) =>
  nemia(argv, { WF_ROOT: laptop, NEMIA_SERVER: URL_, NEMIA_SERVER_TOKEN: token });

/** Every file under `dir`, by its path from it, with its text: what a store holds. */
function filesOf(dir: string): Record<string, string> {
  if (!fs.existsSync(dir)) return {};
  return Object.fromEntries(
    fs
      .readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => {
        const at = path.join(e.parentPath, e.name);
        return [path.relative(dir, at), fs.readFileSync(at, 'utf8')];
      }),
  );
}

/** The cards of the inbox of the store at `home`, by name. */
const cardsAt = (home: string): string[] =>
  fs.existsSync(path.join(home, 'inbox')) ? fs.readdirSync(path.join(home, 'inbox')).filter((f) => f.endsWith('.md')) : [];

/**
 * `stdout` with `home`, the store it was printed of, said apart: its inbox's path left out (a card a person names by its file there) and
 * the rest of its path as `<store>`; and each card `made` named as `<card>`.
 */
const said = (stdout: string, home: string, made: readonly string[]): string =>
  made
    .map((f) => f.replace(/\.md$/, ''))
    .reduce(
      (text, name) => text.replaceAll(name, '<card>'),
      stdout.replaceAll(path.join(home, 'inbox') + path.sep, '').replaceAll(home, '<store>'),
    );

/**
 * `argv` run in process on a copy of the api's store, then forwarded to the api: each exits 0 and prints the same, the api's store is
 * changed as `changes` says, and the laptop's store is left empty. Answers what the forwarded command printed.
 */
async function sameAsHere(
  argv: readonly string[],
  changes: (before: Record<string, string>, after: Record<string, string>) => void,
): Promise<string> {
  const copy = scratch('nemia-api-forwarded-copy-');
  fs.cpSync(root, copy, { recursive: true });
  const cardsBefore = cardsAt(root);
  const inProcess = await nemia(argv, { WF_ROOT: copy });
  assert.equal(inProcess.code, 0, inProcess.stderr);
  const before = filesOf(root);
  const there = await forwarded(argv);
  assert.equal(there.code, 0, there.stderr);
  changes(before, filesOf(root));
  assert.deepEqual(filesOf(laptop), {}, 'the laptop’s store is left as it was');
  const madeHere = cardsAt(copy).filter((f) => !cardsBefore.includes(f));
  const madeThere = cardsAt(root).filter((f) => !cardsBefore.includes(f));
  assert.equal(said(there.stdout, root, madeThere), said(inProcess.stdout, copy, madeHere));
  return there.stdout;
}

/** The keys of `after` whose text is not `before`'s: what a command changed in a store. */
const changed = (before: Record<string, string>, after: Record<string, string>): string[] =>
  Object.keys(after).filter((k) => before[k] !== after[k]);

test('a store verb forwarded to the api changes its store, prints what it prints here, and leaves the laptop’s untouched', (t) =>
  serving(async () => {
    await t.test('pause-timeout 10m', async () => {
      await sameAsHere(['pause-timeout', '10m'], (before, after) => assert.ok(changed(before, after).length > 0, 'the timeout is written'));
    });
    await t.test('inbox add -f <card>, the card read on the laptop and sent', async () => {
      fs.writeFileSync(path.join(here, 'idea.md'), 'Cache the views\n\nThey are slow.\n');
      await sameAsHere(['inbox', 'add', 'idea.md'], (before, after) =>
        assert.ok(
          changed(before, after).some((f) => f.startsWith('inbox') && after[f]?.includes('They are slow.')),
          'the card is filed in the api’s inbox',
        ),
      );
    });
    await t.test('label inbox <card> key=value', async () => {
      const [card = ''] = cardsAt(root);
      await sameAsHere(['label', 'inbox', card.replace(/\.md$/, ''), 'team=core'], (before, after) =>
        assert.ok(
          changed(before, after).some((f) => after[f]?.includes('team')),
          'the label is written on the card',
        ),
      );
    });
    await t.test('factory instruct <f> --file <words>, the words read on the laptop and sent', async () => {
      fs.writeFileSync(path.join(here, 'words.md'), 'Keep it short.\n');
      await sameAsHere(['factory', 'instruct', 'mill', '--file', 'words.md'], (before, after) =>
        assert.ok(
          changed(before, after).some((f) => after[f]?.includes('Keep it short.')),
          'the instruction is written',
        ),
      );
    });
  }));

test('REFUSED forwarded: what the api answers 404 exits as Missing does, and a token it refuses as Forbidden does', () =>
  serving(async () => {
    const missing = await forwarded(['cancel', 'no-such-run']);
    assert.equal(missing.code, 2, missing.stderr);
    const refused = await forwarded(['pause-timeout'], 'never-minted');
    assert.equal(refused.code, 2, refused.stderr);
    assert.deepEqual(filesOf(laptop), {});
  }));
