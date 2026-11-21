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
const distinct = (named: readonly { readonly read: string }[]) => named.every((n, i) => !named.slice(0, i).some((m) => m.read === n.read));

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
    unlinkedWhenUnexcused: {
      description: 'A read that is no stream, that no verb links and that no reason names is refused as unlinked',
      condition: ({ input: [reads, linked, reasons], output }) =>
        reads.every((r) => r.stream || linked.includes(r.read) || excused(reasons, r.read) || breaks(output, r.read, 'unlinked')),
    },
    unlinkedOnlyWhenUnexcused: {
      description: 'An unlinked break names no read that is a stream, that a verb links or that a reason names',
      condition: ({ input: [reads, linked, reasons], output }) =>
        output.every(
          (b) =>
            b.reason !== 'unlinked' ||
            reads.every((r) => r.read !== b.read || (!r.stream && !linked.includes(r.read) && !excused(reasons, r.read))),
        ),
    },
    unlinkedNamesARead: {
      description: 'An unlinked break names a GET endpoint of the Api',
      condition: ({ input: [reads], output }) => output.every((b) => b.reason !== 'unlinked' || readOf(reads, b.read) !== undefined),
    },
    noneWhenNoRead: {
      description: 'A reason for a name the Api has no GET endpoint of is refused as naming none',
      condition: ({ input: [reads, , reasons], output }) =>
        reasons.every((x) => readOf(reads, x.read) !== undefined || breaks(output, x.read, 'none')),
    },
    noneOnlyWhenNoRead: {
      description: 'A none break of a reason names no GET endpoint the Api has',
      condition: ({ input: [reads, , reasons], output }) =>
        output.every((b) => b.reason !== 'none' || !excused(reasons, b.read) || readOf(reads, b.read) === undefined),
    },
    streamWhenStream: {
      description: 'A reason for a stream, which no tool can serve, is refused as needless',
      condition: ({ input: [reads, , reasons], output }) =>
        reasons.every((x) => readOf(reads, x.read)?.stream !== true || breaks(output, x.read, 'stream')),
    },
    streamOnlyWhenStream: {
      description: 'A stream break of a reason names a stream',
      condition: ({ input: [reads, , reasons], output }) =>
        output.every((b) => b.reason !== 'stream' || !excused(reasons, b.read) || readOf(reads, b.read)?.stream === true),
    },
    linkedWhenLinked: {
      description: 'A reason for a read, no stream, that a verb links is refused as stale',
      condition: ({ input: [reads, linked, reasons], output }) =>
        reasons.every((x) => readOf(reads, x.read)?.stream !== false || !linked.includes(x.read) || breaks(output, x.read, 'linked')),
    },
    linkedOnlyWhenLinked: {
      description: 'A stale break of a reason names a read, no stream, that a verb links',
      condition: ({ input: [reads, linked, reasons], output }) =>
        output.every(
          (b) => b.reason !== 'linked' || !excused(reasons, b.read) || (readOf(reads, b.read)?.stream === false && linked.includes(b.read)),
        ),
    },
    unsaidWhenEmpty: {
      description: 'A reason whose sentence is empty is refused as saying nothing',
      condition: ({ input: [, , reasons], output }) => reasons.every((x) => x.why.length !== 0 || breaks(output, x.read, 'unsaid')),
    },
    unsaidOnlyWhenEmpty: {
      description: 'An unsaid break names no reason whose sentence says something',
      condition: ({ input: [, , reasons], output }) =>
        output.every((b) => b.reason !== 'unsaid' || reasons.every((x) => x.read !== b.read || x.why.length === 0)),
    },
    reasonBreaksNameAReason: {
      description: 'A break of a reason names a reason given',
      condition: ({ input: [, , reasons], output }) => output.every((b) => b.reason === 'unlinked' || excused(reasons, b.read)),
    },
    eachBreakOnce: {
      description: 'No break is said twice',
      condition: ({ output }) => output.every((b, i) => !output.slice(0, i).some((c) => c.read === b.read && c.reason === b.reason)),
    },
  },
});

/** `readsUnlinked`'s type, which `src/read-verbs.ts` takes. */
export type ReadsUnlinked = Implementation<typeof readsUnlinkedSpec>;
