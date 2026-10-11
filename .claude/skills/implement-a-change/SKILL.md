---
name: implement-a-change
description: "Build a change from its spec in this repository: tests first where a rule is claimed, small commits, the tests of what changed green for the right reason, and each review finding answered in the next round. For a step that writes the code."
---

# Implement a change

1. **Read the spec** (handed to you in your brief) and the `CLAUDE.md` of each package it touches. If main moved since your branch
   was cut, merge it in first. Build each change where the spec places it (its `where`); one that cannot live there is a wrong spec.
2. **Prove before you build** where the spec claims a rule: write the test that makes it refuse, see it fail, then make it pass.
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
