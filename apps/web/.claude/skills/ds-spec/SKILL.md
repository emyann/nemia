---
name: ds-spec
description: "Use when a design decision in this project's design system needs what Material Design 3 says: before building, reviewing or migrating a component in the ds folder (src/components/ui/ds), and whenever a size, a state, a colour role or a Do and Don't is in question. Reads the current spec, guidelines, accessibility rules and component tokens from m3.material.io, with no browser, cached per site version."
---

# ds-spec — the Material 3 spec on demand

`md3.mjs` next to this file fetches m3.material.io's own JSON (the site is a
client-rendered app; its content is plain, versioned JSON) and prints
markdown. Nothing is stored in the project: what you read is what the site
serves now, cached under `~/.cache/ds-spec/<site-version>/` and re-checked
at most once a day.

```bash
node .claude/skills/ds-spec/md3.mjs <command>
```

`md3` in the table is that command.

| Command                                                                                                    | What you get                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `md3 list [filter]`                                                                                        | every page the site publishes (91: components, foundations, styles) with its tabs                                                                                     |
| `md3 page <page> [tab]`                                                                                    | one page as markdown — `overview`, `specs`, `guidelines`, `accessibility`; omit the tab for all four                                                                  |
| `md3 tokens <page> [--theme dark] [--contrast "high contrast"] [--platform android] [--filter …] [--json]` | the component's `md.comp.*` tokens resolved for that context: value + reference chain (`md.sys.color.primary → md.ref.palette.primary40`), grouped by state / element |
| `md3 check [--file <path>] [--strict]`                                                                     | site version vs the `carbonVersion` a project recorded in a JSON file of its own (default `spec-version.json` in the current folder); `--strict` exits 1 on drift (CI) |
| `md3 refresh`                                                                                              | re-read the site version now                                                                                                                                          |

Every output starts with a provenance line: source URL, site version, page
`updated` date (or token-db version) — quote it when you report findings.

## When to use it

- **Building a component**: read `page <c> specs` (anatomy, measurements,
  color roles), `page <c> guidelines` (Do/Don't, behaviour), `page <c>
accessibility` (labels, keyboard, targets), then `tokens <c>` for exact
  values and their `md.sys` references. Encode the values as role utilities,
  not literals.
- **Reviewing a component**, against the four pages (overview, specs,
  guidelines, accessibility): check anatomy and measurements (incl. the 48dp
  touch target),
  states and color roles per state, every Do/Don't, every accessibility
  requirement. Link the pages from the component's doc comment and record
  deliberate deviations there. A component whose doc comment says "Material 3
  does not describe this component." has no page of its own: review it against
  that doc comment, and against the pages it cites for the parts it borrows.
- **Answering a design question** ("should this be a switch or a
  checkbox?"): the guidelines tabs carry the decision rules; cite them.
- **Tokens and theming**: `page design-tokens` (foundations) explains roles
  and how to use tokens; `tokens <component>` shows how a component consumes
  them.

## Reading the output

- `✅ **Do** — …` / `❌ **Don't** — …` are the site's guideline callouts
  (image chunks with a caption modifier); the image itself is not fetched.
- Spec tables (`| Attribute | Value |`) are the site's measurement tables.
- `> Token table — run md3 tokens …` marks where the site embeds its token
  viewer; the tokens command renders the same data.
- Token values: colors as hex, lengths in `dp`, opacities as fractions,
  shapes as families (`circular`). `via` is the reference chain; `—` means
  the token has no value for the selected context.
- Context defaults follow the site (Theme Light, Contrast Default, Platform
  per the token db's default); override with the flags.

## Caveats

- These endpoints are undocumented internals of m3.material.io. The script
  fails loudly ("the site changed shape") rather than guessing; if that
  happens, the fix is usually one regex in `getSite`.
- Content © Google, licensed CC BY 4.0 / Apache 2.0 — attribute when you
  reproduce it (the provenance line does).
- Foundations/styles pages describe tokens in prose and have no token table.
