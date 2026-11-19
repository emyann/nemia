/** A factory's wiring as dictionaries, each change a new one: read by `wiring.ts` and its contract (`contracts/wiring.contract.ts`). */

/**
 * `names` with `name`, sorted, each named once.
 * @param names The names held.
 * @param name The name added.
 */
export const withName = (names: readonly string[], name: string) => [...new Set([...names, name])].sort();

/**
 * Whether `hires` hire into a step of the workflow `workflow`: a hire's key is `<workflow>/<step>`.
 * @param hires The factory's hires: each agent by its step, `<workflow>/<step>`.
 * @param workflow The workflow's name.
 */
export const hiresInto = (hires: Readonly<Record<string, string>>, workflow: string) =>
  Object.keys(hires).some((step) => step.startsWith(`${workflow}/`));

/**
 * `hires` with `agent` hired into `step`, an earlier hire there replaced.
 * @param hires The factory's hires: each agent by its step, `<workflow>/<step>`.
 * @param step The step hired into, `<workflow>/<step>`.
 * @param agent The agent's name.
 */
export const withHire = (hires: Readonly<Record<string, string>>, step: string, agent: string) => ({
  ...hires,
  [step]: agent,
});

/**
 * `dict` with `value` at `key`, an earlier one there replaced.
 * @param dict The dictionary.
 * @param key The key written.
 * @param value The value put at it.
 */
export const withEntry = <V>(dict: Readonly<Record<string, V>>, key: string, value: V) => ({ ...dict, [key]: value });

/**
 * `dict` with no entry at `key`.
 * @param dict The dictionary.
 * @param key The key removed.
 */
export const withoutEntry = <V>(dict: Readonly<Record<string, V>>, key: string) => {
  const { [key]: _gone, ...rest } = dict;
  return rest;
};
