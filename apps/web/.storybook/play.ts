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
export const atRest = () => (document.activeElement as HTMLElement | null)?.blur();

/**
 * Puts the focus down once a press has settled, as `atRest` does, and waits until nothing in `root` draws the focus ring: whether the
 * ring of a button pressed by a script is drawn when the picture is taken is the browser's timing, and a person who presses it with the
 * mouse sees none, nor one with the keyboard once its write took the button off and gave it back.
 * @param root The story's canvas, read for what still draws the ring.
 */
export async function settled(root: HTMLElement) {
  atRest();
  await waitFor(() => {
    if (document.activeElement !== document.body || root.querySelector(':focus-visible'))
      throw new Error('the focus is still up: what holds it draws its ring');
  });
}

/** What has the focus, as its marks say it: its `data-` attributes' names, and its text. */
const focused = () => {
  const at = document.activeElement as HTMLElement | null;
  return { marks: at && at !== document.body ? Object.keys(at.dataset) : [], text: at?.textContent ?? '' };
};

/**
 * Presses Tab until what has the focus carries `mark`, a `data-` attribute by its camel-cased name.
 * @param user The user the play function is handed.
 * @param mark The mark, camel-cased as `dataset` names it.
 */
export async function tabTo(user: User, mark: string) {
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
export async function tabStops(user: User) {
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
export async function tipOf(user: User, trigger: Element) {
  await user.tab();
  (trigger as HTMLElement).focus();
  return describing(trigger);
}

/**
 * Opens the kit's tooltip of `trigger`, inside a row of the kit's table, as a person who reaches it by the keyboard does: the focus put
 * on its row, then the right arrow pressed, from mark to mark of the row, until it reaches `trigger`. A table's row takes back a focus
 * a script puts on a mark inside it, so no other way reaches one. Answers the tooltip that describes it.
 *
 * The arrows start once the page has drawn a frame after the row took the focus. The Tab press may focus a field at the page's top and
 * scroll the window there, and the row's focus scrolls it back: the browser fires the scroll event of both at its next frame, and a
 * React Aria tooltip closes on any scroll around its trigger, so a tooltip opened before that frame was closed by it
 * and opened by nothing again (RunsPage's Nothing Waits, one CI run in twenty-five). A frame's scroll events fire before its animation
 * frame callbacks.
 * @param user The user the play function is handed.
 * @param row The row of the table that holds `trigger`.
 * @param trigger The mark or link the tooltip hangs off.
 */
export async function tipInRow(user: User & Keys, row: HTMLElement, trigger: Element) {
  await user.tab();
  row.focus();
  await new Promise((drawn) => requestAnimationFrame(drawn));
  for (let i = 0; i < 20 && document.activeElement !== trigger; i += 1) await user.keyboard('{ArrowRight}');
  if (document.activeElement !== trigger) throw new Error(`the right arrow never reached ${trigger.outerHTML.slice(0, 80)}`);
  return describing(trigger);
}

/** What of the user a play function is handed `tipInRow` drives besides: its keys. */
type Keys = { keyboard: (keys: string) => Promise<void> };

/** The tooltip that describes `trigger` (`role="tooltip"`, named by its `aria-describedby`), once it opens. */
const describing = (trigger: Element) =>
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
export async function menuKey(user: { keyboard: (keys: string) => Promise<unknown> }, element: HTMLElement) {
  element.focus();
  await user.keyboard('{Shift>}{F10}{/Shift}');
  element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: -1 }));
}

/**
 * The snackbar the kit's region shows once it comes: what a story's write said as its thing left the page.
 * @param body The document's body, where the region stands.
 */
export const snackbarShown = (body: HTMLElement) =>
  waitFor(() => {
    const shown = body.querySelector<HTMLElement>('[data-slot="snackbar"]');
    if (!shown) throw new Error('no snackbar is shown');
    return shown;
  });

/** Where `root`'s headings go more than one level deeper than the one before them, each said `h<from> to h<to>`: none, in order. */
export const skippedHeadings = (root: Element) => {
  const levels = [...root.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((heading) => Number(heading.tagName.slice(1)));
  return levels.flatMap((level, i) => (i > 0 && level > levels[i - 1] + 1 ? [`h${levels[i - 1]} to h${level}`] : []));
};

/** What of the user a play function is handed `rowOpens` drives: its Tab key, its keys and its pointer's rest. */
type Pointer = User & Keys & { hover: (element: Element) => Promise<void>; unhover: (element: Element) => Promise<void> };

/** Where the story's router stands, as its ground says it (`data-at`). */
export const standing = (root: Element) => root.closest('[data-story-ground]')?.getAttribute('data-at') ?? null;

/**
 * A row of the kit's table that opens something, driven as a person drives it: the pointer rested on it, which React Aria answers with
 * `data-hovered` where the row is interactive (the kit's hover state is CSS's `:hover`, which a script's pointer does not reach), then
 * the focus put on it from the keyboard's mode and Enter pressed. Waits until the story's router stands on `at`, then puts the pointer
 * and the focus down, so the picture is the row at rest. Throws where the row is not the kit's interactive row, does not answer the
 * pointer, or opens elsewhere.
 * @param user The user the play function is handed.
 * @param row The row of the table, a `tr`.
 * @param at The address the row opens, as the story's router writes it.
 */
export async function rowOpens(user: Pointer, row: HTMLElement, at: string) {
  if (!row.hasAttribute('data-interactive')) throw new Error(`the row is not the kit's interactive row: ${row.outerHTML.slice(0, 80)}`);
  await user.hover(row);
  await waitFor(() => {
    if (!row.hasAttribute('data-hovered')) throw new Error('the row does not answer the pointer');
  });
  await user.tab();
  row.focus();
  await user.keyboard('{Enter}');
  await waitFor(() => {
    if (standing(row) !== at) throw new Error(`the row opened ${standing(row)}, not ${at}`);
  });
  await user.unhover(row);
  atRest();
}
