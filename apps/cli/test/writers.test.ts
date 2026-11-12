/**
 * The writers the client holds — `nemia workflows write`, `agents write` and `skills write` — told as a person types them: parsed and
 * helped from `objects`' `COMMAND_WORDS` here; the person's files read on this machine (`src/commands/files.ts`) and read into the kind's
 * spec by the api (`POST /api/{workflows|agents|skills}/read`, which writes nothing); then written through `create` or `replace`, against a
 * store served by the api (`served.ts`) under this machine's context and under a remote one pointed at it. A stale version is the api's
 * `Conflict`, exit 1. Each but the help, the refusals and the factory's asks the api's reads; a link in a draft folder, a skill named for
 * another and a factory write without `--factory` are refused, exit 2, naming what to type. On the `factory` place the object is proposed
 * to the factory, seen by what a stand-in of the api is asked.
 *
 * Each refusal asserts its exit code and the command or file it names, never its sentence.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { COMMAND_WORDS } from 'objects';
import { scratch } from 'test-kit/scratch';
import { ambient } from './ambient.ts';
import { configWritten } from '../src/context.ts';
import { type Said, servedStore, write } from './served.ts';

const CLI = path.join(import.meta.dirname, '..', 'bin', 'nemia.ts');
const DRAFTS = scratch('nemia-writers-drafts-');

/** The store the writes land in, served before any test begins: a root made while a test runs is reaped when it ends. */
const store = await servedStore('nemia-writers-', () => {});
after(store.stop);

/** `nemia <argv>` on `env`, waited on for its end. */
function nemia(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<Said> {
  const child = spawn(process.execPath, [CLI, ...argv], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  child.stdout.on('data', (chunk) => (out += chunk));
  child.stderr.on('data', (chunk) => (err += chunk));
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

/** The version a write printed, `at version <v>`. */
const versionIn = (said: string): string => /at version (\S+)$/m.exec(said)?.[1] ?? assert.fail(`no version in: ${said}`);

/** A draft workflow folder `name`: one step, a script it carries, and the files of `more`. */
function draftFolder(name: string, more: Readonly<Record<string, string>> = {}): string {
  const folder = path.join(DRAFTS, 'workflows', name);
  write(path.join(folder, 'only.md'), '---\nplace: git\n---\nDo it.\n');
  write(path.join(folder, 'pictures.ts'), 'process.exit(0);\n');
  for (const [file, text] of Object.entries(more)) write(path.join(folder, file), text);
  return folder;
}

const SCRIBE =
  '---\ndescription: Use this when a change needs its notes written.\nmodel: sonnet\noutput: out.json\n---\nWrite the notes.\n';
const SCHEMA = JSON.stringify({
  type: 'object',
  additionalProperties: false,
  required: ['notes'],
  properties: { notes: { type: 'string' } },
});
const TIDY = '---\nname: tidy\ndescription: Tidy a folder.\n---\nTidy it.\n';

/** A laptop with no store of its own, its scratch home and config, the start off. */
function laptop(prefix: string): NodeJS.ProcessEnv {
  const folder = scratch(prefix);
  return {
    ...ambient('NEMIA_ON_INSTALLED'),
    WF_ROOT: path.join(folder, 'store'),
    AE_ROOT: path.join(folder, 'engine'),
    HOME: path.join(folder, 'home'),
    XDG_CONFIG_HOME: path.join(folder, 'config'),
    NEMIA_DAEMON_START: 'off',
  };
}

test('`--help`, and a writer given too little, print its usage and help from `COMMAND_WORDS`, exit 0, asking nothing', async () => {
  const env = laptop('nemia-writers-help-');
  for (const words of COMMAND_WORDS) {
    for (const argv of [[...words.name.split(' '), '--help'], words.name.split(' ')]) {
      const said = await nemia(argv, env);
      assert.equal(said.code, 0, said.err);
      assert.ok(said.out.includes(`nemia ${words.name} ${words.usage}`), said.out);
      for (const line of words.help) assert.ok(said.out.includes(line), `${words.name}: ${line}`);
    }
  }
});

test('REFUSED, exit 2, before anything is asked: a flag no writer takes, `factory` without --factory, a folder that is a link or not there', async () => {
  const env = laptop('nemia-writers-refused-');
  const folder = draftFolder('linked');
  fs.symlinkSync(path.join(folder, 'pictures.ts'), path.join(folder, 'elsewhere.ts'));
  for (const [argv, named] of [
    [['workflows', 'write', 'yours', 'w', '--folder', folder, '--bogus'], /nemia workflows write/],
    [['workflows', 'write', 'factory', 'w', '--folder', folder], /--factory <name>/],
    [['workflows', 'write', 'yours', 'w', '--folder', folder], /elsewhere\.ts/],
    [['workflows', 'write', 'yours', 'w', '--folder', path.join(DRAFTS, 'nowhere')], /nowhere/],
    [['agents', 'write', 'yours', '--file', path.join(DRAFTS, 'nobody.md')], /nobody\.md/],
    [['skills', 'write', 'repo', '--file', path.join(DRAFTS, 'SKILL.md')], /nemia skills write/],
  ] as const) {
    const said = await nemia(argv, env);
    assert.equal(said.code, 2, `nemia ${argv.join(' ')}: ${said.err}`);
    assert.match(said.err, named, argv.join(' '));
    assert.equal(said.out, '');
  }
});

/** A stand-in of the api that reads a workflow and makes a proposal: what it was asked, by method and path, with each body. */
const asked: { method: string; path: string; body: unknown }[] = [];
const standIn = http.createServer((req, res) => {
  let text = '';
  req.on('data', (chunk) => (text += chunk));
  req.on('end', () => {
    const body: unknown = text === '' ? undefined : JSON.parse(text);
    asked.push({ method: req.method ?? '', path: req.url ?? '', body });
    const answer = (status: number, json: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(json));
    };
    if (req.url === '/api/health') return answer(200, { ok: true });
    if (req.method === 'POST' && req.url === '/api/workflows/read')
      return answer(200, {
        metadata: { name: 'hired' },
        spec: { steps: [], files: [{ path: 'pictures.ts', text: 'process.exit(0);\n' }] },
      });
    if (req.method === 'POST' && req.url === '/api/namespaces/shop/proposals')
      return answer(201, {
        apiVersion: 'nemia/v1',
        kind: 'Proposal',
        metadata: { name: 'person-ab12c', namespace: 'shop', creationTimestamp: '2026-11-01T00:00:00.000Z', resourceVersion: '1' },
        spec: body,
        status: { phase: 'waiting', proposedBy: { agent: 'implementer' }, changes: [], widens: false },
      });
    return answer(404, {});
  });
});
await new Promise<void>((resolve) => standIn.listen(0, '127.0.0.1', resolve));
after(() => {
  standIn.closeAllConnections();
  standIn.close();
});

test('`nemia workflows write factory <name> --factory <f>` proposes the workflow to the factory, through the call `nemia propose` makes', async () => {
  const env = laptop('nemia-writers-factory-');
  write(
    path.join(env.WF_ROOT ?? '', 'daemon.json'),
    JSON.stringify({ url: `http://127.0.0.1:${(standIn.address() as AddressInfo).port}` }),
  );
  const said = await nemia(['workflows', 'write', 'factory', 'hired', '--folder', draftFolder('hired'), '--factory', 'shop'], env);
  assert.equal(said.code, 0, said.err);
  const read = asked.find((r) => r.path === '/api/workflows/read');
  assert.deepEqual(read?.body, {
    name: 'hired',
    files: [
      { path: 'only.md', text: '---\nplace: git\n---\nDo it.\n' },
      { path: 'pictures.ts', text: 'process.exit(0);\n' },
    ],
  });
  const proposed = asked.find((r) => r.method === 'POST' && r.path === '/api/namespaces/shop/proposals');
  assert.deepEqual(proposed?.body, {
    objects: [
      {
        apiVersion: 'nemia/v1',
        kind: 'Workflow',
        metadata: { name: 'hired', namespace: 'shop' },
        spec: { steps: [], files: [{ path: 'pictures.ts', text: 'process.exit(0);\n' }] },
      },
    ],
  });
  assert.match(said.out, /nemia proposals approve person-ab12c -n shop/, 'the line that approves it');
});

test('a draft folder written, then written again at its --version, leaving a file it does not carry; a stale version refused, exit 1', async () => {
  const folder = draftFolder('notes', { 'landing.ts': 'process.exit(1);\n' });
  const made = await store.nemia(['workflows', 'write', 'yours', 'notes', '--folder', folder]);
  assert.equal(made.code, 0, made.err);
  assert.match(made.out, /^workflows\/notes created, at version \S+$/m);
  const read = await store.nemia(['get', 'workflow', 'notes', '-o', 'json']);
  assert.equal(read.code, 0, read.err);
  const served = JSON.parse(read.out) as { spec: { steps: { name: string }[] } };
  assert.deepEqual(
    served.spec.steps.map((s) => s.name),
    ['only'],
    'the GET answers its steps',
  );

  fs.rmSync(path.join(folder, 'landing.ts'));
  fs.appendFileSync(path.join(folder, 'only.md'), 'Again.\n');
  const changed = await store.nemia(['workflows', 'write', 'yours', 'notes', '--folder', folder, '--version', versionIn(made.out)]);
  assert.equal(changed.code, 0, changed.err);
  assert.match(changed.out, /^workflows\/notes written, at version \S+$/m);
  const there = path.join(store.root, 'workflows', 'notes');
  assert.match(fs.readFileSync(path.join(there, 'only.md'), 'utf8'), /Again\./);
  assert.equal(fs.readFileSync(path.join(there, 'landing.ts'), 'utf8'), 'process.exit(1);\n', 'a file the draft does not carry is left');

  const stale = await store.nemia(['workflows', 'write', 'yours', 'notes', '--folder', folder, '--version', versionIn(made.out)]);
  assert.equal(stale.code, 1, `a stale version is the api's Conflict: ${stale.err}`);
  assert.match(stale.err, /notes/);
});

test('under a remote context pointed at the served store, the same write lands there, nothing read or made on this machine', async () => {
  const exposed = await servedStore('nemia-writers-remote-', () => {}, { WF_EXPOSED: '1' });
  after(exposed.stop);
  const minted = await nemia(['token', 'add', 'laptop'], exposed.env);
  assert.equal(minted.code, 0, minted.err);
  const token = /Authorization: Bearer (\S+)/.exec(minted.out)?.[1] ?? assert.fail(minted.out);
  const env = laptop('nemia-writers-laptop-');
  configWritten({ contexts: [{ name: 'vps', server: exposed.url, token }], current: 'vps' }, env);
  const said = await nemia(['workflows', 'write', 'yours', 'away', '--folder', draftFolder('away')], env);
  assert.equal(said.code, 0, said.err);
  assert.ok(fs.existsSync(path.join(exposed.root, 'workflows', 'away', 'only.md')), 'written on the remote store');
  assert.equal(fs.existsSync(env.WF_ROOT ?? ''), false, "nothing read or made on this machine's store");
});

test('an agent whose output: names out.json beside it is written with its schema', async () => {
  const file = path.join(DRAFTS, 'agents', 'scribe.md');
  write(file, SCRIBE);
  write(path.join(DRAFTS, 'agents', 'out.json'), SCHEMA);
  const made = await store.nemia(['agents', 'write', 'yours', '--file', file]);
  assert.equal(made.code, 0, made.err);
  assert.match(made.out, /^agents\/scribe created, at version \S+$/m);
  const agents = path.join(store.root, 'workflows', 'agents');
  assert.equal(fs.readFileSync(path.join(agents, 'scribe.md'), 'utf8'), SCRIBE);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(agents, 'out.json'), 'utf8')), JSON.parse(SCHEMA));
});

test('`nemia skills write yours other --file s/SKILL.md` naming another skill is refused, exit 2, naming the skill; its own name writes it', async () => {
  const file = path.join(DRAFTS, 'skills', 'tidy', 'SKILL.md');
  write(file, TIDY);
  const other = await store.nemia(['skills', 'write', 'yours', 'other', '--file', file]);
  assert.equal(other.code, 2, other.err);
  assert.match(other.err, /tidy/);
  assert.equal(fs.existsSync(path.join(store.root, 'workflows', 'skills', 'tidy')), false, 'nothing written');
  const made = await store.nemia(['skills', 'write', 'yours', 'tidy', '--file', file]);
  assert.equal(made.code, 0, made.err);
  assert.match(made.out, /^skills\/tidy created, at version \S+$/m);
});
