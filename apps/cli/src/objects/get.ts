/**
 * `nemia get <resource>[/<name>] [<name>] [-n <namespace> | -A] [-l <selector>]... [-o json|yaml|name]`, as `kubectl get` reads it: the
 * word resolved among the resources discovery lists (`resourceFor`), then the kind called through its table (`KIND_CALLS`). A list is in
 * the namespace `-n` names, `default` where none is typed, or across all with `-A`, where the api lists the kind across all; a kind no
 * namespace holds is listed whole. One object by its name is read in the namespace `-n` names, else across all by its store-wide name
 * where the api reads it so (the Run, the Card, the Event), else in `default`.
 *
 * A list prints the table the api prints of its kind (`objects`' `Table`, asked by `AS_TABLE`), by `tableLines`: the client keeps no
 * printer of a list of its own. One object prints NAMESPACE (with `-A`), NAME, STATE (`status.phase`, else `status.state`) and AGE.
 * `-o json` and `-o yaml` print the object or the page as the api answered it — a page's items without their files' content, which a
 * list never carries, so `nemia apply -f` refuses a page's objects and reads back one object's — and `-o name` prints
 * `<plural>/<name>`. An empty list says so on stderr and exits 0.
 */
import { type APIResource, DEFAULT_NAMESPACE, READ_BOUND_MS, type Table, tableLines } from 'objects';
import { stringify } from 'yaml';
import { isObject } from 'effect/Predicate';
import { asked, discovered, resourceFor } from '../objects.ts';
import { Refused } from '../refused.ts';
import { AS_TABLE, tableOf as askedTable } from '../reads/table.ts';
import { KIND_CALLS, type Served } from './kinds.ts';

/** How `get` prints what it read. */
type Output = 'table' | 'json' | 'yaml' | 'name';

/** What `get` was asked. */
type GetAsked = {
  word: string;
  name: string | undefined;
  namespace: string | undefined;
  all: boolean;
  selector: string[];
  output: Output;
};

const GET_HELP = `nemia get <resource>[/<name>] [<name>] [-n <namespace> | -A] [-l <selector>]... [-o json|yaml|name]

Read the objects of a resource the api serves, or one by its name. The resources are those \`nemia explain\` names.

  -n, --namespace <namespace>  the namespace (a factory) to read in; default where none is typed
  -A, --all-namespaces         list across every namespace, where the api lists the kind across all
  -l, --selector <selector>    a label selector (team=core), given again for another, of which one must take an object
  -o, --output <format>        json, yaml (each read back by nemia apply -f) or name; a table where none is typed
`;

const OUTPUTS: readonly Output[] = ['json', 'yaml', 'name'];

/** The word after an option, refused where none follows. */
const valueOf = (args: readonly string[], at: number, option: string) => {
  const value = args[at + 1];
  if (value === undefined || value.startsWith('-'))
    throw new Refused(`nemia get: ${option} takes a value after it; see \`nemia get --help\``);
  return value;
};

/** The output `-o` names, refused where it names none `get` prints. */
const outputOf = (format: string) => {
  const output = OUTPUTS.find((o) => o === format);
  if (output === undefined) throw new Refused(`nemia get: -o takes json, yaml or name; see \`nemia get --help\``);
  return output;
};

/** The options of `args` read into `out`, and the words that are no option's. */
function optionsOf(args: readonly string[], out: GetAsked) {
  const words: string[] = [];
  for (let at = 0; at < args.length; at++) {
    const arg = args[at] ?? '';
    if (arg === '-A' || arg === '--all-namespaces') out.all = true;
    else if (!arg.startsWith('-')) words.push(arg);
    else {
      const value = valueOf(args, at++, arg);
      if (arg === '-n' || arg === '--namespace') out.namespace = value;
      else if (arg === '-l' || arg === '--selector') out.selector.push(value);
      else if (arg === '-o' || arg === '--output') out.output = outputOf(value);
      else throw new Refused(`nemia get: ${arg} is no option of get; see \`nemia get --help\``);
    }
  }
  return words;
}

/** What `args` ask of `get`. */
function parsed(args: readonly string[]) {
  const out: GetAsked = { word: '', name: undefined, namespace: undefined, all: false, selector: [], output: 'table' };
  const [first, second, ...more] = optionsOf(args, out);
  if (first === undefined) throw new Refused('nemia get: name a resource, `nemia get <resource>`; the resources are in `nemia explain`');
  const [word = '', slashed, ...deeper] = first.split('/');
  if (more.length || deeper.length || (slashed !== undefined && second !== undefined))
    throw new Refused('nemia get: one resource and one name at most, `nemia get <resource> <name>`');
  if (out.all && out.namespace !== undefined)
    throw new Refused('nemia get: -A reads every namespace and -n one: type one of them, `nemia get <resource> -A`');
  return { ...out, word, name: slashed ?? second };
}

/**
 * How long ago `at` was, as `kubectl get`'s AGE says it: `<n>s`, `<n>m`, `<n>h` or `<n>d`.
 * @param at The moment, an ISO date; one that does not parse is `<unknown>`.
 * @param now The moment the age is counted to, in ms since the epoch: now where it is left out.
 */
const ageOf = (at: string, now: number = Date.now()) => {
  const ms = now - Date.parse(at);
  if (!Number.isFinite(ms)) return '<unknown>';
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 120) return `${s}s`;
  if (s < 120 * 60) return `${Math.floor(s / 60)}m`;
  if (s < 48 * 3600) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

/** An object's state as its status says it: its `phase`, else its `state`. */
const stateOf = (object: Served) => {
  const status = object.status;
  if (typeof status !== 'object' || status === null) return '<none>';
  const said = 'phase' in status ? status.phase : 'state' in status ? status.state : undefined;
  return typeof said === 'string' ? said : '<none>';
};

/**
 * The table of `objects`: NAMESPACE with `all`, NAME, STATE and AGE, each column as wide as its widest cell.
 * @param objects The objects listed, one row each.
 * @param all Whether the list is across every namespace, which puts NAMESPACE first.
 * @param now The moment each AGE is counted to, in ms since the epoch: now where it is left out.
 */
function tableOf(objects: readonly Served[], all: boolean, now: number = Date.now()) {
  const rows = [
    [...(all ? ['NAMESPACE'] : []), 'NAME', 'STATE', 'AGE'],
    ...objects.map((o) => [
      ...(all ? [o.metadata.namespace ?? ''] : []),
      o.metadata.name,
      stateOf(o),
      ageOf(o.metadata.creationTimestamp, now),
    ]),
  ];
  const widths = rows[0]?.map((_, col) => Math.max(...rows.map((row) => (row[col] ?? '').length))) ?? [];
  return rows.map((row) =>
    row
      .map((cell, col) => (col === row.length - 1 ? cell : cell.padEnd((widths[col] ?? 0) + 3)))
      .join('')
      .trimEnd(),
  );
}

/** What `get` prints of `answer`, a page or one object, in `output`. */
const printed = (answer: unknown, output: 'json' | 'yaml') =>
  output === 'json' ? `${JSON.stringify(answer, null, 2)}\n` : stringify(answer);

/** One object of `resource` by its name, printed as `typed` asks. */
async function getOne(resource: APIResource, typed: GetAsked, name: string) {
  const calls = KIND_CALLS[resource.kind];
  const call =
    !resource.namespaced || (typed.namespace === undefined && calls.get.all !== undefined)
      ? calls.get.all?.(name)
      : calls.get.in?.(typed.namespace ?? DEFAULT_NAMESPACE, name);
  if (call === undefined)
    throw new Refused(`nemia get: ${resource.name} are read in a namespace: \`nemia get ${resource.name} ${name} -n <namespace>\``);
  const object = await asked('get', call);
  if (typed.output === 'json' || typed.output === 'yaml') process.stdout.write(printed(object, typed.output));
  else if (typed.output === 'name') process.stdout.write(`${resource.name}/${object.metadata.name}\n`);
  else for (const line of tableOf([object], false)) process.stdout.write(`${line}\n`);
  return 0;
}

/** Why a list is empty, as stderr says it: the resource, where it was listed, and the selectors. */
const noneFound = (resource: APIResource, typed: GetAsked) => {
  const where = !resource.namespaced ? '' : typed.all ? ' in any namespace' : ` in namespace ${typed.namespace ?? DEFAULT_NAMESPACE}`;
  const matching = typed.selector.length ? ` matching -l ${typed.selector.join(' -l ')}` : '';
  return `No ${resource.name} found${where}${matching}.`;
};

/** The objects of `resource`, in a namespace or across all, printed as `typed` asks. */
async function getList(resource: APIResource, typed: GetAsked) {
  const calls = KIND_CALLS[resource.kind];
  const call =
    !resource.namespaced || typed.all
      ? calls.list.all?.(typed.selector)
      : calls.list.in?.(typed.namespace ?? DEFAULT_NAMESPACE, typed.selector);
  if (call === undefined)
    throw new Refused(
      `nemia get: the api lists ${resource.name} in one namespace at a time: \`nemia get ${resource.name} -n <namespace>\``,
    );
  if (typed.output === 'table') {
    const answered = askedTable('get', await asked('get', call, process.env, READ_BOUND_MS, AS_TABLE));
    const table = typed.all && resource.namespaced ? withNamespace(answered) : answered;
    const lines = tableLines(table, { wide: false, showLabels: false, columns: [] });
    if (lines.length === 0) process.stderr.write(`${noneFound(resource, typed)}\n`);
    for (const line of lines) process.stdout.write(`${line}\n`);
    return 0;
  }
  const page = pageAnswered(await asked('get', call));
  if (typed.output === 'json' || typed.output === 'yaml') process.stdout.write(printed(page, typed.output));
  else if (page.items.length === 0) process.stderr.write(`${noneFound(resource, typed)}\n`);
  else for (const o of page.items) process.stdout.write(`${resource.name}/${o.metadata.name}\n`);
  return 0;
}

/** The namespace a table's row's object says it is in (`metadata.namespace`), `''` where it says none. */
const namespaceOf = (object: unknown) => {
  const metadata = isObject(object) ? object.metadata : undefined;
  return isObject(metadata) && typeof metadata.namespace === 'string' ? metadata.namespace : '';
};

/** `table` with a NAMESPACE column first, each row's read off its object, as `kubectl get -A` prints one. */
const withNamespace = (table: Table) =>
  ({
    ...table,
    columnDefinitions: [
      { name: 'Namespace', type: 'string', format: '', description: 'The namespace the object is in.', priority: 0 },
      ...table.columnDefinitions,
    ],
    rows: table.rows.map((row) => ({ ...row, cells: [namespaceOf(row.object), ...row.cells] })),
  }) satisfies Table;

/** A list's answer as its page, refused where the api answered a `Table` to a list asked for its objects. */
const pageAnswered = <P extends { readonly items: readonly Served[] }>(answer: P | Table) => {
  if ('items' in answer) return answer;
  throw new Refused('nemia get: the api answered a Table to a list asked for its objects: restart it, `nemia service restart`');
};

/**
 * `nemia get <resource> [<name>]`, on the words after `get`: the object, or the list, printed as asked; answers the exit code,
 * or throws its refusal.
 * @param args The words typed after `get`: the resource, a name, and the options `--help` lists.
 */
export async function get(args: readonly string[]) {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(GET_HELP);
    return 0;
  }
  const typed = parsed(args);
  const resource = resourceFor('get', await discovered('get'), typed.word);
  return typed.name === undefined ? getList(resource, typed) : getOne(resource, typed, typed.name);
}
