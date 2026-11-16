/**
 * The rules the board's stories are held to, as pure functions over file lists and sources, which `stories.test.ts` runs on fixtures
 * and on the tree against `stories.baseline.ts`: a component or page body with no story beside it (`storyless`), a story given no args
 * (`argless`), a title outside the board's categories (`offCategory`), an import of a second component system (`secondSystem`) and a
 * story whose axe is `todo` (`a11yTodos`). Paths are from the workspace root.
 */
import path from 'node:path';
import ts from 'typescript';
import { importsIn } from 'test-kit/imports';
import { owesAStory } from './e2e/stories/touched.ts';

/** The categories a story's title opens with: the look, the frame, the store's level, a factory's, a run's, and a page body. */
export const CATEGORIES = ['Look/', 'Frame/', 'Store/', 'Factory/', 'Run/', 'Pages/'] as const;

/**
 * Every file among `files` that owes a story (`owesAStory`) and has no `<Part>.stories.tsx` beside it.
 * @param files Every file of the board, by its path from the workspace root.
 */
export const storyless = (files: readonly string[]): string[] => {
  const all = new Set(files);
  return files.filter((file) => owesAStory(file) && !all.has(file.replace(/\.tsx$/, '.stories.tsx')));
};

/** One story of a module: its export's name, whether it or its meta gives args, and whether its axe is `todo`. */
export type StoryFact = { name: string; args: boolean; todo: boolean };

/** A story module as the rules read it: its meta's title, none where it has none, and each story it exports. */
export type StoryModule = { title: string | null; stories: StoryFact[] };

/** The object literal `node` is, under any `satisfies`, `as` or parentheses, or undefined for anything else. */
const objectOf = (node: ts.Expression | undefined): ts.ObjectLiteralExpression | undefined => {
  let at = node;
  while (at && (ts.isSatisfiesExpression(at) || ts.isAsExpression(at) || ts.isParenthesizedExpression(at))) at = at.expression;
  return at && ts.isObjectLiteralExpression(at) ? at : undefined;
};

/** The property `name` of `object`, written as a key with a value. */
const propertyOf = (object: ts.ObjectLiteralExpression | undefined, name: string): ts.Expression | undefined => {
  for (const one of object?.properties ?? [])
    if (ts.isPropertyAssignment(one) && (ts.isIdentifier(one.name) || ts.isStringLiteral(one.name)) && one.name.text === name)
      return one.initializer;
  return undefined;
};

/** Whether `object` says `parameters: { a11y: { test: 'todo' } }`. */
const todoIn = (object: ts.ObjectLiteralExpression | undefined): boolean => {
  const test = propertyOf(objectOf(propertyOf(objectOf(propertyOf(object, 'parameters')), 'a11y')), 'test');
  return test !== undefined && ts.isStringLiteral(test) && test.text === 'todo';
};

/**
 * The meta and the stories of a story module's source: the default export's title, args and axe, and each exported `const`.
 * @param source The story module's text.
 */
export const storyModuleOf = (source: string): StoryModule => {
  const file = ts.createSourceFile('story.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const consts = new Map<string, ts.ObjectLiteralExpression | undefined>();
  const exported: string[] = [];
  let meta: ts.ObjectLiteralExpression | undefined;
  let metaName: string | undefined;
  for (const statement of file.statements) {
    if (ts.isVariableStatement(statement)) {
      const isExported = statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        consts.set(declaration.name.text, objectOf(declaration.initializer));
        if (isExported) exported.push(declaration.name.text);
      }
    } else if (ts.isExportAssignment(statement)) {
      if (ts.isIdentifier(statement.expression)) metaName = statement.expression.text;
      else meta = objectOf(statement.expression);
    }
  }
  if (metaName !== undefined) meta = consts.get(metaName);
  const title = propertyOf(meta, 'title');
  const metaArgs = propertyOf(meta, 'args') !== undefined;
  const metaTodo = todoIn(meta);
  return {
    title: title && ts.isStringLiteralLike(title) ? title.text : null,
    stories: exported.map((name) => {
      const story = consts.get(name);
      return { name, args: metaArgs || propertyOf(story, 'args') !== undefined, todo: metaTodo || todoIn(story) };
    }),
  };
};

/**
 * Each story of `module` given no args, by its file and name (`<file>#<Story>`).
 * @param file The story file, from the workspace root.
 * @param module What `storyModuleOf` read of it.
 */
export const argless = (file: string, module: StoryModule): string[] =>
  module.stories.filter((story) => !story.args).map((story) => `${file}#${story.name}`);

/**
 * Whether `module`'s title opens with none of `CATEGORIES`, or it has none.
 * @param module What `storyModuleOf` read of a story file.
 */
export const offCategory = (module: StoryModule): boolean =>
  module.title === null || !CATEGORIES.some((category) => module.title?.startsWith(category));

/**
 * Each story of `module` whose axe is `todo`, by its file and name (`<file>#<Story>`).
 * @param file The story file, from the workspace root.
 * @param module What `storyModuleOf` read of it.
 */
export const a11yTodos = (file: string, module: StoryModule): string[] =>
  module.stories.filter((story) => story.todo).map((story) => `${file}#${story.name}`);

/** The board's source folder, from the workspace root. */
const SRC = 'apps/web/src';

/** Whether `file` may draw with React Aria and shadcn's parts: the kit and shadcn's own `ui/`, the vendored `ai-elements/`, the look. */
const ofAnotherSystem = (file: string): boolean => /^apps\/web\/src\/components\/(ui|ai-elements|look)\//.test(file);

/**
 * The modules of a second component system `file`'s source imports: React Aria's components, or a part of shadcn's `components/ui/`
 * (anything there but the ds kit), by the module as it is written. None for a file of the kit, shadcn's own `ui/`, `ai-elements/` or
 * the look, which may.
 * @param file The file, from the workspace root.
 * @param source Its text.
 */
export const secondSystem = (file: string, source: string): string[] => {
  if (!file.startsWith(`${SRC}/`) || ofAnotherSystem(file)) return [];
  return importsIn(source)
    .map((one) => one.spec)
    .filter((spec) => {
      if (spec === 'react-aria-components' || spec.startsWith('react-aria-components/')) return true;
      const at = spec.startsWith('@/')
        ? path.posix.join(SRC, spec.slice(2))
        : spec.startsWith('.')
          ? path.posix.join(path.posix.dirname(file), spec)
          : null;
      return at !== null && at.startsWith(`${SRC}/components/ui/`) && !/^apps\/web\/src\/components\/ui\/ds(\/|$)/.test(at);
    });
};
