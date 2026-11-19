/**
 * The capabilities answer (`src/capabilities.ts`, `CapabilitiesWithSteps` in `src/server-api.ts`): every list served with its shape, so
 * a full answer is answered as it was built, and one that breaks a list's shape is refused as the Api encodes it and as a client decodes
 * it.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Result, Schema } from 'effect';
import { CapabilitiesWithSteps } from 'objects';
import { answered } from './served.ts';

const rule = { rule: 'Bash(rm *)', source: '.claude/settings.json' };

const reach = {
  workflow: 'build',
  from: 'repo',
  step: 'implement',
  harness: 'claude-code',
  claudeCode: true,
  fence: {
    tools: ['Bash', 'Skill'],
    disallowedTools: ['Bash(git push *)'],
    allowedTools: [],
    permissionMode: 'dontAsk',
    sandbox: null,
    effort: 'high',
    mcp: ['docs'],
  },
  tools: {
    from: 'declared',
    names: ['Skill'],
    inferred: [],
    removed: [{ name: 'Bash', rule: 'Bash', source: 'disallowedTools:', of: null }],
  },
  skills: { names: ['look'], why: null },
  mcp: [{ server: 'docs', tools: [{ name: 'search', denied: null, asks: rule, allowed: false }], why: null }],
  denied: [rule],
  asked: [rule],
  allowed: {
    rules: ['Read'],
    takenBack: [{ rule: 'Bash(rm -rf *)', by: rule }],
    asked: [{ rule: 'Edit', by: rule }],
    unused: ['WebFetch'],
    bash: [{ rule: 'Bash(git *)', command: 'git *', except: ['Bash(git push *)'], asks: [] }],
    exceptions: [{ rule: 'Bash(git *)', except: ['Bash(git push *)'], asks: [] }],
    dontAsk: true,
    askDenier: 'dontAsk',
    why: null,
  },
  readOnly: [{ command: 'ls', measured: true, denied: null, asks: rule }],
};

const full = {
  repo: '/work/nemia',
  skills: [{ name: 'look', description: 'Look at the board.', source: '.claude/skills/look/SKILL.md' }],
  agents: [{ name: 'grace', description: null, source: '.claude/agents/grace.md' }],
  mcp: [
    {
      name: 'docs',
      source: '.mcp.json',
      type: 'stdio',
      command: 'npx',
      args: ['docs-mcp'],
      url: null,
      enabled: true,
      tools: [{ name: 'search', description: 'Search the docs.', denied: null }],
      error: null,
      notAsked: null,
      factoryState: 'connected',
      checkedAt: '2026-11-19T10:00:00.000Z',
    },
  ],
  denied: [rule],
  asked: [rule],
  allowed: [{ rule: 'Read', source: '.claude/settings.json' }],
  warnings: [],
  measured: {
    harness: 'Claude Code',
    version: '2.1.270',
    measuredAt: '2026-09-14',
    source: 'a ledger',
    tools: ['Bash', 'Read'],
    inferred: [{ name: 'Skill', why: 'a skill loads' }],
    lacks: ['Artifact'],
  },
  readOnly: {
    harness: 'Claude Code',
    version: '2.1.272',
    measuredAt: '2026-09-15',
    source: 'a review',
    measured: ['ls'],
    documented: ['git'],
    docs: 'https://code.claude.com/docs',
  },
  steps: [reach],
};

const decodes = (value: unknown): boolean => Result.isSuccess(Schema.decodeUnknownResult(CapabilitiesWithSteps)(value));

test('a full capabilities answer is answered as it was built, every list kept with its shape', () => {
  assert.deepEqual(answered('server', 'capabilities', full), full);
});

test('an answer that breaks a list of the capabilities is refused', () => {
  assert.equal(decodes(full), true, 'the full answer decodes, so each refusal below is its one change');
  const [server] = full.mcp;
  assert.equal(decodes({ ...full, mcp: [{ ...server, type: 'ws' }] }), false, "a server's type is a transport a harness loads, or unknown");
  const { allowed: _allowed, ...noAllowed } = reach;
  assert.equal(decodes({ ...full, steps: [noAllowed] }), false, "a step's reach says what the settings allow it");
  const [skill] = full.skills;
  const { description: _description, ...undescribed } = skill ?? {};
  assert.equal(decodes({ ...full, skills: [undescribed] }), false, 'a skill says its description, null where it has none');
  assert.equal(
    decodes({ ...full, steps: [{ ...reach, allowed: { ...reach.allowed, askDenier: 'never' } }] }),
    false,
    'why what asks is denied is dontAsk or a job',
  );
});
