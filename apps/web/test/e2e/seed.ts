/**
 * The store `npm run e2e` serves: four fake runs, written the way `wf` and the engine write theirs.
 *
 * FAKE has five steps in two lanes, frozen on the record as `wf start` freezes them, with the folder beside
 * it. `implement` signed off blocked, with its session's conversation on disk for the engine to read (SESSION),
 * `review` was filed and the engine has no record of its task
 * (`unknown`), and `respond` is not filed. Beside them `tokens` signed off with no `check:` (`unverified`),
 * and `theme`, which waits on it, signed off and its check refused with exit 1: the engine's record of the
 * check's attempt, and its output and stderr as the check harness leaves them. So `assess` has the run
 * failed — finished, not in flight, and off the Factory's floor until finished runs are shown. Nothing
 * runs. The pages must render a run as the api reads it, whatever the engine says of its tasks.
 *
 * FAKE's repository is a real one, beside the store (`seedRepo`): `theme`'s branch, the run's result, is committed on it,
 * so its page has something to decide. The other two runs name a repository that is not on the machine, which reads as a
 * branch git could not read.
 *
 * Beside the store, the sessions the fake `claude` lists (REGISTRY): HELD's, which the harness marked blocked, and NEIGHBOUR's `draft`, at
 * work, registered as Claude Code registers a session, with an inbox run.ts listens on (SAYING).
 *
 * Beside the store, a checkout for the api to serve on the Capabilities page (`HKB_REPO`): CHECKOUT.
 * And the workflows the Workflows page lists, in the checkout's `workflows/` and in the store's: WORKFLOWS.
 *
 * Written by hand rather than through agent-workflows: the web app imports no package, and a record
 * format that moves under the pages should fail here, where a person would see it.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export const FAKE = {
  id: 'give-the-board-a-look-e2e0',
  title: 'Give the board a look',
  /** The folder in the store it was started from, which names its workflow on the Runs page and the run's page. */
  workflow: 'workflow',
  steps: ['implement', 'review', 'respond', 'tokens', 'theme'],
  blocked: 'implement',
  /** Signed off with no `check:`: done on its own word. */
  unverified: 'tokens',
  /** Signed off, and its check refused. */
  refused: 'theme',
  /** The command `theme`'s check ran, from the workflow the run froze. */
  check: 'npm run e2e',
  /** A line near the end of that check's output. */
  said: 'not ok 7 - the Factory hides a finished run',
  /** Who a person has to act for: the step that signed off blocked, and the one whose check refused. */
  waitingOnYou: ['implement', 'theme'],
  /** The steps that wait on no other, which the run's card leads into on the Factory. */
  first: ['implement', 'tokens'],
  /** `tokens`' lane, which `theme` worked in too: the run's result branch, committed in its repository. */
  branch: 'wf/give-the-board-a-look-e2e0/tokens',
  /** What the Factory's card says that branch touched, once the card is opened: `apps/web` and the root. */
  touched: 'touched 2 packages · +435 −1',
  /** The files on it the next agent reads, and those that could make its check pass. */
  agentFacing: ['CLAUDE.md'],
  checkAffecting: ['apps/web/test/theme.test.ts', 'package.json'],
  lesson: 'lesson · CLAUDE.md +2 −0',
  /** A check-affecting file whose diff is longer than the board shows of one. */
  capped: 'apps/web/test/theme.test.ts',
  /** What `tokens`' session consumed, in `wf decide`'s words. */
  used: '14 turns · 31 tool calls · 112k in · 6.35k out',
  /** What `tokens` named in its closeout: an image and a text file in its files directory, which the api serves, and a path on its branch. */
  artifacts: { image: 'palette.png', text: 'tokens.txt', path: 'TOKENS.md' },
  /** One per `after` between its steps: implement → review, review → respond, implement → respond, tokens → theme. */
  edges: 4,
} as const;

/**
 * FAKE's `implement`, as its session said it: a Claude Code session's transcript, written where Claude Code keeps one — under
 * `claude/projects` in the store, which the e2e gives the api as CLAUDE_CONFIG_DIR — and read by the engine by the session id
 * the task's end records. The prompt; a thought with its text; words; seven calls with nothing said between them — three
 * commands, one of which failed, a search, and three files read — with a thought kept without its text among them; words in
 * markdown; a lone edit; a system line; and the closeout, which is implement's.
 */
export const SESSION = {
  step: 'implement',
  sessionId: '5b0f7a52-2c1e-4d8b-9a3f-6e1d2c7b4a90',
  prompt: 'Implement what was asked.\n\n## What was asked for\n\nGive the board a look.',
  thought: 'The Factory draws every run; a finished one should step off the floor.',
  /** The seven calls between two things said, as one line. */
  folded: 'Ran 3 commands, searched code, read 3 files',
  calls: 7,
  /** An item of the list in the words that follow the calls, as their markdown draws it. */
  listed: 'a finished run steps off the floor',
  system: 'Background session idle',
  closeout: {
    outcome: 'blocked',
    summary: 'The Factory renders every run in flight; the run page is unchanged.',
    needs: 'Should a finished run keep its card on the Factory?',
    artifacts: [],
  },
} as const;

/** SESSION's transcript, a line of JSON each as Claude Code 2.1.270 writes them, dated by `ago` (minutes before now). */
function conversation(session: typeof SESSION, ago: (minutes: number) => string): object[] {
  const line = { sessionId: session.sessionId, isSidechain: false, userType: 'external', cwd: '/code/hkb-v2', version: '2.1.270', gitBranch: `wf/${FAKE.id}/implement` };
  let n = 0;
  let minutes = 41;
  const next = (type: 'user' | 'assistant', content: unknown) =>
    ({ ...line, type, uuid: `${type}-${++n}`, timestamp: ago((minutes -= 0.5)), message: { role: type, content } });
  const call = (id: string, name: string, input: object, result: string, isError = false) => [
    next('assistant', [{ type: 'tool_use', id, name, input }]),
    next('user', [{ type: 'tool_result', tool_use_id: id, content: result, ...(isError ? { is_error: true } : {}) }]),
  ];
  return [
    { type: 'custom-title', customTitle: `ae/${FAKE.id}-implement/1`, sessionId: session.sessionId },
    next('user', session.prompt),
    next('assistant', [{ type: 'thinking', thinking: session.thought, signature: 'e2e' }]),
    next('assistant', [{ type: 'text', text: 'I will start where the Factory decides which runs are on its floor.' }]),
    ...call('toolu_e2e_status', 'Bash', { command: 'git status --short' }, ''),
    next('assistant', [{ type: 'thinking', thinking: '', signature: 'e2e' }]),
    ...call('toolu_e2e_test', 'Bash', { command: 'npm test --workspace web' }, '# tests 33\n# pass 33\n# fail 0'),
    ...call('toolu_e2e_grep', 'Grep', { pattern: 'moving', path: 'apps/web/src' }, 'apps/web/src/lib/factory.ts:42:  return run.moving;'),
    ...call('toolu_e2e_tsc', 'Bash', { command: 'npx tsc --noEmit' }, "src/lib/factory.ts(48,3): error TS2322: Type 'string' is not assignable to type 'boolean'.", true),
    ...call('toolu_e2e_read1', 'Read', { file_path: '/code/hkb-v2/apps/web/src/lib/factory.ts' }, "1\timport type { RunSummary } from './api';"),
    ...call('toolu_e2e_read2', 'Read', { file_path: '/code/hkb-v2/apps/web/src/components/FactoryCanvas.tsx' }, "1\timport { useMemo } from 'react';"),
    ...call('toolu_e2e_read3', 'Read', { file_path: '/code/hkb-v2/apps/web/src/routes/index.tsx' }, "1\timport { createFileRoute } from '@tanstack/react-router';"),
    next('assistant', [{
      type: 'text',
      text: `Every run in flight keeps its card:\n\n- ${session.listed}\n- \`Show finished\` brings it back\n\n\`\`\`ts\nexport const onTheFloor = (run: RunSummary) => run.moving;\n\`\`\``,
    }]),
    ...call('toolu_e2e_edit', 'Edit', { file_path: '/code/hkb-v2/apps/web/src/lib/factory.ts', old_string: 'run.status', new_string: 'run.moving' }, 'The file has been updated.'),
    { ...line, type: 'system', uuid: 'system-1', subtype: 'informational', content: session.system, level: 'info', timestamp: ago((minutes -= 0.5)) },
    next('assistant', [{ type: 'tool_use', id: 'toolu_e2e_closeout', name: 'StructuredOutput', input: session.closeout }]),
    next('user', [{ type: 'tool_result', tool_use_id: 'toolu_e2e_closeout', content: [{ type: 'text', text: 'Structured output provided successfully' }] }]),
  ];
}

/**
 * A second run, started after FAKE: `plan` signed off and `draft`, which waits on it, has its session running, so work moves
 * along the edge between them. `sketch` failed and `ship`, which waits on it, will never be filed, so `assess` has the run
 * failed — while draft's session still runs. It still moves, so it is in flight: on the floor, with HELD's, until finished
 * runs are shown. Laid out oldest first, its card takes the cell beside FAKE's — the cell FAKE's graph unfolds over, which
 * the Factory must move this card out of.
 */
export const NEIGHBOUR = {
  id: 'a-run-beside-it-e2e1',
  title: 'A run beside it',
  steps: ['plan', 'draft', 'sketch', 'ship'],
  /** The one edge work moves along: into draft, whose session is at work. */
  running: 'plan->draft',
  /** Into ship, which will never be filed behind the failed sketch: to come, and still. */
  still: 'sketch->ship',
} as const;

/**
 * NEIGHBOUR's `draft`, the session in flight the `say` page speaks to: `claude agents` lists it at work, with the pid Claude Code registers it
 * under — `claude/sessions/<pid>.json` in the store, the e2e's CLAUDE_CONFIG_DIR, whose `messagingSocketPath` is INBOX — and its conversation so
 * far is on disk (DRAFT_TRANSCRIPT): the prompt, words, and a call still waiting on its result. run.ts listens on INBOX, standing in for the
 * session's inbox, and writes into that file what a working session writes when it reads the words between calls (`arrivalLine`).
 */
export const SAYING = {
  run: NEIGHBOUR.id,
  step: 'draft',
  sessionId: '3f6a2c1d-8e4b-4c7a-9d2f-5b1e0a7c6d84',
  pid: 424_242,
  prompt: 'Draft it.',
  /** What the session said so far, before its call. */
  line: 'Drafting the outline, one section at a time.',
  /** What the `say` page tells it. */
  words: 'Widen the draft to the api section too, and keep the outline short.',
} as const;

/** Where in the store the stand-in for draft's inbox listens: a Unix socket run.ts opens before the api starts. */
export const INBOX = 'inbox.sock';

/** Where draft's conversation is kept, from the store: the file its session writes, and run.ts adds to when the session reads words. */
export const DRAFT_TRANSCRIPT = path.join('claude', 'projects', '-code-hkb-v2', `${SAYING.sessionId}.jsonl`);

/**
 * The line a working Claude Code session writes into its transcript when it reads words another process posted to its inbox, between calls: a
 * `queued_command` attachment from a peer, as 2.1.270 wrote one (agent-engine's transcript test), for the words `prompt`, at `at`.
 */
export function arrivalLine(prompt: string, at: string): string {
  const uuid = `draft-arrival-${Date.parse(at)}`;
  return `${JSON.stringify({
    parentUuid: 'draft-assistant-2', isSidechain: false, userType: 'external', cwd: '/code/hkb-v2', sessionId: SAYING.sessionId, version: '2.1.270', gitBranch: 'main',
    type: 'attachment', uuid, timestamp: at,
    attachment: { type: 'queued_command', prompt, source_uuid: uuid, commandMode: 'prompt', origin: { kind: 'peer', from: 'unknown' }, timestamp: at, isMeta: true },
  })}\n`;
}

/**
 * A third run, started last: `review` loops back to `implement`, the loop is on round 3 of the 3 a loop runs when it
 * does not say, and review asked for another. So review reads `rounds exhausted` and waits on you, nothing of the run
 * moves, and `assess` has it failed — finished, off the Factory's floor until finished runs are shown. Newest, so its
 * card takes the cell after NEIGHBOUR's and moves neither of the others.
 */
export const LOOPING = {
  id: 'go-round-again-e2e2',
  title: 'Go round again',
  steps: ['implement', 'review'],
  /** The looping step, out of rounds. */
  exhausted: 'review',
  /** The step its loop runs again: where the edge back from `exhausted` arrives. */
  target: 'implement',
  /** What the edge back is labelled, from review's note: the round the loop is on. */
  round: 'round 3 of 3',
  /** What `wf ls` prints beside each step: the round it is on, and for the loop out of rounds, the command that takes it once more. */
  notes: {
    implement: 'round 3 of 3',
    review: 'round 3 of 3, and it asked again — once more: wf round go-round-again-e2e2 review',
  },
  /** What each step said in the rounds before the one it is on: round 1, then round 2. */
  earlier: [
    { implement: 'Implemented it.', review: 'Three findings.' },
    { implement: 'Answered the first review.', review: 'Two findings are still open.' },
  ],
  /** What implement answered in round 2, and how the Output tab says it: `finding → answer (why)`. */
  replies: [{ finding: 'apps/web/src/lib/status.ts — an unknown word reads as working', answer: 'fixed', why: 'It reads as unknown now.' }],
  replied: 'apps/web/src/lib/status.ts — an unknown word reads as working → fixed (It reads as unknown now.)',
} as const;

/**
 * A fourth run, started last: `implement`'s session is one the harness marked blocked, and it gave no closeout — Q1's round-2
 * implement on 2026-09-14, stopped by the login refresh race — and `review` waits on it. The engine reads it `needs-human`, so the
 * run is running and moves, and in the package's words nobody is waiting on you: the step asked nothing. On the floor by default,
 * in the cell after NEIGHBOUR's. The board names the harness, and what the session said last (`line`), and continues the session as
 * `wf retry` does: the `held` page presses Continue, and takes its ask back.
 */
export const HELD = {
  id: 'blocked-by-the-harness-e2e3',
  title: 'Blocked by the harness',
  steps: ['implement', 'review'],
  blocked: 'implement',
  sessionId: '9c3e1d2a-7b4f-4e8a-b6d5-1f0a2c3b4d5e',
  /** What the harness wrote into the session last, word for word as Claude Code 2.1.270 wrote it that day. */
  line: 'Could not refresh your login because another Claude Code process is refreshing it (or exited mid-refresh) · Try again in a minute; if it keeps happening, close other Claude Code windows or sign in again with /login',
} as const;

/**
 * Runs that wait on runs (`wf start --after`), on the checkout's repository — a real one (`seedDiamond`), and the one a start from the
 * Workflows page runs in, so the start form offers them. The diamond: `top` shipped first; `shipped` and `running` started from a main
 * that had it, and `shipped` was merged while `running`'s session still works; `bottom` waits on both, so on `running` alone. Beside it,
 * `cancelled` was called off before anything of it was filed, and `orphan` waits on it: for ever, so on you.
 *
 * Newer than every other run, so the Factory's oldest-first floor still starts with FAKE's card and NEIGHBOUR's beside it.
 */
export const DIAMOND = {
  top: { id: 'lay-the-diamond-top-e2e4', title: 'Lay the diamond top', after: [] },
  shipped: { id: 'one-side-shipped-e2e5', title: 'One side, shipped', after: ['lay-the-diamond-top-e2e4'] },
  running: { id: 'the-other-side-runs-e2e6', title: 'The other side, still running', after: ['lay-the-diamond-top-e2e4'] },
  bottom: { id: 'the-diamond-bottom-e2e7', title: 'The diamond bottom', after: ['one-side-shipped-e2e5', 'the-other-side-runs-e2e6'] },
  cancelled: { id: 'called-off-e2e8', title: 'Called off', after: [] },
  orphan: { id: 'waits-on-a-called-off-run-e2e9', title: 'Waits on a called-off run', after: ['called-off-e2e8'] },
  /** What `wf ls` says of each waiting run's root, and the card with it. */
  words: {
    bottom: 'waiting on the-other-side-runs-e2e6',
    orphan: 'waiting on called-off-e2e8 (cancelled)',
  },
} as const;

/** The diamond's runs, oldest first. */
export const DIAMOND_RUNS = [DIAMOND.top, DIAMOND.shipped, DIAMOND.running, DIAMOND.bottom, DIAMOND.cancelled, DIAMOND.orphan] as const;

/**
 * Write DIAMOND into the checkout at `repo` — made a git repository here, its files the base on `main` — and the store at `root`. `top`'s
 * and `shipped`'s result branches are merged into main with `--no-ff`, one after the other, and their steps signed off: each one's own
 * `wf decide` says shipped. `running`'s branch has its work and is not merged, and its session has not ended. `cancelled` is marked as
 * `wf cancel` marks a run, in a file beside its record. Times are minutes before `now`.
 */
export function seedDiamond(repo: string, root: string, now = Date.now()): void {
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const git = (...args: string[]): string =>
    execFileSync('git', ['-c', 'user.name=e2e', '-c', 'user.email=e2e@example.com', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], {
      cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  const base = git('rev-parse', 'HEAD').trim();
  const branchOf = (id: string) => `wf/${id}/implement`;
  /** A result branch off main with the run's work on it, merged back when it shipped. */
  const work = (id: string, merge: boolean) => {
    git('checkout', '-q', '-b', branchOf(id));
    write(path.join(repo, 'src', `${id}.ts`), `export const done = '${id}';\n`);
    git('add', '-A');
    git('commit', '-q', '-m', `The work of ${id}`);
    git('checkout', '-q', 'main');
    if (merge) git('merge', '-q', '--no-ff', '-m', `Merge ${id}`, branchOf(id));
  };

  const workflowDir = path.join(root, 'workflow-diamond');
  write(path.join(workflowDir, 'implement.md'), '---\nharness: claude\n---\nImplement it.\n');
  const workflow = [{ name: 'implement', after: [], body: 'Implement it.', harness: 'claude' }];
  const record = (run: (typeof DIAMOND_RUNS)[number], minutes: number, implement: object) =>
    write(path.join(root, 'runs', `${run.id}.json`), JSON.stringify({
      id: run.id, repo, workspace: repo, baseRef: base, branch: 'main', isolate: true,
      brief: `${run.title}\n\nA run seeded by npm run e2e, in the diamond: ${run.after.length ? `after ${run.after.join(' and ')}` : 'waiting on no run'}.`,
      workflowDir, workflow, ...(run.after.length ? { after: run.after } : {}),
      createdAt: ago(minutes),
      steps: { implement },
    }, null, 2));
  const task = (run: (typeof DIAMOND_RUNS)[number]) => `${run.id}-implement`;
  const filed = (run: (typeof DIAMOND_RUNS)[number], minutes: number) => ({ kind: 'filed', at: ago(minutes), brief: 'Implement it.', cwd: repo, maxAttempts: 1 });
  const signedOff = (run: (typeof DIAMOND_RUNS)[number], began: number, ended: number) =>
    write(path.join(root, 'engine', 'tasks', `${task(run)}.jsonl`), lines([
      filed(run, began),
      { kind: 'starting', at: ago(began), attempt: 1 },
      { kind: 'spawned', at: ago(began), attempt: 1 },
      { kind: 'ended', at: ago(ended), attempt: 1, sessionId: `ae/${task(run)}/1`, observed: 'done', reason: 'harness', closeout: { outcome: 'done', summary: `Did ${run.title}.`, needs: null, artifacts: [] } },
      { kind: 'settled', at: ago(ended), outcome: 'succeeded' },
    ]));

  const { top, shipped, running, bottom, cancelled, orphan } = DIAMOND;
  work(top.id, true);
  signedOff(top, 2.6, 2.5);
  record(top, 2.6, { taskId: task(top), workspace: repo, branch: branchOf(top.id) });
  work(shipped.id, true);
  signedOff(shipped, 2.4, 2.3);
  record(shipped, 2.4, { taskId: task(shipped), workspace: repo, branch: branchOf(shipped.id) });
  // Its session started and has not ended, as NEIGHBOUR's draft: the engine reads it running.
  work(running.id, false);
  write(path.join(root, 'engine', 'tasks', `${task(running)}.jsonl`), lines([
    filed(running, 2.2),
    { kind: 'starting', at: ago(2.1), attempt: 1 },
    { kind: 'spawned', at: ago(2.1), attempt: 1 },
  ]));
  record(running, 2.2, { taskId: task(running), workspace: repo, branch: branchOf(running.id) });
  record(bottom, 2.0, { taskId: null });
  record(cancelled, 1.8, { taskId: null });
  write(path.join(root, 'runs', `${cancelled.id}.cancelled`), ago(1.7));
  record(orphan, 1.6, { taskId: null });
}

/** Where in the store the sessions `claude agents --all --json` lists are kept, for the fake `claude` run.ts puts on the api's PATH. */
export const REGISTRY = 'claude-agents.json';

/** HELD's `implement`, as its session said it before the harness stopped it: the prompt, words, a call and its result, and the harness's line. */
function heldConversation(ago: (minutes: number) => string): object[] {
  const line = { sessionId: HELD.sessionId, isSidechain: false, userType: 'external', cwd: '/code/hkb-v2', version: '2.1.270', gitBranch: `wf/${HELD.id}/implement` };
  const said = (type: 'user' | 'assistant', uuid: string, minutes: number, content: unknown, more: object = {}) =>
    ({ ...line, type, uuid, timestamp: ago(minutes), message: { role: type, content }, ...more });
  return [
    { type: 'custom-title', customTitle: `ae/${HELD.id}-implement/1`, sessionId: HELD.sessionId },
    said('user', 'held-user-1', 2.8, 'Implement what was asked.\n\n## What was asked for\n\nBlocked by the harness.'),
    said('assistant', 'held-assistant-1', 2.7, [{ type: 'text', text: 'Reading the tests first.' }]),
    said('assistant', 'held-assistant-2', 2.6, [{ type: 'tool_use', id: 'toolu_held_test', name: 'Bash', input: { command: 'npm test' } }]),
    said('user', 'held-user-2', 2.5, [{ type: 'tool_result', tool_use_id: 'toolu_held_test', content: '# tests 33\n# pass 33\n# fail 0' }]),
    // The harness's own line, as an assistant message it made up: no model wrote it.
    said('assistant', 'held-assistant-3', 2.4, [{ type: 'text', text: HELD.line }], { isApiErrorMessage: true, error: 'server_error' }),
  ];
}

const STEPS = [
  {
    file: 'implement.md',
    text: '---\nharness: claude\ncheck: npm test\n---\nImplement what was asked.\n',
    frozen: { name: 'implement', after: [], body: 'Implement what was asked.', harness: 'claude', check: 'npm test' },
  },
  {
    file: 'review.md',
    text: '---\nharness: codex\nafter: implement\npermissionMode: read-only\n---\nReview the change.\n',
    frozen: { name: 'review', after: ['implement'], body: 'Review the change.', harness: 'codex', permissionMode: 'read-only' },
  },
  {
    file: 'respond.md',
    text: '---\nharness: claude\nafter: review\nresume: implement\ncheck: npm test\n---\nAnswer the review.\n',
    frozen: { name: 'respond', after: ['review', 'implement'], resume: 'implement', body: 'Answer the review.', harness: 'claude', check: 'npm test' },
  },
  {
    file: 'tokens.md',
    text: '---\nharness: codex\n---\nPick the colour tokens.\n',
    frozen: { name: 'tokens', after: [], body: 'Pick the colour tokens.', harness: 'codex' },
  },
  {
    file: 'theme.md',
    text: `---\nharness: claude\nafter: tokens\ncheck: ${FAKE.check}\n---\nApply them to every page.\n`,
    frozen: { name: 'theme', after: ['tokens'], body: 'Apply them to every page.', harness: 'claude', check: FAKE.check },
  },
];

/**
 * The checkout the api serves on the Capabilities page: a skill with frontmatter and one without, an agent, and two MCP
 * servers its settings enable — one that lists its tools when asked, one whose command does not exist — and the rules
 * its settings deny, one of them a tool of the first server.
 */
export const CHECKOUT = {
  skill: { dir: 'review', name: 'code-review', description: 'Review a diff for bugs before a person reads it.' },
  /** A SKILL.md with no frontmatter, listed by its directory. */
  bareSkill: 'scratch',
  agent: { file: 'tester.md', name: 'tester', description: 'Writes the tests a change is missing.' },
  /** apps/api's fixture server: what it lists, the first line of `echo`'s description, and the line after it. */
  server: { name: 'fixture', tools: ['echo', 'wipe'], said: 'Say it back.', secondLine: 'A second line', denied: 'mcp__fixture__wipe' },
  missing: { name: 'missing', command: 'hkb-e2e-no-such-mcp-server' },
  denied: ['Bash(git push:*)', 'mcp__fixture__wipe'],
} as const;

/** Write CHECKOUT into `repo`. `mcpServer` is the file of the stdio MCP server it declares, which node runs. */
export function seedCheckout(repo: string, mcpServer: string): void {
  const { skill, bareSkill, agent, server, missing, denied } = CHECKOUT;
  write(path.join(repo, '.claude', 'skills', skill.dir, 'SKILL.md'), `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n# Review\n`);
  write(path.join(repo, '.claude', 'skills', bareSkill, 'SKILL.md'), '# Scratch\n\nNo frontmatter, so it is listed by its directory.\n');
  write(path.join(repo, '.claude', 'agents', agent.file), `---\nname: ${agent.name}\ndescription: ${agent.description}\n---\nYou write tests.\n`);
  write(path.join(repo, '.mcp.json'), JSON.stringify({
    mcpServers: {
      [server.name]: { command: process.execPath, args: [mcpServer] },
      [missing.name]: { command: missing.command, args: ['--stdio'] },
    },
  }, null, 2));
  write(path.join(repo, '.claude', 'settings.json'), JSON.stringify({
    enabledMcpjsonServers: [server.name, missing.name],
    permissions: { deny: denied },
  }, null, 2));
}

/**
 * The workflows the Workflows page lists. In the checkout's `workflows/`, `dev`: implement ⇄ review, described by its README,
 * each step with what the page draws on its node; and `broken`, whose reviewer misspells `after`, which the loader refuses.
 * In the store's `workflows/`, yours: `mine`, one step and no README.
 */
export const WORKFLOWS = {
  good: {
    name: 'dev',
    description: 'Implement what was asked, then a second engineer reviews it, three rounds at most.',
    steps: ['implement', 'review'],
    runsOn: 'claude · opus',
    check: 'npm test && npm run typecheck',
    tools: 'Read, Grep, Glob, Bash',
    loop: 'implement · 3 rounds',
  },
  broken: { name: 'broken', error: 'review: `afer` is not a key a step has.' },
  yours: { name: 'mine', steps: ['plan'] },
} as const;

/** Write WORKFLOWS: the checkout's into `repo`, and yours into the store at `root`. */
export function seedWorkflows(repo: string, root: string): void {
  const { good, broken, yours } = WORKFLOWS;
  const dev = path.join(repo, 'workflows', good.name);
  write(path.join(dev, 'README.md'), `# ${good.name}\n\n${good.description}\n\nA second paragraph, which the page does not show.\n`);
  write(path.join(dev, 'implement.md'), `---\nharness: claude\nmodel: opus\ncheck: ${good.check}\n---\nImplement what was asked.\n`);
  write(path.join(dev, 'review.md'), `---\nharness: claude\nmodel: opus\nafter: implement\ntools: ${good.tools}\npermissionMode: dontAsk\noutput: review.schema.json\nloop: implement\nrounds: 3\n---\nReview the change.\n`);
  write(path.join(dev, 'review.schema.json'), JSON.stringify({ type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false }, null, 2));
  const bad = path.join(repo, 'workflows', broken.name);
  write(path.join(bad, 'README.md'), `# ${broken.name}\n\nA reviewer whose after is misspelt.\n`);
  write(path.join(bad, 'implement.md'), 'Implement what was asked.\n');
  write(path.join(bad, 'review.md'), '---\nafer: implement\n---\nReview the change.\n');
  write(path.join(root, 'workflows', yours.name, 'plan.md'), '---\nharness: codex\n---\nWrite PLAN.md.\n');
}

const write = (file: string, text: string | Buffer): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** A PNG, `width` by `height`, each pixel the colour `colour` gives it: encoded here, since the e2e installs nothing to draw one. */
export function png(width: number, height: number, colour: (x: number, y: number) => readonly [number, number, number]): Buffer {
  const stride = width * 3 + 1;
  const rows = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    // Each row starts with its filter, none.
    for (let x = 0; x < width; x++) rows.set(colour(x, y), y * stride + 1 + x * 3);
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  // 8 bits a channel, RGB, and the one compression, filter and interlace a PNG has.
  header.set([8, 2, 0, 0, 0], 8);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

/** CRC-32, as a PNG's chunks carry it. */
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** `tokens`' palette as the step photographed it: a swatch a token, in its colour, on a light ground. */
const PALETTE: ReadonlyArray<readonly [number, number, number]> = [
  [14, 165, 233], [59, 130, 246], [16, 185, 129], [245, 158, 11], [249, 115, 22],
  [239, 68, 68], [115, 115, 115], [139, 92, 246], [20, 184, 166], [244, 63, 94],
];
const palette = (): Buffer => png(480, 96, (x, y) => (y < 8 || y >= 88 || x % 48 < 4 ? [250, 250, 250] : PALETTE[Math.floor(x / 48)]!));

/**
 * FAKE's repository, at `repo`: a base on `main`, and `branch` off it with the work committed — a source file and a test
 * of 420 lines in the `apps/web` workspace, two lines in CLAUDE.md, a script changed in package.json. The base's sha.
 */
function seedRepo(repo: string, branch: string): string {
  fs.mkdirSync(repo, { recursive: true });
  const git = (...args: string[]): string =>
    execFileSync('git', ['-c', 'user.name=e2e', '-c', 'user.email=e2e@example.com', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], {
      cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  const pkg = (test: string) => `${JSON.stringify({ name: 'hkb-v2', private: true, workspaces: ['packages/*', 'apps/*'], scripts: { test } })}\n`;
  git('init', '-q', '-b', 'main');
  write(path.join(repo, 'package.json'), pkg('turbo run test'));
  write(path.join(repo, 'CLAUDE.md'), '# hkb-v2 — contributor guide\n');
  write(path.join(repo, 'apps', 'web', 'src', 'main.tsx'), "export const app = 'board';\n");
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  const base = git('rev-parse', 'HEAD').trim();

  git('checkout', '-q', '-b', branch);
  const tokens = ['sky', 'blue', 'emerald', 'amber', 'orange', 'red', 'neutral', 'violet', 'teal', 'rose'];
  write(path.join(repo, 'apps', 'web', 'src', 'theme.ts'), `export const tokens = {\n${tokens.map((t) => `  ${t}: 'var(--color-${t}-500)',`).join('\n')}\n};\n`);
  const cases = Array.from({ length: 416 }, (_, i) => `test('token ${i + 1} is a colour', () => assert.ok(Object.values(tokens)[${i % tokens.length}]));`);
  write(path.join(repo, 'apps', 'web', 'test', 'theme.test.ts'), `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { tokens } from '../src/theme.ts';\n\n${cases.join('\n')}\n`);
  write(path.join(repo, 'CLAUDE.md'), '# hkb-v2 — contributor guide\n\n- A page is judged in both themes, or it is judged in neither.\n');
  write(path.join(repo, 'package.json'), pkg('turbo run test --concurrency=1'));
  git('add', '-A');
  git('commit', '-q', '-m', 'Apply the colour tokens to every page');
  git('checkout', '-q', 'main');
  return base;
}

/** Events as the engine journals them: a line of JSON each. */
/** SAYING's session so far, as Claude Code 2.1.270 writes it: the prompt, words, and a Read with no result yet. */
function draftConversation(ago: (minutes: number) => string): object[] {
  const line = { sessionId: SAYING.sessionId, isSidechain: false, userType: 'external', cwd: '/code/hkb-v2', version: '2.1.270', gitBranch: 'main' };
  const said = (type: 'user' | 'assistant', uuid: string, minutes: number, content: unknown) =>
    ({ ...line, type, uuid, timestamp: ago(minutes), message: { role: type, content } });
  return [
    { type: 'custom-title', customTitle: `ae/${SAYING.run}-${SAYING.step}/1`, sessionId: SAYING.sessionId },
    said('user', 'draft-user-1', 2.4, SAYING.prompt),
    said('assistant', 'draft-assistant-1', 2.3, [{ type: 'text', text: SAYING.line }]),
    said('assistant', 'draft-assistant-2', 2.2, [{ type: 'tool_use', id: 'toolu_draft_read', name: 'Read', input: { file_path: '/code/hkb-v2/README.md' } }]),
  ];
}

const lines = (events: object[]): string => events.map((event) => `${JSON.stringify(event)}\n`).join('');

/** Write the fake run into `root`, which becomes the api's WF_ROOT. Times are minutes before `now`. */
export function seed(root: string, now = Date.now()): void {
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const { id } = FAKE;
  const workflowDir = path.join(root, FAKE.workflow);
  for (const step of STEPS) write(path.join(workflowDir, step.file), step.text);

  const workspace = path.join(root, 'worktrees', id, 'implement');
  const branch = `wf/${id}/implement`;
  // tokens runs beside implement, so it has a worktree of its own; theme is its only follower, and works in it.
  const lane = path.join(root, 'worktrees', id, 'tokens');
  const laneBranch = FAKE.branch;
  const check = `${id}-theme-check`;
  // Named as the other runs' repository is, so the Factory's card reads the same.
  const repo = path.join(root, 'hkb-v2');
  const baseRef = seedRepo(repo, laneBranch);
  write(path.join(root, 'runs', `${id}.json`), JSON.stringify({
    id, repo, workspace: repo, baseRef, branch: 'main', isolate: true,
    brief: `${FAKE.title}\n\nA run seeded by npm run e2e: implement signed off blocked, the engine has no record of review's task, and respond is not filed; tokens signed off with no check, and theme's check refused.`,
    workflowDir,
    workflow: STEPS.map((step) => step.frozen),
    createdAt: ago(42),
    steps: {
      implement: { taskId: `${id}-implement`, workspace, branch },
      // review is implement's only follower, so it works in implement's workspace, on its branch.
      review: { taskId: `${id}-review`, workspace, branch },
      respond: { taskId: null },
      tokens: { taskId: `${id}-tokens`, workspace: lane, branch: laneBranch },
      theme: { taskId: `${id}-theme`, workspace: lane, branch: laneBranch, check: { taskId: check } },
    },
  }, null, 2));

  /**
   * A step's task as the engine journals one that ran once, from `began` to `ended` minutes ago, and signed off with `closeout`.
   * `nativeId` is the session's own id, which the engine records with the end for a harness that has one, and reads a transcript by; `usage` is what the engine read of the attempt, when it read one.
   */
  const signedOff = (task: string, harness: string, cwd: string, brief: string, began: number, ended: number, closeout: object, nativeId?: string, usage?: object): void =>
    write(path.join(root, 'engine', 'tasks', `${task}.jsonl`), lines([
      { kind: 'filed', at: ago(began), brief, cwd, maxAttempts: 1, harness },
      { kind: 'starting', at: ago(began - 1), attempt: 1 },
      { kind: 'spawned', at: ago(began - 1), attempt: 1 },
      { kind: 'ended', at: ago(ended), attempt: 1, sessionId: `ae/${task}/1`, ...(nativeId ? { nativeId } : {}), observed: 'done', reason: 'harness', closeout, ...(usage ? { usage } : {}) },
      { kind: 'settled', at: ago(ended), outcome: 'succeeded' },
    ]));

  // implement signed off blocked, and its session's conversation is on disk (SESSION). review's task has no journal at all,
  // which is what makes it `unknown`.
  signedOff(`${id}-implement`, 'claude', workspace, SESSION.prompt, 42, 12, SESSION.closeout, SESSION.sessionId);
  write(path.join(root, 'claude', 'projects', '-code-hkb-v2', `${SESSION.sessionId}.jsonl`), lines(conversation(SESSION, ago)));
  // tokens' files, where the run keeps a step's: in its files directory beside the run's record. Named by absolute path in its
  // closeout, as a step is told to name them, with a path on its branch beside them.
  const files = path.join(root, 'runs', id, 'artifacts', FAKE.unverified);
  write(path.join(files, FAKE.artifacts.image), palette());
  write(path.join(files, FAKE.artifacts.text), 'sky blue emerald amber orange red neutral violet teal rose\n');
  const tokensCloseout = {
    outcome: 'done', summary: 'Picked the colour tokens.', needs: null,
    artifacts: [path.join(files, FAKE.artifacts.image), path.join(files, FAKE.artifacts.text), FAKE.artifacts.path],
  };
  signedOff(`${id}-tokens`, 'codex', lane, 'Pick the colour tokens.', 40, 30, tokensCloseout, undefined, {
    turns: 14, toolCalls: 31, inputTokens: 112_000, outputTokens: 6_350,
  });
  signedOff(`${id}-theme`, 'claude', lane, 'Apply them to every page.', 30, 10, { outcome: 'done', summary: 'Applied them to every page.', needs: null, artifacts: [] });

  // theme's check, as the run files one on the check harness: its process exited 1, and the engine wrote the
  // code down with the end of the attempt.
  write(path.join(root, 'engine', 'tasks', `${check}.jsonl`), lines([
    { kind: 'filed', at: ago(10), brief: JSON.stringify({ check: FAKE.check, env: {} }), cwd: lane, maxAttempts: 1, harness: 'check' },
    { kind: 'starting', at: ago(10), attempt: 1 },
    { kind: 'spawned', at: ago(10), attempt: 1 },
    { kind: 'ended', at: ago(7), attempt: 1, sessionId: `ae/${check}/1`, observed: 'failed', reason: 'harness', exitCode: 1 },
    { kind: 'settled', at: ago(7), outcome: 'failed' },
  ]));
  // Its session as the check harness's worker leaves it: a run file, and the output with the exit code the run
  // printed last. Its stderr goes to a file of its own, beside the run records.
  const session = `ae/${check}/1`;
  const base = path.join(root, 'engine', 'runs', 'check', session.replace(/[^a-zA-Z0-9]+/g, '_'));
  write(`${base}.json`, JSON.stringify({ name: session, state: 'done', pid: 0, heartbeatAt: ago(7), logFile: `${base}.log`, exitCode: 1 }));
  write(`${base}.log`, `ok 6 - the Factory shows a run in flight\n${FAKE.said}\n# tests 7\n# fail 1\n\n[wf check] exit 1\n`);
  write(path.join(root, 'checks', `${check}.stderr`), 'npm error Lifecycle script `e2e` failed with error:\nnpm error code 1\n');

  const besideDir = path.join(root, 'workflow-beside');
  write(path.join(besideDir, 'plan.md'), '---\nharness: claude\n---\nPlan it.\n');
  write(path.join(besideDir, 'draft.md'), '---\nharness: claude\nafter: plan\n---\nDraft it.\n');
  write(path.join(besideDir, 'sketch.md'), '---\nharness: codex\n---\nSketch it.\n');
  write(path.join(besideDir, 'ship.md'), '---\nharness: claude\nafter: sketch\n---\nShip it.\n');
  write(path.join(root, 'runs', `${NEIGHBOUR.id}.json`), JSON.stringify({
    id: NEIGHBOUR.id, repo: '/code/hkb-v2', workspace: '/code/hkb-v2', baseRef: '19c9365', branch: 'main', isolate: true,
    brief: `${NEIGHBOUR.title}\n\nA second run seeded by npm run e2e: plan signed off and draft's session still runs, while sketch failed — the card beside the first.`,
    workflowDir: besideDir,
    workflow: [
      { name: 'plan', after: [], body: 'Plan it.', harness: 'claude' },
      { name: 'draft', after: ['plan'], body: 'Draft it.', harness: 'claude' },
      { name: 'sketch', after: [], body: 'Sketch it.', harness: 'codex' },
      { name: 'ship', after: ['sketch'], body: 'Ship it.', harness: 'claude' },
    ],
    createdAt: ago(5),
    steps: {
      plan: { taskId: `${NEIGHBOUR.id}-plan` }, draft: { taskId: `${NEIGHBOUR.id}-draft` },
      sketch: { taskId: `${NEIGHBOUR.id}-sketch` }, ship: { taskId: null },
    },
  }, null, 2));
  // plan signed off with no check; draft's session started after it and has not ended; sketch's failed.
  signedOff(`${NEIGHBOUR.id}-plan`, 'claude', '/code/hkb-v2', 'Plan it.', 5, 3, { outcome: 'done', summary: 'Planned it.', needs: null, artifacts: [] });
  write(path.join(root, 'engine', 'tasks', `${NEIGHBOUR.id}-draft.jsonl`), lines([
    { kind: 'filed', at: ago(3), brief: 'Draft it.', cwd: '/code/hkb-v2', maxAttempts: 1 },
    { kind: 'starting', at: ago(2.5), attempt: 1 },
    { kind: 'spawned', at: ago(2.5), attempt: 1 },
  ]));
  // draft's session at work (SAYING): registered as Claude Code registers one, its inbox the socket run.ts listens on, and its conversation so
  // far on disk. `claude agents` lists it, with its pid, below (REGISTRY).
  write(path.join(root, 'claude', 'sessions', `${SAYING.pid}.json`), JSON.stringify({
    pid: SAYING.pid, sessionId: SAYING.sessionId, name: `ae/${SAYING.run}-${SAYING.step}/1`, kind: 'bg', messagingSocketPath: path.join(root, INBOX),
  }));
  write(path.join(root, DRAFT_TRANSCRIPT), lines(draftConversation(ago)));
  write(path.join(root, 'engine', 'tasks', `${NEIGHBOUR.id}-sketch.jsonl`), lines([
    { kind: 'filed', at: ago(5), brief: 'Sketch it.', cwd: '/code/hkb-v2', maxAttempts: 1 },
    { kind: 'starting', at: ago(4), attempt: 1 },
    { kind: 'spawned', at: ago(4), attempt: 1 },
    { kind: 'ended', at: ago(2), attempt: 1, sessionId: `ae/${NEIGHBOUR.id}-sketch/1`, observed: 'failed', reason: 'harness' },
    { kind: 'settled', at: ago(2), outcome: 'failed' },
  ]));

  // LOOPING: review loops back to implement, on round 3. Each step's place holds its round-3 task, and a try behind it for
  // each round before, moved there with `then: 'round'` as the run moves it when it files a round.
  const loopDir = path.join(root, 'workflow-loop');
  const again = { type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false };
  write(path.join(loopDir, 'implement.md'), '---\nharness: claude\n---\nImplement it.\n');
  write(path.join(loopDir, 'review.md'), '---\nharness: codex\nafter: implement\nloop: implement\noutput: review.json\n---\nReview it, and say whether it needs another round.\n');
  write(path.join(loopDir, 'review.json'), `${JSON.stringify(again, null, 2)}\n`);
  const loopWorkspace = path.join(root, 'worktrees', LOOPING.id, 'implement');
  const loopBranch = `wf/${LOOPING.id}/implement`;
  const roundTask = (name: string, round: number) => `${LOOPING.id}-${name}-${round}`;
  write(path.join(root, 'runs', `${LOOPING.id}.json`), JSON.stringify({
    id: LOOPING.id, repo: '/code/hkb-v2', workspace: '/code/hkb-v2', baseRef: '19c9365', branch: 'main', isolate: true,
    brief: `${LOOPING.title}\n\nA third run seeded by npm run e2e: review loops back to implement, and asked for another round on the last of the three a loop runs.`,
    workflowDir: loopDir,
    workflow: [
      { name: 'implement', after: [], body: 'Implement it.', harness: 'claude' },
      // `rounds` as the parser sets it for a loop that does not say.
      {
        name: 'review', after: ['implement'], body: 'Review it, and say whether it needs another round.', harness: 'codex',
        loop: 'implement', rounds: 3, output: { file: 'review.json', schema: again },
      },
    ],
    createdAt: ago(4),
    steps: Object.fromEntries(LOOPING.steps.map((name) => [name, {
      taskId: roundTask(name, 3), workspace: loopWorkspace, branch: loopBranch,
      tries: [1, 2].map((round) => ({ taskId: roundTask(name, round), then: 'round' })),
    }])),
  }, null, 2));
  // A declared field is a field of the closeout, beside the four every closeout has: implement answers the findings it
  // was handed, as a loop's target owes from round 2, and review asks for another round.
  signedOff(roundTask('implement', 3), 'claude', loopWorkspace, 'Implement it.', 3.9, 2.5, {
    outcome: 'done', summary: 'Answered the second review.', needs: null, artifacts: [],
    replies: [{ finding: 'apps/web/src/lib/status.ts — a word it does not know reads as working', answer: "won't fix", why: 'On purpose, and a test says so.' }],
  });
  signedOff(roundTask('review', 3), 'codex', loopWorkspace, 'Review it, and say whether it needs another round.', 2.4, 0.5, {
    outcome: 'done', summary: 'One finding is still open.', needs: null, artifacts: [], again: true,
  });
  // The rounds before, each step's try in each a task the engine ran once: implement's second answered the first review, and
  // each review asked for another round.
  const ranOnce = (task: string, harness: string, brief: string, began: number, ended: number, closeout: object): void =>
    write(path.join(root, 'engine', 'tasks', `${task}.jsonl`), lines([
      { kind: 'filed', at: ago(began), brief, cwd: loopWorkspace, maxAttempts: 1, harness },
      { kind: 'starting', at: ago(began), attempt: 1 },
      { kind: 'spawned', at: ago(began), attempt: 1 },
      { kind: 'ended', at: ago(ended), attempt: 1, sessionId: `ae/${task}/1`, observed: 'done', reason: 'harness', closeout },
      { kind: 'settled', at: ago(ended), outcome: 'succeeded' },
    ]));
  const said = (summary: string, more: object = {}) => ({ outcome: 'done', summary, needs: null, artifacts: [], ...more });
  const [first, second] = LOOPING.earlier;
  ranOnce(roundTask('implement', 1), 'claude', 'Implement it.', 3.99, 3.7, said(first.implement));
  ranOnce(roundTask('review', 1), 'codex', 'Review it, and say whether it needs another round.', 3.69, 3.5, said(first.review, { again: true }));
  ranOnce(roundTask('implement', 2), 'claude', 'Implement it.', 3.49, 3.2, said(second.implement, { replies: LOOPING.replies }));
  ranOnce(roundTask('review', 2), 'codex', 'Review it, and say whether it needs another round.', 3.19, 3.0, said(second.review, { again: true }));

  // HELD: implement's attempt was spawned and never ended, and `claude agents` lists its session blocked (REGISTRY); its conversation
  // ends on the harness's line. review waits on it, not filed.
  const heldDir = path.join(root, 'workflow-held');
  write(path.join(heldDir, 'implement.md'), '---\nharness: claude\n---\nImplement it.\n');
  write(path.join(heldDir, 'review.md'), '---\nharness: claude\nafter: implement\n---\nReview it.\n');
  const heldTask = `${HELD.id}-implement`;
  write(path.join(root, 'runs', `${HELD.id}.json`), JSON.stringify({
    id: HELD.id, repo: '/code/hkb-v2', workspace: '/code/hkb-v2', baseRef: '19c9365', branch: 'main', isolate: true,
    brief: `${HELD.title}\n\nA fourth run seeded by npm run e2e: implement's session is blocked by the harness, on the login refresh race, and gave no closeout.`,
    workflowDir: heldDir,
    workflow: [
      { name: 'implement', after: [], body: 'Implement it.', harness: 'claude' },
      { name: 'review', after: ['implement'], body: 'Review it.', harness: 'claude' },
    ],
    createdAt: ago(3),
    steps: { implement: { taskId: heldTask, workspace: '/code/hkb-v2', branch: `wf/${HELD.id}/implement` }, review: { taskId: null } },
  }, null, 2));
  write(path.join(root, 'engine', 'tasks', `${heldTask}.jsonl`), lines([
    { kind: 'filed', at: ago(3), brief: 'Implement it.', cwd: '/code/hkb-v2', maxAttempts: 1, harness: 'claude' },
    { kind: 'starting', at: ago(2.9), attempt: 1 },
    { kind: 'spawned', at: ago(2.9), attempt: 1 },
  ]));
  write(path.join(root, REGISTRY), JSON.stringify([
    { name: `ae/${heldTask}/1`, sessionId: HELD.sessionId, kind: 'background', state: 'blocked', status: 'idle', startedAt: now - 2.9 * 60_000 },
    { name: `ae/${SAYING.run}-${SAYING.step}/1`, sessionId: SAYING.sessionId, kind: 'background', state: 'working', status: 'busy', startedAt: now - 2.5 * 60_000, pid: SAYING.pid },
  ]));
  write(path.join(root, 'claude', 'projects', '-code-hkb-v2', `${HELD.sessionId}.jsonl`), lines(heldConversation(ago)));
}
