/**
 * `nemia server upgrade [<tag> | --back]`, the client's own: the server the context in use names upgraded through its api, as the
 * board's Settings and the MCP port's `upgrade` tool upgrade it (`POST /api/upgrades`), never this machine's install, which is `nemia
 * upgrade`'s. `server` is the daemon a context names, reached through its api; `nemia service` is this machine's login unit.
 *
 * It reads the server's releases (`GET /api/version`, `GET /api/upgrades`), chooses the release (`upgradeTarget`), starts the upgrade,
 * then follows its output (`GET /api/upgrades/:id/output`) through the daemon's restart: a stream that ends without its `ended` is the
 * daemon going down, waited for until it answers again (`BACK_WITHIN_MS`) and opened again, its output printed once though a reopened
 * stream sends it from its first byte. The release the server says once it is back is said at the end, and, where this nemia is now of
 * another release (`upgradeEnd`), the machine verb that brings it level. The readiness lines the new release adds are in the output,
 * printed by the server's own `nemia upgrade`.
 *
 * Every ask but the stream goes through `askedAcross`, the release check left out: this verb repairs a mismatch and, after the restart,
 * talks to a newer daemon on purpose.
 */
import { Effect, Schema } from 'effect';
import { Answered, Upgrade, type UpgradesRead, type VersionAnswer } from 'objects';
import type { ServerUpgradeAsked, ServerUpgradeRead, UpgradeTargetRefusal } from '../../contracts/server-upgrade.contract.ts';
import { sessionHeaders, urlOf } from '../client.ts';
import { probed, served } from '../daemon.ts';
import { askedAcross } from '../objects.ts';
import { Refused } from '../refused.ts';
import { clientRelease } from '../release.ts';
import { blocksOf } from '../watch/watch.ts';
import { upgradeEnd, upgradeTarget } from './upgraded.ts';

/** The verb, as a person types it. */
export const SERVER_VERB = 'server';

/** What the verb is asked as, in its refusals and its asks. */
const ASKED_AS = 'server upgrade';

/** What `nemia server` says of itself: `server` kept apart from `service`, one letter away. */
const USAGE = [
  'nemia server upgrade [<tag>]   upgrade the server the context in use names, through its api, to <tag> or its newer release',
  'nemia server upgrade --back    take that server back to the release before the one it runs',
  '',
  'The server is the daemon a context names (`nemia config get-contexts`). This machine\'s install is upgraded with `nemia upgrade`,',
  'and its login unit is `nemia service`.',
];

/**
 * How long a server going down for its upgrade has to answer again before the follow gives up: three minutes, many times a restart
 * (seconds), so a loaded server still gets there, while a person is told within a few minutes where to read it otherwise.
 */
export const BACK_WITHIN_MS = 180_000;

/** How often the follow asks a server that went down whether it answers again. */
const POLL_MS = 500;

/** Where the follow writes: the output on `out`, what the verb says of it on `err`. */
export type Speak = { readonly out: (text: string) => void; readonly err: (text: string) => void };

const STDIO: Speak = { out: (text) => process.stdout.write(text), err: (text) => process.stderr.write(text) };

/** What the runner is given beside the words typed: this nemia's release, where it writes, and the follow's bound. */
export type ServerUpgradeSeams = { readonly client: string | null; readonly speak: Speak; readonly backWithinMs: number };

/** A `nemia server` typed otherwise than its usage: refused, exit 2, naming it. */
const misused = (said: string): Refused => new Refused(`nemia server: ${said}. Type one of:\n${USAGE.join('\n')}`);

/** The words after `upgrade`, read; refused where they are not a tag or `--back`. */
function askedOf(args: readonly string[]): ServerUpgradeAsked {
  const flags = args.filter((word) => word.startsWith('-'));
  const unknown = flags.find((word) => word !== '--back');
  if (unknown !== undefined) throw misused(`\`upgrade\` takes no ${unknown}`);
  const tags = args.filter((word) => !word.startsWith('-'));
  if (tags.length > 1) throw misused(`\`upgrade\` takes one tag, and was given ${tags.join(', ')}`);
  return { tag: tags[0] ?? null, back: flags.includes('--back') };
}

/** Why no release is asked for, as a person reads it, naming the command to type. */
const TARGET_REFUSED: Readonly<Record<UpgradeTargetRefusal, string>> = {
  'tag-and-back': '`--back` goes to the release the server names as previous, and takes no tag: type `nemia server upgrade --back`, or `nemia server upgrade <tag>`',
  'none-older': 'the server has no release older than the one it runs installed to go back to: type `nemia server upgrade <tag>` to install one',
  'below-floor': 'the store has been run by a release the previous one cannot read, so going back is refused (see Settings on the board): type `nemia server upgrade <tag>` for a release that reads it',
  'unknown-latest': 'the server has read no newer release to name (its release check is off, or it runs from a checkout): type `nemia server upgrade <tag>`',
};

/** A server older than the remote upgrade, which serves no `/api/upgrades`: refused, naming the upgrade on its own machine. */
const predates = (base: string): Refused =>
  new Refused(
    `nemia server upgrade: the server at ${base} is older than the upgrade through its api (it serves no /api/upgrades). Upgrade it once on its own machine, \`nemia upgrade <tag>\`, then type \`nemia server upgrade\` from here`,
  );

/** The server's releases as `upgradeTarget` reads them; `unserved` where it serves no `/api/upgrades`. */
async function readOf(env: NodeJS.ProcessEnv): Promise<ServerUpgradeRead | 'unserved'> {
  const [version, upgrades] = await Promise.all([
    askedAcross(ASKED_AS, (client) => client.server.version(), env),
    askedAcross(
      ASKED_AS,
      (client) =>
        client.upgrades
          .read()
          .pipe(Effect.catchIf((err) => err instanceof Answered && err.status === 404, () => Effect.succeed('unserved' as const))),
      env,
    ),
  ]);
  return upgrades === 'unserved' ? upgrades : readFrom(version, upgrades);
}

/** `version` and `upgrades` as `upgradeTarget` reads them. */
const readFrom = (version: VersionAnswer, upgrades: UpgradesRead): ServerUpgradeRead => ({
  latest: version.latest === undefined ? null : { newer: version.latest.newer, tag: version.latest.tag ?? null },
  previous: upgrades.previous === null ? null : { tag: upgrades.previous.tag, refused: upgrades.previous.refused !== undefined },
});

const decodeUpgrade = Schema.decodeUnknownSync(Upgrade);

/** How one open of the output stream ended: the `Upgrade` it ended with, closed without one (`dropped`), or not opened (`unopened`). */
type Opened = Upgrade | 'dropped' | 'unopened';

/**
 * The output of upgrade `id` at `base`, read once, each chunk printed past the `printed` characters already said (a reopened stream
 * sends from the first byte); answers how it ended and how many characters it has now said.
 */
async function streamed(
  base: string,
  id: string,
  printed: number,
  env: NodeJS.ProcessEnv,
  speak: Speak,
): Promise<{ readonly opened: Opened; readonly printed: number }> {
  let response: Response;
  try {
    response = await fetch(urlOf(base, `/api/upgrades/${encodeURIComponent(id)}/output`), {
      headers: { accept: 'text/event-stream', ...sessionHeaders(env) },
    });
  } catch {
    return { opened: 'unopened', printed };
  }
  if (!response.ok || response.body === null) {
    await response.body?.cancel();
    return { opened: 'unopened', printed };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let at = 0;
  let said = printed;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return { opened: 'dropped', printed: said };
      const { sent, rest } = blocksOf(text + decoder.decode(value, { stream: true }));
      text = rest;
      for (const s of sent) {
        if (s.event === 'ended') return { opened: decodeUpgrade(JSON.parse(s.data)), printed: said };
        if (s.event !== 'output') continue;
        const from = Math.max(0, said - at);
        if (from < s.data.length) speak.out(s.data.slice(from));
        at += s.data.length;
        said = Math.max(said, at);
      }
    }
  } catch {
    return { opened: 'dropped', printed: said };
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** Whether the daemon at `base` answers its health, polled every `POLL_MS` until `deadline`. */
async function answersBy(base: string, deadline: number, env: NodeJS.ProcessEnv): Promise<boolean> {
  for (;;) {
    if ((await probed(base, env)).probe === 'answers') return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

/** Upgrade `id` as the server says it now; undefined where it cannot be read. */
const upgradeNow = (id: string, env: NodeJS.ProcessEnv): Promise<Upgrade | undefined> =>
  askedAcross(ASKED_AS, (client) => client.upgrades.upgradeOf({ params: { id } }), env).catch(() => undefined);

/**
 * Upgrade `started` at `base` followed to its end: its stream read, and read again each time it closes without its end, once the
 * daemon answers again; the `Upgrade` it ended with, or the last read of it where the server did not come back within `withinMs`.
 */
async function followed(base: string, started: Upgrade, env: NodeJS.ProcessEnv, seams: ServerUpgradeSeams): Promise<Upgrade> {
  const deadline = Date.now() + seams.backWithinMs;
  let printed = 0;
  let restarting = false;
  let last = started;
  for (;;) {
    const read = await streamed(base, started.id, printed, env, seams.speak);
    if (typeof read.opened === 'object') return read.opened;
    printed = read.printed;
    if (!restarting) seams.speak.err(`the server at ${base} is restarting onto ${started.tag}: waiting for it to answer again\n`);
    restarting = true;
    if (!(await answersBy(base, deadline, env))) return last;
    if (read.opened === 'unopened') last = (await upgradeNow(started.id, env)) ?? last;
    if (last.phase === 'succeeded' || last.phase === 'failed' || Date.now() >= deadline) return last;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

/** What the verb says once `ended` ended at `base`, this nemia being of `client`; answers the exit code. */
async function said(base: string, ended: Upgrade, env: NodeJS.ProcessEnv, seams: ServerUpgradeSeams): Promise<number> {
  const { speak } = seams;
  const now = ended.phase === 'succeeded' ? (await probed(base, env)).release : null;
  const end = upgradeEnd(ended.phase, seams.client, now);
  if (ended.phase === 'succeeded') {
    speak.err(`the server at ${base} now runs ${now ?? ended.tag}\n`);
    if (end.behind)
      speak.err(
        `this nemia is ${seams.client ?? 'a checkout'}, and a client asks only a server of its own release: bring this machine level, \`nemia upgrade ${now ?? ended.tag}\`\n`,
      );
  } else if (ended.phase === 'failed')
    speak.err(
      `the upgrade of the server at ${base} to ${ended.tag} was refused${ended.exitCode === undefined ? '' : ` (exit ${ended.exitCode})`}: its output above names its log, and the server still runs ${ended.from ?? 'the release it ran'}\n`,
    );
  else
    speak.err(
      `the server at ${base} did not answer again within ${seams.backWithinMs / 1000} s, and its upgrade to ${ended.tag} is still ${ended.phase}: see where it stands on the board's Settings, or with \`nemia doctor\` once it answers\n`,
    );
  return end.code;
}

/** `nemia server upgrade …`, on the words after `upgrade`: answers its exit code, or throws its refusal. */
async function upgrade(args: readonly string[], env: NodeJS.ProcessEnv, seams: ServerUpgradeSeams): Promise<number> {
  const asked = askedOf(args);
  const base = await served(ASKED_AS, env, null);
  const read = await readOf(env);
  if (read === 'unserved') throw predates(base);
  const target = upgradeTarget(asked, read);
  if (target.kind === 'refused') throw new Refused(`nemia server upgrade: ${TARGET_REFUSED[target.reason]}`);
  if (target.kind === 'newest') {
    seams.speak.err(`the server at ${base} runs the newest release it knows of: nothing to upgrade\n`);
    return 0;
  }
  const started = await askedAcross(ASKED_AS, (client) => client.upgrades.start({ payload: { tag: target.tag } }), env);
  seams.speak.err(`upgrade ${started.id} of the server at ${base} to ${started.tag} started: its output follows\n`);
  return said(base, await followed(base, started, env, seams), env, seams);
}

/** `nemia server …`, on the words after `server`: `upgrade` its one subcommand, its usage on `-h` or `--help`. */
export async function server(
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  seams: ServerUpgradeSeams = { client: clientRelease(), speak: STDIO, backWithinMs: BACK_WITHIN_MS },
): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    seams.speak.out(`${USAGE.join('\n')}\n`);
    return 0;
  }
  if (args[0] !== 'upgrade') throw misused(args[0] === undefined ? 'it takes a subcommand' : `it has no subcommand ${args[0]}`);
  return upgrade(args.slice(1), env, seams);
}

/**
 * What a bare `nemia upgrade` says once it ran on this machine, under the remote context `name` whose server is `at`: that it was this
 * machine's install, and that the server is upgraded with the remote form.
 */
export const serverHint = (name: string, at: string): string =>
  `nemia upgrade is this machine's install. The server of the context ${name}, at ${at}, is upgraded from here with \`nemia server upgrade [<tag>]\`\n`;
