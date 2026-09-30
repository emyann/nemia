/**
 * The run store, as a plain value of synchronous methods: a run's record, and the files a person keeps beside it, by run id and never by
 * path. The tick writes the record; a person's verbs write their own files; no method lets one writer write the other's, but the tick's
 * one touch on a person's file, a hold lifted. Its implementation is `filesStore` (`files.store.ts`), bound as `runStore` there.
 */
import type { Run } from './record.ts';
import type { RoundAsk } from '../status/status.ts';
import type { RetryAsk } from '../retry/index.ts';

/** The asks waiting beside a run, tries and rounds, and a line for each file named as one that cannot be read as one. */
export type AsksRead = { asks: RetryAsk[]; rounds: RoundAsk[]; notes: string[] };

/** What the tick's pass reads and writes of the store, grouped as `runs`, `asks` and `holds`. */
export type RunStore = {
  readonly runs: {
    /**
     * A run: its record, with the person's files composed onto it — the cancellation, the pruning, the hold, the approvals and the
     * acceptances. Refused: an id with no record (`Missing`), and a record that does not read as a run (`UnreadableRecord`).
     */
    readonly read: (id: string) => Run;
    /** Every run in the store; a record that does not read as a run is left out and said once on `said`, stderr unless given. */
    readonly list: (said?: (line: string) => void) => Run[];
    /** Make a new run's record: `wf start`'s, the one writer that makes one. */
    readonly create: (run: Run) => void;
    /**
     * Write back the record a pass read, without the person's files composed onto it, and only while it is there: false when it is not,
     * and no record is made again.
     */
    readonly rewrite: (run: Run) => boolean;
    /**
     * Each run's stamp: a text that changes whenever anything a pass reads of the run changes — its record, a person's file, an ask — and
     * that the memo of runs at rest compares. Taken before the pass reads the records, so a change between the two is never missed.
     */
    readonly stamps: () => Map<string, string>;
    /** Whether the run's record is there. */
    readonly exists: (id: string) => boolean;
    /** Whether a person called the run off: cancelled it, pruned it, or holds it. */
    readonly calledOff: (id: string) => boolean;
  };
  readonly asks: {
    /** The asks waiting beside the run. */
    readonly read: (id: string) => AsksRead;
    /** Every ask that carried a message, waiting or consumed. */
    readonly answers: (id: string) => RetryAsk[];
    /** Set aside each ask, approval and acceptance the run's record already answers: consumed, never edited. */
    readonly consume: (run: Run, asks: readonly RetryAsk[], rounds: readonly RoundAsk[]) => void;
  };
  readonly holds: {
    /** Lift the hold put at `at`, and only while it still stands: false when it is gone or a hold was put since. */
    readonly lift: (id: string, at: string) => boolean;
  };
};
