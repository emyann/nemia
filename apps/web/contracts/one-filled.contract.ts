/**
 * Which views of a story hold more than their one filled action (apps/web, `.storybook/filled.ts`, `overFilled`, read by the
 * preview's `afterEach`): `DESIGN.md`, *Ink and the one action*, gives a view exactly one filled button, the look's cut one, and a
 * view is the page and each thing that opens over it, a dialog, a popover's form, a side sheet. The caller counts each view's filled
 * actions in the drawn story (the look's `CutPress` and `CutButton` not quiet, and any filled button of the kit or of shadcn left), the
 * page counted without what opens over it; the story fails, naming each view this answers.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A view as the story drew it: its name, and how many filled actions it holds, not counting the views open over it. */
export type ViewFilled = { readonly view: string; readonly filled: number };

/** Whether `views` names no view twice. */
const named = (views: readonly ViewFilled[]) => views.every((one, at) => views.slice(0, at).every((before) => before.view !== one.view));

/** Whether a view holds more filled actions than the one it may. */
const over = (one: ViewFilled) => one.filled > 1;

const overFilledSpec = spec<(views: readonly ViewFilled[]) => readonly string[]>({
  requires: ({ input: [views] }) => named(views) && views.every((one) => Number.isInteger(one.filled) && one.filled >= 0),
  ensures: {
    overIsNamed: {
      description: 'A view that holds two filled actions or more is named',
      condition: ({ input: [views], output }) => views.every((one) => !over(one) || output.includes(one.view)),
    },
    oneIsAllowed: {
      description: 'A view that holds one filled action, or none, is never named',
      condition: ({ input: [views], output }) => views.every((one) => over(one) || !output.includes(one.view)),
    },
    onlyViews: {
      description: 'Only a view the story drew is named',
      condition: ({ input: [views], output }) => output.every((name) => views.some((one) => one.view === name)),
    },
    onceEach: {
      description: 'A view is named once',
      condition: ({ output }) => output.every((name, at) => !output.slice(0, at).includes(name)),
    },
  },
});
export type OverFilled = Implementation<typeof overFilledSpec>;
