/**
 * The runtime's entity-relation printer: an `erDiagram` drawn from the model's schemas, so the picture is the code's. The
 * orchestrator keeps a copy of the same contract (`agent-orchestrator/src/model/er.model.ts`), since it may not import this one.
 *
 * It prints only the two line forms beautiful-mermaid reads (`node_modules/beautiful-mermaid/src/er/parser.ts`): an attribute,
 * `type name [PK|FK] ["comment"]`, and a relation, `A <card>--<card> B : label`.
 */
import { SchemaAST, type Schema } from 'effect';
import { own } from './own.ts';

/** A layer's model, as the printer reads it. */
export interface ErModel {
  /** Each entity a Struct schema annotated with its `identifier`, drawn in this order. */
  readonly entities: ReadonlyArray<Schema.Top>;
  /** Each id's name → the entity it identifies (`{ TaskId: 'Task' }`). An id met on a field but named nowhere here is another layer's. */
  readonly ids: Readonly<Record<string, string>>;
}

/** What one field draws: its attribute, when it has one, and the relations it holds. */
type Drawn = { attribute?: { type: string; key?: 'PK' | 'FK' }; relations: Array<{ card: string; to: string }> };

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

/** The entities a container holds: an array's elements, a record's values. */
const heldMany = (ast: SchemaAST.AST): string[] => {
  const inner = SchemaAST.isArrays(ast)
    ? [...ast.elements, ...ast.rest]
    : SchemaAST.isObjects(ast) && ast.propertySignatures.length === 0
      ? ast.indexSignatures.map((s) => s.type)
      : [];
  return inner.flatMap(membersOf).flatMap((m) => entityOf(m) ?? []);
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
  const named = SchemaAST.resolveIdentifier(one);
  const entities = members.flatMap((m) => entityOf(m) ?? []);
  if (entities.length > 0) return { relations: entities.map((to) => ({ card: optional ? '||--o|' : '||--||', to })) };
  if (named !== undefined && (own(model.ids, named) !== undefined || SchemaAST.isString(one))) {
    const owner = own(model.ids, named);
    if (owner === holder) return { attribute: { type: named, key: 'PK' }, relations: [] };
    return { attribute: { type: named, key: 'FK' }, relations: [{ card: '}o--||', to: owner ?? named }] };
  }
  const many = heldMany(one);
  if (many.length > 0) return { relations: many.map((to) => ({ card: '||--o{', to })) };
  return { attribute: { type: only === undefined && members.length === 0 ? 'unknown' : typeOf(one) }, relations: [] };
};

/** The attribute line of a field: its type, its key when it is one, and whether it may be left out. */
const attributeLine = (name: string, attribute: NonNullable<Drawn['attribute']>, optional: boolean): string =>
  `    ${attribute.type} ${name}${attribute.key ? ` ${attribute.key}` : ''}${optional ? ' "optional"' : ''}`;

/** One entity's block and the relations its fields hold, in field order. */
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
    if (drawn.attribute) block.push(attributeLine(String(field.name), drawn.attribute, optional));
    for (const r of drawn.relations) relations.push(`  ${name} ${r.card} ${r.to} : ${String(field.name)}`);
  }
  block.push('  }');
  return { block, relations };
};

/**
 * The model's `erDiagram`: a block per entity, in the order given, then every relation, in entity then field order; two-space
 * indents, joined by `\n`, no trailing newline. A field holding an entity draws a relation and no attribute (one, zero or one, or
 * many under an array or a record); one holding an id is the entity's PK, or an FK with a relation to the entity the id names, or
 * to a node named by the id itself when it is another layer's.
 */
export const erDiagram = (model: ErModel): string => {
  const drawn = model.entities.map((entity) => drawEntity(model, entity));
  return ['erDiagram', ...drawn.flatMap((d) => d.block), ...drawn.flatMap((d) => d.relations)].join('\n');
};
