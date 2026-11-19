/**
 * Where a schema refused a value, read off Effect's own issue tree by each issue's `_tag`, never off the English its formatter
 * writes: the formatter's leaf and check hooks never see a union with no member that matches, which is every optional field and every
 * union of literals. The walk is the one Effect's formatter takes (effect/src/SchemaIssue.ts), its places listed rather than said.
 * The rejected value is the one Effect kept on the issue, decoded with `{ reportInput: true }`; the expected type and a check's message
 * are Effect's own words (`SchemaIssue.defaultLeafHook`, `SchemaIssue.defaultCheckHook`), a union's `undefined` member left out.
 *
 * The runtime keeps its own copy: it imports nothing above it, and objects keeps the one the layers above it read
 * (`packages/objects/src/refused.ts`).
 */
import { SchemaAST, SchemaIssue } from 'effect';

/** One place a schema refused, in the order Effect lists them. */
export interface RefusedPlace {
  /** The keys from the decoded value down to the refused one. */
  readonly path: readonly PropertyKey[];
  /** The `_tag` of the issue that refused it, Effect's own; `Filter` where a check refused it. */
  readonly _tag: SchemaIssue.Issue['_tag'];
  /** The value found there, present only where Effect kept it (`reportInput`), never for a missing key. */
  readonly input?: unknown;
  /** The message the schema declared for this refusal, if it declared one. */
  readonly message?: string;
  /** What was expected there, in Effect's words without their leading `Expected `: a type, or a check's description. */
  readonly expected: string;
}

const EXPECTED = 'Expected ';

const withoutExpected = (text: string) => (text.startsWith(EXPECTED) ? text.slice(EXPECTED.length) : text);

const definedOnly = (ast: SchemaAST.AST) => {
  if (!SchemaAST.isUnion(ast)) return ast;
  const kept = ast.types.filter((member) => !SchemaAST.isUndefined(member));
  return kept.length === ast.types.length ? ast : new SchemaAST.Union(kept, ast.options);
};

const typeOf = (ast: SchemaAST.AST) => withoutExpected(SchemaIssue.defaultLeafHook(new SchemaIssue.InvalidType(definedOnly(ast))));

const stringOf = (value: unknown) => (typeof value === 'string' ? value : undefined);

const declared = (issue: SchemaIssue.Issue) => {
  switch (issue._tag) {
    case 'Pointer':
    case 'Composite':
      return undefined;
    case 'Encoding':
      return declared(issue.issue);
    case 'Filter':
      return stringOf(issue.filter.annotations?.message);
    case 'MissingKey':
      return stringOf(issue.annotations?.messageMissingKey);
    case 'UnexpectedKey':
      return stringOf(issue.ast.annotations?.messageUnexpectedKey);
    case 'InvalidValue':
    case 'Forbidden':
      return stringOf(issue.annotations?.message);
    default:
      return stringOf(issue.ast.annotations?.message);
  }
};

const expectedOf = (issue: SchemaIssue.Issue) => {
  switch (issue._tag) {
    case 'InvalidType':
    case 'AnyOf':
    case 'OneOf':
      return typeOf(issue.ast);
    case 'InvalidValue':
      return stringOf(issue.annotations?.expected) ?? 'a valid value';
    case 'Filter': {
      const inner = issue.issue._tag === 'InvalidValue' ? stringOf(issue.issue.annotations?.expected) : undefined;
      return inner ?? stringOf(issue.filter.annotations?.expected) ?? '<filter>';
    }
    case 'MissingKey':
    case 'UnexpectedKey':
    case 'Forbidden':
      return withoutExpected(SchemaIssue.defaultLeafHook(issue));
    default:
      return '';
  }
};

const placeOf = (issue: SchemaIssue.Issue, path: readonly PropertyKey[], message: string | undefined) => ({
  path,
  _tag: issue._tag,
  ...(SchemaIssue.hasInput(issue) ? { input: issue.input } : {}),
  ...(message === undefined ? {} : { message }),
  expected: expectedOf(issue),
});

// oxlint-disable-next-line landmines-types/no-explicit-return-types -- it returns its own call, whose type inference cannot give
const walk = (issue: SchemaIssue.Issue, path: readonly PropertyKey[], filter?: SchemaIssue.Filter): RefusedPlace[] => {
  switch (issue._tag) {
    case 'Filter':
      return walk(issue.issue, path, filter ?? issue);
    case 'Encoding':
      return walk(issue.issue, path, filter);
    case 'Pointer':
      return walk(issue.issue, [...path, ...issue.path], filter);
    case 'Composite':
      return issue.issues.flatMap((child) => walk(child, path, filter));
    case 'AnyOf':
      if (issue.issues.length > 0) return issue.issues.flatMap((child) => walk(child, path, filter));
      break;
    default:
      break;
  }
  return [filter ? placeOf(filter, path, SchemaIssue.defaultCheckHook(filter)) : placeOf(issue, path, declared(issue))];
};

/**
 * Every place `issue` refused, in Effect's order: its path, its `_tag`, the value Effect kept there, the message the schema declared,
 * and what was expected. Decode with `{ reportInput: true }` for each place to hold its `input`.
 * @param issue The issue of a schema's refusal (`SchemaError.issue`).
 */
export const refusedIn = (issue: SchemaIssue.Issue) => walk(issue, []);
