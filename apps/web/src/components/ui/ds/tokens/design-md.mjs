/* =============================================================================
   DESIGN.md → theme

   Turns a project's DESIGN.md (Google Labs' format, `@google/design.md`) into
   the kit's theme: both colour schemes, the type scale, the corners, and the
   elevation, motion and state opacities its body carries. Pure —
   text in, text and warnings out, no file access — so it can be copied with
   the kit and run anywhere; tokens/generate-theme.mjs is the command that
   reads and writes the files.

   What the front matter means to the kit (the contract is in the `ds-theme`
   skill, skills/ds-theme/design-md.md):

     scheme       `light` or `dark`: the scheme the file's colour roles write.
                  The format has no such key: a file that writes none has it
                  read from its ground (`colors.background`, else
                  `colors.surface`), light or dark by its tone.
     colors       `seed` (read from `primary` when the file writes none, the
                  format having no such key) and the optional `*-key` colours
                  (`primary-key`, `secondary-key`, `tertiary-key`,
                  `neutral-key`, `neutral-variant-key`, `error-key`) build the
                  tonal palettes; any of the 49 role names written here wins
                  over the derived role, in the written scheme. The other
                  scheme is derived from the key colours alone. The `*-fixed*`
                  roles are the same in both schemes, so a written one applies
                  to both.
     typography   the 15 Material type roles (`display-large` … `label-small`,
                  or with the format's short sizes, `title-md`), each with the
                  family written on it, or its face's when it writes none
                  (`display-large` names the brand face, `body-large` the
                  plain one), and `mono`: the `fontFamily` of the face the project
                  reaches for with `font-mono`. No kit component uses it.
     rounded      the 6 corners (`extra-small` … `full`, or the format's
                  short `xs`, `sm`, `md`, `lg`, `xl`).

   What the body means to the kit: under `## Reference CSS`, the first `css`
   fence, and in it the first top-level `:root` rule.

     --md3-dark-mode   `class` (the default) or `system`: how the dark scheme
                       is switched. Never written into the theme.
     the 27 variables of REFERENCE_DEFAULTS: elevation, state layer opacities,
                       easings and durations, under the theme's own names.

   Every other name is ignored and listed in the warnings; so is a written
   colour pair whose contrast is poor, and so is what was assumed (a scheme, a
   seed), with the token it was read from. Prose is never read.

   `@material/material-color-utilities` 0.4.x ships extension-less ESM imports
   Node refuses, so whatever imports this module runs through `tsx`.
   ========================================================================== */

import {
  Contrast,
  DynamicScheme,
  Hct,
  MaterialDynamicColors,
  TonalPalette,
  Variant,
  argbFromHex,
  hexFromArgb,
  lstarFromArgb,
} from "@material/material-color-utilities";
import { parse, stringify } from "yaml";

/** A DESIGN.md the kit refuses; the message names the token at fault. */
export class DesignMdError extends Error {
  name = "DesignMdError";
}

/** CSS variable name → MaterialDynamicColors key, grouped as theme.css lays
    them out. The group titles are the comments of the light block. */
const ROLE_GROUPS = [
  [
    "Accent roles",
    {
      primary: "primary",
      "on-primary": "onPrimary",
      "primary-container": "primaryContainer",
      "on-primary-container": "onPrimaryContainer",
      secondary: "secondary",
      "on-secondary": "onSecondary",
      "secondary-container": "secondaryContainer",
      "on-secondary-container": "onSecondaryContainer",
      tertiary: "tertiary",
      "on-tertiary": "onTertiary",
      "tertiary-container": "tertiaryContainer",
      "on-tertiary-container": "onTertiaryContainer",
      error: "error",
      "on-error": "onError",
      "error-container": "errorContainer",
      "on-error-container": "onErrorContainer",
    },
  ],
  [
    "Surfaces",
    {
      background: "background",
      "on-background": "onBackground",
      surface: "surface",
      "on-surface": "onSurface",
      "surface-variant": "surfaceVariant",
      "on-surface-variant": "onSurfaceVariant",
      "surface-dim": "surfaceDim",
      "surface-bright": "surfaceBright",
      "surface-container-lowest": "surfaceContainerLowest",
      "surface-container-low": "surfaceContainerLow",
      "surface-container": "surfaceContainer",
      "surface-container-high": "surfaceContainerHigh",
      "surface-container-highest": "surfaceContainerHighest",
      "surface-tint": "surfaceTint",
    },
  ],
  [
    "Outlines, shadow, scrim",
    {
      outline: "outline",
      "outline-variant": "outlineVariant",
      shadow: "shadow",
      scrim: "scrim",
    },
  ],
  [
    "Inverse",
    {
      "inverse-surface": "inverseSurface",
      "inverse-on-surface": "inverseOnSurface",
      "inverse-primary": "inversePrimary",
    },
  ],
  [
    "Fixed roles",
    {
      "primary-fixed": "primaryFixed",
      "on-primary-fixed": "onPrimaryFixed",
      "primary-fixed-dim": "primaryFixedDim",
      "on-primary-fixed-variant": "onPrimaryFixedVariant",
      "secondary-fixed": "secondaryFixed",
      "on-secondary-fixed": "onSecondaryFixed",
      "secondary-fixed-dim": "secondaryFixedDim",
      "on-secondary-fixed-variant": "onSecondaryFixedVariant",
      "tertiary-fixed": "tertiaryFixed",
      "on-tertiary-fixed": "onTertiaryFixed",
      "tertiary-fixed-dim": "tertiaryFixedDim",
      "on-tertiary-fixed-variant": "onTertiaryFixedVariant",
    },
  ],
];

/** The 49 colour roles, in theme.css order. */
export const ROLES = Object.assign(
  {},
  ...ROLE_GROUPS.map(([, roles]) => roles),
);

/** Scheme-invariant in Material: one value under both `:root` and `.dark`. */
const isFixedRole = (role) => role.includes("-fixed");

/** Key colour name → the DynamicScheme palette it replaces. `seed` is the
    source colour every palette without a key of its own is derived from:
    its hue at a fixed chroma for the primary palette, so a muted primary
    needs `primary-key`. */
const KEYS = {
  "primary-key": "primaryPalette",
  "secondary-key": "secondaryPalette",
  "tertiary-key": "tertiaryPalette",
  "neutral-key": "neutralPalette",
  "neutral-variant-key": "neutralVariantPalette",
  "error-key": "errorPalette",
};

const SCHEMES = ["light", "dark"];

/* The DESIGN.md format's short sizes, as its own examples and tools write
   them, read as Material's names. Nothing outside these two tables is
   mapped: any other name stays ignored and listed. */
const SIZE_ALIASES = { lg: "large", md: "medium", sm: "small" };
const CORNER_ALIASES = {
  xs: "extra-small",
  sm: "small",
  md: "medium",
  lg: "large",
  xl: "extra-large",
};

/** `title-md` → `title-medium`; any other name is returned as it is. */
function typeRoleOf(name) {
  const [, group, size] = /^([a-z]+)-(lg|md|sm)$/.exec(name) ?? [];
  const role = `${group}-${SIZE_ALIASES[size]}`;
  return Object.hasOwn(TYPE_DEFAULTS, role) ? role : name;
}

const cornerOf = (name) =>
  Object.hasOwn(CORNER_ALIASES, name) ? CORNER_ALIASES[name] : name;

/** A section's entries under Material's names: `[name, value, written]`,
    `written` being the key the file wrote. Where a file writes both a short
    name and Material's, Material's is read and the short one is listed. */
function byMaterialName(written, section, nameOf, warnings) {
  const entries = [];
  for (const [key, value] of Object.entries(written)) {
    const name = nameOf(key);
    if (name !== key && Object.hasOwn(written, name)) {
      warnings.push({
        kind: "unapplied",
        token: `${section}.${key}`,
        message: `${section}.${key}: ${section}.${name} is written too, and is the one read — not applied`,
      });
    } else entries.push([name, value, key]);
  }
  return entries;
}

/* Material's baseline type scale and corners: what a DESIGN.md that writes
   none of them gets, so the output never depends on what a previous run left
   in the files. */
const type = (fontSize, lineHeight, letterSpacing, fontWeight) => ({
  fontFamily: "Roboto",
  fontSize: `${fontSize}px`,
  fontWeight,
  lineHeight: `${lineHeight}px`,
  letterSpacing: `${letterSpacing}px`,
});

export const TYPE_DEFAULTS = {
  "display-large": type(57, 64, -0.25, 400),
  "display-medium": type(45, 52, 0, 400),
  "display-small": type(36, 44, 0, 400),
  "headline-large": type(32, 40, 0, 400),
  "headline-medium": type(28, 36, 0, 400),
  "headline-small": type(24, 32, 0, 400),
  "title-large": type(22, 28, 0, 400),
  "title-medium": type(16, 24, 0.15, 500),
  "title-small": type(14, 20, 0.1, 500),
  "body-large": type(16, 24, 0.5, 400),
  "body-medium": type(14, 20, 0.25, 400),
  "body-small": type(12, 16, 0.4, 400),
  "label-large": type(14, 20, 0.1, 500),
  "label-medium": type(12, 16, 0.5, 500),
  "label-small": type(11, 16, 0.5, 500),
};

export const CORNER_DEFAULTS = {
  "extra-small": "4px",
  small: "8px",
  medium: "12px",
  large: "16px",
  "extra-large": "28px",
  full: "9999px",
};

/* The kit's own elevation, state layer opacities, easings and durations
   (Material's baseline), under the names theme.v4.css declares them with and
   in its order: what a DESIGN.md whose body writes none of them gets. */
const shadow = (key, ambient) =>
  `${key} --alpha(var(--md-sys-color-shadow) / 30%), ${ambient} --alpha(var(--md-sys-color-shadow) / 15%)`;

export const REFERENCE_DEFAULTS = {
  "--md-sys-elevation-1": shadow("0 1px 2px 0", "0 1px 3px 1px"),
  "--md-sys-elevation-2": shadow("0 1px 2px 0", "0 2px 6px 2px"),
  "--md-sys-elevation-3": shadow("0 1px 3px 0", "0 4px 8px 3px"),
  "--md-sys-elevation-4": shadow("0 2px 3px 0", "0 6px 10px 4px"),
  "--md-sys-elevation-5": shadow("0 4px 4px 0", "0 8px 12px 6px"),
  "--md-sys-state-hover-state-layer-opacity": "8%",
  "--md-sys-state-focus-state-layer-opacity": "10%",
  "--md-sys-state-pressed-state-layer-opacity": "10%",
  "--md-sys-state-dragged-state-layer-opacity": "16%",
  "--md-sys-motion-easing-standard": "cubic-bezier(0.2, 0, 0, 1)",
  "--md-sys-motion-easing-standard-accelerate": "cubic-bezier(0.3, 0, 1, 1)",
  "--md-sys-motion-easing-standard-decelerate": "cubic-bezier(0, 0, 0, 1)",
  "--md-sys-motion-easing-emphasized": "cubic-bezier(0.2, 0, 0, 1)",
  "--md-sys-motion-easing-emphasized-accelerate":
    "cubic-bezier(0.3, 0, 0.8, 0.15)",
  "--md-sys-motion-easing-emphasized-decelerate":
    "cubic-bezier(0.05, 0.7, 0.1, 1)",
  "--md3-duration-short-1": "50ms",
  "--md3-duration-short-2": "100ms",
  "--md3-duration-short-3": "150ms",
  "--md3-duration-short-4": "200ms",
  "--md3-duration-medium-1": "250ms",
  "--md3-duration-medium-2": "300ms",
  "--md3-duration-medium-3": "350ms",
  "--md3-duration-medium-4": "400ms",
  "--md3-duration-long-1": "450ms",
  "--md3-duration-long-2": "500ms",
  "--md3-duration-long-3": "550ms",
  "--md3-duration-long-4": "600ms",
};

/** The heading the kit reads the reference block under. */
const REFERENCE_HEADING = "Reference CSS";

/** How the dark scheme is switched: the block's `--md3-dark-mode`. */
const DARK_MODE = "--md3-dark-mode";
const DARK_MODES = ["class", "system"];

/* What is copied from the file into CSS is one value of the kind its place
   takes, so nothing a DESIGN.md writes can end its declaration and open
   another. `var()` and `calc()` stand in an elevation only. */
const NUMBER = "(?:\\d+\\.?\\d*|\\.\\d+)";
const SIGNED = `[+-]?${NUMBER}`;
const UNIT = "(?:[a-z]+|%)";
const whole = (source) => new RegExp(`^(?:${source})$`, "i");
const NUMERIC = whole(SIGNED);

const EASING = whole(
  [
    "linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end",
    `cubic-bezier\\(\\s*${SIGNED}(?:\\s*,\\s*${SIGNED}){3}\\s*\\)`,
    "steps\\(\\s*\\d+(?:\\s*,\\s*[a-z-]+)?\\s*\\)",
    `linear\\(\\s*${SIGNED}(?:\\s+${NUMBER}%){0,2}(?:\\s*,\\s*${SIGNED}(?:\\s+${NUMBER}%){0,2})*\\s*\\)`,
  ].join("|"),
);

/** The functions a shadow layer may call: colours, variables and math. None
    of them names an address. */
const SHADOW_FUNCTIONS = [
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "color",
  "color-mix",
  "light-dark",
  "var",
  "calc",
  "min",
  "max",
  "clamp",
  "--alpha",
];

/** What a shadow list is made of, tried in this order at each position. */
const SHADOW_TOKENS = [
  ["space", /\s+/y],
  ["call", /(--[a-z][a-z0-9-]*|[a-z][a-z0-9-]*)\(/iy],
  ["value", /--[a-z0-9_-]+(?!\()/iy],
  ["value", new RegExp(`${SIGNED}${UNIT}?`, "iy")],
  ["value", /#[0-9a-f]{3,8}/iy],
  ["value", /-?[a-z_][a-z0-9_-]*(?!\()/iy],
  ["open", /\(/y],
  ["close", /\)/y],
  ["comma", /,/y],
  ["operator", /[/+*-]/y],
];

/** `none`, or a comma list of shadow layers: lengths, colours, keywords and
    the calls of SHADOW_FUNCTIONS, in balanced parentheses, with no empty
    layer. A quote, a `;`, a brace, a backslash, a comment mark or any other
    function is not part of one. */
function isShadowList(value) {
  if (/\/\*|\*\//.test(value)) return false;
  let depth = 0;
  let filled = false;
  for (let at = 0; at < value.length; ) {
    let kind;
    let match = null;
    for (const [name, token] of SHADOW_TOKENS) {
      token.lastIndex = at;
      match = token.exec(value);
      kind = name;
      if (match) break;
    }
    if (!match) return false;
    at += match[0].length;
    if (kind === "call") {
      if (!SHADOW_FUNCTIONS.includes(match[1].toLowerCase())) return false;
      depth++;
    } else if (kind === "open") depth++;
    else if (kind === "close") {
      if (--depth < 0) return false;
    } else if (kind === "comma" && depth === 0) {
      if (!filled) return false;
      filled = false;
      continue;
    }
    if (kind !== "space") filled = true;
  }
  return depth === 0 && filled;
}

/** What each of the 27 values may hold. Other CSS depends on the form of two
    of them: a state opacity is the alpha of a `color-mix()`, a duration is
    read by tokens/resolve-theme.mjs. */
const REFERENCE_FORMS = [
  [
    /^--md-sys-elevation-/,
    { test: isShadowList },
    "a `box-shadow` value (`0 1px 2px rgb(0 0 0 / 30%)`, `none`)",
  ],
  [/^--md-sys-state-/, /^\d*\.?\d+%$/, "a percentage (`8%`)"],
  [
    /^--md-sys-motion-easing-/,
    EASING,
    "an easing function (`cubic-bezier(0.2, 0, 0, 1)`, `ease-out`)",
  ],
  [/^--md3-duration-/, /^\d*\.?\d+ms$/, "milliseconds (`200ms`)"],
];

/** The elevation values are layered shadows, written one layer per line. */
const isLayered = (name) => name.startsWith("--md-sys-elevation-");

/** What a type property and a corner may hold: the DESIGN.md format's
    dimension, a number with a unit. */
const LENGTH = whole(`\\+?${NUMBER}${UNIT}`);
const ZERO = whole("[+-]?0+(?:\\.0*)?|[+-]?\\.0+");
const TYPE_FORMS = {
  fontSize: [(value) => LENGTH.test(value), "a length (`16px`, `1.125rem`)"],
  lineHeight: [
    (value) => LENGTH.test(value) || whole(`\\+?${NUMBER}`).test(value),
    "a length or a number (`24px`, `1.5`)",
  ],
  letterSpacing: [
    (value) => whole(`${SIGNED}${UNIT}`).test(value) || ZERO.test(value),
    "a length (`0.5px`, `-0.02em`, `0`)",
  ],
  fontWeight: [
    (value) =>
      /^(?:normal|bold)$/.test(value) ||
      (NUMERIC.test(value) && Number(value) >= 1 && Number(value) <= 1000),
    "a weight (a number from 1 to 1000, `normal`, `bold`)",
  ],
};
const CORNER_FORM = [
  (value) => LENGTH.test(value) || ZERO.test(value),
  "a length (`8px`, `0.5rem`, `0`)",
];

/** Refuses a front-matter value that is not one value of its kind. The value
    is kept as the file wrote it. */
function oneValue(token, value, [holds, kind]) {
  const scalar = typeof value === "string" || typeof value === "number";
  if (!scalar || !holds(String(value))) {
    throw new DesignMdError(
      `DESIGN.md: ${token} is ${JSON.stringify(value)} — the kit reads ${kind}`,
    );
  }
  return value;
}

/** Sections the kit writes into DESIGN.resolved.md, dropped when read back. */
const UNREAD_HEADING = "Resolved reference CSS";
const GENERATED_HEADINGS = [
  UNREAD_HEADING,
  "Resolved schemes",
  "Generator warnings",
];

/** What the format's front matter may hold, and the kit's own `scheme`. */
const FRONT_KEYS = [
  "version",
  "name",
  "description",
  "omitted",
  "colors",
  "typography",
  "rounded",
  "spacing",
  "components",
  "scheme",
];

/** Text on its background: the pairs whose contrast is checked when the
    DESIGN.md writes at least one side. */
const accents = ["primary", "secondary", "tertiary"];
const surfaces = [
  "surface",
  "surface-dim",
  "surface-bright",
  "surface-container-lowest",
  "surface-container-low",
  "surface-container",
  "surface-container-high",
  "surface-container-highest",
];
export const CONTRAST_PAIRS = [
  ...[...accents, "error"].flatMap((role) => [
    [`on-${role}`, role],
    [`on-${role}-container`, `${role}-container`],
  ]),
  ["on-background", "background"],
  ...surfaces.map((surface) => ["on-surface", surface]),
  ...[...surfaces, "surface-variant"].map((surface) => [
    "on-surface-variant",
    surface,
  ]),
  ["inverse-on-surface", "inverse-surface"],
  ["inverse-primary", "inverse-surface"],
  ...accents.flatMap((role) =>
    [`on-${role}-fixed`, `on-${role}-fixed-variant`].flatMap((text) => [
      [text, `${role}-fixed`],
      [text, `${role}-fixed-dim`],
    ]),
  ),
];

/** WCAG AA for running text, the number the format's linter uses too. */
export const CONTRAST_THRESHOLD = 4.5;

/** DESIGN.md typography property → `--md-sys-typescale-<role>-<suffix>`. */
const TYPE_VARS = {
  fontSize: "size",
  lineHeight: "line-height",
  letterSpacing: "tracking",
  fontWeight: "weight",
};

/** What a `text-<role>` utility gives when theme.v4.css has no variable for a
    property: no tracking, and the inherited (regular) weight. Every role has
    a weight variable in the kit's template; a tracking variable exists only
    where Material's baseline has tracking. */
const UNSET = {
  letterSpacing: (value) => parseFloat(value) === 0,
  fontWeight: (value) => value === "400" || value === "normal",
};

/** Material's two faces and the type roles each one carries. */
const FACES = {
  brand: ["display", "headline", "title"],
  plain: ["body", "label"],
};

const FALLBACK_STACK = "ui-sans-serif, system-ui, sans-serif";

/** The mono face is not Material's: a `typography.mono` token of the
    project's, read for its family alone. The stack is Tailwind's own
    `--font-mono`, so with no face named `font-mono` gives what it gave. */
const MONO = "mono";
const MONO_STACK =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
/** The variable the `font-mono` utility reads: never a hook. */
const MONO_UTILITY = "--font-mono";

const isMap = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/* ---- reading ---------------------------------------------------------- */

/** Splits a DESIGN.md into its front matter (parsed) and its body (verbatim). */
export function parseDesignMd(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(
    text,
  );
  if (!match) {
    throw new DesignMdError(
      "DESIGN.md: no front matter — the file must open with a `---` YAML block",
    );
  }
  let front;
  try {
    front = parse(match[1]);
  } catch (cause) {
    throw new DesignMdError(`DESIGN.md: front matter is not valid YAML`, {
      cause,
    });
  }
  if (!isMap(front)) {
    throw new DesignMdError("DESIGN.md: front matter is not a YAML map");
  }
  return { front, body: match[2] };
}

function section(front, name) {
  const value = front[name];
  if (value === undefined || value === null) return {};
  if (!isMap(value)) {
    throw new DesignMdError(`DESIGN.md: \`${name}\` is not a map`);
  }
  return value;
}

function argb(name, value) {
  if (
    typeof value !== "string" ||
    !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)
  ) {
    throw new DesignMdError(
      `DESIGN.md: colors.${name} is ${JSON.stringify(value)} — the kit reads a hex colour (\`"#RRGGBB"\`)`,
    );
  }
  return argbFromHex(value);
}

/** ARGB int → `hsl(H S% L%)` (the finished-color format theme.css uses) */
export function hslColor(argb) {
  const r = ((argb >> 16) & 255) / 255;
  const g = ((argb >> 8) & 255) / 255;
  const b = (argb & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return `hsl(${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

/** The `##` sections of a body and the fenced blocks under each, as offsets
    into the body. A heading inside a fence is not a heading. */
function scanBody(body) {
  const sections = [];
  let fence = null;
  for (const line of body.matchAll(/[^\n]*(?:\n|$)/g)) {
    const text = line[0];
    if (!text) break;
    const at = line.index;
    if (fence) {
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(text);
      if (close && close[1].startsWith(fence.mark)) {
        fence.contentEnd = at;
        fence = null;
      }
      continue;
    }
    const open = /^ {0,3}(`{3,}|~{3,})[ \t]*([^\s`]*)/.exec(text);
    if (open) {
      fence = {
        mark: open[1],
        lang: open[2].toLowerCase(),
        contentStart: at + text.length,
        contentEnd: body.length,
      };
      sections.at(-1)?.fences.push(fence);
      continue;
    }
    const heading = /^(#{1,2})[ \t]+(.*?)(?:[ \t]+#+)?\s*$/.exec(text);
    if (heading) {
      if (sections.length) sections.at(-1).end = at;
      sections.push({
        title: heading[1].length === 2 ? heading[2] : null,
        start: at,
        end: body.length,
        fences: [],
      });
    }
  }
  return sections;
}

const sameHeading = (title, heading) =>
  title !== null && title.toLowerCase() === heading.toLowerCase();

/** The first top-level `:root` rule of a CSS text: where it starts and ends,
    and what is between its braces with the comments blanked. */
function findRootRule(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    " ".repeat(comment.length),
  );
  let depth = 0;
  let prelude = 0;
  let open = -1;
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (char === "{") {
      if (depth++ === 0) open = i;
    } else if (char === "}" && depth > 0 && --depth === 0) {
      const selector = clean.slice(prelude, open);
      if (selector.trim() === ":root") {
        return {
          start: prelude + selector.indexOf(":root"),
          end: i + 1,
          inner: clean.slice(open + 1, i),
        };
      }
      prelude = i + 1;
    } else if (char === ";" && depth === 0) prelude = i + 1;
  }
  return null;
}

const collapse = (text) => text.replace(/\s+/g, " ").trim();

/** Splits at the commas that sit outside every bracket. */
function splitLayers(text) {
  const parts = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    if ("([{".includes(text[i])) depth++;
    else if (")]}".includes(text[i])) depth--;
    else if (text[i] === "," && depth === 0) {
      parts.push(text.slice(from, i));
      from = i + 1;
    }
  }
  return [...parts, text.slice(from)].map(collapse);
}

/** The declarations of a rule, in source order. `name` is null for what is
    not a declaration (a nested rule): it is carried as written. */
function declarations(inner) {
  const found = [];
  let depth = 0;
  let from = 0;
  const take = (to, nested) => {
    const text = collapse(inner.slice(from, to));
    from = to;
    const match = !nested && /^([^\s:]+)\s*:\s*(.*)$/.exec(text);
    if (match) {
      const [, name, value] = match;
      found.push({ name, value, text: `${name}: ${value};` });
    } else if (text) found.push({ name: null, text });
  };
  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];
    if ("([{".includes(char)) depth++;
    else if (")]".includes(char)) depth--;
    else if (char === "}" && --depth === 0) take(i + 1, true);
    else if (char === ";" && depth === 0) {
      take(i, false);
      from = i + 1;
    }
  }
  take(inner.length, false);
  return found;
}

/** Where the body's reference block is: its section, its `css` fence and the
    `:root` rule in it (offsets into the body), as far as each exists. */
function findReference(body) {
  const section = scanBody(body).find(({ title }) =>
    sameHeading(title, REFERENCE_HEADING),
  );
  if (!section) return {};
  const [fence, second] = section.fences.filter(({ lang }) => lang === "css");
  if (!fence) return { section };
  const found = findRootRule(body.slice(fence.contentStart, fence.contentEnd));
  const rule = found && {
    start: fence.contentStart + found.start,
    end: fence.contentStart + found.end,
    inner: found.inner,
  };
  return { section, fence, rule, second: second !== undefined };
}

/* ---- deriving --------------------------------------------------------- */

/** The body's reference block → the 27 values the theme is written with (the
    kit's own where the block is silent), how dark is switched, and the
    declarations the kit does not read, kept in source order. */
function deriveReference(body, warnings) {
  const { section, rule, second } = findReference(body);
  const unread = section !== undefined && !rule;
  const values = { ...REFERENCE_DEFAULTS };
  const written = [];
  const extra = [];
  let darkMode = DARK_MODES[0];

  for (const { name, value, text } of rule ? declarations(rule.inner) : []) {
    if (name === DARK_MODE) {
      if (!DARK_MODES.includes(value)) {
        throw new DesignMdError(
          `DESIGN.md: ${DARK_MODE} is ${JSON.stringify(value)} — the kit reads \`class\` or \`system\``,
        );
      }
      darkMode = value;
    } else if (name !== null && Object.hasOwn(REFERENCE_DEFAULTS, name)) {
      const form = REFERENCE_FORMS.find(([names]) => names.test(name));
      if (!value || (form && !form[1].test(value))) {
        throw new DesignMdError(
          `DESIGN.md: ${name} is ${JSON.stringify(value)} — the kit reads ${form ? form[2] : "a value"}`,
        );
      }
      values[name] = value;
      if (!written.includes(name)) written.push(name);
    } else {
      const token = name ?? text;
      extra.push(text);
      warnings.push({
        kind: "ignored",
        token,
        message: `${REFERENCE_HEADING}: ${token} is not a variable the kit reads: ignored`,
      });
    }
  }
  /* A heading with nothing the kit can read under it (no \`css\` fence, a
     rule that is not exactly \`:root\`) is said, never taken as the defaults
     the project chose. */
  if (unread) {
    warnings.push({
      kind: "ignored",
      token: REFERENCE_HEADING,
      message: `${REFERENCE_HEADING}: no top-level \`:root\` rule in a \`css\` block under the heading — nothing of the section is read: the theme has the kit's own elevation, state and motion values, and dark on the \`.dark\` class`,
    });
  }
  if (second) {
    warnings.push({
      kind: "ignored",
      token: REFERENCE_HEADING,
      message: `${REFERENCE_HEADING}: the kit reads the first \`css\` block under the heading — the second is ignored`,
    });
  }
  return { values, written, extra, darkMode, unread };
}

function deriveFront(front, warnings) {
  for (const key of Object.keys(front)) {
    if (!FRONT_KEYS.includes(key)) {
      warnings.push({
        kind: "ignored",
        token: key,
        message: `${key} is not a section of the DESIGN.md format: ignored`,
      });
    }
  }
}

function deriveColors(front, warnings) {
  const colors = section(front, "colors");

  /* `scheme` and `seed` are the kit's own keys: a file in the format's own
     words writes neither. Each is then read from the one token that says it,
     and listed as assumed, naming that token; with no such token the file is
     refused. A value that is written is never replaced. */
  const assumed = {};
  let scheme = front.scheme;
  if (scheme === undefined) {
    const ground = ["background", "surface"].find(
      (role) => colors[role] !== undefined,
    );
    if (ground === undefined) {
      throw new DesignMdError(
        "DESIGN.md: no `scheme` — say which scheme the colour roles write, `scheme: light` or `scheme: dark`",
      );
    }
    const tone = argb(ground, colors[ground]);
    scheme = lstarFromArgb(tone) >= 50 ? "light" : "dark";
    assumed.scheme = ground;
    warnings.push({
      kind: "assumed",
      token: "scheme",
      message: `scheme: the file writes none — read as ${scheme} from colors.${ground} (${hexFromArgb(tone)}), a ${scheme} ground. Write \`scheme: ${scheme}\` to say it`,
    });
  } else if (!SCHEMES.includes(scheme)) {
    throw new DesignMdError(
      `DESIGN.md: scheme is ${JSON.stringify(scheme)} — the kit reads \`light\` or \`dark\``,
    );
  }
  let seed = colors.seed;
  if (seed === undefined) {
    if (colors.primary === undefined) {
      throw new DesignMdError(
        "DESIGN.md: no colors.seed — the key colour both schemes are derived from",
      );
    }
    seed = hexFromArgb(argb("primary", colors.primary));
    assumed.seed = "primary";
    warnings.push({
      kind: "assumed",
      token: "colors.seed",
      message: `colors.seed: the file writes none — read from colors.primary (${seed}): the ${scheme === "light" ? "dark" : "light"} scheme and every role the file does not write are derived from it. Write \`seed\` under \`colors\` to say it`,
    });
  }

  const keys = { seed: argb(assumed.seed ?? "seed", seed) };
  const written = {};
  for (const [name, value] of Object.entries(colors)) {
    if (name in KEYS) keys[name] = argb(name, value);
    else if (name in ROLES) written[name] = argb(name, value);
    else if (name !== "seed") {
      warnings.push({
        kind: "ignored",
        token: `colors.${name}`,
        message: `colors.${name} is not a Material role or a key colour: ignored`,
      });
    }
  }

  const palettes = {};
  for (const [name, palette] of Object.entries(KEYS)) {
    if (name in keys) palettes[palette] = TonalPalette.fromInt(keys[name]);
  }
  const derive = (name) => {
    const dynamic = new DynamicScheme({
      sourceColorHct: Hct.fromInt(keys.seed),
      variant: Variant.TONAL_SPOT,
      contrastLevel: 0,
      isDark: name === "dark",
      specVersion: "2021",
      ...palettes,
    });
    const roles = {};
    for (const [role, key] of Object.entries(ROLES)) {
      roles[role] =
        role in written && (name === scheme || isFixedRole(role))
          ? written[role]
          : MaterialDynamicColors[key].getArgb(dynamic);
    }
    return roles;
  };

  const result = {
    scheme,
    keys,
    assumed,
    light: derive("light"),
    dark: derive("dark"),
  };

  /* A derived pair is Material's own and holds; a written role is checked
     against its partner, in the scheme it is written in (a fixed role is the
     same in both, so once is enough). */
  const roles = result[scheme];
  for (const [text, background] of CONTRAST_PAIRS) {
    if (!(text in written) && !(background in written)) continue;
    const ratio = Contrast.ratioOfTones(
      lstarFromArgb(roles[text]),
      lstarFromArgb(roles[background]),
    );
    if (ratio >= CONTRAST_THRESHOLD) continue;
    warnings.push({
      kind: "contrast",
      token: `colors.${text} on colors.${background}`,
      message: `colors.${text} (${hexFromArgb(roles[text])}) on colors.${background} (${hexFromArgb(roles[background])}) is ${ratio.toFixed(2)}:1 in the ${scheme} scheme, under ${CONTRAST_THRESHOLD}:1 — hard to read`,
    });
  }
  return result;
}

function deriveTypography(front, warnings) {
  const written = section(front, "typography");
  const typography = Object.fromEntries(
    Object.entries(TYPE_DEFAULTS).map(([role, defaults]) => [
      role,
      { ...defaults },
    ]),
  );
  /** Material's role → the key the file wrote it under (`title-md`). */
  const names = {};
  /** The roles the file writes a family on. */
  const ownFamily = new Set();
  for (const [role, token, key] of byMaterialName(
    written,
    "typography",
    typeRoleOf,
    warnings,
  )) {
    if (!Object.hasOwn(TYPE_DEFAULTS, role)) {
      if (role !== MONO) {
        warnings.push({
          kind: "ignored",
          token: `typography.${role}`,
          message: `typography.${role} is not a Material type role: ignored`,
        });
      }
      continue;
    }
    names[role] = key;
    if (token === undefined || token === null) continue;
    if (!isMap(token)) {
      throw new DesignMdError(`DESIGN.md: typography.${key} is not a map`);
    }
    for (const [property, value] of Object.entries(token)) {
      if (Object.hasOwn(TYPE_FORMS, property)) {
        typography[role][property] = oneValue(
          `typography.${key}.${property}`,
          value,
          TYPE_FORMS[property],
        );
      } else if (Object.hasOwn(TYPE_DEFAULTS[role], property)) {
        typography[role][property] = value;
        ownFamily.add(role);
      } else {
        // Under Material's name, as the resolved file writes the role.
        warnings.push({
          kind: "unapplied",
          token: `typography.${role}.${property}`,
          message: `typography.${role}.${property}: the kit has no variable for it — not applied`,
        });
      }
    }
  }
  return { typography, names, ownFamily };
}

function deriveRounded(front, warnings) {
  const written = section(front, "rounded");
  const rounded = { ...CORNER_DEFAULTS };
  for (const [step, value, key] of byMaterialName(
    written,
    "rounded",
    cornerOf,
    warnings,
  )) {
    if (Object.hasOwn(rounded, step)) {
      rounded[step] = oneValue(`rounded.${key}`, value, CORNER_FORM);
    } else {
      warnings.push({
        kind: "ignored",
        token: `rounded.${step}`,
        message: `rounded.${step} is not a Material corner: ignored`,
      });
    }
  }
  return rounded;
}

/** A family name as a CSS string: whatever the name holds, it is one value. */
const cssString = (name) => `"${name.replace(/["\\]/g, "\\$&")}"`;

/** A fallback written bare: a run of identifiers (`Georgia`, `Segoe UI`,
    `system-ui`). A generic keyword must stay bare, since a quoted `serif` is
    a family of that name. */
const BARE_FAMILY =
  /^-?[\p{L}_][\p{L}\p{N}_-]*(?: +-?[\p{L}_][\p{L}\p{N}_-]*)*$/u;

/** `Space Grotesk, Georgia, serif` → the host hook `--font-space-grotesk` and
    its root default. A family written alone gets `fallback` behind it, the
    platform sans unless told. The first name is written as one CSS string,
    and so is a fallback that is not a run of identifiers; `token` is the role
    the family was read from. */
function fontHook(family, token, fallback = FALLBACK_STACK) {
  const refuse = (
    kind = "a family name, with its fallbacks after commas (`Inter`, `Space Grotesk, Georgia, serif`)",
  ) =>
    new DesignMdError(
      `DESIGN.md: ${token} is ${JSON.stringify(family)} — the kit reads ${kind}`,
    );
  // A line break ends a CSS string, whatever is escaped in it.
  if (typeof family !== "string" || /[\u0000-\u001f\u007f]/.test(family)) {
    throw refuse();
  }
  const [first, ...fallbacks] = family
    .split(",")
    .map((part) => part.trim().replace(/^(["'])(.*)\1$/, "$2"));
  const slug = first
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (fallbacks.includes("")) throw refuse();
  // The hook is named after the first family, in ASCII.
  if (!slug) {
    throw refuse(
      "a family name whose first name holds a Latin letter or a digit, which its font hook is named after (`Inter` gives `--font-inter`)",
    );
  }
  // `--font-mono: var(--md-sys-typescale-mono-font)` is in theme.v4.css: a
  // hook of that name would be read by the token it feeds.
  if (`--font-${slug}` === MONO_UTILITY) {
    throw refuse(
      `a family whose font hook is not \`${MONO_UTILITY}\`, the variable the \`font-mono\` utility reads: write the family's full name (\`JetBrains Mono\` gives \`--font-jetbrains-mono\`)`,
    );
  }
  // The same for a role's or a face's own utility (`--font-label-large`,
  // `--font-brand`), which theme.v4.css maps to the role's token.
  if (Object.hasOwn(TYPE_DEFAULTS, slug) || Object.hasOwn(FACES, slug)) {
    throw refuse(
      `a family whose font hook is not \`--font-${slug}\`, the variable the \`font-${slug}\` utility reads`,
    );
  }
  return {
    hook: `--font-${slug}`,
    family: first,
    stack: `${cssString(first)}, ${
      fallbacks.length
        ? fallbacks
            .map((name) => (BARE_FAMILY.test(name) ? name : cssString(name)))
            .join(", ")
        : fallback
    }`,
  };
}

/** The face of a role: `title-small` → `brand`. */
const faceOf = (role) =>
  Object.keys(FACES).find((face) => FACES[face].includes(role.split("-")[0]));

/** A family per role, as Material's own tokens have it
    (`md.sys.typescale.<role>.font`), each pointing at one of the two faces
    unless the file says otherwise.

    The faces are read as they always were: the brand face is the family of
    `display-large`, the plain face the family of `body-large`. A role the
    file writes no family on keeps its face's. A role it writes one on gets a
    hook of its own, unless that hook is its face's already.

    A hook is declared once, with one stack: the first to name it, the faces
    before the roles, the roles in the scale's order. A later stack on the
    same hook is listed, and the family applies all the same.

    `typography` is completed in place: every role ends with the family that
    is applied to it, which is what the resolved file shows. */
function deriveFaces(typography, names, ownFamily, warnings) {
  const token = (role) => `typography.${names[role] ?? role}.fontFamily`;
  const faces = {};
  for (const [face, groups] of Object.entries(FACES)) {
    const first = Object.keys(typography).find((role) =>
      groups.includes(role.split("-")[0]),
    );
    faces[face] = { ...fontHook(typography[first].fontFamily, token(first)), first };
  }
  /* Two faces of one family share a hook, and its stack is the plain face's:
     as it was written before a role had a family. */
  const hooks = new Map(Object.values(faces).map((face) => [face.hook, face]));

  /** Role → the hook it reads, or null where it reads its face's. */
  const roles = {};
  for (const role of Object.keys(typography)) {
    const face = faces[faceOf(role)];
    roles[role] = null;
    // A family written as its face's is the face's: the resolved file
    // writes it on every role, and it must read back as none of its own.
    const family = typography[face.first].fontFamily;
    if (!ownFamily.has(role) || typography[role].fontFamily === family) {
      typography[role].fontFamily = family;
      continue;
    }
    const own = fontHook(typography[role].fontFamily, token(role));
    const held = hooks.get(own.hook);
    if (!held) hooks.set(own.hook, own);
    else if (held.stack !== own.stack) {
      warnings.push({
        kind: "unapplied",
        token: `typography.${role}.fontFamily`,
        message: `typography.${role}.fontFamily: \`${own.hook}\` already carries ${held.stack} — the family is applied, the fallbacks written here are not`,
      });
    }
    if (own.hook !== face.hook) roles[role] = own.hook;
  }
  return { faces, roles, hooks: [...hooks.values()] };
}

/** The face a project reaches for with `font-mono`: `typography.mono`'s
    family, or none. It has no size, weight or tracking of its own: the text
    it is put on keeps its type role's. */
function deriveMono(front, warnings) {
  const token = section(front, "typography")[MONO];
  if (token === undefined || token === null) return null;
  if (!isMap(token)) {
    throw new DesignMdError(
      `DESIGN.md: typography.${MONO} is ${JSON.stringify(token)} — the kit reads a map with a \`fontFamily\` (\`mono: { fontFamily: JetBrains Mono }\`)`,
    );
  }
  for (const property of Object.keys(token)) {
    if (property !== "fontFamily") {
      warnings.push({
        kind: "unapplied",
        token: `typography.${MONO}.${property}`,
        message: `typography.${MONO}.${property}: the mono face is a family only, the text keeps its type role's — not applied`,
      });
    }
  }
  if (!Object.hasOwn(token, "fontFamily")) return null;
  return fontHook(
    token.fontFamily,
    `typography.${MONO}.fontFamily`,
    MONO_STACK,
  );
}

/** Front matter + body → everything the three generated files are made of. */
export function deriveTheme(text) {
  const { front, body } = parseDesignMd(text);
  const warnings = [];
  deriveFront(front, warnings);
  const colors = deriveColors(front, warnings);
  const {
    typography,
    names: typeNames,
    ownFamily,
  } = deriveTypography(front, warnings);
  const mono = deriveMono(front, warnings);
  const rounded = deriveRounded(front, warnings);
  const {
    faces,
    roles: roleFonts,
    hooks,
  } = deriveFaces(typography, typeNames, ownFamily, warnings);
  const reference = deriveReference(body, warnings);
  return {
    front,
    body,
    colors,
    typography,
    typeNames,
    rounded,
    faces,
    roleFonts,
    hooks,
    mono,
    reference,
    warnings,
  };
}

/* ---- rendering -------------------------------------------------------- */

/** One declaration as the theme writes it: an elevation with several shadow
    layers puts each on its own line, everything else is one line. */
function declaration(indent, name, value) {
  const layers = isLayered(name) ? splitLayers(value) : [value];
  return layers.length > 1
    ? `${indent}${name}:\n${layers.map((layer) => `${indent}  ${layer}`).join(",\n")};`
    : `${indent}${name}: ${value};`;
}

const DARK_SWITCH = {
  class: {
    title: "dark (.dark)",
    keyed: `Dark mode is keyed on a \`.dark\` class on a wrapping element (usually <html>),
   which is what next-themes produces.`,
    scoped: `once per scheme block rather than once on \`:root\` so that a \`.dark\` on a
   *subtree* re-colors that subtree too; an app that wants a different default
   sets \`color\` on \`<body>\`, which wins over an inherited value.`,
    optOut: ":root, .dark",
    resolved: "Dark applies under a\n`.dark` class.",
  },
  system: {
    title: "dark (the system setting)",
    keyed: `Dark mode follows the system setting (\`prefers-color-scheme: dark\`), as the
   project's DESIGN.md chooses (\`--md3-dark-mode: system\`): no class switches
   it, and a \`.dark\` on a subtree does nothing.`,
    scoped: `once per scheme block; an app that wants a different default sets \`color\`
   on \`<body>\`, which wins over an inherited value.`,
    optOut: ":root",
    resolved:
      "Dark applies when\nthe system asks for it (`prefers-color-scheme: dark`); no class switches it.",
  },
};

const themeCssHead = ({
  title,
  keyed,
  scoped,
  optOut,
}) => `/* =============================================================================
   MD3 color scheme — light (:root) and ${title}
   -----------------------------------------------------------------------------
   Generated from the project's DESIGN.md by the kit's generator
   (generate-theme.mjs, in the kit's tokens folder). Never edit this file:
   edit DESIGN.md and run the generator again.

   Every role is a finished color (\`hsl(...)\`) under the \`--md-sys-color-*\`
   namespace, mirroring Material's own token names. Finished colors are what
   Tailwind v4's \`@theme inline\` mapping (theme.v4.css), \`color-mix()\` and the
   shadcn CLI expect; opacity modifiers such as
   \`bg-primary/8\` are applied by Tailwind through color-mix(), so no bare
   \`H S% L%\` triplet is needed anywhere.

   The namespace also keeps these roles clear of shadcn's \`--primary\`,
   \`--secondary\`, \`--background\`… variables, which bridge-shadcn.css defines
   *from* these when a shadcn component family is present.

   ${keyed}

   Both blocks also declare the *ambient content color* — \`color:
   var(--md-sys-color-on-surface)\` — which is the one thing here that paints
   rather than defines. It is what makes the kit's pairing rule work: text
   inherits \`on-surface\` by default, and a \`bg-<role>\` container only has to
   carry its own \`text-on-<role>\` to re-color everything inside it. The
   Typography primitives therefore assert no color of their own. It is declared
   ${scoped}

   Beside it, each block declares its \`color-scheme\` and gives scroll bars the
   theme's roles (\`scrollbar-color\`: a thumb in \`outline\`, a lane that shows
   the ground). So what the browser draws itself (a scroll bar, a native
   select's list, a date field's picker) follows the theme, in light, in dark
   and in a \`.dark\` subtree.

   To keep what the browser drew before, write one rule in your own CSS, after
   this file's import and outside any \`@layer\`: on \`${optOut}\`, the two
   declarations \`color-scheme: normal\` and \`scrollbar-color: auto\`.

   It goes on the root because the page's own scroll bar and canvas read the
   root element: the same declarations on \`<body>\` reach only what is inside
   the body. And while \`scrollbar-color\` is set, browsers that support it ignore
   \`::-webkit-scrollbar\` rules. A project that styles its bars that way
   writes that rule, or \`scrollbar-color: auto\` on the scrollers it
   styles, or moves its colours to \`scrollbar-color\`.
   ========================================================================== */
`;

function schemeBlock(selector, roles, scheme) {
  // The light block is the one that titles its groups.
  const titled = scheme === "light";
  const groups = ROLE_GROUPS.map(([title, group]) =>
    [
      ...(titled ? [`  /* ${title} */`] : []),
      ...Object.keys(group).map(
        (role) => `  --md-sys-color-${role}: ${hslColor(roles[role])};`,
      ),
    ].join("\n"),
  );
  return `${selector} {
  color: var(--md-sys-color-on-surface);
  color-scheme: ${scheme};
  scrollbar-color: var(--md-sys-color-outline) transparent;

${groups.join("\n\n")}\n}\n`;
}

/** The dark scheme under the selector the project chose: a `.dark` class, or
    `:root` inside the system's `prefers-color-scheme` query. */
function darkBlock(theme) {
  if (theme.reference.darkMode === "class") {
    return schemeBlock(".dark", theme.colors.dark, "dark");
  }
  const block = schemeBlock(":root", theme.colors.dark, "dark")
    .replace(/^(?=.)/gm, "  ")
    .trimEnd();
  return `@media (prefers-color-scheme: dark) {\n${block}\n}\n`;
}

/** theme.css, whole: every value in it is derived. */
export function renderThemeCss(theme) {
  const hooks = new Map(theme.hooks.map((face) => [face.hook, face]));
  // Written in a comment: a name cannot close it.
  const names = [...hooks.values()]
    .map((face) => face.family.replaceAll("*/", "* /"))
    .join(" and ");
  const hookNames = [...hooks.keys()]
    .map((hook) => `\`${hook}\``)
    .join(" and ");
  // A hook the scale already claimed keeps the scale's stack.
  const monoOwn = theme.mono && !hooks.has(theme.mono.hook);
  if (monoOwn) hooks.set(theme.mono.hook, theme.mono);
  const monoNote = theme.mono
    ? `
   The mono face, which \`font-mono\` gives, is ${theme.mono.family.replaceAll("*/", "* /")}, on \`${theme.mono.hook}\`${monoOwn ? "" : ", the hook it shares"}.`
    : "";
  return `${themeCssHead(DARK_SWITCH[theme.reference.darkMode])}
${schemeBlock(":root", theme.colors.light, "light")}
${darkBlock(theme)}
/* Typeface. The type scale is set in ${names}, as DESIGN.md writes it.
   ${hookNames} is the hook a host app fills with its own loaded face (Next:
   \`localFont({ variable: "--font-…" })\` on <body> wins over this root default
   by inheritance); without one, the named family resolves to a locally
   installed or web-loaded face, then the stack behind it.${monoNote} */
:root {
${[...hooks.values()].map((face) => `  ${face.hook}: ${face.stack};`).join("\n")}
}
`;
}

/** Sets the type, corner, face, elevation, state and motion declarations of a
    theme.v4.css text, by name, inside `@theme inline`. Nothing else in the
    file is touched. */
export function applyThemeV4(v4Css, theme) {
  const warnings = [];
  const start = v4Css.indexOf("@theme inline {");
  if (start < 0) {
    throw new DesignMdError('theme.v4.css: no "@theme inline" block');
  }
  let end = v4Css.indexOf("{", start);
  for (let depth = 0; end < v4Css.length; end++) {
    if (v4Css[end] === "{") depth++;
    if (v4Css[end] === "}" && --depth === 0) break;
  }
  let block = v4Css.slice(start, end);

  /** Whole declaration lines only, so prose quoting a declaration is safe.
      An elevation alone may run over several lines, one per shadow layer. */
  const set = (name, value) => {
    const line = new RegExp(
      `^([ \\t]*)--${name}:[^;${isLayered(`--${name}`) ? "" : "\\n"}]*;[ \\t]*$`,
      "gm",
    );
    const found = block.match(line)?.length ?? 0;
    if (found > 1) {
      throw new DesignMdError(
        `theme.v4.css: --${name} is declared ${found} times in "@theme inline" — the kit sets a declaration by name and needs exactly one`,
      );
    }
    if (found === 1) {
      block = block.replace(line, (_, indent) =>
        declaration(indent, `--${name}`, value),
      );
    }
    return found === 1;
  };
  const must = (name, value) => {
    if (!set(name, value)) {
      throw new DesignMdError(
        `theme.v4.css: no --${name} declaration in "@theme inline"`,
      );
    }
  };

  for (const [face, { hook }] of Object.entries(theme.faces)) {
    must(`md-sys-typescale-${face}-font`, `var(${hook})`);
  }
  // Set on every run, so a family taken out of DESIGN.md leaves the theme
  // too. `initial` is no value at all: the role's utility then reads its
  // face, at the element that draws the text.
  for (const [role, hook] of Object.entries(theme.roleFonts)) {
    must(`md-sys-typescale-${role}-font`, hook ? `var(${hook})` : "initial");
  }
  must(
    `md-sys-typescale-${MONO}-font`,
    theme.mono ? `var(${theme.mono.hook})` : MONO_STACK,
  );
  for (const [role, token] of Object.entries(theme.typography)) {
    for (const [property, suffix] of Object.entries(TYPE_VARS)) {
      const value = String(token[property]);
      const name = `md-sys-typescale-${role}-${suffix}`;
      if (property in UNSET) {
        if (!set(name, value) && !UNSET[property](value)) {
          warnings.push({
            kind: "unapplied",
            token: `typography.${role}.${property}`,
            message: `typography.${role}.${property} is ${value}: the kit has no --${name} variable — not applied`,
          });
        }
      } else must(name, value);
    }
  }
  for (const [step, value] of Object.entries(theme.rounded)) {
    must(`md-sys-shape-corner-${step}`, String(value));
  }
  for (const [name, value] of Object.entries(theme.reference.values)) {
    must(name.slice(2), value);
  }

  return {
    css: v4Css.slice(0, start) + block + v4Css.slice(end),
    warnings,
  };
}

/** The reference block, complete: how dark is switched, the 27 values the
    theme was written with, then what the project wrote that the kit does not
    read, so reading the result back lists the same warnings. */
function referenceRule({ values, extra, darkMode }) {
  return `:root {\n${[
    declaration("  ", DARK_MODE, darkMode),
    ...Object.entries(values).map(([name, value]) =>
      declaration("  ", name, value),
    ),
    ...extra.map((text) => `  ${text}`),
  ].join("\n")}\n}`;
}

/** The project's body with the sections the kit generates dropped and the
    reference block's `:root` rule written complete: in place where the body
    has one, in a section of its own where the body has no such heading. A
    heading the kit read nothing under is left as written, so reading the
    result back lists the same warning, and the values the theme was written
    with go in a generated section that is never read back. */
function resolvedBody(theme) {
  const rule = referenceRule(theme.reference);
  const sections = scanBody(theme.body);
  const body =
    theme.body.slice(0, sections[0]?.start ?? theme.body.length) +
    sections
      .filter(
        ({ title }) =>
          !GENERATED_HEADINGS.some((heading) => sameHeading(title, heading)),
      )
      .map(({ start, end }) => theme.body.slice(start, end))
      .join("");

  const found = findReference(body);
  const splice = (at, to, text) => body.slice(0, at) + text + body.slice(to);
  const fenced = `\`\`\`css\n${rule}\n\`\`\`\n`;
  let complete;
  if (found.rule) complete = splice(found.rule.start, found.rule.end, rule);
  else if (found.section) {
    complete = `${body.replace(/\s*$/, "\n")}
## ${UNREAD_HEADING}

Generated by the MD3 kit. It read no \`:root\` rule under
\`## ${REFERENCE_HEADING}\` above, so nothing written there is in the theme.
The theme was written with these, the kit's own values:

${fenced}`;
  } else {
    complete = `${body.replace(/\s*$/, "\n")}
## ${REFERENCE_HEADING}

Generated by the MD3 kit: this file writes no reference block, so these are
the kit's own elevation, state layer opacities, easings and durations.

${fenced}`;
  }
  return complete.replace(/\s*$/, "\n");
}

/** The complete DESIGN.md, for agents: the project's front matter with the
    kit's maps completed, its body with the reference block completed, both
    schemes tabulated, and the warnings when there are any. Feeding it back to
    the generator gives the same theme and the same warnings. */
export function renderResolvedDesignMd(theme, warnings = theme.warnings) {
  const { front, colors, typography, typeNames, rounded } = theme;
  const written = colors[colors.scheme];
  const known = (name) => name === "seed" || name in KEYS || name in ROLES;
  const extra = (name, kept) =>
    Object.fromEntries(
      Object.entries(isMap(front[name]) ? front[name] : {}).filter(
        ([key]) => !kept(key),
      ),
    );
  /* What was assumed is not written: the file reads back with the same
     warning, from the same token. A seed read from the primary is left out,
     and so is a `background` the file did not write when its scheme was read
     from its surface, the background being read first. Both are derived the
     same from what is written, and the table below holds every role. */
  const unsaid = (name) =>
    (name === "seed" && colors.assumed.seed !== undefined) ||
    (name === "background" && colors.assumed.scheme === "surface");
  /* A short name the kit read is written under Material's. One that lost to
     Material's own stays as written, to be listed again. */
  const readShort = (section, nameOf) => (key) =>
    nameOf(key) !== key && !Object.hasOwn(front[section], nameOf(key));
  const shortRole = readShort("typography", typeRoleOf);

  const complete = {
    ...front,
    colors: {
      ...Object.fromEntries(
        Object.entries(colors.keys)
          .filter(([key]) => !unsaid(key))
          .map(([key, value]) => [key, hexFromArgb(value)]),
      ),
      ...Object.fromEntries(
        Object.keys(ROLES)
          .filter((role) => !unsaid(role))
          .map((role) => [role, hexFromArgb(written[role])]),
      ),
      ...extra("colors", known),
    },
    typography: {
      /* A known role keeps the properties the kit has no variable for. */
      ...Object.fromEntries(
        Object.entries(typography).map(([role, token]) => [
          role,
          {
            ...token,
            ...extra("typography", () => false)[typeNames[role] ?? role],
          },
        ]),
      ),
      ...extra(
        "typography",
        (role) => role in TYPE_DEFAULTS || shortRole(role),
      ),
    },
    rounded: {
      ...rounded,
      ...extra(
        "rounded",
        (step) => step in rounded || readShort("rounded", cornerOf)(step),
      ),
    },
  };

  const cell = (value) => `\`${hexFromArgb(value)}\` \`${hslColor(value)}\``;
  const rows = Object.keys(ROLES).map(
    (role) =>
      `| \`${role}\` | ${cell(colors.light[role])} | ${cell(colors.dark[role])} |`,
  );

  return `---
# Generated from the project's DESIGN.md by the MD3 kit (tokens/generate-theme.mjs).
# Never edit this file: edit the project's DESIGN.md and regenerate.
${stringify(complete, { lineWidth: 0 })}---
${resolvedBody(theme)}
## Resolved schemes

Generated by the MD3 kit. The front matter above carries the complete
${colors.scheme} scheme; the ${colors.scheme === "light" ? "dark" : "light"} scheme is derived from the key colours. Both are
below, each role as the hex the kit derived and the \`hsl()\` string the
theme's \`--md-sys-color-<role>\` variable carries. ${DARK_SWITCH[theme.reference.darkMode].resolved}

| Role | Light | Dark |
| :--- | :--- | :--- |
${rows.join("\n")}
${
  warnings.length
    ? `
## Generator warnings

Generated by the MD3 kit: what it listed when it wrote the theme. The theme is
written all the same.

${warnings.map(({ kind, message }) => `- **${kind}** — ${message}`).join("\n")}
`
    : ""
}`;
}

/** DESIGN.md text + the current theme.v4.css text → the three generated
    files and what the kit could not apply. Throws `DesignMdError` on a file
    it refuses. */
export function generateTheme(designMd, v4Css) {
  const theme = deriveTheme(designMd);
  const v4 = applyThemeV4(v4Css, theme);
  const warnings = [...theme.warnings, ...v4.warnings];
  return {
    theme,
    themeCss: renderThemeCss(theme),
    themeV4Css: v4.css,
    resolvedDesignMd: renderResolvedDesignMd(theme, warnings),
    warnings,
  };
}
