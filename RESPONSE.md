# Response to the review

Both findings are right, and both reproduced exactly as you described before I changed anything. I
wrote a failing test for each first, then fixed the code. `npm test && npm run typecheck` from the
root is green after both fixes.

This review reached me as REVIEW.md. The run froze its workflow at `wf start`, before this change
shipped `output:` on review.md. The next run will hand the findings on as review's closeout.

## 1. `workflow.ts:337`: nested `$defs` and `$ref` get past the strictness walk — **Fixed**

You're right. The walk read only the keywords I had in mind when I wrote it: `properties`, `items`,
`prefixItems`, `anyOf`/`oneOf`/`allOf`. I refused `$defs` at the top level, because only `properties`
is merged into the closeout. But the same object one level down, under a field, was never read. Your
schema loaded, and its loose object would have gone to the harness in the filed schema. That breaks
the promise the refusal makes.

What I changed (`src/workflow.ts`, `looseAt` and its message in `outputOf`):

- **The walk reads every keyword that holds a schema.** The single ones are `items`, `additionalItems`,
  `additionalProperties`, `unevaluatedItems`, `unevaluatedProperties`, `contains`, `propertyNames`,
  `not`, `if`, `then` and `else`. The lists are `allOf`, `anyOf`, `oneOf` and `prefixItems`. The maps
  are `properties`, `patternProperties`, `dependentSchemas`, `dependencies`, `$defs` and `definitions`.
  A walk limited to the keywords the shipped schema happens to use is the same hole again, one
  keyword over.
- **`$ref`, `$dynamicRef` and `$recursiveRef` are refused, not followed.** The message says to inline
  what the reference points at. You offered resolving as an alternative, and I chose not to. Following
  references means handling relative pointers, `$id` and dynamic scopes: a second reading of the schema
  that can disagree with the harness's. The refusal is only as good as that agreement. The cost to an
  author is inlining one definition, and the message names it.

The test in `test/workflow.test.ts` is "an output schema is read strict wherever an object can sit —
and one that points elsewhere with `$ref` is refused". It covers:

- your exact schema;
- each reference keyword, refused even when its target is strict;
- a loose object under each schema-holding keyword, refused with the path where it sits.

It failed before the fix, on "loaded, and should have been refused". README and `docs/features.md`
now list the `$ref` refusal.

## 2. `run.ts:428`: a declared field named `__proto__` vanishes — **Fixed**

You're right, and it was the one accumulator in the change that assigned by a key from outside.
`given[field] = …` with `field === '__proto__'` hits the prototype setter, so no field is created. The
closeout had the field, so it was not reported missing, and it was not in `given` either. The
follower started with `{}` under `## From review`, and `wf decide` printed nothing. Before the fix the
test got exactly your `{"given":{},"missing":[]}`.

What I changed (`src/run.ts`, `declaredOutput`): the fields are collected as entries and built with
`Object.fromEntries`, which creates each one as a property of its own.

I also considered refusing `__proto__` as a field name at load. I decided against it. It is a legal
JSON key, the schema reaches the harness verbatim, and the fault was in one line of mine, not in the
author's schema. A refusal would have hidden the bug behind a rule. I checked the other places this
change builds objects from declared keys, and none of them assign by key:

- `parseCloseout` already uses `Object.fromEntries`;
- `closeoutSchemaOf` merges with object spread, which copies own properties;
- the frozen run record goes through a JSON round trip.

The new test in `test/run.test.ts` is "a declared field named `__proto__` travels like any other". It
follows the field through `declaredOutput`, the unsigned rule (given and missing), the `## From
review` brief, `wf decide`'s lines, and the filed schema's `required`.
