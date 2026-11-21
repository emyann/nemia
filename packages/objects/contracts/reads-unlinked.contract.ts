/**
 * Which reads of the `Api` no verb links, and no reason excuses (objects, src/read-verbs.ts, `readsUnlinked`): handed every GET
 * endpoint of the `Api` (`<group>.<endpoint>`, and whether it is a stream, its `READS` shape), the endpoints the verbs link (every
 * `served` link of the orchestrator's table and of the verbs the api serves beside it), and the reasons a read has no verb
 * (`UNLINKED_READS`), it answers each break of the rule, by the read it names and why: a read that is no stream, that no verb links and
 * that no reason names (`unlinked`); a reason for a read a verb links after all (`linked`), for a stream, which no tool can serve and so
 * needs none (`stream`), or for no GET endpoint the `Api` has (`none`); and a reason that says nothing (`unsaid`). The list only shrinks:
 * a read given a verb takes its reason out. Empty for an `Api` each of whose reads is linked, a stream or excused in words. The order of
 * the breaks is the function's.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A GET endpoint of the `Api`, as `<group>.<endpoint>`, and whether it answers a stream (`READS` shape `stream`). */
export type GetRead = { readonly read: string; readonly stream: boolean };

/** Why a read has no verb, in a sentence a person reads, by the read it names. */
export type ReadReason = { readonly read: string; readonly why: string };

/** Why a read or a reason breaks the rule. */
export type UnlinkedBreakReason = 'unlinked' | 'linked' | 'stream' | 'none' | 'unsaid';

/** A break of the rule: the read it names, and why. */
export type UnlinkedBreak = { readonly read: string; readonly reason: UnlinkedBreakReason };

/** Whether no two entries name one read. */
const distinct = (named: readonly { readonly read: string }[]) =>
  named.every((n, i) => !named.slice(0, i).some((m) => m.read === n.read));

/** Whether `output` holds a break of `read` for `reason`. */
const breaks = (output: readonly UnlinkedBreak[], read: string, reason: UnlinkedBreakReason) =>
  output.some((b) => b.read === read && b.reason === reason);

/** Whether some reason names `read`. */
const excused = (reasons: readonly ReadReason[], read: string) => reasons.some((x) => x.read === read);

/** The GET endpoint named `read`, where the `Api` has one. */
const readOf = (reads: readonly GetRead[], read: string) => reads.find((r) => r.read === read);

const readsUnlinkedSpec = spec<(reads: readonly GetRead[], linked: readonly string[], reasons: readonly ReadReason[]) => UnlinkedBreak[]>({
  requires: ({ input: [reads, , reasons] }) => distinct(reads) && distinct(reasons),
  ensures: {
    unlinkedExactly: {
      description: 'A read is refused as unlinked exactly when it is no stream, no verb links it and no reason names it',
      condition: ({ input: [reads, linked, reasons], output }) =>
        reads.every((r) => breaks(output, r.read, 'unlinked') === (!r.stream && !linked.includes(r.read) && !excused(reasons, r.read))),
    },
    unlinkedNamesARead: {
      description: 'An unlinked break names a GET endpoint of the Api',
      condition: ({ input: [reads], output }) => output.every((b) => b.reason !== 'unlinked' || readOf(reads, b.read) !== undefined),
    },
    noneExactly: {
      description: 'A reason is refused as naming none exactly when the Api has no GET endpoint of its name',
      condition: ({ input: [reads, , reasons], output }) =>
        reasons.every((x) => breaks(output, x.read, 'none') === (readOf(reads, x.read) === undefined)),
    },
    streamExactly: {
      description: 'A reason is refused as needless exactly when it names a stream, which no tool can serve',
      condition: ({ input: [reads, , reasons], output }) =>
        reasons.every((x) => breaks(output, x.read, 'stream') === (readOf(reads, x.read)?.stream === true)),
    },
    linkedExactly: {
      description: 'A reason is refused as stale exactly when it names a read, no stream, that a verb links',
      condition: ({ input: [reads, linked, reasons], output }) =>
        reasons.every((x) => breaks(output, x.read, 'linked') === (readOf(reads, x.read)?.stream === false && linked.includes(x.read))),
    },
    unsaidExactly: {
      description: 'A reason is refused as saying nothing exactly when its sentence is empty',
      condition: ({ input: [, , reasons], output }) => reasons.every((x) => breaks(output, x.read, 'unsaid') === (x.why.length === 0)),
    },
    reasonBreaksNameAReason: {
      description: 'A break of a reason names a reason given',
      condition: ({ input: [, , reasons], output }) => output.every((b) => b.reason === 'unlinked' || excused(reasons, b.read)),
    },
    eachBreakOnce: {
      description: 'No break is said twice',
      condition: ({ output }) =>
        output.every((b, i) => !output.slice(0, i).some((c) => c.read === b.read && c.reason === b.reason)),
    },
  },
});

/** `readsUnlinked`'s type, which `src/read-verbs.ts` takes. */
export type ReadsUnlinked = Implementation<typeof readsUnlinkedSpec>;
