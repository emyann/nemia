import { useState } from 'react';

/** What a whole list's address keeps of its filter: the text a person typed, `?q=`, absent where none is. */
type FilterSearch = { q?: string };

/**
 * The filter an address keeps, `?q=`: its text where it is a string of any length but none, else none.
 * @param search The address's search, as the router read it.
 */
export const filterOf = (search: Record<string, unknown>): FilterSearch =>
  typeof search.q === 'string' && search.q !== '' ? { q: search.q } : {};

/**
 * Whether a thing listed under `name`, said by `description`, is one the filter `query` keeps: every thing for a query of only spaces,
 * else one whose name or description holds the query, trimmed, in any case.
 * @param query What the person typed.
 * @param name The thing's name.
 * @param description Its one-line description, `null` or absent where it has none.
 */
export function matches(query: string, name: string, description?: string | null): boolean {
  const wanted = query.trim().toLocaleLowerCase();
  if (wanted === '') return true;
  return name.toLocaleLowerCase().includes(wanted) || (description ?? '').toLocaleLowerCase().includes(wanted);
}

/**
 * The filter's text as the field holds it, ahead of the address: each keystroke is the field's at once and sent to the address, which
 * the router answers a moment later. An address that comes back with a text this field sent is the field's own echo, never taken over
 * what it has typed since; one that brings another (a link without `?q=`, the browser's back) is taken.
 * @param query The filter the address keeps.
 * @param onQuery Writes a filter to the address.
 */
export function useFilterText(query: string, onQuery: (query: string) => void): readonly [string, (text: string) => void] {
  const [text, setText] = useState(query);
  const [sent, setSent] = useState<readonly string[]>([]);
  const [seen, setSeen] = useState(query);
  if (query !== seen) {
    setSeen(query);
    if (query === sent.at(-1)) setSent([]);
    else if (!sent.includes(query)) {
      setText(query);
      setSent([]);
    }
  }
  const type = (next: string) => {
    setText(next);
    setSent((before) => [...before, next]);
    onQuery(next);
  };
  return [text, type];
}
