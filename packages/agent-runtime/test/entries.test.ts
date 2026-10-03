/**
 * The names each of the runtime's entries exports, pinned: a file moved into a folder, or a barrel that drops a name, fails here and
 * not in a consumer. Types are held by the typecheck of the packages that import them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const PINNED: Record<string, string[]> = {
  'agent-runtime': [
    'CLAUDE_AUTO_DROPPED',
    'CLAUDE_CONTEXT_TOKENS',
    'CLAUDE_EFFORTS',
    'CLAUDE_PERMISSION_MODES',
    'CODEX_EFFORTS',
    'CODEX_SANDBOXES',
    'HARNESS_ARGS',
    'TURN_ARGS',
    'claudeDetached',
    'codex',
    'commandHarness',
    'configRefusal',
    'denialText',
    'fenceReach',
    'lifecycleGraph',
    'nameFor',
    'refusedText',
    'remoteConfigRefusal',
    'retiredKeyRefusal',
  ],
  'agent-runtime/effect': [
    'AdmitRefused',
    'CLAUDE_AUTO_DROPPED',
    'CLAUDE_CONTEXT_TOKENS',
    'CLAUDE_EFFORTS',
    'CLAUDE_PERMISSION_MODES',
    'CODEX_EFFORTS',
    'CODEX_SANDBOXES',
    'Engine',
    'EngineRefused',
    'FileRefused',
    'GRACE_MS',
    'HARNESS_ARGS',
    'InputRefused',
    'Journal',
    'JournalError',
    'ListRefused',
    'OutputRefused',
    'QuotaRefused',
    'Runner',
    'RunnerError',
    'STALE_MS',
    'SayRefused',
    'SayUnsent',
    'StepRefused',
    'StopRefused',
    'TURN_ARGS',
    'TickRefused',
    'TranscriptRefused',
    'a2aRunner',
    'admit',
    'answer',
    'argsRefusalOf',
    'claudeDetached',
    'claudeOps',
    'close',
    'codex',
    'commandHarness',
    'composite',
    'denialText',
    'detachedOps',
    'fenceReach',
    'file',
    'fold',
    'nameFor',
    'promiseEngine',
    'remoteOps',
    'requestStop',
    'sdkRunner',
    'settleTask',
    'step',
    'testOps',
    'tick',
    'view',
    'viewOfState',
  ],
  'agent-runtime/vocabulary': [
    'CLAUDE_AUTO_DROPPED',
    'CLAUDE_CONTEXT_TOKENS',
    'CLAUDE_EFFORTS',
    'CLAUDE_PERMISSION_MODES',
    'CODEX_EFFORTS',
    'CODEX_SANDBOXES',
    'fenceReach',
  ],
};

/** Where `exported` differs from `pinned`: each name dropped or added, worded with what to do. */
const drift = (entry: string, exported: string[], pinned: string[]): string[] => [
  ...pinned
    .filter((n) => !exported.includes(n))
    .map((n) => `${entry} no longer exports ${n}: re-export it by name from the entry, as before the move`),
  ...exported
    .filter((n) => !pinned.includes(n))
    .map((n) => `${entry} exports ${n}, which it did not: a new name on an entry is added here on purpose`),
];

test('REFUSED: an entry that drops a name, or gains one', () => {
  assert.deepEqual(drift('agent-runtime', ['codex', 'nameFor'], ['codex', 'lifecycleGraph']), [
    'agent-runtime no longer exports lifecycleGraph: re-export it by name from the entry, as before the move',
    'agent-runtime exports nameFor, which it did not: a new name on an entry is added here on purpose',
  ]);
});

test('each entry exports exactly its pinned names', async () => {
  for (const [entry, pinned] of Object.entries(PINNED)) {
    assert.deepEqual(drift(entry, Object.keys(await import(entry)), pinned), [], entry);
  }
});

test('a name both entries export is the same value in each', async () => {
  const promises = { ...(await import('agent-runtime')) } as Record<string, unknown>;
  const effect = { ...(await import('agent-runtime/effect')) } as Record<string, unknown>;
  const shared = Object.keys(promises).filter((n) => Object.hasOwn(effect, n));
  assert.ok(shared.includes('codex') && shared.includes('HARNESS_ARGS'), 'the entries share names');
  for (const name of shared) assert.equal(promises[name], effect[name], name);
});

test('every name the vocabulary door exports is the same value on the other two', async () => {
  const promises = { ...(await import('agent-runtime')) } as Record<string, unknown>;
  const effect = { ...(await import('agent-runtime/effect')) } as Record<string, unknown>;
  for (const [name, value] of Object.entries(await import('agent-runtime/vocabulary'))) {
    assert.equal(promises[name], value, `agent-runtime: ${name}`);
    assert.equal(effect[name], value, `agent-runtime/effect: ${name}`);
  }
});
