/**
 * How the frame stands around its one side sheet (`frameFold`, proved by `contracts/frame-fold.contract.ts`): the rail's form, the sheet's
 * form, what the sheet shows (what the address's `?bar=` names, or Nemia's chat), and whether the rail is narrow only for the sheet. Pure
 * and level-triggered: the rail folded for the sheet is read from what holds now, never written as the person's fold, so it comes back as
 * it was the moment the sheet closes.
 */
import type { FrameAt, FrameFold, FrameFoldOf } from '../../contracts/frame-fold.contract.ts';

export type { FrameFold } from '../../contracts/frame-fold.contract.ts';

/**
 * The sheet shows what the address's `?bar=` names wherever it names one, else her chat where her face opened it off her own page, else
 * nothing; it is modal on a narrow screen and docked wider. The rail is the drawer on a narrow screen; wider it is narrow where the person
 * closed it, or where it makes room for the docked sheet under 1600 and they have not asked for it back; and it is said folded for the
 * sheet exactly where they keep it open and it is narrow.
 */
export const frameFold: FrameFoldOf = (at: FrameAt): FrameFold => {
  const shows = at.barOpen ? 'bar' : at.sheetOpen && !at.ownsChat ? 'her' : 'none';
  const wanted = shows !== 'none';
  const sheet = !wanted ? 'none' : at.width === 'narrow' ? 'modal' : 'docked';
  if (at.width === 'narrow') return { rail: 'drawer', sheet, shows, foldedForSheet: false };
  const makesRoom = at.width === 'medium' && wanted && !at.railAsked;
  const rail = at.railOpen && !makesRoom ? 'expanded' : 'collapsed';
  return { rail, sheet, shows, foldedForSheet: at.railOpen && rail === 'collapsed' };
};
