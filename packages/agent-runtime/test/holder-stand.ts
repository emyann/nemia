/**
 * The harness a cross-process test of a holder's port runs: a detached spec over `fixtures/stand-in-job.ts`, which prints
 * Claude Code's stream-json as it writes, so the holder has a session whose text is in progress to serve.
 *
 * Here rather than in one test file because the viewer's own engine, in a process of its own
 * (`fixtures/viewer-engine.ts`), builds the same spec over the same store, and there is one copy of it.
 */
import path from 'node:path';
import { CLAUDE_INIT_START } from '../src/harness/claude/code.ts';
import { claudeTranscriptEvents } from '../src/harness/claude/transcript.ts';
import { claudePartials, claudeStreamOutput } from '../src/harness/detached/output.ts';
import type { HarnessSpec } from '../src/harness/detached/detached.ts';

/** The name the harness is configured under, in both processes. */
export const HARNESS = 'stand';

/** The program a session of this harness runs. */
export const JOB = path.join(import.meta.dirname, 'fixtures', 'stand-in-job.ts');

/**
 * The harness, over the store `root`: it keeps its streams whole and says what its stdout tells of the text it is writing
 * (`streams`, `partials`), and its conversation is read from `root/transcripts/<id>.jsonl`, so both processes read the same
 * file. `start` is Claude Code's own init line, which the worker reads the session's id from.
 */
export const standSpec = (root: string): HarnessSpec => ({
  name: HARNESS,
  command: () => ({ cmd: process.execPath, args: [JOB], env: { STAND_ROOT: root } }),
  start: CLAUDE_INIT_START,
  readOutput: claudeStreamOutput,
  transcript: {
    file: (nativeId: string) => path.join(root, 'transcripts', `${nativeId}.jsonl`),
    events: claudeTranscriptEvents,
  },
  streams: true,
  partials: claudePartials,
});
