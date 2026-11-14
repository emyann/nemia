/**
 * Where a transcript event came from, a list and its word, read by the seam (`seam.ts`) and its contract (`contracts/origin.contract.ts`).
 */

/**
 * The words a harness has for where a transcript event came from, the Agent SDK's (`SDKMessageOrigin['kind']`), held equal to them in
 * Claude's reader.
 */
export const ORIGIN_KINDS = [
  'human',
  'channel',
  'peer',
  'task-notification',
  'coordinator',
  'unclassified',
  'observer',
  'auto-continuation',
  'observer-activity',
] as const;

/** Where a transcript event came from: a word of `ORIGIN_KINDS`, or `unknown` for one the harness wrote that is none of them. */
export type TranscriptOriginKind = (typeof ORIGIN_KINDS)[number] | 'unknown';
