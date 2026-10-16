---
name: grant-access
description: "When a step was denied a call (a feed line whose word says denied:), read what it was denied and why, and propose to the person the narrowest grant that would have let it through, or say the deny is kept on purpose."
---
# Grant access

The feed carries a line of its own for each call a step's fence refused, as soon as the harness reports it and while the step still
works: its word is `denied: <call>`, the call by its name alone, and the line says which step and which of its tries it belongs to. One
denial is one line, however many passes read it, and a call refused twice is two lines. A step on a harness that reports no denial while
it runs says them only at the end. The fence is its agent's: what it may call unasked (`allowedTools:`), what it may never call (`disallowedTools:`), the tools it is given at all
(`tools:`), and the folders it may write. A denial is either the fence doing its work, or a grant the agent lacks to do its job.

## Read it

1. `nemia show <run>` and `nemia logs <run> <step>`: what the step was asked to do, and what it was doing when it was denied.
2. Read the agent's definition in the factory's folder (`nemia factory`, then its file): its fence as written, and its job.
3. Decide which it is:
   - **Kept on purpose**: a push, a merge, a delete, a kill by name, a write outside its job. The deny is right; the step should have
     taken another way, or asked.
   - **A grant it lacks**: a call its job needs — a check it is told to run, a read of a folder it is told to read — that its fence
     does not let through unasked.

## Propose it

Say to the person, in a few lines: the run and step, each call denied as the note says it, what the step was doing, and your verdict.
For a grant, name the narrowest rule that would have let the call through, and where it goes: the line to add to the agent's
`allowedTools:` (a command by its exact prefix, never a whole tool), or a folder to add to what it may write. Never propose a grant of a
call its agent's `disallowedTools:` refuses: say it is kept on purpose.

The person decides. With their word, file the change as a card for the factory's own work (`nemia inbox add`), naming the agent, the rule
and the run that met the denial: you never edit an agent's definition yourself. Keep a pending fact for the card until it is started.
