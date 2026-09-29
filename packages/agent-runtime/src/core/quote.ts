/**
 * How a sentence quotes what it did not write — a value found in a journal or on a card, another party's address, header or words:
 * a bounded piece of it, so that a refusal stays readable, and a journal or a log stays small, whatever the other side sent.
 */

/** How much of a value a sentence quotes: a JSON value, a scheme's name or kind, where a card puts a key. */
export const VALUE_QUOTE = 60;

/** How much of an address, a list of addresses, a status text or another party's error words a sentence quotes. */
export const WORDS_QUOTE = 200;

/** `text` cut to its first `max` characters, `VALUE_QUOTE` by default, and marked `…` where it was cut; whole when it fits. */
export const quote = (text: string, max = VALUE_QUOTE): string => (text.length > max ? `${text.slice(0, max)}…` : text);

/**
 * The first `max` of `items` (3 by default), each whole, joined by `separator`, then how many more there are: `, and 1,997 more`.
 * A list of `max` or fewer comes back joined whole.
 */
export const firstOf = (items: readonly string[], separator: string, max = 3): string =>
  items.length > max
    ? `${items.slice(0, max).join(separator)}, and ${(items.length - max).toLocaleString('en-US')} more`
    : items.join(separator);
