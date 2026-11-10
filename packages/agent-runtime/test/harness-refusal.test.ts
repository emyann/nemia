/**
 * What `harnessRefusalOf` refuses of a task on each kind of harness: every key of a task's config a harness may lack, on Claude Code, on
 * Codex and the command harness (each a `HarnessSpec`), on a remote agent and on a runner the consumer brought (asked nothing but a held
 * call). Recorded before the refusals were read off each harness's declaration, so the rewrite keeps the same refusals in the same order:
 * each row says which check refused, by a fragment of its words that no other check says, and the harnesses its fix names, never the
 * whole sentence.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harnessRefusalOf } from '../src/service/harness-refusal.ts';
import type { HarnessConfig, TaskSpec } from '../src/service/options.ts';
import { codex, commandHarness } from '../src/index.ts';
import { testOps } from '../src/harness/seam.ts';

/** Each check, by a fragment of its words no other check says. */
const SAYS = {
  knob: 'has no such knob',
  range: 'is outside the windows',
  bridge: 'asks for a session bridged',
  claudeFlags: 'is not Claude Code',
  codexArgs: 'is not Codex',
  commandArgs: 'of a process the runtime runs',
  env: 'is laid in the session',
  readOnlyMount: 'cannot hold a read-only',
  writableMount: 'cannot hold a writable',
  callAdmission: 'runs none before a call',
  projectMcp: 'loads no MCP server',
  enabledSkills: 'holds every skill',
  memoryLimit: 'cgroup of this host',
  keepsOpen: 'ends its session with its turn',
  holdsCalls: 'holds a call that would ask',
  remoteOwn: 'is a remote A2A agent',
  commandOwn: 'names its process',
  unknown: 'is not a harness this engine has',
} as const;

type Check = keyof typeof SAYS;

/** The harnesses each check's fix names on an engine with every kind of harness, `undefined` for a fix that names none. */
const TAKERS: Partial<Record<Check, string>> = {
  knob: '`claude`',
  bridge: '`claude`',
  claudeFlags: '`claude`',
  codexArgs: '`codex`',
  commandArgs: '`command`',
  env: '`claude` or `codex` or `command`',
  readOnlyMount: '`claude` or `codex`',
  writableMount: '`claude`',
  callAdmission: '`claude`',
  projectMcp: '`claude` or `codex`',
  enabledSkills: '`claude`',
  memoryLimit: '`claude` or `codex` or `command`',
  keepsOpen: '`claude`',
};

/** What a task asks beside its brief and folder, by a name for the row. */
const ASKS: Record<string, Partial<TaskSpec>> = {
  nothing: {},
  'contextTokens in range': { config: { contextTokens: 200_000 } },
  'contextTokens out of range': { config: { contextTokens: 1 } },
  'claude.remoteControl': { config: { claude: { remoteControl: true } } },
  'a claude block': { config: { claude: { appendSystemPromptFile: 'p.md' } } },
  codex: { config: { codex: { trustFrom: '/r' } } },
  command: { config: { command: ['true'] } },
  niceness: { config: { niceness: 5 } },
  terminationMessagePath: { config: { terminationMessagePath: '/tmp/end' } },
  env: { config: { env: { A: '1' } } },
  'a read-only mount': { config: { mounts: [{ path: '/srv/a', readOnly: true }] } },
  'a writable mount': { config: { mounts: [{ path: '/srv/b', readOnly: false }] } },
  'a read-only mount, then a writable one': {
    config: {
      mounts: [
        { path: '/srv/a', readOnly: true },
        { path: '/srv/b', readOnly: false },
      ],
    },
  },
  callAdmission: { config: { callAdmission: { command: ['admit'], tools: ['Bash'] } } },
  projectMcp: { config: { projectMcp: ['playwright'] } },
  'an enabledSkills list': { config: { enabledSkills: ['a:b'] } },
  "enabledSkills: 'default'": { config: { enabledSkills: 'default' } },
  'a memory limit': { resources: { limits: { memory: '1Gi' } } },
  "restartPolicy: 'Always'": { restartPolicy: 'Always' },
  mayAsk: { config: { mayAsk: true } },
  "mayAsk, restartPolicy: 'Always'": { restartPolicy: 'Always', config: { mayAsk: true } },
  'codex and env on command': { config: { command: ['true'], env: { A: '1' }, codex: { trustFrom: '/r' } } },
};

const remote = { url: 'https://a.example' };
const mine = testOps({ sessions: new Map() });

/** An engine with every kind of harness, in the order the fixes name them. */
const ALL: Record<string, HarnessConfig> = { claude: 'claude', codex, command: commandHarness, remote, mine };

/** The check that refuses each ask on each harness of `ALL`, `''` where none does: claude, codex, command, remote, mine. */
const ON_ALL: Record<keyof typeof ASKS, readonly [Check | '', Check | '', Check | '', Check | '', Check | '']> = {
  nothing: ['', '', 'commandOwn', '', ''],
  'contextTokens in range': ['', 'knob', 'knob', 'remoteOwn', ''],
  'contextTokens out of range': ['range', 'knob', 'knob', 'remoteOwn', ''],
  'claude.remoteControl': ['', 'bridge', 'bridge', 'remoteOwn', ''],
  'a claude block': ['', 'claudeFlags', 'claudeFlags', 'remoteOwn', ''],
  codex: ['codexArgs', '', 'codexArgs', 'codexArgs', ''],
  command: ['commandArgs', 'commandArgs', '', 'commandArgs', ''],
  niceness: ['commandArgs', 'commandArgs', 'commandOwn', 'commandArgs', ''],
  terminationMessagePath: ['commandArgs', 'commandArgs', 'commandOwn', 'commandArgs', ''],
  env: ['', '', 'commandOwn', 'env', ''],
  'a read-only mount': ['', '', 'readOnlyMount', 'readOnlyMount', ''],
  'a writable mount': ['', 'writableMount', 'writableMount', 'writableMount', ''],
  'a read-only mount, then a writable one': ['', 'writableMount', 'readOnlyMount', 'readOnlyMount', ''],
  callAdmission: ['', 'callAdmission', 'callAdmission', 'callAdmission', ''],
  projectMcp: ['', '', 'projectMcp', 'remoteOwn', ''],
  'an enabledSkills list': ['', 'enabledSkills', 'enabledSkills', 'remoteOwn', ''],
  "enabledSkills: 'default'": ['', '', 'commandOwn', 'remoteOwn', ''],
  'a memory limit': ['', '', 'commandOwn', 'memoryLimit', ''],
  "restartPolicy: 'Always'": ['', 'keepsOpen', 'keepsOpen', 'keepsOpen', ''],
  mayAsk: ['holdsCalls', 'holdsCalls', 'holdsCalls', 'holdsCalls', 'holdsCalls'],
  "mayAsk, restartPolicy: 'Always'": ['', 'keepsOpen', 'keepsOpen', 'keepsOpen', 'holdsCalls'],
  'codex and env on command': ['codexArgs', 'commandArgs', 'codexArgs', 'codexArgs', ''],
};

/** Rows on an engine that lacks every taker of a check, whose fix then names none (`none`), on the harness named. */
const NARROW: readonly {
  harnesses: Record<string, HarnessConfig>;
  harness: string;
  ask: keyof typeof ASKS;
  check: Check;
  none: boolean;
}[] = [
  { harnesses: { codex, remote }, harness: 'codex', ask: 'contextTokens in range', check: 'knob', none: true },
  { harnesses: { codex, remote }, harness: 'codex', ask: 'claude.remoteControl', check: 'bridge', none: true },
  { harnesses: { codex, remote }, harness: 'codex', ask: 'a claude block', check: 'claudeFlags', none: true },
  { harnesses: { codex, remote }, harness: 'codex', ask: 'command', check: 'commandArgs', none: true },
  { harnesses: { codex, remote }, harness: 'codex', ask: 'a writable mount', check: 'writableMount', none: true },
  { harnesses: { codex, remote }, harness: 'codex', ask: 'callAdmission', check: 'callAdmission', none: true },
  { harnesses: { codex, remote }, harness: 'codex', ask: 'an enabledSkills list', check: 'enabledSkills', none: true },
  { harnesses: { codex, remote }, harness: 'codex', ask: "restartPolicy: 'Always'", check: 'keepsOpen', none: true },
  { harnesses: { codex, remote }, harness: 'codex', ask: 'mayAsk', check: 'holdsCalls', none: false },
  { harnesses: { codex, remote }, harness: 'remote', ask: 'codex', check: 'codexArgs', none: false },
  { harnesses: { codex, remote }, harness: 'remote', ask: 'env', check: 'env', none: false },
  { harnesses: { codex, remote }, harness: 'remote', ask: 'a read-only mount', check: 'readOnlyMount', none: false },
  { harnesses: { codex, remote }, harness: 'remote', ask: 'a memory limit', check: 'memoryLimit', none: false },
  { harnesses: { codex, remote }, harness: 'remote', ask: 'projectMcp', check: 'remoteOwn', none: false },
  { harnesses: { remote, mine }, harness: 'remote', ask: 'codex', check: 'codexArgs', none: true },
  { harnesses: { remote, mine }, harness: 'remote', ask: 'env', check: 'env', none: true },
  { harnesses: { remote, mine }, harness: 'remote', ask: 'a read-only mount', check: 'readOnlyMount', none: true },
  { harnesses: { remote, mine }, harness: 'remote', ask: 'a memory limit', check: 'memoryLimit', none: false },
  { harnesses: { remote, mine }, harness: 'remote', ask: "restartPolicy: 'Always'", check: 'keepsOpen', none: true },
  { harnesses: { remote, mine }, harness: 'mine', ask: 'mayAsk', check: 'holdsCalls', none: false },
];

const refusedOn = (harness: string, ask: Partial<TaskSpec>, harnesses: Record<string, HarnessConfig>) =>
  harnessRefusalOf({ brief: 'b', cwd: '/r', ...ask, harness }, harnesses);

/** Whether `said` is the words of `check` and no other's. */
const saidBy = (said: string, check: Check) =>
  said.includes(SAYS[check]) && Object.entries(SAYS).every(([c, words]) => c === check || c === 'keepsOpen' || !said.includes(words));

test('harnessRefusalOf: each ask on each kind of harness, refused by the same check, its fix naming the same harnesses', async (t) => {
  const names = Object.keys(ALL);
  for (const [ask, checks] of Object.entries(ON_ALL)) {
    await t.test(ask, () => {
      checks.forEach((check, i) => {
        const harness = names[i] ?? '';
        const said = refusedOn(harness, ASKS[ask] ?? {}, ALL);
        if (check === '') return assert.equal(said, undefined, `${ask} goes on \`${harness}\``);
        assert.ok(said !== undefined && saidBy(said, check), `${ask} on \`${harness}\` is refused by ${check}: ${said}`);
        const takers = TAKERS[check];
        if (takers !== undefined) assert.ok(said.includes(`on ${takers},`), `and its fix names ${takers}: ${said}`);
      });
    });
  }
  for (const row of NARROW) {
    await t.test(`${row.ask} on \`${row.harness}\` of ${Object.keys(row.harnesses).join(', ')}`, () => {
      const said = refusedOn(row.harness, ASKS[row.ask] ?? {}, row.harnesses);
      assert.ok(said !== undefined && saidBy(said, row.check), `refused by ${row.check}: ${said}`);
      assert.equal(said.includes("none of this engine's harnesses"), row.none, `its fix names a harness or none: ${said}`);
    });
  }
  await t.test('a harness the engine has not', () => {
    const said = refusedOn('nope', {}, ALL);
    assert.ok(said !== undefined && saidBy(said, 'unknown'), String(said));
  });
});
