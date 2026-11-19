/**
 * Whether the board's approved pictures are the stories' (apps/web, `.storybook/approved.ts`, `unapprovedOf`): each story has one approved
 * picture in the dark theme, `test/approved/<story id>.png`, and each light canary one in the light theme as well,
 * `test/approved/light/<story id>.png`; a picture of a story that is gone is stray, since Vitest writes a reference and never prunes one.
 *
 * The facts are read by the caller, never here: the ids of the stories there are (Storybook's own, `toId(title, storyNameFromExport(…))`,
 * off each story file), the ids the dark pictures are named by, the ids the light pictures are named by, and the canaries
 * (`LIGHT_CANARIES`). `test/approved.test.ts` refuses the folder while any list of the answer holds a value.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** What the approved folder owes or holds astray, each list of story ids once each, in the order of the list it comes from. */
export type Unapproved = {
  /** A story with no dark picture, in the order of the stories. */
  readonly unpictured: readonly string[];
  /** A dark picture that is no story's, in the order of the dark pictures. */
  readonly stray: readonly string[];
  /** A canary with no light picture, in the order of the canaries. */
  readonly lightUnpictured: readonly string[];
  /** A light picture that is no canary's, in the order of the light pictures. */
  readonly lightStray: readonly string[];
  /** A canary that names no story, in the order of the canaries. */
  readonly notAStory: readonly string[];
};

/** Whether `list` holds no value twice: none is among those before it. */
const once = (list: readonly string[]): boolean => list.every((one, at) => !list.slice(0, at).includes(one));

/** Whether `out` holds exactly the values of `from` that `keep` keeps, and nothing else. */
const exactly = (out: readonly string[], from: readonly string[], keep: (one: string) => boolean): boolean =>
  from.every((one) => out.includes(one) === keep(one)) && out.every((one) => from.includes(one));

const unapprovedSpec = spec<(stories: readonly string[], dark: readonly string[], light: readonly string[], canaries: readonly string[]) => Unapproved>({
  ensures: {
    unpicturedExactly: {
      description: 'A story is owed its dark picture exactly when the folder holds none of it',
      condition: ({ input: [stories, dark], output }) => exactly(output.unpictured, stories, (id) => !dark.includes(id)),
    },
    strayExactly: {
      description: 'A dark picture is stray exactly when no story has its id',
      condition: ({ input: [stories, dark], output }) => exactly(output.stray, dark, (id) => !stories.includes(id)),
    },
    lightUnpicturedExactly: {
      description: 'A canary is owed its light picture exactly when the folder holds none of it',
      condition: ({ input: [, , light, canaries], output }) => exactly(output.lightUnpictured, canaries, (id) => !light.includes(id)),
    },
    lightStrayExactly: {
      description: 'A light picture is stray exactly when it is no canary\'s',
      condition: ({ input: [, , light, canaries], output }) => exactly(output.lightStray, light, (id) => !canaries.includes(id)),
    },
    notAStoryExactly: {
      description: 'A canary is refused exactly when it names no story',
      condition: ({ input: [stories, , , canaries], output }) => exactly(output.notAStory, canaries, (id) => !stories.includes(id)),
    },
    unpicturedOnce: {
      description: 'The stories owed a picture are named once each where the stories are',
      condition: ({ input: [stories], output }) => !once(stories) || once(output.unpictured),
    },
    strayOnce: {
      description: 'The stray dark pictures are named once each where the dark pictures are',
      condition: ({ input: [, dark], output }) => !once(dark) || once(output.stray),
    },
    lightUnpicturedOnce: {
      description: 'The canaries owed a light picture are named once each where the canaries are',
      condition: ({ input: [, , , canaries], output }) => !once(canaries) || once(output.lightUnpictured),
    },
    lightStrayOnce: {
      description: 'The stray light pictures are named once each where the light pictures are',
      condition: ({ input: [, , light], output }) => !once(light) || once(output.lightStray),
    },
    notAStoryOnce: {
      description: 'The canaries naming no story are named once each where the canaries are',
      condition: ({ input: [, , , canaries], output }) => !once(canaries) || once(output.notAStory),
    },
  },
});
export type UnapprovedOf = Implementation<typeof unapprovedSpec>;
