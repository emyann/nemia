/**
 * A packet — what a step handed the step that takes its declared output — as a chip: its label (the giver's name), and how many fields
 * and files it carried, in the same words on the graph's edge and in the taker's Got.
 */
import { useNavigate } from '@tanstack/react-router';
import { stepAnchor } from '@/lib/asks';
import type { Packet } from '@/lib/canvas';
import { Button } from '@/components/ui/ds';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * A packet in words: `plan · 2 fields · 1 file`.
 *
 * @param packet the packet, read for its label and its counts
 */
export const packetWords = (packet: Pick<Packet, 'label' | 'fields' | 'files'>) =>
  `${packet.label} · ${plural(packet.fields, 'field')} · ${plural(packet.files, 'file')}`;

/**
 * The packet `packet` on the graph's edge, at `x`, `y` on the canvas: a button that moves the page to the giver's part (`#step-<giver>`),
 * the address kept, so the part shows the try the packet was counted from. Neither a drag nor a pan starts on it. It stands over the
 * nodes, whose gap is narrower than its words, so it is read whole.
 */
export function PacketChip({ packet, x, y }: { packet: Packet; x: number; y: number }) {
  const navigate = useNavigate();
  return (
    <Button
      variant="outlined"
      size="xsmall"
      shape="square"
      data-packet={packet.from}
      data-packet-to={packet.to}
      onPress={() => void navigate({ to: '.', search: true, hash: stepAnchor(packet.from), resetScroll: false })}
      style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`, pointerEvents: 'all', zIndex: 1001 }}
      className="nodrag nopan bg-surface-container text-on-surface"
      classNames={{ label: 'font-mono text-body-small' }}
    >
      <span title={`What ${packet.from} handed ${packet.to}: read it in ${packet.from}'s part`}>{packetWords(packet)}</span>
    </Button>
  );
}
