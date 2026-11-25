/**
 * What each colour role of the theme is for, and the look's own names over them: the words tokens.json carries beside each value, read
 * by a person and an agent choosing a colour by its role.
 */

/** The text of a content role, on the fill it goes on. */
const on = (role: string) => `Text and icons on \`md-sys-color-${role}\`.`;

/** The four roles of a fixed accent, which keeps one tone in both schemes. */
const fixed = (accent: string, what: string) => ({
  [`${accent}-fixed`]: `${what} fill that keeps one tone in both schemes.`,
  [`on-${accent}-fixed`]: `Text and icons on \`md-sys-color-${accent}-fixed\` and \`-fixed-dim\`.`,
  [`${accent}-fixed-dim`]: `The stronger tone of \`md-sys-color-${accent}-fixed\`, the same in both schemes.`,
  [`on-${accent}-fixed-variant`]: `Lower-emphasis text and icons on \`md-sys-color-${accent}-fixed\`.`,
});

/** Each colour role, by its name after `md-sys-color-`. */
export const USAGE: Readonly<Record<string, string>> = {
  primary: 'Acid yellow. Yours: a gate that waits on a person, and the one filled button of a screen.',
  'on-primary': `${on('primary')} Black in the dark scheme.`,
  'primary-container': 'A quieter yellow field: a selected or highlighted container; the label stock of a waiting tag in the light scheme.',
  'on-primary-container': on('primary-container'),
  secondary: "Plain ink: the kit's state on a control, its tonal parts and its focus ring. The board's own parts write none of it.",
  'on-secondary': on('secondary'),
  'secondary-container': 'A neutral field under plain ink: what a person selects, a selected tab, a chosen tile, a picked filter.',
  'on-secondary-container': on('secondary-container'),
  tertiary: "Plain ink, as secondary: the kit's third accent, which says no meaning on the board.",
  'on-tertiary': on('tertiary'),
  'tertiary-container': 'A neutral field, as `md-sys-color-secondary-container`.',
  'on-tertiary-container': on('tertiary-container'),
  error: 'Red, kept for what failed. A board where nothing failed shows none.',
  'on-error': on('error'),
  'error-container': 'The field of a failure message or a refused step.',
  'on-error-container': on('error-container'),
  background: 'The page ground: a graphite that is nearly black. Same as surface; prefer the surface roles.',
  'on-background': on('background'),
  surface: 'The ground of a page and of low-emphasis parts.',
  'on-surface': 'Primary text and icons on every ground. It is the ambient text colour.',
  'surface-variant': 'A lower-emphasis fill kept for older parts. Prefer `md-sys-color-surface-container-highest`.',
  'on-surface-variant': 'Secondary text and icons: supporting text, labels, a thumb under the pointer.',
  'surface-dim': 'The dimmest surface, for a ground that recedes.',
  'surface-bright': 'The brightest surface, for a ground that stands forward.',
  'surface-container-lowest': 'The lowest container tone; the ink of a step that is done sits on it.',
  'surface-container-low': "A card's ground and a sheet on the page ground.",
  'surface-container': 'A menu, a popover, a default container.',
  'surface-container-high': 'A raised container: a dialog, a hovered row.',
  'surface-container-highest': 'The strongest container tone: a filled field, a table head.',
  'surface-tint': 'The tint laid over a surface to show elevation. It equals primary.',
  outline: 'A border that carries meaning, and the filled grey of a step that is done, a check that runs, a wait on another run.',
  'outline-variant': "A hairline: a card's edge, a divider. Never the only boundary of a control.",
  shadow: 'The colour of a shadow. The look draws none.',
  scrim: 'The veil behind a modal surface.',
  'inverse-surface': 'A light grey in the dark scheme, a dark one in the light: the ground of a snackbar.',
  'inverse-on-surface': `${on('inverse-surface')} Black ink.`,
  'inverse-primary': 'Action text on `md-sys-color-inverse-surface`.',
  ...fixed('primary', 'A yellow'),
  ...fixed('secondary', 'A neutral'),
  ...fixed('tertiary', 'A neutral'),
};

/**
 * The look's four meanings, each a word and what it says, their values written by the board beside the theme (`src/styles.css`,
 * `--meaning-*`). A cost is no meaning: it is drawn in ink.
 */
export const MEANING: readonly (readonly [string, string])[] = [
  ['yours', 'What waits on a person: a gate, a waiting tag, the one filled button.'],
  ['alive', 'A session at work: a running step, the live step on a rail.'],
  ['failure', "What failed, and nothing else: Material's error."],
  ['rest', "What is at rest: the label's grey of a count, a clock, a finished run."],
];

/** The look's further names, each over a role, as Tailwind's classes name them. */
export const ALIASES: readonly { name: string; value: string; usage: string }[] = [
  { name: 'meaning-sage', value: '{md-sys-color-outline}', usage: 'A step that is done: the filled grey of the steps rail.' },
  { name: 'meaning-on-sage', value: '{md-sys-color-surface-container-lowest}', usage: 'Ink on `meaning-sage`.' },
  { name: 'background', value: '{md-sys-color-background}', usage: "The page ground, as Tailwind's `bg-background`." },
];

/** The type scale: each group's name, its stem in the theme, its family, what it is for and a sample. */
export const SCALE: readonly (readonly [string, string, string, string, string])[] = [
  ['Display', 'display', 'michroma', 'Short, large text or numerals. Rare in a board.', 'Runs'],
  ['Headline', 'headline', 'michroma', 'A page or section heading, in the wide head-up lettering.', 'Waiting on you'],
  [
    'Title',
    'title',
    'michroma',
    "A card's title and a dialog's title; the medium and small sizes, and so a tab's word, are drawn in Barlow, mixed case.",
    'Open the run',
  ],
  [
    'Body',
    'body',
    'barlow',
    'What is read: a sentence, a value, a cell. Untracked, 13 pixels at the least.',
    'A run waits at its gate until a person approves it.',
  ],
  [
    'Label',
    'label',
    'chakra-petch',
    "The look's small caps: a button's word, a tag, a rail's name, a table head. Weight 600, tracked, set in capitals where written.",
    'Approve',
  ],
];

/** What each elevation level is for. */
export const SHADOW_USAGE: Readonly<Record<string, string>> = {
  1: 'A resting raised surface: a hairline in `outline-variant`. Nothing casts a shadow.',
  2: 'A raised surface: a hairline in `outline` at 70%.',
  3: 'A floating surface (a menu, a dialog): a hairline in `outline`.',
  4: 'A surface under the pointer: a hairline in `on-surface-variant` at 70%.',
  5: 'The highest lift: a hairline in the text ink at 85%. Height says no meaning, so no hairline takes a hue.',
};

/** The families the code's stacks ask for. */
export const FAMILIES: Readonly<Record<string, string>> = {
  michroma: '"Michroma", ui-sans-serif, system-ui, sans-serif',
  barlow: '"Barlow", ui-sans-serif, system-ui, sans-serif',
  'chakra-petch': '"Chakra Petch", ui-sans-serif, system-ui, sans-serif',
  'jetbrains-mono': '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  archivo: '"Archivo Variable", "Arial Black", sans-serif',
};
