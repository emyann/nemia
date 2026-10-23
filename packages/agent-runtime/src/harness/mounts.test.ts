/**
 * A task's mounts, refused before they are journalled: their shape by the check every harness shares (`mountsRefusalOf`, asked by
 * the core `file`, so at both doors), and their mode by the engine, which has harnesses to ask whether they hold it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Layer } from 'effect';
import { Engine, type Event, type Sighting } from '../index.ts';
import { Journal } from '../core/engine/journal.ts';
import { file } from '../core/engine/filing.ts';
import { Runner } from './seam.ts';
import { codex } from './codex/codex.ts';
import { commandHarness } from './command/command.ts';
import { scratch } from '../../test/scratch.ts';
import { builtEngine } from '../../test/engine.ts';
import { asyncStore, type AsyncJournal } from '../../test/promise-runner.ts';

/** The core `file`, over a store and a harness that cost nothing: what it journals is `listed`. */
const coreDoor = () => {
  const layer = Layer.mergeAll(Journal.test(), Runner.test({ sessions: new Map<string, Sighting>(), spawned: [] }));
  const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
  return { run, listed: async () => (await run(Effect.flatMap(Journal, (j) => j.list))).length };
};

/** A store in memory the engine journals to, which a row can count. */
const memoryStore = (): AsyncJournal => {
  const tasks = new Map<string, Event[]>();
  return {
    async append(taskId, event) {
      tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
    },
    async read(taskId) {
      return [...(tasks.get(taskId) ?? [])];
    },
    async list() {
      return [...tasks.keys()].sort();
    },
    async feed() {
      return { entries: [], cursor: 0 };
    },
  };
};

const NUL = `/srv/a${String.fromCharCode(0)}b`;
const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

type Row = {
  name: string;
  harness?: string;
  config: Record<string, unknown>;
  /** `core`: the shape, refused alike by the core `file` and the engine. `engine`: the mode, which only the engine can ask. */
  at: 'core' | 'engine';
  /** What the refusal names — the mount, the key and the fix — or nothing, where the task is filed. */
  says?: RegExp[];
};

const one = (readOnly: boolean) => ({ mounts: [{ path: '/srv/a', readOnly }] });

const ROWS: Row[] = [
  { name: 'not a list', at: 'core', config: { mounts: {} }, says: [/^`mounts: \{\}` is not a list of mounts/, /Give a list/] },
  { name: 'an entry that is no mount', at: 'core', config: { mounts: ['/srv'] }, says: [/^`mounts` holds "\/srv", which is not a mount/] },
  ...[
    ['a relative path', 'rel'],
    ['a path not resolved', '/srv/a/'],
    ['a path holding a NUL', NUL],
  ].map(([name, at]): Row => ({
    name,
    at: 'core',
    config: { mounts: [{ path: at, readOnly: true }] },
    says: [new RegExp(`^\`mounts\` holds the path ${escaped(JSON.stringify(at))}, `), /not an absolute folder/, /`path\.resolve`/],
  })),
  {
    name: 'no `readOnly`',
    at: 'core',
    config: { mounts: [{ path: '/srv/a' }] },
    says: [/^`mounts` holds \/srv\/a with `readOnly: undefined`/, /true, or false to let it write/],
  },
  {
    name: 'a `readOnly` that is no boolean',
    at: 'core',
    config: { mounts: [{ path: '/srv/a', readOnly: 'yes' }] },
    says: [/^`mounts` holds \/srv\/a with `readOnly: "yes"`/, /true, or false to let it write/],
  },
  {
    name: 'a key a mount has not',
    at: 'core',
    config: { mounts: [{ path: '/srv/a', readOnly: true, mode: 'ro' }] },
    says: [/^`mounts` holds a mount with `mode`/, /`path` and `readOnly` alone/],
  },
  {
    name: 'a path given twice',
    at: 'core',
    config: {
      mounts: [
        { path: '/srv/a', readOnly: true },
        { path: '/srv/a', readOnly: false },
      ],
    },
    says: [/^`mounts` names \/srv\/a twice\./, /Give each folder once/],
  },
  {
    name: 'two folders, each in its mode, are filed on Claude Code',
    at: 'core',
    config: {
      mounts: [
        { path: '/srv/a', readOnly: true },
        { path: '/srv/b', readOnly: false },
      ],
    },
  },
  ...['command', 'remote'].map((harness): Row => ({
    name: `a read-only mount on the ${harness} harness, which cannot hold one`,
    at: 'engine',
    harness,
    config: one(true),
    says: [
      new RegExp(`^\`mounts\` gives the session /srv/a read-only, and the \`${harness}\` harness cannot hold a read-only mount`),
      /File the task on `claude` or `codex`, or leave the mount off\.$/,
    ],
  })),
  {
    name: 'a writable mount on Codex',
    at: 'engine',
    harness: 'codex',
    config: one(false),
    says: [/^`mounts` gives the session \/srv\/a writable, and the `codex` harness/, /File the task on `claude`, or leave/],
  },
  ...['danger-full-access', 'bypassPermissions'].map((permissionMode): Row => ({
    name: `a read-only mount on Codex in ${permissionMode}, which writes everywhere`,
    at: 'engine',
    harness: 'codex',
    config: { permissionMode, ...one(true) },
    says: [/^`mounts` gives the session \/srv\/a read-only, and Codex's `danger-full-access`/, /`workspace-write` or `read-only`/],
  })),
  { name: 'a read-only mount is filed on Claude Code', at: 'engine', harness: 'claude', config: one(true) },
  { name: 'a writable mount is filed on Claude Code', at: 'engine', harness: 'claude', config: one(false) },
  ...['workspace-write', 'read-only', undefined].map((permissionMode): Row => ({
    name: `a read-only mount is filed on Codex in ${permissionMode ?? 'its default sandbox'}`,
    at: 'engine',
    harness: 'codex',
    config: { ...(permissionMode ? { permissionMode } : {}), ...one(true) },
  })),
];

test('mounts: what a task may be given beyond its cwd — refused before it is journalled, its shape at both doors, its mode by the harness that cannot hold it — and what Codex is given for one', async (t) => {
  const core = coreDoor();
  const journal = memoryStore();
  const engine = builtEngine(
    Engine.layer({
      root: scratch('ae-mounts-'),
      journal: asyncStore(journal),
      harnesses: { claude: 'claude', codex, command: commandHarness, remote: { url: 'https://agent.example' } },
    }),
  );
  const journalled = async () => (await journal.list()).length;

  for (const row of ROWS) {
    await t.test(row.name, async () => {
      const spec = { brief: 'b', cwd: '/r', harness: row.harness ?? 'claude', config: row.config } as never;
      const [inEngine, inCore] = [await journalled(), await core.listed()];
      if (!row.says) {
        await Effect.runPromise(engine.file(spec));
        assert.equal(await journalled(), inEngine + 1, 'filed, and journalled once');
        if (row.at === 'core') {
          await core.run(file(spec));
          assert.equal(await core.listed(), inCore + 1, 'filed by the core, and journalled once');
        }
        return;
      }
      const refused = await Effect.runPromise(Effect.flip(engine.file(spec)));
      assert.equal(refused._tag, 'FileRefused', refused.message);
      for (const says of row.says) assert.match(refused.message, says);
      assert.equal(await journalled(), inEngine, 'nothing journalled, so no tick can spawn it');
      if (row.at === 'core') {
        const err = await core.run(Effect.flip(file(spec)));
        assert.equal(err._tag, 'FileRefused', err.message);
        assert.equal(err.message, refused.message, 'one check, one sentence, in the core and through the engine');
        assert.equal(await core.listed(), inCore, 'nothing journalled by the core');
      }
    });
  }

  await t.test('a read-only mount changes nothing Codex is given: its sandbox holds it', () => {
    const request = { name: 'ae/t/1', brief: 'b', cwd: '/r', config: { permissionMode: 'workspace-write' } };
    assert.deepEqual(codex.command({ ...request, config: { ...request.config, ...one(true) } }).args, codex.command(request).args);
  });

  await t.test("a writable mount, at Codex's own refusal, for a door that has no other harness to name", () => {
    const said = codex.refuses!({ brief: 'b', cwd: '/r', config: one(false) });
    assert.ok(said !== undefined, 'refused');
    for (const says of [/^`mounts` gives the session \/srv\/a writable/, /`--add-dir`/, /Mount the folder read-only/])
      assert.match(said, says);
  });
});
