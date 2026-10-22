---
name: review-a-change
description: "Review a change in this repository as a second engineer would: against its intent and spec, by reading the diff and the suite's verdict, with findings that name the file, the line and what goes wrong. For a read-only step that decides whether the work goes round again."
---

# Review a change

1. **Know what was asked**: the spec handed to you, its goal and constraints. Review the change against that, not against a change you
   would have made.
2. **Read the whole diff** against the base (`git diff <base>...HEAD`, the base as your brief names it), and the tests beside it.
   Read a file with Read, list a folder with Glob and search with Grep; never `ls`, `find`, `head`, `cat`, `grep`, `awk`,
   `sed` or a pipe in Bash: Bash runs only the checks and reads your step names and git's read-only questions, each bare, one per call, and never a write —
   the change (`git diff`, `git log`, `git show`), the workspace (`git status`), a line's author (`git blame`), what git tracks
   (`git ls-files`), a name resolved (`git rev-parse`) and where a commit stands (`git merge-base`, `git branch --contains`). Search the
   working tree with Grep, and a revision with `git grep <pattern> <rev>`, the one search no tool here can do. Whether main is merged
   into the branch is `git merge-base --is-ancestor <commit> HEAD`, answered by its exit code alone, so ask it with nothing after it,
   never `; echo $?` or `&& echo`; `git branch --contains <commit>` answers in words. Read, Grep and Glob reach this workspace, by
   paths from its root, and each folder your brief says you may read — those the steps before you handed over — under its own path;
   never the run's artifacts folder above them, another run's folder, the store (`~/.agent-workflows`), `~/.claude`, `~/.cache` or a
   system path: your fence refuses them without asking. What your brief quotes from outside them is all you have of it.
3. **Read the check's verdict; run the checks your step names yourself**: where the step before you has a check, your brief hands you
   its exit and the end of its output (`## What <step>'s check said`); a check that did not pass is a finding. Run each check your step
   names bare, one command per call. Never wrap one in `timeout` or `( … )`, pipe it or redirect it; paths from the workspace root,
   never `cd`, `git -C`, `VAR=` or `for`: your fence refuses them. A claim you did not run or read in the check's output is not a
   finding.
4. **Check where each change lives**, against the repository's own boundary rules — its `CLAUDE.md` files and any architecture
   document they name — and against the spec's `placement` and each change's `where`. Code in a boundary those rules give to another
   concern, an import across a boundary they hold, or a change built elsewhere than the spec placed it without a word, is a finding of
   kind `placement` that cites the rule.
5. **Look for what the author could not see**: a behaviour the change claims and no test proves at any level; a test that passes for
   nothing; a caller that rebuilds a returned type field by field and drops the new one; a limit raised; a behaviour change the spec
   did not ask for. A rule is proven once, at the cheapest level that proves it: a second fixture over the same rule in another
   wording is no finding, and asking for one is how this suite grew. You read a diff and cannot run the author's experiment, so look
   for the shapes that pass for nothing:
   - A guard tested by asking whether it allows, never by making it refuse: it proves nothing, and guards tested that way have been
     silently inert. One fixture that breaks the rule is what is owed; a guard that ships with none is the finding.
   - A fixture that does not break the rule the test claims to hold — the same order, the same name — so the test would pass with the
     rule gone.
   - An assertion that pins a refusal's whole sentence, where the repository's own rules say its words are nobody's to check. Where
     the repository keeps a count of what still pins one, a new line in it is the finding, as is a line lowered while the
     assertions are still there.
   - A test that waits out a shipped default — a floor standing at a bound the shipped code owns, rather than at a bound the test
     shortened at the code's own seam: it buys a second of proof with a second of every pass.
   - A wall-clock bound, or a wait for a length of time rather than for the event being counted: it passes on the author's machine and
     fails under load.
   - A test that reads source text with a slice that can silently match nothing, so an assertion of absence passes for nothing.
   - An assertion on the error's whole string where it belongs on its `message`; a test that relies on an environment or a clock it
     does not set; a temporary folder taken from the operating system rather than the repository's own helper.
   - A type-aware lint fix kept unread where the guard it touched exists because a caller does not keep the type.
   - A limit's ceiling raised, or a baseline or a count that only shrinks loosened, in place of the function being cut.
6. **Write each finding so the engineer can act on it alone**: the file, the line, the input or case, and the wrong result; its `kind`,
   and the `rule` it cites, by the file that states or holds it and its words. No finding invented to look thorough, none about taste.
7. **Decide the round**: `again` true only when a finding is worth another round of work. From the second round, read the engineer's
   replies first: a finding answered `won't fix` with a sound reason is closed.
