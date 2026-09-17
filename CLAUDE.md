# hkb-v2 — contributor guide

Two packages and two apps. `packages/agent-engine` runs one agent session to completion, durably
(the `ae` CLI; `src/domain.ts` is the whole judgement). `packages/agent-workflows` sequences engine
tasks into runs of steps — a folder of markdown is a workflow (the `wf` CLI). `apps/api` puts the
workflows behind HTTP; `apps/web` talks to it. Dependencies point down that list, never up. Read
`README.md` and each package's README for the model before changing behaviour.

## Check your work

- `npm test` — from the root, turbo runs `node --test test/*.test.ts` in every package
  (181 engine · 169 workflows · 21 api · 33 web at 2026-09-13). Runs from a package directory
  too. Not bare `node --test` from the root: `agent-engine/test/facade.test.ts` is cwd-relative.
  It runs the packages in parallel. Until 2026-09-14 it ran them one at a time: the api's tests asked the machine's
  live `claude agents` registry and died under contention (plan §4b). Every api test file now imports
  `apps/api/test/harness.ts` first — a fake `claude` first on PATH, the harness the api's engine runs — and
  `harness.test.ts` refuses a file that does not, so a new api test file imports it first. Measured parallel three
  times in a row with `npx turbo run test --force`: without `--force` turbo replays a cached pass and measures nothing.
- `npm run typecheck` — `tsc --noEmit` per package. **This is the lint.** There is no eslint or
  biome, on purpose, until one replaces more code than it adds.
- Run both before you commit. Green is the floor, not the bar: a change that makes the suite
  pass by weakening a test is a finding to report, not a fix.
- `npm run build` too when you touch `apps/web`: the router plugin regenerates
  `src/routeTree.gen.ts` only in a vite build, so a new route file fails `typecheck` until
  `build` has run once (learned by the run that added `/runs/$runId`).
- For `apps/web` changes, run `npm run e2e` and read the PNGs it writes before you sign off (`.e2e/`,
  or `$WF_ARTIFACTS` in a run). A new page gets a line in `PAGES` (`apps/web/test/e2e/run.ts`), or
  the check never looks at it. Once per machine, install a browser for each playwright: `npx playwright
  install chromium` for the e2e's, and `node node_modules/@playwright/mcp/cli.js install-browser
  chromium` for the one behind the steps' `browser_*` tools (`.mcp.json`). One build per playwright
  version lives in `~/.cache/ms-playwright`, and these two differ (1.62.1 and a 1.63 alpha). An install
  deletes every build whose playwright is not listed alive in `~/.cache/ms-playwright/.links`, so
  install through the checkout's own `node_modules`, never from an `npx` download. (Learned by the run
  that added the browser, whose install deleted the e2e's builds.)
- **`assert.throws(fn, /^…/)` matches `String(err)`, which starts with `Error: `.** An anchored
  pattern never matches a message; assert on `err.message` (`assert.throws(fn, (e) => /^…/.test(e.message))`).
  Learned by R, whose refusal tests passed for the wrong reason until anchored right.
- **The e2e's watch counts every 4xx a page sees against it.** A refusal the e2e makes on purpose goes
  in a page of its own, with a watch that must see that one refusal and nothing else (the `answer` page,
  learned by the run that added the answer box). And the e2e visits every page in light, then every page
  in dark, so a page that writes to the store takes its write back before it ends.
- **The engine's `transcript` of an attempt still in flight observes its harness** — one `claude agents`
  call per read, since the session's id is on no record yet. Read it on a run's detail, never on the list
  the Factory polls (learned by the run that put a blocked session's last line on the board).
- **Playwright treats a straight SVG edge path as hidden.** A zero-height `<path>` fails
  `toBeVisible()`, so an e2e that waits for an edge to be visible waits for ever; count the edge
  paths instead (learned by the run that animated the edges).
- **The engine's task view carries no filing time; its feed does.** A slot wait is filed → first attempt, so the timeline
  reads filings off `e.feed` (`readFilings`). A store written by hand — the e2e's seed — writes `engine/feed.jsonl` too
  (`seedFeed`), or every queue time reads `not known` (learned by the run that added the timeline).
- **A browser's `requestAnimationFrame` throws when called off another object.** `{ request: requestAnimationFrame }`
  lost every live event of the session stream with no error on the page; call it as `(f) => requestAnimationFrame(f)`
  (`animationFrames`, learned by the say page's e2e).
- **A guard is not proven by a test that asks whether it allows.** Every new refusal — a parser
  key, a value, a tool, a check — gets a test that makes it *refuse*, at shipped defaults. Guards
  that were only ever tested for the allowing case have been silently inert before (hkb's
  admission gate, worktree base and lease each were).
- **A worktree gets a `node_modules` of its own.** Each workspace package (`packages/*`, `apps/*`)
  links to the worktree's copy, so an app change can lean on a package change from the same branch;
  third-party packages link to the main checkout's tree, and `npm install` in a worktree writes the
  worktree's directory, never main's. When the worktree's `package-lock.json` differs from what main
  has on disk, the run does `npm ci` there instead — about a minute, and the brief says so. Two habits
  keep that minute rare: a step that adds a dependency commits the lockfile (`npm install
  --package-lock-only` is enough; the next step's worktree installs it), and after merging such a
  branch, `npm install` on main before the next run, or every worktree cut from it pays the minute
  (main's lockfile ahead of its tree counts as a difference). (U1 hit the linked tree; W2 replaced it.)

## Rules the code keeps

- **The engine is finished.** It runs one workload on one harness; anything that knows about a
  second workload is the upper layer. `decide` (`agent-engine/src/domain.ts`) is pure and stays a
  screen long; `agent-engine/src/index.ts` is the export list and the boundary — `decide` is
  not exported, on purpose. A knob on the workload is a field carried on the task and read by a
  runner, never a callback into `decide`.
- **No `if` in `engine.ts` that belongs in `decide`.** Effectful code applies one decision; the
  judgement lives in the pure function.
- **In agent-workflows, `assess` is pure and `runner.ts` is the only file that imports the
  engine.** `run.ts` reads no disk and calls no engine. `cli.ts` parses, calls, prints.
- **Level-triggered.** A tick reads the world, decides, acts, and carries nothing between passes.
  A guard that only fires on a transition is wrong after a restart.
- **One writer per file.** The tick writes the run record; a person's facts (`.cancelled`, an ask)
  get their own files, composed on read. Two writers doing read-modify-write lose updates — and did.
- **A check that did not finish is not a refusal.** The engine settles a check killed at its
  deadline as `failed` with no exit code, and one the harness stopped as `stopped`; only a
  numeric exit is a verdict on the work (`refusedCheck` in `agent-workflows/src/run.ts`).
  `retries:` spends nothing on it and `wf decide` offers `wf retry <run> <step> --recheck` — use
  that, never a hand edit of the engine's journal or the run record.
- **No command from a checkout.** A `check:` comes from the workflow folder frozen on the run
  record at `wf start`, never from a worktree the step can edit.
- **Prose is not a constraint.** If the packages need an agent to do something, the machinery
  refuses the alternative; a sentence in a brief is a courtesy, not a guarantee.
- **Errors say what to do next.** Throw `Error` with `.exitCode = 2` and a message naming the fix.
- The Kubernetes test for a new field on the engine's task: does `batch/v1` have a field for it?

## Git

- Commit on your branch, in small coherent commits with plain, human messages: a short
  imperative subject, an optional body saying why. **No attribution trailers**, no session URLs.
- **Never push, never merge, never `git branch -D`.** `.claude/settings.json` refuses the first
  and the last; a person merges after a trial merge runs the suite. If you are a workflow step,
  commit as you go all the same: the run commits only what you leave uncommitted, in one commit
  under your step's name, and a person decides what ships. (F's two steps read the old wording as
  "do not commit" and handed off 1,300 lines in one commit each.)

## When you miss

- If you find a rule the code keeps only in a comment, or a trap that cost you time, it belongs
  here. Add it in the same commit — unless a concurrent session owns this file
  (`docs/plan-hold-the-bar.md` §1), then put it in your closeout and the merger adds it.
- If a step fails its check twice, the fix is content — the brief, the workflow folder, this
  file, a test — or a stricter folder. Not a hand edit that nobody records.

## Where things are

- `docs/eval-2026-09-12/REPORT.md` — the evaluation against the four points of *how to hold the
  bar on production agent code*: gaps with `file:line`, the shape agent-workflows should take.
- `docs/plan-hold-the-bar.md` — the handoff plan: packages, owners, definitions of done.
- `packages/agent-engine/docs/open-issues.md` — what is still wrong or half-verified.
- `packages/agent-workflows/docs/features.md` — what is still to build, in order.
- `.codex/rules/git-commit.rules` — lets a Codex step commit its own work in a worktree.
- `.claude/skills/` — the repository's skills, which every step whose tools include `Skill` can use: `look` (ours)
  and `shadcn` (third-party, installed with `npx skills add shadcn/ui --agent claude-code --copy`, pinned by hash in
  `skills-lock.json`; the `migrate-radix-to-base` skill it ships was dropped, the app is on Radix). The shadcn skill
  reads `components.json` from the session's cwd when it loads, and this repository's is `apps/web/components.json`,
  so its CLI runs from `apps/web`. Its Bash commands (`npx shadcn@latest …`) are denied without a prompt in a
  `dontAsk` step unless `.claude/settings.json` allows them; implement steps run in the harness's own mode.
