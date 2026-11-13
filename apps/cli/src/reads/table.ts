/**
 * How the client asks a list for its table (`objects`' `Table`, Kubernetes' server-side printing, fc2e): the parsed words that ask it
 * wide, with its labels or with a column per label (`tableAsked`), and the table read back (`tableOf`). The client keeps no printer
 * of a list of its own: the lines are `objects`' `tableLines`, which the api's MCP port prints with too. Pure.
 */
import { type Args, TABLE_ACCEPT, type Table, type TableAsked } from 'objects';
import { listArg, switchArg, textArg } from '../commands/requests.ts';
import { Refused } from '../refused.ts';

/**
 * How the words of a list's command, parsed (`args`), ask its table to print: `-o wide` every column, `--show-labels` the labels, and
 * `-L <key>`, given again for another, a column of that label; and the label queries `-l` gave, given again for another, to send as the
 * list's `labelSelector`. A refusal of another output is the command's own `check`, run before.
 */
export function tableAsked(args: Args): { selector: readonly string[]; asked: TableAsked } {
  return {
    selector: listArg(args, 'selector'),
    asked: { wide: textArg(args, 'output') === 'wide', showLabels: switchArg(args, 'showLabels'), columns: listArg(args, 'labelColumns') },
  };
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
