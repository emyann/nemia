---
name: change-a-contract
description: "Any change to a function a contract proves or to a contract under a package's contracts/ (its type imported from there), a change that adds a pure function that decides — a status, an action, a refusal — and the design or review of one: load it with tsverify before reading, writing or judging it. What each step owes a contract here: design writes it, implement starts from it, review diffs it against design's, and CI's contracts job."
applies: ["packages/*/contracts/**", "apps/*/contracts/**"]
---

# Change a contract

A contract proves a function by laws the verifier checks (`tsverify`, whose own skill says how to write and read one). This is what a
contract asks of each step here, by what the step does. CI's `contracts` job runs every contract on each commit pushed.

**A contract imports nothing from the file that implements it** (`tools/guards/test/contract-first.test.ts`): it is written first and
typechecks before the code exists, so an implementer is handed the types with the laws. The types its signature needs are the
contract's own, or `objects`'; a value both need — an error class, a service — lives in a file of its own that both import; and a type
several files of `src` share, in a file that does not implement the contract, is imported by `import type`. A contract that reads its
code is named in that guard's baseline, which only shrinks: move its types into it when you change it, and take it off.

A contract is handed from step to step as a file, never as prose: design writes it, the run commits it under design's step, implement
starts from that commit, and review reads implement's diff of it against that commit.

A function's `src/` imports its contract's types by `import type` from its package's `contracts/`, never `@emyann/tsverify` itself:
the verifier stays in the root's `devDependencies`, no workspace ships it (`tools/guards/test/no-shipped-verifier.test.ts`), and a law
that would want it at run time is made provable from the code, or restated so a helper's spec carries it.

## Design

When the change adds a pure function that decides — a status, an action, a refusal, from what it is handed — or changes one a contract
proves (its type is imported from its package's `contracts/`), load the `tsverify` skill and **write the contract yourself**: the file
`<package>/contracts/<name>.contract.ts`, directly under a package's or an app's `contracts/`, its laws written in the order the
`tsverify` skill asks, each named and with its sentence beside it. In the nemia factory your fence allows that file and refuses every
other write, `contracts/laws.ts` included: a helper the laws need is written inside the contract file, and implement may move it to
`laws.ts`, which changes no law.

- **The function exists**: run `npx tsverify <its source file> <name>`, bare (a fenced step's fence refuses `--cache`, which writes, and
  `--watch`, which never ends). Each law you add or change comes back `counterexample` on the code as it is; one that comes back `proved`
  says nothing the code does not already do, and one that comes back `vacuous` holds of no input: rewrite either before you hand it on.
- **The function does not exist yet**: the verifier refuses a spec with no implementation, so write the spec, export its
  `Implementation<typeof …Spec>` type under the function's name. A word or a shape `objects` holds (`packages/objects/src/words.ts`
  and its Schemas) is imported by `import type` from its entry, `objects`, never declared again; every other type the signature needs
  is declared and exported in the contract, where it stays: the code takes it from the contract and hands it on, and never moves it
  into `src`. Typecheck it, `npx tsrs --noEmit -p <package>` (each package that holds a `contracts/` has it in its tsconfig's
  `include`; a new one adds it), and say each law's verdict as `no code yet`.

Your spec names the file and gives each law's name and verdict; it does not carry the laws in words. Name the file in your `artifacts`,
and leave it uncommitted: the run commits it with the rest of your step as `design: hand off what was left uncommitted`, the commit
implement starts from and review compares against. A spec rewritten after a round rewrites the file, never only its words.

## Implement

When the change touches a function a contract proves, or design handed you a contract for one, load the `tsverify` skill before you
change the code. **Start from design's file**, as its hand-off commit has it. Change no law of it without naming in your closeout the
law, what you changed (dropped, added, renamed, loosened or tightened) and why: the verifier says it cannot be proved, another law
implies it, a review finding, an `undecided` closed. A law changed with no reason given is a finding of the review.

Run the verifier before you change the code: each new law comes back `counterexample` on the code as it is. Where design said `no code
yet`, write first a stub typed by the spec and see each law come back `counterexample` on it (a `vacuous` one goes back to the spec);
only then write the code. Change the code until every law is `proved`. When the laws cannot all hold, change no law: the verifier says
`unmeetable` where no result keeps them together at an input, and names the laws that leave none. Sign off `blocked`, naming the laws,
the input and why no result keeps them together, so that a person amends the spec. When the verifier says `undecided` of a contract (two
results of different kinds keep every law at an input `requires` allows, so the laws do not say which the code answers), add the law
that picks one, or, where the choice is the code's on purpose, an `open` on that part (`open: ["output.<part>"]`, or `open: true` for
the whole result) with a line beside it saying why, and name either in your closeout as a change of the contract. Never an `open` to make
a hole go away. Run `npx tsverify <file>` on each file you changed that holds a function a contract proves, and say in your summary each
new law's `counterexample` before the code and its verdict after: CI's `contracts` job runs every contract on the commit your check
pushes. A new behaviour of a function a contract proves is a law of its contract, not a new row of its tests. Delete a test a law makes
redundant only once you have planted the bug it guards, seen the law come back `counterexample`, and put the code back: name in your
summary the test, the bug and the law.

Where no design handed you a file (a run with no design), name each law in your plan, with its sentence, before you write it.

## Review

When the change touches a contract under a package's `contracts/`, or a function one proves, load the `tsverify` skill to judge its
laws. CI's `contracts` job verified every contract on the commit implement pushed, and its verdict is in the `ci` you read: you run no
verifier, which your fence refuses.

Read each contract against design's: find the commit, `git log -n 1 --format=%H --grep='^design: ' -- <file>` (a design retried
leaves one per try; the latest is the one handed on), and read `git diff <it> HEAD -- <file>`. A file design handed on that implement
deleted is in `git diff --stat <it> HEAD`.

A finding, each: a law dropped, added, renamed or loosened between design's commit and the head whose reason implement's closeout does
not give; a law loosened or removed with no reason the card or the spec gives; a law that restates the code rather than say the domain's
fact; a new behaviour of a function a contract proves held by a new test row where a law could state it; a test deleted where the
summary names no bug planted and no law that refused it; a new law whose `counterexample` before the code implement does not report.
