/**
 * How many filled actions each view of a drawn story holds (`afterEach`, `preview.tsx`): `DESIGN.md`, *Ink and the one action*, gives a
 * view at most one, the look's cut button, and a view is the page and each thing that opens over it, a dialog, a popover's form, a
 * side sheet, each drawn with the `dialog` role. A filled action is the look's cut button but its quiet form, and a filled button of
 * shadcn's left; the kit's filled button is refused where it is written (`test/one-action.test.ts`), so it is not counted here.
 */
import type { OverFilled, ViewFilled } from '../contracts/one-filled.contract.ts';

/** What a filled action is drawn as. */
const FILLED = '[data-cut-button]:not([data-quiet]), [data-slot="button"][data-variant="default"]';

/** What a view open over the page is drawn as. */
const VIEW = '[role="dialog"], [role="alertdialog"]';

/**
 * The views of `views` that hold more than one filled action, each named once.
 * @param views Each view the story drew, with how many filled actions it holds.
 */
export const overFilled: OverFilled = (views) => views.filter((one) => one.filled > 1).map((one) => one.view);

/**
 * Each view `root` draws, the page first and then each view open over it in the order drawn, with the filled actions it holds that
 * are shown, those of a view open over it not counted.
 * @param root The document the story is drawn in, where a view open over the page is drawn outside the story's own element.
 */
export const filledViews = (root: Document) => {
  const views = [...root.querySelectorAll(VIEW)];
  const shown = [...root.querySelectorAll(FILLED)].filter((one) => one.getClientRects().length > 0);
  const heldBy = (view: Element | null) => shown.filter((one) => one.closest(VIEW) === view).length;
  return [
    { view: 'the page', filled: heldBy(null) },
    ...views.map((view, at) => ({ view: `${view.getAttribute('aria-label') ?? 'a view'} (${at + 1} over the page)`, filled: heldBy(view) })),
  ] satisfies ViewFilled[];
};
