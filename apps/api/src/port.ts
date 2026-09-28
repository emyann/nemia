/** The port the api listens on when `PORT` is not set: the one the web app's dev proxy points at. */
export const DEFAULT_PORT = 8787;

/**
 * The address the api listens on: this machine's loopback, and nothing else. On every interface — `serve`'s default — anyone
 * on the network could start a run (`POST /api/runs`), whose brief an agent acts on in the repository once `wf up` files it.
 * The board reaches the api through vite's proxy, which runs on this machine too (vite.config.ts).
 */
export const HOST = '127.0.0.1';

/**
 * `PORT`, read. Unset or empty is 8787. `0` is any free port, and main.ts prints the one it got — which
 * is how `npm run e2e` starts an api beside a person's `npm run dev`, and beside another worktree's e2e.
 *
 * Anything else is refused rather than read as 8787. `Number(PORT) || 8787` did that: `PORT=0` meant
 * 8787, and so did `PORT=80a` — each a server on the port the person was trying to stay off.
 */
export function portOf(value: string | undefined): number {
  const text = value?.trim() ?? '';
  if (!text) return DEFAULT_PORT;
  if (/^\d{1,5}$/.test(text) && Number(text) <= 65535) return Number(text);
  throw Object.assign(
    new Error(
      `PORT=${value} is not a port. Give a whole number from 0 to 65535 — 0 for any free port — or unset PORT for ${DEFAULT_PORT}.`,
    ),
    { exitCode: 2 },
  );
}
