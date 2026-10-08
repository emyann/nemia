/**
 * A template's parameters given values: each `--set <key>=<value>` read against the manifest's `parameters`, typed as declared, a default
 * filling a value not given (`resolveParams`); and each `{param: <name>}` of a document replaced by its value (`substitute`). Pure.
 */
import { isMap, isParam, type Parameter } from '../template/index.ts';

/** A parameter's value: a string, a number or a boolean, as its declaration types it. */
export type ParamValue = string | number | boolean;

/** Every declared parameter, by name, with its value. */
export type Params = Readonly<Record<string, ParamValue>>;

/** The value `given` as the parameter `name` of `type` takes it, or why it does not read as one. */
function typed(name: string, type: Parameter['type'], given: string): ParamValue | string[] {
  if (type === 'number') {
    const n = Number(given);
    if (given.trim() === '' || !Number.isFinite(n))
      return [`--set ${name}=${given}: ${name} is a number, and ${given || 'nothing'} is none. Give a number: --set ${name}=<number>.`];
    return n;
  }
  if (type === 'boolean') {
    if (given === 'true' || given === 'false') return given === 'true';
    return [
      `--set ${name}=${given}: ${name} is a boolean, true or false, and ${given || 'nothing'} is neither. Give --set ${name}=true or --set ${name}=false.`,
    ];
  }
  return given;
}

/** The declared parameters' names, as a refusal lists them. */
const declaredWords = (declared: Readonly<Record<string, Parameter>>): string => {
  const names = Object.keys(declared).sort();
  return names.length ? `it declares: ${names.join(', ')}` : 'it declares none';
};

/** The value each `--set <key>=<value>` of `sets` gives a key `declared` holds, the last winning; a `--set` refused into `refusals`. */
function givenOf(declared: Readonly<Record<string, Parameter>>, sets: readonly string[], refusals: string[]): Map<string, string> {
  const given = new Map<string, string>();
  for (const set of sets) {
    const at = set.indexOf('=');
    const key = set.slice(0, at);
    if (at <= 0)
      refusals.push(`--set ${set}: a parameter is given as <key>=<value>, and this has no key before an =. Write --set <key>=<value>.`);
    else if (!Object.hasOwn(declared, key))
      refusals.push(`--set ${set}: the template declares no parameter ${key}; ${declaredWords(declared)}.`);
    else given.set(key, set.slice(at + 1));
  }
  return given;
}

/**
 * The value of every parameter `declared`, from `sets` (each `<key>=<value>`, the last of a key winning) or its default. Refused, each by
 * name, every one at once: a `--set` with no `=`, a key not declared, a number or a boolean that does not read as one, and a parameter
 * with no default that no `--set` gives.
 */
export function resolveParams(
  declared: Readonly<Record<string, Parameter>>,
  sets: readonly string[],
): { params: Params; refusals: string[] } {
  const refusals: string[] = [];
  const given = givenOf(declared, sets, refusals);
  const params: Record<string, ParamValue> = {};
  for (const [name, parameter] of Object.entries(declared).sort(([a], [b]) => a.localeCompare(b))) {
    const written = given.get(name);
    if (written === undefined) {
      if (parameter.default === undefined)
        refusals.push(`${name} has no default, and no --set gives it (${parameter.description}): add --set ${name}=<${parameter.type}>.`);
      else params[name] = parameter.default;
      continue;
    }
    const value = typed(name, parameter.type, written);
    if (Array.isArray(value)) refusals.push(...value);
    else params[name] = value;
  }
  return { params, refusals };
}

/** `value` with each `{param: <name>}` in it, at any depth, replaced by the value `params` gives. Refused: a name `params` lacks. */
export function substitute(value: unknown, params: Params): unknown {
  if (isParam(value)) {
    if (!Object.hasOwn(params, value.param))
      throw new Error(`{param: ${value.param}} names a parameter the template does not declare: declare it in nemia.yaml's parameters.`);
    return params[value.param];
  }
  if (Array.isArray(value)) return value.map((v) => substitute(v, params));
  if (isMap(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v, params)]));
  return value;
}
