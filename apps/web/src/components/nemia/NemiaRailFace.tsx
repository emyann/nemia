/**
 * Nemia's face as the first thing of the frame's rail (`FrameRail`), or of the top bar on a narrow screen (`FrameHeader`): the button that
 * opens and closes her side sheet (`HerSheet`), saying whether it is open (`aria-expanded`), named for what a press does and the first fact
 * that holds of her (`dockWords`), ringed while her sheet is open. On her own page (`/chat`) it is a link to that page, lit as the page's
 * (`aria-current`), ringed, opening nothing. Her expression follows her presence (`NemiaFace`); a dot at its corner takes the hue of the
 * first cue that holds — alive where none does — and every cue (`cuesOf`) is said in the kit's rich tooltip on hover or focus, as the
 * look's `CutCue`, since a cue's words do not fit the narrow rail; `data-nemia-cues` counts them. The tooltip is always there, off while
 * no cue holds, so a cue that comes while the pointer rests on her face does not take the face out from under it.
 */
import { Button, Link } from 'react-aria-components';
import { CutCue } from '@/components/look';
import { Tooltip, TooltipTrigger } from '@/components/ui/ds';
import { cuesOf, dockWords, type FaceAt, type Presence } from '@/lib/presence';
import { cn } from '@/lib/utils';
import { routeLink } from '../nav/routeLink';
import { NemiaFace } from './NemiaFace';

const RouterLink = routeLink(Link);

/** How wide her face is drawn in the rail, in pixels (B3). */
const FACE = 44;

/** The dot's ground for the first cue's hue: none is rest's outline. */
const DOT = { yours: 'bg-yours', alive: 'bg-alive', failure: 'bg-failure', none: 'bg-outline' } as const;

/** What the face's press target looks like: a rounded box the face fills, ringed on surface while `ringed`, the focus ring otherwise. */
const pressed = (ringed: boolean): string =>
  cn(
    'relative inline-flex shrink-0 cursor-pointer rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
    ringed && 'ring-2 ring-on-surface ring-offset-3 ring-offset-surface focus-visible:ring-2 focus-visible:ring-on-surface',
  );

/**
 * Her face for `presence`: `open` her sheet is open, `onToggle` opens or closes it, `ownsChat` the page is her chat's own. Its
 * `data-nemia-face-button` says where it stands (`closed`, `open`, `page`).
 */
export function NemiaRailFace({
  presence,
  open,
  ownsChat,
  onToggle,
}: {
  presence: Presence;
  open: boolean;
  ownsChat: boolean;
  onToggle: () => void;
}) {
  const at: FaceAt = ownsChat ? 'page' : open ? 'open' : 'closed';
  const cues = cuesOf(presence);
  const face = (
    <>
      <NemiaFace presence={presence} size={FACE} />
      <span
        aria-hidden
        data-nemia-face-dot={cues[0]?.hue ?? 'alive'}
        className={cn('absolute -top-0.5 -right-0.5 size-[11px] rounded-full ring-2 ring-surface', DOT[cues[0]?.hue ?? 'alive'])}
      />
    </>
  );
  const trigger = ownsChat ? (
    <RouterLink to="/chat" data-nemia-face-button={at} data-nemia-cues={cues.length} aria-label={dockWords(presence, at)} className={pressed(true)}>
      {face}
    </RouterLink>
  ) : (
    <Button
      data-nemia-face-button={at}
      data-nemia-cues={cues.length}
      aria-label={dockWords(presence, at)}
      aria-expanded={open}
      onPress={onToggle}
      className={pressed(open)}
    >
      {face}
    </Button>
  );
  return (
    <TooltipTrigger isDisabled={cues.length === 0}>
      {trigger}
      <Tooltip variant="rich" placement="right">
        <span data-nemia-cues className="flex flex-col items-start gap-1.5 pb-1">
          {cues.map((cue) => (
            <CutCue key={cue.words} hue={cue.hue}>
              {cue.words}
            </CutCue>
          ))}
        </span>
      </Tooltip>
    </TooltipTrigger>
  );
}
