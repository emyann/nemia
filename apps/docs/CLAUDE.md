# apps/docs — the documentation site

Pages for a person who will use Nemia, on Astro Starlight: what Nemia is, the map of its four parts, a page for each part and idea
(the runtime, A2A, workflows, agents, factories, how a run lives, Nemia), a glossary, and getting started. It sits beside the
layers, not among them: it imports no workspace package and depends on none, and reads the repository's text at build, by path from
its root. A page holds landed material only; a term designed and not built sits in the glossary under its `planned` badge.

## Pages and diagrams

- **A state machine's diagram is its code's**: a page names it with an empty fence, ```` ```mermaid diagram=<name> ````, and
  `src/mermaid.ts` reads it at build from between its `diagram:<name>` markers in `packages/*/README.md` or `packages/*/docs/`.
- A line beautiful-mermaid would read as nothing fails the build, naming it (`unreadLines`), but the flowchart parser makes a stray word
  a node, so that guard catches a broken edge, not every slip: read the picture.
- A backticked span with a space in it, or a colon that no digits follow, is read by no check of a page's citations: a command
  (`npm run dev`) or a key with its colon passes unread, so a name the code does not have yet is said in words `(no test yet)`.
- **A link is to a page or an anchor that is there**: `starlight-links-validator` fails the build on one that is not, its heading's slug
  included.

## Checks

- `npm run dev` serves the site on :4321, `npm run build` writes `dist/`; `npm run preview` serves the build, for pictures in light and
  dark (the theme select, or `localStorage['starlight-theme']`).
- `node --test test/<file>.test.ts` from here runs one test file. **No test builds the real site**: `npm run build` runs `astro build`
  and then `built.ts` over `dist/`, which is where the pages and the one home of each code-drawn machine are asserted.
  `test/build.test.ts` builds this site's own configuration pointed at scratch pages with a broken link (`srcDir`) and nothing else;
  that build is a child process near 1.2 GB that test-costs does not count, since it measures the test's own process. That is the
  toolchain's native floor, not the site's: search off, the mermaid plugin off or a heap cap leaves it over 1 GB, and the links
  validator has no entry to call outside a build.
- That build writes this folder's `.astro/`, ignored: a test build and a `npm run dev` at once overwrite each other's types. A test
  holds no fact of `.astro/dev.json` but the pid it names: a person's `npm run dev` owns that file, and an equality on it read before
  and after a test made their write the test's failure.
- **A test here waits with `until`** (`test/waits.ts`, the runtime's copy, held to `packages/agent-runtime/src/waits/waits.ts` by the
  fence in that package's `test/waits.test.ts`), its test given `WAITED`, and no spawn under `test/` takes a `timeout:` or a
  `killSignal:`: the runner's `--test-timeout` is the one bound.
- **The prerender environment inlines its dependencies on `astro build` alone** (`prerenderInlinedOnBuild` in `astro.config.mjs`): the build
  needs it for `cookie`, and in dev it makes Vite's runner evaluate CommonJS `picomatch` with no `require`. `test/build.test.ts` starts
  dev through `dev()` in a child (`test/dev.ts`), which writes no `.astro/dev.json`, and fails on the prerender server's error.
