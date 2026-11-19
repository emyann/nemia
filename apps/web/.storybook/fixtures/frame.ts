/**
 * What the frame's stories answer: her chat, read empty and its stream held open with nothing on it, so the frame's parts that read her
 * presence (her face, the machine bar) draw her at rest; and the pause's reads, typed by `objects`.
 */
import { http, HttpResponse } from 'msw';
import type { ChatHistory as ChatHistoryAnswer, Paused } from 'objects';

/** Her chat's page, as `GET /api/nemia/chat` answers it. */
type ChatHistory = typeof ChatHistoryAnswer.Type;

/** Her chat with nothing said: her session up, no turn in progress, nothing waiting on the person. */
const QUIET_CHAT: ChatHistory = {
  events: [],
  before: null,
  cursor: '0',
  presence: { up: true, answering: false, waitsOnYou: 0, unread: 0, wakes: true },
};

/** Her chat's read answered empty, and its stream held open with no event, as a live stream at rest. */
export const quietChat = [
  http.get('/api/nemia/chat', () => HttpResponse.json(QUIET_CHAT)),
  http.get(
    '/api/nemia/chat/stream',
    () => new HttpResponse(new ReadableStream({ start: () => undefined }), { headers: { 'content-type': 'text/event-stream' } }),
  ),
];

/** The instant the pause stories' pause was put at. */
const PAUSED_AT = '2026-11-16T14:05:00.000Z';

/** Every factory running: no pause, nothing finishing. */
export const RUNNING: Paused = { pause: null, finishing: [], parked: [], staged: [], held: [] };

/** Every factory paused, a session parked at a tool call's end and nothing finishing. */
export const PAUSED: Paused = {
  pause: { at: PAUSED_AT, by: 'yann', why: 'merging by hand on main' },
  finishing: [],
  parked: [{ run: 'the-frame-draws-w-u4n7', step: 'implement', after: 'Bash' }],
  staged: [],
  held: [],
};
