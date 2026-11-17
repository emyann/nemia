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
  return describing(trigger);
}

/**
 * Opens the kit's tooltip of `trigger`, inside a row of the kit's table, as a person who reaches it by the keyboard does: the focus put
 * on its row, then the right arrow pressed, from mark to mark of the row, until it reaches `trigger`. A table's row takes back a focus
 * a script puts on a mark inside it, so no other way reaches one. Answers the tooltip that describes it.
 * @param user The user the play function is handed.
 * @param row The row of the table that holds `trigger`.
 * @param trigger The mark or link the tooltip hangs off.
 */
export async function tipInRow(user: User & Keys, row: HTMLElement, trigger: Element): Promise<HTMLElement> {
  await user.tab();
  row.focus();
  for (let i = 0; i < 20 && document.activeElement !== trigger; i += 1) await user.keyboard('{ArrowRight}');
  if (document.activeElement !== trigger) throw new Error(`the right arrow never reached ${trigger.outerHTML.slice(0, 80)}`);
  return describing(trigger);
}

/** What of the user a play function is handed `tipInRow` drives besides: its keys. */
type Keys = { keyboard: (keys: string) => Promise<void> };

/** The tooltip that describes `trigger` (`role="tooltip"`, named by its `aria-describedby`), once it opens. */
const describing = (trigger: Element): Promise<HTMLElement> =>
  waitFor(() => {
    const tip = document.getElementById(trigger.getAttribute('aria-describedby') ?? '');
    if (tip?.getAttribute('role') !== 'tooltip') throw new Error(`no tooltip describes ${trigger.outerHTML.slice(0, 80)}`);
    return tip;
  });

/**
 * The keyboard's menu key on `element`, as a person presses it: Shift+F10 sent, then the `contextmenu` the browser makes of it, at no
 * pointer (`button` -1, as Chromium sends it), since a script's keys have no default action. That Chromium makes it of its own keys is read
 * by the look's browser tests (`test/e2e/menu-key.test.ts`).
 * @param user The user the play function is handed.
 * @param element What has the focus when the key is pressed.
 */
export async function menuKey(user: { keyboard: (keys: string) => Promise<unknown> }, element: HTMLElement): Promise<void> {
  element.focus();
  await user.keyboard('{Shift>}{F10}{/Shift}');
  element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: -1 }));
}

/**
 * The snackbar the kit's region shows once it comes: what a story's write said as its thing left the page.
 * @param body The document's body, where the region stands.
 */
export const snackbarShown = (body: HTMLElement): Promise<HTMLElement> =>
  waitFor(() => {
    const shown = body.querySelector<HTMLElement>('[data-slot="snackbar"]');
    if (!shown) throw new Error('no snackbar is shown');
    return shown;
  });
