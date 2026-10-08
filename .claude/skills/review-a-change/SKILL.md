---
name: review-a-change
description: "Review a change in this repository as a second engineer would: against its intent and spec, by reading the diff and the suite's verdict, with findings that name the file, the line and what goes wrong. For a read-only step that decides whether the work goes round again."
---

# Review a change

1. **Know what was asked**: the spec handed to you, its goal and constraints. Review the change against that, not against a change you
   would have made.
2. **Read the whole diff** against the base (`git diff <base>...HEAD`, the base as your brief names it), and the tests beside it.
   Read a file with Read, list a folder with Glob and search with Grep; never `ls`, `find`, `head`, `cat`, `grep`, `git grep`, `awk`,
   `sed` or a pipe in Bash: Bash runs only the checks below and git's read-only questions, each bare, one per call, and never a write:
   `git diff`, `git log`, `git show`, `git status`, `git merge-base`, `git rev-parse` and `git branch --contains`. Whether main is merged
   into the branch is `git merge-base --is-ancestor <commit> HEAD`, answered by its exit code alone, so ask it with nothing after it,
   never `; echo $?` or `&& echo`; `git branch --contains <commit>` answers in words. Read, Grep and Glob reach this workspace, by
   paths from its root, and each folder your brief says you may read — those the steps before you handed over — under its own path;
   never the run's artifacts folder above them, another run's folder, the store (`~/.agent-workflows`), `~/.claude`, `~/.cache` or a
   system path: your fence refuses them without asking. What your brief quotes from outside them is all you have of it.
3. **Read the suite's verdict; run the cheap checks yourself**. Implement's check ran the whole test suite on this round's tree,
   forced, and your brief hands you its exit and the end of its output under `## What implement's check said`. That run is the floor,
   and a run of yours on the same tree would only say it again, and your fence refuses the whole suite; a check that did not pass is a
   finding. Run the typecheck and the lint yourself, each bare and one command per call: `npx turbo run typecheck --force`,
   `npm run lint`. Run a package's tests,
   `npx turbo run test --force --continue --filter=<package>`, only where a finding needs a run to stand on. Never wrap one in
   `timeout` or `( … )`, pipe it or redirect it; paths from the workspace root, never `cd`, `git -C`, `VAR=` or `for`: your fence
   refuses them. A claim you did not run or read in the check's output is not a finding.
4. **Judge the mutants, do not run them**: implement's check applied each mutant the engineer's closeout names and refused the step if
   one survived; your brief hands you what it said under `## What implement's check said`, each `wf mutants:` line whole in `reported`.
   Judge whether the list covers every rule the change adds, and whether each mutant breaks the rule rather than the file's syntax: a
   rule with no mutant, or a mutant that only stops the file loading, is a finding. Quote each `wf mutants:` line you judged in your
   closeout's `mutants`.
5. **Check where each change lives**, against the repository's own boundary rules — its `CLAUDE.md` files and any architecture
   document they name — and against the spec's `placement` and each change's `where`. Code in a boundary those rules give to another
   concern, an import across a boundary they hold, or a change built elsewhere than the spec placed it without a word, is a finding of
   kind `placement` that cites the rule.
6. **Look for what the author could not see**: a rule claimed with no test that makes it refuse; a test that passes for nothing; a
   caller that rebuilds a returned type field by field and drops the new one; a limit raised; a behaviour change the spec did not ask
   for. Never build or run the e2e: implement's check ran it on this round's tree, and its log is in the check you are handed.
7. **Write each finding so the engineer can act on it alone**: the file, the line, the input or case, and the wrong result; its `kind`,
   and the `rule` it cites, by the file that states or holds it and its words. No finding invented to look thorough, none about taste.
8. **Decide the round**: `again` true only when a finding is worth another round of work. From the second round, read the engineer's
   replies first: a finding answered `won't fix` with a sound reason is closed.
