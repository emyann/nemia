/**
 * `nemia get <resource>[/<name>] [<name>] [-n <namespace> | -A] [-l <selector>]... [-o json|yaml|name]`, as `kubectl get` reads it: the
 * word resolved among the resources discovery lists (`resourceFor`), then the kind called through its table (`KIND_CALLS`). A list is in
 * the namespace `-n` names, `default` where none is typed, or across all with `-A`, where the api lists the kind across all; a kind no
 * namespace holds is listed whole. One object by its name is read in the namespace `-n` names, else across all by its store-wide name
 * where the api reads it so (the Run, the Card, the Event), else in `default`.
 *
 * A table prints NAMESPACE (with `-A`), NAME, STATE (`status.phase`, else `status.state`) and AGE; `-o json` and `-o yaml` print the
 * object or the page as the api answered it, which `nemia apply -f` reads back; `-o name` prints `<plural>/<name>`. An empty list says so
 * on stderr and exits 0.
 */
import { type APIResource, DEFAULT_NAMESPACE } from 'objects';
import { stringify } from 'yaml';
import { asked, discovered, resourceFor } from '../objects.ts';
import { Refused } from '../refused.ts';
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

export const GET_HELP = `nemia get <resource>[/<name>] [<name>] [-n <namespace> | -A] [-l <selector>]... [-o json|yaml|name]

Read the objects of a resource the api serves, or one by its name. The resources are those \`nemia explain\` names.

  -n, --namespace <namespace>  the namespace (a factory) to read in; default where none is typed
  -A, --all-namespaces         list across every namespace, where the api lists the kind across all
  -l, --selector <selector>    a label selector (team=core), given again for another, of which one must take an object
  -o, --output <format>        json, yaml (each read back by nemia apply -f) or name; a table where none is typed
`;

const OUTPUTS: readonly Output[] = ['json', 'yaml', 'name'];

/** The word after an option, refused where none follows. */
const valueOf = (args: readonly string[], at: number, option: string): string => {
  const value = args[at + 1];
  if (value === undefined || value.startsWith('-'))
    throw new Refused(`nemia get: ${option} takes a value after it; see \`nemia get --help\``);
  return value;
};

/** The output `-o` names, refused where it names none `get` prints. */
const outputOf = (format: string): Output => {
  const output = OUTPUTS.find((o) => o === format);
  if (output === undefined) throw new Refused(`nemia get: -o takes json, yaml or name; see \`nemia get --help\``);
  return output;
};

/** The options of `args` read into `out`, and the words that are no option's. */
function optionsOf(args: readonly string[], out: GetAsked): string[] {
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
function parsed(args: readonly string[]): GetAsked {
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

/** How long ago `at` was, as `kubectl get`'s AGE says it: `<n>s`, `<n>m`, `<n>h` or `<n>d`. */
export const ageOf = (at: string, now: number = Date.now()): string => {
  const ms = now - Date.parse(at);
  if (!Number.isFinite(ms)) return '<unknown>';
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 120) return `${s}s`;
  if (s < 120 * 60) return `${Math.floor(s / 60)}m`;
  if (s < 48 * 3600) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

/** An object's state as its status says it: its `phase`, else its `state`. */
const stateOf = (object: Served): string => {
  const status = object.status;
  if (typeof status !== 'object' || status === null) return '<none>';
  const said = 'phase' in status ? status.phase : 'state' in status ? status.state : undefined;
  return typeof said === 'string' ? said : '<none>';
};

/** The table of `objects`: NAMESPACE with `all`, NAME, STATE and AGE, each column as wide as its widest cell. */
export function tableOf(objects: readonly Served[], all: boolean, now: number = Date.now()): string[] {
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
const printed = (answer: unknown, output: 'json' | 'yaml'): string =>
  output === 'json' ? `${JSON.stringify(answer, null, 2)}\n` : stringify(answer);

/** One object of `resource` by its name, printed as `typed` asks. */
async function getOne(resource: APIResource, typed: GetAsked, name: string): Promise<number> {
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
const noneFound = (resource: APIResource, typed: GetAsked): string => {
  const where = !resource.namespaced ? '' : typed.all ? ' in any namespace' : ` in namespace ${typed.namespace ?? DEFAULT_NAMESPACE}`;
  const matching = typed.selector.length ? ` matching -l ${typed.selector.join(' -l ')}` : '';
  return `No ${resource.name} found${where}${matching}.`;
};

/** The objects of `resource`, in a namespace or across all, printed as `typed` asks. */
async function getList(resource: APIResource, typed: GetAsked): Promise<number> {
  const calls = KIND_CALLS[resource.kind];
  const call =
    !resource.namespaced || typed.all
      ? calls.list.all?.(typed.selector)
      : calls.list.in?.(typed.namespace ?? DEFAULT_NAMESPACE, typed.selector);
  if (call === undefined)
    throw new Refused(
      `nemia get: the api lists ${resource.name} in one namespace at a time: \`nemia get ${resource.name} -n <namespace>\``,
    );
  const page = await asked('get', call);
  if (typed.output === 'json' || typed.output === 'yaml') process.stdout.write(printed(page, typed.output));
  else if (page.items.length === 0) process.stderr.write(`${noneFound(resource, typed)}\n`);
  else if (typed.output === 'name') for (const o of page.items) process.stdout.write(`${resource.name}/${o.metadata.name}\n`);
  else for (const line of tableOf(page.items, typed.all && resource.namespaced)) process.stdout.write(`${line}\n`);
  return 0;
}

export async function get(args: readonly string[]): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(GET_HELP);
    return 0;
  }
  const typed = parsed(args);
  const resource = resourceFor('get', await discovered('get'), typed.word);
  return typed.name === undefined ? getList(resource, typed) : getOne(resource, typed, typed.name);
}
