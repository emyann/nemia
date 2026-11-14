/** Whether a name is one an agent speaks under (`speakerNameRefusal`, `contracts/speaker-name.contract.ts`). */
import type { SpeakerNameRefusal } from '../../contracts/speaker-name.contract.ts';
import { RESERVED_SPEAKERS, SPEAKER_NAME_MAX, wellSpelt } from './speaker-words.ts';

/**
 * Why `name` is no name an agent speaks under, or undefined where it is one: 1 to `SPEAKER_NAME_MAX` characters, spelt as `wellSpelt`
 * says, and none of `RESERVED_SPEAKERS`. Pure.
 */
export const speakerNameRefusal: SpeakerNameRefusal = (name) => {
  if (name.length === 0) return 'The name is empty: name the agent that speaks, such as `operator`.';
  if (name.length > SPEAKER_NAME_MAX) return `The name is ${name.length} characters: name the agent in at most ${SPEAKER_NAME_MAX}.`;
  if (RESERVED_SPEAKERS.includes(name))
    return `\`${name}\` reads as the person or as the task's own agent: name the agent that speaks as itself, such as \`operator\`.`;
  if (!wellSpelt(name))
    return `\`${name}\` is no name an agent speaks under: use lowercase letters, digits, \`.\`, \`_\`, \`-\` and \`/\`, opening with a letter or a digit.`;
  return undefined;
};
