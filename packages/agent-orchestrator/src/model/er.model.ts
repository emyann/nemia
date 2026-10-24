/**
 * The orchestrator's entity-relation printer: an `erDiagram` drawn from the model's schemas, so the picture is the code's. The
 * runtime keeps a copy of the same contract (`agent-runtime/src/core/er.ts`), since this layer may not import it outside its client;
 * the two print a model alike, line for line.
 *
 * It prints only the two line forms beautiful-mermaid reads (`node_modules/beautiful-mermaid/src/er/parser.ts`): an attribute,
 * `type name [PK|FK] ["comment"]`, and a relation, `A <card>--<card> B : label`.
 */
import { SchemaAST, type Schema } from 'effect';

/** A layer's model, as the printer reads it. */
export interface ErModel {
  /** Each entity a Struct schema annotated with its `identifier`, drawn in this order. */
  readonly entities: ReadonlyArray<Schema.Top>;
  /** Each id's name → the entity it identifies (`{ RunId: 'Run' }`). An id met on a field but named nowhere here is another layer's. */
  readonly ids: Readonly<Record<string, string>>;
}

/** What one field draws: its attribute, when it has one, and the relations it holds. */
type Drawn = { attribute?: { type: string; key?: 'PK' | 'FK' }; relations: Array<{ from?: string; card: string; to: string }> };

/** The entity `ids` names `key` the id of, or `undefined`: a key it does not hold, a prototype's (`toString`) included, is none. */
const ownerOf = (ids: ErModel['ids'], key: string): string | undefined => (Object.hasOwn(ids, key) ? ids[key] : undefined);

/**
 * The members of a union, nested ones spread but for one that names itself, with `null` and `undefined` left out: what a nullable
 * or optional field holds.
 */
const membersOf = (ast: SchemaAST.AST): SchemaAST.AST[] =>
  SchemaAST.isUnion(ast) && SchemaAST.resolveIdentifier(ast) === undefined
    ? ast.types.flatMap(membersOf)
    : SchemaAST.isNull(ast) || SchemaAST.isUndefined(ast)
      ? []
      : [ast];

/** The entity a schema is, by its identifier: a struct that names itself. */
const entityOf = (ast: SchemaAST.AST): string | undefined => (SchemaAST.isObjects(ast) ? SchemaAST.resolveIdentifier(ast) : undefined);

/** What a container holds: an array's elements, a record's values; nothing for any other schema. */
const heldIn = (ast: SchemaAST.AST): SchemaAST.AST[] =>
  (SchemaAST.isArrays(ast)
    ? [...ast.elements, ...ast.rest]
    : SchemaAST.isObjects(ast) && ast.propertySignatures.length === 0
      ? ast.indexSignatures.map((s) => s.type)
      : []
  ).flatMap(membersOf);

/** The entities a container holds. */
const heldMany = (ast: SchemaAST.AST): string[] => heldIn(ast).flatMap((m) => entityOf(m) ?? []);

/** The id a schema is: an identifier the model names as an id, or one on a string, which is another layer's id. */
const idOf = (model: ErModel, ast: SchemaAST.AST): string | undefined => {
  const named = SchemaAST.resolveIdentifier(ast);
  return named !== undefined && (ownerOf(model.ids, named) !== undefined || SchemaAST.isString(ast)) ? named : undefined;
};

/** The attribute type of a field that holds no entity and no id. */
const typeOf = (ast: SchemaAST.AST): string => {
  const named = SchemaAST.resolveIdentifier(ast);
  if (named !== undefined) return named;
  if (SchemaAST.isString(ast)) return 'string';
  if (SchemaAST.isNumber(ast)) return 'number';
  if (SchemaAST.isBoolean(ast)) return 'boolean';
  if (SchemaAST.isLiteral(ast)) return typeof ast.literal === 'string' && /^\S+$/.test(ast.literal) ? ast.literal : 'enum';
  if (SchemaAST.isUnion(ast)) return membersOf(ast).every(SchemaAST.isLiteral) ? 'enum' : 'unknown';
  if (SchemaAST.isArrays(ast)) return 'list';
  if (SchemaAST.isObjects(ast)) return 'object';
  return 'unknown';
};

/** What the field `ast` of the entity `holder` draws, `optional` when it may be left out. */
const drawField = (model: ErModel, holder: string, ast: SchemaAST.AST, optional: boolean): Drawn => {
  const members = membersOf(ast);
  const only = members.length === 1 ? members[0] : undefined;
  const one = only ?? ast;
  const named = idOf(model, one);
  const entities = members.flatMap((m) => entityOf(m) ?? []);
  if (entities.length > 0) return { relations: entities.map((to) => ({ card: optional ? '||--o|' : '||--||', to })) };
  if (named !== undefined) {
    const owner = ownerOf(model.ids, named);
    if (owner === holder) return { attribute: { type: named, key: 'PK' }, relations: [] };
    return { attribute: { type: named, key: 'FK' }, relations: [{ from: owner ?? named, card: '||--o{', to: holder }] };
  }
  const many = heldMany(one);
  if (many.length > 0) return { relations: many.map((to) => ({ card: '||--o{', to })) };
  const ids = heldIn(one).flatMap((m) => idOf(model, m) ?? []);
  if (ids.length > 0) {
    const relations = ids.map((id) => ({ from: ownerOf(model.ids, id) ?? id, card: '||--o{', to: holder }));
    return { attribute: { type: typeOf(one), key: 'FK' }, relations };
  }
  return { attribute: { type: only === undefined && members.length === 0 ? 'unknown' : typeOf(one) }, relations: [] };
};

/** One entity's block, `  Name {` to `  }`, and the relations its fields hold, in field order. */
const drawEntity = (model: ErModel, entity: Schema.Top): { block: string[]; relations: string[] } => {
  const ast = entity.ast;
  const name = SchemaAST.resolveIdentifier(ast);
  if (name === undefined || !SchemaAST.isObjects(ast)) {
    throw new Error('An entity of an ErModel is a struct annotated with its `identifier`: annotate it, `.annotate({ identifier })`.');
  }
  const block = [`  ${name} {`];
  const relations: string[] = [];
  for (const field of ast.propertySignatures) {
    const optional = SchemaAST.isOptional(field.type);
    const drawn = drawField(model, name, field.type, optional);
    if (drawn.attribute) {
      const key = drawn.attribute.key ? ` ${drawn.attribute.key}` : '';
      block.push(`    ${drawn.attribute.type} ${String(field.name)}${key}${optional ? ' "optional"' : ''}`);
    }
    for (const r of drawn.relations) relations.push(`  ${r.from ?? name} ${r.card} ${r.to} : ${String(field.name)}`);
  }
  block.push('  }');
  return { block, relations };
};

/**
 * The model's `erDiagram`: a block per entity, in the order given, then every relation, in entity then field order; two-space
 * indents, joined by `\n`, no trailing newline. A field holding an entity draws a relation and no attribute (one, zero or one, or
 * many under an array or a record); one holding an id is the entity's PK, or an FK, drawn from the entity the id names, or from
 * a node named by the id itself when it is another layer's, to the holder (`Owner ||--o{ Holder`: beautiful-mermaid reads no `}o`);
 * an array or a record of ids is an FK drawn the same way.
 */
export const erDiagram = (model: ErModel): string => {
  const drawn = model.entities.map((entity) => drawEntity(model, entity));
  return ['erDiagram', ...drawn.flatMap((d) => d.block), ...drawn.flatMap((d) => d.relations)].join('\n');
};
