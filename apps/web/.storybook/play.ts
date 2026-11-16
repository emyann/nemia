/**
 * What the stories' play functions drive a part with, in Storybook and in `npm run stories` alike: what has the focus, the stops of the
 * Tab key, and the focus put down at the end, since Storybook runs a story's play function as it draws it and its pictures would show
 * what the play left. Each takes the `userEvent` the play function is handed, so its presses show in Storybook's interactions panel.
 * Its keys are events a script sends, which the browser turns into no click: Enter on a link, whose second navigation only the
 * browser's own click makes, is read by the look's browser tests (`test/e2e/keys.ts`).
 */

import { waitFor } from 'storybook/test';

/** What of the user a play function is handed these drive: its Tab key. */
type User = { tab: (options?: { shift?: boolean }) => Promise<void> };

/** Takes the focus off what has it, so the story a play function leaves behind is pictured at rest, as it was drawn. */
export const atRest = (): void => (document.activeElement as HTMLElement | null)?.blur();

/** What has the focus, as its marks say it: its `data-` attributes' names, and its text. */
export const focused = (): { marks: string[]; text: string } => {
  const at = document.activeElement as HTMLElement | null;
  return { marks: at && at !== document.body ? Object.keys(at.dataset) : [], text: at?.textContent ?? '' };
};

/**
 * Presses Tab until what has the focus carries `mark`, a `data-` attribute by its camel-cased name.
 * @param user The user the play function is handed.
 * @param mark The mark, camel-cased as `dataset` names it.
 */
export async function tabTo(user: User, mark: string): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    await user.tab();
    if (focused().marks.includes(mark)) return;
  }
  throw new Error(`Tab never reached ${mark}`);
}

/**
 * Every stop of the Tab key that carries a mark, in order, from the top of the story until it comes back to the first: each by its
 * marks and text; none where forty presses reach no stop that carries one.
 * @param user The user the play function is handed.
 */
export async function tabStops(user: User): Promise<Array<{ marks: string[]; text: string }>> {
  const stops: Array<{ marks: string[]; text: string }> = [];
  for (let i = 0; i < 40; i += 1) {
    await user.tab();
    const stop = focused();
    if (stops.length > 0 && stop.text === stops[0].text && stop.marks.join() === stops[0].marks.join()) return stops;
    if (stop.marks.length > 0) stops.push(stop);
  }
  if (stops.length === 0) return stops;
  throw new Error(`Tab did not come back to its first stop in 40 presses: ${JSON.stringify(stops)}`);
}

/**
 * Opens the kit's tooltip of `trigger` by the keyboard, as a person who tabs to it does: one Tab press puts the page in the keyboard's
 * mode, then the focus is put on `trigger`. Answers the tooltip that describes it (`role="tooltip"`, named by its `aria-describedby`).
 * @param user The user the play function is handed.
 * @param trigger The mark, link or button the tooltip hangs off.
 */
export async function tipOf(user: User, trigger: Element): Promise<HTMLElement> {
  await user.tab();
  (trigger as HTMLElement).focus();
  return waitFor(() => {
    const tip = document.getElementById(trigger.getAttribute('aria-describedby') ?? '');
    if (tip?.getAttribute('role') !== 'tooltip') throw new Error(`no tooltip describes ${trigger.outerHTML.slice(0, 80)}`);
    return tip;
  });
}
