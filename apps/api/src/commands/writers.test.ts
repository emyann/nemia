/**
 * The library's writers on the api, held to the one spec the command line parses too: each route of `agents write`, `agents copy`,
 * `agents rm`, `agents run`, `skills write`, `workflows write` and `workflows rm`, sent as the board sends it, hands its entry's
 * handler only the keys its spec gives a handler — its positionals and its flags but those the command line alone takes — and is
 * answered as it would be. The package's `test/writers-cli.test.ts` holds the command line to the same keys. And a name yours has taken
 * is refused in the one sentence both ways: by the board's `POST /api/workflows/yours`, and by `nemia workflows write` typed at the
 * command line. A factory's tree, the writers' place `factory`, is the command line's alone: each writer's route refuses it before its
 * handler.
 */
import { root } from '../../test/harness.ts';
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { TEAM } from '../../test/team.ts';
import { addFactory, COMMANDS, workflowTaken } from 'agent-orchestrator';
import type { Workflow } from 'objects';
import { app } from '../app.ts';

type Command = (typeof COMMANDS)[number];
type Args = Parameters<NonNullable<Command['handler']>>[0];

const STORE = path.join(root, 'workflows');
fs.cpSync(path.join(TEAM, 'agents'), path.join(STORE, 'agents'), { recursive: true });
fs.cpSync(path.join(TEAM, 'skills'), path.join(STORE, 'skills'), { recursive: true });
fs.cpSync(path.join(TEAM, 'dev'), path.join(STORE, 'dev'), { recursive: true });

const json = { 'content-type': 'application/json' };
const sent = (method: string, url: string, body: unknown) => app.request(url, { method, headers: json, body: JSON.stringify(body) });

/** The keys an entry's handler may be handed by either side: its positionals, and its flags but those the command line alone takes. */
const handlerKeys = (command: Command): Set<string> =>
  new Set([
    ...command.spec.positionals.map((p) => p.key),
    ...command.spec.flags.flatMap((f) => (f.only?.side !== 'cli' && f.key !== undefined ? [f.key] : [])),
  ]);

/** The answer to `request`, and the arguments each call of `name`'s handler was handed meanwhile, the handler run as it is. */
async function watched(
  t: TestContext,
  name: string,
  request: () => Response | Promise<Response>,
): Promise<{ res: Response; handed: Args[] }> {
  const command = COMMANDS.find((c) => c.name === name)!;
  const handler = command.handler.bind(command);
  const handed: Args[] = [];
  const watch = t.mock.method(command, 'handler', (args: Args, env?: never, home?: string) => {
    handed.push(args);
    return handler(args, env, home);
  });
  try {
    return { res: await request(), handed };
  } finally {
    watch.mock.restore();
  }
}

/**
 * The keys the objects' handlers hand an entry beside its spec's (definitions/): those only the api ever handed, which left the specs when
 * the routes that took them retired (`OBJECTS_HAND` in the orchestrator's writers-cli.test.ts).
 */
const OBJECTS_HAND = new Set(['draft', 'schema', 'repo', 'change', 'copy', 'builtin', 'readme', 'files']);

/** The body `res` answered, its status `status`, and each call of `name`'s handler handed only keys its spec gives a handler. */
async function heldToSpec(
  t: TestContext,
  name: string,
  status: number,
  request: () => Response | Promise<Response>,
): Promise<Record<string, unknown>> {
  const { res, handed } = await watched(t, name, request);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(res.status, status, `${name}: ${JSON.stringify(body)}`);
  assert.ok(handed.length > 0, `${name}'s route reached its handler`);
  const keys = handlerKeys(COMMANDS.find((c) => c.name === name)!);
  for (const args of handed)
    assert.deepEqual(
      Object.keys(args).filter((key) => !keys.has(key) && !OBJECTS_HAND.has(key)),
      [],
      `${name}'s route hands its handler only keys its spec gives one`,
    );
  return body;
}

const versionOf = (body: Record<string, unknown>): string => (body.metadata as { resourceVersion: string }).resourceVersion;
const D = '/api/namespaces/default';

test("each writer's route hands its handler only the keys its one spec gives a handler, and is answered as it is", async (t) => {
  const scribe = {
    description: 'Use this when a change needs its notes written.',
    keys: { model: 'sonnet' },
    instructions: 'Write it.',
  };
  const made = await heldToSpec(t, 'agents write', 201, () => sent('POST', `${D}/agents`, { metadata: { name: 'scribe' }, spec: scribe }));
  const put = await heldToSpec(t, 'agents write', 200, () =>
    sent('PUT', `${D}/agents/scribe`, {
      metadata: { resourceVersion: versionOf(made) },
      spec: { ...scribe, instructions: 'Write the notes.' },
    }),
  );
  await heldToSpec(t, 'agents run', 201, () => sent('POST', `${D}/agents/scribe/try`, { brief: 'Write the notes.' }));
  await heldToSpec(t, 'agents rm', 200, () =>
    app.request(`${D}/agents/scribe?resourceVersion=${versionOf(put)}`, { method: 'DELETE', headers: json }),
  );
  const elsewhere = scratch('nemia-api-writers-copy-');
  fs.writeFileSync(path.join(elsewhere, 'clerk.md'), '---\ndescription: Use this when notes need filing.\n---\nFile them.\n');
  await heldToSpec(t, 'agents copy', 200, () =>
    sent('POST', '/api/agents/yours/copy', { file: path.join(elsewhere, 'clerk.md'), as: 'filing-clerk', keep: [] }),
  );

  const skill = {
    title: 'Tidy notes',
    description: 'Rewrites notes.',
    tags: ['notes'],
    examples: ['tidy my notes'],
    body: 'Tidy.',
  };
  const made2 = await heldToSpec(t, 'skills write', 201, () =>
    sent('POST', `${D}/skills`, { metadata: { name: 'tidy-notes' }, spec: skill }),
  );
  await heldToSpec(t, 'skills write', 200, () =>
    sent('PUT', `${D}/skills/tidy-notes`, { metadata: { resourceVersion: versionOf(made2) }, spec: { ...skill, body: 'Tidy them.' } }),
  );

  const dev = (await (await app.request(`${D}/workflows/dev?origin=yours`)).json()) as Workflow;
  await heldToSpec(t, 'workflows write', 201, () =>
    sent('POST', `${D}/workflows`, { metadata: { name: 'dev-2' }, spec: { steps: [dev.spec.steps[0]] } }),
  );
  const changed = await heldToSpec(t, 'workflows write', 200, () =>
    sent('PUT', `${D}/workflows/dev`, { metadata: { resourceVersion: dev.metadata.resourceVersion }, spec: { steps: dev.spec.steps } }),
  );
  await heldToSpec(t, 'workflows rm', 200, () =>
    app.request(`${D}/workflows/dev?resourceVersion=${versionOf(changed)}`, { method: 'DELETE', headers: json }),
  );
});

test("a name yours has taken, a workflow or a file, is refused in workflowTaken's one sentence by the board's POST and by nemia", async () => {
  fs.cpSync(path.join(TEAM, 'dev'), path.join(STORE, 'taken'), { recursive: true });
  fs.writeFileSync(path.join(STORE, 'TAKEN.txt'), 'not a workflow\n');
  const draft = path.join(scratch('nemia-api-taken-'), 'taken');
  fs.cpSync(path.join(TEAM, 'dev'), draft, { recursive: true });
  const taken = (await (await app.request(`${D}/workflows/taken?origin=yours`)).json()) as Workflow;
  const nemia = path.join(import.meta.dirname, '../../../../packages/agent-orchestrator/bin/nemia.ts');
  for (const [name, version] of [
    ['taken', taken.metadata.resourceVersion],
    ['TAKEN.txt', null],
  ] as const) {
    const res = await sent('POST', `${D}/workflows`, { metadata: { name }, spec: { steps: [taken.spec.steps[0]] } });
    const board = ((await res.json()) as { error: string }).error;
    assert.equal(res.status, 409, board);
    const typed = spawnSync(process.execPath, [nemia, 'workflows', 'write', 'yours', name, '--folder', draft], {
      encoding: 'utf8',
      timeout: 60_000,
    });
    assert.equal(typed.status, 2, typed.stderr);
    assert.equal(typed.stderr.trim(), board, name);
    assert.equal(board, workflowTaken(path.join(STORE, name), version), name);
  }
});

test("REFUSED on the api: a write in a factory's namespace, whose own definitions the command line alone writes, is 422 the factory's way before any handler", async (t) => {
  addFactory({ name: 'writers', repos: [process.env.HKB_REPO ?? root] });
  const skill = { description: 'Use this when notes need tidying.', body: 'Tidy them.' };
  const F = '/api/namespaces/writers';
  for (const [name, method, url, body] of [
    ['agents write', 'POST', `${F}/agents`, { metadata: { name: 'scribe' }, spec: { instructions: 'Write it.' } }],
    ['skills write', 'POST', `${F}/skills`, { metadata: { name: 'tidy' }, spec: skill }],
    ['workflows write', 'POST', `${F}/workflows`, { metadata: { name: 'dev-3' }, spec: { steps: [] } }],
  ] as const) {
    const { res, handed } = await watched(t, name, () => sent(method, url, body));
    const { error, way } = (await res.json()) as { error: string; way?: string };
    assert.equal(res.status, 422, error);
    assert.equal(way, 'factory', `${method} ${url} says the factory's way`);
    assert.equal(handed.length, 0, `${method} ${url} reaches no handler of ${name}`);
  }
});
