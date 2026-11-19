/**
 * Nemia's presence as the frame reads it, for her face in the rail and her side sheet alike: from her chat, the frame's one holder of it
 * (`useNemiaChat`), and the runs that wait on the person, which are the frame's run list's `counts.waiting` (`frameRunsQuery`) — the
 * query the rail's Runs badge and the Runs page read, so the three say one number and are read again together. Never from the whole list
 * of the runs, which `frameReach` refuses the frame.
 */
import { useQuery } from '@tanstack/react-query';
import { frameRunsQuery } from '@/components/nav/nav';
import { presenceOf } from '@/lib/chatFollowing';
import { useNemiaChat } from '@/lib/useNemiaChat';

/**
 * Her presence at the page at `path`.
 *
 * @param path the address of the page
 */
export function useNemiaPresence(path: string) {
  const chat = useNemiaChat();
  const counted = useQuery(frameRunsQuery(path)).data;
  return presenceOf(chat.state.presence, chat.kept !== null, counted?.counts.waiting ?? 0, chat.state.events);
}
