import { everyOf, MAX_EVERY_MS } from 'agent-orchestrator';

/** The port the api listens on when `PORT` is not set and it ticks: the daemon's, the one the web app's preview points at. */
export const DEFAULT_PORT = 8787;

/**
 * The port an api started with `--no-tick` listens on when `PORT` is not set: the one the web app's dev proxy points at, so a board
 * served beside the daemon (`npm run dev`) does not ask for the daemon's.
 */
export const VIEWER_PORT = 8788;

/** The one flag the api takes: it serves the board and ticks nothing, holding no lease on the store. */
export const NO_TICK = '--no-tick';

/**
 * What the api's process does, read off its arguments: with none it ticks the store every `DEFAULT_EVERY_MS`; with one interval in
 * whole milliseconds, as `nemia up [ms]` takes it (`everyOf`), it ticks at that; with `--no-tick` it ticks nothing. Anything else — an
 * interval beside `--no-tick` among it — is refused (exit 2), naming the flag and the interval there are, rather than read as a daemon
 * started by mistake.
 */
export function argsOf(argv: readonly string[]): { ticks: false } | { ticks: true; every: number } {
  const [only] = argv;
  if (argv.length === 1 && only === NO_TICK) return { ticks: false };
  const asked =
    argv.length === 0 ? everyOf(undefined) : argv.length === 1 && only !== undefined && !only.startsWith('-') ? everyOf(only) : undefined;
  if (asked && 'every' in asked) return { ticks: true, every: asked.every };
  const other = argv.join(' ');
  throw Object.assign(
    new Error(
      `the api takes no ${other}. Give ${NO_TICK} to serve the board without ticking the store, or nothing to be the store's daemon, ` +
        `or a pass interval in whole milliseconds, from 1 to ${MAX_EVERY_MS}, to be it at that interval: never both.`,
    ),
    { exitCode: 2 },
  );
}

/** Whether the api's process ticks the store, read off its arguments (`argsOf`), refused as it refuses them. */
export const ticksOf = (argv: readonly string[]): boolean => argsOf(argv).ticks;

/**
 * The address the api listens on: this machine's loopback, and nothing else. On every interface — `serve`'s default — anyone
 * on the network could start a run (`POST /api/runs`), whose brief an agent acts on in the repository once the daemon files it.
 * The board reaches the api through vite's proxy, which runs on this machine too (vite.config.ts).
 */
export const HOST = '127.0.0.1';

/**
 * `PORT`, read. Unset or empty is 8787, or 8788 for an api that does not tick (`ticks`). `0` is any free port, and main.ts prints the
 * one it got — which is how `npm run e2e` starts an api beside a person's `npm run dev`, and beside another worktree's e2e.
 *
 * Anything else is refused rather than read as the default, which for `PORT=80a` would be a server on the port the person was trying to
 * stay off.
 */
export function portOf(value: string | undefined, ticks = true): number {
  const text = value?.trim() ?? '';
  const unset = ticks ? DEFAULT_PORT : VIEWER_PORT;
  if (!text) return unset;
  if (/^\d{1,5}$/.test(text) && Number(text) <= 65535) return Number(text);
  throw Object.assign(
    new Error(`PORT=${value} is not a port. Give a whole number from 0 to 65535 — 0 for any free port — or unset PORT for ${unset}.`),
    { exitCode: 2 },
  );
}
