/**
 * The board's approved pictures: each story's picture in the dark theme, Nemia's default, `test/approved/<story id>.png`, and each light
 * canary's in the light theme besides, `test/approved/light/<story id>.png`, committed in git and drawn by `npm run stories -- --update`
 * in the pinned place (`test/e2e/stories/pinned.ts`). The stories project compares every story against its picture (`compare.ts`), and
 * `test/approved.test.ts` refuses the folder while it owes a picture or holds a stray one (`unapprovedOf`, proved by
 * `contracts/approved-pictures.contract.ts`).
 *
 * Light is held by the design system rather than a picture of every story: the palette guard (`test/palette.test.ts`), the theme's
 * contrast pairs in both schemes (`test/theme-contrast.test.ts`) and the rendered contrast measure (`test/e2e/contrast.ts`). The canaries
 * are the stories that draw what the board writes for one scheme outside the theme's roles: the run's `dark:` grounds
 * (`look/run.recipe.ts`), the grain's own media rule, the sticker's breakdown and the agent's plate (`agent/AgentParts.tsx`), and one
 * dense page.
 */
import { outsideExactly, outsideOnce, type UnapprovedOf } from '../contracts/approved-pictures.contract.ts';
import type { Scheme } from './scheme.ts';

/** The approved pictures' folder, from the board's folder. */
export const APPROVED = 'test/approved';

/** The folder of the light canaries' pictures, under `APPROVED`. */
export const LIGHT = 'light';

/** The stories also approved in the light theme, by Storybook's id. */
export const LIGHT_CANARIES: readonly string[] = [
  'look-run--every-state',
  'look-stattile--with-a-breakdown',
  'pages-runs--every-state',
  'pages-agent--yours',
];

/**
 * The name a story's picture is compared under in `theme` (`toMatchScreenshot`'s): its id cut at its `--` into two segments, since
 * Vitest folds a doubled dash of a name into one, under `light/` for the light theme.
 * @param id Storybook's id of the story.
 * @param theme The theme the picture is drawn in.
 */
export const pictureName = (id: string, theme: Scheme): string =>
  `${theme === 'light' ? `${LIGHT}/` : ''}${id.split('--').join('/')}`;

/**
 * The file under `APPROVED` of the picture compared under `name` (`pictureName`), a suffix Vitest adds to its last segment kept.
 * @param name The name the picture was compared under.
 */
export const pictureFile = (name: string): string => {
  const parts = name.split('/');
  const light = parts.length > 2 && parts[0] === LIGHT;
  return `${light ? `${LIGHT}/` : ''}${parts.slice(light ? 1 : 0).join('--')}`;
};

/**
 * What the approved folder owes or holds astray.
 * @param stories The ids of the stories there are.
 * @param dark The ids the dark pictures are named by.
 * @param light The ids the light pictures are named by.
 * @param canaries The light canaries.
 */
export const unapprovedOf: UnapprovedOf = (stories, dark, light, canaries) => {
  outsideOnce(stories, dark);
  outsideOnce(dark, stories);
  outsideOnce(canaries, light);
  outsideOnce(light, canaries);
  outsideOnce(canaries, stories);
  outsideExactly(stories, dark);
  outsideExactly(dark, stories);
  outsideExactly(canaries, light);
  outsideExactly(light, canaries);
  outsideExactly(canaries, stories);
  return {
    unpictured: stories.filter((id) => !dark.includes(id)),
    stray: dark.filter((id) => !stories.includes(id)),
    lightUnpictured: canaries.filter((id) => !light.includes(id)),
    lightStray: light.filter((id) => !canaries.includes(id)),
    notAStory: canaries.filter((id) => !stories.includes(id)),
  };
};
