---
name: trial-merge-a-branch
description: Stages the merge of a run's result branch in the repository's own checkout, and writes its commit message.
preload: true
---
1. The checkout is clean and on the base branch; if it is not, sign off `blocked` and say what is in the way.
2. Merge without committing every branch the section below names: `git merge --no-ff --no-commit <branches>`.
3. On a conflict, `git merge --abort` and sign off `blocked`, naming the files. Otherwise sign off with the commit message.
