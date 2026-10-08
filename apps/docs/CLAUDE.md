# apps/docs — the documentation site

Pages for a person who will use Nemia, on Astro Starlight: what Nemia is, the map of its four parts, a page for each part and idea
(the runtime, A2A, workflows, agents, factories, how a run lives, Nemia), a glossary, and getting started. It sits beside the
layers, not among them: it imports no workspace package and depends on none (`test/structure.test.ts`), and reads the repository's
text at build, by path from its root. A page holds landed material only; a term designed and not built sits in the glossary under its
`planned` badge.

## Pages and diagrams

- **A state machine's diagram is its code's**: a page names it with an empty fence, ```` ```mermaid diagram=<name> ````, and
  `src/mermaid.ts` reads it at build from between its `diagram:<name>` markers in `packages/*/README.md` or `packages/*/docs/`. Never
  copy one onto a page; no marker line goes under `apps/` (`agent-orchestrator/test/diagrams.test.ts`).
- **A diagram drawn on a page is a flowchart or a sequence**, and a line beautiful-mermaid would read as nothing fails the build, naming
  it (`unreadLines`). The flowchart parser makes a stray word a node, so that guard catches a broken edge, not every slip: read the
  picture.
- **A backticked path is from the repository's root and a backticked name is one the code has** (`test/names.test.ts`): a span with a
  space is not read, so a command or a key with its colon passes unread. A designed name the code does not have yet is said in words.
- **A link is to a page or an anchor that is there**: `starlight-links-validator` fails the build on one that is not, its heading's slug
  included.

## Checks

- `npm run dev` serves the site on :4321, `npm run build` writes `dist/`; `npm run preview` serves the build, for pictures in light and
  dark (the theme select, or `localStorage['starlight-theme']`).
- `node --test test/<file>.test.ts` from here runs one test file. `test/build.test.ts` builds the site twice, the real one and its own
  configuration pointed at scratch pages with a broken link (`srcDir`); each build is a child process near 1.2 GB that test-costs does
  not count, since it measures the test's own process. That is the toolchain's native floor, not the site's: search off, the mermaid
  plugin off or a heap cap leaves it over 1 GB. The builds run one after the other, so the second adds seconds, not a peak, and the
  links validator has no entry to call outside a build.
- Both builds write this folder's `.astro/`, ignored: a test build and a `npm run dev` at once overwrite each other's types.
- **The prerender environment inlines its dependencies on `astro build` alone** (`prerenderInlinedOnBuild` in `astro.config.mjs`): the build
  needs it for `cookie`, and in dev it makes Vite's runner evaluate CommonJS `picomatch` with no `require`. `test/build.test.ts` starts
  dev through `dev()` in a child (`test/dev.ts`), which writes no `.astro/dev.json`, and fails on the prerender server's error.
