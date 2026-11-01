/**
 * The counts a workflow declares over its steps' closeouts (`tally:`), read, valued and totalled: `tallyOf` reads a step's line against
 * the schema its `output:` holds, `tallyIn` gives one closeout's value of one tally, and `tallyRowsOf` totals the tries' values per step
 * and tally, over a range and on each of its days. The names are the workflow's: this knows only what a step declares.
 *
 * A tally is a field of the step's closeout: an array counts its items, an integer or a number is its value, and `field.flag` counts the
 * items of an array `field` whose boolean `flag` is `true`, and `field.key=value` the items of an array `field` whose string `key` is
 * exactly `value`. A value with nothing measured under it is null, never 0. Pure.
 */
import { isObject, refuse, type StepOutput } from '../step/step.ts';

/** One tally of one try: its name as the step writes it, and the try's closeout's value of it, null where none was measured. */
export type TallyFact = { tally: string; value: number | null };

/** What the measured tries of a step give a tally: their values' sum, null with none measured, and how many were measured. */
export type TallyCell = { sum: number | null; tries: number };

/** A tally of a step, totalled over a range (`total`) and on each of its days (`days`). */
export type TallyRow = { step: string; tally: string; total: TallyCell; days: Array<TallyCell & { day: string }> };

/** The JSON-Schema types a schema entry says, `type` being a word or a list of words; none where it says none. */
const typesOf = (entry: unknown): string[] => {
  const type = isObject(entry) ? entry.type : undefined;
  return (Array.isArray(type) ? type : [type]).filter((t): t is string => typeof t === 'string');
};

/** An entry's parts: its field, the key of the field's items it reads, and the value it counts them by; undefined in none of the forms. */
function partsOf(entry: string): { field: string; key: string | undefined; value: string | undefined } | undefined {
  const [fieldKey, value, ...more] = entry.split('=');
  if (fieldKey === undefined) return undefined;
  const [field, key, ...deeper] = fieldKey.split('.');
  if (more.length || deeper.length || !field || key === '' || (value !== undefined && key === undefined)) return undefined;
  return { field, key, value };
}

/** The properties the items of an array entry of a schema declare; none where it declares none. */
const itemPropertiesOf = (entry: unknown): Record<string, unknown> => {
  const items = isObject(entry) ? entry.items : undefined;
  return isObject(items) && isObject(items.properties) ? items.properties : {};
};

/** Why `field.key=value` cannot be tallied against `output`, in words after the step's line, or undefined where it can. */
function matchRefusal(entry: string, field: string, key: string, value: string, output: StepOutput): string | undefined {
  const named = `\`output: ${output.file}\``;
  if (value === '') return `\`${entry}\` names no value. Name the value of \`${key}\` whose items it counts: \`${field}.${key}=<value>\``;
  const declared = itemPropertiesOf(output.schema.properties[field])[key];
  if (!typesOf(output.schema.properties[field]).includes('array') || !typesOf(declared).includes('string'))
    return `${named} declares no string \`${key}\` on the items of an array \`${field}\`, and \`${entry}\` counts the items whose \`${key}\` is \`${value}\`. Declare it — \`"${key}": { "type": "string" }\` under the items' \`properties\` — or delete the entry`;
  const allowed = isObject(declared) && Array.isArray(declared.enum) ? declared.enum : undefined;
  if (allowed === undefined || allowed.includes(value)) return undefined;
  return `${named} declares the \`${key}\` of the items of \`${field}\` as one of ${allowed.join(', ')}, and \`${value}\` is none of them. Name one of them, or delete the entry`;
}

/** Why `entry` cannot be tallied against `output`, in words after the step's line, or undefined where it can. */
function entryRefusal(entry: string, output: StepOutput): string | undefined {
  const parts = partsOf(entry);
  const properties = output.schema.properties;
  const named = `\`output: ${output.file}\``;
  if (!parts)
    return `\`${entry}\` is none of a field, \`field.flag\` and \`field.key=value\`. Name a field of ${named}, one array field and a boolean of its items: \`issues.open\`, or one array field, a string of its items and a value: \`issues.kind=bug\``;
  const { field, key: flag, value } = parts;
  if (!Object.hasOwn(properties, field))
    return `${named} declares no field \`${field}\`; it declares ${Object.keys(properties).join(', ')}. Name one of them, or delete the entry`;
  if (flag !== undefined && value !== undefined) return matchRefusal(entry, field, flag, value, output);
  const types = typesOf(properties[field]);
  if (flag === undefined) {
    if (types.some((t) => t === 'array' || t === 'integer' || t === 'number')) return undefined;
    return `${named} declares \`${field}\` as ${JSON.stringify(types.length ? types : properties[field])}, and a tally counts an array's items or takes an integer's or a number's value. Name such a field, or delete the entry`;
  }
  if (types.includes('array') && typesOf(itemPropertiesOf(properties[field])[flag]).includes('boolean')) return undefined;
  return `${named} declares no boolean \`${flag}\` on the items of an array \`${field}\`, and \`${entry}\` counts the items whose \`${flag}\` is true. Declare it — \`"${flag}": { "type": "boolean" }\` under the items' \`properties\` — or delete the entry`;
}

/**
 * `tally:` as written, a list like `after:`, read against the step's `output:` schema: each entry is a field of it, `field.flag` or
 * `field.key=value`.
 * Undefined for no line. Refused, naming the step's file and the entry: a tally on a step with no `output:`, an entry the schema cannot
 * hold (`entryRefusal`), and an entry given twice.
 */
export function tallyOf(step: string, written: string | undefined, output: StepOutput | undefined): string[] | undefined {
  if (written === undefined) return undefined;
  const entries = written
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const named = `${step}: \`tally: ${written}\` in ${step.endsWith('.md') ? step : `${step}.md`}`;
  if (!entries.length) return entries;
  if (!output)
    refuse(
      `${named} counts fields of the step's closeout, and the step declares no \`output:\`, nor does its agent. Give it an \`output:\` schema that declares them, or delete the line.`,
    );
  const twice = entries.find((entry, i) => entries.indexOf(entry) !== i);
  if (twice !== undefined) refuse(`${named} names \`${twice}\` twice. Name each tally once.`);
  for (const entry of entries) {
    const why = entryRefusal(entry, output);
    if (why !== undefined) refuse(`${named}: ${why}.`);
  }
  return entries;
}

/**
 * A closeout's value of a tally: an array's item count, a finite number, the items whose flag is exactly `true`, or the items whose key is
 * exactly the value; null otherwise.
 */
export function tallyIn(tally: string, output: Record<string, unknown> | undefined): number | null {
  const [fieldKey, match] = tally.split('=');
  if (fieldKey === undefined) return null;
  const [field, key] = fieldKey.split('.');
  if (field === undefined) return null;
  const value = output?.[field];
  if (key !== undefined) {
    const counted = (item: Record<string, unknown>) => (match === undefined ? item[key] === true : item[key] === match);
    return Array.isArray(value) ? value.filter((item) => isObject(item) && counted(item)).length : null;
  }
  if (Array.isArray(value)) return value.length;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** What a step's tries give one tally: the sum of the values measured, null with none, and their count. */
const cellOf = (values: ReadonlyArray<number | null>): TallyCell => {
  const known = values.filter((v): v is number => v !== null);
  return { sum: known.length ? known.reduce((n, v) => n + v, 0) : null, tries: known.length };
};

/** A try as a tally row reads it: its step, its day and its tallies. */
type Tallied = { step: string; day: string; tallies: readonly TallyFact[] };

/**
 * A row per step and tally the tries declare (`TallyRow`), in the order the tries first give them: its total over the tries, and a cell
 * on each of `days`, the sum null on a day no try of it was measured.
 */
export function tallyRowsOf(tries: readonly Tallied[], days: readonly string[]): TallyRow[] {
  const rows = new Map<string, { step: string; tally: string; of: Array<{ day: string; value: number | null }> }>();
  for (const t of tries)
    for (const { tally, value } of t.tallies) {
      const key = JSON.stringify([t.step, tally]);
      const row = rows.get(key) ?? { step: t.step, tally, of: [] };
      row.of.push({ day: t.day, value });
      rows.set(key, row);
    }
  return [...rows.values()].map(({ step, tally, of }) => ({
    step,
    tally,
    total: cellOf(of.map((o) => o.value)),
    days: days.map((day) => ({ day, ...cellOf(of.filter((o) => o.day === day).map((o) => o.value)) })),
  }));
}
