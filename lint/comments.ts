/**
 * The oxlint plugin `comments`: the rules that keep a comment to a JSDoc contract.
 *
 * `.oxlintrc.json` loads it and switches its rules on package by package, in the override blocks that name them; the runtime's
 * block also covers this folder. `packages/agent-orchestrator/test/comments.test.ts` runs oxlint on fixtures that each rule refuses.
 */
import type { RuleTester } from 'oxlint/plugins-dev';

type Rule = Extract<Parameters<RuleTester['run']>[1], { create: unknown }>;
type Context = Parameters<Rule['create']>[0];
type Comment = ReturnType<Context['sourceCode']['getAllComments']>[number];
type Node = NonNullable<ReturnType<Context['sourceCode']['getNodeByRangeIndex']>>;

/** A lint or TypeScript directive, the one kind of `//` or `/* *\/` comment code keeps. */
const DIRECTIVE = /^\s*(?:(?:oxlint|eslint)-(?:disable|enable)\S*|@ts-expect-error)(?:\s|$)/;

/** The reason a directive keeps after it: ` -- ` and at least a word. */
const REASON = /\s--\s+\S/;

/**
 * A TypeScript directive that is never allowed: it hides every error of a line or a file, where `@ts-expect-error` fails once none is left.
 */
const SILENCER = /^\s*@ts-(?:ignore|nocheck)\b/;

/** The nodes a JSDoc documents: a declaration or a member, found at the token that follows the comment. */
const DOCUMENTED = new Set([
  'ExportNamedDeclaration',
  'ExportDefaultDeclaration',
  'FunctionDeclaration',
  'TSDeclareFunction',
  'ClassDeclaration',
  'VariableDeclaration',
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
  'TSEnumDeclaration',
  'TSEnumMember',
  'TSModuleDeclaration',
  'TSGlobalDeclaration',
  'MethodDefinition',
  'PropertyDefinition',
  'AccessorProperty',
  'TSAbstractMethodDefinition',
  'TSAbstractPropertyDefinition',
  'TSPropertySignature',
  'TSMethodSignature',
  'TSIndexSignature',
  'TSCallSignatureDeclaration',
  'TSConstructSignatureDeclaration',
  'Property',
]);

/** The declarations that are statements: documented only where a module declares them, never inside a function's body. */
const STATEMENTS = new Set(['FunctionDeclaration', 'TSDeclareFunction', 'ClassDeclaration', 'VariableDeclaration']);

/** The parents a declaration statement has at a module's top level. */
const MODULE_LEVEL = new Set(['Program', 'ExportNamedDeclaration', 'ExportDefaultDeclaration', 'TSModuleBlock']);

/** Whether `comment` is a JSDoc: `/**` and at least one character before `*\/`. */
const isJSDoc = (comment: Comment): boolean => comment.type === 'Block' && comment.value.startsWith('*') && comment.value !== '*';

/** Whether a JSDoc sits where one documents something: at the head of the file, or on a declaration or a member. */
function isPlaced(context: Context, comment: Comment): boolean {
  const { sourceCode } = context;
  if (!sourceCode.getTokenBefore(comment)) return true;
  const token = sourceCode.getTokenAfter(comment);
  if (!token) return false;
  let node: Node | null = sourceCode.getNodeByRangeIndex(token.range[0]);
  while (node && !DOCUMENTED.has(node.type)) node = node.parent?.range[0] === token.range[0] ? node.parent : null;
  if (!node) return false;
  return !STATEMENTS.has(node.type) || MODULE_LEVEL.has(node.parent?.type ?? 'Program');
}

/** A comment's words on one line: a JSDoc's leading `*` taken off each line, and every run of white space made one space. */
const prose = (comment: Comment): string => comment.value.replace(/\n\s*\*?/g, ' ').replace(/\s+/g, ' ');

/** The words that date a comment or tie it to a run's history, each with what it matched. */
const HISTORY: { pattern: RegExp; what: string }[] = [
  { pattern: /\b\d{4}-\d{2}-\d{2}\b/i, what: 'a date' },
  { pattern: /\bstage \d+[a-z]?\b/i, what: 'a stage' },
  { pattern: /\bpart \d+[a-z]?\b/i, what: 'a part' },
  { pattern: /(?<!\b(?:a|an|the|this|that|each|every|one|its|their|whose)\s)\bcard \d+[a-z]?\b/i, what: 'a card' },
  { pattern: /\bround \d+[a-z]\b|\b(?:stage|part|card) \d+[a-z]?,? round \d+\b|\bround \d+,? (?:stage|part|card) \d+\b/i, what: 'a round' },
  { pattern: /\blearned by\b/i, what: 'how it was learned' },
];

/** The words that defer a fix in a comment: a temporary remedy, or a verb that leaves something undone beside a promise of later. */
const DEFERRAL: RegExp[] = [
  /\btemporary (?:fix|patch|measure|workaround|hack|solution)\b/i,
  /\b(?:leave|leaves|left|keep|keeps|kept|skip|skips|skipped|ignore|ignores|ignored|disable|disables|disabled|defer|defers|deferred|stub|stubs|stubbed|hardcode|hardcodes|hardcoded|allow|allows|allowed|off|until)\b(?:\W+\w+){0,4}?\W+for now\b/i,
  /\bfor now\b(?:\W+\w+){0,4}?\W+(?:leave|leaves|left|keep|keeps|kept|skip|skips|skipped|ignore|ignores|ignored|disable|disables|disabled|defer|defers|deferred|stub|stubs|stubbed|hardcode|hardcodes|hardcoded|until)\b/i,
];

/**
 * `//` and `/* *\/` refused, JSX's `{/* *\/}` included, but a directive with a reason; a JSDoc only on a file's head, a declaration or a
 * member.
 */
const noCodeComments: Rule = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Code reads by itself: no comment but a lint directive, and a JSDoc only on a declaration.' },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.type === 'Shebang') continue;
          if (SILENCER.test(comment.value)) {
            context.report({
              loc: comment.loc,
              message: 'A `@ts-ignore` or `@ts-nocheck` hides every error it covers: fix the type, or use `@ts-expect-error -- <reason>`.',
            });
          } else if (DIRECTIVE.test(comment.value)) {
            if (!REASON.test(comment.value))
              context.report({ loc: comment.loc, message: 'A directive says why beside it: add ` -- <reason>` after the rule it names.' });
          } else if (isJSDoc(comment)) {
            if (!isPlaced(context, comment))
              context.report({
                loc: comment.loc,
                message:
                  'A JSDoc documents a file or a declaration, and this one documents a statement: make the code say it, or move the why into a test or CLAUDE.md.',
              });
          } else {
            context.report({
              loc: comment.loc,
              message:
                'Code reads by itself: make the code say this, put a contract in the JSDoc of the declaration, or move the why into a test or CLAUDE.md.',
            });
          }
        }
      },
    };
  },
};

/** In every comment, JSDoc included: a date, a stage, a part, a card, a round of a run's history, or how something was learned. */
const noHistoryInComments: Rule = {
  meta: {
    type: 'suggestion',
    docs: { description: 'A comment says what the code is, never its history: that lives in git, CLAUDE.md and the tests.' },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          for (const { pattern, what } of HISTORY) {
            const found = pattern.exec(prose(comment));
            if (found)
              context.report({
                loc: comment.loc,
                message: `This comment names ${what}, \`${found[0]}\`: history lives in git, CLAUDE.md and the tests; say what the code is.`,
              });
          }
        }
      },
    };
  },
};

/**
 * The widest a line that holds any part of a comment may be, in code points: oxfmt's print width, which rewraps no comment.
 * `packages/agent-orchestrator/test/comments.test.ts` holds it equal to the width oxfmt is configured with.
 */
export const COMMENT_WIDTH = 140;

/** Each line that holds any part of a comment, measured whole in code points, indentation and code before the comment included. */
const noWideCommentLines: Rule = {
  meta: {
    type: 'suggestion',
    docs: { description: "A line that holds a comment is no wider than oxfmt's print width, which rewraps no comment." },
  },
  create(context) {
    return {
      Program() {
        const { sourceCode } = context;
        const reported = new Set<number>();
        for (const comment of sourceCode.getAllComments()) {
          for (let line = comment.loc.start.line; line <= comment.loc.end.line; line += 1) {
            if (reported.has(line)) continue;
            reported.add(line);
            const width = Array.from(sourceCode.lines[line - 1] ?? '').length;
            if (width <= COMMENT_WIDTH) continue;
            context.report({
              loc: { start: { line, column: 0 } },
              message: `This line holds a comment and is ${width} columns, over ${COMMENT_WIDTH}: rewrap the comment by hand, since oxfmt rewraps none.`,
            });
          }
        }
      },
    };
  },
};

/** In every comment, JSDoc included: a temporary remedy, or a thing left undone until later. */
const noDeferralInComments: Rule = {
  meta: {
    type: 'suggestion',
    docs: { description: 'A comment never defers a fix: fix it, or file the work.' },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const found = DEFERRAL.map((pattern) => pattern.exec(prose(comment))).find((match) => match !== null);
          if (found)
            context.report({
              loc: comment.loc,
              message: `This comment defers a fix, \`${found[0]}\`: a comment is never evidence that a problem is settled; fix it, or file the work.`,
            });
        }
      },
    };
  },
};

export const rules = {
  'no-code-comments': noCodeComments,
  'no-history-in-comments': noHistoryInComments,
  'no-deferral-in-comments': noDeferralInComments,
  'no-wide-comment-lines': noWideCommentLines,
};

export default { meta: { name: 'comments' }, rules };
