/**
 * What a revision is, and the drift between what a run resolved and what the files hold now. The face of the folder: the ledger on disk
 * is `revisions.store.ts`'s, and resolving a run's kinds is `pin.verb.ts`'s. Pure.
 *
 * A revision is a number given to the content of one kind and name — a workflow folder, an agent, a skill, a factory's rules — the first
 * time anyone resolves that content. The content itself is never kept here: a run keeps its own frozen copy, and the ledger keeps only the
 * digest, so a number can be compared.
 */
import { createHash } from 'node:crypto';

/** The kinds a run resolves and a revision is kept for: its workflow folder, each step's agent, each skill, and the factory's rules. */
export type RevisionKind = 'workflow' | 'agent' | 'skill' | 'rules';

/** The kinds, in the order a run's pins and the board's drift are read in. */
export const REVISION_KINDS: readonly RevisionKind[] = ['workflow', 'agent', 'skill', 'rules'];

/** One thing a revision is kept for: its kind, and its name within the kind — a workflow folder's, an agent's, a skill's, a factory's. */
export type KindName = { kind: RevisionKind; name: string };

/** One entry of a kind and name's ledger: its number, from 1, the digest of the content it was given for, and when it was first seen. */
export type Revision = { n: number; hash: string; at: string };

/** What a run resolved of one kind and name: the revision's number and the digest it was given for. */
export type Pin = KindName & { n: number; hash: string };

/**
 * One kind and name a run or one of its steps is behind the files on: what it resolved (`pinned`), the revision of what the files hold now
 * (`now`, which may be lower than `pinned` where the files went back to an older content), and the step that already ran on it (`step`),
 * absent for the run's own pin, which a filing after this takes.
 */
export type Drift = KindName & { pinned: number; now: number; step?: string };

/** The digest the ledger and a closeout schema's hash are taken by: a sha256 of `parts` as JSON, cut to 16 hex characters. */
export const digestOf = (parts: readonly unknown[]): string =>
  createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 16);

/**
 * The revision `hash` stands at in `entries`: the entry already given for that content, whatever its place in the ledger, else the next
 * number, which is one past the highest there — never the count, so a ledger a hand edit left a gap in gives no number twice.
 */
export const revisionNow = (entries: readonly Revision[], hash: string, at: string): Revision =>
  entries.find((e) => e.hash === hash) ?? { n: Math.max(0, ...entries.map((e) => e.n)) + 1, hash, at };

/** The pin of `pins` for `of`, or undefined where it holds none. */
const pinFor = (pins: readonly Pin[], of: KindName): Pin | undefined => pins.find((t) => t.kind === of.kind && t.name === of.name);

/**
 * The kinds `pinned` differs from `now` on, in `pinned`'s order: one `Drift` per kind and name whose content `now` holds other bytes of, by
 * the digest — never by the number, which is only the ledger's reading of a content: a kind edited and reverted is the pin's number again,
 * and a kind reverted to an older content is that older number, so `now` may be lower than `pinned`. `[]` when nothing differs, a kind
 * `now` does not hold included, and for a record written before this slice, which pinned nothing.
 */
export const kindsDrift = (pinned: readonly Pin[] | undefined, now: readonly Pin[]): Drift[] =>
  (pinned ?? []).flatMap((pin) => {
    const at = pinFor(now, pin);
    return at && at.hash !== pin.hash ? [{ kind: pin.kind, name: pin.name, pinned: pin.n, now: at.n }] : [];
  });

/**
 * The kinds a step that has already been filed ran on and `now` differs from, beyond the run's own drift: one `Drift` per step, kind and
 * name whose pin is other bytes than `now`'s and than the run's — so a refresh, which re-pins the run and leaves a filed step's own pins
 * where they were, is read as "this already ran, and it ran on that revision". A step whose pin is the run's is left out: the run's line
 * says it. Compared by digest, as `kindsDrift` is.
 *
 * `steps` are the steps' own pins by step name, in the order they run.
 */
export const stepsDrift = (
  steps: readonly (readonly [string, readonly Pin[] | undefined])[],
  pinned: readonly Pin[] | undefined,
  now: readonly Pin[],
): Drift[] =>
  steps.flatMap(([step, pins]) =>
    (pins ?? []).flatMap((pin) => {
      const at = pinFor(now, pin);
      const ran = pinFor(pinned ?? [], pin);
      return at && at.hash !== pin.hash && ran?.hash !== pin.hash
        ? [{ kind: pin.kind, name: pin.name, pinned: pin.n, now: at.n, step }]
        : [];
    }),
  );

/**
 * A drift in words, as `nemia refresh` prints it: `agent coder: rev 5, now 6`, the numbers of a resolve it has just made. Its one caller is
 * the verb's own answer (`REFRESH.print`) and the note of a pinned run's `revisions behind` line. The board words the same drift itself,
 * off what the api serves (`driftNow`): changing this line changes the CLI and the feed's note, never the board.
 */
export const driftWords = (d: Drift): string =>
  `${d.kind} ${d.name}: ${d.step ? `${d.step} ran on rev ${d.pinned}` : `rev ${d.pinned}`}, now ${d.now}`;
