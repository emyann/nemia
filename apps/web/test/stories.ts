/**
 * The rules the board's stories are held to, as pure functions over file lists and sources, which `stories.test.ts` runs on fixtures
 * and on the tree against the baseline, `test/baseline/`: a component or page body with no story beside it (`storyless`), a story
 * given no args (`argless`), a title outside the board's categories (`offCategory`), an import of a second component system
 * (`secondSystem`), a control drawn by hand (`handDrawn`), a story whose axe only warns (`a11yTodos`), a play that reads a part visible
 * the moment it is found (`seenOnceFound`), and where the map of destinations (`destinations.ts`) falls short of what the board takes
 * (`mapGaps`).
 * Paths are from the workspace root.
 */
import path from 'node:path';
import ts from 'typescript';
import type { MapGaps } from '../contracts/destinations.contract.ts';
import type * as Classes from '../src/lib/classes.ts';
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

/** One story of a module: its export's name, whether it or its meta gives args, and whether its axe only warns. */
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

/** Whether `object` sets its a11y test to the word that only warns, under `parameters`. */
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
 * Each story of `module` whose axe only warns, by its file and name (`<file>#<Story>`).
 * @param file The story file, from the workspace root.
 * @param module What `storyModuleOf` read of it.
 */
export const a11yTodos = (file: string, module: StoryModule): string[] =>
  module.stories.filter((story) => story.todo).map((story) => `${file}#${story.name}`);

/** The board's source folder, from the workspace root. */
const SRC = 'apps/web/src';

/** Whether `file` may draw with React Aria and shadcn's parts: the kit and shadcn's own `ui/`, the vendored `ai-elements/`, the look. */
const ofAnotherSystem = (file: string): boolean => /^apps\/web\/src\/components\/(ui|ai-elements|look)\//.test(file);

/** One name a file takes from a second component system: the module by its canonical spelling, and the name it exports. */
export type Taken = { module: string; name: string };

/**
 * The module `spec` names, spelled as the map keys it: `@/components/ui/<part>` for a file of shadcn's `ui/` (anything there but the
 * kit), `@/lib/classes` for the shared class strings, `react-aria-components` (or one of its subpaths) as written; null for any other.
 */
const canonicalOf = (file: string, spec: string): string | null => {
  if (spec === 'react-aria-components' || spec.startsWith('react-aria-components/')) return spec;
  const at = spec.startsWith('@/')
    ? path.posix.join(SRC, spec.slice(2))
    : spec.startsWith('.')
      ? path.posix.join(path.posix.dirname(file), spec)
      : null;
  if (at === null) return null;
  const bare = at.replace(/\.tsx?$/, '').replace(/\/index$/, '');
  if (bare === `${SRC}/lib/classes`) return '@/lib/classes';
  if (bare.startsWith(`${SRC}/components/ui/`) && !/^apps\/web\/src\/components\/ui\/ds(\/|$)/.test(bare))
    return `@/${bare.slice(SRC.length + 1)}`;
  return null;
};

/**
 * Each module `source` imports, by its specifier, with the names it takes from it: a named import by the name the module exports (an
 * alias read as the name it renames), a default as `default`, and a namespace, a bare or a dynamic import as `*`. `import type` and
 * `export … from` count as imports.
 */
const importedNames = (source: string): { spec: string; names: string[] }[] => {
  const file = ts.createSourceFile('x.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: { spec: string; names: string[] }[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const names: string[] = [];
      if (!clause) names.push('*');
      else {
        if (clause.name) names.push('default');
        const bindings = clause.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) names.push('*');
        if (bindings && ts.isNamedImports(bindings)) for (const one of bindings.elements) names.push((one.propertyName ?? one.name).text);
      }
      found.push({ spec: node.moduleSpecifier.text, names });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.exportClause;
      const names = clause && ts.isNamedExports(clause) ? clause.elements.map((one) => (one.propertyName ?? one.name).text) : ['*'];
      found.push({ spec: node.moduleSpecifier.text, names });
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      found.push({ spec: node.arguments[0].text, names: ['*'] });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
};

/**
 * Each name `file`'s source takes from a second component system: React Aria's components, or a part of shadcn's `components/ui/`
 * (anything there but the ds kit), each module by its canonical spelling (`@/components/ui/<part>` however the file spelled it), once
 * each. None for a file of the kit, shadcn's own `ui/`, `ai-elements/` or the look, which may. It reads static and dynamic imports
 * and re-exports alone: a part reached through a barrel of the board's own escapes it, and none exists.
 * @param file The file, from the workspace root.
 * @param source Its text.
 */
export const secondSystem = (file: string, source: string): Taken[] => {
  if (!file.startsWith(`${SRC}/`) || ofAnotherSystem(file)) return [];
  const keys = new Set<string>();
  const taken: Taken[] = [];
  for (const { spec, names } of importedNames(source)) {
    const module = canonicalOf(file, spec);
    if (module === null || module === '@/lib/classes') continue;
    for (const name of names) {
      if (keys.has(`${module}:${name}`)) continue;
      keys.add(`${module}:${name}`);
      taken.push({ module, name });
    }
  }
  return taken;
};

/** The elements a control drawn by hand is: each is the kit's to draw. */
export const CONTROL_ELEMENTS = ['button', 'input', 'select', 'textarea'] as const;

/** The class strings of `lib/classes.ts` that draw a control by hand; `FLOOR_BOX`, a canvas's frame, is none. */
export const CONTROL_STRINGS: readonly (keyof typeof Classes)[] = [
  'BUTTON',
  'BUTTON_SECONDARY',
  'BUTTON_OUTLINED',
  'BUTTON_SMALL',
  'TEXTAREA',
  'POPOVER',
];

/** The input kinds the kit draws with a part of their own, each keyed apart from the other inputs. */
const INPUT_KINDS = ['checkbox', 'radio'];

/**
 * ` type="<kind>"` where `element` sets its `type` to a literal of `INPUT_KINDS`, else nothing: a spread or another type is a plain
 * input.
 */
const typeOf = (element: ts.JsxOpeningElement | ts.JsxSelfClosingElement): string => {
  for (const one of element.attributes.properties) {
    if (!ts.isJsxAttribute(one) || !ts.isIdentifier(one.name) || one.name.text !== 'type') continue;
    const at = one.initializer;
    const value =
      at && ts.isStringLiteral(at)
        ? at.text
        : at && ts.isJsxExpression(at) && at.expression && ts.isStringLiteralLike(at.expression)
          ? at.expression.text
          : null;
    return value !== null && INPUT_KINDS.includes(value) ? ` type="${value}"` : '';
  }
  return '';
};

/**
 * Each control `file`'s source draws by hand, once each: a JSX element of `CONTROL_ELEMENTS` (`<button>`), an input whose literal
 * `type` is a checkbox or a radio keyed by it (`<input type="radio">`), since the kit draws each with its own part, and a class string of
 * `CONTROL_STRINGS` it imports (`@/lib/classes:BUTTON`). None for a file of the kit, shadcn's own `ui/`, `ai-elements/` or the look.
 * It reads JSX tags and static imports alone: a control made by `createElement`, or a tag held in a variable, escapes it, and none
 * exists.
 * @param file The file, from the workspace root.
 * @param source Its text.
 */
export const handDrawn = (file: string, source: string): string[] => {
  if (!file.startsWith(`${SRC}/`) || ofAnotherSystem(file)) return [];
  const found = new Set<string>();
  const tree = ts.createSourceFile('x.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const controls: readonly string[] = CONTROL_ELEMENTS;
  const visit = (node: ts.Node): void => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      ts.isIdentifier(node.tagName) &&
      controls.includes(node.tagName.text)
    )
      found.add(`<${node.tagName.text}${node.tagName.text === 'input' ? typeOf(node) : ''}>`);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  const strings: readonly string[] = CONTROL_STRINGS;
  for (const { spec, names } of importedNames(source))
    if (canonicalOf(file, spec) === '@/lib/classes')
      for (const name of names) if (strings.includes(name)) found.add(`@/lib/classes:${name}`);
  return [...found];
};

/**
 * What the map of destinations lacks and holds past its use: each key the board takes that it gives no destination (`unmapped`), and
 * each key it gives a destination that nothing takes (`unused`), once each.
 * @param taken Each key a file of the board takes, once each.
 * @param mapped Each key the map gives a destination, once each.
 */
export const mapGaps: MapGaps = (taken, mapped) => ({
  unmapped: taken.filter((key) => !mapped.includes(key)),
  unused: mapped.filter((key) => !taken.includes(key)),
});

/**
 * The line of each `expect(await <…>.findBy…(…)).toBeVisible()` in `source`, `not` or not: a find answers once the part is in the
 * page, which may be before it shows (a popover entering, a list behind its own read), so a play waits for what it sees,
 * `waitFor(() => expect(<…>.getBy…(…)).toBeVisible())`.
 * @param source A story module's text.
 */
export const seenOnceFound = (source: string): number[] => {
  const tree = ts.createSourceFile('x.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines: number[] = [];
  const found = (node: ts.Expression): boolean =>
    ts.isAwaitExpression(node) &&
    ts.isCallExpression(node.expression) &&
    /^findBy|^findAllBy/.test(
      ts.isPropertyAccessExpression(node.expression.expression)
        ? node.expression.expression.name.text
        : ts.isIdentifier(node.expression.expression)
          ? node.expression.expression.text
          : '',
    );
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'toBeVisible') {
      let on: ts.Expression = node.expression.expression;
      if (ts.isPropertyAccessExpression(on) && on.name.text === 'not') on = on.expression;
      if (
        ts.isCallExpression(on) &&
        ts.isIdentifier(on.expression) &&
        on.expression.text === 'expect' &&
        on.arguments[0] &&
        found(on.arguments[0])
      )
        lines.push(tree.getLineAndCharacterOfPosition(node.getStart()).line + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return lines;
};
