/**
 * The Factory's and the inbox's reads as the api answers them, every key the board reads: an inbox entry (`inboxEntry`), a card's page
 * (`cardPage`), what the repository offers (`capabilities`, its steps from `stepReach`), the quota (`quota`), the cap and the last pass
 * (`ceilings`) and the daemon (`daemon`). Each takes keys to put over its own.
 */
import type { Capabilities, Ceilings, Daemon, InboxCardPage, InboxEntry, PassCost, Quota, QuotaWindow, StepReach } from '../src/lib/api.ts';

/** A queued card whose start the tick tried and did not make: `queued` and `tried` both set. */
export const inboxEntry = (extra: Partial<InboxEntry> = {}): InboxEntry => ({
  name: 'decode-the-reads',
  file: 'decode-the-reads.md',
  title: 'Decode the reads',
  workflow: 'build',
  repo: '/work/repo',
  factory: 'nemia',
  from: [],
  startedAs: ['r-0'],
  error: null,
  body: 'Decode the reads\n',
  filedAt: '2026-09-30T05:00:00.000Z',
  queued: { at: '2026-09-30T05:01:00.000Z', place: 1 },
  tried: { at: '2026-09-30T05:02:00.000Z', repo: '/work/repo', why: 'the workflow is gone', refused: true },
  factoryRepo: null,
  ...extra,
});

/** A card's page: the entry, its file as written and its key rows. */
export const cardPage = (extra: Partial<InboxCardPage> = {}): InboxCardPage => ({
  ...inboxEntry(),
  source: '---\nworkflow: build\n---\nDecode the reads\n',
  keys: [
    { key: 'workflow', value: 'build', meaning: 'The workflow a start runs.' },
    { key: 'repo', value: null, meaning: 'The repository a start runs in.' },
  ],
  ...extra,
});

/** What a Claude Code step gets, every list with a row and every null a value. */
export const stepReach = (extra: Partial<StepReach> = {}): StepReach => ({
  workflow: 'build',
  from: 'repo',
  step: 'implement',
  harness: 'claude',
  claudeCode: true,
  fence: {
    tools: null,
    disallowedTools: ['Bash(git push *)'],
    allowedTools: ['Bash(npm test)'],
    permissionMode: 'dontAsk',
    sandbox: null,
    effort: 'high',
    mcp: [],
  },
  tools: {
    from: 'measured',
    names: ['Read', 'Edit'],
    inferred: ['Read'],
    removed: [{ name: 'CronCreate', rule: 'Cron*', source: '.claude/settings.json', of: 'Cron*' }],
  },
  skills: { names: ['look'], why: null },
  mcp: [
    {
      server: 'playwright',
      tools: [{ name: 'browser_click', denied: null, asks: { rule: 'mcp__playwright', source: '.claude/settings.json' }, allowed: false }],
      why: null,
    },
    { server: 'quiet', tools: null, why: 'not asked' },
  ],
  denied: [{ rule: 'Bash(git push *)', source: 'the step' }],
  asked: [{ rule: 'mcp__playwright', source: '.claude/settings.json' }],
  allowed: {
    rules: ['Bash(npm test)'],
    takenBack: [{ rule: 'Bash(git *)', by: { rule: 'Bash(git push *)', source: 'the step' } }],
    asked: [{ rule: 'mcp__playwright__*', by: { rule: 'mcp__playwright', source: '.claude/settings.json' } }],
    unused: ['WebFetch'],
    bash: [{ rule: 'Bash(npm *)', command: 'npm *', except: ['npm publish'], asks: ['npm login'] }],
    exceptions: [{ rule: 'Bash(npm *)', except: ['npm publish'], asks: ['npm login'] }],
    dontAsk: true,
    askDenier: 'dontAsk',
    why: null,
  },
  readOnly: [{ command: 'cat', measured: true, denied: null, asks: { rule: 'Bash', source: '.claude/settings.json' } }],
  ...extra,
});

/** A step off Claude Code: nothing measured, so every reach it has no measure of is null. */
export const codexReach = (): StepReach =>
  stepReach({
    step: 'review',
    harness: 'codex',
    claudeCode: false,
    fence: { ...stepReach().fence, permissionMode: null, sandbox: 'read-only' },
    tools: null,
    skills: null,
    mcp: null,
    readOnly: null,
    allowed: { ...stepReach().allowed, askDenier: 'a job', why: 'no settings' },
  });

/** What the repository offers, with a server that answered and one that was not asked. */
export const capabilities = (extra: Partial<Capabilities> = {}): Capabilities => ({
  repo: '/work/repo',
  skills: [{ name: 'look', description: null, source: '.claude/skills/look/SKILL.md' }],
  agents: [{ name: 'ada', description: 'The engineer.', source: 'workflows/agents/ada.md' }],
  mcp: [
    {
      name: 'playwright',
      source: '.mcp.json',
      type: 'stdio',
      command: 'npx',
      args: ['@playwright/mcp'],
      url: null,
      enabled: true,
      tools: [{ name: 'browser_click', description: 'Click.', denied: null }],
      error: null,
      notAsked: null,
      checkedAt: '2026-09-30T05:00:00.000Z',
      factoryState: null,
    },
    {
      name: 'remote',
      source: '.mcp.json',
      type: 'http',
      command: null,
      args: [],
      url: 'https://example.com/mcp',
      enabled: false,
      tools: null,
      error: null,
      notAsked: 'not enabled',
      checkedAt: null,
      factoryState: 'needs-auth',
    },
  ],
  denied: [{ rule: 'Bash(git push *)', source: '.claude/settings.json' }],
  asked: [{ rule: 'mcp__playwright', source: '.claude/settings.json' }],
  allowed: [{ rule: 'Bash(npm test)', source: '.claude/settings.json' }],
  warnings: ['.mcp.json does not read'],
  measured: {
    harness: 'Claude Code',
    version: '2.1.270',
    measuredAt: '2026-09-14',
    source: 'docs/plan-hold-the-bar.md',
    tools: ['Agent', 'WebFetch'],
    inferred: [{ name: 'Bash', why: 'on the fenced' }],
    lacks: ['AskUserQuestion'],
  },
  readOnly: {
    harness: 'Claude Code',
    version: '2.1.272',
    measuredAt: '2026-09-15',
    source: 'a review',
    measured: ['cat'],
    documented: ['git'],
    docs: 'read 2026-09-16',
  },
  steps: [stepReach(), codexReach()],
  ...extra,
});

/** A window of the plan, used past its mark. */
const window = (extra: Partial<QuotaWindow> = {}): QuotaWindow => ({
  key: 'five_hour',
  label: '5-hour',
  usedPercentage: 82,
  resetsAt: '2026-09-30T08:00:00.000Z',
  reset: false,
  marked: true,
  ...extra,
});

/** The quota, fresh; `asking` with the last answer is `quota({ state: 'asking', last: … })`. */
export const quota = (extra: Partial<Quota> = {}): Quota => ({
  state: 'fresh',
  askedAt: '2026-09-30T05:00:00.000Z',
  ageMs: 1_000,
  againAt: '2026-09-30T05:05:00.000Z',
  subscription: 'max',
  windows: [window(), window({ key: 'seven_day', label: 'week', resetsAt: null, marked: false })],
  last: null,
  keepMs: 300_000,
  markAt: 80,
  said: null,
  ...extra,
});

/** One phase's count. */
const phase = (ms: number) => ({ ms, calls: 2, bytes: 100, reads: 3, spawned: 1 });

/** A pass's cost, every phase counted, one harness observed. */
export const passCost = (extra: Partial<PassCost> = {}): PassCost => ({
  at: '2026-09-30T05:00:00.000Z',
  ms: 120,
  phases: {
    records: phase(10),
    asks: phase(1),
    journals: phase(20),
    revisions: phase(3),
    observe: phase(40),
    runtime: phase(5),
    place: phase(30),
    assess: phase(4),
    act: phase(10),
  },
  harnesses: { claude: { calls: 1, ms: 40, listed: 3, spawned: 1 } },
  records: 12,
  bytes: 800,
  spawned: 8,
  overheadMs: 2,
  rested: 4,
  ...extra,
});

/** The cap and the runs it counts and holds, after a pass. */
export const ceilings = (extra: Partial<Ceilings> = {}): Ceilings => ({
  last: { sessions: 4, runs: 2 },
  cap: 2,
  inFlight: ['r-1', 'r-2'],
  held: [{ run: 'r-3', inFlight: 2, cap: 2, word: 'held by the cap' }],
  pass: passCost(),
  ...extra,
});

/** A daemon that ticks the store. */
export const daemon = (extra: Partial<Daemon> = {}): Daemon => ({
  kind: 'ticking',
  by: 'api',
  url: 'http://127.0.0.1:8787',
  start: 'npm start in apps/api',
  ticking: true,
  pid: 4242,
  cwd: '/work/repo',
  every: 5,
  startedAt: '2026-09-30T04:00:00.000Z',
  passedAt: '2026-09-30T05:00:00.000Z',
  lastHeardAt: '2026-09-30T05:00:00.000Z',
  stoppedAt: null,
  staleAfterMs: 60_000,
  identity: 'same',
  line: 'nemia up: ticking, pid 4242',
  unobserved: [],
  ...extra,
});
