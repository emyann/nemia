/**
 * What a revision is, and the drift between what a run resolved and what the ledger holds now. The face of the folder: the ledger on disk
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
 * One kind and name a run or one of its steps is behind the ledger on: what it resolved (`pinned`), what the ledger holds now (`now`), and
 * the step that already ran on it (`step`), absent for the run's own pin, which a filing after this takes.
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

/** The entry of `tops` for `of`, or undefined where the ledger holds none. */
const topFor = (tops: readonly Pin[], of: KindName): Pin | undefined => tops.find((t) => t.kind === of.kind && t.name === of.name);

/**
 * The kinds `pinned` is behind `tops` on, in `pinned`'s order: one `Drift` per kind and name whose number the ledger has moved past, and
 * `[]` when none has — a run whose pins are the ledger's top, and a record written before this slice, which pinned nothing.
 */
export const kindsDrift = (pinned: readonly Pin[] | undefined, tops: readonly Pin[]): Drift[] =>
  (pinned ?? []).flatMap((pin) => {
    const top = topFor(tops, pin);
    return top && top.n > pin.n ? [{ kind: pin.kind, name: pin.name, pinned: pin.n, now: top.n }] : [];
  });

/**
 * The kinds a step that has already been filed ran on and the ledger has moved past, beyond the run's own drift: one `Drift` per step, kind
 * and name whose pin differs from what the run resolved — so a refresh, which re-pins the run and leaves a filed step's own pins where they
 * were, is read as "this already ran, and it ran on that revision". A step whose pin is the run's is left out: the run's line says it.
 *
 * `steps` are the steps' own pins by step name, in the order they run.
 */
export const stepsDrift = (
  steps: readonly (readonly [string, readonly Pin[] | undefined])[],
  pinned: readonly Pin[] | undefined,
  tops: readonly Pin[],
): Drift[] =>
  steps.flatMap(([step, pins]) =>
    (pins ?? []).flatMap((pin) => {
      const top = topFor(tops, pin);
      const ran = topFor(pinned ?? [], pin);
      return top && top.n > pin.n && ran?.n !== pin.n ? [{ kind: pin.kind, name: pin.name, pinned: pin.n, now: top.n, step }] : [];
    }),
  );

/**
 * A drift in words, as `nemia refresh` prints it: `agent coder: rev 5, now 6`, the numbers of a resolve it has just made. Its one caller is
 * the verb's own answer (`REFRESH.print`). The board words the same drift itself, off what the api serves, and says it as the ledger's,
 * since a page's read makes no resolve: changing this line changes the CLI alone.
 */
export const driftWords = (d: Drift): string =>
  `${d.kind} ${d.name}: ${d.step ? `${d.step} ran on rev ${d.pinned}` : `rev ${d.pinned}`}, now ${d.now}`;
