/** The words an agent's are said to a session in (`framedFor`), and the frame around them, which `say.ts` reads back (`saidBy`). */
import type { FramedFor } from '../../contracts/speaker.contract.ts';
import { PERSON_FRAME } from './speaker-words.ts';
import { AGENT_OPENS, AGENT_WRITES } from '../agent-frame/agent-frame.ts';

/**
 * The words `text` from `speaker` are said to the task in, so it knows who wrote them: the person's as they always were
 * (`PERSON_FRAME`), an agent's under its name and never as the person's. Pure.
 */
export const framedFor: FramedFor = (speaker, text) =>
  speaker.kind === 'person' ? PERSON_FRAME + text : AGENT_OPENS + speaker.name + AGENT_WRITES + text;
