---
name: change-a-contract
description: "Any change to a function a contract proves or to a contract under a package's contracts/ (its type imported from there), a change that adds a pure function that decides — a status, an action, a refusal — and the design or review of one: load it with tsverify before reading, writing or judging it. What each step owes a contract here: the laws a spec names, the order they are written in, what a review finds, and CI's contracts job."
applies: ["packages/agent-orchestrator/contracts/**", "apps/cli/contracts/**"]
---

# Change a contract

A contract proves a function by laws the verifier checks (`tsverify`, whose own skill says how to write and read one). This is what a
contract asks of each step here, by what the step does. CI's `contracts` job runs every contract on each commit pushed.

## Design

When the change adds a pure function that decides — a status, an action, a refusal, from what it is handed — or changes one a contract
proves (its type is imported from its package's `contracts/`), load the `tsverify` skill, and name in the spec each law the change adds
or changes: its name, its sentence, and its condition in words. The implementer writes them first and sees each fail on the code as it
is. To read what a contract proves today, run `npx tsverify <file> <name>`, bare, on the file the function is written in: a fenced
step's fence refuses its `--cache`, which writes, and its `--watch`, which never ends.

## Implement

When the change touches a function a contract proves, or writes a contract for one (its type is imported from its package's
`contracts/`), load the `tsverify` skill before you change the code. Write the laws into the contract first and run the verifier: each
new law comes back `counterexample` on the code as it is; then change the code until every law is `proved`. When the laws cannot all
hold, change no law: the verifier says `unmeetable` where no result keeps them together at an input, and names the laws that leave none.
Sign off `blocked`, naming the laws, the input and why no result keeps them together, so that a person amends the spec. When the
verifier says `undecided` of a contract (two results of different kinds keep every law at an input `requires` allows, so the laws do not
say which the code answers), add the law that picks one, or, where the choice is the code's on purpose, an `open` on that part (`open:
["output.<part>"]`, or `open: true` for the whole result) with a line beside it saying why. Never an `open` to make a hole go away. Run
`npx tsverify <file>` on each file you changed that holds a function a contract proves, and say its verdicts in your summary: CI's
`contracts` job runs every contract on the commit your check pushes. A new behaviour of a function a contract proves is a law of its
contract, not a new row of its tests. Delete a test a law makes redundant only once you have planted the bug it guards, seen the law
come back `counterexample`, and put the code back: name in your summary the test, the bug and the law.

Where no spec names the laws (a run with no design), name each in your plan, with its sentence, before you write it.

## Review

When the change touches a contract under a package's `contracts/`, or a function one proves, load the `tsverify` skill to judge its
laws. CI's `contracts` job verified every contract on the commit implement pushed, and its verdict is in the `ci` you read: you run no
verifier, which your fence refuses. A finding, each: a law loosened or removed with no reason the card or the spec gives; a law that
restates the code rather than say the domain's fact; a new behaviour of a function a contract proves held by a new test row where a law
could state it; a test deleted where the summary names no bug planted and no law that refused it.
