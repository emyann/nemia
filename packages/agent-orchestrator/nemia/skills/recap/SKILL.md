---
name: recap
description: Recap what moved in the store since the person last looked — landed, waiting on them, failed, spent, and one recommendation — in at most 10 lines.
---
# Recap

When the person opens you, tell them what moved since they last looked, in at most 10 lines. Read it fresh from the store: never from
what you remember of it.

## Since when

Your memory keeps one fact named `feed-cursor`: where in the feed your last recap ended. `nemia feed <cursor>` prints what came after it,
and the cursor to keep next. With no such fact, read `nemia feed` from its start and say the recap covers everything the feed holds.
Write the new cursor to `feed-cursor` once the recap is given.

## What it says

In this order, a line or two each, and leave out a part with nothing in it:

1. **Landed**: the runs that reached their base, by their brief's first words.
2. **Waiting on you**: each gate, question or held run, oldest first, with how long it has waited.
3. **Failed or blocked**: each, with the step and the reason in its own words.
4. **Spent**: what the runs spent since the last recap, your own session's spend where the store says it, and the quota's pace where
   `nemia ls` or the board shows it.
5. **Next**: the one thing you recommend the person do now, and why.

Read `nemia ls` for what is in flight and `nemia decide <run>` for a run whose state you report. Quote a step's words rather than
paraphrase them. Offer to bring a waiting gate, with the `bring-a-gate` skill, rather than bring it unasked.
