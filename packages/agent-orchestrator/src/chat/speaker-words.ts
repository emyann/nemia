/** The words a speaker is named and framed by: read by `chat.ts`, `speaker-name.ts`, `framed.ts` and their contracts (`contracts/speaker.contract.ts`, `contracts/speaker-name.contract.ts`). */

/** The words the person's own are said to the task in, before the words themselves, as the keeper has always said them. */
export const PERSON_FRAME = 'The person writes from the board: ';

/** The longest name an agent speaks under. */
export const SPEAKER_NAME_MAX = 64;

/** The names no agent speaks under: each would read, to the task or to the person, as the person or as the task's own agent. */
export const RESERVED_SPEAKERS: readonly string[] = ['person', 'the-person', 'you', 'me', 'nemia', 'keeper', 'agent'];

/** The characters a name opens with. */
const NAME_OPENS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** The characters a name takes after its first: lowercase letters, digits, `.`, `_`, `-` and `/`. */
const NAME_TAKES = `${NAME_OPENS}._-/`;

/** Whether `name` opens with a lowercase letter or a digit and holds only the characters `NAME_TAKES` holds. */
export const wellSpelt = (name: string): boolean => {
  if (!NAME_OPENS.includes(name.charAt(0))) return false;
  for (let i = 1; i < name.length; i++) if (!NAME_TAKES.includes(name.charAt(i))) return false;
  return true;
};

