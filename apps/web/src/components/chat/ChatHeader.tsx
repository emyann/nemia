/**
 * The header of Nemia's chat: her face, her name, the one line that says where she is and what her sessions cost, and the three
 * controls the canvas gives the floating panel — grow it to the whole space, open it as a page, close it. The page at `/chat` is the
 * panel itself, so it draws none of them.
 */
import { ExternalLinkIcon, Maximize2Icon, Minimize2Icon, XIcon } from 'lucide-react';
import { IconButton } from '@/components/ui/ds';
import { LinkButton } from '@/components/ui/button';
import { chatHeaderLine, spendWords } from '@/lib/nemia';
import type { NemiaLevel } from '@/lib/api';
import type { Presence } from '@/lib/presence';
import { NemiaFace } from '../NemiaFace';
import { routeLink } from '../routeLink';

const RouterLinkButton = routeLink(LinkButton);

/** How the panel stands: floating over the page, grown to the whole frame, or the page of its own at `/chat`. */
export type ChatMode = 'float' | 'grown' | 'page';

/**
 * Her name over the line `chatHeaderLine` says, her face at 34 beside it, and — floating or grown — the grow, open-as-a-page and close
 * controls. `now` dates the hour her stopping is said at, so no component reads the clock for itself.
 */
export function ChatHeader({
  nemia,
  presence,
  now,
  mode,
  onGrow,
  onClose,
}: {
  nemia: NemiaLevel | undefined;
  presence: Presence;
  now: Date;
  mode: ChatMode;
  onGrow: () => void;
  onClose: () => void;
}) {
  const grown = mode === 'grown';
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
          <IconButton
            variant="standard"
            icon={grown ? Minimize2Icon : Maximize2Icon}
            aria-label={grown ? 'Give back the space' : 'Grow to the whole space'}
            onPress={onGrow}
          />
          <RouterLinkButton to="/chat" variant="ghost" size="icon-sm" aria-label="Open as a page">
            <ExternalLinkIcon />
          </RouterLinkButton>
          <IconButton variant="standard" icon={XIcon} aria-label="Close" onPress={onClose} />
        </>
      )}
    </div>
  );
}
