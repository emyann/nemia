# objects — the shapes of the objects Nemia serves

`packages/objects` (npm name `objects`) holds what every kind Nemia serves is, as Effect Schemas: the metadata every object carries,
the envelope of a list (`src/meta.ts`), and, as the kinds move in, each kind's object and the HttpApi definition that serves them. The
orchestrator, the api, the board and the client import it through its one entry, `objects` (`src/index.ts`); the runtime never does
(`docs/architecture.md`, *The layers*).

## Files to copy from

- **Fields served together that only go together in some sets**: a step's, a try's and a run's codes. `contracts/codes.contract.ts`
  states which sets are legal in the domain's groups; `src/codes.ts` keeps the table (`as const satisfies`, so a package above can type
  its own rows by it and load nothing of this one) and the predicates; the served schemas ask them with `.check(Schema.makeFilter(…))`
  (`src/run.ts`), so a set nothing makes is refused as it is encoded and as a client decodes it; `test/run.test.ts` plants one of each.

## Traps

- **A field says what it is on its Schema, never only in the comment above it**: `.annotate({ description: '…' })` on the field's
  schema, inside `Schema.optionalKey(…)` for an optional one, since the document a client, the reference page and the MCP port's tools
  read holds no comment. A field that is another schema whole (a bare `$ref` in the document) keeps no word of its own, so that
  schema's own `description` says it, set where it is defined: annotated where it is used, a schema with an `identifier` becomes a
  second component, `<Name>_1`, whose every field is owed again, and `test/one-component.test.ts` refuses one but those the
  `httpApiStatus: 201` pipes make today. On a schema that takes a `.check(…)`, the description goes before the check: after it, the
  document drops it. So does `Schema.Number`'s own description, and `Schema.Unknown`'s: a number is described by `describedNumber`, an
  unknown by `describedOne` (`src/meta.ts`). `test/described.test.ts` counts the fields still said nowhere, per component and per
  operation (by its `operationId`), in `test/described.baseline.json`, which only shrinks: a property at any depth (nested, an array's
  items, a union's branches, a record's values) of a component or of a body or an answer inlined into its operation, and each path and
  query parameter, described on the field's Schema in the endpoint's `params` or `query` Struct, whose words effect writes on
  `parameter.schema.description`. Describe a field and lower its count in the same commit (`node test/described.test.ts --print`
  prints today's). A nullable field is described on its `NullOr`, an optional one inside `Schema.optionalKey(…)` or on
  `Schema.optional(…)` whole, and a `Schema.fromJsonString(…)` field by `Schema.annotateEncoded`: the document drops a description set
  inside them.
- **An endpoint says what it does on itself**: `.annotate(OpenApi.Description, '…')` on the `HttpApiEndpoint` where its group defines
  it, one or two sentences in the api's words — what it reads or changes, and what it answers — never a command's help, which the api's
  page shows under it on its own (`apps/api/src/openapi/openapi.ts`). `test/described-endpoints.test.ts` refuses an endpoint with none
  and one that copies a help line of a command that links it; its baseline, `test/described-endpoints.baseline.json`, only shrinks.

- **`nemia/v1` is additions only once it has a client besides the owner's board, CLI and MCP port.** Until then a break is done at
  once, with no alias, the three moved in the same change, and said beside the word it breaks (the origin `user`, once spelled
  otherwise, and the write way `library`). From then on a key added to an object is optional, and no key changes its meaning or its
  type under the same `apiVersion`: a reader of an older store, or an older client, reads the object still, and a change that breaks a
  reader is a new version beside this one, never an edit of it.
- **It imports `effect` and nothing else**: no workspace package, no node built-in, no path out of `src` but a contract's type
  (`import type` of `../contracts/<name>.contract.ts`, which the verifier proves the function by: `discovery.ts`'s `resourcesOf`). The
  board runs it in a browser, and the layers above share it, so a reach to any of them would be a cycle. The lint block for
  `packages/objects/src` in `.oxlintrc.json` refuses every other import as typed, held by
  `agent-orchestrator/test/imports.boundary.test.ts`.
- **The command words live here**: every command the client holds (`COMMAND_WORDS`, `src/commands.ts`) is said once, a group to a
  file (`src/commands-<group>.ts`, cut by concept past ~450 lines, the flags several share in `commands-flags.ts`, the former names
  in `commands-renamed.ts`, `MACHINE_VERBS` and `STREAM_COMMANDS` in `commands-machine.ts`), with its parser (`src/command.ts`); the
  client runs them and the orchestrator's entries spread them, so a word changed here changes what admission and the MCP port read.
  Their refusals are held in `test/commands-*.test.ts`.
- **One entry.** Every name another layer needs is re-exported by name from `src/index.ts`; `objects/src/...` is refused by the
  `exports` map, by the web's and the client's lint blocks, and by `agent-orchestrator/test/contract.test.ts`.
- **Plain Schemas of JSON**: strings, numbers, booleans, literals, records, arrays and structs, with no brand, no check and no
  transformation, so that `OpenApi.fromApi` writes each into the api's document as it is and a client decodes what the api encoded.
- **`effect/http-api` and `effect/http` are marked `@stability unstable`** (the paths effect 4.1.5 exports them by): their names may
  move in a minor release of effect, which is why `effect` is pinned exactly (`4.1.5`) here as in every package, and moved in every
  package at once.
- **One client of the api**: `apiClient` (`src/api-client.ts`) is the one constructor of the `Api`'s typed client, which the client and
  the board each make, and what it sets up around the contract (a bodiless write's `{}`, the
  bearer, the headers, the bound, an undeclared status decoded into `Answered`) is decided there alone. Any other `HttpApiClient`
  constructor in the repository is refused, with no baseline (`tools/guards/test/one-api-client.test.ts`).
- **Run one test** from this folder: `npx vitest run test/<file>.test.ts`; the whole package: `npx turbo run test --force --continue
  --filter=objects`.
