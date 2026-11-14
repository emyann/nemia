/**
 * Which widget draws a declared field of a step's output, chosen once per field from its schema and never from its value
 * (`widgetOf`, proved by `contracts/field-widget.contract.ts`), and the field as that choice reads it, from the schema a closeout
 * carries and the shape its `x-shape` named (`fieldReadOf`). Pure.
 */
import type { FieldShape } from 'objects';
import type { FieldRead, JsonType, WidgetOf } from '../../contracts/field-widget.contract.ts';

export type { FieldWidget } from '../../contracts/field-widget.contract.ts';

/** The JSON Schema `type` words, in the order a list of them is read. */
const JSON_TYPES: readonly JsonType[] = ['string', 'number', 'integer', 'boolean', 'array', 'object', 'null'];

/**
 * Whether the types but null are exactly the one type `t`: `t` among them, and every other null (a nullable field is drawn by what it is
 * when it is not null). A schema's `type` names each word once, and `fieldReadOf` reads it so.
 */
const only = (types: readonly JsonType[], t: JsonType): boolean =>
  types.some((x) => x === t) && types.every((x) => x === t || x === 'null');

/** Whether the types but null are exactly one scalar. */
const scalar = (types: readonly JsonType[]): boolean =>
  only(types, 'string') || only(types, 'number') || only(types, 'integer') || only(types, 'boolean');

/**
 * The widget of `field`: its shape's where its schema names one; else, by its one type but null, prose for a string (a tag for one that
 * lists its words), a number, a yes or no, a list of scalars or a table of objects for an array, the rows of an object; and its JSON for
 * any other, a schema naming no one type among them.
 */
export const widgetOf: WidgetOf = (field) => {
  const { shape, types, items } = field;
  if (shape !== null) return shape;
  if (only(types, 'string')) return field.enumerated ? 'words' : 'prose';
  if (only(types, 'number') || only(types, 'integer')) return 'number';
  if (only(types, 'boolean')) return 'yesNo';
  if (only(types, 'array') && scalar(items)) return 'list';
  if (only(types, 'array') && only(items, 'object')) return 'table';
  if (only(types, 'object')) return 'record';
  return 'json';
};

/** The `type` words of a schema, as a list: its one word, each word of its list, or none for anything else. */
function typesOf(schema: unknown): JsonType[] {
  if (typeof schema !== 'object' || schema === null) return [];
  const type = (schema as { type?: unknown }).type;
  const words: unknown[] = Array.isArray(type) ? type : [type];
  return JSON_TYPES.filter((t) => words.includes(t));
}

/**
 * A field of a step's output as `widgetOf` reads it, from its JSON Schema (`schema`, the closeout's for the field) and the shape its
 * `x-shape` named (null for none): its types, whether it lists its words (`enum`), and an array's items' types.
 */
export function fieldReadOf(schema: unknown, shape: FieldShape | null): FieldRead {
  const object = typeof schema === 'object' && schema !== null ? (schema as { enum?: unknown; items?: unknown }) : {};
  const types = typesOf(schema);
  return {
    shape,
    types,
    enumerated: Array.isArray(object.enum),
    items: types.includes('array') ? typesOf(object.items) : [],
  };
}
