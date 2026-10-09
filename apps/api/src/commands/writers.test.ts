/**
 * The library's writers on the api, held to the one spec the command line parses too: each route of `agents write`, `agents copy`,
 * `agents remove`, `agents try`, `skills write`, `workflows write` and `workflows remove`, sent as the board sends it, hands its entry's
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
import { COMMANDS, workflowTaken } from 'agent-orchestrator';
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
      Object.keys(args).filter((key) => !keys.has(key)),
      [],
      `${name}'s route hands its handler only keys its spec gives one`,
    );
  return body;
}

const versionOf = (body: Record<string, unknown>, key: string): string => (body[key] as { version: string }).version;

test("each writer's route hands its handler only the keys its one spec gives a handler, and is answered as it is", async (t) => {
  const scribe = {
    name: 'scribe',
    description: 'Use this when a change needs its notes written.',
    keys: { model: 'sonnet' },
    body: 'Write it.',
  };
  const made = await heldToSpec(t, 'agents write', 201, () => sent('POST', '/api/agents/yours', scribe));
  const put = await heldToSpec(t, 'agents write', 200, () =>
    sent('PUT', '/api/agents/yours/scribe', { ...scribe, body: 'Write the notes.', version: versionOf(made, 'agent') }),
  );
  await heldToSpec(t, 'agents try', 201, () => sent('POST', '/api/agents/yours/scribe/try', { brief: 'Write the notes.' }));
  await heldToSpec(t, 'agents remove', 200, () => sent('DELETE', '/api/agents/yours/scribe', { version: versionOf(put, 'agent') }));
  const elsewhere = scratch('nemia-api-writers-copy-');
  fs.writeFileSync(path.join(elsewhere, 'clerk.md'), '---\ndescription: Use this when notes need filing.\n---\nFile them.\n');
  await heldToSpec(t, 'agents copy', 200, () =>
    sent('POST', '/api/agents/yours/copy', { file: path.join(elsewhere, 'clerk.md'), as: 'filing-clerk', keep: [] }),
  );

  const skill = {
    name: 'tidy-notes',
    title: 'Tidy notes',
    description: 'Rewrites notes.',
    tags: ['notes'],
    examples: ['tidy my notes'],
    body: 'Tidy.',
  };
  await heldToSpec(t, 'skills write', 201, () => sent('POST', '/api/skills/yours', { skill }));
  const page = (await (await app.request('/api/skills/yours/tidy-notes')).json()) as { version: string };
  await heldToSpec(t, 'skills write', 200, () =>
    sent('PUT', '/api/skills/yours/tidy-notes', { skill: { ...skill, body: 'Tidy them.' }, version: page.version }),
  );

  const listed = (await (await app.request('/api/workflows')).json()) as Array<{
    name: string;
    from: string;
    steps: unknown[];
    version: string;
  }>;
  const dev = listed.find((w) => w.name === 'dev' && w.from === 'yours')!;
  await heldToSpec(t, 'workflows write', 201, () => sent('POST', '/api/workflows/yours', { name: 'dev-2', step: dev.steps[0] }));
  const changed = await heldToSpec(t, 'workflows write', 200, () =>
    sent('PUT', '/api/workflows/yours/dev', { steps: dev.steps, version: dev.version }),
  );
  await heldToSpec(t, 'workflows remove', 200, () =>
    sent('DELETE', '/api/workflows/yours/dev', { version: versionOf(changed, 'workflow') }),
  );
});

test("a name yours has taken, a workflow or a file, is refused in workflowTaken's one sentence by the board's POST and by nemia", async () => {
  fs.cpSync(path.join(TEAM, 'dev'), path.join(STORE, 'taken'), { recursive: true });
  fs.writeFileSync(path.join(STORE, 'TAKEN.txt'), 'not a workflow\n');
  const draft = path.join(scratch('nemia-api-taken-'), 'taken');
  fs.cpSync(path.join(TEAM, 'dev'), draft, { recursive: true });
  const listed = (await (await app.request('/api/workflows')).json()) as Array<{
    name: string;
    from: string;
    steps: unknown[];
    version: string;
  }>;
  const taken = listed.find((w) => w.name === 'taken' && w.from === 'yours')!;
  const nemia = path.join(import.meta.dirname, '../../../../packages/agent-orchestrator/bin/nemia.ts');
  for (const [name, version] of [
    ['taken', taken.version],
    ['TAKEN.txt', null],
  ] as const) {
    const res = await sent('POST', '/api/workflows/yours', { name, step: taken.steps[0] });
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

test("REFUSED on the api: a writer's place `factory`, a factory's tree, which the command line alone writes, is 400 before any handler", async (t) => {
  const skill = { name: 'tidy', description: 'Use this when notes need tidying.', body: 'Tidy them.' };
  for (const [name, method, url, body] of [
    ['agents write', 'POST', '/api/agents/factory', { name: 'scribe', body: 'Write it.' }],
    ['agents write', 'PUT', '/api/agents/factory/scribe', { body: 'Write it.', version: 'v' }],
    ['skills write', 'POST', '/api/skills/factory', { skill }],
    ['skills write', 'PUT', '/api/skills/factory/tidy', { skill, version: 'v' }],
    ['workflows write', 'POST', '/api/workflows/factory', { name: 'dev-3' }],
    ['workflows write', 'PUT', '/api/workflows/factory/dev', { steps: [], version: 'v' }],
  ] as const) {
    const { res, handed } = await watched(t, name, () => sent(method, url, body));
    const { error } = (await res.json()) as { error: string };
    assert.equal(res.status, 400, error);
    assert.match(error, new RegExp(`^${method} ${url}: .*yours.*named "factory"`), `${method} ${url} says the board writes yours`);
    assert.equal(handed.length, 0, `${method} ${url} reaches no handler of ${name}`);
  }
});
