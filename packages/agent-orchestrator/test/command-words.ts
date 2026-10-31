/**
 * The words no command's name or flag may carry, as the language says a command, and the names that still carry one: decision 7 leaves
 * accept, round, merge and nudge to approve, retry --round, refresh --base and retry --continue, and decision 8 gives a list, a read of one
 * thing and a removal one spelling each (`RENAMED`).
 */
export const REFUSED_WORDS: readonly string[] = [
  'remove',
  'drop',
  'list',
  'read',
  'card',
  'describe',
  'decide',
  'plan',
  'accept',
  'round',
  'merge',
  'nudge',
];

/**
 * The names that carry a refused word today, each with the decision that renames it (decision 8: one spelling to list, to read one thing,
 * and to remove). The list only shrinks: a name leaves it as its decision renames it, and none joins it.
 */
export const PENDING: readonly { readonly name: string; readonly decision: 8 }[] = [
  { name: 'decide', decision: 8 },
  { name: 'agents card', decision: 8 },
  { name: 'agents read', decision: 8 },
];

/** The flags no command may take, each renamed by decision 7 and still read as its former spelling (`RENAMED_FLAGS`). */
export const REFUSED_FLAGS: readonly string[] = ['--nudge'];

/** The commands that answer what waits on a person (decision 7): no other entry is classed `answer`. */
export const ANSWERS: readonly string[] = ['approve', 'retry'];
