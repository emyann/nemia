/**
 * `nemia readiness [--json]` and `nemia readiness fix <need> …`, the client's own: the readiness read of the server the context in use
 * names (`GET /api/readiness`), and a fix started there and followed to its end. The read adds the laptop's own pieces under the area
 * `client`, which no server can see: under a remote context, whether its server takes a connection (`server-reached`) and whether it
 * takes the context's token (`token-accepted`); and whether `~/.local/bin`, where the installer puts `nemia`, is on PATH
 * (`local-bin-on-path`). A server that takes no connection is a missing piece, not a refusal: the read still prints what the laptop
 * knows. It exits 1 while a run waits on a missing piece (`runsWait`), 0 otherwise, a piece advised missing or not, so a script can
 * wait on it.
 *
 * `nemia readiness fix <need> [--factory <f>] [--workflow <w>] [--index <n>] [--answer <name>=<value>]…` starts the fix (`POST
 * /api/readiness/fixes`), the answers its asks need given by `--answer` or, at a terminal, asked there, then follows its output
 * (`GET /api/readiness/fixes/:id/output`, server-sent `output` chunks and the `ended` Fix), printing it as it comes; a line that
 * holds the code the fix declares (`code`, a pattern: a device code) is shown again on its own, spaced, to be read across a room. It
 * exits 0 when the fix succeeded, 1 otherwise. With `--local` the orchestrator's own `readiness` reads this machine's store in process
 * (`routeOf`).
 */
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { Effect, Schema } from 'effect';
import { HttpClientError } from 'effect/http';
import {
  Fix,
  READINESS_AREAS,
  readinessSaid,
  runsWait,
  type Readiness,
  type ReadinessCost,
  type ReadinessFix,
  type ReadinessPiece,
  Unauthorized,
} from 'objects';
import { sessionHeaders, urlOf } from './client.ts';
import { chosenOf, unheld } from './context.ts';
import { probe, served } from './daemon.ts';
import { asked } from './objects.ts';
import { Refused } from './refused.ts';
import { blocksOf } from './watch/watch.ts';

/** What `nemia readiness` says of itself. */
const USAGE = [
  'nemia readiness [--json]            what the server needs to run, and this laptop, each in place or missing',
  'nemia readiness fix <need> [--factory <f>] [--workflow <w>] [--index <n>] [--answer <name>=<value>]…',
  '                                    start the fix of <need> on the server and follow its output',
  'nemia readiness --local             read this machine’s store in process',
];

/** A `nemia readiness` typed otherwise than its usage: refused, exit 2, naming it. */
const misused = (said: string): Refused => new Refused(`nemia readiness: ${said}. Type one of:\n${USAGE.join('\n')}`);

/** The client's own pieces' names. */
export const CLIENT_PIECES = ['server-reached', 'token-accepted', 'local-bin-on-path'] as const;

/** One of `CLIENT_PIECES`. */
export type ClientPiece = (typeof CLIENT_PIECES)[number];

/**
 * What each of the client's pieces costs while missing: no run is started from here on a server it cannot reach or that refuses its
 * token, and `nemia` off PATH is advised, since it runs by its whole path still.
 */
const CLIENT_COSTS: Record<ClientPiece, ReadinessCost> = {
  'server-reached': 'run',
  'token-accepted': 'run',
  'local-bin-on-path': 'client',
};

/** A piece of the area `client`, its cost as `CLIENT_COSTS` declares it. */
const piece = (name: ClientPiece, state: ReadinessPiece['state'], message: string, command?: string): ReadinessPiece => ({
  name,
  area: 'client',
  state,
  message,
  fixes: command === undefined ? [] : [{ message, command, startable: false }],
  cost: CLIENT_COSTS[name],
});

/** Whether `~/.local/bin` of `env`'s home is a folder of its PATH. */
function localBinPiece(env: NodeJS.ProcessEnv): ReadinessPiece {
  const home = env.HOME !== undefined && env.HOME !== '' ? env.HOME : os.homedir();
  const bin = path.join(home, '.local', 'bin');
  const on = (env.PATH ?? '').split(path.delimiter).some((folder) => path.resolve(folder) === bin);
  return on
    ? piece('local-bin-on-path', 'met', `${bin} is on PATH`)
    : piece(
        'local-bin-on-path',
        'missing',
        `${bin}, where the installer puts nemia, is not on PATH: add it in your shell profile`,
        `export PATH="$HOME/.local/bin:$PATH"`,
      );
}

/** Whether a failure of the typed client is the api refusing the token presented: a 401. */
const tokenRefused = (err: unknown): boolean =>
  err instanceof Unauthorized || (HttpClientError.isHttpClientError(err) && 'response' in err.reason && err.reason.response.status === 401);

/** The server's read, or that it refused the token, asked of the daemon the context in use names. */
const serverRead = (env: NodeJS.ProcessEnv): Promise<Readiness | 'refused'> =>
  asked(
    'readiness',
    (client) =>
      client.readiness.read().pipe(Effect.catch((err) => (tokenRefused(err) ? Effect.succeed('refused' as const) : Effect.fail(err)))),
    env,
  );

/**
 * The read as this client prints it: the server's pieces where it answered, then the client's, `ready` over them all, and whether a
 * run was ever started on the server, as it answered.
 */
export async function readinessRead(env: NodeJS.ProcessEnv = process.env): Promise<Readiness> {
  const chosen = chosenOf(env);
  if (chosen.kind === 'refused') throw unheld(chosen.name);
  const pieces: ReadinessPiece[] = [];
  const client: ReadinessPiece[] = [];
  let ran: boolean | undefined;
  if (chosen.kind === 'remote') {
    const reached = (await probe(chosen.server, env)) !== 'refused';
    client.push(
      reached
        ? piece('server-reached', 'met', `the context ${chosen.name} reaches its server, ${chosen.server}`)
        : piece(
            'server-reached',
            'missing',
            `the server of the context ${chosen.name}, ${chosen.server}, takes no connection: see that it runs there (\`nemia service status\` on its machine), and check its address`,
            'nemia config get-contexts',
          ),
    );
    const read = reached ? await serverRead(env) : undefined;
    if (read === undefined) client.push(piece('token-accepted', 'unknown', 'the token is not tried: the server takes no connection'));
    else if (read === 'refused')
      client.push(
        piece(
          'token-accepted',
          'missing',
          `${chosen.server} does not take the token of the context ${chosen.name}: pair this machine again`,
          `nemia pair ${chosen.server} --context ${chosen.name}`,
        ),
      );
    else {
      client.push(piece('token-accepted', 'met', `${chosen.server} takes the token of the context ${chosen.name}`));
      pieces.push(...read.pieces);
      ran = read.ran;
    }
  } else {
    const read = await serverRead(env);
    if (read === 'refused')
      client.push(
        piece(
          'token-accepted',
          'missing',
          'this machine’s store is exposed and asks a token of its own machine too: keep one for it',
          'nemia config set-context local --token-file <file>',
        ),
      );
    else {
      pieces.push(...read.pieces);
      ran = read.ran;
    }
  }
  client.push(localBinPiece(env));
  const all = [...pieces, ...client];
  return { ready: all.every((p) => p.state !== 'missing'), pieces: all, ...(ran === undefined ? {} : { ran }) };
}

/** The command that starts a startable fix of `p` from this client. */
const fixCommand = (p: ReadinessPiece, fix: ReadinessFix): string =>
  [
    `nemia readiness fix ${p.name}`,
    ...(p.factory === undefined ? [] : [`--factory ${p.factory}`]),
    ...(p.workflow === undefined ? [] : [`--workflow ${p.workflow}`]),
    ...(fix.index === undefined || fix.index === 0 ? [] : [`--index ${fix.index}`]),
  ].join(' ');

/** A piece's lines: its state, name, where it is and message, and under it each fix's command where it is not met. */
function pieceLines(p: ReadinessPiece): string[] {
  const where = p.factory === undefined ? '' : ` (${[p.factory, p.workflow].filter((w) => w !== undefined).join('/')})`;
  const head = `  ${p.state.padEnd(8)} ${p.name}${where}: ${p.message}`;
  if (p.state === 'met') return [head];
  return [
    head,
    ...p.fixes.map((fix) =>
      fix.startable
        ? `           start: ${fixCommand(p, fix)}   (${fix.message}: the server runs \`${fix.command}\`)`
        : `           fix: ${fix.command}   (${fix.message})`,
    ),
  ];
}

/** The read's lines: each area holding a piece, its pieces (`pieceLines`), and last whether a run waits on it (`readinessSaid`). */
export function readinessLines(read: Readiness): string[] {
  const lines = READINESS_AREAS.flatMap((area) => {
    const ofArea = read.pieces.filter((p) => p.area === area);
    return ofArea.length === 0 ? [] : [area, ...ofArea.flatMap(pieceLines)];
  });
  return [...lines, '', readinessSaid(read)];
}

/** What `nemia readiness fix` was typed with. */
type FixTyped = {
  readonly need: string;
  readonly factory?: string;
  readonly workflow?: string;
  readonly index?: number;
  readonly answers: Readonly<Record<string, string>>;
};

/** One `--answer <name>=<value>` read into `answers`: refused where it is not of that form. */
function answerRead(value: string, answers: Record<string, string>): void {
  const eq = value.indexOf('=');
  if (eq <= 0) throw misused(`--answer takes <name>=<value>, not ${value}`);
  answers[value.slice(0, eq)] = value.slice(eq + 1);
}

/** The words after `readiness fix` read: refused where one is not of its usage. */
function fixTyped(args: readonly string[]): FixTyped {
  const [need, ...rest] = args;
  if (need === undefined || need.startsWith('-')) throw misused('fix takes the need’s name first');
  const typed: { factory?: string; workflow?: string; index?: number } = {};
  const answers: Record<string, string> = {};
  for (let i = 0; i < rest.length; i += 2) {
    const [flag, value] = [rest[i], rest[i + 1]];
    if (value === undefined) throw misused(`${flag} takes a value`);
    if (flag === '--factory') typed.factory = value;
    else if (flag === '--workflow') typed.workflow = value;
    else if (flag === '--answer') answerRead(value, answers);
    else if (flag !== '--index') throw misused(`fix has no flag ${flag}`);
    else if (/^\d+$/.test(value)) typed.index = Number(value);
    else throw misused(`--index takes a whole number, not ${value}`);
  }
  return { need, ...typed, answers };
}

/** The fix the read holds for what was typed: the need's piece, matched on the factory and workflow typed, and its fix by index. */
function fixFound(read: Readiness, typed: FixTyped): ReadinessFix | undefined {
  const p = read.pieces.find(
    (one) =>
      one.name === typed.need &&
      (typed.factory === undefined || one.factory === typed.factory) &&
      (typed.workflow === undefined || one.workflow === typed.workflow),
  );
  const startable = (p?.fixes ?? []).filter((fix) => fix.startable);
  return typed.index === undefined ? startable[0] : startable.find((fix) => (fix.index ?? 0) === typed.index);
}

/**
 * The answers to `fix`'s asks: those typed, and each other asked at the terminal where one is attached; refused, naming the flag of
 * each, where there is none to ask on.
 */
async function answersOf(fix: ReadinessFix | undefined, typed: FixTyped): Promise<Readonly<Record<string, string>>> {
  const left = (fix?.asks ?? []).filter((ask) => !(ask.name in typed.answers));
  if (left.length === 0) return typed.answers;
  if (process.stdin.isTTY !== true)
    throw misused(
      `the fix of ${typed.need} asks ${left.map((a) => a.name).join(', ')}: give ${left.map((a) => `--answer ${a.name}=<value>`).join(' ')}`,
    );
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answers: Record<string, string> = { ...typed.answers };
  try {
    for (const ask of left) answers[ask.name] = (await terminal.question(`${ask.message} (${ask.name}): `)).trim();
  } finally {
    terminal.close();
  }
  return answers;
}

const decodeFix = Schema.decodeUnknownSync(Fix);

/** A pattern of a code, as a fix declares it; none where it is not one. */
const patternOf = (code: string | undefined): RegExp | undefined => {
  if (code === undefined || code === '') return undefined;
  try {
    return new RegExp(code);
  } catch {
    return undefined;
  }
};

/** Prints `chunk` as it came, and each whole line holding `code`'s match again on its own, spaced. Answers what is left of a line. */
function printed(chunk: string, carried: string, code: RegExp | undefined): string {
  process.stdout.write(chunk);
  const lines = (carried + chunk).split('\n');
  const rest = lines.pop() ?? '';
  for (const line of lines) shown(line, code);
  return rest;
}

/** `line`'s code, where it holds one, printed again on a line of its own, spaced, and bold at a terminal. */
function shown(line: string, code: RegExp | undefined): void {
  const match = code?.exec(line)?.[0];
  if (match === undefined || match === '') return;
  const big = process.stdout.isTTY === true ? `\u001b[1m${match.split('').join(' ')}\u001b[0m` : match;
  process.stdout.write(`\n\n        ${big}\n\n`);
}

/** How a fix's output ended: its Fix, where the stream said; none where the stream ended without saying. */
async function followed(base: string, id: string, code: RegExp | undefined, env: NodeJS.ProcessEnv): Promise<Fix | undefined> {
  let response: Response;
  try {
    response = await fetch(urlOf(base, `/api/readiness/fixes/${encodeURIComponent(id)}/output`), {
      headers: { accept: 'text/event-stream', ...sessionHeaders(env) },
    });
  } catch {
    return undefined;
  }
  if (!response.ok || response.body === null) return undefined;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let line = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return undefined;
      const { sent, rest } = blocksOf(text + decoder.decode(value, { stream: true }));
      text = rest;
      for (const s of sent) {
        if (s.event === 'output') line = printed(s.data, line, code);
        if (s.event === 'ended') {
          shown(line, code);
          return decodeFix(JSON.parse(s.data));
        }
      }
    }
  } catch {
    return undefined;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** `nemia readiness fix <need> …`: the fix started and followed; 0 where it succeeded, 1 otherwise. */
async function fix(args: readonly string[], env: NodeJS.ProcessEnv): Promise<number> {
  const typed = fixTyped(args);
  const read = await serverRead(env);
  if (read === 'refused') throw new Refused('the server does not take this context’s token: pair this machine again, `nemia pair <url>`');
  const declared = fixFound(read, typed);
  const answers = await answersOf(declared, typed);
  const payload = {
    need: typed.need,
    ...(typed.factory === undefined ? {} : { factory: typed.factory }),
    ...(typed.workflow === undefined ? {} : { workflow: typed.workflow }),
    ...(typed.index === undefined ? {} : { index: typed.index }),
    ...(Object.keys(answers).length === 0 ? {} : { answers }),
  };
  const started = await asked('readiness fix', (client) => client.readiness.fix({ payload }), env);
  process.stderr.write(`fix ${started.id} of ${typed.need} started: its output follows\n`);
  const base = await served('readiness fix', env);
  const ended =
    (await followed(base, started.id, patternOf(started.code ?? declared?.code), env)) ??
    (await asked('readiness fix', (client) => client.readiness.fixOf({ params: { id: started.id } }), env));
  if (ended.phase === 'succeeded') {
    process.stderr.write(`fix ${ended.id} of ${typed.need} succeeded: see the read again with \`nemia readiness\`\n`);
    return 0;
  }
  process.stderr.write(
    ended.phase === 'failed'
      ? `fix ${ended.id} of ${typed.need} failed${ended.exitCode === undefined ? '' : ` (exit ${ended.exitCode})`}: read its output above, then \`nemia readiness\`\n`
      : `fix ${ended.id} of ${typed.need} is still ${ended.phase}, its output no longer followed: see where it stands with \`nemia readiness\`\n`,
  );
  return 1;
}

/** `nemia readiness …`, on the words after `readiness`: answers its exit code, or throws its refusal. */
export async function readiness(args: readonly string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  if (args[0] === 'fix') return fix(args.slice(1), env);
  if (args.includes('-h')) {
    process.stdout.write(`${USAGE.join('\n')}\n`);
    return 0;
  }
  const unknown = args.find((word) => word !== '--json');
  if (unknown !== undefined) throw misused(`it reads no ${unknown}`);
  const read = await readinessRead(env);
  process.stdout.write(args.includes('--json') ? `${JSON.stringify(read, null, 2)}\n` : `${readinessLines(read).join('\n')}\n`);
  return runsWait(read) ? 1 : 0;
}
