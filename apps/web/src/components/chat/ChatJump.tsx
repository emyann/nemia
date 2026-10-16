/**
 * The pill over the talk while the person has read back: `2 new · Jump to the latest` (`jumpWords`), the look's pressed cut button
 * (`CutPress`, `change-the-board` item 9). Pressing it scrolls the talk to her latest, which is what lets the read mark be posted.
 */
import { CutPress } from '@/components/look';
import { jumpWords } from '@/lib/chatFollowing';

/** The pill, drawn only where something is unread and below what is on screen. */
export function ChatJump({ unread, onJump }: { unread: number; onJump: () => void }) {
  return (
    <div data-chat-jump className="flex justify-center">
      <CutPress onPress={onJump}>{jumpWords(unread)}</CutPress>
    </div>
  );
}
