/** An agent's name as a person's. Pure. */

/**
 * An agent's name as a person's: its file's name, first letter up and dashes as spaces — `reviewer` is Reviewer, `note-writer` Note
 * writer.
 *
 * @param name the agent's file name, its words joined by dashes
 */
export const personOf = (name: string) => {
  const spaced = name.replaceAll('-', ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};
