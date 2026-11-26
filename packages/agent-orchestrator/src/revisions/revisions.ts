/**
 * What a revision is, and the drift between what a run resolved and what the files hold now. The face of the folder: resolving a run's
 * kinds is `pin.verb.ts`'s. Pure.
 *
 * A pin's number is the revision of one kind and name — a workflow folder, an agent, a skill, a factory's rules — in the definition
 * index, in the run's namespace: the number its `metadata.resourceVersion` carries. The content itself is never kept here: a run keeps its
 * own frozen copy and the pin keeps the digest, so two contents can be compared.
 */
import { createHash } from 'node:crypto';
import type { RevisionKind } from 'objects';

/** The kinds a run resolves and a revision is kept for: its workflow folder, each step's agent, each skill, and the factory's rules. */
export type { RevisionKind };

/**
 * The kinds, in the order a run's pins and the board's drift are read in: `objects`' words (`packages/objects/src/words.ts`), held
 * equal by `wordsHeld` (`object/run.model.ts`).
 */
export const REVISION_KINDS = ['workflow', 'agent', 'skill', 'rules'] as const satisfies readonly RevisionKind[];

/** One thing a revision is kept for: its kind, and its name within the kind — a workflow folder's, an agent's, a skill's, a factory's. */
export type KindName = { kind: RevisionKind; name: string };

/** What a run resolved of one kind and name: the definition's revision and the digest of what it held. */
export type Pin = KindName & { n: number; hash: string };

/**
 * One kind and name a run or one of its steps is behind the files on: what it resolved (`pinned`), the revision of what the files hold now
 * (`now`, never lower than `pinned` for a run's own pins: a revert is a new, higher revision), and the step that already ran on it
 * (`step`), absent for the run's own pin, which a filing after this takes.
 */
export type Drift = KindName & { pinned: number; now: number; step?: string };

/**
 * The digest a pin and a closeout schema's hash are taken by: a sha256 of `parts` as JSON, cut to 16 hex characters.
 * @param parts What the digest is taken of.
 */
export const digestOf = (parts: readonly unknown[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 16);

/** The pin of `pins` for `of`, or undefined where it holds none. */
const pinFor = (pins: readonly Pin[], of: KindName) => pins.find((t) => t.kind === of.kind && t.name === of.name);

/**
 * The kinds `pinned` differs from `now` on, in `pinned`'s order: one `Drift` per kind and name whose content `now` holds other bytes of, by
 * the digest — never by the number, which is only the ledger's reading of a content: a kind edited and reverted is the pin's number again,
 * and a kind reverted to an older content is that older number, so `now` may be lower than `pinned`. `[]` when nothing differs, a kind
 * `now` does not hold included, and for a record written before this slice, which pinned nothing.
 * @param pinned What the run resolved, or undefined on a record that pinned nothing.
 * @param now What the files hold now.
 */
export const kindsDrift = (pinned: readonly Pin[] | undefined, now: readonly Pin[]) =>
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
 * @param steps The steps' own pins by step name, in the order they run.
 * @param pinned What the run resolved, or undefined on a record that pinned nothing.
 * @param now What the files hold now.
 */
export const stepsDrift = (
  steps: readonly (readonly [string, readonly Pin[] | undefined])[],
  pinned: readonly Pin[] | undefined,
  now: readonly Pin[],
) =>
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
 * @param d The drift.
 */
export const driftWords = (d: Drift) =>
  `${d.kind} ${d.name}: ${d.step ? `${d.step} ran on rev ${d.pinned}` : `rev ${d.pinned}`}, now ${d.now}`;
