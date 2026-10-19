/**
 * Who may say which word (`docs/architecture.md`, *Who owns what*). Three vocabularies stay in their layer:
 *
 * - **A harness's words stay in the runtime** (`HARNESS`): the names Claude Code, Codex and Anthropic, and the runtime's own permission
 *   modes and sandboxes, imported from its public entry, but the plain English ones (`PLAIN_HARNESS`). Refused in the orchestrator's `src`
 *   and `bin`, `apps/api/src` and `apps/web/src`.
 * - **A workflow's words stay above the runtime** (`WORKFLOW`): a workflow, a step, a gate, a factory, a closeout, the orchestrator,
 *   `nemia` and Nemia. Refused in the runtime's `src` and `bin`.
 * - **This repository's team stays out of the packages** (`teamOf`): the name of each agent of `workflows/agents/`, read as the test
 *   runs, so a new agent is refused with no edit here. Refused in every package's `src`. A name that is plain English (`PLAIN_NAMES`)
 *   counts only as a quoted literal or a path segment.
 *
 * A word is matched whole and in any case, comments included (`wordsIn`): a hyphen or a dot ends it, so `claude-detached` and
 * `CLAUDE.md` say it, and a longer name (`claudeArgs`, `$claude`) does not. Tests, the board's vendored components and its generated
 * route tree are not read.
 *
 * Each file that says such a word today is a known exception, counted file by file (`HARNESS_WORDS`, `WORKFLOW_WORDS`, `TEAM_NAMES`),
 * and the count only shrinks. Each entry names the card that removes its words (`CARDS`), else the move in words and where it goes
 * (`MOVES`). `ratchetBreaks` refuses a file no entry holds, a count above the measure or below it, an entry for a file gone or clean, and
 * an entry with no card, an unknown card, or a move with nowhere to go. A change that takes a word out of a file lowers its count in the
 * same commit.
 *
 * The test reads files outside this package: `turbo.json` makes the apps' sources, the runtime and `workflows/agents/` inputs of this
 * package's tests; after a change to `workflows/`, `npx turbo run test --force`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CLAUDE_PERMISSION_MODES, CODEX_SANDBOXES } from 'agent-runtime';
import { scratch } from './scratch.ts';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');

/** The runtime's permission modes and sandboxes that are plain English, and so no harness's own word. */
const PLAIN_HARNESS = ['default', 'auto', 'plan', 'manual', 'read-only'];

/** The words only a harness says: its name, its maker's, and its own modes and sandboxes. */
const HARNESS = [
  'claude',
  'codex',
  'anthropic',
  ...[...CLAUDE_PERMISSION_MODES, ...CODEX_SANDBOXES].filter((w) => !PLAIN_HARNESS.includes(w)),
];

/** The words only a workflow's layer says, singular and plural. */
const WORKFLOW = [
  ...['workflow', 'step', 'gate', 'factory', 'closeout', 'orchestrator'].flatMap((w) => [w, `${w}s`]),
  'factories',
  'wf',
  'nemia',
];

/** The team's names that are plain English, counted only as a quoted literal or a path segment. */
const PLAIN_NAMES: readonly string[] = [];

/** The cards and slices filed to remove a word from a layer, by the id an entry names. */
const CARDS: Readonly<Record<string, string>> = {
  ycug: 'the-runtime-runs-a-check-as-ycug: a check runs on a runtime command harness',
  u42s: 'the-runtime-records-on-each-u42s: the facts on the attempt — its effective mode, the denials measured, the exit verdict, when filed',
  'slice-2': 'Nemia platform slice 2 (amend-the-nemia-intent-one-n-y2vp): mounts, and every run in a factory',
  'slice-3': 'Nemia platform slice 3 (amend-the-nemia-intent-one-n-y2vp): one daemon per machine, session admission and pools',
  'slice-4':
    "Nemia platform slice 4 (amend-the-nemia-intent-one-n-y2vp): the command table and the rename to nemia; the api answers the web's command text",
};

type Move = { move: string; to: string };

/** The moves no card covers yet, each with where it goes. */
const MOVES = {
  render: {
    move: "rendering an agent's instructions, its skills and the closeout's ask for a harness",
    to: 'packages/agent-runtime, where each harness renders its own session',
  },
  reach: {
    move: 'what a harness, its mode and its tools let a session reach (the capabilities and the reach)',
    to: 'packages/agent-runtime, answered per harness through the orchestrator',
  },
  defaults: { move: 'the default harness and its settings', to: "packages/agent-runtime's own default harnesses" },
  knobs: {
    move: "a harness's knobs as a step writes them: the keys, the rules the runtime cannot refuse and the fence's ranking",
    to: "packages/agent-runtime, the runtime describing each harness's knobs",
  },
  wait: {
    move: 'the words for a session waiting on a person: the harness that holds it and the command that lists it',
    to: "packages/agent-runtime's view of the attempt, which names where it is answered",
  },
  checkout: {
    move: "the harnesses' own files in a checkout: their instructions file and config folders",
    to: 'packages/agent-runtime, where each harness names its files',
  },
  prompt: {
    move: "the harness's own prompt an agent keeps, trims or replaces (`harnessPrompt`), and the harness folders its skills come from",
    to: "packages/agent-runtime, which names each harness's prompt and folders; the layers above say the harness's prompt",
  },
  api: {
    move: "the api's harness words",
    to: "packages/agent-orchestrator, answered in its own words from the runtime's lists, through its client",
  },
  web: { move: "the board's harness words", to: "apps/api, answered in the orchestrator's words" },
  closeout: {
    move: "the attempt's closeout, a workflow's word for what a session said as it finished",
    to: "packages/agent-runtime's own word for it, the statement its readers already name",
  },
  step: {
    move: "the engine's step verb and its refusal, a workflow's word for one action on a task",
    to: "packages/agent-runtime's own word for it, in its export lists",
  },
  reword: {
    move: "a workflow's word in the runtime's prose: its callers' names (`nemia up`, the orchestrator, a step) and the same word in another sense (the SDK's client factory, Claude Code's gate)",
    to: 'the same files in packages/agent-runtime, said in its own words: a caller, a task, an attempt, a session',
  },
  quota: {
    move: "the quota's words for Claude Code: the harness the api asks, its get_usage and its states",
    to: "packages/agent-runtime's quota answer, which names its harness and states; the api and the board show it in the orchestrator's words",
  },
  guide: {
    move: "the contributor guide's file named in a JSDoc, as the reason for a rule",
    to: 'the same JSDoc, saying the rule itself',
  },
  team: {
    move: "an agent of this repository's team given as the example name in a message and a JSDoc",
    to: "the same sentences in packages/agent-orchestrator, with a name the team's folder does not hold",
  },
} satisfies Record<string, Move>;

type Entry = { count: number; card: string } | ({ count: number } & Move);
type Baseline = Readonly<Record<string, Entry>>;

/** Each file outside the runtime that says a harness's word today, with its count and what removes them. */
const HARNESS_WORDS: Baseline = {
  'apps/api/src/agents/agents.ts': { count: 2, ...MOVES.prompt },
  'apps/api/src/agents/skills.ts': { count: 7, ...MOVES.checkout },
  'apps/api/src/app.ts': { count: 3, ...MOVES.quota },
  'apps/api/src/capabilities/capabilities.ts': { count: 27, ...MOVES.reach },
  'apps/api/src/capabilities/reach.ts': { count: 50, ...MOVES.reach },
  'apps/api/src/detail/detail.ts': { count: 23, card: 'u42s' },
  'apps/api/src/factory/quota.ts': { count: 36, ...MOVES.quota },
  'apps/api/src/stats/stats.ts': { count: 1, card: 'u42s' },
  'apps/api/src/steps/steps.ts': { count: 1, ...MOVES.wait },
  'apps/api/src/workflows/builder.ts': { count: 3, ...MOVES.defaults },
  'apps/api/src/workflows/workflows.ts': { count: 9, ...MOVES.api },
  'apps/web/src/components/AgentCard.tsx': { count: 1, ...MOVES.prompt },
  'apps/web/src/components/AgentForm.tsx': { count: 7, ...MOVES.web },
  'apps/web/src/components/Decide.tsx': { count: 1, ...MOVES.checkout },
  'apps/web/src/components/Facts.tsx': { count: 17, card: 'u42s' },
  'apps/web/src/components/Needs.tsx': { count: 1, ...MOVES.wait },
  'apps/web/src/components/QuotaLine.tsx': { count: 1, ...MOVES.quota },
  'apps/web/src/components/Reach.tsx': { count: 10, ...MOVES.reach },
  'apps/web/src/components/SkillPicker.tsx': { count: 2, ...MOVES.checkout },
  'apps/web/src/components/StepForm.tsx': { count: 2, ...MOVES.web },
  'apps/web/src/lib/agents.ts': { count: 7, ...MOVES.web },
  'apps/web/src/lib/api/agents.ts': { count: 2, ...MOVES.web },
  'apps/web/src/lib/api/capabilities.ts': { count: 13, ...MOVES.reach },
  'apps/web/src/lib/api/detail.ts': { count: 9, card: 'u42s' },
  'apps/web/src/lib/api/library.ts': { count: 6, ...MOVES.web },
  'apps/web/src/lib/api/quota.ts': { count: 8, ...MOVES.quota },
  'apps/web/src/lib/api/steps.ts': { count: 1, ...MOVES.web },
  'apps/web/src/lib/builder.ts': { count: 2, ...MOVES.web },
  'apps/web/src/lib/quota.ts': { count: 2, ...MOVES.quota },
  'apps/web/src/lib/skills.ts': { count: 2, ...MOVES.prompt },
  'apps/web/src/lib/transcript.ts': { count: 11, ...MOVES.web },
  'apps/web/src/routes/capabilities.tsx': { count: 19, ...MOVES.reach },
  'packages/agent-orchestrator/src/agents/agents.store.ts': { count: 7, ...MOVES.render },
  'packages/agent-orchestrator/src/agents/agents.ts': { count: 35, ...MOVES.render },
  'packages/agent-orchestrator/src/agents/read.store.ts': { count: 1, ...MOVES.checkout },
  'packages/agent-orchestrator/src/artifacts/artifacts.store.ts': { count: 2, card: 'slice-2' },
  'packages/agent-orchestrator/src/artifacts/artifacts.ts': { count: 3, card: 'slice-2' },
  'packages/agent-orchestrator/src/branches/branches.ts': { count: 4, ...MOVES.checkout },
  'packages/agent-orchestrator/src/cap/cap.ts': { count: 6, card: 'slice-3' },
  'packages/agent-orchestrator/src/cli/flags.ts': { count: 9, card: 'slice-4' },
  'packages/agent-orchestrator/src/closeout/closeout.ts': { count: 5, ...MOVES.render },
  'packages/agent-orchestrator/src/daemon/daemon.store.ts': { count: 1, card: 'slice-3' },
  'packages/agent-orchestrator/src/decide/decide.verb.ts': { count: 4, ...MOVES.wait },
  'packages/agent-orchestrator/src/ending/ending.ts': { count: 1, ...MOVES.knobs },
  'packages/agent-orchestrator/src/folder/folder.store.ts': { count: 2, ...MOVES.knobs },
  'packages/agent-orchestrator/src/folder/write.store.ts': { count: 4, ...MOVES.knobs },
  'packages/agent-orchestrator/src/former/former.ts': { count: 32, ...MOVES.knobs },
  'packages/agent-orchestrator/src/harness/harness.ts': { count: 9, ...MOVES.defaults },
  'packages/agent-orchestrator/src/keys/filed-as.ts': { count: 1, ...MOVES.knobs },
  'packages/agent-orchestrator/src/keys/keys.ts': { count: 41, ...MOVES.knobs },
  'packages/agent-orchestrator/src/keys/tools.ts': { count: 15, ...MOVES.knobs },
  'packages/agent-orchestrator/src/list/list.ts': { count: 9, ...MOVES.wait },
  'packages/agent-orchestrator/src/record/places.store.ts': { count: 1, card: 'slice-2' },
  'packages/agent-orchestrator/src/record/record.store.ts': { count: 2, ...MOVES.wait },
  'packages/agent-orchestrator/src/record/record.ts': { count: 1, card: 'u42s' },
  'packages/agent-orchestrator/src/retry/retry-refusal.ts': { count: 3, ...MOVES.knobs },
  'packages/agent-orchestrator/src/try/try.ts': { count: 16, ...MOVES.reach },
  'packages/agent-orchestrator/src/try/try.verb.ts': { count: 1, ...MOVES.checkout },
  'packages/agent-orchestrator/src/yours/yours.ts': { count: 1, ...MOVES.checkout },
  'packages/agent-orchestrator/src/runner.ts': { count: 1, ...MOVES.wait },
  'packages/agent-orchestrator/src/runtime-client.ts': { count: 7, ...MOVES.defaults },
  'packages/agent-orchestrator/src/skills/read.store.ts': { count: 9, ...MOVES.checkout },
  'packages/agent-orchestrator/src/skills/skills.ts': { count: 11, ...MOVES.render },
  'packages/agent-orchestrator/src/stats/discipline.ts': { count: 10, card: 'u42s' },
  'packages/agent-orchestrator/src/status/status.ts': { count: 11, card: 'u42s' },
  'packages/agent-orchestrator/src/step/step.ts': { count: 78, ...MOVES.knobs },
  'packages/agent-orchestrator/src/tick/told.verb.ts': { count: 15, ...MOVES.render },
  'packages/agent-orchestrator/src/views/views.verb.ts': { count: 2, ...MOVES.wait },
  'packages/agent-orchestrator/src/workflow.ts': { count: 1, ...MOVES.knobs },
  'packages/agent-orchestrator/src/workflow/fence.ts': { count: 1, ...MOVES.knobs },
  'packages/agent-orchestrator/src/workflow/step-file.ts': { count: 13, ...MOVES.knobs },
  'packages/agent-orchestrator/src/workflow/validate.ts': { count: 22, ...MOVES.knobs },
  'packages/agent-orchestrator/src/workspace/workspace.ts': { count: 3, card: 'slice-2' },
};

/** Each file of the runtime that says a workflow's word today, with its count and what removes them. */
const WORKFLOW_WORDS: Baseline = {
  'packages/agent-runtime/src/a2a/map.ts': { count: 12, ...MOVES.closeout },
  'packages/agent-runtime/src/a2a/remote.ts': { count: 1, ...MOVES.reword },
  'packages/agent-runtime/src/core/domain.ts': { count: 14, ...MOVES.closeout },
  'packages/agent-runtime/src/core/engine/engine.ts': { count: 26, ...MOVES.step },
  'packages/agent-runtime/src/core/engine/filing.ts': { count: 6, ...MOVES.reword },
  'packages/agent-runtime/src/core/engine/index.ts': { count: 1, ...MOVES.step },
  'packages/agent-runtime/src/core/engine/journal.ts': { count: 1, ...MOVES.reword },
  'packages/agent-runtime/src/core/event-schema.ts': { count: 1, ...MOVES.closeout },
  'packages/agent-runtime/src/core/lifecycle.ts': { count: 7, ...MOVES.closeout },
  'packages/agent-runtime/src/core/path.ts': { count: 2, ...MOVES.reword },
  'packages/agent-runtime/src/core/session.ts': { count: 3, ...MOVES.reword },
  'packages/agent-runtime/src/service/options.ts': { count: 4, ...MOVES.reword },
  'packages/agent-runtime/src/harness/args.ts': { count: 3, ...MOVES.reword },
  'packages/agent-runtime/src/harness/claude/bg.ts': { count: 20, ...MOVES.closeout },
  'packages/agent-runtime/src/harness/claude/code.ts': { count: 3, ...MOVES.reword },
  'packages/agent-runtime/src/harness/claude/inbox.ts': { count: 2, ...MOVES.reword },
  'packages/agent-runtime/src/harness/claude/transcript.ts': { count: 2, ...MOVES.closeout },
  'packages/agent-runtime/src/harness/claude/vocabulary.ts': { count: 1, ...MOVES.reword },
  'packages/agent-runtime/src/harness/codex/codex.ts': { count: 3, ...MOVES.reword },
  'packages/agent-runtime/src/harness/detached/detached.ts': { count: 21, ...MOVES.closeout },
  'packages/agent-runtime/src/harness/detached/output.ts': { count: 2, ...MOVES.closeout },
  'packages/agent-runtime/src/harness/detached/said.ts': { count: 1, ...MOVES.closeout },
  'packages/agent-runtime/src/harness/mcp.ts': { count: 1, ...MOVES.reword },
  'packages/agent-runtime/src/harness/sdk.ts': { count: 2, ...MOVES.reword },
  'packages/agent-runtime/src/index.ts': { count: 3, ...MOVES.reword },
  'packages/agent-runtime/src/service/say.ts': { count: 1, ...MOVES.reword },
};

/** Each package file that names an agent of the team today, with its count and what removes them. */
const TEAM_NAMES: Baseline = {
  'packages/agent-orchestrator/src/factory/factory.ts': { count: 2, ...MOVES.team },
};

/** A rule: the words it refuses, where, what it calls them, and what a file that says one does instead. */
type Rule = { what: string; dirs: readonly string[]; fix: string };

const HARNESS_RULE: Rule = {
  what: 'harness words',
  dirs: ['packages/agent-orchestrator/src', 'packages/agent-orchestrator/bin', 'apps/api/src', 'apps/web/src'],
  fix: "a harness's words stay in packages/agent-runtime: say it in this layer's words, or move it there",
};

const WORKFLOW_RULE: Rule = {
  what: 'workflow words',
  dirs: ['packages/agent-runtime/src', 'packages/agent-runtime/bin'],
  fix: 'the runtime runs sessions and knows no workflow: say it in its words, a task, an attempt or a session',
};

const TEAM_RULE: Rule = {
  what: 'team names',
  dirs: fs.readdirSync(path.join(ROOT, 'packages')).map((p) => `packages/${p}/src`),
  fix: "the team is this repository's, never the packages': name no agent of workflows/agents/ in their source",
};

/** The files the scan leaves out: tests, and the board's vendored and generated files. */
const skipped = (file: string): boolean =>
  file.endsWith('.test.ts') ||
  file.split('/').includes('test') ||
  file.startsWith('apps/web/src/components/ui/') ||
  file === 'apps/web/src/routeTree.gen.ts';

/** Every `.ts` and `.tsx` under `dirs`, by its path from the root, with its text. */
const textsOf = (dirs: readonly string[]): Map<string, string> =>
  new Map(
    dirs
      .filter((dir) => fs.existsSync(path.join(ROOT, dir)))
      .flatMap((dir) =>
        fs.readdirSync(path.join(ROOT, dir), { recursive: true, encoding: 'utf8' }).map((f) => `${dir}/${f.split(path.sep).join('/')}`),
      )
      .filter((f) => /\.tsx?$/.test(f) && !skipped(f))
      .sort()
      .map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]),
  );

/** The team: the name of each agent file in `agentsDir`, without its `.md`. */
const teamOf = (agentsDir: string): string[] =>
  fs
    .readdirSync(agentsDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.slice(0, -'.md'.length))
    .sort();

const escaped = (word: string): string => word.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

/** Whether the match at `at`, `length` long, is a quoted literal or a path segment of `text`. */
function quotedOrPath(text: string, at: number, length: number): boolean {
  const before = text[at - 1] ?? '';
  const after = text[at + length] ?? '';
  return (/['"`]/.test(before) && before === after) || before === '/' || after === '/';
}

/**
 * How many times `text` says one of `words`, whole and in any case: no letter, digit, `_` or `$` on either side. A word in `plain`
 * counts only as a quoted literal or a path segment.
 */
function wordsIn(text: string, words: readonly string[], plain: readonly string[] = []): number {
  if (words.length === 0) return 0;
  const pattern = new RegExp(`(?<![\\w$])(?:${words.map(escaped).join('|')})(?![\\w$])`, 'gi');
  const isPlain = new Set(plain.map((w) => w.toLowerCase()));
  let count = 0;
  for (const m of text.matchAll(pattern)) if (!isPlain.has(m[0].toLowerCase()) || quotedOrPath(text, m.index, m[0].length)) count += 1;
  return count;
}

/** Each file's count of `words`, for the files that say one at least once. */
const measured = (texts: ReadonlyMap<string, string>, words: readonly string[], plain: readonly string[] = []): Record<string, number> =>
  Object.fromEntries([...texts].map(([file, text]) => [file, wordsIn(text, words, plain)]).filter(([, count]) => count !== 0));

/** What an entry fails to name: a card `CARDS` knows, else a move with where it goes. */
function namingBreak(file: string, what: string, entry: Entry): string | undefined {
  if ('card' in entry)
    return entry.card in CARDS
      ? undefined
      : `${file}'s entry for ${what} names ${entry.card}, a card CARDS does not know: name a filed card, or the move and where it goes`;
  if (!entry.move.trim() || !entry.to.trim())
    return `${file}'s entry for ${what} names no card and no move with where it goes: name the card that removes them, else the move and its \`to\``;
  return undefined;
}

/** What an entry's count and its file's measure disagree on, as a sentence naming the fix. */
function countBreak(file: string, what: string, count: number, allowed: number, exists: (file: string) => boolean): string | undefined {
  if (!exists(file)) return `${file} holds ${what} in the baseline but is not on disk: where it moved, rename its entry; else take it off`;
  if (count === 0) return `${file} holds no ${what} left: take its entry off the baseline`;
  if (count > allowed) return `${file} holds ${count} ${what}, more than the ${allowed} the baseline allows: never add them here`;
  if (count < allowed) return `${file} holds ${count} ${what}, fewer than the baseline's ${allowed}: lower its count to ${count}`;
  return undefined;
}

/**
 * What a measure and its baseline disagree on, each a sentence naming the fix: a file no entry holds, a count above or below the
 * measure, an entry for a file gone or clean, and an entry that names no card it can be held to.
 */
function ratchetBreaks(rule: Rule, counts: Record<string, number>, baseline: Baseline, exists: (file: string) => boolean): string[] {
  const out: string[] = [];
  for (const [file, count] of Object.entries(counts))
    if (!(file in baseline)) out.push(`${file} holds ${count} ${rule.what}: ${rule.fix}; never add them here`);
  for (const [file, entry] of Object.entries(baseline)) {
    const naming = namingBreak(file, rule.what, entry);
    const counted = countBreak(file, rule.what, counts[file] ?? 0, entry.count, exists);
    if (naming) out.push(naming);
    if (counted) out.push(counted);
  }
  return out;
}

const onDisk = (file: string): boolean => fs.existsSync(path.join(ROOT, file));

/** Every breach of the three rules over `texts` of each, against their baselines. */
function breaches(texts: { harness: Map<string, string>; workflow: Map<string, string>; team: Map<string, string> }, team: string[]) {
  return [
    ...ratchetBreaks(HARNESS_RULE, measured(texts.harness, HARNESS), HARNESS_WORDS, onDisk),
    ...ratchetBreaks(WORKFLOW_RULE, measured(texts.workflow, WORKFLOW), WORKFLOW_WORDS, onDisk),
    ...ratchetBreaks(TEAM_RULE, measured(texts.team, team, PLAIN_NAMES), TEAM_NAMES, onDisk),
  ];
}

const repository = () => ({ harness: textsOf(HARNESS_RULE.dirs), workflow: textsOf(WORKFLOW_RULE.dirs), team: textsOf(TEAM_RULE.dirs) });

const TEAM = teamOf(path.join(ROOT, 'workflows', 'agents'));

/** Each word of `plain` that none of the runtime's `lists` holds: a plain word left behind when the runtime dropped it. */
const stalePlain = (plain: readonly string[], lists: readonly (readonly string[])[]): string[] =>
  plain
    .filter((w) => !lists.some((list) => list.includes(w)))
    .map((w) => `PLAIN_HARNESS holds ${w}, which the runtime no longer lists: take it off`);

test('the matcher counts a word whole and in any case, and a plain word only quoted or in a path', () => {
  assert.equal(wordsIn("Claude, then claude-code; say 'claude', and codex/", ['claude', 'codex']), 4);
  assert.equal(wordsIn('claudeArgs, $claude, preclaude, claude_x', ['claude']), 0);
  assert.equal(wordsIn('CLAUDE.md and danger-full-access', HARNESS), 2);
  assert.equal(wordsIn("hire 'otto', read agents/otto.md, run otto/", ['otto'], ['otto']), 3);
  assert.equal(wordsIn("ask otto, then otto's answer", ['otto'], ['otto']), 0);
  assert.equal(wordsIn('ask otto', ['otto']), 1, 'a word not plain counts in prose');
});

test("the lists: the runtime's harness words but the plain ones, every plain one the runtime's, and the team read from its folder", () => {
  for (const w of [...CLAUDE_PERMISSION_MODES, ...CODEX_SANDBOXES])
    assert.equal(HARNESS.includes(w), !PLAIN_HARNESS.includes(w), `${w} is ${PLAIN_HARNESS.includes(w) ? 'plain' : "the harness's"}`);
  assert.ok(HARNESS.includes('bypassPermissions') && HARNESS.includes('workspace-write'));
  assert.deepEqual(stalePlain(PLAIN_HARNESS, [CLAUDE_PERMISSION_MODES, CODEX_SANDBOXES]), []);
  assert.deepEqual(stalePlain([...PLAIN_HARNESS, 'yolo'], [CLAUDE_PERMISSION_MODES, CODEX_SANDBOXES]), [
    'PLAIN_HARNESS holds yolo, which the runtime no longer lists: take it off',
  ]);
  assert.ok(TEAM.includes('ada') && TEAM.includes('seldon'), `the team read is ${TEAM.join(', ')}`);
  assert.ok(!TEAM.some((n) => n.endsWith('.schema')), 'a schema beside the agents is no agent');
});

test('the harness words, the workflow words and the team names are held to their baselines, each entry naming its card or move', () => {
  assert.deepEqual(breaches(repository(), TEAM), []);
});

test('REFUSED: a new file in each layer that says a word of another', () => {
  const texts = repository();
  const planted = (rule: 'harness' | 'workflow' | 'team', file: string, text: string, team = TEAM): string[] =>
    breaches({ ...texts, [rule]: new Map([...texts[rule], [file, text]]) }, team);
  const harness = HARNESS_RULE.fix;
  assert.deepEqual(planted('harness', 'packages/agent-orchestrator/src/x/x.ts', 'export const h = "codex";\n'), [
    `packages/agent-orchestrator/src/x/x.ts holds 1 harness words: ${harness}; never add them here`,
  ]);
  assert.deepEqual(planted('harness', 'apps/api/src/x/x.ts', "export const mode = 'bypassPermissions';\n"), [
    `apps/api/src/x/x.ts holds 1 harness words: ${harness}; never add them here`,
  ]);
  assert.deepEqual(planted('harness', 'apps/web/src/lib/x.ts', '/** Asks Anthropic. */\nexport const x = 1;\n'), [
    `apps/web/src/lib/x.ts holds 1 harness words: ${harness}; never add them here`,
  ]);
  assert.deepEqual(planted('workflow', 'packages/agent-runtime/src/x.ts', '/** A workflow, under nemia. */\nexport const x = 1;\n'), [
    `packages/agent-runtime/src/x.ts holds 2 workflow words: ${WORKFLOW_RULE.fix}; never add them here`,
  ]);
  assert.deepEqual(planted('team', 'packages/agent-runtime/src/x.ts', "export const reviewer = 'seldon';\n"), [
    `packages/agent-runtime/src/x.ts holds 1 team names: ${TEAM_RULE.fix}; never add them here`,
  ]);
});

test('REFUSED: a new agent of the team, with no edit to the test', () => {
  const root = scratch('words-team-');
  const agents = path.join(root, 'workflows', 'agents');
  fs.mkdirSync(agents, { recursive: true });
  for (const name of [...TEAM, 'zed']) fs.writeFileSync(path.join(agents, `${name}.md`), `---\nname: ${name}\n---\n`);
  fs.writeFileSync(path.join(agents, 'zed.schema.json'), '{}');
  const team = teamOf(agents);
  assert.deepEqual(team, [...TEAM, 'zed'].sort());
  const texts = repository();
  const said = new Map([...texts.team, ['packages/agent-orchestrator/src/x/x.ts', '/** Hands the work to Zed. */\nexport const x = 1;\n']]);
  assert.deepEqual(breaches({ ...texts, team: said }, team), [
    `packages/agent-orchestrator/src/x/x.ts holds 1 team names: ${TEAM_RULE.fix}; never add them here`,
  ]);
});

test('REFUSED: a count above or below the baseline, an entry gone or clean, one with no card, an unknown card, a move with nowhere to go', () => {
  const rule: Rule = { what: 'harness words', dirs: [], fix: 'say it here' };
  const exists = (file: string): boolean => file !== 'src/gone.ts';
  const breaks = (counts: Record<string, number>, entry: Entry): string[] => ratchetBreaks(rule, counts, { 'src/a.ts': entry }, exists);
  const held: Entry = { count: 2, card: 'u42s' };
  assert.deepEqual(breaks({ 'src/a.ts': 2 }, held), [], 'the measure the baseline holds is let through');
  assert.deepEqual(breaks({ 'src/a.ts': 2 }, { count: 2, move: 'a move', to: 'a place' }), [], 'a move with where it goes');
  assert.deepEqual(breaks({ 'src/a.ts': 3 }, held), [
    'src/a.ts holds 3 harness words, more than the 2 the baseline allows: never add them here',
  ]);
  assert.deepEqual(breaks({ 'src/a.ts': 1 }, held), ["src/a.ts holds 1 harness words, fewer than the baseline's 2: lower its count to 1"]);
  assert.deepEqual(breaks({}, held), ['src/a.ts holds no harness words left: take its entry off the baseline']);
  assert.deepEqual(ratchetBreaks(rule, {}, { 'src/gone.ts': held }, exists), [
    'src/gone.ts holds harness words in the baseline but is not on disk: where it moved, rename its entry; else take it off',
  ]);
  const unnamed = [
    "src/a.ts's entry for harness words names no card and no move with where it goes: name the card that removes them, else the move and its `to`",
  ];
  assert.deepEqual(breaks({ 'src/a.ts': 2 }, { count: 2, move: ' ', to: ' ' }), unnamed);
  assert.deepEqual(breaks({ 'src/a.ts': 2 }, { count: 2, move: 'a move', to: '' }), unnamed);
  assert.deepEqual(breaks({ 'src/a.ts': 2 }, { count: 2, card: 'zzzz' }), [
    "src/a.ts's entry for harness words names zzzz, a card CARDS does not know: name a filed card, or the move and where it goes",
  ]);
});
