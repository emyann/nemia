/** The words no command's name may carry, as the language says a command, and the names that still carry one. */
export const REFUSED_WORDS: readonly string[] = ['remove', 'drop', 'list', 'read', 'card', 'describe', 'decide', 'plan'];

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
  { name: 'auto drop', decision: 8 },
];
