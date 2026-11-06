/**
 * `nemia propose`, `nemia proposals approve|decline` and the session's token, against a stand-in api that answers the proposals' and the
 * delegations' endpoints as `objects`' `Api` says and records every request: the token sent as `Authorization: Bearer` where
 * `WF_SESSION_TOKEN` holds one and no header otherwise; each object stamped with the version served now, absent where none is served;
 * an undo built from the proposal's `status.before` and the objects it made; approve and decline on their endpoints; a 403 and a 401
 * refused with the exit code of every refusal; and `nemia apply` of a Delegation (created, then configured) and of a Proposal (refused,
 * naming `nemia propose`). The codes and the requests are asserted, never a sentence.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { scratch } from '../../api/test/scratch.ts';
import { sessionHeaders } from '../src/client.ts';
import type { Said } from './served.ts';

const CLI = path.join(import.meta.dirname, '..', 'bin', 'nemia.ts');

/** A request the stand-in took: its method, its path, its Authorization header and its body. */
type Took = { method: string; path: string; authorization: string | undefined; body: unknown };

const took: Took[] = [];

const meta = (name: string, namespace: string, resourceVersion: string) => ({
  name,
  namespace,
  creationTimestamp: '2026-11-01T00:00:00.000Z',
  resourceVersion,
});

const setting = { from: 'default' };

/** A Hire as the api serves it, at `version`. */
const hire = (name: string, version: string, agent: string) => ({
  apiVersion: 'nemia/v1',
  kind: 'Hire',
  metadata: meta(name, 'f1', version),
  spec: { workflow: 'tidy', step: name.split('.')[1] ?? 'build', agent },
  status: {
    filled: 'factory',
    settings: Object.fromEntries(
      ['model', 'effort', 'context', 'harness', 'permissionMode', 'allowedTools', 'disallowedTools', 'skills', 'mcp'].map((k) => [
        k,
        setting,
      ]),
    ),
  },
});

/** The hires served now, by name. */
const HIRES: Record<string, ReturnType<typeof hire>> = {
  'tidy.build': hire('tidy.build', '7', 'implementer'),
  'tidy.made': hire('tidy.made', '9', 'shipper'),
};

/** A proposal as the api serves it, of `spec`, at `phase`. */
const proposal = (name: string, phase: string, spec: unknown, extra: Record<string, unknown> = {}) => ({
  apiVersion: 'nemia/v1',
  kind: 'Proposal',
  metadata: meta(name, 'f1', '1'),
  spec,
  status: { phase, proposedBy: { agent: 'implementer' }, changes: [], widens: true, ...extra },
});

/** The proposal that applied, which `--undo` reads: it changed `tidy.build` and made `tidy.made`. */
const APPLIED = proposal(
  'implementer-old01',
  'applied',
  { objects: [] },
  {
    changes: [
      { resource: 'hires', name: 'tidy.build', verb: 'update', access: 'same' },
      { resource: 'hires', name: 'tidy.made', verb: 'create', access: 'widens' },
    ],
    before: [
      {
        apiVersion: 'nemia/v1',
        kind: 'Hire',
        metadata: { name: 'tidy.build', namespace: 'f1', resourceVersion: '3' },
        spec: { workflow: 'tidy', step: 'build', agent: 'reviewer' },
      },
    ],
  },
);

/** The delegations written, by agent. */
const delegations = new Map<string, unknown>();

const resource = (name: string, singularName: string, kind: string, namespaced = true) => ({
  name,
  singularName,
  namespaced,
  kind,
  verbs: ['get', 'list'],
});

const DISCOVERY = {
  apiVersion: 'nemia/v1',
  kind: 'APIResourceList',
  groupVersion: 'nemia/v1',
  resources: [
    resource('hires', 'hire', 'Hire'),
    resource('cards', 'card', 'Card'),
    resource('proposals', 'proposal', 'Proposal'),
    resource('delegations', 'delegation', 'Delegation'),
  ],
};

/** What the stand-in answers `method` `url` with `body`, by `authorization`: a status and a JSON body. */
function answer(method: string, url: string, body: unknown, authorization: string | undefined): [number, unknown] {
  if (authorization === 'Bearer stale') return [401, { error: 'refused', reason: 'session-ended' }];
  if (method === 'GET' && url === '/api') return [200, DISCOVERY];
  const hired = /^\/api\/namespaces\/f1\/hires\/([^/]+)$/.exec(url);
  if (method === 'GET' && hired) {
    const one = HIRES[hired[1] ?? ''];
    return one ? [200, one] : [404, { error: 'none' }];
  }
  if (method === 'POST' && url === '/api/namespaces/f1/proposals') return [201, proposal('implementer-ab12c', 'waiting', body)];
  if (method === 'GET' && url === '/api/namespaces/f1/proposals/implementer-old01') return [200, APPLIED];
  if (method === 'GET' && url.startsWith('/api/namespaces/f1/proposals/')) return [404, { error: 'none' }];
  const judged = /^\/api\/namespaces\/f1\/proposals\/([^/]+)\/(approve|decline)$/.exec(url);
  if (method === 'POST' && judged) {
    if (judged[1] === 'implementer-nope1') return [403, { error: 'refused', reason: 'person-only' }];
    return [200, proposal(judged[1] ?? '', judged[2] === 'approve' ? 'applied' : 'declined', { objects: [] })];
  }
  const delegated = /^\/api\/namespaces\/f1\/delegations\/([^/]+)$/.exec(url);
  if (delegated) {
    const agent = delegated[1] ?? '';
    if (method === 'PUT') delegations.set(agent, body);
    const spec = delegations.get(agent);
    if (spec === undefined) return [404, { error: 'none' }];
    return [200, { apiVersion: 'nemia/v1', kind: 'Delegation', metadata: meta(agent, 'f1', String(took.length)), spec }];
  }
  return [404, {}];
}

const stub = http.createServer((req, res) => {
  let text = '';
  req.on('data', (chunk) => (text += chunk));
  req.on('end', () => {
    const body: unknown = text === '' ? undefined : JSON.parse(text);
    const url = new URL(req.url ?? '/', 'http://stub').pathname;
    took.push({ method: req.method ?? '', path: url, authorization: req.headers.authorization, body });
    const [status, said] = answer(req.method ?? '', url, body, req.headers.authorization);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(said));
  });
});
await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
after(() => {
  stub.closeAllConnections();
  stub.close();
});

const root = path.join(scratch('nemia-propose-'), 'store');
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(path.join(root, 'daemon.json'), JSON.stringify({ url: `http://127.0.0.1:${(stub.address() as AddressInfo).port}` }));

/** `nemia argv` on the stand-in, with `token` as `WF_SESSION_TOKEN` where given, else none in its environment; `stdin` its input. */
function nemia(argv: readonly string[], { token, stdin }: { token?: string; stdin?: string } = {}): Promise<Said> {
  const { WF_SESSION_TOKEN: _token, OTEL_EXPORTER_OTLP_ENDPOINT: _otel, ...ambient } = process.env;
  const env = { ...ambient, WF_ROOT: root, NEMIA_DAEMON_START: 'off', ...(token !== undefined ? { WF_SESSION_TOKEN: token } : {}) };
  const run = spawn(process.execPath, [CLI, ...argv], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  run.stdout.on('data', (chunk) => (out += chunk));
  run.stderr.on('data', (chunk) => (err += chunk));
  run.stdin.end(stdin ?? '');
  return new Promise((resolve, reject) => {
    run.on('error', reject);
    run.on('close', (code) => resolve({ code, out, err }));
  });
}

/** The requests `run` sent, of those the stand-in took. */
async function sent(run: () => Promise<Said>): Promise<{ said: Said; requests: Took[] }> {
  const from = took.length;
  const said = await run();
  return { said, requests: took.slice(from) };
}

const HIRES_FILE = [
  'apiVersion: nemia/v1\nkind: Hire\nmetadata:\n  name: tidy.build\nspec:\n  workflow: tidy\n  step: build\n  agent: shipper\n',
  'apiVersion: nemia/v1\nkind: Hire\nmetadata:\n  name: tidy.fresh\nspec:\n  workflow: tidy\n  step: fresh\n  agent: shipper\n',
].join('---\n');

test('`sessionHeaders`: Authorization: Bearer <token> where WF_SESSION_TOKEN holds one, none where it is unset or empty', () => {
  assert.deepEqual(sessionHeaders({ WF_SESSION_TOKEN: 'tok' }), { authorization: 'Bearer tok' });
  assert.deepEqual(sessionHeaders({ WF_SESSION_TOKEN: '' }), {});
  assert.deepEqual(sessionHeaders({}), {});
});

test('propose sends every request with the session token, each object at the version served now, absent where none is', async () => {
  const { said, requests } = await sent(() =>
    nemia(['propose', '-f', '-', '-n', 'f1', '--at', 'run-end', '--why', 'tidy up'], { token: 'tok', stdin: HIRES_FILE }),
  );
  assert.equal(said.code, 0, said.err);
  assert.ok(requests.length > 0);
  for (const r of requests) assert.equal(r.authorization, 'Bearer tok', `${r.method} ${r.path}`);
  const post = requests.find((r) => r.method === 'POST' && r.path === '/api/namespaces/f1/proposals');
  assert.deepEqual(post?.body, {
    objects: [
      {
        apiVersion: 'nemia/v1',
        kind: 'Hire',
        metadata: { name: 'tidy.build', namespace: 'f1', resourceVersion: '7' },
        spec: { workflow: 'tidy', step: 'build', agent: 'shipper' },
      },
      {
        apiVersion: 'nemia/v1',
        kind: 'Hire',
        metadata: { name: 'tidy.fresh', namespace: 'f1' },
        spec: { workflow: 'tidy', step: 'fresh', agent: 'shipper' },
      },
    ],
    applyAt: 'run-end',
    why: 'tidy up',
  });
  assert.match(said.out, /^proposals\/implementer-ab12c waiting\b/m);
  assert.match(said.out, /\/factories\/f1\/proposals\/implementer-ab12c$/m);
});

test('propose --objects: the objects given on the line, as JSON, are proposed as a file of them would be', async () => {
  const inline = JSON.stringify({
    apiVersion: 'nemia/v1',
    kind: 'Hire',
    metadata: { name: 'tidy.fresh' },
    spec: { workflow: 'tidy', step: 'fresh', agent: 'shipper' },
  });
  const { said, requests } = await sent(() => nemia(['propose', '--objects', inline, '-n', 'f1', '--at', 'run-end'], { token: 'tok' }));
  assert.equal(said.code, 0, said.err);
  const post = requests.find((r) => r.method === 'POST' && r.path === '/api/namespaces/f1/proposals');
  assert.deepEqual(post?.body, {
    objects: [
      {
        apiVersion: 'nemia/v1',
        kind: 'Hire',
        metadata: { name: 'tidy.fresh', namespace: 'f1' },
        spec: { workflow: 'tidy', step: 'fresh', agent: 'shipper' },
      },
    ],
    applyAt: 'run-end',
  });
});

test('with WF_SESSION_TOKEN unset or empty, no request carries an Authorization header: the caller is the person', async () => {
  for (const token of [undefined, '']) {
    const { said, requests } = await sent(() =>
      nemia(['propose', '-f', '-', '-n', 'f1'], { ...(token !== undefined ? { token } : {}), stdin: HIRES_FILE }),
    );
    assert.equal(said.code, 0, said.err);
    assert.ok(requests.length > 0);
    for (const r of requests) assert.equal(r.authorization, undefined, `${r.method} ${r.path} token=${String(token)}`);
  }
});

test('propose --undo: the objects as they stood before, at the version served now, and a delete of each the proposal made', async () => {
  const { said, requests } = await sent(() => nemia(['propose', '--undo', 'implementer-old01', '-n', 'f1']));
  assert.equal(said.code, 0, said.err);
  const post = requests.find((r) => r.method === 'POST' && r.path === '/api/namespaces/f1/proposals');
  assert.deepEqual(post?.body, {
    objects: [
      {
        apiVersion: 'nemia/v1',
        kind: 'Hire',
        metadata: { name: 'tidy.build', namespace: 'f1', resourceVersion: '7' },
        spec: { workflow: 'tidy', step: 'build', agent: 'reviewer' },
      },
      { apiVersion: 'nemia/v1', kind: 'Hire', metadata: { name: 'tidy.made', namespace: 'f1', resourceVersion: '9' }, verb: 'delete' },
    ],
    why: 'undo implementer-old01',
  });
});

test('proposals approve and decline call their endpoints, each printing the phase it answered', async () => {
  for (const [action, phase] of [
    ['approve', 'applied'],
    ['decline', 'declined'],
  ] as const) {
    const { said, requests } = await sent(() => nemia(['proposals', action, 'implementer-ab12c', '-n', 'f1']));
    assert.equal(said.code, 0, said.err);
    assert.deepEqual(
      requests.map((r) => `${r.method} ${r.path}`),
      [`POST /api/namespaces/f1/proposals/implementer-ab12c/${action}`],
    );
    assert.match(said.out, new RegExp(`^proposals/implementer-ab12c ${phase}\\b`, 'm'));
  }
});

test('REFUSED: a 403 Forbidden and a 401 Unauthorized each exit 2, as every refusal of the api', async () => {
  const forbidden = await nemia(['proposals', 'approve', 'implementer-nope1', '-n', 'f1'], { token: 'tok' });
  assert.equal(forbidden.code, 2, forbidden.err);
  assert.equal(forbidden.out, '');
  const unknown = await nemia(['proposals', 'decline', 'implementer-ab12c', '-n', 'f1'], { token: 'stale' });
  assert.equal(unknown.code, 2, unknown.err);
  assert.equal(unknown.out, '');
});

test('REFUSED: propose of a kind no proposal changes (a Card) exits 2 naming `nemia apply`; no file and no undo exits 2', async () => {
  const card = await nemia(['propose', '-f', '-', '-n', 'f1'], {
    stdin: 'apiVersion: nemia/v1\nkind: Card\nmetadata:\n  name: c\nspec:\n  body: x\n',
  });
  assert.equal(card.code, 2, card.err);
  assert.match(card.err, /nemia apply -f/);
  const none = await nemia(['propose', '-n', 'f1']);
  assert.equal(none.code, 2, none.err);
  assert.match(none.err, /nemia propose -f/);
});

test('apply of a Delegation: created by its PUT where none is, then configured', async () => {
  const delegation = (verbs: string) =>
    `apiVersion: nemia/v1\nkind: Delegation\nmetadata:\n  name: reviewer\n  namespace: f1\nspec:\n  rules:\n    - resources: [workflows]\n      resourceNames: []\n      verbs: [${verbs}]\n`;
  const made = await sent(() => nemia(['apply', '-f', '-'], { stdin: delegation('update') }));
  assert.equal(made.said.code, 0, made.said.err);
  assert.equal(made.said.out, 'delegations/reviewer created\n');
  assert.ok(made.requests.some((r) => r.method === 'PUT' && r.path === '/api/namespaces/f1/delegations/reviewer'));
  const changed = await nemia(['apply', '-f', '-'], { stdin: delegation('create, update') });
  assert.equal(changed.code, 0, changed.err);
  assert.equal(changed.out, 'delegations/reviewer configured\n');
  const again = await nemia(['apply', '-f', '-'], { stdin: delegation('create, update') });
  assert.equal(again.out, 'delegations/reviewer unchanged\n');
});

test('REFUSED: apply of a Proposal exits 2 naming `nemia propose`, and writes nothing', async () => {
  const { said, requests } = await sent(() =>
    nemia(['apply', '-f', '-'], {
      stdin: 'apiVersion: nemia/v1\nkind: Proposal\nmetadata:\n  name: mine\n  namespace: f1\nspec:\n  objects: []\n',
    }),
  );
  assert.equal(said.code, 2, said.err);
  assert.match(said.err, /nemia propose/);
  assert.ok(requests.every((r) => r.method === 'GET'));
});

test('`nemia propose --help` and `nemia proposals --help` are their own; `--local` is refused exit 2 naming `nemia service status`', async () => {
  for (const verb of ['propose', 'proposals']) {
    const help = await nemia([verb, '--help']);
    assert.equal(help.code, 0, help.err);
    assert.match(help.out, new RegExp(`^nemia ${verb} `));
    const local = await nemia([verb, '--local']);
    assert.equal(local.code, 2, local.err);
    assert.match(local.err, /nemia service status/);
  }
});
