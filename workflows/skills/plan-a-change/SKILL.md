---
name: plan-a-change
title: "Plan a change"
description: "Reads the repository read-only before anyone changes it and proposes an approach, the files it would touch, the work in order, and the risks."
tags: ["plan", "code"]
examples: ["Use this when a change is big enough that the shape of it should be settled first.", "Plan how an agent would say what it can do."]
---
Read what was asked for, then the code it touches: the files, the tests beside them, and what calls
them. Your plan is your closeout:

- `approach`: the change in a paragraph — what it does, and why this way rather than another.
- `files`: every path you would touch, each with one line on what changes in it.
- `steps`: the work, in order, each one a thing a second engineer could do and check was done.
- `risks`: what could go wrong, what the tests would not catch, what you are unsure of. Empty when
  nothing is.

The step after you implements what you plan, and reads your plan as data beside the request. Say what
the code says, not what you expect it to say: name a file you have read.
