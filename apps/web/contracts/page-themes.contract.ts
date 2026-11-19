/**
 * The themes a run of the e2e visits its pages in (apps/web, test/e2e/pages.ts, `themesOf`, read by `planOf`): dark is Nemia's default
 * and every run visits it, last; light is visited only when it is asked for on purpose, by `--light`, or by `--contrast`, whose measure
 * reads both schemes. The flags are read from the command line by `planOf`, which refuses `--light` and `--contrast` without `--photos`
 * before it asks.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A theme a page is visited in. */
export type PageTheme = 'light' | 'dark';

/**
 * What the command line asked of the themes: pictures (`--photos`), light pictures besides (`--light`), the contrast's measure
 * (`--contrast`).
 */
export type ThemesAsked = { readonly photos: boolean; readonly light: boolean; readonly contrast: boolean };

const themesOfSpec = spec<(asked: ThemesAsked) => readonly PageTheme[]>({
  requires: ({ input: [asked] }) => (!asked.light || asked.photos) && (!asked.contrast || asked.photos),
  ensures: {
    darkAlwaysLast: {
      description: 'Every run visits its pages in the dark theme, and last',
      condition: ({ output }) => output.length > 0 && output.at(output.length - 1) === 'dark',
    },
    lightExactlyWhenAsked: {
      description: 'The light theme is visited exactly when --light or --contrast asks for it, never by --photos alone',
      condition: ({ input: [asked], output }) => output.includes('light') === (asked.light || asked.contrast),
    },
    eachOnce: {
      description: 'No theme is visited twice',
      condition: ({ output }) => output.every((theme, at) => !output.slice(0, at).includes(theme)),
    },
  },
});
export type ThemesOf = Implementation<typeof themesOfSpec>;
