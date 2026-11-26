/**
 * What one expression of a template's text is written as, given its parameter's value (`expressionWritten`,
 * src/factory/applied/params.ts, which `interpolated` calls for each expression `writeExpressions` finds): `${{ parameters.<name> }}`
 * is written as the value, and `${{ case(parameters.<name>, '<then>', '<otherwise>') }}`, GitHub Actions' `case` with one predicate,
 * as its first text where the boolean parameter is true and its second where it is false. So a template writes a word only where a
 * boolean holds, and a blank `mcp:` the render drops elsewhere. Refused: an expression whose parameter the template does not declare,
 * and a `case` over a parameter that is no boolean. Pure: the parser finds the expression and its texts, the caller reads the value off
 * the factory's parameters and throws the refusal with its words.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A parameter's value, as a factory's parameters hold it. */
export type ExpressionValue = string | number | boolean;

/**
 * An expression as the parser found it: a plain one, written as its parameter's value, or a `case` over a boolean parameter with the
 * text it is written as on true (`then`) and on false (`otherwise`), each a quoted literal of the template's, quotes taken off.
 */
export type Expression =
  | { readonly kind: 'plain'; readonly name: string }
  | { readonly kind: 'case'; readonly name: string; readonly then: string; readonly otherwise: string };

/** Why an expression is not written: its parameter is not declared, or a `case` reads one that is no boolean. */
export type ExpressionRefusal = 'undeclared' | 'not-boolean';

/** What an expression is written as, or why it is not. */
export type WrittenExpression =
  | { readonly kind: 'written'; readonly text: string }
  | { readonly kind: 'refused'; readonly reason: ExpressionRefusal };

/** Whether `out` is the text `text` written. */
const writes = (out: WrittenExpression, text: string) => out.kind === 'written' && out.text === text;

/** Whether `out` is a refusal for `reason`. */
const refuses = (out: WrittenExpression, reason: ExpressionRefusal) => out.kind === 'refused' && out.reason === reason;

const expressionWrittenSpec = spec<(expression: Expression, value: ExpressionValue | undefined) => WrittenExpression>({
  ensures: {
    undeclaredRefused: {
      description: 'An expression whose parameter the template does not declare is refused as undeclared, and only it',
      condition: ({ input: [, value], output }) => (value === undefined) === refuses(output, 'undeclared'),
    },
    plainWritten: {
      description: 'A plain expression of a declared parameter is always written',
      condition: ({ input: [expression, value], output }) =>
        expression.kind !== 'plain' || value === undefined || output.kind === 'written',
    },
    plainWritesAString: {
      description: 'A plain expression of a string parameter is written as the string itself',
      condition: ({ input: [expression, value], output }) =>
        expression.kind !== 'plain' || typeof value !== 'string' || writes(output, value),
    },
    plainWritesABoolean: {
      description: 'A plain expression of a boolean parameter is written as true or false, the word a shell test compares',
      condition: ({ input: [expression, value], output }) =>
        expression.kind !== 'plain' || typeof value !== 'boolean' || writes(output, value ? 'true' : 'false'),
    },
    caseOnTrue: {
      description: 'A case whose boolean parameter is true is written as its first text',
      condition: ({ input: [expression, value], output }) =>
        expression.kind !== 'case' || value !== true || writes(output, expression.then),
    },
    caseOnFalse: {
      description: 'A case whose boolean parameter is false is written as its second text',
      condition: ({ input: [expression, value], output }) =>
        expression.kind !== 'case' || value !== false || writes(output, expression.otherwise),
    },
    caseNeedsABoolean: {
      description: 'A case over a declared parameter that is no boolean is refused as not-boolean, never written',
      condition: ({ input: [expression, value], output }) =>
        expression.kind !== 'case' || value === undefined || typeof value === 'boolean' || refuses(output, 'not-boolean'),
    },
  },
});

/** `expressionWritten`'s type, which src/factory/applied/params.ts takes. */
export type ExpressionWritten = Implementation<typeof expressionWrittenSpec>;
