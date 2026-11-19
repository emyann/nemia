/**
 * How the frame stands around its one side sheet and its factory pane (`frameFold`, proved by `contracts/frame-fold.contract.ts`): the
 * store rail's form, the factory pane's form, the sheet's form and what the sheet shows (what the address's `?bar=` names, or Nemia's
 * chat). Pure and level-triggered: the pane covered by the docked sheet under 1600 is read from what holds now, never written as the
 * person's fold, so it comes back as it was the moment the sheet closes.
 */
import type { FrameAt, FrameFoldOf } from '../../contracts/frame-fold.contract.ts';

/** The factory pane wider than a narrow screen: none off a factory, folded as the person keeps it, covered by the sheet under 1600. */
const paneWide = (at: FrameAt, wanted: boolean) => {
  if (!at.hasPane) return 'none';
  if (!at.paneOpen) return 'folded';
  return at.width === 'medium' && wanted ? 'covered' : 'docked';
};

/**
 * The sheet shows what the address's `?bar=` names wherever it names one, else her chat where her face opened it off her own page, else
 * nothing; it is modal on a narrow screen and docked wider. The rail is the drawer on a narrow screen and docked otherwise. The pane is
 * drawn only on a factory's page: a section of the drawer on a narrow screen, folded where the person folded it, covered by the docked
 * sheet under 1600, and docked otherwise.
 * @param at What holds now: the screen's width, whether the page has a factory pane and the person keeps it open, what the address's
 * `?bar=` names and her sheet.
 */
export const frameFold: FrameFoldOf = (at: FrameAt) => {
  const shows = at.barOpen ? 'bar' : at.sheetOpen && !at.ownsChat ? 'her' : 'none';
  const wanted = shows !== 'none';
  if (at.width === 'narrow') {
    return { rail: 'drawer', pane: at.hasPane ? 'drawer' : 'none', sheet: wanted ? 'modal' : 'none', shows };
  }
  return { rail: 'docked', pane: paneWide(at, wanted), sheet: wanted ? 'docked' : 'none', shows };
};

/** The cookie that keeps the person's fold of the factory pane, read when the frame first draws, as the sidebar's provider kept it. */
const PANE_COOKIE = 'sidebar_state';

/** How long the fold is kept, in seconds: a week. */
const PANE_COOKIE_AGE = 60 * 60 * 24 * 7;

/**
 * Whether the person keeps the factory pane open, as `paneCookie` last kept its fold: folded only where a `sidebar_state=false` pair is
 * kept, open for none.
 * @param cookie The page's `document.cookie`.
 */
export function paneOpenOf(cookie: string) {
  return !cookie.split(';').some((pair) => pair.trim() === `${PANE_COOKIE}=false`);
}

/**
 * The cookie that keeps the person's fold, for a week, across the whole board: written only when they fold or unfold the pane, never
 * for the pane the sheet covers.
 * @param open Whether they keep the pane open.
 */
export function paneCookie(open: boolean) {
  return `${PANE_COOKIE}=${open}; path=/; max-age=${PANE_COOKIE_AGE}`;
}
