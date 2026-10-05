import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { Engine } from '../index.ts';
import { codex } from './codex/codex.ts';
import { commandHarness } from './command/command.ts';
import { scratch } from '../../test/scratch.ts';
import { builtEngine } from '../../test/engine.ts';

/** What `file` says of a task with `config`, at the engine's default harnesses: `filed`, or its refusal; and what the store then holds. */
const filed = async (config: unknown, harness = 'claude') => {
  const root = scratch('ae-mounts-');
  const engine = builtEngine(Engine.layer({ root }));
  const said = await Effect.runPromise(
    engine.file({ brief: 'b', cwd: root, harness, config } as never).pipe(
      Effect.map(() => 'filed'),
      Effect.catchTag('FileRefused', (err) => Effect.succeed(err.message)),
    ),
  );
  return { said, journalled: (await Effect.runPromise(engine.list())).views.length };
};

test('REFUSED at shipped defaults: a mount that is not one — not a list, a relative path, a NUL, no `readOnly`, a `readOnly` that is no boolean, a key a mount has not, a path given twice — and nothing is journalled', async () => {
  const nul = `/srv/a${String.fromCharCode(0)}b`;
  const cases: [unknown, string][] = [
    [{}, '`mounts: {}` is not a list of mounts. Give a list, like [{ "path": "/srv/repo", "readOnly": true }], or leave it out.'],
    [['/srv'], '`mounts` holds "/srv", which is not a mount. Give an object, like { "path": "/srv/repo", "readOnly": true }.'],
    [
      [{ path: 'rel', readOnly: true }],
      '`mounts` holds the path "rel", which is not an absolute folder. Name the folder by its absolute path, as `path.resolve` gives it, like "/srv/repo".',
    ],
    [
      [{ path: '/srv/a/', readOnly: true }],
      '`mounts` holds the path "/srv/a/", which is not an absolute folder. Name the folder by its absolute path, as `path.resolve` gives it, like "/srv/repo".',
    ],
    [
      [{ path: nul, readOnly: true }],
      `\`mounts\` holds the path ${JSON.stringify(nul)}, which is not an absolute folder. Name the folder by its absolute path, as \`path.resolve\` gives it, like "/srv/repo".`,
    ],
    [
      [{ path: '/srv/a' }],
      '`mounts` holds /srv/a with `readOnly: undefined`. Say whether the session may only read it: true, or false to let it write there.',
    ],
    [
      [{ path: '/srv/a', readOnly: 'yes' }],
      '`mounts` holds /srv/a with `readOnly: "yes"`. Say whether the session may only read it: true, or false to let it write there.',
    ],
    [
      [{ path: '/srv/a', readOnly: true, mode: 'ro' }],
      '`mounts` holds a mount with `mode`, which a mount does not have. A mount has `path` and `readOnly` alone.',
    ],
    [
      [
        { path: '/srv/a', readOnly: true },
        { path: '/srv/a', readOnly: false },
      ],
      '`mounts` names /srv/a twice. Give each folder once, with the one mode it is mounted in.',
    ],
  ];
  for (const [mounts, words] of cases) {
    const { said, journalled } = await filed({ mounts });
    assert.equal(said, words, JSON.stringify(mounts));
    assert.equal(journalled, 0, 'nothing journalled');
  }
  const { said, journalled } = await filed({
    mounts: [
      { path: '/srv/a', readOnly: true },
      { path: '/srv/b', readOnly: false },
    ],
  });
  assert.equal(said, 'filed', 'two folders, each in its mode, are filed on Claude Code');
  assert.equal(journalled, 1);
});

test('REFUSED at shipped defaults: a mount on a harness that cannot hold its mode — a command, a remote agent, a writable one on Codex — naming the harnesses that do', async () => {
  const root = scratch('ae-mounts-');
  const harnesses = { claude: 'claude', codex, command: commandHarness, remote: { url: 'https://agent.example' } } as const;
  const engine = builtEngine(Engine.layer({ root, harnesses }));
  const says = (harness: string, readOnly: boolean) =>
    Effect.runPromise(
      engine.file({ brief: 'b', cwd: root, harness, config: { mounts: [{ path: '/srv/a', readOnly }] } }).pipe(
        Effect.map(() => 'filed'),
        Effect.catchTag('FileRefused', (err) => Effect.succeed(err.message)),
      ),
    );
  for (const harness of ['command', 'remote']) {
    assert.equal(
      await says(harness, true),
      `\`mounts\` gives the session /srv/a read-only, and the \`${harness}\` harness cannot hold a read-only mount: its session would not reach the folder as asked. File the task on \`claude\` or \`codex\`, or leave the mount off.`,
      harness,
    );
  }
  assert.equal(
    await says('codex', false),
    '`mounts` gives the session /srv/a writable, and the `codex` harness cannot hold a writable mount: its session would not reach the folder as asked. File the task on `claude`, or leave the mount off.',
  );
  assert.equal(await says('claude', true), 'filed');
  assert.equal(await says('claude', false), 'filed');
  assert.equal(await says('codex', true), 'filed');
});

test("REFUSED at shipped defaults: a read-only mount on Codex's danger-full-access, which writes everywhere; held in its other sandboxes, given no flag", async () => {
  for (const permissionMode of ['danger-full-access', 'bypassPermissions']) {
    const { said } = await filed({ permissionMode, mounts: [{ path: '/srv/a', readOnly: true }] }, 'codex');
    assert.equal(
      said,
      "`mounts` gives the session /srv/a read-only, and Codex's `danger-full-access` sandbox writes everywhere. Name the `workspace-write` or `read-only` sandbox as `permissionMode`, or leave the mount off.",
      permissionMode,
    );
  }
  for (const permissionMode of ['workspace-write', 'read-only', undefined]) {
    const { said } = await filed({ permissionMode, mounts: [{ path: '/srv/a', readOnly: true }] }, 'codex');
    assert.equal(said, 'filed', String(permissionMode));
  }
  const request = { name: 'ae/t/1', brief: 'b', cwd: '/r', config: { permissionMode: 'workspace-write' } };
  assert.deepEqual(
    codex.command({ ...request, config: { ...request.config, mounts: [{ path: '/srv/a', readOnly: true }] } }).args,
    codex.command(request).args,
    'a read-only mount is held by the sandbox, and changes nothing Codex is given',
  );
  assert.equal(
    codex.refuses!({ brief: 'b', cwd: '/r', config: { mounts: [{ path: '/srv/a', readOnly: false }] } }),
    '`mounts` gives the session /srv/a writable, and Codex can write only its workspace: `--add-dir`, which would widen it, is rejected when a session is resumed. Mount the folder read-only, or file the task on Claude Code.',
    "Codex's own refusal, for a door that has no other harness to name",
  );
});
