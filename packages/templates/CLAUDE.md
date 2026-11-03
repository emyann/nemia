# templates — the factory templates Nemia ships

Each folder here but `test/` is a template in the template layout (`nemia.yaml`, `RULES.md`, `agents/<a>/`, `workflows/<w>/`,
`skills/<s>/`), which `nemia template lint <folder>` reads and `nemia factory apply <name> --template <folder>` renders. Only what the
layout gives a place sits inside a template's folder: the workspace's own files (this one, `package.json`, `tsconfig.json`,
`released.json`, `test/`) sit beside it, since a render would carry anything inside.

- `sdlc/` — the team that builds Nemia, with this repository's words taken out: six agents and four workflows, the role skills they
  name, and the scripts their checks run (`landing.ts`, `pull-request.ts`, `probe.ts` in `build/` and `quick/`, held equal byte for
  byte; `change.ts` in `quick/`; `cards.ts` in `janitor/`). What the repository a factory is applied to decides is a parameter of
  `nemia.yaml`, written in text as `${{ parameters.<name> }}`; a carried script is never rendered, so a script takes what it needs as
  a flag (`--check <name>`).

## Traps

- **Any change to a template's content bumps its `spec.version` and records it in `released.json`**, with the digest `nemia template
  lint <folder>` prints: `test/released.test.ts` refuses changed content under a recorded version.
- **No word of this repository in a template**: none of its paths, its tools or its owner's settings. `test/portable.test.ts` holds
  the list; a word it refuses goes in the factory's own overlay, not here.
- **Never import `agent-orchestrator/src`.** The tests reach the orchestrator through its entries (`agent-orchestrator`,
  `agent-orchestrator/run`, `agent-orchestrator/workflow`) and its CLI (`agent-orchestrator/bin`), and run a step's check as the run
  does, by `checkArgv`. The orchestrator never imports this workspace either: it finds a builtin template by path.
- **The test helpers `test/scratch.ts` and `test/origin.ts` are byte copies** of the orchestrator's, held equal by its
  `test/scratch.test.ts`: change the orchestrator's and copy it here.
- **Run one test** from this folder: `node --test test/<file>.test.ts`; the whole workspace: `npx turbo run test --force --continue
  --filter=templates`.
