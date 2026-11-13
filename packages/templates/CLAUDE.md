# templates — the factory templates Nemia ships

Each folder here but `test/` and `contracts/` is a template in the template layout (`nemia.yaml`, `RULES.md`, `agents/<a>/`, `workflows/<w>/`,
`skills/<s>/`, `carried/`, and a file a `{ path }` item names), which `nemia template lint <folder>` reads and `nemia factory apply <name> --template <folder>` renders. Only what the
layout gives a place sits inside a template's folder: the workspace's own files (this one, `package.json`, `tsconfig.json`,
`released.json`, `released.ts`, `contracts/`, `test/`) sit beside it, since a render would carry anything inside.

- `sdlc/` — the team that builds Nemia, with this repository's words taken out: six agents and four workflows, the role skills they
  name, and the scripts their checks run, kept once in `carried/` (`landing.ts`, `parts.ts`, `probe.ts`, `pull-request.ts`, `needs.ts` — what build's and quick's needs check and
  fix — with
  `ci-log.ts` and `exec.ts`, which `landing.ts` and `pull-request.ts` import, and `refresh.ts`, the landing refresh `landing.ts` imports), read by a check as `$WF_CARRIED_FILES/<script>.ts`;
  `change.ts` in `quick/` and `cards.ts` in `janitor/`, read as `$WF_WORKFLOW_FILES/<script>.ts`. quick's land step is told build's
  `land.md` (`instruction: { path }`). What the repository a factory is applied to decides is a parameter of `nemia.yaml`, written in text as `${{ parameters.<name> }}`; a carried
  script is never rendered, so a script takes what it needs as a flag (`--check <name>`).
- `sdlc/fences/` — the fence lines several of sdlc's agents share, each a YAML list of strings with each rule's reason beside it, named
  by an agent's list as `- { path: fences/<file>.yaml }` and written out whole by the render: the read-only four take
  `read-only.allow.yaml`, `read-only.deny.yaml` and `help.allow.yaml` (a tool's help and version), the writers `writers.deny.yaml`, the browser's users `browser.*.yaml` and
  `run-code.deny.yaml`. A rule many agents keep goes in a file there, never copied into each; `test/fences.test.ts` reads them and
  proves on the rendered fences what each runs. A line holding a `${{ parameters.… }}` stays on the agent: a shared file's lines are not
  rendered with the parameters.
- **Two copies kept on purpose.** The `github` parameter is spelt in each note that differs by it (`### true`/`### false` headings and
  the check lines): a note is read by an agent whole, and one note per way of landing would copy everything the two share. And every
  change to sdlc's content bumps its version in `nemia.yaml` and `released.json`, so two runs that change sdlc side by side meet there:
  the version is what a factory pins and upgrades by, and a digest no version names would let a change ship unnoticed. The version a
  branch writes is cut again at its landing, from the base as it is then (`released.ts cut`, which the factory's `landingRefresh`
  names; `landedVersion`, proved by `contracts/version.contract.ts`), so the second of two such runs takes the next version on its own.

## Traps

- **Any change to a template's content bumps its `spec.version` and records it in `released.json`**, with the digest `nemia template
  lint <folder>` prints: `test/released.test.ts` refuses changed content under a recorded version.
  Bump from the version your branch forked at: where a sibling lands first, the landing re-cuts it (`released.ts cut`), keeping the
  kind of your bump.
- **No word of this repository in a template**: none of its paths, its tools or its owner's settings. `test/portable.test.ts` holds
  the list; a word it refuses goes in the factory's own overlay, not here.
- **sdlc lands two ways, picked by its `github` parameter** (false, in the checkout, by default; true, on GitHub). A parameter replaces
  a value and cannot change a step, so what differs by way is written in each file that differs: a check line is one shell `if [
  "${{ parameters.github }}" = true ]; then <the GitHub clauses, byte for byte>; else { ${{ parameters.localCheck }}; }; fi`, and a
  rendered note opens with the answer and holds a `### true` part and a `### false` part, then an *Either way* part where the two share one. A carried file (a README,
  a skill, a script) is never rendered, so it says both ways in words. The tests render each way: on GitHub with `github=true`.
- **Never import `agent-orchestrator/src`.** The tests reach the orchestrator through its entries (`agent-orchestrator`,
  `agent-orchestrator/run`, `agent-orchestrator/workflow`) and its CLI (`agent-orchestrator/bin`), and run a step's check as the run
  does, by `checkArgv`. The orchestrator never imports this workspace either: it finds a builtin template by path.
- **A test's roots come from `test-kit/scratch`**, the test kit's (`tools/test-kit`), as every workspace's do. `test/origin.ts` is this
  workspace's own, for its script boundaries.
- **Run one test** from this folder: `node --test test/<file>.test.ts`; the whole workspace: `npx turbo run test --force --continue
  --filter=templates`.
