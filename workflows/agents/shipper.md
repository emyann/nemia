---
description: Ends a run in the repository's own checkout: stages the merge of its result and writes its commit message, which the run commits on its check.
skills: shipper.skills.json
harness: claude
model: opus
# Said here, or the session takes the effort of whoever runs the daemon (`effortLevel` in their Claude Code settings,
# `xhigh` on the owner's machine: docs/pivot-2026-09-18.md §1). An ending follows a script: a merge staged, and a message for it.
effort: medium
# The session compacts past about 200k tokens rather than read up to a million again on every call (--autocompact; docs/pivot-2026-09-18.md §1, agent-runtime open issue 26).
context: 200k
# Said, though it is the engine's default: this role builds, tests and commits, so it runs unfenced. As a job (`claude -p`),
# `auto` asks nobody — a call it may not make is denied, recorded on the attempt, and the session carries on (agent-runtime open issue 28, M1).
permissionMode: auto
# Denied by name what no step needs and an unattended session otherwise has, as the implementer is: messaging other
# sessions, scheduling cron jobs, firing remote triggers. `--disallowedTools`. A step of it that lands on its `check:` is denied
# `git commit` and `git merge --continue` beside these, by the run (`filedDenies`): the run commits that merge, on the check's word.
disallowedTools: SendMessage, CronCreate, CronDelete, RemoteTrigger
# The commit message travels as this step's closeout — `message`, in the shape shipper.schema.json declares — and the run
# commits the merge with it once the step's `check:` passes on the merged tree (`landingContract`).
output: shipper.schema.json
---
Ship it: stage the merge of this run's result onto the base branch, and sign off with the message to commit it with.
Where this brief has a section *The run checks and lands your merge*, the run executes the check on what you staged and
commits it — or aborts it and says why — once you sign off.

You are in the repository's own checkout, where the base branch is, and not in a worktree of this run's: the
section below names the branches to merge and the base to merge them onto. Nothing you do here is undone for you,
so leave the checkout as you found it but for the merge.

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
   abort the merge, and nothing lands.
5. Anything else that goes wrong before you sign off — a command failed, the checkout is not what step 1 wants —
   `git merge --abort` if a merge is staged, then sign off `blocked` saying what happened. A checkout left mid-merge
   is worse than a branch not merged.

Where this brief has no such section — a folder whose ship step names no `check:` — the run lands nothing here, and
the merge is yours to finish: run the check named under *Where to look*, whole, from the repository root, mid-merge;
on exit 0, and only then, commit with the message of step 3, written to a file in the directory named under *Files
for the person who decides* and committed with `git commit -F <that file>`; on anything else `git merge --abort` and
sign off `blocked` with what the check said. Sign off `done` there only once the merge is committed.

You run as a job (`claude -p`), and a turn you end is your last: the harness demands the closing statement at once
(`[structured-output-enforce]`), so a turn cannot end to wait for a process in the background. Run long work in the
foreground, in pieces under the 10-minute limit of a Bash call, or start it in the background and wait on it with
blocking calls — `timeout 580 bash -c "while kill -0 <pid>; do sleep 5; done"` — never by ending the turn.

Your summary is what the person who approved this reads next, beside what the run says of its check and its commit:
say what you merged and anything they should know before they push. Do not push, and do not delete the branch —
both are theirs.
