# The experiments behind the pivot (2026-09-18)

The scripts, labels and results that `docs/pivot-2026-09-18.md` cites. They were written in a scratch
directory during one session and copied here so the evidence outlives it. Nothing here is imported by
the packages or run by `npm test`.

| Folder | What it is |
|---|---|
| `cost/` | The token and cost analysis of §1, over `~/.claude/projects/-home-*--agent-workflows-worktrees-*/*.jsonl` and `~/.agent-workflows/engine/tasks/`. `tx.py` reads one transcript; `corpus.py` the totals and context sizes; `resume.py` and `verify.py` the cold resumes and their cause; `ttl.py` the cache TTLs; `fit2.py` the fitted prices; `fill.py` what fills a context and spend by step and day; `whatif.py` the context-cap counterfactual. |
| `jev/` | Round one's result (`workflow-result.json`), the latency and consistency check (`smoke.mjs`), the finding-to-brief probe (`dataset.py`, `probe.mjs`, `score.py`, `probe-result.json`), the fate of every open finding (`fates.mjs`, `fates.json`), the dispatcher trial (`dispatch.mjs`) and the two GTD runs (`gtd.mjs`, `gtd2.mjs`). `dispatch2.mjs` (2026-09-19) sends the eleven cards Claude filed that day (`cards/`) to Jev, as a title and as the full brief, and `dispatch2-result.json` holds its answers beside the workflow Claude chose and whether the run's branch really touched `apps/web`: from the full brief, 10 of 10 right on the web app and 7 of 11 on the team, every disagreement being a plan step Jev wanted and Claude skipped; from the title alone, every card lands in the unsure band. |
| `jev-design/` | Round two: `MEASURED.md` (what the designers were handed), `result.json` (the four designs and both skeptics, in full), and one folder per track with its scripts, labels and scored results. `skeptic-measurement/` is the skeptic's own re-check on terse cards. |

**Left out, on purpose:** `node_modules` and lockfiles; raw judgment logs and datasets over 600 KB
(`context/judgments.jsonl`, `results-record.json`, `results-replay.json`, `files_dataset.json`,
`decls_dataset.json`, `effect/judgments.jsonl`, `effect/hostile.jsonl`, `supervisor/tasks.json`);
the designers' saved copies of TypeSafe's documentation; and everything sampled from the owner's own
session transcripts (`supervisor/sample-3f69.txt`, `operator-asks.json`, `ask-rows.json`). So the
context track's scoring, the effect track's hermetic replay and the supervisor track's E2 cannot be
re-run from this folder alone; their scored tables are here.

**To run anything that calls Jev:** in a directory outside the repository,
`npm init -y && npm install @typesafe-ai/sdk effect@4.0.0-rc.115`, then
`node --env-file=<repo>/.env <script>`. The key is `TYPESAFE_API_KEY`; no file here contains it. The
scripts carry the absolute paths of the machine they ran on. The model was pinned to `jev-1.13.0`.
Everything sent to TypeSafe was this project's own briefs, findings, closeouts and step markdown;
its retention terms had not been read (§8 of the pivot document).

## `jev/judge-runs-2026-09-19.*` — the judge scored against 75 dispatches already made

`judge runs` (packages/agent-judge), live on the owner's store on 19 September: 74 requests, 296 questions, 136,503 input
tokens, 17 s, no failed answer, well under a cent. The label is the folder a person chose; it is agreement, not accuracy.

- **web** — judge P 0.83 R 1.00 with 4 unsure; the rival (`apps/web` or `apps/api` named) P 0.71 R 1.00. All six of the
  judge's "false positives" were the PERSON's: the inbox menu, the runs page sort, the floor fix, the quota's backoff, P2's
  first slice and the Output tab each changed `apps/web` or the api and were filed on a folder without `-build` (since P0.6
  `dev` builds when the work touches an app, so the label stopped meaning "web"). Read that way the judge was right 35 of 35.
- **plan** — weak. Runs the person planned: median P 0.95. Runs they did not: median 0.64, and 15 of 58 at 0.8 or above. At
  0.8 / 0.2 the judge is unsure on 44 of 75. No single cut separates them (0.8: P 0.50 R 0.88). The question leans yes on
  almost any long brief — and the owner's own reading of that week is that most of those runs should have had a plan: the
  quota-by-statusline run, the one they named, reads P 0.88.
- **the whole folder** — judge 13 of 75 agree, 46 kept in the inbox; rival 35 of 75. As a dispatcher at these thresholds it
  would have parked most cards, nearly all on the plan question.
