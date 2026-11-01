---
name: tsverify
description: "Prove TypeScript functions with tsverify: write a spec's laws before the code, run the verifier while you write, and read its verdicts. Load it before you write or change a spec (`spec`, `contract`, `Implementation<S>`, `assume`), and before you change a function a spec proves."
---

# tsverify

tsverify proves that a TypeScript function keeps the laws of its spec for every input its spec allows, or gives the input
that breaks one. It reads the spec and the code as they are, and asks the Z3 solver law by law. The pages behind this skill
are installed with the package, in `node_modules/@emyann/tsverify/docs/`: `specs.md` (writing a spec), `verdicts.md`
(reading a report), `reads.md` (what it reads, refuses and trusts), `effect.md` and `proofs.md` (loops). Read the one you
need before you guess.

## The loop: the laws first

1. **Say what must hold**, one law per fact, in the words of the domain the function serves: "a refused withdrawal writes
   nothing", never the steps the code takes. A law that restates the code proves only that the code is the code.
2. **Write the laws into the spec** before you change the code, and run the verifier: each new law should come back
   `counterexample` on the code as it is. A new law the old code already proves says nothing your change adds; keep it only
   if it says something the spec lacked.
3. **Change the code until every law is `proved`.** A counterexample is an input the real code fails on: run the function
   on it before you decide whether the code, the law or the `requires` is wrong.

## Writing a law

```ts
// shipping.contract.ts
import { type Implementation, spec } from "@emyann/tsverify"

const shippingSpec = spec<(total: number) => number>({
  requires: ({ input: [total] }) => total >= 0,
  ensures: {
    freeFrom50: {
      description: "An order of 50 or more ships free",
      condition: ({ input: [total], output }) => (total >= 50 ? output === 0 : true),
    },
    smallOrdersPay: ({ input: [total], output }) => (total < 50 ? output === 5 : true),
  },
})
// The function's type, which the code takes: it then imports nothing of tsverify.
export type Shipping = Implementation<typeof shippingSpec>

// shipping.ts
import type { Shipping } from "./shipping.contract.ts"
export const shipping: Shipping = (total) => (total >= 50 ? 0 : 5)
```

- **The spec's module exports the function's type**, `Implementation<typeof shippingSpec>`, under the function's name: the
  code takes it and imports nothing of tsverify, and the verifier finds the code through that import.
- **A law reads one run**: `({ input: [a, , c], output }) => boolean`, the arguments as a tuple (a hole for one it does not
  read). A law of async code or an Effect program reads its outcome as `output` and the calls it made as `calls`.
- **Give each law its sentence**, `{ description, condition }`: the report prints the description on the law's line, so
  write it as a statement a reader can check against the domain.
- **`requires` is what every caller promises**, and the laws are proved only where it holds. Read the function's real
  callers: an input they pass that `requires` rules out is an input nothing proves. A default parameter is proved only as
  `requires` lets it vary.
- **Say both sides.** Most laws forbid ("refused when …"); a function that refuses everything keeps every such law. Where it
  matters that the function also succeeds, say when: a law of the form "exactly when", or one for the accepting side.
- **Name the domain's words once**, as small pure helpers beside the spec, and read them in the laws. A law may call a function
  of the code that has its own spec: it then says that the two agree, and leans on that spec's proof. A law that calls code
  with no spec leans on code nothing states.
- **A law speaks of one run.** "Calling it twice gives the same answer", "this field changes nothing" are about two runs: a
  test holds them, not a law.
- **`vacuous` means the law says nothing**: no result could break it, usually because its premise never holds under
  `requires`. Rewrite it; never keep one.

## Calls, and what is taken on trust

- **A call of a function typed `Implementation<S>` takes what `S` proves of it**, where `S`'s `requires` holds at the call,
  and nothing of its body. What a caller needs of it is a law of `S`. When a counterexample "leans on `S` for `f`", either the
  caller does not meet `S`'s `requires` there, or `S` lacks the law: meet the one or add the other.
- **`assume(f, { pure, ensures })`** declares a function with no spec that the verifier does not or should not read: a
  package's, a recursive one, one too large to read at every call. Its `ensures` are trusted, never proved: test them on the
  real function with `brokenOn(assumption, inputs)`. `pure: true` with no laws makes it some pure function: what is proved
  then holds whatever it returns. An `assume` of a function that implements a spec is refused: its spec declares it.
- **Every report lists what it leaned on**: the declarations it trusted, the specs it took, and what it assumed of
  JavaScript (arguments have their types, code throws only where it says so, a purity check trusts that a getter changes
  nothing). Read that list before you call a law proved.

## Reading a verdict

| Verdict | What to do |
| --- | --- |
| `proved` | Nothing, for every input `requires` allows. |
| `counterexample` | Run the function on `e.g.`'s input; the `where` line says what each call returned. Fix the code, the law or `requires`. |
| `vacuous` | The law says nothing of the function: rewrite it. |
| `bounded` | No proof, and no counterexample with arrays of up to 4 elements. The reason says what stands in the way, often a loop's invariant (`docs/proofs.md`). |
| `unsupported` | The code or the law uses what tsverify does not read. The reason says what to write instead. |
| `unknown` | The solver gave no answer: split the law, or narrow what it ranges over. |
| `inconsistent` | A bug of tsverify, not a verdict on your code. |

The command exits 0 only when every law is proved.

## Running it

- **One contract**: `npx tsverify <file> <name>`, the file where `const name: Implementation<S>` (or `contract(...)`) is
  written. Every contract of a file: `npx tsverify <file>`. Of a folder: `npx tsverify <folder>`. `--verbose` prints every law
  and what each leaned on; `--json` is the same for a program.
- **While you write**: `npx tsverify <file> --watch --cache` runs again on every change to the project's TypeScript, each run
  a process of its own, and stops a run a newer change makes stale. Run it in the background, edit, then read the newest report:
  piped, each report follows the last under a line `tsverify --watch · <time> · <why>`, and ends with `all proved` or
  `not all proved`. Watch the file you are working in, not the whole project, so each run stays short. Stop it, by the process
  you started, before you finish: it never ends on its own.
- **`--cache`** keeps each contract's verdict, keyed by the text of every file its program reads: a run after a change verifies
  only the contracts that change reaches.

## What a proof holds, and what it does not

- **A proof covers every input `requires` allows, and only what the laws say.** It says nothing of a message's words, the
  wiring around the function, another function, a property of two runs, the exact output where the laws only bound it, or
  whether what an `assume` declares is true: a test holds those.
- **To see whether a law catches a bug, plant it**: change the function as the bug would, run the verifier, see the law come
  back `counterexample`, and restore the function. A law that reads as covering a case may leave it open.
  `@emyann/tsverify/mutants` plants one-line bugs in bulk and says which the laws miss (`docs/specs.md`, *Gaps*).
- **A law loosened or removed so the code passes is a check weakened**, as a loosened test is: it needs the same reason.

## Traps

- The project's `tsconfig.json` must have `strict` (or `strictNullChecks`): without it a type leaves out `null` and
  `undefined`, and so would every proof.
- A read of `xs[i]` or of a record by any key is read where its type says it may be missing: `noUncheckedIndexedAccess`
  on, or `xs.at(i)`.
- `number` is IEEE 754: a sum may round, and the verifier proves where it does not (`exact` obligations). `bigint` never rounds.
- A loop needs an invariant to be proved for every length: the verifier guesses some, and you write one where its guess is not
  enough (`docs/proofs.md`).
