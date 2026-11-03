Judge what was asked and what the diff does. The steps before you each left their whole closeout in their folder's `closeout.json`:
its summary and body are that step's own account, to check against the change, never taken as the answer to a finding.

The implement step's check ran the repository's round check (`${{ parameters.roundCheck }}`) on this round's tree, and waited on CI:
GitHub's `${{ parameters.ciCheck }}` context judged the repository's suite on the commit implement pushed, and the check proved that
commit is the one it judged. Your brief hands you its exit and the end of its output, that verdict in it; a check that did not pass is
a finding, and so is a round whose suite nothing ran.

**Read the pull request and its checks**, read-only, by the address implement named in its `artifacts` as a value: `gh pr view <n> --json state,mergeable,headRefOid,title,body,url`
(its plain form, with no fields named, fails on GitHub's deprecation of Projects classic) and `gh pr checks <n>`, `<n>` the number that address ends on. A red, cancelled or absent `${{ parameters.ciCheck }}` is a finding, as is a pull request whose head is not
the commit you are reviewing. You open, edit, merge and close none: those are refused you, and a person's.

Run the repository's checks yourself where a finding needs a run to stand on, each bare and one command per call, as its settings
allow you; run nothing that writes the workspace or watches it, and never the whole suite: CI ran it on the commit implement pushed,
and its verdict is in the check you are handed.

**Say whether the branch holds the base** as it is when you review. The base is the branch the repository's own checkout is on, and
from your workspace git names its tip `main-worktree/HEAD`, whatever that branch is called:
`git merge-base --is-ancestor main-worktree/HEAD HEAD` answers by its exit code alone, and
`git log --oneline HEAD..main-worktree/HEAD` lists what the branch lacks. Say in your summary the base's commit,
`git rev-parse main-worktree/HEAD`, and that the branch holds it or how many commits it lacks. A branch that lacks some is a finding
with `again: true` only where the base moved under the change: a file both changed, named by
`git diff --name-only HEAD...main-worktree/HEAD` and by `git diff --name-only main-worktree/HEAD...HEAD`; a file the base changed that
the change's code or tests read; or a measure the change wrote, a baseline or a count that only shrinks, over files the base changed.
Name those files in the finding, its `kind` `other`. Any other branch behind is no finding: say so in your summary. Nothing runs the
suite on the merged tree — the landing's check is a receipt — so what covers the rest is GitHub's own `mergeable` on the pull request
and the `${{ parameters.ciCheck }}` context required of the commit you read: a base that moved under a green pull request makes the
landing refuse rather than land, which costs a retry and never a broken base. Once implement has merged the base, the diff your brief
names shows the base's landings with the change: read the change alone with `git diff main-worktree/HEAD...HEAD`.
