# objects — the shapes of the objects Nemia serves

`packages/objects` (npm name `objects`) holds what every kind Nemia serves is, as Effect Schemas: the metadata every object carries,
the envelope of a list (`src/meta.ts`), and, as the kinds move in, each kind's object and the HttpApi definition that serves them. The
orchestrator, the api, the board and the client import it through its one entry, `objects` (`src/index.ts`); the runtime never does
(`docs/architecture.md`, *The layers*).

## Traps

- **`nemia/v1` is additions only.** A key added to an object is optional, and no key changes its meaning or its type under the same
  `apiVersion`: a reader of an older store, or an older client, reads the object still. A change that breaks a reader is a new
  version beside this one, never an edit of it.
- **It imports `effect` and nothing else**: no workspace package, no node built-in, no path out of `src` but a contract's type
  (`import type` of `../contracts/<name>.contract.ts`, which the verifier proves the function by: `discovery.ts`'s `resourcesOf`). The
  board runs it in a browser, and the layers above share it, so a reach to any of them would be a cycle. The lint block for
  `packages/objects/src` in `.oxlintrc.json` refuses every other import as typed, held by
  `agent-orchestrator/test/imports.boundary.test.ts`.
- **One entry.** Every name another layer needs is re-exported by name from `src/index.ts`; `objects/src/...` is refused by the
  `exports` map, by the web's and the client's lint blocks, and by `agent-orchestrator/test/contract.test.ts`.
- **Plain Schemas of JSON**: strings, numbers, booleans, literals, records, arrays and structs, with no brand, no check and no
  transformation, so that `OpenApi.fromApi` writes each into the api's document as it is and a client decodes what the api encoded.
- **`effect/http-api` and `effect/http` are marked `@stability unstable`** (the paths effect 4.1.2 exports them by): their names may
  move in a minor release of effect, which is why `effect` is pinned exactly (`4.1.2`) here as in every package, and moved in every
  package at once.
- **One client of the api**: `apiClient` (`src/api-client.ts`) is the one constructor of the `Api`'s typed client, which the client,
  the orchestrator's CLI forwarded and the board each make, and what it sets up around the contract (a bodiless write's `{}`, the
  bearer, the headers, the bound, an undeclared status decoded into `Answered`) is decided there alone. Any other `HttpApiClient`
  constructor in the repository is refused, with no baseline (`tools/guards/test/one-api-client.test.ts`).
- **Run one test** from this folder: `node --test test/<file>.test.ts`; the whole package: `npx turbo run test --force --continue
  --filter=objects`.
