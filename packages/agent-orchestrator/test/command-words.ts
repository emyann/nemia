/**
 * The words no command's name or flag may carry, as the language says a command, and the names that still carry one: decision 7 leaves
 * accept, round, merge and nudge to approve, retry --round, refresh --base and retry --continue.
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
  { name: 'plan', decision: 8 },
  { name: 'factory plan', decision: 8 },
  { name: 'inbox card', decision: 8 },
  { name: 'decide', decision: 8 },
  { name: 'agents card', decision: 8 },
  { name: 'agents read', decision: 8 },
  { name: 'agents remove', decision: 8 },
  { name: 'skills list', decision: 8 },
  { name: 'skills read', decision: 8 },
  { name: 'workflows list', decision: 8 },
  { name: 'workflows remove', decision: 8 },
  { name: 'policy drop', decision: 8 },
];

/** The flags no command may take, each renamed by decision 7 and still read as its former spelling (`RENAMED_FLAGS`). */
export const REFUSED_FLAGS: readonly string[] = ['--nudge'];

/** The classes an entry of the table is in: who answers for it when an agent calls it. */
export const CLASSES: readonly string[] = ['read', 'act', 'ask', 'answer', 'none'];

/** The commands that answer what waits on a person (decision 7): no other entry is classed `answer`. */
export const ANSWERS: readonly string[] = ['approve', 'retry'];
