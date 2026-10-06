/**
 * A task's labels, a Pod's `metadata.labels`: names to texts the layer above files a task with, which its sessions' telemetry says
 * beside the task's id (`TASK_LABEL`), and what the runtime refuses of them (`labelsRefusalOf`).
 */

/** A label's key: a lowercase word of letters, digits and `_`, so it never reads as another attribute's dotted name. */
const LABEL_KEY = /^[a-z][a-z0-9_]*$/;

/** The most labels a task takes. */
const MOST_LABELS = 16;

/** The longest label value, in characters. */
const LONGEST_LABEL = 256;

/** The key the runtime says itself on a session's resource: the task's id. */
export const TASK_LABEL = 'task';

/** Why a label's value cannot be carried, or `undefined`: anything but a text of 1 to 256 characters with no control character. */
const labelValueRefusalOf = (key: string, value: unknown): string | undefined => {
  if (typeof value === 'string' && value.length > 0 && value.length <= LONGEST_LABEL && ![...value].some((c) => c < ' ' || c === '\u007f'))
    return undefined;
  return `the label \`${key}\` is ${JSON.stringify(value)}, which is no label's value. Give a text of 1 to ${LONGEST_LABEL} characters with no control character.`;
};

/**
 * Why a task's `labels` cannot be carried, or `undefined`. Refuses anything but an object of at most 16 entries, each keyed by a
 * lowercase word (`LABEL_KEY`) other than `task`, which the runtime says itself, with a value `labelValueRefusalOf` takes.
 */
export const labelsRefusalOf = (labels: unknown): string | undefined => {
  if (labels === undefined) return undefined;
  if (typeof labels !== 'object' || labels === null || Array.isArray(labels)) {
    return `\`labels: ${JSON.stringify(labels)}\` is not a set of labels. Give an object of names to texts, like { "team": "a" }, or leave it out.`;
  }
  const entries = Object.entries(labels);
  if (entries.length > MOST_LABELS) return `\`labels\` has ${entries.length} entries: give at most ${MOST_LABELS}.`;
  for (const [key, value] of entries) {
    if (key === TASK_LABEL)
      return `the label \`${TASK_LABEL}\` is the runtime's own, the task's id on its session: give the label another name.`;
    if (!LABEL_KEY.test(key)) {
      return `the label \`${key}\` is no label's name. Give a lowercase word of letters, digits and \`_\`, starting with a letter.`;
    }
    const refused = labelValueRefusalOf(key, value);
    if (refused) return refused;
  }
  return undefined;
};
