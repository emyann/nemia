/**
 * The header of Nemia's chat: her face, her name, the one line that says where she is and what her sessions cost, and the two controls
 * the canvas gives her side sheet — open it as a page, close it. The page at `/chat` is the panel itself, so it draws neither.
 */
import { ExternalLinkIcon, XIcon } from 'lucide-react';
import { IconButton } from '@/components/ui/ds';
import { LinkButton } from '@/components/ui/button';
import { chatHeaderLine, spendWords } from '@/lib/nemia';
import type { NemiaLevel } from '@/lib/api/nemia';
import type { Presence } from '@/lib/presence';
import { NemiaFace } from '../NemiaFace';
import { routeLink } from '../../nav/routeLink';

const RouterLinkButton = routeLink(LinkButton);

/** How the panel stands: in her side sheet beside the page, or the page of its own at `/chat`. */
export type ChatMode = 'sheet' | 'page';

/**
 * Her name over the line `chatHeaderLine` says, her face at 34 beside it, and in her sheet the open-as-a-page and close controls, the
 * first closing the sheet as it leads to `/chat`. `now` dates the hour her stopping is said at, so no component reads the clock for itself.
 */
export function ChatHeader({
  nemia,
  presence,
  now,
  mode,
  onClose,
}: {
  nemia: NemiaLevel | undefined;
  presence: Presence;
  now: Date;
  mode: ChatMode;
  onClose: () => void;
}) {
  return (
    <div data-chat-header className="flex items-center gap-3">
      <NemiaFace presence={presence} size={34} />
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="text-title-small text-on-surface">Nemia</h2>
        <span
          data-chat-where
          className="text-body-small text-on-surface-variant"
          title={nemia?.spend ? spendWords(nemia.spend) : undefined}
        >
          {chatHeaderLine(nemia, presence, now)}
        </span>
      </div>
      {mode !== 'page' && (
        <>
          <RouterLinkButton to="/chat" variant="ghost" size="icon-sm" aria-label="Open as a page" onPress={onClose}>
            <ExternalLinkIcon />
          </RouterLinkButton>
          <IconButton variant="standard" icon={XIcon} aria-label="Close" onPress={onClose} />
        </>
      )}
    </div>
  );
}
