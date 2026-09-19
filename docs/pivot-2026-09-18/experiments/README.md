# The experiments behind the pivot (2026-09-18)

The scripts, labels and results that `docs/pivot-2026-09-18.md` cites. They were written in a scratch
directory during one session and copied here so the evidence outlives it. Nothing here is imported by
the packages or run by `npm test`.

| Folder | What it is |
|---|---|
| `cost/` | The token and cost analysis of §1, over `~/.claude/projects/-home-*--agent-workflows-worktrees-*/*.jsonl` and `~/.agent-workflows/engine/tasks/`. `tx.py` reads one transcript; `corpus.py` the totals and context sizes; `resume.py` and `verify.py` the cold resumes and their cause; `ttl.py` the cache TTLs; `fit2.py` the fitted prices; `fill.py` what fills a context and spend by step and day; `whatif.py` the context-cap counterfactual. |
| `jev/` | Round one's result (`workflow-result.json`), the latency and consistency check (`smoke.mjs`), the finding-to-brief probe (`dataset.py`, `probe.mjs`, `score.py`, `probe-result.json`), the fate of every open finding (`fates.mjs`, `fates.json`), the dispatcher trial (`dispatch.mjs`) and the two GTD runs (`gtd.mjs`, `gtd2.mjs`). |
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
