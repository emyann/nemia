import { useMedia } from '../lib/useMedia.ts';

/** Whether the window is narrower than a tablet (768 pixels): false where there is no browser to ask. */
export function useIsMobile() {
  return useMedia('(max-width: 767px)', false);
}
