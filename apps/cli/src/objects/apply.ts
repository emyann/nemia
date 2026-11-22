/**
 * `nemia apply -f <file|->`, as `kubectl apply` reads a file: YAML or JSON, one object, a stream of documents, or a `List` (what `nemia
 * get -o yaml` prints of a page). Each object is read first where it is served, its kind's resource resolved among those discovery lists;
 * `applyOf` (`contracts/apply.contract.ts`) then says what to do with it by whether it was found, whether its spec and, where the kind's
 * write carries them, its labels are those served, and what the kind takes over the api (`KIND_CALLS`). Each prints
 * `<plural>/<name> created|configured|unchanged`.
 *
 * Refused, exit 2, each naming the command to type next: an object copied from a list, which lacks its files' content (`partial`: `nemia
 * get <resource> <name> -o yaml` prints it whole); an object of a kind that is made no other way than its own (the Card's `nemia
 * inbox add`, the Proposal's `nemia propose`) or takes no create, missing; one of a kind that takes no write, changed (`nemia explain`
 * says the kind's verbs, and the Proposal's refusal names `nemia propose`); an `apiVersion` other than `nemia/v1`; a kind the api does
 * not serve; a namespace in the file other than `-n`'s; a spec that is not the kind's. A refusal of one object does not stop the next:
 * the command exits 2 once every object was tried.
 */
import fs from 'node:fs';
import { parseAllDocuments } from 'yaml';
import { API_VERSION, type APIResource, DEFAULT_NAMESPACE, filesHeld, filesLeftOut, LISTED_WITHOUT } from 'objects';
import type { ApplyOf } from '../../contracts/apply.contract.ts';
import { asked, discovered } from '../objects.ts';
import { Refused } from '../refused.ts';
import { KIND_CALLS, orNone, type Prepared, type Served } from './kinds.ts';
import { isObject } from 'effect/Predicate';

/**
 * What apply does with one object, by what its read found, what its kind takes, and whether the file holds it whole
 * (`contracts/apply.contract.ts`).
 * @param found What the object's read found: whether it is served and, where it is, whether the file says what is served.
 * @param writes What the object's kind takes over the api: a create, an update, and whether its update makes one missing.
 * @param whole Whether the file holds the object whole, its files' content in its spec: false for one copied from a list.
 */
export const applyOf: ApplyOf = (found, writes, whole) => {
  if (!whole) return 'partial';
  if (!found.exists) return writes.create ? 'create' : writes.upsert && writes.update ? 'update' : 'no-create';
  if (found.same) return 'unchanged';
  return writes.update ? 'update' : 'no-update';
};

export const APPLY_HELP = `nemia apply -f <file|-> [-n <namespace>]

Write the objects a file holds, each as the api serves its kind: made where it is missing, written where the file changes it, left
alone where it does not. The file is YAML or JSON: one object, a stream of documents, or a List (nemia get -o yaml prints one).
Each prints <plural>/<name> created, configured or unchanged.

  -f, --filename <file|->      the file to read, - for stdin
  -n, --namespace <namespace>  the namespace (a factory) of an object whose file names none; default where neither does
`;

/**
 * A value as JSON with its keys in order and a key that holds null left out, so two objects that say the same compare equal: a file
 * that leaves out a key the api serves as null (a workflow's `readme`) says what it says.
 * @param value The value to write as JSON.
 */
export const canonical = (value: unknown) =>
  JSON.stringify(value, (_key, v: unknown) =>
    typeof v === 'object' && v !== null && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v)
            .filter(([, inner]) => inner !== null)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : v,
  );

/** A record of strings, or undefined where `value` is none. */
const stringsOf = (value: unknown) =>
  isObject(value) && Object.values(value).every((v) => typeof v === 'string')
    ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, String(v)]))
    : undefined;

/**
 * The objects of `text`, each document's, a `List`'s items in its place; refused where a document does not parse, naming the verb that
 * read it (`apply`, `propose`).
 * @param text The file's text: YAML or JSON, one document or several.
 * @param file The file's name as typed, named in the refusal.
 * @param verb The verb that read it, named in the refusal: `apply` where it is left out.
 */
export function objectsOf(text: string, file: string, verb = 'apply') {
  const objects: unknown[] = [];
  for (const doc of parseAllDocuments(text)) {
    if (!('errors' in doc)) continue;
    const [error] = doc.errors;
    if (error !== undefined)
      throw new Refused(
        `nemia ${verb}: ${file} is not YAML or JSON (${error.message}): fix it, and type \`nemia ${verb} -f ${file}\` again`,
      );
    const value: unknown = doc.toJS();
    if (value === null || value === undefined) continue;
    if (isObject(value) && typeof value.kind === 'string' && value.kind.endsWith('List') && Array.isArray(value.items))
      objects.push(...value.items);
    else objects.push(value);
  }
  return objects;
}

/** What `args` ask of apply: the file, and the namespace `-n` names. */
function parsed(args: readonly string[]) {
  let file: string | undefined;
  let namespace: string | undefined;
  for (let at = 0; at < args.length; at++) {
    const arg = args[at] ?? '';
    const value = args[at + 1];
    if (arg === '-f' || arg === '--filename' || arg === '-n' || arg === '--namespace') {
      if (value === undefined) throw new Refused(`nemia apply: ${arg} takes a value after it; see \`nemia apply --help\``);
      if (arg === '-f' || arg === '--filename') file = value;
      else namespace = value;
      at++;
    } else throw new Refused(`nemia apply: ${arg} is no option of apply; see \`nemia apply --help\``);
  }
  if (file === undefined) throw new Refused('nemia apply: name the file to write, `nemia apply -f <file>`, or `-f -` for stdin');
  return { file, namespace };
}

/** What happened to one object, as apply prints it. */
type Said = 'created' | 'configured' | 'unchanged';

/** The kinds' own resources of `resources`, by their kinds: what a refusal names. */
const kindsOf = (resources: readonly APIResource[]) =>
  resources
    .filter((r) => !r.name.includes('/'))
    .map((r) => r.kind)
    .join(', ');

/** An object of the file, read: its resource, its name, its metadata, its spec, and the namespace it or `-n` names. */
export type Read = {
  resource: APIResource;
  name: string;
  meta: Record<string, unknown>;
  spec: unknown;
  where: string | undefined;
};

/**
 * `object` read against `resources` and `-n`'s `namespace`; refused, naming what to type, where it is not one the verb (`apply`,
 * `propose`) writes.
 * @param object One object of the file, as parsed.
 * @param resources The resources discovery lists, its kind's resolved among them.
 * @param namespace The namespace `-n` names, undefined where it names none.
 * @param verb The verb that reads it, named in a refusal: `apply` where it is left out.
 */
export function readOf(object: unknown, resources: readonly APIResource[], namespace: string | undefined, verb = 'apply') {
  if (!isObject(object)) throw new Refused(`nemia ${verb}: a document is no object: each holds apiVersion, kind, metadata and spec`);
  const { apiVersion, kind, metadata, spec } = object;
  if (apiVersion !== API_VERSION)
    throw new Refused(
      `nemia ${verb}: apiVersion ${String(apiVersion)} is not served: set \`apiVersion: ${API_VERSION}\`, the one version \`nemia explain <resource>\` says`,
    );
  const resource = resources.find((r) => r.kind === kind && !r.name.includes('/'));
  if (resource === undefined)
    throw new Refused(
      `nemia ${verb}: the api serves no kind ${String(kind)}. It serves ${kindsOf(resources)}: see one with \`nemia explain <resource>\``,
    );
  const meta = isObject(metadata) ? metadata : {};
  const name = meta.name;
  if (typeof name !== 'string' || name === '')
    throw new Refused(
      `nemia ${verb}: a ${resource.kind} names itself by metadata.name: set it; see \`nemia explain ${resource.singularName}.metadata\``,
    );
  const filed = typeof meta.namespace === 'string' ? meta.namespace : undefined;
  if (resource.namespaced && filed !== undefined && namespace !== undefined && filed !== namespace)
    throw new Refused(
      `nemia ${verb}: ${resource.name}/${name} is in namespace ${filed} in the file, and -n says ${namespace}: drop -n, or type \`nemia ${verb} -f <file> -n ${filed}\``,
    );
  return { resource, name, meta, spec, where: filed ?? namespace };
}

/**
 * The object `read` names as it is served, or null where none is: in its namespace, else across all where the kind is read so.
 * @param verb The verb that asks, named in a refusal: `apply` where it is left out.
 */
export async function servedOf({ resource, name, where }: Read, verb = 'apply') {
  const calls = KIND_CALLS[resource.kind];
  const call =
    !resource.namespaced || (where === undefined && calls.get.all !== undefined)
      ? calls.get.all?.(name)
      : calls.get.in?.(where ?? DEFAULT_NAMESPACE, name);
  if (call === undefined) throw new Refused(`nemia ${verb}: ${resource.name} are not read by name; see \`nemia explain ${resource.name}\``);
  return asked(verb, orNone(call));
}

/**
 * Why apply does not write `read`, as `action` says, naming the command that does (`madeBy`: the Card's `nemia inbox add`, the
 * Proposal's `nemia propose`) or that says the kind's verbs.
 */
function refusal({ resource, name }: Read, action: 'no-create' | 'no-update', madeBy: string | undefined) {
  if (action === 'no-update')
    return new Refused(
      madeBy !== undefined
        ? `nemia apply: ${resource.name}/${name} differs from what is served, and a ${resource.kind} is not written by apply: make another with \`${madeBy}\``
        : `nemia apply: ${resource.name}/${name} differs from what is served, and the api writes no ${resource.kind}: see what it takes, \`nemia explain ${resource.name}\``,
    );
  return new Refused(
    madeBy !== undefined
      ? `nemia apply: ${resource.name}/${name} is not served, and a ${resource.kind} is not made by apply: make it with \`${madeBy}\`, then apply its file`
      : `nemia apply: ${resource.name}/${name} is not served, and the api makes no ${resource.kind}: see what it takes, \`nemia explain ${resource.name}\``,
  );
}

/** The paths of `read`'s kind's spec that hold a file's content (`LISTED_WITHOUT`). */
const filePathsOf = ({ resource }: Read) => LISTED_WITHOUT[resource.kind].filter((path) => path.startsWith('spec.'));

/** The paths of a file's content `read`'s spec could hold and lacks: those a list left out. */
const leftOutOf = (read: Read) => filesLeftOut(filePathsOf(read), { spec: read.spec });

/**
 * Whether the file holds `read` whole: it lacks none of its files' content, or holds some of it, as a file written by hand does that
 * leaves out a key it need not give (a workflow's `readme`); an object a list served holds none of it.
 */
const wholeOf = (read: Read) => leftOutOf(read).length === 0 || filesHeld(filePathsOf(read), { spec: read.spec }).length > 0;

/** Why apply does not write `read`, an object copied from a list: its files' content is not in it, and the read of one holds it. */
const partial = (read: Read) =>
  new Refused(
    `nemia apply: ${read.resource.name}/${read.name} lacks ${leftOutOf(read).join(', ')}, which a list leaves out: read it whole with \`nemia get ${read.resource.name} ${read.name} -o yaml\`, then apply that`,
  );

/** Whether what the file says of `read` is what `served` holds: its spec, and its labels where the kind's write carries them. */
const sameAs = (read: Read, spec: unknown, served: Served, labels: boolean) => {
  const said = stringsOf(read.meta.labels);
  return (
    canonical(spec) === canonical(served.spec) &&
    (!labels || said === undefined || canonical(said) === canonical(served.metadata.labels ?? {}))
  );
};

/**
 * What a write of `read` names: its name, the namespace it is served in (else the one it or `-n` names, else `default`), its labels, and
 * the version the file says it was read at, else the one just read: with none in the file, the last writer wins, as `kubectl apply`'s.
 */
const appliedAt = ({ name, meta, where }: Read, served: Served | null) => ({
  name,
  namespace: served?.metadata.namespace ?? where ?? DEFAULT_NAMESPACE,
  labels: stringsOf(meta.labels),
  resourceVersion: typeof meta.resourceVersion === 'string' ? meta.resourceVersion : served?.metadata.resourceVersion,
});

/** `object` applied, among `resources`, with `-n`'s `namespace`: what happened to it, or a `Refused` naming what to type. */
async function applied(object: unknown, resources: readonly APIResource[], namespace: string | undefined) {
  const read = readOf(object, resources, namespace);
  const { resource, name } = read;
  const served = await servedOf(read);
  const whole = wholeOf(read);
  if (!whole) throw partial(read);
  const writes = KIND_CALLS[resource.kind].writes;
  const prepared: Prepared | string = writes === undefined ? { spec: read.spec } : writes.prepared(read.spec, served);
  if (typeof prepared === 'string')
    throw new Refused(
      `nemia apply: the spec of ${resource.name}/${name} is not a ${resource.kind}'s (${prepared}): see its fields, \`nemia explain ${resource.singularName}.spec\``,
    );
  const { create, update } = prepared;
  const action = applyOf(
    served === null ? { exists: false } : { exists: true, same: sameAs(read, prepared.spec, served, writes?.labels === true) },
    { create: create !== undefined, update: update !== undefined, upsert: writes?.upsert === true },
    whole,
  );
  const at = appliedAt(read, served);
  const said = (word: Said) => `${resource.name}/${name} ${word}`;
  if (action === 'no-create' || action === 'no-update') throw refusal(read, action, writes?.madeBy);
  if (action === 'create' && create !== undefined) await asked('apply', create(at));
  if (action === 'update' && update !== undefined) await asked('apply', update(at));
  return said(action === 'unchanged' ? 'unchanged' : action === 'update' && served !== null ? 'configured' : 'created');
}

/**
 * The text of `file`, stdin's for `-`; refused, naming the file and the verb that read it, where it does not read.
 * @param file The file's name as typed, `-` for stdin.
 * @param verb The verb that reads it, named in the refusal: `apply` where it is left out.
 */
export function textOf(file: string, verb = 'apply') {
  try {
    return fs.readFileSync(file === '-' ? 0 : file, 'utf8');
  } catch (err) {
    throw new Refused(
      `nemia ${verb}: ${file} does not read (${err instanceof Error ? err.message : String(err)}): name a file that is there, \`nemia ${verb} -f <file>\``,
    );
  }
}

/**
 * `nemia apply -f <file|->`, on the words after `apply`: each object of the file applied, and the exit code, the highest of its refusals'
 * (`Refused`): 2 for a usage refusal, 1 for a stale version (`Conflict`), 0 where none was refused.
 * @param args The words typed after `apply`: `-f` and `-n` with their values, or `--help`.
 */
export async function apply(args: readonly string[]) {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(APPLY_HELP);
    return 0;
  }
  const { file, namespace } = parsed(args);
  const objects = objectsOf(textOf(file), file);
  if (objects.length === 0) throw new Refused(`nemia apply: ${file} holds no object: write one, then \`nemia apply -f ${file}\``);
  const resources = await discovered('apply');
  let code = 0;
  for (const object of objects) {
    try {
      process.stdout.write(`${await applied(object, resources, namespace)}\n`);
    } catch (err) {
      if (!(err instanceof Refused)) throw err;
      process.stderr.write(`${err.message}\n`);
      code = Math.max(code, err.code);
    }
  }
  return code;
}
