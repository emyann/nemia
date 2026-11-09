/**
 * What a piece of source imports, read by pattern over its code: the scanners the layout tests, the boundary tests and the door-debt
 * tests of every workspace share. Its comments are found by TypeScript's own scanner and read as nothing, so a comment that quotes an
 * import is no import, and a `//` in a string or a `/*` in a pattern is no comment.
 */
import path from 'node:path';
import ts from 'typescript';

/**
 * The tokens after which a `/` divides rather than opens a pattern: what ends a value. The scanner alone cannot tell the two apart, as
 * the parser can, so the token before decides, as an editor's highlighter does.
 */
const ENDS_VALUE = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.Identifier,
  ts.SyntaxKind.PrivateIdentifier,
  ts.SyntaxKind.NumericLiteral,
  ts.SyntaxKind.BigIntLiteral,
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.RegularExpressionLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.CloseParenToken,
  ts.SyntaxKind.CloseBracketToken,
  ts.SyntaxKind.CloseBraceToken,
  ts.SyntaxKind.PlusPlusToken,
  ts.SyntaxKind.MinusMinusToken,
  ts.SyntaxKind.ThisKeyword,
  ts.SyntaxKind.SuperKeyword,
  ts.SyntaxKind.TrueKeyword,
  ts.SyntaxKind.FalseKeyword,
  ts.SyntaxKind.NullKeyword,
]);

/**
 * Where each comment of `text` starts and ends, read by TypeScript's scanner: past every string, template and pattern, so what one holds
 * is never taken for a comment. A `}` that closes a template's `${` is read again as the template's next part, and a `/` where no value
 * stands before it as a pattern. JSX text is scanned as code, so a `//` written in it reads as a comment to the end of its line.
 */
export function commentRanges(text: string): Array<{ from: number; to: number }> {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, text);
  const ranges: Array<{ from: number; to: number }> = [];
  const opened: boolean[] = [];
  let before: ts.SyntaxKind = ts.SyntaxKind.Unknown;
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (kind === ts.SyntaxKind.SingleLineCommentTrivia || kind === ts.SyntaxKind.MultiLineCommentTrivia) {
      ranges.push({ from: scanner.getTokenStart(), to: scanner.getTokenEnd() });
      continue;
    }
    if (kind === ts.SyntaxKind.WhitespaceTrivia || kind === ts.SyntaxKind.NewLineTrivia || kind === ts.SyntaxKind.ShebangTrivia) continue;
    if ((kind === ts.SyntaxKind.SlashToken || kind === ts.SyntaxKind.SlashEqualsToken) && !ENDS_VALUE.has(before))
      kind = scanner.reScanSlashToken();
    else if (kind === ts.SyntaxKind.OpenBraceToken) opened.push(false);
    else if (kind === ts.SyntaxKind.TemplateHead) opened.push(true);
    else if (kind === ts.SyntaxKind.CloseBraceToken && opened.pop()) {
      kind = scanner.reScanTemplateToken(false);
      if (kind === ts.SyntaxKind.TemplateMiddle) opened.push(true);
    }
    before = kind;
  }
  return ranges;
}

/** `text` with every comment blanked, each of its characters a space but its line breaks, so line numbers and columns still count. */
export const withoutComments = (text: string): string => {
  let out = '';
  let at = 0;
  for (const { from, to } of commentRanges(text)) {
    out += text.slice(at, from) + text.slice(from, to).replace(/[^\r\n]/g, ' ');
    at = to;
  }
  return out + text.slice(at);
};

/** A module a file names, and whether the import is erased: `import type`, `export type`, or braces of `type` names only. */
export type Import = { spec: string; typeOnly: boolean };

/** Every module a piece of source names outside its comments, and whether each import is erased. */
export function importsIn(text: string): Import[] {
  const code = withoutComments(text);
  const out: Import[] = [];
  for (const m of code.matchAll(/^\s*(?:import|export)\s+(type\s+)?([^'"`;]*?)\s*\bfrom\s*['"]([^'"]+)['"]/gm)) {
    const braces = /^\{([\s\S]*)\}$/.exec((m[2] ?? '').trim());
    const members = braces
      ? (braces[1] ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    out.push({ spec: m[3] ?? '', typeOnly: Boolean(m[1]) || (members.length > 0 && members.every((s) => /^type\s/.test(s))) });
  }
  for (const m of code.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) out.push({ spec: m[1] ?? '', typeOnly: false });
  for (const m of code.matchAll(/\bimport\s*\(\s*['"`]([^'"`]+)['"`]/g)) out.push({ spec: m[1] ?? '', typeOnly: false });
  return out;
}

/** A call that names a module by its first argument: a dynamic import, a `require`, and the two resolvers. */
export type Call = 'import' | 'require' | 'import.meta.resolve' | 'require.resolve';

/** How `specifiersIn` reads: the calls it counts as naming a module, and whether such a call must close on its one argument. */
export type Reading = { calls?: readonly Call[]; closed?: boolean };

const ALL_CALLS: readonly Call[] = ['import', 'require', 'import.meta.resolve', 'require.resolve'];

/**
 * Every module a piece of source names, once each and sorted: imports and re-exports, type-only included, a bare `import 'x'`, and
 * each call of `calls` (every one by default). With `closed`, a call counts only when its argument is the whole of it (`import('x')`,
 * never `import('x' + y)`). Comments are read as code: blank them first with `withoutComments` where prose must not count.
 */
export function specifiersIn(text: string, { calls = ALL_CALLS, closed = false }: Reading = {}): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/gm)) found.add(m[1] ?? '');
  for (const m of text.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) found.add(m[1] ?? '');
  if (calls.length > 0) {
    const names = calls.map((call) => call.replaceAll('.', '\\.')).join('|');
    const call = new RegExp(`\\b(?:${names})\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]${closed ? '\\s*\\)' : ''}`, 'g');
    for (const m of text.matchAll(call)) found.add(m[1] ?? '');
  }
  return [...found].sort();
}

/** The path a relative specifier in `file` names, from the same place `file` is named from; undefined for a package or a builtin. */
export const resolved = (file: string, spec: string): string | undefined =>
  spec.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)) : undefined;
