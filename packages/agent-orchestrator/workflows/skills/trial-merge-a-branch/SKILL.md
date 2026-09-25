---
name: trial-merge-a-branch
description: "In the repository's own checkout, stages the merge of a run's result branch onto the base branch and writes its commit message; the run then checks the merged tree and commits it, or aborts it."
tags: ["merge", "git", "tests"]
examples: ["Use this when a run is finished and a person has approved what it made."]
preload: true
---
1. Look before you touch anything: `git status --porcelain` says nothing, and `git rev-parse --abbrev-ref HEAD`
   is the base branch. If either is not so, somebody else is working in this checkout — stop, and sign off
   `blocked` saying what is in the way. Do not stash, reset or check anything out.
2. Merge, without committing, every branch the section below names, in one command: `git merge --no-ff --no-commit
   <branch>…`. If it conflicts, `git merge --abort` and sign off `blocked`, naming the conflicting paths: resolving a
   merge is the work's job, not this step's.
3. Write the commit message — never git's default. The subject is one plain line saying what shipped, for a person
   scanning `git log --oneline`: the run's own title — the first line under *What was asked for* — trimmed to about
   72 characters. Not a description of git: "Merge branch …" is what this message replaces. Then a blank line, and a
   body of two to six lines: what was built, in plain words, then one line naming the run, its branch, how many
   commits it brought, and the check the run executes on the merged tree. Write it from what you can verify in this
   checkout — `git log --format='%s' <base>..<branch>`, `git diff --stat <base>...<branch>`, `git rev-list --count
   <base>..<branch>`, and the run and branch this brief names — never from anyone's account of the work. No trailers
   of any kind: no `Co-Authored-By`, no `Signed-off-by`, no session URL.
4. Leave the merge staged, and sign off `done`, the message whole as your closeout's `message`. Do not run the check,
   do not commit, and do not abort a merge that is clean: the run does each, on the check's exit, and a session
   cannot hold a turn open for a suite that runs for minutes. A check that refuses, or does not finish, has the run
   abort the merge, and nothing lands. The check runs with no `WF_BASE_REF`, so it runs the e2e, where the folder
   has one, which no round's check ran: this is the one time the work meets it before it reaches the base branch.

Where this brief has no section *The run checks and lands your merge* — a folder whose ship step names no `check:` — the run lands nothing here, and
the merge is yours to finish: run the check named under *Where to look*, whole, from the repository root, mid-merge;
on exit 0, and only then, commit with the message of step 3, written to a file in the directory named under *Files
for the person who decides* and committed with `git commit -F <that file>`; on anything else `git merge --abort` and
sign off `blocked` with what the check said. Sign off `done` there only once the merge is committed.
