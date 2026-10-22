---
name: implement-a-change
description: "Build a change from its spec in this repository: tests first where a rule is claimed, small commits, the tests of what changed green for the right reason, and each review finding answered in the next round. For a step that writes the code."
---

# Implement a change

1. **Read the spec** (handed to you in your brief) and the `CLAUDE.md` of each package it touches. If main moved since your branch
   was cut, merge it in first. Build each change where the spec places it (its `where`); one that cannot live there is a wrong spec.
2. **Prove before you build** where the spec claims a rule: write the test that makes it refuse, see it fail, then make it pass.
   - **A guard is proven by a test that makes it refuse, once.** A test that asks whether it allows proves nothing; guards tested
     that way have been silently inert. One fixture per rule, never one per form, word or spelling: the fixture breaks the rule the
     guard holds, and a second that breaks it again in another wording proves nothing the first did not. A guard with no fixture at
     all does not ship.
   - **A refusal's words are nobody's to check** (root `CLAUDE.md`, *Rules the code keeps*). Assert the fact — that it refused — its
     kind (`_tag`, `refused`) and the exit code it carries; never the sentence. A test that pins a message's whole wording breaks
     the day the message is made clearer, which is how a sentence comes to be owned by its test. What still pins one is counted in
     `packages/agent-orchestrator/test/test-rules.baseline.ts`, and that count only shrinks: no new line may be added to it.
   - **A rule about order or names is proven by a fixture that breaks it.** Give the fixture the opposite order or another name, and
     check the test fails without the rule.
   - **A time measured on a machine is a floor, never a ceiling.** Assert identities — the parts add up to no more than the whole —
     never a wall-clock bound, and wait for the event you count, never for a length of time. A test of what is ordered or worded by
     the clock seeds the clock rather than sleeping, and a duration a program decides on is not read off the wall clock. **A
     shipped default is not waited out**: shorten the bound at the seam the code gives for it — a parameter, an option, a harness's
     own ops — measure the floor there, and name the shipped constant at the one site that holds it. A test whose floor stands at a
     bound the shipped code owns has bought a second of proof with a second of every pass, and the guard refuses a new one.
   - **A test that fails only under load is a race until shown otherwise.** Make it happen on demand first — a throwaway preload the
     process is started with, a process frozen with `SIGSTOP` (wait for its state to say so before `SIGCONT`) — then fix it.
   - **A test that depends on the environment sets it**, and takes its temporary folders from the repository's own helper rather than
     the operating system's: a check inherits the environment of whatever started it, so a test that relies on a default passes there
     and fails by hand. Bound every background process a test starts, and every loop you run in the background yourself.
   - **Assert on the error's `message`**, never on a pattern anchored at the start of the error's whole string: that string opens
     with the error's class name.
   - **A test that reads source text ends a slice on a name that must exist**, and matches across line breaks: a formatter moves
     them, and a pattern that no longer matches makes an assertion of absence pass for nothing.
   - **A type-aware lint fix trusts the type; a guard exists because a caller does not.** A value from a page, a journal, a harness or
     JSON arrives as it is: read every line such a fix changes in the source before you keep it.
   - **What comes from outside is not what its type says.** A file written through a tool can turn an escape into the character it
     names — a raw NUL, DEL or byte order mark — so build such a character from its code, and look for the raw bytes after writing an
     escape of one; and a child process run with no redirection copies its error output onto yours.
   - **A field moved to another key still passes the typecheck where it is read through a cast, a map of strings or JSON**: search the
     tests for the old key, read the passing ones too, and check a comparison still fails once you break the new key on purpose. A
     wrong type passed on purpose to prove a refusal says so where it is passed.
   - **An optional field added to a returned type is dropped by every caller that rebuilds the answer field by field.** Search for
     each place that spreads or rebuilds the type, and give the new fact one writer. A comment claiming one writer is no evidence:
     search for the key, and read the code and its test.
   - **A test is given a stand-in, and the real thing is asked for by name.** A file whose whole subject is the real thing, or that
     needs what the stand-in does not model, says so in its name as the repository's guard for that requires.
3. **Work in small commits** with plain messages, as you go; the run commits only what you leave, in one commit under your step's name.
4. **Check what you changed**: its test files, the tests that read a doc, skill or workflow file you touched, and the packages you
   touched where a file alone does not say enough, each as the repository's instructions say how; then the checks the repository's
   instructions say a session runs whole. Never more than they say: where your step has a check, it runs the rest outside your
   session, and a failing test you did not run comes back as its refusal, answered in the next try. Green is the floor, not the bar.
   You run as a job, and a turn you end is your last: run each long command in the foreground, where one call may take 10 minutes
   (`run_in_background` runs it there too), or start it with a shell `&` and wait on it with a blocking call
   (`timeout 580 bash -c "while kill -0 <pid>; do sleep 5; done"`).
   Never sign off while a check you started is still running. Stop only what you started: bound it with `timeout`, or keep the pid of
   what you start in the background (`$!`) and `kill <pid>`. Never `pkill` or `killall`: other runs share this machine, and your fence
   refuses them.
5. **Never make it pass by weakening it**: a test loosened, a limit's ceiling raised, a check skipped. Cut the function; lower the
   ceiling of a file you shrank.
6. **Answer the review**, from the second round: for each finding, fix it, or say in `replies` why not (`won't fix`, and the reason). A
   finding you cannot answer honestly is a reason to sign off `blocked`, saying what you need.

When the spec is wrong — it names what is not there, or asks what a rule refuses — do not build around it: sign off `blocked` and say so.
