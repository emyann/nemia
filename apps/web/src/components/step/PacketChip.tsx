/**
 * A packet — what a step handed the step that takes its declared output — as a chip: its label (the giver's name), and how many fields
 * and files it carried, in the same words on the graph's edge and in the taker's Got.
 */
import { useNavigate } from '@tanstack/react-router';
import { stepAnchor } from '@/lib/asks';
import type { Packet } from '@/lib/canvas';
import { cn, focusRing } from '@/components/ui/ds/utils';

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A packet in words: `plan · 2 fields · 1 file`. */
export const packetWords = (packet: Pick<Packet, 'label' | 'fields' | 'files'>): string =>
  `${packet.label} · ${plural(packet.fields, 'field')} · ${plural(packet.files, 'file')}`;

/**
 * The packet `packet` on the graph's edge, at `x`, `y` on the canvas: a button that moves the page to the giver's part (`#step-<giver>`),
 * the address kept, so the part shows the try the packet was counted from. Neither a drag nor a pan starts on it. It stands over the
 * nodes, whose gap is narrower than its words, so it is read whole.
 */
export function PacketChip({ packet, x, y }: { packet: Packet; x: number; y: number }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      data-packet={packet.from}
      data-packet-to={packet.to}
      title={`What ${packet.from} handed ${packet.to}: read it in ${packet.from}'s part`}
      onClick={() => void navigate({ to: '.', search: true, hash: stepAnchor(packet.from), resetScroll: false })}
      style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`, pointerEvents: 'all', zIndex: 1001 }}
      className={cn(
        'nodrag nopan border border-outline-variant bg-surface-container px-1.5 py-0.5 font-mono text-body-small text-on-surface hover:border-on-surface',
        focusRing(),
      )}
    >
      {packetWords(packet)}
    </button>
  );
}
