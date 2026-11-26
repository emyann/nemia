/**
 * The brand book's table of surfaces and what goes on them: for each fill of the theme, the content colours made for it, with the two
 * colours and their contrast in each scheme, a row of several surfaces saying the least and the most.
 */

/** Each surface of the theme with what is made to go on it: one surface, or several that carry the same content colours. */
const ON: readonly (readonly [readonly string[], readonly string[]])[] = [
  [['primary'], ['on-primary']],
  [['primary-container'], ['on-primary-container']],
  [['secondary'], ['on-secondary']],
  [['secondary-container'], ['on-secondary-container']],
  [['tertiary'], ['on-tertiary']],
  [['tertiary-container'], ['on-tertiary-container']],
  [['error'], ['on-error']],
  [['error-container'], ['on-error-container']],
  [['background'], ['on-background']],
  [
    [
      'surface',
      'surface-dim',
      'surface-bright',
      'surface-container-lowest',
      'surface-container-low',
      'surface-container',
      'surface-container-high',
      'surface-container-highest',
    ],
    ['on-surface', 'on-surface-variant'],
  ],
  [['surface-variant'], ['on-surface-variant']],
  [['inverse-surface'], ['inverse-on-surface', 'inverse-primary']],
  [
    ['primary-fixed', 'primary-fixed-dim'],
    ['on-primary-fixed', 'on-primary-fixed-variant'],
  ],
  [
    ['secondary-fixed', 'secondary-fixed-dim'],
    ['on-secondary-fixed', 'on-secondary-fixed-variant'],
  ],
  [
    ['tertiary-fixed', 'tertiary-fixed-dim'],
    ['on-tertiary-fixed', 'on-tertiary-fixed-variant'],
  ],
];

/**
 * A colour of tokens.json, `hsl(h s% l%)`, as its three channels from 0 to 255.
 * @param hsl the colour.
 */
const channels = (hsl: string) => {
  const [hue = 0, saturation = 0, lightness = 0] = (/hsl\(([\d.]+) ([\d.]+)% ([\d.]+)%\)/.exec(hsl) ?? []).slice(1).map(Number);
  const [s, l] = [saturation / 100, lightness / 100];
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)] as const;
};

const hexOf = (hsl: string) =>
  `#${channels(hsl)
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;

const luminance = (hsl: string) => {
  const [r = 0, g = 0, b = 0] = channels(hsl).map((c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (one: string, other: string) => {
  const [high = 0, low = 0] = [luminance(one), luminance(other)].toSorted((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};

/** A contrast to one decimal, cut and never rounded up: 4.49 is not 4.5. */
const cut = (n: number) => (Math.floor(n * 10) / 10).toFixed(1);

/**
 * The table's markdown.
 * @param valueOf a role's colour in a theme.
 */
export const surfacesTable = (valueOf: (role: string, theme: string) => string) => {
  const cell = (surfaces: readonly string[], on: string, theme: string) => {
    const ratios = surfaces.map((surface) => contrast(valueOf(on, theme), valueOf(surface, theme)));
    const [least, most] = [Math.min(...ratios), Math.max(...ratios)];
    const said = cut(least) === cut(most) ? `${cut(least)}:1` : `${cut(least)} to ${cut(most)}:1`;
    return surfaces.length === 1 ? `${hexOf(valueOf(on, theme))} on ${hexOf(valueOf(surfaces[0] ?? '', theme))}, ${said}` : said;
  };
  const rows = ON.flatMap(([surfaces, ons]) =>
    ons.map(
      (on) =>
        `| ${surfaces.map((x) => `\`${x}\``).join(', ')} | \`${on}\` | ${cell(surfaces, on, 'dark')} | ${cell(surfaces, on, 'light')} |`,
    ),
  );
  return [
    '### Surfaces and what goes on them',
    '',
    'Every fill has a colour made to go on it, named `on-…`. A role below is the token `md-sys-color-<role>`; each cell says the two colours and their contrast, and a row of several surfaces says the least and the most.',
    '',
    '| A surface | What goes on it | Dark | Light |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    "The Colors view lists these same roles in one section, `md`, since each is named as the code names it (`md-sys-color-…`): a fill, then what goes on it, with the contrast beside it. Nemia's own names follow the same rule: `meaning-on-yours` goes on `meaning-yours`, and so for `alive`, `failure`, `rest` and `sage`.",
  ].join('\n');
};
