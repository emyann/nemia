---
name: say-why-it-aborted
title: "Say why it aborted"
description: "When the merge conflicts or anything else goes wrong before it signs off, aborts the merge and reports what stopped it, so the work can be sent back rather than half-shipped."
tags: ["merge", "review"]
examples: ["Use this when an ending must be safe to run unattended."]
preload: true
---
Anything else that goes wrong before you sign off — a command failed, the checkout is not what step 1 of
the trial merge wants — `git merge --abort` if a merge is staged, then sign off `blocked` saying what happened.
A checkout left mid-merge is worse than a branch not merged.
