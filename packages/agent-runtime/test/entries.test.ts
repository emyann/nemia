/**
 * The names each of the runtime's entries exports, pinned: a file moved into a folder, or a barrel that drops a name, fails here and
 * not in a consumer. Types are held by the typecheck of the packages that import them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const PINNED: Record<string, string[]> = {
  'agent-runtime': [
    'APPEND_REFUSALS',
    'AdmitRefused',
    'AnswerRefused',
    'AnswerUnsent',
    'BEARER',
    'BodyRefused',
    'CAPABILITIES',
    'CLAUDE_AUTO_DROPPED',
    'CLAUDE_CONTEXT_TOKENS',
    'CLAUDE_EFFORTS',
    'CLAUDE_PERMISSION_MODES',
    'CODEX_EFFORTS',
    'CODEX_SANDBOXES',
    'CONFIG_FOLDERS',
    'CompactRefused',
    'DEFAULT_HARNESS',
    'DrainRefused',
    'Engine',
    'EngineRefused',
    'FEED_LOCK_WAIT_MS',
    'FileRefused',
    'FollowRefused',
    'ForgetRefused',
    'GRACE_MS',
    'HARNESS_ARGS',
    'HARNESS_CHOICES',
    'HARNESS_DECLARATIONS',
    'HARNESS_KNOBS',
    'InputRefused',
    'InterruptRefused',
    'InterruptUnsent',
    'Journal',
    'JournalError',
    'KeptRefused',
    'LET_GO_MS',
    'ListRefused',
    'MCP_STATES',
    'MCP_TRANSPORTS',
    'McpSignInRefused',
    'McpStateRefused',
    'OutputRefused',
    'QuotaRefused',
    'REMOTE_DECLARATION',
    'ReconcileRefused',
    'Runner',
    'RunnerError',
    'RuntimeModel',
    'SIGN_IN_STATES',
    'STALE_MS',
    'SayRefused',
    'SayUnsent',
    'StopRefused',
    'TAKEN_ARGS',
    'TASK_PHASES',
    'TURN_ARGS',
    'TaskId',
    'TickRefused',
    'TranscriptRefused',
    'a2aRunner',
    'admissionHook',
    'admit',
    'answer',
    'argsRefusalOf',
    'close',
    'codex',
    'commandHarness',
    'composite',
    'configFolderIn',
    'configRefusal',
    'declares',
    'denialText',
    'detachedOps',
    'fenceReach',
    'file',
    'fold',
    'folderTrust',
    'heldHarnessesOf',
    'holderTokenOf',
    'lifecycleGraph',
    'mcpServerOf',
    'memoryBytesOf',
    'memoryQuantityRefusal',
    'misplacedOf',
    'nameFor',
    'ownArgsOf',
    'projectAllows',
    'reconcile',
    'refusalWords',
    'refusedText',
    'remoteConfigRefusal',
    'remoteOps',
    'retiredKeyRefusal',
    'scopeRefusal',
    'sdkRunner',
    'settleTask',
    'signsInMcp',
    'takersOf',
    'testOps',
    'tick',
    'transportOf',
    'trustFolder',
    'trustedFolder',
    'unruledIn',
    'verbHarnessOf',
    'view',
    'viewOfState',
  ],
  'agent-runtime/vocabulary': [
    'CAPABILITIES',
    'CLAUDE_AUTO_DROPPED',
    'CLAUDE_CONTEXT_TOKENS',
    'CLAUDE_EFFORTS',
    'CLAUDE_PERMISSION_MODES',
    'CODEX_EFFORTS',
    'CODEX_SANDBOXES',
    'CONFIG_FOLDERS',
    'DEFAULT_HARNESS',
    'HARNESS_CHOICES',
    'HARNESS_DECLARATIONS',
    'HARNESS_KNOBS',
    'REMOTE_DECLARATION',
    'configFolderIn',
    'declares',
    'fenceReach',
    'memoryBytesOf',
    'memoryQuantityRefusal',
    'misplacedOf',
    'ownArgsOf',
    'takersOf',
    'unruledIn',
    'verbHarnessOf',
  ],
  'agent-runtime/testing': ['WAITED', 'bell', 'testEngine', 'until'],
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

test('every name the vocabulary door exports is the same value on the root', async () => {
  const root = { ...(await import('agent-runtime')) } as Record<string, unknown>;
  for (const [name, value] of Object.entries(await import('agent-runtime/vocabulary'))) assert.equal(root[name], value, name);
});
