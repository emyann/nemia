/** The words an agent's are said to a session in (`framedFor`), and the frame around them, which `say.ts` reads back (`saidBy`). */
import type { FramedFor } from '../../contracts/speaker.contract.ts';
import { PERSON_FRAME } from './speaker-words.ts';

/**
 * The words `text` from `speaker` are said to the task in, so it knows who wrote them: the person's as they always were
 * (`PERSON_FRAME`), an agent's under its name and never as the person's. Pure.
 */
export const framedFor: FramedFor = (speaker, text) =>
  speaker.kind === 'person' ? PERSON_FRAME + text : AGENT_OPENS + speaker.name + AGENT_WRITES + text;

/** The words an agent's frame opens with, before its name: `framedFor`'s (chat.ts), read back by `saidBy`. */
export const AGENT_OPENS = 'The agent ';

/** The words between an agent's name and its own in its frame: `framedFor`'s (chat.ts), read back by `saidBy`. */
export const AGENT_WRITES = ' writes, not the person: ';

