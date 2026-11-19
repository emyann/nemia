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

/**
 * The command that asks the trust of a factory's places again.
 * @param factory The factory's name.
 */
export const trustCommandOf = (factory: string): string => `nemia factory trust ${factory}`;

/** `folder` said after `place` where the trust is kept under another folder than the place itself. */
const keptUnder = (place: string, folder: string): string => (folder === place ? place : `${place} (kept under ${folder})`);

/**
 * The lines `nemia factory add`, `apply` and `trust` print of the trust asked for `factory`'s places: for each one written, the
 * place, the harness, what it grants and how to take it back; for each one not given, why and what repairs it. None for a place
 * already trusted, nor for a harness that keeps no trust.
 * @param factory The factory whose places the trust was asked for.
 * @param asked What each place's trust came to.
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
 * @param factory The factory the lines are printed under; places of other factories are left out.
 * @param untrusted The places whose harness withholds its grants.
 * @param width How many spaces the lines are indented by, before their own two.
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
 * @param trust The harness's trust of the rules' folder; undefined where the harness keeps none.
 * @param factory The factory whose verb asks the trust again; undefined for a run started in none.
 */
export const untrustedNote = (trust: TrustRead | undefined, factory?: string): string | undefined =>
  trust === undefined || trust.trusted
    ? undefined
    : `Check too that ${trust.harness} trusts ${trust.folder}: it does not, and until it does it withholds ${trust.grants}, ` +
      `so the rules counted above may not reach the session at all. ${
        factory === undefined ? `Run ${trust.harness} in ${trust.folder} once and accept its prompt` : trustCommandOf(factory)
      } gives it.`;

/**
 * A harness's trust of one folder that a write left not given: the harness by name, the folder, its file, why it is never kept, and
 * why the write did not take it.
 */
export type TrustNotGiven = { harness: string; folder: string; file: string; never: string | null; refused: string | null };

/**
 * The runtime's words `refused` without the hand step they end on (running the harness in the folder once, at its prompt), which
 * Nemia takes in the person's place: cut with the `: ` or `, or ` before it. Pure.
 * @param refused The runtime's words of why the trust was not written.
 * @param not The harness and the folder the words name.
 */
export const withoutHandStep = (refused: string, not: Pick<TrustNotGiven, 'harness' | 'folder'>): string => {
  const at = refused.lastIndexOf(`run ${not.harness} in ${not.folder} once `);
  if (at < 0) return refused;
  const head = refused.slice(0, at);
  const cut = [': ', ', or '].find((one) => head.endsWith(one));
  return cut === undefined ? refused : head.slice(0, -cut.length);
};

/**
 * Why a run's home, the copy of its factory's home its sessions start in, could not be trusted by its harness, and what a person does
 * so it can: a folder the harness never keeps a trust of (`never`), a write that threw (`threw`, its words), or a file of the harness's
 * that did not take the trust, with the runtime's reason (`refused`). Offers no command to run the harness by hand, since Nemia gives
 * the trust itself once the file can take it. Pure.
 * @param not The trust as it reads after the write.
 * @param threw The words of the error the write threw, or undefined where it answered.
 */
export function homeTrustRefused(not: TrustNotGiven, threw?: string): string {
  const head = `${not.harness} could not trust the run's home ${not.folder}, so the allow rules of its settings would be dropped`;
  if (threw !== undefined)
    return `${head}: ${not.file} could not be written (${threw}). Make that file readable and writable by the user the store runs as`;
  if (not.never !== null)
    return `${head}: ${not.never}, so nothing was written in ${not.file}. Run the store (WF_ROOT) outside the home directory`;
  const why = not.refused === null ? `${not.file} was left as it is` : withoutHandStep(not.refused, not);
  return `${head}: ${why}. Make ${not.file} read as a JSON object again, or move it aside, and make it readable and writable by the user the store runs as`;
}

/**
 * Why the records a harness keeps of a run's home were left in its file when the run was removed, and what a person does about them.
 * Pure.
 * @param harness The harness by name.
 * @param folder The run's homes folder, every record at or under which was to go.
 * @param why The runtime's words of why they stayed, or the words of what the removal threw.
 */
export const homeUntrustRefused = (harness: string, folder: string, why: string): string =>
  `${harness} still keeps its records of the run's home ${folder}: ${why}`;
