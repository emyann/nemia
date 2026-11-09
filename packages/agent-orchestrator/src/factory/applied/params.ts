/**
 * A template's parameters given values: each `--set <key>=<value>` read against the manifest's `parameters`, typed as declared, a default
 * filling a value not given (`resolveParams`); each `{param: <name>}` of a document replaced by its value, and each
 * `${{ parameters.<name> }}` inside one of its strings written with it (`substitute`); and each expression of a text written the same
 * way (`interpolated`). A shell's `$VAR` and `${VAR}` are no expression, and stay as they are. Pure.
 */
import { isMap, isParam, writeExpressions, type Parameter } from '../../template/index.ts';

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

/**
 * A factory's `held` parameters as `--set` words a template that `declared` its parameters takes, followed by `sets`, so a `--set` of
 * the same key wins (`givenOf`); and the held keys it does not declare, sorted, which the words leave out. A key of `sets` is not
 * filtered: one the template does not declare is refused by `resolveParams`, never dropped.
 */
export function overlaid(
  declared: Readonly<Record<string, Parameter>>,
  held: Params,
  sets: readonly string[],
): { sets: string[]; dropped: string[] } {
  const kept = Object.entries(held).filter(([key]) => Object.hasOwn(declared, key));
  const dropped = Object.keys(held)
    .filter((key) => !Object.hasOwn(declared, key))
    .sort();
  return { sets: [...kept.map(([key, value]) => `${key}=${String(value)}`), ...sets], dropped };
}

/** `text` with each `${{ parameters.<name> }}` in it written with the value `params` gives. Refused: a name `params` lacks. */
export function interpolated(text: string, params: Params): string {
  return writeExpressions(text, (name) => {
    if (!Object.hasOwn(params, name))
      throw new Error(
        `\${{ parameters.${name} }} names a parameter the template does not declare: declare ${name} in nemia.yaml's parameters, or remove the expression.`,
      );
    return String(params[name]);
  });
}

/**
 * `value` with each `{param: <name>}` in it, at any depth, replaced by the value `params` gives, and each `${{ parameters.<name> }}`
 * inside a string written with it (`interpolated`). Refused: a name `params` lacks.
 */
export function substitute(value: unknown, params: Params): unknown {
  if (typeof value === 'string') return interpolated(value, params);
  if (isParam(value)) {
    if (!Object.hasOwn(params, value.param))
      throw new Error(`{param: ${value.param}} names a parameter the template does not declare: declare it in nemia.yaml's parameters.`);
    return params[value.param];
  }
  if (Array.isArray(value)) return value.map((v) => substitute(v, params));
  if (isMap(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v, params)]));
  return value;
}
