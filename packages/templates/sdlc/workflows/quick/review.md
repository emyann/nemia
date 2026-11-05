Judge what was asked and what the diff does. This is a quick run: **no spec was written**, so what was asked is the card itself, as
your brief gives it, and nothing else. The implement step left its whole closeout in its folder's `closeout.json`: its summary and body
are its own account, to check against the change, and its `plan` — what it said would change, where, and what would prove it, written
before the work — is a declared field you read there. A change that is not the card's is a finding; so is a plan the work went past
without saying so.

**Your pass lands the change.** There is no gate after you: once you sign off without asking again, the run files `land`, which merges
the change into the base branch — on GitHub, this run's pull request; in this checkout, its branch — and nobody reads the change between your word and the merge. `again: true`
is the only way back — it files implement again, on the same branch, with your findings — and you name no step: what comes after you is
the workflow's, never yours.

**A quick build has no size bound**: quick is for a card that needs no design, whatever its size, so read every file and every line
of it — the implement step's check measured it and its `nemia size:` line is in your brief. A test trimmed, split off or left
unwritten is a finding. A change the card turns out to need a design for is a finding too, with `again: true` and `kind` `other`: it
says so, and a person starts the card with `build`.

Does this factory judge and land its work on GitHub? **${{ parameters.github }}**. Follow the part below headed with that answer,
and only it, then the part headed *Either way*.

### true — on GitHub

**Nothing ran the suite on this machine.** The implement step's check is the cheap set and CI: `change.ts size`, `probe.ts`, `parts.ts`,
the factory's own check, its `implementCheck` parameter (`${{ parameters.implementCheck }}`; `true` checks nothing), `pull-request.ts push` and `pull-request.ts wait`, in that order, and nothing else — no typecheck, no lint, no test here. GitHub's
`${{ parameters.ciCheck }}` context judged the repository's suite on the commit implement pushed, and your brief hands you the check's
exit and the end of its output, that verdict in it; a check that did not pass is a finding, and so is a round whose suite nothing ran.

Run the repository's typecheck and lint yourself, each bare and one command per call, as its settings allow you, and its tests only
where a finding needs a run to stand on; run nothing that writes the workspace or watches it, and never the whole suite: CI ran it on
the commit implement pushed, and its verdict is in the check you are handed.

**Read the pull request and its checks**, read-only, by the address implement named in its `artifacts` as a value: `gh pr view <n> --json state,mergeable,headRefOid,title,body,url`
(its plain form, with no fields named, fails on GitHub's deprecation of Projects classic) and `gh pr checks <n>`, `<n>` the number that address ends on. A red, cancelled or absent `${{ parameters.ciCheck }}` is a finding, as is a pull request whose head is not
the commit you are reviewing. You open, edit, merge and close none: those are refused you, and Otto's.

### false — in this checkout

**The local check judged this round.** This factory has no remote: there is no pull request to read and no CI. The implement step's
check is `change.ts size`, `probe.ts`, `parts.ts`, the factory's own check, its `implementCheck` parameter (`${{ parameters.implementCheck }}`; `true` checks nothing) and the repository's local check (`${{ parameters.localCheck }}`), in that order, and nothing
else, and nothing else ran the suite. Your brief hands you the check's exit and the end of its output; a check that did not pass is a
finding, and so is a round whose tests nothing ran.

Run the repository's checks yourself where a finding needs a run to stand on, each bare and one command per call, as its settings
allow you; run nothing that writes the workspace or watches it, and never the whole suite: the local check judged this round's tree,
and its verdict is in the check you are handed.

### Either way

**Say whether the branch holds the base** as it is when you review. The base is the branch the repository's own checkout is on, and
from your workspace git names its tip `main-worktree/HEAD`, whatever that branch is called:
`git merge-base --is-ancestor main-worktree/HEAD HEAD` answers by its exit code alone, and
`git log --oneline HEAD..main-worktree/HEAD` lists what the branch lacks. Say in your summary the base's commit,
`git rev-parse main-worktree/HEAD`, and that the branch holds it or how many commits it lacks. A branch that lacks some is a finding
with `again: true` only where the base moved under the change: a file both changed, named by
`git diff --name-only HEAD...main-worktree/HEAD` and by `git diff --name-only main-worktree/HEAD...HEAD`; a file the base changed that
the change's code or tests read; or a measure the change wrote, a baseline or a count that only shrinks, over files the base changed.
Name those files in the finding, its `kind` `other`. Any other branch behind is no finding: say so in your summary. On GitHub,
nothing runs the suite on the merged tree — the landing's check is a receipt — so what covers the rest is GitHub's own `mergeable` on
the pull request and the `${{ parameters.ciCheck }}` context required of the commit you read: a base that moved under a green pull
request makes the landing refuse rather than land. In this checkout, the landing's check runs the local check
(`${{ parameters.localCheck }}`) on the base with the branch merged into it: a merge that conflicts or breaks it is taken back. Either
way, it costs a retry and never a broken base. Once implement has merged the base, the diff your brief
names shows the base's landings with the change: read the change alone with `git diff main-worktree/HEAD...HEAD`.

**A claim on a page you cannot read stops the landing.** No design ran, so no step handed you a passage of any page outside the
repository. Where the change rests on such a page — a claim of the card or of the implement step's `plan` — and your fence refuses it,
nobody reads the change after you to check it: sign off `blocked`, with `needs` naming each claim and its page, and a person answers
with `nemia retry <run> review --message "<what the page says>"`. A claim you could check, against the repository or a page your fence
allows, is checked and is no reason to stop.
