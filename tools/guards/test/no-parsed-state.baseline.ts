/**
 * The places a shipped source still reads a state out of a string, counted per file (`no-parsed-state.test.ts`), each count only
 * shrinking.
 *
 * `PARSED_STATE`: each file of a package's `src`, the api's or the board's, by its path from the repository root, with how many times
 * it calls a `.startsWith`, `.endsWith`, `.split`, `.match`, `.replace` or `.includes` on a name that ends in status, phase, verdict or
 * word, or a pattern's `.test` of one (`parsed-state.ts` counts them), and the card that takes them out. A step's state crosses the wire
 * as its codes — `phase`, `reason`, a check's `verdict.result` — and a sentence is only shown; what is counted here compares the
 * sentence instead.
 *
 * 19 calls in 7 files the day the guard was written, and 8 in 2 once the card that carries the codes took the board's parses and the
 * listing's out. Two of them are no state: the service's `word`s are the words of a command line, kept rather than renamed under a
 * card that is not about them. The feed's `reasonOf` stays, for the feed's lines written before the codes, and so do its counts.
 *
 * It only shrinks: a change that takes a parse out lowers its count here in the same commit, and takes the entry off where none is
 * left. A count is never raised, nor a file added. Today's counts, printed as entries: `node tools/guards/test/parsed-state.ts`.
 */
export const PARSED_STATE: Readonly<Record<string, { readonly count: number; readonly card: string }>> = {
  'packages/agent-orchestrator/src/feed/reason.ts': { count: 6, card: "A step's state crosses the wire as a code, not a sentence" },
  'packages/agent-orchestrator/src/service/service.ts': { count: 2, card: "A step's state crosses the wire as a code, not a sentence" },
};
