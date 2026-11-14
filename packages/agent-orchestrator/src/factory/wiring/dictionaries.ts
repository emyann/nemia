/** A factory's wiring as dictionaries, each change a new one: read by `wiring.ts` and its contract (`contracts/wiring.contract.ts`). */

/** `names` with `name`, sorted, each named once. */
export const withName = (names: readonly string[], name: string): string[] => [...new Set([...names, name])].sort();

/** Whether `hires` hire into a step of the workflow `workflow`: a hire's key is `<workflow>/<step>`. */
export const hiresInto = (hires: Readonly<Record<string, string>>, workflow: string): boolean =>
  Object.keys(hires).some((step) => step.startsWith(`${workflow}/`));

/** `hires` with `agent` hired into `step`, an earlier hire there replaced. */
export const withHire = (hires: Readonly<Record<string, string>>, step: string, agent: string): Record<string, string> => ({
  ...hires,
  [step]: agent,
});

/** `dict` with `value` at `key`, an earlier one there replaced. */
export const withEntry = <V>(dict: Readonly<Record<string, V>>, key: string, value: V): Record<string, V> => ({ ...dict, [key]: value });

/** `dict` with no entry at `key`. */
export const withoutEntry = <V>(dict: Readonly<Record<string, V>>, key: string): Record<string, V> => {
  const { [key]: _gone, ...rest } = dict;
  return rest;
};

