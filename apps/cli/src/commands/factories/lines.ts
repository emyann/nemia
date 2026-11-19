/**
 * What the factory group's runners share: the words a parsed argument holds (`textOf`), a repository as it is sent (`repoSent`: a git
 * URL as typed, a folder through `pathSent`), what a write's answer says it wrote (`writtenOf`), the trust asked for a factory's places
 * (`trustedLines`), dollars and a time from now as a person reads them. Ported word for word from the orchestrator's printers
 * (`trust/trust.ts`, `money/money.ts`, `reads/standing.ts`'s `fireWord`), as the old path printed them. Pure but for `pathSent`.
 */
import type { Args, FactoryPlaceTrust, FactoryWritten } from 'objects';
import { Refused } from '../../refused.ts';
import { pathSent, textArg } from '../requests.ts';

/**
 * The text `args` holds under `key`, or `''` where none was given: a required positional, which the parse refuses left out.
 * @param args The words parsed against the command's words.
 * @param key The name of the positional or flag to read.
 */
export const textOf = (args: Args, key: string) => textArg(args, key) ?? '';

/** A git URL, `scheme://…` or `user@host:…`, which the daemon clones: sent as typed, never resolved as a path. */
const GIT_URL = /^(?:[a-z][a-z0-9+.-]*:\/\/|[^/\s@]+@[^/\s:]+:)/i;

/**
 * A repository a command line names, as it is sent: a git URL as typed, a folder through `pathSent`.
 * @param typed The repository as typed: a git URL or a folder.
 * @param env The environment whose chosen context says how a folder is sent; this process's by default.
 */
export const repoSent = (typed: string, env: NodeJS.ProcessEnv = process.env) => (GIT_URL.test(typed) ? typed : pathSent(typed, env));

/**
 * A volume as it is sent: its folder or git URL as `repoSent` sends it and its mark as typed; one with no mark the api reads (`:ro`,
 * `:rw`) sent as typed, for the api to refuse in its words.
 * @param spelled The volume as typed: a folder or a git URL, then `:ro` or `:rw`.
 * @param env The environment whose chosen context says how a folder is sent; this process's by default.
 */
export function volumeSent(spelled: string, env: NodeJS.ProcessEnv = process.env) {
  const at = spelled.lastIndexOf(':');
  const mark = at < 0 ? '' : spelled.slice(at + 1);
  const given = at < 0 ? '' : spelled.slice(0, at);
  return (mark === 'ro' || mark === 'rw') && given.trim() !== '' ? `${repoSent(given, env)}:${mark}` : spelled;
}

/**
 * What a factory works on, as its first line says it: its writable volumes' paths, or that it works on none yet.
 * @param volumes The factory's volumes, as the api answers them.
 */
export const worksOnLine = (volumes: readonly { readonly path: string; readonly readOnly: boolean }[]) =>
  volumes
    .filter((v) => !v.readOnly)
    .map((v) => v.path)
    .join(', ') || 'works on no repository yet';

/**
 * What a write's answer says it wrote (`written`); refused, naming the restart, where the daemon answers none, being older than this
 * client.
 * @param answer The api's answer to the write, whose `written` says what it wrote.
 * @param command The command's name, said in the refusal.
 */
export function writtenOf(answer: { readonly written?: FactoryWritten }, command: string) {
  if (answer.written !== undefined) return answer.written;
  throw new Refused(
    `nemia ${command}: the daemon answered no record of its write, being older than this client: restart it, nemia service restart`,
  );
}

/** The command that asks the trust of a factory's places again. */
const trustCommandOf = (factory: string) => `nemia factory trust ${factory}`;

/** `folder` said after `place` where the trust is kept under another folder than the place itself. */
const keptUnder = (place: string, folder: string) => (folder === place ? place : `${place} (kept under ${folder})`);

/**
 * The lines `nemia factory add`, `apply` and `trust` print of the trust asked for `factory`'s places: for each one written, the place,
 * the harness, what it grants and how to take it back; for each one not given, why and what repairs it. None for a place already
 * trusted, nor for a harness that keeps no trust.
 * @param factory The factory's name, said in the command that asks the trust again.
 * @param asked The trust asked for each of the factory's places, as the api answers it.
 */
export const trustedLines = (factory: string, asked: readonly FactoryPlaceTrust[]) =>
  asked.flatMap((one) => {
    if ('unasked' in one) return [`not trusted: ${one.place} was not asked of — ${one.unasked}. Ask again: ${trustCommandOf(factory)}`];
    if (one.wrote)
      return [
        `trusted for ${one.harness}: ${keptUnder(one.place, one.folder)}`,
        `  it grants ${one.grants}`,
        `  take it back: ${one.back}`,
      ];
    return one.refused === null ? [] : [`not trusted for ${one.harness}: ${keptUnder(one.place, one.folder)} — ${one.refused}`];
  });

/**
 * Dollars as a person reads them: `$80.00`, and a fraction of a cent to three digits.
 * @param usd The amount, in dollars.
 */
export const dollars = (usd: number) => `$${usd > 0 && usd < 0.01 ? Number(usd.toPrecision(3)) : usd.toFixed(2)}`;

/** A duration for a person: `58s`, `19m42s`, `1h05m`, `2d03h`. */
function durationWord(ms: number) {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const two = (n: number) => String(n).padStart(2, '0');
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${two(s % 60)}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${two(m % 60)}m`;
  return `${Math.floor(h / 24)}d${two(h % 24)}h`;
}

/**
 * When a schedule fires or fired, and how far that is from `now`.
 * @param iso The time the schedule fires or fired, as an ISO 8601 text.
 * @param now The time to measure from, in ms since the epoch.
 */
export const fireWord = (iso: string, now: number) => {
  const ms = Date.parse(iso) - now;
  return `${iso}, ${ms >= 0 ? `in ${durationWord(ms)}` : `${durationWord(-ms)} ago`}`;
};
