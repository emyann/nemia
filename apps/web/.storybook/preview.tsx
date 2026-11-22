/**
 * What every story of the look is drawn in, in Storybook and in `npm run stories` alike: the board's styles, in the theme the toolbar
 * picks (dark, Nemia's default, unless a person switches it: the class it sets on `<html>`, `scheme.ts`), the look's ground, and a router
 * of its own over a history kept in memory, so a link of a story leads somewhere and moves no address but its
 * own. Where that router stands is written on the story's wrapper (`data-at`), and how many times it moved (`data-moves`). A story's
 * parameters say `at`, the address it opens on, and `scrollMark: false`, for a story nothing marks the scrolls of.
 *
 * A page body's queries resolve against a query client made once for each story, retrying nothing, so a refused read is said at once;
 * its requests are answered by MSW (`mswLoader`) from the handlers a story names in `parameters.msw`, over fixtures typed by `objects`
 * (`.storybook/fixtures/`). Every story is held to axe in the accessibility addon as `error`, so a violation fails `npm run stories`; a
 * story that fails it today has its a11y test set to warn only, in its own file, a count `test/stories.test.ts` holds to its
 * baseline. A story the holder caught throwing, or one that draws nothing, fails after it is drawn (`afterEach`, `undrawn`), so a
 * broken story is a failing test and not a quiet `data-broken`. Once Storybook has finished a story, its play function and `afterEach`
 * run, the document's body says which (`data-story-finished`), so a browser test that opens it alone (`test/e2e/stories/built.ts`)
 * presses nothing while the play still moves the focus. The stage a story is drawn on is `stage.tsx`, which the design system's
 * producer (`tools/design-system`) bundles too, so its cards draw under the same one.
 */
import type { Preview, ReactRenderer } from '@storybook/react-vite';
import { withThemeByClassName } from '@storybook/addon-themes';
import { mswLoader } from 'msw-storybook-addon/csf3';
import { STORY_FINISHED, type StoryFinishedPayload } from 'storybook/internal/core-events';
import { addons } from 'storybook/preview-api';
import '../src/styles.css';
import { undrawn } from './drawn';
import { SCHEME_CLASSES } from './scheme';
import { Routed } from './stage';

/** The attribute of the document's body that names the story Storybook last finished. */
const FINISHED = 'data-story-finished';

let marking = false;

/**
 * Has the body name each story Storybook finishes, once: its channel is listened to from the first story drawn, since it is set only
 * after this file is read.
 */
function markFinished() {
  if (marking) return;
  marking = true;
  addons.getChannel().on(STORY_FINISHED, ({ storyId }: StoryFinishedPayload) => document.body.setAttribute(FINISHED, storyId));
}

const preview: Preview = {
  parameters: { layout: 'fullscreen', a11y: { test: 'error' } },
  loaders: [mswLoader()],
  afterEach: ({ canvasElement, id }) => {
    const broken = canvasElement.querySelector('[data-broken]');
    const drawn = canvasElement.querySelector('[data-story-ground] > *')?.getBoundingClientRect().height ?? 0;
    const faults = undrawn([{ id, broken: broken ? (broken.textContent ?? '') : null, height: drawn }]);
    if (faults.length) throw new Error(`the story did not draw as it should: ${faults.join('; ')}`);
  },
  decorators: [
    withThemeByClassName<ReactRenderer>({ themes: { ...SCHEME_CLASSES }, defaultTheme: 'dark', parentSelector: 'html' }),
    (Story, { parameters }) => {
      markFinished();
      return <Routed Story={Story} at={typeof parameters.at === 'string' ? parameters.at : '/'} marked={parameters.scrollMark !== false} />;
    },
  ],
};

export default preview;
