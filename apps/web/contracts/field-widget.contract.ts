/**
 * Which widget draws a declared field of a step's output (`widgetOf`, src/lib/fieldWidget.ts), chosen once per field from its schema and
 * never from its value, so a field looks the same on every run and before its step has run. A field its schema marks with a shape
 * (`x-shape`, carried beside the schema as the closeout's `shapes`) is drawn by that shape's widget; any other by one rule per JSON type:
 * prose for a string, a tag for a string of named words, a number, a yes or no, a list of scalars, a table of objects, the rows of an
 * object, and the JSON itself where its schema names no one type.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { FieldShape } from 'objects';

/** A JSON Schema's `type` word. */
export type JsonType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';

/**
 * A declared field as the widget reads it: the shape its schema named (null for none), its `type` as a list (empty where it names none),
 * whether it lists the words it may take (`enum`), and for an array the type of its items as a list (empty for none or for no array).
 */
export type FieldRead = {
  readonly shape: FieldShape | null;
  readonly types: readonly JsonType[];
  readonly enumerated: boolean;
  readonly items: readonly JsonType[];
};

/** What draws a field. */
export type FieldWidget =
  | 'questions'
  | 'budgets'
  | 'link'
  | 'commit'
  | 'prose'
  | 'words'
  | 'number'
  | 'yesNo'
  | 'list'
  | 'table'
  | 'record'
  | 'json';

/**
 * Whether the types but null are exactly the one type `t`: `t` among them, and every other null (a nullable field is drawn by what it is
 * when it is not null). Read of a list that names each word once, as a schema's `type` does; said without counting a filter, which the
 * verifier knows only as none or some.
 */
const only = (types: readonly JsonType[], t: JsonType): boolean =>
  types.some((x) => x === t) && types.every((x) => x === t || x === 'null');

/** Whether the types but null are exactly one type. */
const oneType = (types: readonly JsonType[]): boolean =>
  only(types, 'string') ||
  only(types, 'number') ||
  only(types, 'integer') ||
  only(types, 'boolean') ||
  only(types, 'array') ||
  only(types, 'object');

/** Whether the types but null are exactly one scalar. */
const scalar = (types: readonly JsonType[]): boolean =>
  only(types, 'string') || only(types, 'number') || only(types, 'integer') || only(types, 'boolean');

/** The widgets that stand for a shape, and are drawn for no field that names none. */
const shaped = (w: FieldWidget): boolean => w === 'questions' || w === 'budgets' || w === 'link' || w === 'commit';

const widgetOfSpec = spec<(field: FieldRead) => FieldWidget>({
  ensures: {
    theShapeWins: {
      description: 'A field whose schema names a shape is drawn by that shape, whatever its type',
      condition: ({ input: [field], output }) => field.shape === null || output === field.shape,
    },
    noShapeWithoutOne: {
      description: 'A field whose schema names no shape is never drawn as one',
      condition: ({ input: [field], output }) => field.shape !== null || !shaped(output),
    },
    aStringIsProse: {
      description: 'An unshaped string that lists no words is prose, its null aside',
      condition: ({ input: [field], output }) =>
        !(field.shape === null && only(field.types, 'string') && !field.enumerated) || output === 'prose',
    },
    namedWordsAreATag: {
      description: 'An unshaped string that lists the words it may take is drawn as a tag',
      condition: ({ input: [field], output }) =>
        !(field.shape === null && only(field.types, 'string') && field.enumerated) || output === 'words',
    },
    aNumberIsANumber: {
      description: 'An unshaped number or integer is drawn as a number',
      condition: ({ input: [field], output }) =>
        !(field.shape === null && (only(field.types, 'number') || only(field.types, 'integer'))) || output === 'number',
    },
    aBooleanIsYesOrNo: {
      description: 'An unshaped boolean is drawn as yes or no',
      condition: ({ input: [field], output }) => !(field.shape === null && only(field.types, 'boolean')) || output === 'yesNo',
    },
    scalarsAreAList: {
      description: 'An unshaped array of one scalar type is drawn as a list',
      condition: ({ input: [field], output }) =>
        !(field.shape === null && only(field.types, 'array') && scalar(field.items)) || output === 'list',
    },
    objectsAreATable: {
      description: 'An unshaped array of objects is drawn as a table',
      condition: ({ input: [field], output }) =>
        !(field.shape === null && only(field.types, 'array') && only(field.items, 'object')) || output === 'table',
    },
    anObjectIsItsRows: {
      description: 'An unshaped object is drawn as its rows',
      condition: ({ input: [field], output }) => !(field.shape === null && only(field.types, 'object')) || output === 'record',
    },
    noOneTypeIsJson: {
      description: 'An unshaped field whose schema names no one type but null is drawn as its JSON',
      condition: ({ input: [field], output }) => !(field.shape === null && !oneType(field.types)) || output === 'json',
    },
    anArrayOfNoOneKindIsJson: {
      description: 'An unshaped array whose items are of no one scalar type and are not objects is drawn as its JSON',
      condition: ({ input: [field], output }) =>
        !(field.shape === null && only(field.types, 'array') && !scalar(field.items) && !only(field.items, 'object')) || output === 'json',
    },
  },
});

/** `widgetOf`'s type, which src/lib/fieldWidget.ts takes. */
export type WidgetOf = Implementation<typeof widgetOfSpec>;
