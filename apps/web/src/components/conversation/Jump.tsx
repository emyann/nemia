/**
 * The pill over a conversation's talk while the person has read back: `2 new · Jump to the latest` (`jumpWords`), the look's pressed
 * cut button (`CutPress`, `change-the-board` item 9). Pressing it scrolls the talk to the latest, which is what lets the read mark be
 * posted. Its data mark is written under the prefix `marks` names (`mark`).
 */
import { CutPress } from '@/components/look';
import { jumpWords, mark } from '@/lib/conversation';

/** The pill, drawn only where something is unread and below what is on screen. */
export function Jump({ unread, marks, onJump }: { unread: number; marks: string; onJump: () => void }) {
  return (
    <div {...mark(marks, 'jump')} className="flex justify-center">
      <CutPress onPress={onJump}>{jumpWords(unread)}</CutPress>
    </div>
  );
}
