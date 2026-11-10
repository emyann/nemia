/**
 * The names a piece of TypeScript has, read by TypeScript's own parser: what a doc or a comment may cite in backticks. The guards' comments
 * test and the docs' names test read the code through it, so a name one counts the other counts too.
 */
import ts from 'typescript';

/**
 * Every name `source` has, added to `into`: its identifiers, private and JSX names included (`#` dropped), and for each string, template
 * part and JSX text its whole text, every word of it, and each part of a hyphened word.
 */
export const namesOf = (source: ts.SourceFile, into: Set<string> = new Set()): Set<string> => {
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) into.add(node.text.replace(/^#/, ''));
    else if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node) || ts.isJsxText(node)) {
      into.add(node.text);
      for (const word of node.text.match(/[A-Za-z_$][\w$-]*/g) ?? []) for (const part of [word, ...word.split('-')]) into.add(part);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return into;
};
