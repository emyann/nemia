/**
 * `nemia pair <url> [--context <name>] [--name <client>]`: this laptop paired with the server at `url`, no token copied by hand. It asks
 * a pairing with no token (`POST /api/pair`, under the client's name, this machine's host name by default), prints the short code and
 * how the person approves it on the server (`nemia pairings approve <code>`, or the board's Setup page), and claims it with the secret
 * it was answered (`POST /api/pair/:id/claim`) every `PAIR_EVERY_MS` until the claim answers the token minted for it. The token goes
 * straight into the client's config (`configWritten`, mode 0600) as the context `--context` names, the url's host by default, which is
 * then the one in use; it is printed nowhere. A pairing that lapsed or that the server does not hold ends it, exit 1, naming `nemia
 * pair` again. Last it prints the line that points Claude Code's nemia plugin at the server, `NEMIA_URL=<url>`, for a shell profile:
 * the plugin's header comes from `nemia config headers`.
 *
 * No token of the context in use is sent to `url`: that token is another server's (`askedBare`).
 */
import os from 'node:os';
import { Effect } from 'effect';
import { Conflict, Missing } from 'objects';
import { configRead, configWritten } from './context.ts';
import { askedBare } from './objects.ts';
import { Refused } from './refused.ts';

/** The verb that pairs this client with a server: `nemia pair <url>`. */
export const PAIR_VERB = 'pair';

/** How often a pairing is claimed while it waits on the person's approval: every two seconds. */
export const PAIR_EVERY_MS = 2_000;

/** The variable that shortens the interval between claims, for a test: a whole number of milliseconds. */
export const PAIR_EVERY_VARIABLE = 'NEMIA_PAIR_EVERY_MS';

/** What `nemia pair` says of itself. */
const USAGE = 'nemia pair <url> [--context <name>] [--name <client>]   pair this machine with the server at <url>, as the context <name>';

/** A `nemia pair` typed otherwise than its usage: refused, exit 2, naming it. */
const misused = (said: string): Refused => new Refused(`nemia pair: ${said}. Type:\n${USAGE}`);

/** The value after `flag` among `args`, if typed; refused where the flag is typed with none. */
const flagOf = (args: readonly string[], flag: string): string | undefined => {
  const at = args.indexOf(flag);
  if (at < 0) return undefined;
  const value = args[at + 1];
  if (value === undefined || value.startsWith('-')) throw misused(`${flag} takes a value`);
  return value;
};

/** The server's address, read as http(s): its origin. Refused where it is not one. */
const serverOf = (typed: string | undefined): URL => {
  if (typed === undefined || typed.startsWith('-')) throw misused('it takes the server’s address first, as http://vps:7777');
  let url: URL;
  try {
    url = new URL(typed);
  } catch {
    throw misused(`${typed} is not an address, as http://vps:7777`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw misused(`it takes an http or https address, not ${typed}`);
  return url;
};

/** A pairing that ended without a token: lapsed, or unknown to the server. Refused, exit 1, naming the command to begin again. */
const ended = (server: string, why: 'lapsed' | 'unknown'): Refused =>
  new Refused(
    why === 'lapsed'
      ? `the pairing lapsed before it was approved and claimed: ask again with \`nemia pair ${server}\`, and approve the new code within its ten minutes`
      : `the server at ${server} holds no such pairing (it was claimed, or the server was reset): ask again with \`nemia pair ${server}\``,
    1,
  );

/** One claim's answer as the poll reads it: a token, still waiting, or ended. */
type Claimed =
  | { readonly kind: 'token'; readonly token: string }
  | { readonly kind: 'waiting' }
  | { readonly kind: 'ended'; readonly why: 'lapsed' | 'unknown' };

/** The pairing `id` claimed once with `secret` at `server`. */
async function claimOnce(server: string, id: string, secret: string): Promise<Claimed> {
  return askedBare('pair', server, (client) =>
    client.pair.claim({ params: { id }, payload: { secret } }).pipe(
      Effect.map((answer): Claimed => {
        if (answer.phase === 'claimed' && answer.token !== undefined) return { kind: 'token', token: answer.token };
        if (answer.phase === 'expired') return { kind: 'ended', why: 'lapsed' };
        return { kind: 'waiting' };
      }),
      Effect.catch((err) =>
        err instanceof Conflict
          ? Effect.succeed<Claimed>({ kind: 'ended', why: 'lapsed' })
          : err instanceof Missing
            ? Effect.succeed<Claimed>({ kind: 'ended', why: 'unknown' })
            : Effect.fail(err),
      ),
    ),
  );
}

/** The interval between claims `env` asks for, else `PAIR_EVERY_MS`. */
const everyOf = (env: NodeJS.ProcessEnv): number => {
  const asked = Number(env[PAIR_EVERY_VARIABLE]);
  return Number.isInteger(asked) && asked > 0 ? asked : PAIR_EVERY_MS;
};

/** `nemia pair <url> …`, on the words after `pair`: answers its exit code, or throws its refusal. */
export async function pair(args: readonly string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const url = serverOf(args[0]);
  const server = url.origin;
  const name = flagOf(args, '--context') ?? url.hostname;
  const client = flagOf(args, '--name') ?? os.hostname();
  if (name === 'local') throw misused('the context `local` is always this machine’s store: give --context another name');
  const asked = await askedBare('pair', server, (c) => c.pair.ask({ payload: { client } }));
  process.stdout.write(
    `pairing ${client} with ${server}: approve the code ${asked.code} on the server, \`nemia pairings approve ${asked.code}\`, ` +
      `or on its board's Setup page, before ${asked.expiresAt}. Waiting…\n`,
  );
  const every = everyOf(env);
  for (;;) {
    const claimed = await claimOnce(server, asked.id, asked.secret);
    if (claimed.kind === 'ended') throw ended(server, claimed.why);
    if (claimed.kind === 'token') {
      const config = configRead(env);
      const held = config.contexts.some((c) => c.name === name);
      configWritten(
        {
          ...config,
          contexts: [...config.contexts.filter((c) => c.name !== name), { name, server, token: claimed.token }],
          current: name,
        },
        env,
      );
      process.stdout.write(
        `paired: context ${name} ${held ? 'changed' : 'added'} (${server}), and in use; its token is in your nemia config, never printed.\n` +
          `For Claude Code's nemia plugin, put this line in your shell profile:\n\n  export NEMIA_URL=${server}\n`,
      );
      return 0;
    }
    await new Promise((resolve) => setTimeout(resolve, every));
  }
}
