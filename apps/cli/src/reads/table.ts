/**
 * How the client asks a list for its table (`objects`' `Table`, Kubernetes' server-side printing, fc2e): the words that ask it wide,
 * with its labels or with a column per label (`tableAsked`), and the table read back (`tableOf`). The client keeps no printer of a list
 * of its own: the lines are `objects`' `tableLines`, which the api's MCP port prints with too. Pure.
 */
import { TABLE_ACCEPT, type Table, type TableAsked } from 'objects';
import { Refused } from '../refused.ts';

/**
 * The words of `args` that ask how a table prints: `-o wide` (or `--output wide`) and `--show-labels`, and `-L <key>`, given again for
 * another; `-l <selector>`, given again for another, the selectors to send. The words left (`rest`), or null where a flag has no word
 * after it, or `-o` names another output, which the old path refuses in its own words.
 */
export function tableAsked(args: readonly string[]): { rest: string[]; selector: string[]; asked: TableAsked } | null {
  const selector: string[] = [];
  const columns: string[] = [];
  const rest: string[] = [];
  let wide = false;
  let showLabels = false;
  for (let at = 0; at < args.length; at++) {
    const word = args[at] ?? '';
    if (word === '--show-labels') showLabels = true;
    else if (word === '-l' || word === '-L' || word === '-o' || word === '--output') {
      const value = args[++at];
      if (value === undefined) return null;
      if (word === '-l') selector.push(value);
      else if (word === '-L') columns.push(value);
      else if (value === 'wide') wide = true;
      else return null;
    } else rest.push(word);
  }
  return { rest, selector, asked: { wide, showLabels, columns } };
}

/**
 * A list asked for its `Table`, of the read `verb` names: the table, or a refusal where the api answered the list's objects instead, an
 * api older than this client.
 */
export function tableOf<L extends object>(verb: string, listed: L | Table): Table {
  if ('columnDefinitions' in listed) return listed;
  throw new Refused(
    `the daemon answered nemia ${verb} a list where this nemia asked for its table: it is older than this nemia. Restart it, \`nemia service restart\`, then type \`nemia ${verb}\` again`,
  );
}

/** The `Accept` that asks a list for its `Table`. */
export const AS_TABLE = { accept: TABLE_ACCEPT };
