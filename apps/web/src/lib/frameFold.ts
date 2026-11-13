/**
 * How the frame stands around Nemia's side sheet (`frameFold`, proved by `contracts/frame-fold.contract.ts`): the rail's form, her sheet's
 * form, and whether the rail is narrow only for her sheet. Pure and level-triggered: the rail folded for her sheet is read from what holds
 * now, never written as the person's fold, so it comes back as it was the moment the sheet closes.
 */
import type { FrameAt, FrameFold, FrameFoldOf } from '../../contracts/frame-fold.contract.ts';

export type { FrameAt, FrameFold, FrameWidth } from '../../contracts/frame-fold.contract.ts';

/**
 * Her sheet is drawn where her face opened it off her own page: modal on a narrow screen, docked wider. The rail is the drawer on a narrow
 * screen; wider it is narrow where the person closed it, or where it makes room for her docked sheet under 1600 and they have not asked for
 * it back; and it is said folded for her sheet exactly where they keep it open and it is narrow.
 */
export const frameFold: FrameFoldOf = (at: FrameAt): FrameFold => {
  const wanted = at.sheetOpen && !at.ownsChat;
  const sheet = !wanted ? 'none' : at.width === 'narrow' ? 'modal' : 'docked';
  if (at.width === 'narrow') return { rail: 'drawer', sheet, foldedForSheet: false };
  const makesRoom = at.width === 'medium' && wanted && !at.railAsked;
  const rail = at.railOpen && !makesRoom ? 'expanded' : 'collapsed';
  return { rail, sheet, foldedForSheet: at.railOpen && rail === 'collapsed' };
};
