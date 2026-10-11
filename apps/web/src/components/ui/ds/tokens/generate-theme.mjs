#!/usr/bin/env node
/* =============================================================================
   Generate a theme from a DESIGN.md.

     npm run theme:generate           # the kit's default, from the kit's own DESIGN.md
     npm run theme:resolve            # refresh tokens/resolved.json afterwards

     tsx tokens/generate-theme.mjs <DESIGN.md> [--out <dir>]

   A project passes its own DESIGN.md and `--out`, so its theme is written
   beside its app and the kit's default stays as shipped:

     npx tsx <kit>/tokens/generate-theme.mjs DESIGN.md --out theme

   Writes, beside this script (or into --out, created when missing):

     theme.css            both colour schemes and the font hooks, whole; dark
                          on a `.dark` class or on the system setting
     theme.v4.css         its type, corner, face, elevation, state and motion
                          declarations set by name
     DESIGN.resolved.md   the complete DESIGN.md, for agents

   The front matter gives the colours, the type and the corners; the `:root`
   rule of the body's `## Reference CSS` block gives the rest. The derivation
   is tokens/design-md.mjs; the names it reads are in the `ds-theme` skill,
   skills/ds-theme/design-md.md. Warnings go to stderr and into
   DESIGN.resolved.md, and the theme is still written. A file the kit refuses
   exits 1 and writes nothing.

   Run through `tsx`: `@material/material-color-utilities` 0.4.x ships
   extension-less ESM imports Node refuses.
   ========================================================================== */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DesignMdError, generateTheme } from "./design-md.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const outFlag = args.indexOf("--out");
const out = outFlag < 0 ? here : resolve(args.splice(outFlag, 2)[1] ?? "");
const [source] = args;
if (!source || args.length !== 1) {
  console.error("Usage: tsx generate-theme.mjs <DESIGN.md> [--out <dir>]");
  process.exit(1);
}

let generated;
try {
  generated = generateTheme(
    readFileSync(source, "utf8"),
    readFileSync(join(here, "theme.v4.css"), "utf8"),
  );
} catch (error) {
  if (!(error instanceof DesignMdError) && error.code !== "ENOENT") throw error;
  console.error(error.message);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "theme.css"), generated.themeCss);
writeFileSync(join(out, "theme.v4.css"), generated.themeV4Css);
writeFileSync(join(out, "DESIGN.resolved.md"), generated.resolvedDesignMd);

for (const warning of generated.warnings) {
  console.error(`warning: ${warning.message}`);
}
console.log(
  `theme.css, theme.v4.css, DESIGN.resolved.md: generated from ${source} (${generated.warnings.length} warnings)`,
);
