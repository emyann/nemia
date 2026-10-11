/**
 * The check a test file makes of an engine its commands are to ask nothing of: `unasked(engine)` throws, naming what was asked, where
 * the engine's stand-in was asked to file, stop, say or forget; `heldUnasked(engine)` makes that check after each test of the file
 * that calls it at its head. A read (`view`, `list`, `logs`, `feed`, `output`) leaves no mark on the stand-in, and is not refused.
 */
import assert from 'node:assert/strict';
import { afterEach } from 'node:test';
import type { TestEngine } from 'agent-runtime/testing';

/** Throws where `engine` was asked to file, stop, say or forget anything. */
export function unasked(engine: TestEngine): void {
  const { filings, stopped, said, forgets } = engine;
  assert.deepEqual(
    { filings, stopped, said, forgets },
    { filings: [], stopped: [], said: [], forgets: [] },
    'this file hands its commands an engine none of them files on, stops, says to or forgets from: one did',
  );
}

/** `unasked` of the engine `engine` answers, after each test of the file. */
export function heldUnasked(engine: () => TestEngine): void {
  afterEach(() => unasked(engine()));
}
