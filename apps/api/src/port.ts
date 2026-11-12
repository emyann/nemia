import { everyOf, MAX_EVERY_MS } from 'agent-orchestrator';
import type { BindOf } from '../contracts/bind.contract.ts';

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

/** The address the api listens on where no other is asked for: this machine's loopback. */
export const LOOPBACK = '127.0.0.1';

/** Why a bind is refused: not an IP address, or an address beyond this machine on a store not marked exposed. */
export type BindRefusal = 'not-an-address' | 'unexposed';

/** Where the api listens, or why it may not where it was asked. */
export type Bind = { readonly kind: 'bound'; readonly host: string } | { readonly kind: 'refused'; readonly reason: BindRefusal };

/** An IPv4 address in dotted decimal, each of its four numbers from 0 to 255 with no leading zero. */
const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

/** The characters an IPv6 address is written in: hex digits, colons, and the dots of an IPv4 address at its end. */
const IPV6_TEXT = /^[0-9A-Fa-f:.]+$/;

/**
 * Whether `text` is an IP address: v4 in dotted decimal, or v6 as a URL's host reads one between brackets (WHATWG's parser, global, so
 * this file reaches nothing of the machine). An IPv6 zone (`%eth0`) is none.
 */
export const isAddress = (text: string): boolean => {
  if (IPV4.test(text)) return true;
  if (!text.includes(':') || !IPV6_TEXT.test(text)) return false;
  try {
    return new URL(`http://[${text}]/`).hostname !== '';
  } catch {
    return false;
  }
};

/** The text `value` asks for, its white space left out: blank where it is unset. */
export const asked = (value: string | undefined): string => value?.trim() ?? '';

/** Whether `host` is this machine's loopback alone, v4 or v6. */
const loopbackAddress = (host: string): boolean => host === LOOPBACK || host === '::1';

/**
 * Where the api listens, read off `NEMIA_BIND` (`value`) and whether the store is marked exposed (`WF_EXPOSED=1`): the loopback where it
 * asks for none, the address it names where that is the loopback, and any other address — a private network's, or every interface
 * (`0.0.0.0`, `::`) — only on a store marked exposed, where every route of its data needs a token (`needOf`, caller/caller.ts). Anyone
 * who reaches an address beyond this machine on a store not marked exposed could act as the person, so it is refused; a value that is no
 * address is refused rather than read as the default, which would listen somewhere the operator did not ask for.
 */
export const bindOf: BindOf = (value, exposed) => {
  const host = asked(value);
  if (host === '') return { kind: 'bound', host: LOOPBACK };
  if (!isAddress(host)) return { kind: 'refused', reason: 'not-an-address' };
  if (!exposed && !loopbackAddress(host)) return { kind: 'refused', reason: 'unexposed' };
  return { kind: 'bound', host };
};

/** Why the api may not listen at `value`, as the operator reads it: what to set instead. */
const BIND_WORDS: Readonly<Record<BindRefusal, (value: string) => string>> = {
  'not-an-address': (value) =>
    `NEMIA_BIND=${value} is not an IP address. Give an address of this machine — 127.0.0.1, a private network's like 100.64.0.1, or 0.0.0.0 for every interface — or unset NEMIA_BIND for ${LOOPBACK}.`,
  unexposed: (value) =>
    `NEMIA_BIND=${value} listens beyond this machine on a store not marked exposed, where a request with no token is the person. Mark the store exposed (WF_EXPOSED=1, in the service's environment) and mint yourself a token (nemia token add <name>), or unset NEMIA_BIND for ${LOOPBACK}.`,
};

/** The host the api listens on (`bindOf`), or its refusal thrown (exit 2) in words that name the variable to set. */
export function hostOf(value: string | undefined, exposed: boolean): string {
  const bind = bindOf(value, exposed);
  if (bind.kind === 'bound') return bind.host;
  throw Object.assign(new Error(BIND_WORDS[bind.reason](asked(value))), { exitCode: 2 });
}

/**
 * The host the lease records for a server bound on `host`, which a client of the store reaches it at: every interface (`0.0.0.0`, `::`)
 * at the loopback, an IPv6 address in brackets, as a URL writes one, and any other as it is.
 */
export const leaseHostOf = (host: string): string => {
  if (host === '0.0.0.0' || host === '::') return LOOPBACK;
  return host.includes(':') ? `[${host}]` : host;
};

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
