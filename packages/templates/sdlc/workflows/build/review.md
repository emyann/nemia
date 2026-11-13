Judge what was asked and what the diff does. The steps before you each left their whole closeout in their folder's `closeout.json`:
its summary and body are that step's own account, to check against the change, never taken as the answer to a finding.

Does this factory judge and land its work on GitHub? **${{ parameters.github }}**. Follow the part below headed with that answer,
and only it, then the part headed *Either way*.

### true — on GitHub

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

### false — in this checkout

This factory has no remote: there is no pull request to read and no CI. The implement step's check ran the repository's local check
(`${{ parameters.localCheck }}`) on this round's tree, and nothing else ran the suite. Your brief hands you its exit and the end of
its output; a check that did not pass is a finding, and so is a round whose tests nothing ran.

Run the repository's checks yourself where a finding needs a run to stand on, each bare and one command per call, as its settings
allow you; run nothing that writes the workspace or watches it, and never the whole suite: the local check judged this round's
tree, and its verdict is in the check you are handed.

### Either way

**Say whether the branch holds the base** as it is when you review. The base is the branch the repository's own checkout is on, and
from your workspace git names its tip `main-worktree/HEAD`, whatever that branch is called:
`git merge-base --is-ancestor main-worktree/HEAD HEAD` answers by its exit code alone, and
`git log --oneline HEAD..main-worktree/HEAD` lists what the branch lacks. Say in your summary the base's commit,
`git rev-parse main-worktree/HEAD`, and that the branch holds it or how many commits it lacks. A branch that lacks some costs a round,
a finding with `again: true`, its `kind` `other`, naming the files and the reason, only where what it lacks can change your verdict,
for one of four reasons. One: a file both changed, named by `git diff --name-only HEAD...main-worktree/HEAD` and by
`git diff --name-only main-worktree/HEAD...HEAD`, whose hunks overlap or touch: read each side's with
`git diff -U0 HEAD...main-worktree/HEAD -- <file>` and `git diff -U0 main-worktree/HEAD...HEAD -- <file>`, both counting the merge
base's lines in `@@ -<start>,<count>` (a count of 0 is an insertion after line `<start>`, and touches the lines on both sides of it);
two hunks touch where no line of the merge base that neither changed lies between them. Two: a test of either side that reads — imports,
loads, globs or counts — what the other side changed in a file, or the change's code that uses a name, a signature or a text the base
changed. Three: a contract, a baseline, a count that only shrinks or another measure either side wrote over files the other changed.
Four: a merge that does not go clean — `git merge-tree --write-tree --name-only HEAD main-worktree/HEAD` exits 1 and names the files
that conflict — or, on GitHub, a pull request whose `mergeable` is anything but `MERGEABLE`, an `UNKNOWN` read once more first.
On GitHub, where the factory names a refresh (its `landingRefresh`, here `${{ parameters.landingRefresh }}`; empty, it names none), a
file of `${{ parameters.landingDerives }}` is no finding of reasons one, three and four, nor a `mergeable` that is not `MERGEABLE` where
those files alone conflict: the landing merges the base into the branch and derives them again, and refuses a result that differs from
git's plain merge anywhere else. A conflict in any other file still is one. Any other branch behind is no finding: say in your summary
the base, how far behind, and each file both changed whose hunks are apart, and let the land go.
On GitHub, nothing runs the suite on the merged tree — the landing's check is a receipt, and the base's own
`${{ parameters.ciCheck }}` at the merge commit catches a break only after it lands — so what covers the rest is GitHub's own
`mergeable` on the pull request and the `${{ parameters.ciCheck }}` context required of the commit you read: a base that moved under a
green pull request makes the landing refuse rather than land. In this checkout, the landing's check runs the local check
(`${{ parameters.localCheck }}`) on the base with the branch merged into it: a merge that conflicts or breaks it is taken back. Either
way, it costs a retry and never a broken base. Once implement has merged the base, the diff your brief
names shows the base's landings with the change: read the change alone with `git diff main-worktree/HEAD...HEAD`.

**Check the outside pages the spec rests on.** Design's `sources`, which your brief hands you with the rest of its declared fields,
are each page outside the repository the spec rests on, as design read it: its address, the day, the passage word for word and the
claims the spec takes from it. Check each claim of the spec and of the change that rests on such a page against its passage. A claim
with no passage there, on a page your fence refuses, goes at the top of your sign-off, where the person who approves the landing reads
it before anything merges.

**A change to this factory's definitions that the work needs** — an allow or a deny on a step, a line of a step's overlay — you
propose, never name in your closeout for someone to write by hand: `nemia propose -f <file> -n <factory> --at run-end`, `<factory>`
this factory's name and the objects in the file, or, where you write no file, the objects on the line as JSON: `nemia propose -n
<factory> --at run-end --objects '<json>'`. It applies once it is approved and this run has succeeded; name the proposal in your
summary.
