/**
 * The words of a place's trust: what `nemia factory add`, `apply` and `trust` print of the trust they asked for a factory's places
 * (`trustedLines`), and what the listing says under a factory one of whose places is not trusted (`untrustedLines`). Which harness, its
 * file and what its trust grants are the runtime's sentences, carried here whole and never worded again.
 */

/**
 * What was asked for one place, a repository or a folder a factory names: the harness by the name a person reads, the folder the
 * harness keeps its trust under, what the trust lets the folder's own settings grant, how to take it back, whether it was written
 * now, and why it could not be where it is still not given; or that the place was not asked at all, and why (`unasked`).
 */
export type PlaceTrust =
  | {
      readonly place: string;
      readonly harness: string;
      readonly folder: string;
      readonly grants: string;
      readonly back: string;
      readonly wrote: boolean;
      readonly refused: string | null;
    }
  | { readonly place: string; readonly unasked: string };

/**
 * A place of a factory that a harness does not trust, as a listing reads it now: the factory, the place, the harness by name, the
 * folder it would keep the trust under, what is withheld meanwhile, and why no trust can ever be kept for it (`never`, else null).
 */
export type Untrusted = {
  readonly factory: string;
  readonly place: string;
  readonly harness: string;
  readonly folder: string;
  readonly withheld: string;
  readonly never: string | null;
};

/** The command that asks the trust of a factory's places again. */
export const trustCommandOf = (factory: string): string => `nemia factory trust ${factory}`;

/** `folder` said after `place` where the trust is kept under another folder than the place itself. */
const keptUnder = (place: string, folder: string): string => (folder === place ? place : `${place} (kept under ${folder})`);

/**
 * The lines `nemia factory add`, `apply` and `trust` print of the trust asked for `factory`'s places: for each one written, the
 * place, the harness, what it grants and how to take it back; for each one not given, why and what repairs it. None for a place
 * already trusted, nor for a harness that keeps no trust.
 */
export const trustedLines = (factory: string, asked: readonly PlaceTrust[]): string[] =>
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
 * The lines the listing prints under `factory` for each of its places in `untrusted`, indented by `width`: the place, the harness,
 * what is withheld, and the command that repairs it, or why nothing can.
 */
export const untrustedLines = (factory: string, untrusted: readonly Untrusted[], width: number): string[] =>
  untrusted
    .filter((one) => one.factory === factory)
    .map(
      (one) =>
        `${' '.repeat(width)}  not trusted for ${one.harness}: ${one.place} — withheld: ${one.withheld}. ${one.never ?? `Trust it: ${trustCommandOf(factory)}`}`,
    );

/** A trust of one folder as a harness reads it now, as much of it as a sentence about a withheld grant needs. */
type TrustRead = { readonly harness: string; readonly folder: string; readonly grants: string; readonly trusted: boolean };

/**
 * The second thing to check, said after a refusal that counted a repository's own allow rules: that the harness has no trust of the
 * folder the rules are in, and withholds them until it does. `undefined` where the trust is given, and where the harness keeps none
 * (`trust` undefined), so a refusal says it only where it is true. `factory` names the factory whose verb asks the trust again, left
 * out for a run started in none, whose person trusts the folder by running the harness there.
 */
export const untrustedNote = (trust: TrustRead | undefined, factory?: string): string | undefined =>
  trust === undefined || trust.trusted
    ? undefined
    : `Check too that ${trust.harness} trusts ${trust.folder}: it does not, and until it does it withholds ${trust.grants}, ` +
      `so the rules counted above may not reach the session at all. ${
        factory === undefined ? `Run ${trust.harness} in ${trust.folder} once and accept its prompt` : trustCommandOf(factory)
      } gives it.`;
