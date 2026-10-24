/**
 * The store `npm run e2e` serves: six fake runs and the diamond's, written the way `wf` and the engine write theirs.
 *
 * Written by hand, all of it: nothing here ticks, so a run's record, a step's pins and a kind's revisions ledger are planted in the
 * shapes the store holds, never by a filing. What those shapes are is held where they are written — the orchestrator's
 * `test/revisions.test.ts` and the api's `drift.test.ts` for the pins and the ledger. Here the pages are the subject.
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
 * Beside the store, the sessions at work, each an attached one as the daemon's holder writes its run file (`attachedRun`), held by the
 * e2e's own process: HELD's `implement`, and NEIGHBOUR's `draft`, whose words said run.ts reads off its say file (SAYING).
 *
 * Beside the store, a checkout for the api to serve on the Capabilities page (`HKB_REPO`): CHECKOUT.
 * And the workflows the Workflows page lists, in the checkout's `workflows/` and in the store's: WORKFLOWS. And the cards the Inbox page
 * lists, in the store's `inbox/`: CARDS, and the queued ones the Factory draws as ghosts, with the cap the daemon last ran with: QUEUE.
 * And the factories the Factories canvas draws, in the store's `factories/`: FACTORIES, FOLDER's run started in one of them.
 *
 * Written by hand rather than through agent-orchestrator: the web app imports no package, and a record
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
  /** What the harness denied `theme`'s job, as the engine recorded it on the attempt's end, and as the package words it. */
  denied: {
    denials: [
      { tool: 'Skill', what: 'look' },
      { tool: 'Bash', what: 'npx playwright test' },
    ],
    words: 'denied: Skill(look), Bash(npx playwright test)',
    node: 'denied 2 calls',
  },
  /** The skills `theme`'s session loaded, as the engine recorded them on the attempt's end: `look` twice, `effect` once. */
  skills: ['look', 'effect', 'look'],
  /** Who a person has to act for: the step that signed off blocked, and the one whose check refused. */
  waitingOnYou: ['implement', 'theme'],
  /**
   * The revisions the run resolved, and what the ledger holds now: its agent and its skill have both moved since, and `tokens` ran on
   * an older revision of the agent than the run is pinned to. The board draws one line per kind, the step's saying it already ran.
   */
  behind: {
    agent: 'agent coder: rev 5, ledger at 6',
    skill: 'skill look: rev 1, ledger at 2',
    ran: 'agent coder: tokens ran on rev 4, ledger at 6',
    kinds: 3,
  },
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
  used: '14 responses · 31 tool calls · 112k in · 6.35k out',
  /**
   * What `tokens` named in its closeout: an image and a text file in its files directory, which the api serves, and a path on its branch.
   */
  artifacts: { image: 'palette.png', text: 'tokens.txt', path: 'TOKENS.md' },
  /**
   * `tokens`' closeout is v1's envelope: a summary longer than one line may be, which the board shows cut, its whole text leading the
   * body, a markdown body, and a value handed on beside its files, an address the board links. `theme`'s is v0's, given before the
   * envelope was versioned: its first line is its summary, its whole text its body.
   */
  envelope: {
    summary:
      'Picked the colour tokens for the board: ten hues, each with a light and a dark tone, and a picture of every swatch side by side.',
    cut: 'Picked the colour tokens for the board: ten hues, each with a light and a dark tone, and a picture of every swatch…',
    body: 'The **sky** and **rose** hues sit at the ends of the range.',
    value: { name: 'Palette', value: 'https://example.com/palette' },
    v0: { first: 'Applied them to every page.', more: 'Every page reads the tokens now.' },
  },
  /** One per `after` between its steps: implement → review, review → respond, implement → respond, tokens → theme. */
  edges: 4,
  /**
   * Where its time went, off the engine's attempts and the filings on its feed (`seedFeed`): each step that signed off was spawned a minute
   * after it was filed — `[queued, ran]` — and theme's check at once. review's task has no journal, so the run's totals leave it out and
   * say so.
   */
  timeline: {
    sessions: { implement: ['1m00s', '29m00s'], tokens: ['1m00s', '9m00s'], theme: ['1m00s', '19m00s'] },
    check: ['0s', '3m00s'],
    run: { queued: '3m00s, 1 not known', ran: '1h00m, 1 not known', wall: 'not known' },
  },
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
  /** The seven calls between two things said, and the thought among them, as the one line the family's folded turn says. */
  folded: 'Worked for 6m 30s · 8 steps',
  /** How many lines that turn opens to: its seven calls and the thought kept without its text. */
  lines: 8,
  /** The first line of what the first file read came back as, which its line opens to. */
  readFirstLine: "1\timport type { RunSummary } from './api';",
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
  const line = {
    sessionId: session.sessionId,
    isSidechain: false,
    userType: 'external',
    cwd: '/code/hkb-v2',
    version: '2.1.270',
    gitBranch: `wf/${FAKE.id}/implement`,
  };
  let n = 0;
  let minutes = 41;
  const next = (type: 'user' | 'assistant', content: unknown) => ({
    ...line,
    type,
    uuid: `${type}-${++n}`,
    timestamp: ago((minutes -= 0.5)),
    message: { role: type, content },
  });
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
    ...call(
      'toolu_e2e_tsc',
      'Bash',
      { command: 'npx tsc --noEmit' },
      "src/lib/factory.ts(48,3): error TS2322: Type 'string' is not assignable to type 'boolean'.",
      true,
    ),
    ...call(
      'toolu_e2e_read1',
      'Read',
      { file_path: '/code/hkb-v2/apps/web/src/lib/factory.ts' },
      "1\timport type { RunSummary } from './api';",
    ),
    ...call(
      'toolu_e2e_read2',
      'Read',
      { file_path: '/code/hkb-v2/apps/web/src/components/FactoryCanvas.tsx' },
      "1\timport { useMemo } from 'react';",
    ),
    ...call(
      'toolu_e2e_read3',
      'Read',
      { file_path: '/code/hkb-v2/apps/web/src/routes/index.tsx' },
      "1\timport { createFileRoute } from '@tanstack/react-router';",
    ),
    next('assistant', [
      {
        type: 'text',
        text: `Every run in flight keeps its card:\n\n- ${session.listed}\n- \`Show finished\` brings it back\n\n\`\`\`ts\nexport const onTheFloor = (run: RunSummary) => run.moving;\n\`\`\``,
      },
    ]),
    ...call(
      'toolu_e2e_edit',
      'Edit',
      { file_path: '/code/hkb-v2/apps/web/src/lib/factory.ts', old_string: 'run.status', new_string: 'run.moving' },
      'The file has been updated.',
    ),
    {
      ...line,
      type: 'system',
      uuid: 'system-1',
      subtype: 'informational',
      content: session.system,
      level: 'info',
      timestamp: ago((minutes -= 0.5)),
    },
    next('assistant', [{ type: 'tool_use', id: 'toolu_e2e_closeout', name: 'StructuredOutput', input: session.closeout }]),
    next('user', [
      {
        type: 'tool_result',
        tool_use_id: 'toolu_e2e_closeout',
        content: [{ type: 'text', text: 'Structured output provided successfully' }],
      },
    ]),
  ];
}

/**
 * A second run, started after FAKE: `plan` signed off and `draft`, which waits on it, has its session running, so work moves
 * along the edge between them. `sketch` failed and `ship`, which waits on it, will never be filed, so `assess` has the run
 * failed — while draft's session still runs. It still moves, so it is in flight: on the floor, with HELD's, until finished
 * runs are shown. Laid out oldest first, its card takes the cell beside FAKE's — the cell FAKE's card grows over when it is opened, which
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
  /** The agent `draft` is given, at work in it: the Overview's strip shows it among the agents at work. */
  agent: 'drafter',
} as const;

/**
 * NEIGHBOUR's `draft`, the session in flight the `say` page speaks to: an attached session at work (`attachedRun`), and its
 * conversation so far is on disk (DRAFT_TRANSCRIPT): the prompt, words, and a call still waiting on its result. run.ts reads its say file
 * (`attachedFiles`), standing in for its holder, and writes into that conversation what a working session writes when it reads the words
 * between calls (`arrivalLine`).
 */
export const SAYING = {
  run: NEIGHBOUR.id,
  step: 'draft',
  sessionId: '3f6a2c1d-8e4b-4c7a-9d2f-5b1e0a7c6d84',
  prompt: 'Draft it.',
  /** What the session said so far, before its call. */
  line: 'Drafting the outline, one section at a time.',
  /** What the `say` page tells it. */
  words: 'Widen the draft to the api section too, and keep the outline short.',
  /** The last event of its conversation as seeded, its call, which the engine journals the words `after`. */
  mark: { kind: 'tool_use', id: 'toolu_draft_read' },
} as const;

/**
 * The files of the attached session under `name` in the store, as the runtime names them (`filesOf`, `attached-file.ts`): its run file,
 * and the words said to it, which its holder hands the session.
 */
export const attachedFiles = (root: string, name: string): { run: string; say: string } => {
  const base = path.join(root, 'engine', 'runs', 'attached', name.replace(/[^A-Za-z0-9._-]/g, '_'));
  return { run: `${base}.json`, say: `${base}.say.jsonl` };
};

/**
 * An attached session's run file, as its holder writes it: `state` its holder's word, held by this process — alive while the pages run,
 * and not the api's, so the api's engine reads the session as another holder's and leaves it be.
 */
export const attachedRun = (name: string, sessionId: string, state: 'working' | 'idle' | 'completed', startedAt: string): string =>
  JSON.stringify({ name, state, owner: process.pid, startedAt, sessionId, request: {} });

/** Where draft's conversation is kept, from the store: the file its session writes, and run.ts adds to when the session reads words. */
export const DRAFT_TRANSCRIPT = path.join('claude', 'projects', '-code-hkb-v2', `${SAYING.sessionId}.jsonl`);

/**
 * The line a working Claude Code session writes into its transcript when it reads words another process posted to its inbox, between calls:
 * a `queued_command` attachment from a peer, as 2.1.270 wrote one (agent-runtime's transcript test), for the words `prompt`, at `at`.
 */
export function arrivalLine(prompt: string, at: string): string {
  const uuid = `draft-arrival-${Date.parse(at)}`;
  return `${JSON.stringify({
    parentUuid: 'draft-assistant-2',
    isSidechain: false,
    userType: 'external',
    cwd: '/code/hkb-v2',
    sessionId: SAYING.sessionId,
    version: '2.1.270',
    gitBranch: 'main',
    type: 'attachment',
    uuid,
    timestamp: at,
    attachment: {
      type: 'queued_command',
      prompt,
      source_uuid: uuid,
      commandMode: 'prompt',
      origin: { kind: 'peer', from: 'unknown' },
      timestamp: at,
      isMeta: true,
    },
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
    review: 'round 3 of 3, and it asked again — once more: nemia round go-round-again-e2e2 review',
  },
  /** What each step said in the rounds before the one it is on: round 1, then round 2. */
  earlier: [
    { implement: 'Implemented it.', review: 'Three findings.' },
    { implement: 'Answered the first review.', review: 'Two findings are still open.' },
  ],
  /** What implement answered in round 2, and how the Output tab says it: `finding → answer · why`. */
  replies: [{ finding: 'apps/web/src/lib/status.ts — an unknown word reads as working', answer: 'fixed', why: 'It reads as unknown now.' }],
  replied: 'apps/web/src/lib/status.ts — an unknown word reads as working → fixed · It reads as unknown now.',
} as const;

/**
 * A fourth run, started last: `implement`'s session is at work, an attached one, its conversation ending on the harness's login refresh
 * race (`line`), and `review` waits on it. The run is running and moves, and in the package's words nobody is waiting on you: the step
 * asked nothing. On the floor by default, in the cell after NEIGHBOUR's; the hold pages hold a run until it ships. Its name is from when
 * a Claude Code session could be blocked by its harness, which only a remote agent's can now.
 */
export const HELD = {
  id: 'blocked-by-the-harness-e2e3',
  title: 'Blocked by the harness',
  steps: ['implement', 'review'],
  blocked: 'implement',
  sessionId: '9c3e1d2a-7b4f-4e8a-b6d5-1f0a2c3b4d5e',
  /** What the harness wrote into the session last, word for word as Claude Code 2.1.270 writes it. */
  line: 'Could not refresh your login because another Claude Code process is refreshing it (or exited mid-refresh) · Try again in a minute; if it keeps happening, close other Claude Code windows or sign in again with /login',
} as const;

/**
 * A fifth run: what it cost. `tokens` has `budget: 3`, and its two tries — the second a person's nudge — cost $1.75 and $2.50, each refused
 * by its check: `over budget $4.25 of $3`, raised with its try. `implement` has `budget: 2`, and `review` loops back to it: implement's two
 * rounds cost $1.20 and $0.90, review's two sessions ran on Codex, which prices nothing, and review asked for a third round, which would
 * file implement again past its cap — so both read `over budget`, raised with review's round. `palette` has `budget: 1`, and its one
 * session cost $1.50 and signed off blocked with a question: `over budget $1.50 of $1`, answered with its raise. The run cost `≥$7.85`:
 * review's sessions have no cost on them. Nothing of it moves, and it waits on you: finished, off the Factory's floor until finished runs
 * are shown. Newer than every run but the diamond's.
 */
export const COSTLY = {
  id: 'what-it-cost-e2e10',
  title: 'What it cost',
  steps: ['implement', 'review', 'tokens', 'palette'],
  /** What the run cost, on its card, its row on Runs and its page's header: `≥`, since review's sessions were not priced. */
  cost: '≥$7.85',
  /**
   * Its time at work: from implement's first spawn, 1.48 minutes ago, to tokens' second check's end, 0.95 — the union of its sessions and
   * checks, which overlap; their sum is 74s. Waiting on you, it is at work and not over.
   */
  took: '31s at work',
  /**
   * The tokens its sessions used, on its card, its row and its header: every session's, review's Codex ones too, which measure tokens
   * though they price nothing; and their split, on hover and in the header.
   */
  tokens: { said: '6.73M tokens', split: '5.9M read from the cache · 690k written to it · 60k uncached · 84.5k out' },
  /**
   * The step that signed off blocked past its budget, answered with its raise: its word, what it cost of its cap, its question, and where
   * its raise starts.
   */
  asks: {
    step: 'palette',
    status: 'over budget $1.50 of $1',
    of: '$1.50 of $1',
    needs: 'Warm colours for the dark theme, or cool ones?',
    startsAt: '2',
  },
  /** The step over its own budget, raised with its try: its word, what its tries cost of its cap, and the amount its raise starts at. */
  over: { step: 'tokens', status: 'over budget $4.25 of $3', of: '$4.25 of $3', startsAt: '5' },
  /** A raise the package refuses: not above the $4.25 tokens' tries cost. */
  refused: 4,
  /** The loop held on implement's budget: its looping step, its word, the amount its round's raise starts at, and implement's own word. */
  held: {
    step: 'review',
    status: 'over budget — implement $2.10 of $2',
    startsAt: '3',
    target: 'implement',
    targetStatus: 'over budget $2.10 of $2',
  },
  /** What each try's session cost, on the timeline: implement's two rounds, review's two unpriced, and tokens' two tries. */
  sessions: { implement: ['$1.20', '$0.90'], review: ['not measured', 'not measured'], tokens: ['$1.75', '$2.50'], palette: ['$1.50'] },
  /** What each round of review's loop cost: implement's session and review's, which has no cost on it. */
  rounds: ['≥$1.20', '≥$0.90'],
  /**
   * What the sessions read, by price. The run's, in its header: every try's classes, and no peak, since Codex reports none — and tokens'
   * second try, which continued its first, wrote its context to the cache again. tokens' own, under its `context: 200k`: it compacted, so
   * it reached its cap, short of it in tokens, and the rebuild. palette's, with no cap, past 200k.
   */
  read: {
    run: 'read 5.9M · wrote 690k',
    rebuilt: 'a resumed session wrote its context to the cache again instead of reading it',
    tokens: { counts: 'read 1.32M · wrote 210k · peak 174k, compacted at its 200k cap', peak: 'peak 174k, compacted at its 200k cap' },
    palette: { counts: 'read 820k · wrote 160k · peak 231k, past 200k with no cap', peak: 'peak 231k, past 200k with no cap' },
  },
} as const;

/**
 * A sixth run, gated: `plan → implement`, started `--gate plan`, the gate frozen on its record as `wf start` freezes it (`gates`). plan
 * signed off done with a plan in markdown, and nothing after it is filed: it reads `awaiting approval` and waits on you — `approve plan` —
 * and nothing of the run moves, so it is finished, off the Factory's floor until finished runs are shown. Newest of every run, so its card
 * takes the last cell and moves none of the others. The `gate` page approves plan and sends it back from its page, taking each file back,
 * and makes its refusal — an approval of a step that is not gated — in a page of its own.
 */
export const GATED = {
  id: 'read-the-plan-first-e2e11',
  title: 'Read the plan first',
  steps: ['plan', 'implement'],
  gated: 'plan',
  /** What plan handed on, which a person approves: its summary, as the markdown it is. */
  plan: { heading: 'The plan', items: ['Parse the --flag option in cli.ts', 'Store it on the run record'] },
  /**
   * And its declared output, as a planner signs one off: an approach, drawn whole at the
   * gate; four files, which the gate folds; two steps and one risk, which it does not.
   */
  output: {
    approach: 'Read the flag where the other options are read, and keep it on the run record beside them.',
    files: [
      { path: 'packages/agent-orchestrator/src/cli.ts', change: 'parse --flag' },
      { path: 'packages/agent-orchestrator/src/run.ts', change: 'carry it on the run' },
      { path: 'packages/agent-orchestrator/src/store.ts', change: 'write it on the record' },
      { path: 'packages/agent-orchestrator/README.md', change: 'say what it does' },
    ],
    steps: ['Parse the flag and refuse a bad value', 'Store it and read it back'],
    risks: ['A record written before the flag has none'],
  },
  /** What the `gate` page approves plan with, and what it sends plan back with. */
  words: 'Ship the second reading.\nStore the flag before you parse it.',
  objection: 'Say where the flag is stored, and for how long.',
  /** plan's agent, frozen on the record, and what plan's own file sets over it: its words and one deny, the policy its gate draws open. */
  planner: {
    name: 'planner',
    instructions: 'You are the planner: you plan before anyone builds.',
    policy: 'Plan it.',
    deny: 'Bash(git push:*)',
  },
} as const;

/**
 * A run at its second gate: `plan → build → ship`, the first two gated. plan signed off half an hour ago and waited some twenty minutes
 * for its approval, the file `nemia approve` writes beside the record; build then ran, signed off a few minutes ago, and awaits its own;
 * ship is not filed, so the run's result is nobody's to decide yet. So the run's present wait on a person is minutes long while all its
 * waits on one, summed, are over twenty: the `runs` page tells the two apart. No seeded run: the Factory lays its cards out by age, so
 * the `runs` page writes it for itself (`writeRegated`) and takes it back.
 */
export const REGATED = {
  id: 'wait-at-the-second-gate-e2e12',
  title: 'Wait at the second gate',
  steps: ['plan', 'build', 'ship'],
  /** Minutes ago, each mid-minute: plan signed off, a person approved it, and build signed off. */
  planEnded: 30.5,
  approved: 8.5,
  buildEnded: 3.5,
} as const;

/**
 * A seventh run, whose workflow's ending is a step of its own: `implement → review → ship`, with `ship` in the repository's own checkout
 * (`workspace: main`) and gated. implement and review signed off; ship has never run, so it reads `awaiting approval` — its approval is
 * what files it — and nothing of the run moves. So it is finished, and it stays on the Factory's floor all the same: nobody has decided it.
 *
 * Its branch is committed in FAKE's repository, two commits ahead of main, so the gate panel has a standing and its counts to show, and
 * `review`'s files directory holds the file it named. The `decide` page reads the banner and the panel, and sends the work back — to
 * review, which the send-back at an ending's gate names, and never to ship — then takes that back.
 */
export const ENDING = {
  id: 'ship-it-or-send-it-back-e2e12',
  title: 'Ship it, or send it back',
  steps: ['implement', 'review', 'ship'],
  /** The step that ends the run, at its gate: `workspace: main`, gated, and not filed. */
  ending: 'ship',
  /** The step a send-back at that gate goes to: the work it would act on, not the step at the gate (`sendBackTo`). */
  back: 'review',
  /**
   * What ship's prose says first, which is the whole of what a person is deciding: `wf ls`'s `→ to decide:` line is this and the command.
   */
  says: 'Merge this run onto the base branch, or abort on any failure.',
  /** Its result branch, which review worked on and ship would merge. */
  branch: 'wf/ship-it-or-send-it-back-e2e12/implement',
  /** Where that branch stands against the base, and how much it changed, as `wf decide` prints them under the run. */
  standing: 'wf/ship-it-or-send-it-back-e2e12/implement is ahead of main by 2 commits',
  stat: '3 files: +14 −1',
  /** What review handed on, which is what a person approves: rendered as the markdown it is. */
  review: { heading: 'What I found', items: ['The cap is read on every pass', 'One finding left: the queue has no test'] },
  /** The file review named in its closeout, in its files directory, which the api serves. */
  artifact: 'REVIEW.md',
  /** What the `decide` page sends the work back with. */
  objection: 'Say in the README that the cap is read on every pass.',
} as const;

/**
 * An eighth run, the same workflow with its ending approved and run: ship was approved with no words, filed in the repository's own
 * checkout, and merged the run's branch onto main. Every step is done and its branch is on the base, so there is nothing left to decide —
 * the folder answered for its own branch — and its card is off the Factory's floor with the rest of the finished. It froze `review` with
 * another note than ENDING, the run of its folder before it, did: the store's one change mark (`changed`).
 */
export const LANDED = {
  id: 'it-landed-itself-e2e13',
  title: 'It landed itself',
  steps: ['implement', 'review', 'ship'],
  ending: 'ship',
  branch: 'wf/it-landed-itself-e2e13/implement',
  /** What ship said it did, which is the account a person reads under the step. */
  merged: 'Merged it onto main with --no-ff, and the check passed.',
  /** What `wf prune` freed once it landed: the one worktree its implement and review worked in, as a `node_modules` makes one. */
  prunedBytes: 1.5 * 1024 ** 3,
  /** And what `--artifacts` freed with it: its files directory, whose screenshot review named. */
  prunedFilesBytes: 48 * 1024 ** 2,
  /** The file review's closeout named in its files directory, gone with it. */
  shot: 'review-light.png',
  /** The note it froze for `review`, where ENDING froze the folder's own. */
  review: 'Review the change, and picture what it draws.',
  /** The change mark that note makes, on its day: the step it froze otherwise, and the run it is compared with. */
  changed: { kind: 'step', name: 'review', since: ENDING.id },
} as const;

/**
 * A ninth run whose folder says nothing about what happens when the work is done: one step, signed off, its branch two commits ahead of
 * main and nobody has merged it: the second kind of thing to decide, a run nothing asks to merge. Its card stays on the floor, marked, and
 * `wf decide` is the command in the line.
 */
export const UNMERGED = {
  id: 'nobody-merged-it-e2e14',
  title: 'Nobody merged it',
  steps: ['implement'],
  branch: 'wf/nobody-merged-it-e2e14/implement',
  /** What `wf ls` says after `→ to decide:` for it, and the board's line with it. */
  said: 'wf/nobody-merged-it-e2e14/implement is ahead of main, and nothing has merged it — nemia decide nobody-merged-it-e2e14',
} as const;

/**
 * Runs that wait on runs (`wf start --after`), on the checkout's repository — a real one (`seedDiamond`), and the one a start from the
 * Workflows page runs in, so the start form offers them. The diamond: `top` landed first; `landed` and `running` started from a main
 * that had it, and `landed` was merged while `running`'s session still works; `bottom` waits on both, so on `running` alone. Beside it,
 * `cancelled` was called off before anything of it was filed, and `orphan` waits on it: for ever, so on you.
 *
 * Newer than every other run, so the Factory's oldest-first floor still starts with FAKE's card and NEIGHBOUR's beside it.
 */
export const DIAMOND = {
  top: { id: 'lay-the-diamond-top-e2e4', title: 'Lay the diamond top', after: [] },
  landed: { id: 'one-side-landed-e2e5', title: 'One side, landed', after: ['lay-the-diamond-top-e2e4'] },
  running: { id: 'the-other-side-runs-e2e6', title: 'The other side, still running', after: ['lay-the-diamond-top-e2e4'] },
  bottom: { id: 'the-diamond-bottom-e2e7', title: 'The diamond bottom', after: ['one-side-landed-e2e5', 'the-other-side-runs-e2e6'] },
  cancelled: { id: 'called-off-e2e8', title: 'Called off', after: [] },
  orphan: { id: 'waits-on-a-called-off-run-e2e9', title: 'Waits on a called-off run', after: ['called-off-e2e8'] },
  /** What `wf ls` says of each waiting run's root, and the card with it. */
  words: {
    bottom: 'waiting on the-other-side-runs-e2e6',
    orphan: 'waiting on called-off-e2e8 (cancelled)',
    /** What `running`'s card says on hover of the minute it waited, created and nothing filed, before its step was: not time at work. */
    running: 'waited 1m 00s before its first step was filed',
  },
} as const;

/**
 * A run with no repository at all (`workspace: folder`), as `workflows/note` runs: two steps, each in a folder the run made under
 * the store, and never a branch, a base or a merge. `write` signed off naming the note it wrote; `review` continued the same folder
 * — a chain does — and said the note holds. Both are done, so the run is finished and its card is off the Factory's default floor.
 *
 * The folder holds more than the closeout named: the note, and an outline `write` left behind and never named. A person who never
 * opens a terminal finds both on the step, with their sizes.
 */
export const FOLDER = {
  id: 'a-note-on-the-tides-e2e15',
  title: 'A note on the tides',
  /** The folder in the store it was started from, beside the runs rather than under `workflows/`, so the Workflows page is unchanged. */
  workflow: 'notes',
  steps: ['write', 'review'],
  /** The file `write` wrote and named in its closeout, which the run collected into the step's files beside the record. */
  note: 'note.md',
  /** And one it left in the folder and never named: what the folder holds is not what a closeout said. */
  outline: 'outline.txt',
  /** A line of the note itself, to read back off what the api serves. */
  line: 'Two bulges, one turn: two tides.',
  /** What `review` gave back, which changed nothing. */
  verdict: 'The note holds: nothing in it is claimed beyond what it says it is unsure of.',
  /** The one command `wf decide` offers a run with no repository, which the board offers too. */
  forget: 'nemia rm a-note-on-the-tides-e2e15',
  /** The factory it was started in, FACTORIES' `hiring`: the one run not in the default factory. */
  factory: 'nemia',
} as const;

/**
 * Write FOLDER into the store at `root`: its workflow folder, its record with `place` and none of a repository run's fields, a journal per
 * step, and the files the steps left — in `write`'s folder, and the note collected beside the record as the run collects a named file.
 * Times are minutes before `now`.
 *
 * Every step works under the run's own directory in the store, and `review` continues `write`'s folder, as a chain does. The brief says no
 * git word of its own: the folder page sweeps everything the page draws, so a git word found there can only have come from the board. Each
 * step is filed as the run files a folder step, in `dontAsk`, the one mode a folder team is allowed, so the step's rows read the mode it
 * ran in rather than the engine's default. Its journal puts the mode beside the task's fields rather than under `config`, a shape the
 * runtime reads in today's (`upgrade` in agent-runtime's journal.ts): the folder page's `dontAsk` proves such a journal reaches the board.
 */
export function seedFolder(root: string, now = Date.now()): void {
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const { id } = FOLDER;
  const workflowDir = path.join(root, FOLDER.workflow);
  const fence = 'permissionMode: dontAsk\nallowedTools: Edit(**)\n';
  write(
    path.join(workflowDir, 'write.md'),
    `---\nharness: claude\nworkspace: folder\n${fence}---\nWrite a short note on what was asked.\n`,
  );
  write(
    path.join(workflowDir, 'review.md'),
    `---\nharness: claude\nafter: write\nworkspace: folder\npermissionMode: dontAsk\n---\nRead the note, and say whether it holds up.\n`,
  );

  const work = path.join(root, 'runs', id, 'work');
  const wrote = path.join(work, 'write');
  write(
    path.join(wrote, FOLDER.note),
    `# Why the tides come twice a day\n\nThe moon pulls the water nearest it, and leaves the water\nfarthest from it behind. Two bulges, one turn: two tides.\n`,
  );
  write(path.join(wrote, FOLDER.outline), 'moon pulls · earth turns · two bulges\n');
  write(path.join(root, 'runs', id, 'artifacts', 'write', FOLDER.note), fs.readFileSync(path.join(wrote, FOLDER.note)));

  write(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify(
      {
        id,
        place: { kind: 'folder' },
        workspace: work,
        brief: `${FOLDER.title}\n\nA run seeded by npm run e2e: a team that works in folders it makes for its steps.`,
        workflowDir,
        workflow: [
          {
            name: 'write',
            after: [],
            body: 'Write a short note on what was asked.',
            harness: 'claude',
            workspace: 'folder',
            permissionMode: 'dontAsk',
            allowedTools: ['Edit(**)'],
          },
          {
            name: 'review',
            after: ['write'],
            body: 'Read the note, and say whether it holds up.',
            harness: 'claude',
            workspace: 'folder',
            permissionMode: 'dontAsk',
          },
        ],
        factory: FOLDER.factory,
        createdAt: ago(20),
        steps: { write: { taskId: `${id}-write`, workspace: wrote }, review: { taskId: `${id}-review`, workspace: wrote } },
      },
      null,
      2,
    ),
  );

  const signedOff = (step: string, brief: string, began: number, ended: number, closeout: object): void =>
    write(
      path.join(root, 'engine', 'tasks', `${id}-${step}.jsonl`),
      lines([
        { kind: 'filed', at: ago(began), brief, cwd: wrote, maxAttempts: 1, harness: 'claude', permissionMode: 'dontAsk' },
        { kind: 'starting', at: ago(began - 1), attempt: 1 },
        { kind: 'spawned', at: ago(began - 1), attempt: 1 },
        { kind: 'ended', at: ago(ended), attempt: 1, sessionId: `ae/${id}-${step}/1`, observed: 'done', reason: 'harness', closeout },
        { kind: 'settled', at: ago(ended), outcome: 'succeeded' },
      ]),
    );
  signedOff('write', 'Write a short note on what was asked.', 19, 18, {
    outcome: 'done',
    summary: 'Wrote the note, in the folder this step was given.',
    needs: null,
    artifacts: [path.join(wrote, FOLDER.note)],
  });
  signedOff('review', 'Read the note, and say whether it holds up.', 18, 17, {
    outcome: 'done',
    summary: FOLDER.verdict,
    needs: null,
    artifacts: [],
  });
}

/**
 * Write one finished folder run into the store at `root`, as `seedFolder` writes FOLDER, by its least: a record of one step in
 * `factory`, the step's journal, signed off `finishedAgo` minutes before `now` a minute after it was filed, and those events on the
 * engine's feed, which the api reads a filing off. Answers what takes it back: the record, the journal and the run's folder removed,
 * and the feed as it was.
 */
export function seedFinished(
  root: string,
  run: { id: string; title: string; factory: string; finishedAgo: number },
  now = Date.now(),
): () => void {
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const { id } = run;
  const work = path.join(root, 'runs', id, 'work');
  const record = path.join(root, 'runs', `${id}.json`);
  const journal = path.join(root, 'engine', 'tasks', `${id}-write.jsonl`);
  const feed = path.join(root, 'engine', 'feed.jsonl');
  const fedBefore = fs.readFileSync(feed, 'utf8');
  const body = 'Write a short note on what was asked.';
  write(
    record,
    JSON.stringify(
      {
        id,
        place: { kind: 'folder' },
        workspace: work,
        brief: `${run.title}\n\nA run written by a page of npm run e2e, which takes it back.`,
        workflowDir: path.join(root, FOLDER.workflow),
        workflow: [{ name: 'write', after: [], body, harness: 'claude', workspace: 'folder', permissionMode: 'dontAsk' }],
        factory: run.factory,
        createdAt: ago(run.finishedAgo + 2),
        steps: { write: { taskId: `${id}-write`, workspace: path.join(work, 'write') } },
      },
      null,
      2,
    ),
  );
  const closeout = { outcome: 'done', summary: 'Wrote the note.', needs: null, artifacts: [] };
  const events = [
    {
      kind: 'filed',
      at: ago(run.finishedAgo + 1),
      brief: body,
      cwd: path.join(work, 'write'),
      maxAttempts: 1,
      harness: 'claude',
      permissionMode: 'dontAsk',
    },
    { kind: 'starting', at: ago(run.finishedAgo + 1), attempt: 1 },
    { kind: 'spawned', at: ago(run.finishedAgo + 1), attempt: 1 },
    { kind: 'ended', at: ago(run.finishedAgo), attempt: 1, sessionId: `ae/${id}-write/1`, observed: 'done', reason: 'harness', closeout },
    { kind: 'settled', at: ago(run.finishedAgo), outcome: 'succeeded' },
  ];
  write(journal, lines(events));
  fs.appendFileSync(feed, lines(events.map((event) => ({ taskId: `${id}-write`, event }))));
  return () => {
    fs.rmSync(record, { force: true });
    fs.rmSync(journal, { force: true });
    fs.rmSync(path.join(root, 'runs', id), { recursive: true, force: true });
    fs.writeFileSync(feed, fedBefore);
  };
}

/**
 * The factories in the store, each a file in `factories/` as `wf factory add` writes it. `hiring` holds FOLDER's run, is offered WORKFLOWS'
 * `dev` and hires its agent into `implement`; `bare` names only a folder, and so do `others`, which are there so the menu has more
 * factories than it shows; `broken`'s file names no repository, so it does not read as a factory. Listed by name, as the api lists them.
 */
export const FACTORIES = {
  hiring: { name: FOLDER.factory, hire: 'dev/implement' },
  bare: 'pipao',
  others: ['harbour', 'lighthouse', 'quay'],
  broken: 'broken',
} as const;

/**
 * Write FACTORIES into the store at `root`: `hiring` on `repo`, the others each on a folder beside it, and `broken` with no `repos`;
 * and, in the harness's own file under the store's `claude/`, the trust of each place, as filing a factory gives it, so no page says a
 * place is untrusted but the one that takes a trust away.
 */
export function seedFactories(root: string, repo: string): void {
  const dir = path.join(root, 'factories');
  const { hiring, bare, others, broken } = FACTORIES;
  const hires = { [hiring.hire]: WORKFLOWS.good.agent.name };
  write(path.join(dir, `${hiring.name}.json`), JSON.stringify({ repos: [repo], workflows: [WORKFLOWS.good.name], hires }, null, 2));
  for (const name of [bare, ...others]) write(path.join(dir, `${name}.json`), JSON.stringify({ repos: [path.join(root, name)] }, null, 2));
  write(path.join(dir, `${broken}.json`), JSON.stringify({ workflows: [WORKFLOWS.good.name] }, null, 2));
  const places = [repo, ...[bare, ...others].map((name) => path.join(root, name))];
  const projects = Object.fromEntries(places.map((place) => [place, { hasTrustDialogAccepted: true }]));
  write(path.join(root, 'claude', '.claude.json'), `${JSON.stringify({ projects }, null, 2)}\n`);
}

/** The agent `hiringStarts` writes into the checkout for FACTORIES.hiring to hire into `dev/review`, whose file names no agent. */
export const REVIEWER = 'reviewer-e2e';

/**
 * Makes FACTORIES.hiring able to start `dev` in the store at `root`, which the seed leaves it unable to: its hire into `dev/implement`,
 * a step whose file names its agent, leaves `dev` unread in the factory, and `dev/review` names no agent. Writes REVIEWER into the
 * checkout's `workflows/agents/` — the checkout's one agent gives skills, which `review`'s `tools:` could not load — and the factory's
 * file with REVIEWER hired into `review` in place of its hires. Returns the function that takes both back: the agent removed, and the
 * factory's file as it was found.
 */
export function hiringStarts(root: string): () => void {
  const file = path.join(root, 'factories', `${FACTORIES.hiring.name}.json`);
  const found = fs.readFileSync(file, 'utf8');
  const agent = path.join(root, 'checkout', 'workflows', 'agents', `${REVIEWER}.md`);
  fs.writeFileSync(agent, '---\ndescription: Use this when a change needs reviewing.\n---\nYou review the change.\n');
  fs.writeFileSync(
    file,
    JSON.stringify({ ...(JSON.parse(found) as object), hires: { [`${WORKFLOWS.good.name}/review`]: REVIEWER } }, null, 2),
  );
  return () => {
    fs.rmSync(agent, { force: true });
    fs.writeFileSync(file, found);
  };
}

/**
 * Gives FACTORIES.hiring a second repository in the store at `root`, FACTORIES.bare's folder, after its own: a factory on several, which
 * the seed has none of. Returns the second repository and the function that writes the factory's file back as it was found.
 */
export function onSeveralRepos(root: string): { second: string; back: () => void } {
  const file = path.join(root, 'factories', `${FACTORIES.hiring.name}.json`);
  const found = fs.readFileSync(file, 'utf8');
  const read = JSON.parse(found) as { repos: string[] };
  const second = path.join(root, FACTORIES.bare);
  fs.writeFileSync(file, JSON.stringify({ ...read, repos: [...read.repos, second] }, null, 2));
  return { second, back: () => fs.writeFileSync(file, found) };
}

/**
 * Leaves the store at `root` with no factory on file: its `factories/` moved aside, and an empty one in its place. Returns the function
 * that puts the folder back.
 */
export function noFactories(root: string): () => void {
  const dir = path.join(root, 'factories');
  const aside = path.join(root, 'factories.aside');
  fs.renameSync(dir, aside);
  fs.mkdirSync(dir);
  return () => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(aside, dir);
  };
}

/** The diamond's runs, oldest first. */
export const DIAMOND_RUNS = [DIAMOND.top, DIAMOND.landed, DIAMOND.running, DIAMOND.bottom, DIAMOND.cancelled, DIAMOND.orphan] as const;

/**
 * Write DIAMOND into the checkout at `repo` — made a git repository here, its files the base on `main` — and the store at `root`. `top`'s
 * and `landed`'s result branches are merged into main with `--no-ff`, one after the other, and their steps signed off: each one's own
 * `wf decide` says landed. `running`'s branch has its work and is not merged, and its session has started and not ended, as NEIGHBOUR's
 * draft: the engine reads it running. Its record was created a minute before its step was filed, as a run started `--after` one is filed on
 * the pass after its parent lands: that minute is its wait, and its card does not count it. `cancelled` is marked as `wf cancel` marks a
 * run, in a file beside its record. Times are minutes before `now`.
 */
export function seedDiamond(repo: string, root: string, now = Date.now()): void {
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const git = (...args: string[]): string =>
    execFileSync(
      'git',
      ['-c', 'user.name=e2e', '-c', 'user.email=e2e@example.com', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args],
      {
        cwd: repo,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  const base = git('rev-parse', 'HEAD').trim();
  const branchOf = (id: string) => `wf/${id}/implement`;
  const work = (id: string, merge: boolean) => {
    git('checkout', '-q', '-b', branchOf(id));
    write(path.join(repo, 'src', `${id}.ts`), `export const done = '${id}';\n`);
    git('add', '-A');
    git('commit', '-q', '-m', `The work of ${id}`);
    git('checkout', '-q', 'main');
    if (merge) git('merge', '-q', '--no-ff', '-m', `Merge ${id}`, branchOf(id));
  };

  const workflowDir = path.join(root, 'workflow-diamond');
  write(path.join(workflowDir, 'implement.md'), '---\nplace: git\nharness: claude\n---\nImplement it.\n');
  const workflow = [{ name: 'implement', after: [], body: 'Implement it.', harness: 'claude' }];
  const record = (run: (typeof DIAMOND_RUNS)[number], minutes: number, implement: object) =>
    write(
      path.join(root, 'runs', `${run.id}.json`),
      JSON.stringify(
        {
          id: run.id,
          repo,
          workspace: repo,
          baseRef: base,
          branch: 'main',
          isolate: true,
          brief: `${run.title}\n\nA run seeded by npm run e2e, in the diamond: ${run.after.length ? `after ${run.after.join(' and ')}` : 'waiting on no run'}.`,
          workflowDir,
          workflow,
          ...(run.after.length ? { after: run.after } : {}),
          createdAt: ago(minutes),
          steps: { implement },
        },
        null,
        2,
      ),
    );
  const task = (run: (typeof DIAMOND_RUNS)[number]) => `${run.id}-implement`;
  const filed = (run: (typeof DIAMOND_RUNS)[number], minutes: number) => ({
    kind: 'filed',
    at: ago(minutes),
    brief: 'Implement it.',
    cwd: repo,
    maxAttempts: 1,
  });
  const signedOff = (run: (typeof DIAMOND_RUNS)[number], began: number, ended: number) =>
    write(
      path.join(root, 'engine', 'tasks', `${task(run)}.jsonl`),
      lines([
        filed(run, began),
        { kind: 'starting', at: ago(began), attempt: 1 },
        { kind: 'spawned', at: ago(began), attempt: 1 },
        {
          kind: 'ended',
          at: ago(ended),
          attempt: 1,
          sessionId: `ae/${task(run)}/1`,
          observed: 'done',
          reason: 'harness',
          closeout: { outcome: 'done', summary: `Did ${run.title}.`, needs: null, artifacts: [] },
        },
        { kind: 'settled', at: ago(ended), outcome: 'succeeded' },
      ]),
    );

  const { top, landed, running, bottom, cancelled, orphan } = DIAMOND;
  work(top.id, true);
  signedOff(top, 2.6, 2.5);
  record(top, 2.6, { taskId: task(top), workspace: repo, branch: branchOf(top.id) });
  work(landed.id, true);
  signedOff(landed, 2.4, 2.3);
  record(landed, 2.4, { taskId: task(landed), workspace: repo, branch: branchOf(landed.id) });
  work(running.id, false);
  write(
    path.join(root, 'engine', 'tasks', `${task(running)}.jsonl`),
    lines([filed(running, 1.2), { kind: 'starting', at: ago(1.1), attempt: 1 }, { kind: 'spawned', at: ago(1.1), attempt: 1 }]),
  );
  record(running, 2.2, { taskId: task(running), workspace: repo, branch: branchOf(running.id) });
  record(bottom, 2.0, { taskId: null });
  record(cancelled, 1.8, { taskId: null });
  write(path.join(root, 'runs', `${cancelled.id}.cancelled`), ago(1.7));
  record(orphan, 1.6, { taskId: null });
}

/**
 * A run of FACTORIES' `hiring` started `--after` DIAMOND's `running`, a run of the default factory that may still land: on its factory's
 * floor, a ghost that names `running` and draws no card of it. Not seeded with the rest, so no count of the store's runs moves: the page
 * that reads it writes it (`seedChained`) and takes it back.
 */
export const CHAINED = {
  id: 'waits-in-a-factory-e2e16',
  title: 'Waits in a factory',
  factory: FACTORIES.hiring.name,
  after: [DIAMOND.running.id],
  /** What `wf ls` says of its root, and its card with it. */
  word: DIAMOND.words.bottom,
} as const;

/**
 * Write CHAINED's record into the store at `root`, as the diamond's are written (`seedDiamond`), on the checkout at `repo`, from its
 * `main`: in its factory, nothing of it filed. Returns the record's path, for the page to take it back.
 */
export function seedChained(root: string, repo: string, now = Date.now()): string {
  const base = execFileSync('git', ['rev-parse', 'main'], { cwd: repo, encoding: 'utf8' }).trim();
  const workflowDir = path.join(root, 'workflow-diamond');
  const file = path.join(root, 'runs', `${CHAINED.id}.json`);
  write(
    file,
    JSON.stringify(
      {
        id: CHAINED.id,
        repo,
        workspace: repo,
        baseRef: base,
        branch: 'main',
        isolate: true,
        brief: `${CHAINED.title}\n\nA run seeded by npm run e2e, in the factory ${CHAINED.factory}: after ${CHAINED.after.join(' and ')}.`,
        workflowDir,
        workflow: [{ name: 'implement', after: [], body: 'Implement it.', harness: 'claude' }],
        after: CHAINED.after,
        factory: CHAINED.factory,
        createdAt: new Date(now).toISOString(),
        steps: { implement: { taskId: null } },
      },
      null,
      2,
    ),
  );
  return file;
}

/**
 * HELD's `implement`, as its session said it before the harness stopped it: the prompt, words, a call and its result, and the harness's
 * line, an assistant message the harness made up (`isApiErrorMessage`): no model wrote it.
 */
function heldConversation(ago: (minutes: number) => string): object[] {
  const line = {
    sessionId: HELD.sessionId,
    isSidechain: false,
    userType: 'external',
    cwd: '/code/hkb-v2',
    version: '2.1.270',
    gitBranch: `wf/${HELD.id}/implement`,
  };
  const said = (type: 'user' | 'assistant', uuid: string, minutes: number, content: unknown, more: object = {}) => ({
    ...line,
    type,
    uuid,
    timestamp: ago(minutes),
    message: { role: type, content },
    ...more,
  });
  return [
    { type: 'custom-title', customTitle: `ae/${HELD.id}-implement/1`, sessionId: HELD.sessionId },
    said('user', 'held-user-1', 2.8, 'Implement what was asked.\n\n## What was asked for\n\nBlocked by the harness.'),
    said('assistant', 'held-assistant-1', 2.7, [{ type: 'text', text: 'Reading the tests first.' }]),
    said('assistant', 'held-assistant-2', 2.6, [{ type: 'tool_use', id: 'toolu_held_test', name: 'Bash', input: { command: 'npm test' } }]),
    said('user', 'held-user-2', 2.5, [{ type: 'tool_result', tool_use_id: 'toolu_held_test', content: '# tests 33\n# pass 33\n# fail 0' }]),
    said('assistant', 'held-assistant-3', 2.4, [{ type: 'text', text: HELD.line }], { isApiErrorMessage: true, error: 'server_error' }),
  ];
}

const STEPS = [
  {
    file: 'implement.md',
    text: '---\nplace: git\nharness: claude\ncheck: npm test\n---\nImplement what was asked.\n',
    frozen: { name: 'implement', after: [], body: 'Implement what was asked.', harness: 'claude', check: 'npm test' },
  },
  {
    file: 'review.md',
    text: '---\nplace: git\nharness: codex\nafter: implement\nsandbox: read-only\n---\nReview the change.\n',
    /** Frozen with a codex step's sandbox as its `permissionMode`: read as it was frozen, and shown on the board's `sandbox` row. */
    frozen: { name: 'review', after: ['implement'], body: 'Review the change.', harness: 'codex', permissionMode: 'read-only' },
  },
  {
    file: 'respond.md',
    text: '---\nplace: git\nharness: claude\nafter: review\nresume: implement\ncheck: npm test\n---\nAnswer the review.\n',
    frozen: {
      name: 'respond',
      after: ['review', 'implement'],
      resume: 'implement',
      body: 'Answer the review.',
      harness: 'claude',
      check: 'npm test',
    },
  },
  {
    file: 'tokens.md',
    text: '---\nplace: git\nharness: codex\n---\nPick the colour tokens.\n',
    frozen: { name: 'tokens', after: [], body: 'Pick the colour tokens.', harness: 'codex' },
  },
  {
    file: 'theme.md',
    text: `---\nplace: git\nharness: claude\nafter: tokens\ncheck: ${FAKE.check}\n---\nApply them to every page.\n`,
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
  missing: { name: 'missing', command: 'nemia-e2e-no-such-mcp-server' },
  /** `Bash(find:*)` refuses one of Claude Code's read-only commands, which the page strikes on a step with Bash. */
  denied: ['Bash(git push:*)', 'mcp__fixture__wipe', 'Bash(find:*)'],
  /** `Bash(cat:*)` makes another of them ask, which the page strikes on a dontAsk step and on a job, as every Claude Code step is. */
  asked: ['Bash(cat:*)'],
  /** What its settings allow: two Bash commands, which WORKFLOWS' review, in dontAsk, may run. */
  allowed: ['Bash(npm test)', 'Bash(git diff:*)'],
} as const;

/** Write CHECKOUT into `repo`. `mcpServer` is the file of the stdio MCP server it declares, which node runs. */
export function seedCheckout(repo: string, mcpServer: string): void {
  const { skill, bareSkill, agent, server, missing, denied } = CHECKOUT;
  write(
    path.join(repo, '.claude', 'skills', skill.dir, 'SKILL.md'),
    `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n# Review\n`,
  );
  write(path.join(repo, '.claude', 'skills', bareSkill, 'SKILL.md'), '# Scratch\n\nNo frontmatter, so it is listed by its directory.\n');
  write(
    path.join(repo, '.claude', 'agents', agent.file),
    `---\nname: ${agent.name}\ndescription: ${agent.description}\n---\nYou write tests.\n`,
  );
  write(
    path.join(repo, '.mcp.json'),
    JSON.stringify(
      {
        mcpServers: {
          [server.name]: { command: process.execPath, args: [mcpServer] },
          [missing.name]: { command: missing.command, args: ['--stdio'] },
        },
      },
      null,
      2,
    ),
  );
  write(
    path.join(repo, '.claude', 'settings.json'),
    JSON.stringify(
      {
        enabledMcpjsonServers: [server.name, missing.name],
        permissions: { deny: denied, ask: CHECKOUT.asked, allow: CHECKOUT.allowed },
      },
      null,
      2,
    ),
  );
}

/**
 * The workflows the Workflows page lists. In the checkout's `workflows/`, `dev`: implement ⇄ review, described by its README,
 * each step with what the page draws on its node — implement's harness and model given by its agent, `implementer`, in `workflows/agents/`,
 * whose name its node shows first; and `broken`, whose reviewer misspells `after`, which the loader refuses.
 * In the store's `workflows/`, yours: `mine`, one step and no README.
 */
export const WORKFLOWS = {
  good: {
    name: 'dev',
    description: 'Implement what was asked, then a second engineer reviews it, three rounds at most.',
    /** The README's paragraph past the description: on the workflow's page, which shows the README whole, and not on its card. */
    more: 'A second paragraph, which only its own page shows.',
    steps: ['implement', 'review'],
    runsOn: 'claude · opus',
    /** Implement's agent, which gives it its harness and model: its node names it before them, and its step's page says what it can do. */
    agent: {
      name: 'implementer',
      /** Its name as the board shows a person's, and the job its `role:` line says it holds. */
      person: 'Implementer',
      role: 'Software engineer',
      runsOn: 'implementer · claude · opus',
      /** The MCP server its sessions load, by its name in the checkout's `.mcp.json`: review, with no agent, loads none. */
      mcp: 'fixture',
      /** Its instructions, the body of its file: markdown, which its page reads as markdown and not as the source. */
      body: '## How you work\n\nYou implement what is asked, and **test** it:\n\n- the failing test first\n- then the change\n',
      /**
       * What it says it can do, as an A2A skill: the one skill its `skills:` gives, `skills/<id>/SKILL.md` beside `agents/`, whose
       * frontmatter is the card's entry (`title:` its name), which its step's page shows under its name.
       */
      skill: {
        id: 'implement-a-change',
        name: 'Implement a change',
        description: 'Writes the change asked for, with its tests.',
        tags: ['code'],
      },
    },
    check: 'npm test && npm run typecheck',
    tools: 'Read, Grep, Glob, Bash',
    /** The effort review sets; implement sets none, and runs at its harness's own. */
    effort: 'high',
    /** The context window review sets, as a step writes it; implement sets none, and its node says nothing of it. */
    context: '200k',
    /** What implement disallows, which the Capabilities page takes from the set it has. */
    disallowedTools: 'SendMessage',
    loop: 'implement · 3 rounds',
    /** What review's agent is told, in markdown: a heading and a list, which its page renders. */
    review: {
      body: 'Review the change.\n\n## How to review\n\n- Read the diff against the brief.\n- Run the check yourself.',
      heading: 'How to review',
      items: ['Read the diff against the brief.', 'Run the check yourself.'],
      /** Each key review sets, as the loader reads it: what its page's key table says. */
      keys: {
        after: 'implement',
        place: 'git',
        harness: 'claude',
        model: 'opus',
        effort: 'high',
        context: '200k',
        permissionMode: 'dontAsk',
        tools: 'Read, Grep, Glob, Bash',
        output: 'review.schema.json',
        loop: 'implement',
        rounds: '3',
      },
    },
  },
  broken: { name: 'broken', error: 'review: `afer` is not a key a step has.' },
  yours: { name: 'mine', steps: ['plan'] },
} as const;

/**
 * The agents the Agents page lists: the checkout's `implementer` (WORKFLOWS' `dev` › implement names it), and one of yours, `scribe`, in
 * the store's `workflows/agents/`, which sets a description, two role keys and a result schema, gives no skills — so its card is one entry
 * made from its description — and which no node of yours names. `made` is the agent the page creates, edits and removes; `naming` the
 * folder of yours the refusal page writes, whose one step names `scribe`.
 */
export const AGENTS = {
  seeded: {
    name: 'scribe',
    description: 'Use this when a change needs its notes written.',
    keys: { model: 'sonnet', effort: 'low', output: 'scribe.schema.json' },
    body: 'You write the notes of a change.\n\n## What they say\n\n- What changed, and why.\n- What a reader should try first.',
    schema: JSON.stringify(
      { type: 'object', properties: { notes: { type: 'string' } }, required: ['notes'], additionalProperties: false },
      null,
      2,
    ),
    /** What it says it can do, given no skills: one entry, generated from its own name and description. */
    skill: { id: 'scribe', name: 'scribe', description: 'Use this when a change needs its notes written.', tags: ['scribe'] },
  },
  made: {
    name: 'notary',
    description: 'Use this when a decision needs writing down.',
    /** Not haiku: an agent that runs in `auto`, the runtime's default mode, on a model that cannot is refused. */
    model: 'sonnet',
    edited: 'opus',
    /**
     * Picked from your library in the skill list, with the Skill tool its tools must then include: a skill its Claude Code sessions are
     * given, by name, seeded in the store's `workflows/skills/`, whose SKILL.md is `skill`, the entry its card is generated with.
     */
    skills: 'write-a-decision',
    tools: 'Read, Skill',
    body: 'You write down what was decided, and by whom.',
    skill: {
      id: 'write-a-decision',
      name: 'Write a decision',
      description: 'Writes down what was decided, and by whom.',
      tags: ['decision'],
    },
  },
  naming: 'noted',
} as const;

/** Write WORKFLOWS: the checkout's into `repo`, and yours into the store at `root`, with AGENTS' seeded agent of yours. */
export function seedWorkflows(repo: string, root: string): void {
  const { good, broken, yours } = WORKFLOWS;
  const dev = path.join(repo, 'workflows', good.name);
  write(path.join(dev, 'README.md'), `# ${good.name}\n\n${good.description}\n\n${good.more}\n`);
  write(
    path.join(repo, 'workflows', 'agents', `${good.agent.name}.md`),
    `---\nrole: ${good.agent.role}\nskills: ${good.agent.skill.id}\nmcp: ${good.agent.mcp}\nharness: claude\nmodel: opus\n---\n${good.agent.body}`,
  );
  writeSkill(path.join(repo, 'workflows', 'skills'), good.agent.skill);
  write(
    path.join(dev, 'implement.md'),
    `---\nplace: git\nagent: ${good.agent.name}\ncheck: ${good.check}\ndisallowedTools: ${good.disallowedTools}\n---\nImplement what was asked.\n`,
  );
  write(
    path.join(dev, 'review.md'),
    `---\nplace: git\nharness: claude\nmodel: opus\nafter: implement\neffort: ${good.effort}\ncontext: ${good.context}\ntools: ${good.tools}\npermissionMode: dontAsk\noutput: review.schema.json\nloop: implement\nrounds: 3\n---\n${good.review.body}\n`,
  );
  write(
    path.join(dev, 'review.schema.json'),
    JSON.stringify(
      { type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false },
      null,
      2,
    ),
  );
  const bad = path.join(repo, 'workflows', broken.name);
  write(path.join(bad, 'README.md'), `# ${broken.name}\n\nA reviewer whose after is misspelt.\n`);
  write(path.join(bad, 'implement.md'), '---\nplace: git\n---\nImplement what was asked.\n');
  write(path.join(bad, 'review.md'), '---\nplace: git\nafer: implement\n---\nReview the change.\n');
  write(path.join(root, 'workflows', yours.name, 'plan.md'), '---\nplace: git\nharness: codex\n---\nWrite PLAN.md.\n');
  const { seeded } = AGENTS;
  const keys = Object.entries(seeded.keys)
    .map(([key, value]) => `${key}: ${value}\n`)
    .join('');
  write(
    path.join(root, 'workflows', 'agents', `${seeded.name}.md`),
    `---\ndescription: ${seeded.description}\n${keys}---\n${seeded.body}\n`,
  );
  write(path.join(root, 'workflows', 'agents', seeded.keys.output), `${seeded.schema}\n`);
  writeSkill(path.join(root, 'workflows', 'skills'), AGENTS.made.skill);
}

/** A skill in `skills`, its SKILL.md's frontmatter the card entry `skill` is generated as: `title:` its name, the rest as A2A has them. */
function writeSkill(skills: string, skill: { id: string; name: string; description: string; tags: readonly string[] }): void {
  write(
    path.join(skills, skill.id, 'SKILL.md'),
    `---\nname: ${skill.id}\ntitle: ${JSON.stringify(skill.name)}\ndescription: ${JSON.stringify(skill.description)}\ntags: ${JSON.stringify(skill.tags)}\n---\n${skill.description}\n`,
  );
}

/**
 * What the `folder-skills` page writes and takes back, none of it seeded: a folder of the checkout, `folder`, with two skills of its own;
 * an agent of yours that gives the first named with its folder, and a workflow of yours whose one step names the agent and adds the
 * second; and two skills of the checkout's own that are links, `inside` to a folder the checkout keeps, `apart` to one outside it.
 */
export const FOLDER_SKILLS = {
  folder: 'apps/site',
  agentSkill: { id: 'lay-out', name: 'Lay out', description: 'Lays a page out on its grid.', tags: ['layout'] },
  stepSkill: { id: 'set-type', name: 'Set type', description: 'Sets a page in its faces.', tags: ['type'] },
  agent: 'typesetter',
  workflow: 'typeset',
  step: 'compose',
  inside: { id: 'linked-inside', name: 'Linked inside', description: 'Kept in a folder of the checkout, and linked.', tags: ['link'] },
  apart: { id: 'linked-apart', name: 'Linked apart', description: 'Kept outside the checkout, and linked.', tags: ['link'] },
} as const;

/** A FOLDER_SKILLS skill as its line writes it, `folder:name`, and the folder it is read from, by its path in the checkout. */
export const folderSkill = (skill: { id: string }): { written: string; foundIn: string } => ({
  written: `${FOLDER_SKILLS.folder}:${skill.id}`,
  foundIn: `${FOLDER_SKILLS.folder}/.claude/skills/${skill.id}`,
});

/** Every path `writeFolderSkills` makes in the store at `root`, files, links and folders: what the page removes, whatever was written. */
export function folderSkillsPaths(root: string): string[] {
  const { folder, agent, workflow, inside, apart } = FOLDER_SKILLS;
  const repo = path.join(root, 'checkout');
  return [
    path.join(repo, folder.split('/')[0]),
    path.join(repo, 'kept'),
    path.join(root, 'apart'),
    path.join(repo, '.claude', 'skills', inside.id),
    path.join(repo, '.claude', 'skills', apart.id),
    path.join(root, 'workflows', 'agents', `${agent}.md`),
    path.join(root, 'workflows', workflow),
  ];
}

/** Writes FOLDER_SKILLS into the store at `root` and its checkout (`folderSkillsPaths`). */
export function writeFolderSkills(root: string): void {
  const { folder, agentSkill, stepSkill, agent, workflow, step, inside, apart } = FOLDER_SKILLS;
  const repo = path.join(root, 'checkout');
  const own = path.join(repo, '.claude', 'skills');
  writeSkill(path.join(repo, folder, '.claude', 'skills'), agentSkill);
  writeSkill(path.join(repo, folder, '.claude', 'skills'), stepSkill);
  writeSkill(path.join(repo, 'kept'), inside);
  writeSkill(path.join(root, 'apart'), apart);
  fs.symlinkSync(path.join('..', '..', 'kept', inside.id), path.join(own, inside.id));
  fs.symlinkSync(path.join(root, 'apart', apart.id), path.join(own, apart.id));
  write(
    path.join(root, 'workflows', 'agents', `${agent}.md`),
    `---\ndescription: Sets a page.\nskills: ${folderSkill(agentSkill).written}\nharness: claude\nmodel: opus\n---\nYou set pages.\n`,
  );
  write(
    path.join(root, 'workflows', workflow, `${step}.md`),
    `---\nplace: git\nagent: ${agent}\nskills: ${folderSkill(stepSkill).written}\n---\nCompose the page.\n`,
  );
}

/**
 * The inbox the Inbox page lists: three cards in the store's `inbox/`, as `wf inbox add` writes them. `planned` names the checkout's `dev`
 * and the checkout as the repository it is about, and was filed an hour ago; `bare` names neither, and was filed ten minutes ago, so it is
 * listed first; `rich`, between them, names `dev` and is written in markdown — a heading, a list, a table, a code block, a line of raw HTML
 * and two links, one of them `javascript:` — for its page. Each body has a second paragraph, which the list does not show and a start's
 * brief is prefilled with.
 */
export const CARDS = {
  planned: {
    name: 'cache-the-engine-s-views-bet-9prl',
    title: "Cache the engine's views between passes",
    body: "Cache the engine's views between passes\n\nThe tick reads each task's journal twice a pass.",
    workflow: 'dev',
    filedMinutesAgo: 60,
  },
  bare: {
    name: 'show-what-a-step-cost-on-the-c3cw',
    title: 'Show what a step cost on the board',
    body: 'Show what a step cost on the board\n\nBeside its status, in dollars.',
    filedMinutesAgo: 10,
  },
  rich: {
    name: 'render-the-board-s-markdown-r3nd',
    title: "Render the board's markdown",
    body: [
      "Render the board's markdown",
      '',
      '## What it needs',
      '',
      '- Headings, lists and tables drawn as such',
      "- Code in the board's code block",
      '',
      '| page | renders |',
      '|:--|:--|',
      '| inbox card | its body |',
      '| workflow step | what its agent is told |',
      '',
      '```bash',
      'npm run e2e',
      '```',
      '',
      '<b>raw HTML stays text</b> <img src="/raw.png" onerror="alert(1)">',
      '',
      'See [the GFM spec](https://github.github.com/gfm/) and [not a link](javascript:alert(1)).',
    ].join('\n'),
    workflow: 'dev',
    heading: 'What it needs',
    items: ['Headings, lists and tables drawn as such', "Code in the board's code block"],
    cells: ['inbox card', 'its body', 'workflow step', 'what its agent is told'],
    code: 'npm run e2e',
    /** A line of raw HTML, which the page shows as the text it is. */
    html: '<b>raw HTML stays text</b> <img src="/raw.png" onerror="alert(1)">',
    link: { text: 'the GFM spec', href: 'https://github.github.com/gfm/' },
    unsafe: 'not a link',
    filedMinutesAgo: 30,
  },
} as const;

/** Write CARDS into the store at `root`, `planned` about the checkout at `repo`, each file dated when it was filed. */
export function seedInbox(root: string, repo: string, now = Date.now()): void {
  const { planned, bare, rich } = CARDS;
  const cards = [
    { card: planned, text: `---\nworkflow: ${planned.workflow}\nrepo: ${repo}\n---\n${planned.body}\n` },
    { card: bare, text: `${bare.body}\n` },
    { card: rich, text: `---\nworkflow: ${rich.workflow}\n---\n${rich.body}\n` },
  ];
  for (const { card, text } of cards) {
    const file = path.join(root, 'inbox', `${card.name}.md`);
    write(file, text);
    const filed = new Date(now - card.filedMinutesAgo * 60_000);
    fs.utimesSync(file, filed, filed);
  }
}

/**
 * The queue the Factory draws and the Inbox page places: three cards in the store's `inbox/` queued to start on their own, as
 * `wf inbox queue` writes one, each filed before CARDS so the Inbox page lists them after those. `first` and `refused` are cards of
 * FACTORIES.hiring, about the checkout: `first` names `dev` and was queued first; `refused` names a workflow nobody has,
 * and the tick's try of its start is written down as refused (`queue/<name>.json`, of the card as it stands), so it keeps its place and
 * says why. `third` names `dev`, no repository and no factory: a card queued before a queue asked for a factory, which the tick refused
 * for that, its try written down too; it is the default floor's one ghost. And the ceilings the daemon's last pass ran with
 * (`tick.json`): a cap of `cap` runs in flight.
 */
export const QUEUE = {
  first: {
    name: 'draw-the-queue-on-the-fac-q1a1',
    title: 'Draw the queue on the Factory',
    body: 'Draw the queue on the Factory\n\nGhost cards at the left edge, in queue order.',
    workflow: 'dev',
    factory: FACTORIES.hiring.name,
    filedMinutesAgo: 120,
    queuedMinutesAgo: 50,
  },
  refused: {
    name: 'run-a-workflow-nobody-ha-q2b2',
    title: 'Run a workflow nobody has',
    body: 'Run a workflow nobody has\n\nIts start is refused, and it keeps its place.',
    workflow: 'gone',
    factory: FACTORIES.hiring.name,
    filedMinutesAgo: 110,
    queuedMinutesAgo: 40,
    triedMinutesAgo: 39,
  },
  third: {
    name: 'say-the-cap-over-the-flo-q3c3',
    title: 'Say the cap over the floor',
    body: 'Say the cap over the floor\n\nHow many runs are in flight against it.',
    workflow: 'dev',
    filedMinutesAgo: 100,
    queuedMinutesAgo: 20,
    triedMinutesAgo: 19,
  },
  /** WF_MAX_RUNS as the daemon's last pass wrote it. */
  cap: 4,
  sessions: 2,
} as const;

/** The three queued cards, in the queue's order. */
export const QUEUED = [QUEUE.first, QUEUE.refused, QUEUE.third] as const;

/** The queued cards a factory's floor draws as ghosts: FACTORIES.hiring's, and the default floor's, which holds the card of no factory. */
export const QUEUED_IN = { hiring: [QUEUE.first, QUEUE.refused], default: [QUEUE.third] } as const;

/**
 * Why the tick's start of QUEUE.refused was refused, in the package's words for a card whose workflow is no folder in the inbox, in its
 * factory's tree or in its repository (`workflowFolder`'s sentence, after the card's file and line as `cardWorkflow` says them).
 */
export const refusedWhy = (root: string, repo: string): string =>
  `${QUEUE.refused.name}.md: \`workflow: ${QUEUE.refused.workflow}\` — no workflow folder at ${path.join(root, 'inbox', QUEUE.refused.workflow)}, nor a workflow named ${QUEUE.refused.workflow} in ${path.join(repo, 'workflows')}. The repository's workflows are: broken, dev — name one, or give the path to a workflow folder.`;

/**
 * Why the tick's start of QUEUE.third was refused, in the package's words for a queued card that names no factory
 * (`unfactoredCardRefusal`, with no start's flag): its file in the store at `root`, and the factories that read, by name.
 */
export const unfactoredWhy = (root: string): string => {
  const names = [FACTORIES.hiring.name, FACTORIES.bare, ...FACTORIES.others].sort().join(', ');
  return `${path.join(root, 'inbox', `${QUEUE.third.name}.md`)}: this card names no factory, and a card is started only in the factory named for it, never one taken from its folder or its repo:, which can be two factories'. Write \`factory: <name>\` in its frontmatter — one of ${names}; a new card names it as it is filed: nemia inbox add "<idea>" --factory <name>. Nothing was started.`;
};

/**
 * A queued card's text, as `wf inbox queue` writes it: its workflow and its repository, then `queued:`, then its factory when it names
 * one.
 */
export const queuedCardText = (card: { workflow: string; body: string }, queued: string, repo?: string, factory?: string): string =>
  `---\nworkflow: ${card.workflow}\n${repo ? `repo: ${repo}\n` : ''}queued: ${queued}\n${factory ? `factory: ${factory}\n` : ''}---\n${card.body}\n`;

/**
 * What the daemon's last pass cost, as the tick writes it to `tick-stats.json` (`recordPassCost`): 212 ms over twelve run records, most of
 * it observing claude, which the Factory's header says beside the cap (`a pass takes 212 ms`), with the breakdown on hover.
 */
export const PASS = {
  ms: 212.4,
  line: 'a pass takes 212 ms',
  totals: '212 ms, 12 run records read, 812.0 kB read, 1 process started.',
  seen: 'It saw 12 runs in the store, 3 tasks not settled, 1 queued and 2 admitted.',
  cost: (at: string) => ({
    at,
    ms: 212.4,
    records: 12,
    bytes: 812_000,
    spawned: 1,
    overheadMs: 0.4,
    rested: 0,
    runs: 12,
    tasks: 3,
    queued: 1,
    admitted: 2,
    phases: {
      records: { ms: 20, calls: 12, bytes: 12_000, reads: 12, spawned: 0 },
      asks: { ms: 5, calls: 40, bytes: 0, reads: 0, spawned: 0 },
      journals: { ms: 40, calls: 30, bytes: 800_000, reads: 30, spawned: 0 },
      revisions: { ms: 6, calls: 4, bytes: 0, reads: 0, spawned: 0 },
      observe: { ms: 120, calls: 1, bytes: 0, reads: 0, spawned: 1 },
      runtime: { ms: 8, calls: 1, bytes: 0, reads: 0, spawned: 0 },
      place: { ms: 0, calls: 0, bytes: 0, reads: 0, spawned: 0 },
      assess: { ms: 10.4, calls: 0, bytes: 0, reads: 0, spawned: 0 },
      act: { ms: 3, calls: 2, bytes: 0, reads: 0, spawned: 0 },
    },
    harnesses: { claude: { calls: 1, ms: 118, listed: 3, spawned: 1 } },
  }),
} as const;

/**
 * Write QUEUE into the store at `root`, `first` and `refused` about the checkout at `repo`: the cards, the two refused tries, `tick.json`,
 * and what the pass that wrote it cost (`tick-stats.json`, PASS).
 */
export function seedQueue(root: string, repo: string, now = Date.now()): void {
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const { first, refused, third } = QUEUE;
  const cards = [
    { card: first, text: queuedCardText(first, ago(first.queuedMinutesAgo), repo, first.factory) },
    { card: refused, text: queuedCardText(refused, ago(refused.queuedMinutesAgo), repo, refused.factory) },
    { card: third, text: queuedCardText(third, ago(third.queuedMinutesAgo)) },
  ];
  for (const { card, text } of cards) {
    const file = path.join(root, 'inbox', `${card.name}.md`);
    write(file, text);
    const filed = new Date(now - card.filedMinutesAgo * 60_000);
    fs.utimesSync(file, filed, filed);
  }
  const tries = [
    { card: refused, text: cards[1].text, why: refusedWhy(root, repo) },
    { card: third, text: cards[2].text, why: unfactoredWhy(root) },
  ];
  for (const { card, text, why } of tries) {
    const tried = { at: ago(card.triedMinutesAgo), text, repo, why, refused: true };
    write(path.join(root, 'queue', `${card.name}.json`), JSON.stringify(tried, null, 2));
  }
  write(path.join(root, 'tick.json'), JSON.stringify({ sessions: QUEUE.sessions, runs: QUEUE.cap }, null, 2));
  write(path.join(root, 'tick-stats.json'), JSON.stringify(PASS.cost(ago(1)), null, 2));
}

/**
 * The subscription's quota as Claude Code answers its get_usage request (2.1.278's shape): the five-hour window 38% used, resetting in two
 * hours and a bit, and the week 86% used — past the api's mark of 80 — resetting in three days. The e2e's `claude` prints `QUOTA.file`, its
 * `@ID@` made the request's id; the api asks it on every read (HKB_QUOTA_KEEP_MS=0), so a page that changes the file reads the change.
 */
export const QUOTA = {
  file: 'usage-answer.json',
  fiveHour: { used: 38.4, resetsInMinutes: 130 },
  week: { used: 86, resetsInMinutes: 3 * 24 * 60 },
};

/** Write QUOTA's answer into `root`, as a subscriber's Claude Code would give it, and answer with the file. */
export function seedQuota(root: string, now = Date.now()): string {
  const at = (minutes: number) => new Date(now + minutes * 60_000).toISOString().replace('Z', '+00:00');
  const response = {
    subtype: 'success',
    request_id: '@ID@',
    response: {
      subscription_type: 'max',
      rate_limits_available: true,
      rate_limits: {
        five_hour: { utilization: QUOTA.fiveHour.used, resets_at: at(QUOTA.fiveHour.resetsInMinutes) },
        seven_day: { utilization: QUOTA.week.used, resets_at: at(QUOTA.week.resetsInMinutes) },
        seven_day_opus: null,
      },
      behaviors: null,
    },
  };
  const file = path.join(root, QUOTA.file);
  write(file, `${JSON.stringify({ type: 'control_response', response })}\n`);
  return file;
}

export const write = (file: string, text: string | Buffer): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/**
 * A PNG, `width` by `height`, each pixel the colour `colour` gives it: encoded here, since the e2e installs nothing to draw one. 8 bits a
 * channel, RGB, each row with no filter, and the one compression, filter method and interlace a PNG has.
 */
export function png(width: number, height: number, colour: (x: number, y: number) => readonly [number, number, number]): Buffer {
  const stride = width * 3 + 1;
  const rows = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
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
  [14, 165, 233],
  [59, 130, 246],
  [16, 185, 129],
  [245, 158, 11],
  [249, 115, 22],
  [239, 68, 68],
  [115, 115, 115],
  [139, 92, 246],
  [20, 184, 166],
  [244, 63, 94],
];
const palette = (): Buffer => png(480, 96, (x, y) => (y < 8 || y >= 88 || x % 48 < 4 ? [250, 250, 250] : PALETTE[Math.floor(x / 48)]));

/**
 * FAKE's repository, at `repo`: a base on `main`, and `branch` off it with the work committed — a source file and a test
 * of 420 lines in the `apps/web` workspace, two lines in CLAUDE.md, a script changed in package.json. The base's sha.
 */
function seedRepo(repo: string, branch: string): string {
  fs.mkdirSync(repo, { recursive: true });
  const git = (...args: string[]): string =>
    execFileSync(
      'git',
      ['-c', 'user.name=e2e', '-c', 'user.email=e2e@example.com', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args],
      {
        cwd: repo,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  const pkg = (test: string) =>
    `${JSON.stringify({ name: 'nemia', private: true, workspaces: ['packages/*', 'apps/*'], scripts: { test } })}\n`;
  git('init', '-q', '-b', 'main');
  write(path.join(repo, 'package.json'), pkg('turbo run test'));
  write(path.join(repo, 'CLAUDE.md'), '# Nemia — contributor guide\n');
  write(path.join(repo, 'apps', 'web', 'src', 'main.tsx'), "export const app = 'board';\n");
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  const base = git('rev-parse', 'HEAD').trim();

  git('checkout', '-q', '-b', branch);
  const tokens = ['sky', 'blue', 'emerald', 'amber', 'orange', 'red', 'neutral', 'violet', 'teal', 'rose'];
  write(
    path.join(repo, 'apps', 'web', 'src', 'theme.ts'),
    `export const tokens = {\n${tokens.map((t) => `  ${t}: 'var(--color-${t}-500)',`).join('\n')}\n};\n`,
  );
  const cases = Array.from(
    { length: 416 },
    (_, i) => `test('token ${i + 1} is a colour', () => assert.ok(Object.values(tokens)[${i % tokens.length}]));`,
  );
  write(
    path.join(repo, 'apps', 'web', 'test', 'theme.test.ts'),
    `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { tokens } from '../src/theme.ts';\n\n${cases.join('\n')}\n`,
  );
  write(path.join(repo, 'CLAUDE.md'), '# Nemia — contributor guide\n\n- A page is judged in both themes, or it is judged in neither.\n');
  write(path.join(repo, 'package.json'), pkg('turbo run test --concurrency=1'));
  git('add', '-A');
  git('commit', '-q', '-m', 'Apply the colour tokens to every page');
  git('checkout', '-q', 'main');
  return base;
}

/**
 * Write the three runs whose result is a decision into the store at `root`, and their branches into FAKE's repository at `repo`, cut from
 * `base` on main: ENDING at its ending's gate, LANDED with that ending approved and merged, and UNMERGED with a branch nobody took.
 *
 * Real commits, because what the board says about each is read out of git on every request: where the branch stands against the base, and
 * how much it changed. ENDING's two commits are three files, fourteen lines added and one removed against the base — `stat` — with
 * `CLAUDE.md` among them, so its radius has a lesson line too: eight lines of source, then five of docs and CLAUDE.md's line rewritten.
 * LANDED's branch is merged into main with `--no-ff`, as its ending step would have merged it, which is what makes the run read as landed
 * with nothing left to decide.
 *
 * ENDING and LANDED are started from one folder: implement, review, then the ending in the repository's own checkout. LANDED's ship
 * was approved with no words, as `wf approve` writes an approval, filed in the checkout, and merged; then pruned, as `wf prune --artifacts`
 * marks a run: its record and branch kept, the worktree and its files gone. UNMERGED's folder says nothing about shipping, so git is what
 * ends it: one step, signed off, and a branch nobody took.
 */
function seedDecisions(root: string, repo: string, base: string, now: number): void {
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const git = (...args: string[]): string =>
    execFileSync(
      'git',
      ['-c', 'user.name=e2e', '-c', 'user.email=e2e@example.com', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args],
      {
        cwd: repo,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  const commit = (branch: string, message: string, files: ReadonlyArray<readonly [string, string]>, cut = false) => {
    git('checkout', '-q', ...(cut ? ['-b', branch, base] : [branch]));
    for (const [file, text] of files) write(path.join(repo, file), text);
    git('add', '-A');
    git('commit', '-q', '-m', message);
    git('checkout', '-q', 'main');
  };

  commit(
    ENDING.branch,
    'Cap the runs in flight',
    [
      [
        'packages/agent-orchestrator/src/queue.ts',
        [
          '/** The cap on runs in flight, read on every pass. */',
          'export function capOf(env: string | undefined): number {',
          '  const n = Number(env);',
          '  return Number.isSafeInteger(n) && n > 0 ? n : 0;',
          '}',
          '',
          '/** How many runs the pass counts against it. */',
          'export const inFlight = (runs: readonly string[]): number => runs.length;',
        ].join('\n') + '\n',
      ],
    ],
    true,
  );
  commit(ENDING.branch, "Write the queue's rule down", [
    [
      'packages/agent-orchestrator/docs/queue.md',
      '# The queue\n\nThe cap is read on every pass, and stored nowhere.\n\nA card that cannot start keeps its place.\n',
    ],
    ['CLAUDE.md', "# Nemia — contributor guide, with the queue's rule\n"],
  ]);
  commit(
    LANDED.branch,
    'Say what shipping is',
    [['workflows/dev/ship.md', '---\nworkspace: main\ngate: true\n---\nMerge it onto the base branch.\n']],
    true,
  );
  git('merge', '-q', '--no-ff', '-m', `Merge ${LANDED.id}`, LANDED.branch);
  commit(
    UNMERGED.branch,
    'Draw the queue on the Factory',
    [['apps/web/src/components/QueueLane.tsx', 'export const QueueLane = () => null;\n']],
    true,
  );

  const signedOff = (task: string, cwd: string, brief: string, began: number, ended: number, closeout: object): void =>
    write(
      path.join(root, 'engine', 'tasks', `${task}.jsonl`),
      lines([
        { kind: 'filed', at: ago(began), brief, cwd, maxAttempts: 1, harness: 'claude' },
        { kind: 'starting', at: ago(began - 0.01), attempt: 1 },
        { kind: 'spawned', at: ago(began - 0.01), attempt: 1 },
        { kind: 'ended', at: ago(ended), attempt: 1, sessionId: `ae/${task}/1`, observed: 'done', reason: 'harness', closeout },
        { kind: 'settled', at: ago(ended), outcome: 'succeeded' },
      ]),
    );
  const done = (summary: string, artifacts: string[] = []) => ({ outcome: 'done', summary, needs: null, artifacts });

  const shipDir = path.join(root, 'workflow-ship');
  write(path.join(shipDir, 'implement.md'), '---\nplace: git\nharness: claude\n---\nImplement what was asked.\n');
  write(path.join(shipDir, 'review.md'), '---\nplace: git\nharness: claude\nafter: implement\n---\nReview the change.\n');
  const shipBody = `${ENDING.says}\n\nLook at the checkout first: it is a person's, and this step is the run doing what they would do by hand.`;
  write(path.join(shipDir, 'ship.md'), `---\nplace: git\nharness: claude\nafter: review\nworkspace: main\ngate: true\n---\n${shipBody}\n`);
  const shipWorkflow = [
    { name: 'implement', after: [], body: 'Implement what was asked.', harness: 'claude' },
    { name: 'review', after: ['implement'], body: 'Review the change.', harness: 'claude' },
    { name: 'ship', after: ['review'], body: shipBody, harness: 'claude', workspace: 'main', gate: true },
  ];

  const shipRun = (id: string, title: string, why: string, branch: string, minutes: number, steps: object, workflow = shipWorkflow) =>
    write(
      path.join(root, 'runs', `${id}.json`),
      JSON.stringify(
        {
          id,
          repo,
          workspace: repo,
          baseRef: base,
          branch: 'main',
          isolate: true,
          brief: `${title}\n\nA run seeded by npm run e2e: ${why}`,
          workflowDir: shipDir,
          workflow,
          createdAt: ago(minutes),
          steps,
        },
        null,
        2,
      ),
    );

  const lane = path.join(root, 'worktrees', ENDING.id, 'implement');
  const files = path.join(root, 'runs', ENDING.id, 'artifacts', 'review');
  write(path.join(files, ENDING.artifact), `# ${ENDING.review.heading}\n\n${ENDING.review.items.map((item) => `- ${item}`).join('\n')}\n`);
  signedOff(
    `${ENDING.id}-implement`,
    lane,
    'Implement what was asked.',
    0.9,
    0.7,
    done('Capped the runs in flight, and wrote the rule down.'),
  );
  signedOff(
    `${ENDING.id}-review`,
    lane,
    'Review the change.',
    0.69,
    0.5,
    done(`## ${ENDING.review.heading}\n\n${ENDING.review.items.map((item) => `- ${item}`).join('\n')}`, [
      path.join(files, ENDING.artifact),
    ]),
  );
  shipRun(
    ENDING.id,
    ENDING.title,
    'implement and review signed off, and the ending step waits at its gate for your word.',
    ENDING.branch,
    0.9,
    {
      implement: { taskId: `${ENDING.id}-implement`, workspace: lane, branch: ENDING.branch },
      review: { taskId: `${ENDING.id}-review`, workspace: lane, branch: ENDING.branch },
      ship: { taskId: null },
    },
  );

  const landedLane = path.join(root, 'worktrees', LANDED.id, 'implement');
  signedOff(`${LANDED.id}-implement`, landedLane, 'Implement what was asked.', 0.8, 0.6, done('Said what shipping is, in the folder.'));
  signedOff(
    `${LANDED.id}-review`,
    landedLane,
    LANDED.review,
    0.59,
    0.4,
    done('One reading of it, and nothing to change.', [path.join(root, 'runs', LANDED.id, 'artifacts', 'review', LANDED.shot)]),
  );
  signedOff(`${LANDED.id}-ship`, repo, shipBody, 0.3, 0.2, done(LANDED.merged));
  write(path.join(root, 'runs', `${LANDED.id}.asks`, 'approve-ship-1'), JSON.stringify({ step: 'ship', try: 1, at: ago(0.35) }, null, 2));
  const prunedAt = ago(0.1);
  write(
    path.join(root, 'runs', `${LANDED.id}.pruned`),
    JSON.stringify(
      {
        at: prunedAt,
        worktrees: [{ path: landedLane, bytes: LANDED.prunedBytes }],
        artifacts: { at: prunedAt, bytes: LANDED.prunedFilesBytes },
      },
      null,
      2,
    ),
  );
  shipRun(
    LANDED.id,
    LANDED.title,
    'its ending step was approved, ran in the checkout and merged the branch: nothing left to decide.',
    LANDED.branch,
    0.8,
    {
      implement: { taskId: `${LANDED.id}-implement`, workspace: landedLane, branch: LANDED.branch },
      review: { taskId: `${LANDED.id}-review`, workspace: landedLane, branch: LANDED.branch },
      ship: { taskId: `${LANDED.id}-ship`, workspace: repo },
    },
    shipWorkflow.map((step) => (step.name === LANDED.changed.name ? { ...step, body: LANDED.review } : step)),
  );

  const aloneDir = path.join(root, 'workflow-alone');
  write(path.join(aloneDir, 'implement.md'), '---\nplace: git\nharness: claude\n---\nImplement what was asked.\n');
  const aloneLane = path.join(root, 'worktrees', UNMERGED.id, 'implement');
  signedOff(`${UNMERGED.id}-implement`, aloneLane, 'Implement what was asked.', 0.7, 0.5, done("Drew the queue at the floor's left edge."));
  write(
    path.join(root, 'runs', `${UNMERGED.id}.json`),
    JSON.stringify(
      {
        id: UNMERGED.id,
        repo,
        workspace: repo,
        baseRef: base,
        branch: 'main',
        isolate: true,
        brief: `${UNMERGED.title}\n\nA run seeded by npm run e2e: it finished, and its branch is ahead of the base with nothing asking for a merge.`,
        workflowDir: aloneDir,
        workflow: [{ name: 'implement', after: [], body: 'Implement what was asked.', harness: 'claude' }],
        createdAt: ago(0.7),
        /**
         * Handed off, as the tick writes it once the step signed off: the `prune` page cuts its worktree, and a hand-off owed would hold
         * the prune.
         */
        steps: {
          implement: {
            taskId: `${UNMERGED.id}-implement`,
            workspace: aloneLane,
            branch: UNMERGED.branch,
            handedOff: `${UNMERGED.id}-implement`,
          },
        },
      },
      null,
      2,
    ),
  );
}

/** SAYING's session so far, as Claude Code 2.1.270 writes it: the prompt, words, and a Read with no result yet. */
function draftConversation(ago: (minutes: number) => string): object[] {
  const line = {
    sessionId: SAYING.sessionId,
    isSidechain: false,
    userType: 'external',
    cwd: '/code/hkb-v2',
    version: '2.1.270',
    gitBranch: 'main',
  };
  const said = (type: 'user' | 'assistant', uuid: string, minutes: number, content: unknown) => ({
    ...line,
    type,
    uuid,
    timestamp: ago(minutes),
    message: { role: type, content },
  });
  return [
    { type: 'custom-title', customTitle: `ae/${SAYING.run}-${SAYING.step}/1`, sessionId: SAYING.sessionId },
    said('user', 'draft-user-1', 2.4, SAYING.prompt),
    said('assistant', 'draft-assistant-1', 2.3, [{ type: 'text', text: SAYING.line }]),
    said('assistant', 'draft-assistant-2', 2.2, [
      { type: 'tool_use', id: SAYING.mark.id, name: 'Read', input: { file_path: '/code/hkb-v2/README.md' } },
    ]),
  ];
}

/** Events as the engine journals them: a line of JSON each. */
export const lines = (events: object[]): string => events.map((event) => `${JSON.stringify(event)}\n`).join('');

/**
 * The engine's feed, as its journal keeps one beside the tasks: every event of every task's journal in the store, in the order they
 * happened, sorted stably so a journal's events that share an instant keep their order. The seed writes each journal by hand, and the api
 * reads when a task was filed off the feed alone (`readFilings`), so this is written last, over them all.
 */
export function seedFeed(root: string): void {
  const tasks = path.join(root, 'engine', 'tasks');
  const entries = fs
    .readdirSync(tasks)
    .filter((file) => file.endsWith('.jsonl'))
    .flatMap((file) =>
      fs
        .readFileSync(path.join(tasks, file), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => ({ taskId: file.slice(0, -'.jsonl'.length), event: JSON.parse(line) as { at: string } })),
    );
  entries.sort((a, b) => a.event.at.localeCompare(b.event.at));
  write(path.join(root, 'engine', 'feed.jsonl'), lines(entries));
}

/** Each path `writeRegated` makes in `root`, a folder or a file, for the page that takes them back, whether or not all were made. */
export const regatedFiles = (root: string): string[] => [
  path.join(root, 'workflow-regated'),
  path.join(root, 'runs', `${REGATED.id}.json`),
  path.join(root, 'runs', `${REGATED.id}.asks`),
  path.join(root, 'engine', 'tasks', `${REGATED.id}-plan.jsonl`),
  path.join(root, 'engine', 'tasks', `${REGATED.id}-build.jsonl`),
];

/**
 * REGATED into `root`, its times minutes before `now`: its workflow folder, its record, plan's approval beside it, and the journals of
 * its two tasks (`regatedFiles`).
 */
export function writeRegated(root: string, now: number): void {
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const { id, title, planEnded, approved, buildEnded } = REGATED;
  const dir = path.join(root, 'workflow-regated');
  write(path.join(dir, 'plan.md'), '---\nplace: git\nharness: claude\n---\nPlan it.\n');
  write(path.join(dir, 'build.md'), '---\nplace: git\nharness: claude\nafter: plan\n---\nBuild the plan.\n');
  write(path.join(dir, 'ship.md'), '---\nplace: git\nharness: claude\nafter: build\n---\nShip what was built.\n');
  const lane = (step: string) => path.join(root, 'worktrees', id, step);
  const record = (step: string) => ({ taskId: `${id}-${step}`, workspace: lane(step), branch: `wf/${id}/${step}` });
  write(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify(
      {
        id,
        repo: '/code/hkb-v2',
        workspace: '/code/hkb-v2',
        baseRef: '19c9365',
        branch: 'main',
        isolate: true,
        brief: `${title}\n\nA run seeded by npm run e2e, started --gate plan --gate build: plan was approved, and build awaits its own approval.`,
        workflowDir: dir,
        workflow: [
          { name: 'plan', after: [], body: 'Plan it.', harness: 'claude' },
          { name: 'build', after: ['plan'], body: 'Build the plan.', harness: 'claude' },
          { name: 'ship', after: ['build'], body: 'Ship what was built.', harness: 'claude' },
        ],
        gates: ['plan', 'build'],
        createdAt: ago(planEnded + 1),
        steps: { plan: record('plan'), build: record('build'), ship: { taskId: null } },
      },
      null,
      2,
    ),
  );
  write(path.join(root, 'runs', `${id}.asks`, 'approve-plan-1'), `${JSON.stringify({ step: 'plan', try: 1, at: ago(approved) })}\n`);
  const journal = (step: string, filed: number, ended: number, summary: string) =>
    write(
      path.join(root, 'engine', 'tasks', `${id}-${step}.jsonl`),
      lines([
        { kind: 'filed', at: ago(filed), brief: summary, cwd: lane(step), maxAttempts: 1, harness: 'claude' },
        { kind: 'starting', at: ago(filed), attempt: 1 },
        { kind: 'spawned', at: ago(filed), attempt: 1 },
        {
          kind: 'ended',
          at: ago(ended),
          attempt: 1,
          sessionId: `ae/${id}-${step}/1`,
          observed: 'done',
          reason: 'harness',
          closeout: { outcome: 'done', summary, needs: null, artifacts: [] },
        },
        { kind: 'settled', at: ago(ended), outcome: 'succeeded' },
      ]),
    );
  journal('plan', planEnded + 1, planEnded, 'The plan, in two steps.');
  journal('build', approved, buildEnded, 'Built as planned.');
}

/**
 * Write the fake run into `root`, which becomes the api's WF_ROOT, with NEIGHBOUR, LOOPING, HELD, GATED, COSTLY, and last the three runs
 * whose result is a decision (`seedDecisions`), newest, whose cards take the cells after every other run's. Times are minutes before
 * `now`. A task's end records the session's own id (`nativeId`) for a harness that has one, which the engine reads a transcript by.
 *
 * FAKE's repository is named as the other runs' is, so the Factory's card reads the same. tokens runs beside implement, so it has a
 * worktree of its own, which theme, its only follower, works in. implement signed off blocked, its conversation on disk (SESSION);
 * review's task has no journal at all, which is what makes it `unknown`. tokens' files are in its files directory beside the run's
 * record, named by absolute path in its closeout as a step is told to name them, with a path on its branch beside them. theme's check is
 * filed on the check harness: its process exited 1, the engine wrote the code down with the attempt's end, and the harness's worker left a
 * run file and the output with the exit code printed last, its stderr in a file of its own beside the run records.
 *
 * NEIGHBOUR's plan signed off with no check, draft's session started after it and has not ended, and sketch failed. draft is an attached
 * session at work (`attachedRun`), its say file read by run.ts, its conversation so far on disk.
 *
 * LOOPING's review loops back to implement, on round 3: each step's place holds its round-3 task and a try behind it for each round
 * before, a task the engine ran once, moved there with `cause: 'round'` as the run moves it when it files a round. review's `rounds` is
 * what the parser sets for a loop that does not say. A declared field is a field of the closeout, beside the four every closeout has:
 * implement answers the findings it was handed, as a loop's target owes from round 2, and each review asks for another round.
 *
 * HELD's implement was spawned and never ended, its session is an attached one at work (`attachedRun`), and its conversation ends on
 * the harness's line; review waits on it, not filed. GATED's plan signed off at the gate the run was started with, filed as the run started
 * and signed off a few seconds later, sooner than the minute FAKE's steps take from filing to spawn; implement waits on it, not filed.
 *
 * COSTLY's tokens is over its own budget, and review's loop is held on implement's. Each session's attempt carries what the engine read of
 * it — its cost, and the time its harness counted waiting on the model and running tools — except review's, on Codex, which prices
 * nothing: it reports its input's reads from the cache and writes none, so its usage has the classes and no peak. From round 2,
 * implement gives its answers to the findings it was handed. palette signed off blocked, having spent more than its cap to get there: a
 * question for a person, and a budget to raise with the answer.
 */
export function seed(root: string, now = Date.now()): void {
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const { id } = FAKE;
  const workflowDir = path.join(root, FAKE.workflow);
  for (const step of STEPS) write(path.join(workflowDir, step.file), step.text);

  const workspace = path.join(root, 'worktrees', id, 'implement');
  const branch = `wf/${id}/implement`;
  const lane = path.join(root, 'worktrees', id, 'tokens');
  const laneBranch = FAKE.branch;
  const check = `${id}-theme-check`;
  const repo = path.join(root, 'hkb-v2');
  const baseRef = seedRepo(repo, laneBranch);
  const ledger = (kind: string, name: string, upTo: number): void =>
    write(
      path.join(root, 'revisions', kind, `${name}.json`),
      JSON.stringify(
        Array.from({ length: upTo }, (_, i) => ({ n: i + 1, hash: `${name}${i + 1}`.padEnd(16, '0'), at: ago(60 - i) })),
        null,
        2,
      ),
    );
  ledger('agent', 'coder', 6);
  ledger('skill', 'look', 2);
  write(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify(
      {
        id,
        repo,
        workspace: repo,
        baseRef,
        branch: 'main',
        isolate: true,
        brief: `${FAKE.title}\n\nA run seeded by npm run e2e: implement signed off blocked, the engine has no record of review's task, and respond is not filed; tokens signed off with no check, and theme's check refused.`,
        workflowDir,
        workflow: STEPS.map((step) => step.frozen),
        createdAt: ago(42),
        pinned: [
          { kind: 'agent', name: 'coder', n: 5, hash: 'coder5'.padEnd(16, '0') },
          { kind: 'skill', name: 'look', n: 1, hash: 'look1'.padEnd(16, '0') },
        ],
        steps: {
          implement: { taskId: `${id}-implement`, workspace, branch },
          /** implement's only follower, so it works in implement's workspace, on its branch. */
          review: { taskId: `${id}-review`, workspace, branch },
          respond: { taskId: null },
          tokens: {
            taskId: `${id}-tokens`,
            workspace: lane,
            branch: laneBranch,
            pinned: [{ kind: 'agent', name: 'coder', n: 4, hash: 'coder4'.padEnd(16, '0') }],
          },
          theme: { taskId: `${id}-theme`, workspace: lane, branch: laneBranch, check: { taskId: check } },
        },
      },
      null,
      2,
    ),
  );

  const signedOff = (
    task: string,
    harness: string,
    cwd: string,
    brief: string,
    began: number,
    ended: number,
    closeout: object,
    nativeId?: string,
    usage?: object,
    denials?: readonly object[],
    skills?: readonly string[],
  ): void =>
    write(
      path.join(root, 'engine', 'tasks', `${task}.jsonl`),
      lines([
        { kind: 'filed', at: ago(began), brief, cwd, maxAttempts: 1, harness },
        { kind: 'starting', at: ago(began - 1), attempt: 1 },
        { kind: 'spawned', at: ago(began - 1), attempt: 1 },
        {
          kind: 'ended',
          at: ago(ended),
          attempt: 1,
          sessionId: `ae/${task}/1`,
          ...(nativeId ? { nativeId } : {}),
          observed: 'done',
          reason: 'harness',
          closeout,
          ...(usage ? { usage } : {}),
          ...(denials ? { denials } : {}),
          ...(skills ? { skills } : {}),
        },
        { kind: 'settled', at: ago(ended), outcome: 'succeeded' },
      ]),
    );

  signedOff(`${id}-implement`, 'claude', workspace, SESSION.prompt, 42, 12, SESSION.closeout, SESSION.sessionId);
  write(path.join(root, 'claude', 'projects', '-code-hkb-v2', `${SESSION.sessionId}.jsonl`), lines(conversation(SESSION, ago)));
  const files = path.join(root, 'runs', id, 'artifacts', FAKE.unverified);
  write(path.join(files, FAKE.artifacts.image), palette());
  write(path.join(files, FAKE.artifacts.text), 'sky blue emerald amber orange red neutral violet teal rose\n');
  const tokensCloseout = {
    apiVersion: 'nemia/v1',
    outcome: 'done',
    summary: FAKE.envelope.summary,
    body: FAKE.envelope.body,
    needs: null,
    artifacts: [
      { path: path.join(files, FAKE.artifacts.image) },
      { path: path.join(files, FAKE.artifacts.text) },
      { path: FAKE.artifacts.path },
      FAKE.envelope.value,
    ],
  };
  signedOff(`${id}-tokens`, 'codex', lane, 'Pick the colour tokens.', 40, 30, tokensCloseout, undefined, {
    responses: 14,
    toolCalls: 31,
    inputTokens: 112_000,
    outputTokens: 6_350,
  });
  signedOff(
    `${id}-theme`,
    'claude',
    lane,
    'Apply them to every page.',
    30,
    10,
    { outcome: 'done', summary: `${FAKE.envelope.v0.first}\n\n${FAKE.envelope.v0.more}`, needs: null, artifacts: [] },
    undefined,
    undefined,
    FAKE.denied.denials,
    FAKE.skills,
  );

  write(
    path.join(root, 'engine', 'tasks', `${check}.jsonl`),
    lines([
      { kind: 'filed', at: ago(10), brief: FAKE.check, cwd: lane, maxAttempts: 1, harness: 'check' },
      { kind: 'starting', at: ago(10), attempt: 1 },
      { kind: 'spawned', at: ago(10), attempt: 1 },
      { kind: 'ended', at: ago(7), attempt: 1, sessionId: `ae/${check}/1`, observed: 'failed', reason: 'harness', exitCode: 1 },
      { kind: 'settled', at: ago(7), outcome: 'failed' },
    ]),
  );
  const session = `ae/${check}/1`;
  const base = path.join(root, 'engine', 'runs', 'check', session.replace(/[^a-zA-Z0-9]+/g, '_'));
  write(`${base}.json`, JSON.stringify({ name: session, state: 'done', pid: 0, heartbeatAt: ago(7), logFile: `${base}.log`, exitCode: 1 }));
  const checkStdout = `ok 6 - the Factory shows a run in flight\n${FAKE.said}\n# tests 7\n# fail 1\n`;
  const checkStderr = 'npm error Lifecycle script `e2e` failed with error:\nnpm error code 1\n';
  write(`${base}.log`, `${checkStdout}${checkStderr}`);
  write(`${base}.stdout`, checkStdout);
  write(`${base}.stderr`, checkStderr);

  const besideDir = path.join(root, 'workflow-beside');
  write(path.join(besideDir, 'plan.md'), '---\nplace: git\nharness: claude\n---\nPlan it.\n');
  write(path.join(besideDir, 'draft.md'), '---\nplace: git\nharness: claude\nafter: plan\n---\nDraft it.\n');
  write(path.join(besideDir, 'sketch.md'), '---\nplace: git\nharness: codex\n---\nSketch it.\n');
  write(path.join(besideDir, 'ship.md'), '---\nplace: git\nharness: claude\nafter: sketch\n---\nShip it.\n');
  write(
    path.join(root, 'runs', `${NEIGHBOUR.id}.json`),
    JSON.stringify(
      {
        id: NEIGHBOUR.id,
        repo: '/code/hkb-v2',
        workspace: '/code/hkb-v2',
        baseRef: '19c9365',
        branch: 'main',
        isolate: true,
        brief: `${NEIGHBOUR.title}\n\nA second run seeded by npm run e2e: plan signed off and draft's session still runs, while sketch failed — the card beside the first.`,
        workflowDir: besideDir,
        workflow: [
          { name: 'plan', after: [], body: 'Plan it.', harness: 'claude' },
          {
            name: 'draft',
            after: ['plan'],
            body: 'Draft it.',
            harness: 'claude',
            agent: { name: NEIGHBOUR.agent, keys: [], body: 'Draft it.', given: {} },
          },
          { name: 'sketch', after: [], body: 'Sketch it.', harness: 'codex' },
          { name: 'ship', after: ['sketch'], body: 'Ship it.', harness: 'claude' },
        ],
        createdAt: ago(5),
        steps: {
          plan: { taskId: `${NEIGHBOUR.id}-plan` },
          draft: { taskId: `${NEIGHBOUR.id}-draft` },
          sketch: { taskId: `${NEIGHBOUR.id}-sketch` },
          ship: { taskId: null },
        },
      },
      null,
      2,
    ),
  );
  signedOff(`${NEIGHBOUR.id}-plan`, 'claude', '/code/hkb-v2', 'Plan it.', 5, 3, {
    outcome: 'done',
    summary: 'Planned it.',
    needs: null,
    artifacts: [],
  });
  write(
    path.join(root, 'engine', 'tasks', `${NEIGHBOUR.id}-draft.jsonl`),
    lines([
      { kind: 'filed', at: ago(3), brief: 'Draft it.', cwd: '/code/hkb-v2', maxAttempts: 1 },
      { kind: 'starting', at: ago(2.5), attempt: 1 },
      { kind: 'spawned', at: ago(2.5), attempt: 1 },
    ]),
  );
  const draft = `ae/${SAYING.run}-${SAYING.step}/1`;
  write(attachedFiles(root, draft).run, attachedRun(draft, SAYING.sessionId, 'working', ago(2.5)));
  write(path.join(root, DRAFT_TRANSCRIPT), lines(draftConversation(ago)));
  write(
    path.join(root, 'engine', 'tasks', `${NEIGHBOUR.id}-sketch.jsonl`),
    lines([
      { kind: 'filed', at: ago(5), brief: 'Sketch it.', cwd: '/code/hkb-v2', maxAttempts: 1 },
      { kind: 'starting', at: ago(4), attempt: 1 },
      { kind: 'spawned', at: ago(4), attempt: 1 },
      { kind: 'ended', at: ago(2), attempt: 1, sessionId: `ae/${NEIGHBOUR.id}-sketch/1`, observed: 'failed', reason: 'harness' },
      { kind: 'settled', at: ago(2), outcome: 'failed' },
    ]),
  );

  const loopDir = path.join(root, 'workflow-loop');
  const again = { type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false };
  write(path.join(loopDir, 'implement.md'), '---\nplace: git\nharness: claude\n---\nImplement it.\n');
  write(
    path.join(loopDir, 'review.md'),
    '---\nplace: git\nharness: codex\nafter: implement\nloop: implement\noutput: review.json\n---\nReview it, and say whether it needs another round.\n',
  );
  write(path.join(loopDir, 'review.json'), `${JSON.stringify(again, null, 2)}\n`);
  const loopWorkspace = path.join(root, 'worktrees', LOOPING.id, 'implement');
  const loopBranch = `wf/${LOOPING.id}/implement`;
  const roundTask = (name: string, round: number) => `${LOOPING.id}-${name}-${round}`;
  write(
    path.join(root, 'runs', `${LOOPING.id}.json`),
    JSON.stringify(
      {
        id: LOOPING.id,
        repo: '/code/hkb-v2',
        workspace: '/code/hkb-v2',
        baseRef: '19c9365',
        branch: 'main',
        isolate: true,
        brief: `${LOOPING.title}\n\nA third run seeded by npm run e2e: review loops back to implement, and asked for another round on the last of the three a loop runs.`,
        workflowDir: loopDir,
        workflow: [
          { name: 'implement', after: [], body: 'Implement it.', harness: 'claude' },
          {
            name: 'review',
            after: ['implement'],
            body: 'Review it, and say whether it needs another round.',
            harness: 'codex',
            loop: 'implement',
            rounds: 3,
            output: { file: 'review.json', schema: again },
          },
        ],
        createdAt: ago(4),
        steps: Object.fromEntries(
          LOOPING.steps.map((name) => [
            name,
            {
              taskId: roundTask(name, 3),
              workspace: loopWorkspace,
              branch: loopBranch,
              tries: [1, 2].map((round) => ({ taskId: roundTask(name, round), cause: 'round' })),
            },
          ]),
        ),
      },
      null,
      2,
    ),
  );
  signedOff(roundTask('implement', 3), 'claude', loopWorkspace, 'Implement it.', 3.9, 2.5, {
    outcome: 'done',
    summary: 'Answered the second review.',
    needs: null,
    artifacts: [],
    replies: [
      {
        finding: 'apps/web/src/lib/status.ts — a word it does not know reads as working',
        answer: "won't fix",
        why: 'On purpose, and a test says so.',
      },
    ],
  });
  signedOff(roundTask('review', 3), 'codex', loopWorkspace, 'Review it, and say whether it needs another round.', 2.4, 0.5, {
    outcome: 'done',
    summary: 'One finding is still open.',
    needs: null,
    artifacts: [],
    again: true,
  });
  const ranOnce = (task: string, harness: string, brief: string, began: number, ended: number, closeout: object): void =>
    write(
      path.join(root, 'engine', 'tasks', `${task}.jsonl`),
      lines([
        { kind: 'filed', at: ago(began), brief, cwd: loopWorkspace, maxAttempts: 1, harness },
        { kind: 'starting', at: ago(began), attempt: 1 },
        { kind: 'spawned', at: ago(began), attempt: 1 },
        { kind: 'ended', at: ago(ended), attempt: 1, sessionId: `ae/${task}/1`, observed: 'done', reason: 'harness', closeout },
        { kind: 'settled', at: ago(ended), outcome: 'succeeded' },
      ]),
    );
  const said = (summary: string, more: object = {}) => ({ outcome: 'done', summary, needs: null, artifacts: [], ...more });
  const [first, second] = LOOPING.earlier;
  ranOnce(roundTask('implement', 1), 'claude', 'Implement it.', 3.99, 3.7, said(first.implement));
  ranOnce(
    roundTask('review', 1),
    'codex',
    'Review it, and say whether it needs another round.',
    3.69,
    3.5,
    said(first.review, { again: true }),
  );
  ranOnce(roundTask('implement', 2), 'claude', 'Implement it.', 3.49, 3.2, said(second.implement, { replies: LOOPING.replies }));
  ranOnce(
    roundTask('review', 2),
    'codex',
    'Review it, and say whether it needs another round.',
    3.19,
    3.0,
    said(second.review, { again: true }),
  );

  const heldDir = path.join(root, 'workflow-held');
  write(path.join(heldDir, 'implement.md'), '---\nplace: git\nharness: claude\n---\nImplement it.\n');
  write(path.join(heldDir, 'review.md'), '---\nplace: git\nharness: claude\nafter: implement\n---\nReview it.\n');
  const heldTask = `${HELD.id}-implement`;
  write(
    path.join(root, 'runs', `${HELD.id}.json`),
    JSON.stringify(
      {
        id: HELD.id,
        repo: '/code/hkb-v2',
        workspace: '/code/hkb-v2',
        baseRef: '19c9365',
        branch: 'main',
        isolate: true,
        brief: `${HELD.title}\n\nA fourth run seeded by npm run e2e: implement's session is at work, its conversation ending on the login refresh race.`,
        workflowDir: heldDir,
        workflow: [
          { name: 'implement', after: [], body: 'Implement it.', harness: 'claude' },
          { name: 'review', after: ['implement'], body: 'Review it.', harness: 'claude' },
        ],
        createdAt: ago(3),
        steps: { implement: { taskId: heldTask, workspace: '/code/hkb-v2', branch: `wf/${HELD.id}/implement` }, review: { taskId: null } },
      },
      null,
      2,
    ),
  );
  write(
    path.join(root, 'engine', 'tasks', `${heldTask}.jsonl`),
    lines([
      { kind: 'filed', at: ago(3), brief: 'Implement it.', cwd: '/code/hkb-v2', maxAttempts: 1, harness: 'claude' },
      { kind: 'starting', at: ago(2.9), attempt: 1 },
      { kind: 'spawned', at: ago(2.9), attempt: 1 },
    ]),
  );
  const held = `ae/${heldTask}/1`;
  write(attachedFiles(root, held).run, attachedRun(held, HELD.sessionId, 'working', ago(2.9)));
  write(path.join(root, 'claude', 'projects', '-code-hkb-v2', `${HELD.sessionId}.jsonl`), lines(heldConversation(ago)));

  const gateDir = path.join(root, 'workflow-gate');
  const planSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['approach', 'files', 'steps', 'risks'],
    properties: {
      approach: { type: 'string' },
      files: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: { path: { type: 'string' }, change: { type: 'string' } },
          required: ['path', 'change'],
        },
      },
      steps: { type: 'array', items: { type: 'string' } },
      risks: { type: 'array', items: { type: 'string' } },
    },
  };
  write(path.join(gateDir, 'plan.md'), '---\nplace: git\nharness: claude\noutput: plan.json\n---\nPlan it.\n');
  write(path.join(gateDir, 'plan.json'), `${JSON.stringify(planSchema, null, 2)}\n`);
  write(path.join(gateDir, 'implement.md'), '---\nplace: git\nharness: claude\nafter: plan\n---\nImplement the plan.\n');
  const gatedPlan = `${GATED.id}-plan`;
  const gatedLane = path.join(root, 'worktrees', GATED.id, 'plan');
  write(
    path.join(root, 'runs', `${GATED.id}.json`),
    JSON.stringify(
      {
        id: GATED.id,
        repo: '/code/hkb-v2',
        workspace: '/code/hkb-v2',
        baseRef: '19c9365',
        branch: 'main',
        isolate: true,
        brief: `${GATED.title}\n\nA sixth run seeded by npm run e2e, started --gate plan: plan signed off, and nothing after it is filed until a person approves it.`,
        workflowDir: gateDir,
        workflow: [
          {
            name: 'plan',
            after: [],
            body: `${GATED.planner.instructions}\n\n${GATED.planner.policy}`,
            harness: 'claude',
            output: { file: 'plan.json', schema: planSchema },
            disallowedTools: [GATED.planner.deny],
            agent: {
              name: GATED.planner.name,
              keys: ['disallowedTools'],
              body: GATED.planner.policy,
              given: {},
              instructions: GATED.planner.instructions,
            },
          },
          { name: 'implement', after: ['plan'], body: 'Implement the plan.', harness: 'claude' },
        ],
        gates: [GATED.gated],
        createdAt: ago(1.2),
        steps: { plan: { taskId: gatedPlan, workspace: gatedLane, branch: `wf/${GATED.id}/plan` }, implement: { taskId: null } },
      },
      null,
      2,
    ),
  );
  write(
    path.join(root, 'engine', 'tasks', `${gatedPlan}.jsonl`),
    lines([
      { kind: 'filed', at: ago(1.2), brief: 'Plan it.', cwd: gatedLane, maxAttempts: 1, harness: 'claude' },
      { kind: 'starting', at: ago(1.19), attempt: 1 },
      { kind: 'spawned', at: ago(1.19), attempt: 1 },
      {
        kind: 'ended',
        at: ago(1.1),
        attempt: 1,
        sessionId: `ae/${gatedPlan}/1`,
        observed: 'done',
        reason: 'harness',
        closeout: {
          outcome: 'done',
          summary: `## ${GATED.plan.heading}\n\n${GATED.plan.items.map((item) => `- ${item}`).join('\n')}`,
          needs: null,
          artifacts: [],
          ...GATED.output,
        },
      },
      { kind: 'settled', at: ago(1.1), outcome: 'succeeded' },
    ]),
  );

  const costDir = path.join(root, 'workflow-cost');
  write(path.join(costDir, 'implement.md'), '---\nplace: git\nharness: claude\nbudget: 2\n---\nImplement it.\n');
  write(
    path.join(costDir, 'review.md'),
    '---\nplace: git\nharness: codex\nafter: implement\nloop: implement\noutput: review.json\n---\nReview it, and say whether it needs another round.\n',
  );
  write(path.join(costDir, 'review.json'), `${JSON.stringify(again, null, 2)}\n`);
  write(path.join(costDir, 'tokens.md'), '---\nplace: git\nharness: claude\nbudget: 3\ncheck: npm test\n---\nPick the colour tokens.\n');
  write(path.join(costDir, 'palette.md'), '---\nplace: git\nharness: claude\nbudget: 1\n---\nPick the palette for the dark theme.\n');
  const cost = (name: string) => `${COSTLY.id}-${name}`;
  const costLane = path.join(root, 'worktrees', COSTLY.id, 'implement');
  const tokensLane = path.join(root, 'worktrees', COSTLY.id, 'tokens');
  const paletteLane = path.join(root, 'worktrees', COSTLY.id, 'palette');
  write(
    path.join(root, 'runs', `${COSTLY.id}.json`),
    JSON.stringify(
      {
        id: COSTLY.id,
        repo: '/code/hkb-v2',
        workspace: '/code/hkb-v2',
        baseRef: '19c9365',
        branch: 'main',
        isolate: true,
        brief: `${COSTLY.title}\n\nA fifth run seeded by npm run e2e: tokens' tries cost more than its budget, and review's loop would file implement again past its own.`,
        workflowDir: costDir,
        workflow: [
          { name: 'implement', after: [], body: 'Implement it.', harness: 'claude', budget: 2 },
          {
            name: 'review',
            after: ['implement'],
            body: 'Review it, and say whether it needs another round.',
            harness: 'codex',
            loop: 'implement',
            rounds: 3,
            output: { file: 'review.json', schema: again },
          },
          { name: 'tokens', after: [], body: 'Pick the colour tokens.', harness: 'claude', budget: 3, check: 'npm test', context: 200_000 },
          { name: 'palette', after: [], body: 'Pick the palette for the dark theme.', harness: 'claude', budget: 1 },
        ],
        createdAt: ago(1.5),
        steps: {
          implement: {
            taskId: cost('implement-2'),
            workspace: costLane,
            branch: `wf/${COSTLY.id}/implement`,
            tries: [{ taskId: cost('implement-1'), cause: 'round' }],
          },
          review: {
            taskId: cost('review-2'),
            workspace: costLane,
            branch: `wf/${COSTLY.id}/implement`,
            tries: [{ taskId: cost('review-1'), cause: 'round' }],
          },
          tokens: {
            taskId: cost('tokens-try2'),
            workspace: tokensLane,
            branch: `wf/${COSTLY.id}/tokens`,
            check: { taskId: cost('tokens-try2-check') },
            tries: [{ taskId: cost('tokens'), check: { taskId: cost('tokens-check') }, cause: 'nudge' }],
          },
          palette: { taskId: cost('palette'), workspace: paletteLane, branch: `wf/${COSTLY.id}/palette` },
        },
      },
      null,
      2,
    ),
  );
  const priced = (
    task: string,
    harness: string,
    cwd: string,
    brief: string,
    at: readonly [number, number, number],
    closeout: object,
    usage: object,
    resumeFrom?: string,
  ): void =>
    write(
      path.join(root, 'engine', 'tasks', `${task}.jsonl`),
      lines([
        { kind: 'filed', at: ago(at[0]), brief, cwd, maxAttempts: 1, harness },
        { kind: 'starting', at: ago(at[1]), attempt: 1, ...(resumeFrom ? { resumeFrom } : {}) },
        { kind: 'spawned', at: ago(at[1]), attempt: 1 },
        { kind: 'ended', at: ago(at[2]), attempt: 1, sessionId: `ae/${task}/1`, observed: 'done', reason: 'harness', closeout, usage },
        { kind: 'settled', at: ago(at[2]), outcome: 'succeeded' },
      ]),
    );
  const refused = (task: string, cwd: string, at: readonly [number, number]): void => {
    write(
      path.join(root, 'engine', 'tasks', `${task}.jsonl`),
      lines([
        { kind: 'filed', at: ago(at[0]), brief: 'npm test', cwd, maxAttempts: 1, harness: 'check' },
        { kind: 'starting', at: ago(at[0]), attempt: 1 },
        { kind: 'spawned', at: ago(at[0]), attempt: 1 },
        { kind: 'ended', at: ago(at[1]), attempt: 1, sessionId: `ae/${task}/1`, observed: 'failed', reason: 'harness', exitCode: 1 },
        { kind: 'settled', at: ago(at[1]), outcome: 'failed' },
      ]),
    );
    const name = `ae/${task}/1`;
    const base = path.join(root, 'engine', 'runs', 'check', name.replace(/[^a-zA-Z0-9]+/g, '_'));
    write(`${base}.json`, JSON.stringify({ name, state: 'done', pid: 0, heartbeatAt: ago(at[1]), logFile: `${base}.log`, exitCode: 1 }));
    const said = 'ok 1 - sky is a colour\nnot ok 2 - rose is a colour\n# tests 2\n# fail 1\n';
    const stderr = 'npm error Lifecycle script `test` failed with error:\nnpm error code 1\n';
    write(`${base}.log`, `${said}${stderr}`);
    write(`${base}.stdout`, said);
    write(`${base}.stderr`, stderr);
  };
  const done = (summary: string, more: object = {}) => ({ outcome: 'done', summary, needs: null, artifacts: [], ...more });
  const unpriced = {
    toolCalls: 12,
    inputTokens: 210_000,
    cacheReadTokens: 180_000,
    cacheWriteTokens: 0,
    uncachedTokens: 30_000,
    outputTokens: 3_100,
  };
  priced(cost('implement-1'), 'claude', costLane, 'Implement it.', [1.49, 1.48, 1.35], done('Implemented it.'), {
    responses: 22,
    toolCalls: 48,
    inputTokens: 1_840_000,
    cacheReadTokens: 1_700_000,
    cacheWriteTokens: 139_990,
    uncachedTokens: 10,
    peakContextTokens: 142_000,
    firstContextTokens: 20_010,
    firstCacheWriteTokens: 20_000,
    outputTokens: 21_400,
    costUsd: 1.2,
    apiMs: 312_000,
    toolMs: 41_000,
  });
  priced(
    cost('review-1'),
    'codex',
    costLane,
    'Review it, and say whether it needs another round.',
    [1.35, 1.34, 1.25],
    done('Two findings.', { again: true }),
    unpriced,
  );
  priced(
    cost('implement-2'),
    'claude',
    costLane,
    'Implement it.',
    [1.25, 1.24, 1.1],
    done('Answered the review.', {
      replies: [
        { finding: 'apps/web/src/lib/cost.ts — a cost nobody measured reads $0.00', answer: 'fixed', why: 'It reads not measured now.' },
      ],
    }),
    {
      responses: 9,
      toolCalls: 17,
      inputTokens: 760_000,
      cacheReadTokens: 700_000,
      cacheWriteTokens: 59_995,
      uncachedTokens: 5,
      peakContextTokens: 150_000,
      firstContextTokens: 20_010,
      firstCacheWriteTokens: 20_000,
      outputTokens: 8_900,
      costUsd: 0.9,
      apiMs: 118_000,
      toolMs: 12_000,
    },
  );
  priced(
    cost('review-2'),
    'codex',
    costLane,
    'Review it, and say whether it needs another round.',
    [1.1, 1.09, 1.0],
    done('One finding is still open.', { again: true }),
    unpriced,
  );
  priced(cost('tokens'), 'claude', tokensLane, 'Pick the colour tokens.', [1.49, 1.48, 1.3], done('Picked the colour tokens.'), {
    responses: 14,
    toolCalls: 31,
    inputTokens: 1_120_000,
    cacheReadTokens: 1_000_000,
    cacheWriteTokens: 119_990,
    uncachedTokens: 10,
    peakContextTokens: 180_000,
    firstContextTokens: 20_010,
    firstCacheWriteTokens: 20_000,
    outputTokens: 16_000,
    costUsd: 1.75,
    apiMs: 402_000,
    toolMs: 22_000,
  });
  refused(cost('tokens-check'), tokensLane, [1.3, 1.25]);
  priced(
    cost('tokens-try2'),
    'claude',
    tokensLane,
    'Pick the colour tokens.',
    [1.24, 1.23, 1.0],
    done('Picked them again.'),
    {
      responses: 18,
      toolCalls: 36,
      inputTokens: 1_530_000,
      cacheReadTokens: 1_320_000,
      cacheWriteTokens: 209_990,
      uncachedTokens: 10,
      peakContextTokens: 173_584,
      firstContextTokens: 180_010,
      firstCacheWriteTokens: 180_000,
      compactions: 1,
      outputTokens: 19_700,
      costUsd: 2.5,
      apiMs: 560_000,
      toolMs: 31_000,
    },
    `ae/${cost('tokens')}/1`,
  );
  refused(cost('tokens-try2-check'), tokensLane, [1.0, 0.95]);
  priced(
    cost('palette'),
    'claude',
    paletteLane,
    'Pick the palette for the dark theme.',
    [1.49, 1.48, 1.2],
    {
      outcome: 'blocked',
      summary: 'Drafted a warm palette and a cool one, and cannot choose between them.',
      needs: COSTLY.asks.needs,
      artifacts: [],
    },
    {
      responses: 11,
      toolCalls: 19,
      inputTokens: 980_000,
      cacheReadTokens: 820_000,
      cacheWriteTokens: 159_995,
      uncachedTokens: 5,
      peakContextTokens: 231_000,
      firstContextTokens: 20_010,
      firstCacheWriteTokens: 20_000,
      outputTokens: 12_300,
      costUsd: 1.5,
      apiMs: 290_000,
      toolMs: 9_000,
    },
  );

  seedDecisions(root, repo, baseRef, now);
}

/** A field of questions as the loader expands `"x-shape": "questions"`, and the run freezes it: the web imports no package. */
export const ASKED = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'The question, in one line. Unique among these questions.' },
      body: { type: 'string', description: 'What the person needs to know to answer it: the context, and what depends on the answer.' },
      options: {
        type: 'array',
        description: 'The answers you see, at least one. The person may also answer in their own words.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'The option, in a few words. Unique among this question’s options.' },
            meaning: { type: 'string', description: 'What choosing it means: what you would do, and what it costs.' },
          },
          required: ['label', 'meaning'],
          additionalProperties: false,
        },
      },
      recommended: { type: ['string', 'null'], description: 'The label of the option you recommend, or null for none.' },
      multiple: { type: 'boolean', description: 'Whether several options may be chosen together.' },
    },
    required: ['title', 'body', 'options', 'recommended', 'multiple'],
    additionalProperties: false,
  },
  description: 'What is still undecided.',
};

/**
 * A run whose steps ask a person questions as data, written by a page for its visit and taken back before it ends (`writeAsking`): `design`
 * waits at its gate having asked two — one that takes a single answer and recommends one, one that takes several and recommends none —
 * and `palette` signed off blocked past its budget of $1, having spent $1.50, asking one.
 */
export const ASKING = {
  id: 'gate-questions-e2e',
  title: 'Questions at a gate',
  gated: 'design',
  raised: 'palette',
  needs: 'One question before the palette is picked.',
  note: 'Cut the terminal to its own card.',
  objection: 'Smaller: the shape alone.',
  spent: '$1.50',
  cut: {
    title: 'How is the card cut?',
    body: 'It is **big**: the shape, the board and the terminal.',
    options: [
      { label: 'Shape first', meaning: 'The shape and the board now, the terminal later.' },
      { label: 'All at once', meaning: 'One card, three times the review.' },
    ],
    recommended: 'Shape first',
    multiple: false,
  },
  where: {
    title: 'Where do the answers go?',
    body: 'Either, or both.',
    options: [
      { label: 'Into the retry', meaning: 'The next try is told them.' },
      { label: 'With the approval', meaning: 'A gate carries them.' },
    ],
    recommended: null,
    multiple: true,
  },
  tone: {
    title: 'Warm colours, or cool ones?',
    body: 'Both palettes are drafted; the dark theme takes one.',
    options: [
      { label: 'Warm', meaning: 'Amber and rose, as the board has now.' },
      { label: 'Cool', meaning: 'Slate and teal, quieter at night.' },
    ],
    recommended: 'Cool',
    multiple: false,
  },
} as const;

/**
 * Writes ASKING into the store at `root` — its record, its folder and its two tasks, each ended once with the closeout it gave, flat as a
 * harness writes it, palette's with what it cost — and answers every path written, to take back.
 */
export function writeAsking(root: string, now = Date.now()): string[] {
  const { id, gated, raised } = ASKING;
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const dir = path.join(root, 'workflow-gate-questions');
  const schema = { type: 'object', properties: { open: ASKED }, required: ['open'], additionalProperties: false };
  const task = (step: string) => path.join(root, 'engine', 'tasks', `${id}-${step}.jsonl`);
  const ran = (step: string, began: number, closeout: object, usage?: object) =>
    write(
      task(step),
      lines([
        { kind: 'filed', at: ago(began), brief: `Do ${step}.`, cwd: '/code/hkb-v2', maxAttempts: 1, harness: 'claude' },
        { kind: 'starting', at: ago(began - 0.1), attempt: 1 },
        { kind: 'spawned', at: ago(began - 0.1), attempt: 1 },
        {
          kind: 'ended',
          at: ago(began - 2),
          attempt: 1,
          sessionId: `ae/${id}-${step}/1`,
          observed: 'done',
          reason: 'harness',
          closeout,
          ...(usage ? { usage } : {}),
        },
        { kind: 'settled', at: ago(began - 2), outcome: 'succeeded' },
      ]),
    );
  ran(gated, 9, {
    outcome: 'done',
    summary: 'The design, two questions left open.',
    needs: null,
    artifacts: [],
    open: [ASKING.cut, ASKING.where],
  });
  ran(
    raised,
    6,
    { outcome: 'blocked', summary: 'Drafted a warm palette and a cool one.', needs: ASKING.needs, artifacts: [], open: [ASKING.tone] },
    {
      responses: 11,
      toolCalls: 19,
      inputTokens: 980_000,
      cacheReadTokens: 820_000,
      cacheWriteTokens: 159_995,
      uncachedTokens: 5,
      peakContextTokens: 131_000,
      firstContextTokens: 20_010,
      firstCacheWriteTokens: 20_000,
      outputTokens: 12_300,
      costUsd: 1.5,
      apiMs: 290_000,
      toolMs: 9_000,
    },
  );
  write(path.join(dir, `${gated}.md`), `---\nplace: git\nharness: claude\noutput: open.schema.json\n---\nDo ${gated}.\n`);
  write(path.join(dir, `${raised}.md`), `---\nplace: git\nharness: claude\nbudget: 1\noutput: open.schema.json\n---\nDo ${raised}.\n`);
  write(
    path.join(dir, 'open.schema.json'),
    `${JSON.stringify({ ...schema, properties: { open: { 'x-shape': 'questions', description: ASKED.description } } }, null, 2)}\n`,
  );
  const output = { file: 'open.schema.json', schema };
  const record = path.join(root, 'runs', `${id}.json`);
  write(
    record,
    JSON.stringify(
      {
        id,
        repo: '/code/hkb-v2',
        workspace: '/code/hkb-v2',
        baseRef: '19c9365',
        branch: 'main',
        isolate: true,
        brief: `${ASKING.title}\n\nA run written by the gate's question pages of npm run e2e, and taken back when they leave.`,
        workflowDir: dir,
        workflow: [
          { name: gated, after: [], body: `Do ${gated}.`, harness: 'claude', output },
          { name: raised, after: [], body: `Do ${raised}.`, harness: 'claude', budget: 1, output },
        ],
        gates: [gated],
        createdAt: ago(10),
        steps: { [gated]: { taskId: `${id}-${gated}` }, [raised]: { taskId: `${id}-${raised}` } },
      },
      null,
      2,
    ),
  );
  return [record, dir, path.join(root, 'runs', id), path.join(root, 'runs', `${id}.asks`), task(gated), task(raised)];
}
