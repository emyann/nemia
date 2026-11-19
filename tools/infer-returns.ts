/**
 * A session's sweep, run once and deleted in the run that added it: it takes the declared return type off every function with a
 * body, as `landmines-types/no-explicit-return-types` asks, and pins at the value what inference loses.
 *
 * `node tools/infer-returns.ts sweep <record.json> <tsconfig,…|-> <folder>…` edits every git-listed `.ts`/`.tsx` file under the
 * folders, outside oxlint's `ignorePatterns`. It leaves a type predicate, `asserts`, `never`, and a function under a disable of the
 * rule. It builds each tsconfig's program with the edits in memory, and where inference loses what the declared type held it pins
 * the value: `satisfies <declared>` at each return (or yield) where the inferred type is not assignable to the declared one or the
 * body lost its contextual types, `satisfies <declared> as <declared>` where a caller reads the declared type, and the type kept
 * under a disable where the function returns its own call. It drops each import the removal left unnamed.
 * `node tools/infer-returns.ts anys <record.json> <tsconfig>…` prints each stripped function whose inferred type holds an `any`.
 */
/* oxlint-disable complexity, sonarjs/cognitive-complexity, max-lines-per-function, no-unused-expressions,
   typescript/no-unnecessary-type-assertion, typescript/unbound-method -- a tool run once and deleted in the same run */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const RULE = 'landmines-types/no-explicit-return-types';
const IGNORED = ['apps/web/src/components/ui/ds/', 'apps/web/.claude/', 'apps/web/src/routeTree.gen.ts', 'apps/web/.storybook/public/'];

type Stripped = { file: string; ordinal: number; name: string; declared: string };

const isFunctionWithBody = (node: ts.Node) =>
  (ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node)) &&
  node.body !== undefined;

const functionsOf = (source: ts.SourceFile) => {
  const found: ts.SignatureDeclaration[] = [];
  const visit = (node: ts.Node) => {
    if (isFunctionWithBody(node)) found.push(node as ts.SignatureDeclaration);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
};

const nameOf = (node: ts.SignatureDeclaration) => {
  if (node.name !== undefined) return node.name.getText();
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) return parent.name.getText();
  return '<anonymous>';
};

const exempt = (node: ts.SignatureDeclaration, source: ts.SourceFile, lines: string[]) => {
  const type = node.type;
  if (type === undefined) return true;
  if (ts.isTypePredicateNode(type) || type.kind === ts.SyntaxKind.NeverKeyword) return true;
  const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line;
  const typeLine = source.getLineAndCharacterOfPosition(type.getStart(source)).line;
  return [line, typeLine].some((at) => at > 0 && (lines[at - 1] ?? '').includes(RULE) && lines[at - 1]!.includes('disable'));
};

const identifierCounts = (source: ts.SourceFile) => {
  const counts = new Map<string, number>();
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) return;
    if (ts.isIdentifier(node)) counts.set(node.text, (counts.get(node.text) ?? 0) + 1);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return counts;
};

const kindOf = (file: string) => (file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

const parse = (file: string, text: string) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kindOf(file));

type Edit = { start: number; end: number; text: string };

const apply = (text: string, edits: Edit[]) =>
  [...edits].sort((a, b) => b.start - a.start).reduce((at, edit) => at.slice(0, edit.start) + edit.text + at.slice(edit.end), text);

const closeParenOf = (node: ts.SignatureDeclaration, source: ts.SourceFile) =>
  node.getChildren(source).find((child) => child.kind === ts.SyntaxKind.CloseParenToken);

const unusedImportEdits = (before: ts.SourceFile, after: ts.SourceFile) => {
  const was = identifierCounts(before);
  const now = identifierCounts(after);
  const gone = (name: string) => (was.get(name) ?? 0) > 0 && (now.get(name) ?? 0) === 0;
  const edits: Edit[] = [];
  for (const statement of after.statements) {
    if (!ts.isImportDeclaration(statement) || statement.importClause === undefined) continue;
    const clause = statement.importClause;
    const bindings = clause.namedBindings;
    const named = bindings !== undefined && ts.isNamedImports(bindings) ? [...bindings.elements] : [];
    const dropped = named.filter((element) => gone(element.name.text));
    const defaultGone = clause.name !== undefined && gone(clause.name.text);
    const namespaceGone = bindings !== undefined && ts.isNamespaceImport(bindings) && gone(bindings.name.text);
    if (dropped.length === 0 && !defaultGone && !namespaceGone) continue;
    const keepsDefault = clause.name !== undefined && !defaultGone;
    const keptNamed = named.filter((element) => !dropped.includes(element));
    const keepsNamespace = bindings !== undefined && ts.isNamespaceImport(bindings) && !namespaceGone;
    if (!keepsDefault && keptNamed.length === 0 && !keepsNamespace) {
      let end = statement.getEnd();
      if (after.text[end] === '\n') end += 1;
      edits.push({ start: statement.getStart(after), end, text: '' });
      continue;
    }
    const parts: string[] = [];
    if (keepsDefault) parts.push(clause.name!.text);
    if (keepsNamespace) parts.push(bindings.getText(after));
    if (keptNamed.length > 0) parts.push(`{ ${keptNamed.map((element) => element.getText(after)).join(', ')} }`);
    const typePrefix = clause.isTypeOnly ? 'type ' : '';
    edits.push({ start: clause.getStart(after), end: clause.getEnd(), text: `${typePrefix}${parts.join(', ')}` });
  }
  return edits;
};

const filesUnder = (folders: string[]) =>
  execFileSync('git', ['ls-files', '--', ...folders], { encoding: 'utf8' })
    .split('\n')
    .filter((file) => /\.tsx?$/.test(file) && !file.endsWith('.d.ts') && !IGNORED.some((ignored) => file.startsWith(ignored)));

type Mark = 'satisfies' | 'upcast' | 'keep';

const returnsOf = (node: ts.SignatureDeclaration) => {
  const body = (node as ts.FunctionLikeDeclaration).body;
  if (body === undefined) return [];
  if (!ts.isBlock(body)) return [body as ts.Expression];
  const found: ts.Expression[] = [];
  const visit = (child: ts.Node) => {
    if (isFunctionWithBody(child) || ts.isClassLike(child)) return;
    if (ts.isReturnStatement(child) && child.expression !== undefined) found.push(child.expression);
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(body, visit);
  return found;
};

const yieldsOf = (node: ts.SignatureDeclaration) => {
  const found: ts.Expression[] = [];
  const visit = (child: ts.Node) => {
    if (isFunctionWithBody(child) || ts.isClassLike(child)) return;
    if (ts.isYieldExpression(child) && child.asteriskToken === undefined && child.expression !== undefined) found.push(child.expression);
    ts.forEachChild(child, visit);
  };
  const body = (node as ts.FunctionLikeDeclaration).body;
  if (body !== undefined) ts.forEachChild(body, visit);
  return found;
};

const GENERATORS = new Set(['Generator', 'AsyncGenerator', 'IterableIterator', 'AsyncIterableIterator', 'Iterable', 'AsyncIterable']);

const yieldedType = (node: ts.SignatureDeclaration, source: ts.SourceFile) => {
  const type = node.type!;
  if (!ts.isTypeReferenceNode(type) || !GENERATORS.has(type.typeName.getText(source))) return undefined;
  return type.typeArguments?.[0]?.getText(source);
};

const isAsync = (node: ts.SignatureDeclaration) => (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Async) !== 0;

const isGenerator = (node: ts.SignatureDeclaration) => (node as ts.FunctionLikeDeclaration).asteriskToken !== undefined;

const satisfiedType = (node: ts.SignatureDeclaration, source: ts.SourceFile) => {
  const type = node.type!;
  if (isAsync(node) && ts.isTypeReferenceNode(type) && type.typeName.getText(source) === 'Promise' && type.typeArguments?.length === 1)
    return type.typeArguments[0]!.getText(source);
  return type.getText(source);
};

const lineStartOf = (text: string, at: number) => text.lastIndexOf('\n', at - 1) + 1;

const KEEP = `// oxlint-disable-next-line ${RULE} -- it returns its own call, whose type inference cannot give`;

const edit = (file: string, text: string, marks: Map<number, Mark>, aliases: boolean) => {
  const source = parse(file, text);
  const lines = text.split('\n');
  const edits: Edit[] = [];
  const stripped: Stripped[] = [];
  const appended: string[] = [];
  functionsOf(source).forEach((node, ordinal) => {
    if (exempt(node, source, lines)) return;
    const from = closeParenOf(node, source);
    if (from === undefined) throw new Error(`${file}: no closing parenthesis before the return type of ${nameOf(node)}`);
    const mark = marks.get(ordinal);
    const declared = node.type!.getText(source);
    if (mark === 'keep') {
      const at = lineStartOf(text, node.type!.getStart(source));
      const indent = /^\s*/.exec(text.slice(at))![0];
      edits.push({ start: at, end: at, text: `${indent}${KEEP}\n` });
      return;
    }
    stripped.push({ file, ordinal, name: nameOf(node), declared });
    edits.push({ start: from.getEnd(), end: node.type!.getEnd(), text: '' });
    if (mark === 'satisfies' || mark === 'upcast') {
      const yielded = isGenerator(node) ? yieldedType(node, source) : undefined;
      const type = isGenerator(node) ? yielded : satisfiedType(node, source);
      for (const value of type === undefined ? [] : isGenerator(node) ? yieldsOf(node) : returnsOf(node)) {
        const bare =
          ts.isParenthesizedExpression(value) ||
          ts.isIdentifier(value) ||
          ts.isCallExpression(value) ||
          ts.isPropertyAccessExpression(value) ||
          ts.isObjectLiteralExpression(value) ||
          ts.isArrayLiteralExpression(value);
        const start = value.getStart(source);
        if (!bare) edits.push({ start, end: start, text: '(' });
        edits.push({
          start: value.getEnd(),
          end: value.getEnd(),
          text: `${bare ? '' : ')'} satisfies ${type}${mark === 'upcast' ? ` as ${type}` : ''}`,
        });
      }
    }
    if (aliases) appended.push(`type __infer_${ordinal} = ${declared};`);
  });
  const edited = apply(text, edits);
  const final = aliases ? edited : apply(edited, unusedImportEdits(source, parse(file, edited)));
  return { text: appended.length > 0 ? `${final}\n${appended.join('\n')}\n` : final, stripped };
};

const IMPLICIT_ANY = new Set([7006, 7031, 7019, 7008, 7034, 7005]);
const NOT_INFERRED = new Set([7022, 7023, 7024]);

const hasTypeParameters = (node: ts.Node): boolean => {
  for (let at: ts.Node | undefined = node; at !== undefined; at = at.parent)
    if ((ts.isFunctionLike(at) || ts.isClassLike(at)) && (at as ts.SignatureDeclaration).typeParameters !== undefined) return true;
  return false;
};

const deepest = (source: ts.SourceFile, at: number) => {
  let node: ts.Node = source;
  for (;;) {
    const child: ts.Node | undefined = node.getChildren(source).find((each) => each.getStart(source) <= at && at < each.getEnd());
    if (child === undefined) return node;
    node = child;
  }
};

const statementOf = (node: ts.Node) => {
  let at = node;
  while (
    at.parent !== undefined &&
    !ts.isBlock(at.parent) &&
    !ts.isSourceFile(at.parent) &&
    !ts.isCaseClause(at.parent) &&
    !ts.isDefaultClause(at.parent) &&
    !ts.isClassLike(at.parent) &&
    !ts.isObjectLiteralExpression(at.parent)
  )
    at = at.parent;
  return at;
};

const build = (config: string, texts: Map<string, string>) => {
  const read = ts.readConfigFile(config, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(config));
  const options = { ...parsed.options, noEmit: true };
  const host = ts.createCompilerHost(options);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (name, version, onError, create) => {
    const text = texts.get(path.resolve(name));
    return text === undefined ? original(name, version, onError, create) : ts.createSourceFile(name, text, version, true, kindOf(name));
  };
  const hostRead = host.readFile.bind(host);
  host.readFile = (name) => texts.get(path.resolve(name)) ?? hostRead(name);
  const program = ts.createProgram({ rootNames: parsed.fileNames, options, host });
  return { program, checker: program.getTypeChecker() };
};

const rank: Record<Mark, number> = { satisfies: 1, upcast: 2, keep: 3 };

type Site = { file: string; ordinal: number; stripped: boolean };

const plan = (configs: string[], files: string[]) => {
  const marks = new Map<string, Map<number, Mark>>();
  let changed = true;
  const residue: string[] = [];
  const checked = new Set<string>();
  const equivalent = new Set<string>();
  const raise = (file: string, ordinal: number, mark: Mark) => {
    const marked = marks.get(file) ?? new Map<number, Mark>();
    const was = marked.get(ordinal);
    if (was !== undefined && rank[was] >= rank[mark]) return;
    marked.set(ordinal, mark);
    marks.set(file, marked);
    changed = true;
  };
  for (let round = 1; changed && round <= 8; round++) {
    changed = false;
    residue.length = 0;
    const texts = new Map<string, string>();
    const strippedOf = new Map<string, Set<number>>();
    for (const file of files) {
      const result = edit(file, readFileSync(file, 'utf8'), marks.get(file) ?? new Map(), round === 1);
      strippedOf.set(path.resolve(file), new Set(result.stripped.map((each) => each.ordinal)));
      if (result.text !== readFileSync(file, 'utf8')) texts.set(path.resolve(file), result.text);
    }
    for (const config of configs) {
      console.log(`  round ${round} ${config}`);
      const { program, checker } = build(config, texts);
      const ordinals = new Map<ts.Node, Site>();
      const aliasesOf = new Map<string, Map<number, ts.TypeAliasDeclaration>>();
      for (const [file, text] of texts) {
        const source = program.getSourceFile(file);
        if (source === undefined || source.text !== text) continue;
        const relative = path.relative(process.cwd(), file);
        const aliases = new Map<number, ts.TypeAliasDeclaration>();
        for (const statement of source.statements)
          if (ts.isTypeAliasDeclaration(statement) && statement.name.text.startsWith('__infer_'))
            aliases.set(Number(statement.name.text.slice('__infer_'.length)), statement);
        aliasesOf.set(file, aliases);
        const functions = functionsOf(source);
        functions.forEach((node, ordinal) =>
          ordinals.set(node, { file: relative, ordinal, stripped: strippedOf.get(file)?.has(ordinal) ?? false }),
        );
        if (checked.has(relative)) continue;
        checked.add(relative);
        for (const [ordinal, alias] of aliases) {
          const node = functions[ordinal]!;
          if (hasTypeParameters(node)) continue;
          const signature = checker.getSignatureFromDeclaration(node);
          if (signature === undefined) continue;
          const declared = checker.getTypeFromTypeNode(alias.type);
          if (declared.flags & ts.TypeFlags.Any) continue;
          const inferred = checker.getReturnTypeOfSignature(signature);
          if (!checker.isTypeAssignableTo(inferred, declared)) raise(relative, ordinal, 'satisfies');
          else if (checker.isTypeAssignableTo(declared, inferred)) equivalent.add(`${relative}#${ordinal}`);
        }
      }
      const ownerOf = (node: ts.Node | undefined) => {
        for (let at = node; at !== undefined; at = at.parent) {
          const found = ordinals.get(at);
          if (found !== undefined) return found;
        }
        return undefined;
      };
      const returnOwnerOf = (node: ts.Node) => {
        for (let at: ts.Node | undefined = node; at?.parent !== undefined; at = at.parent) {
          const parent: ts.Node = at.parent;
          const value = ts.isReturnStatement(parent) && parent.expression === at ? parent : undefined;
          const arrow = ordinals.get(parent);
          if (arrow !== undefined && (parent as ts.FunctionLikeDeclaration).body === at && !ts.isBlock(at))
            return arrow.stripped ? arrow : undefined;
          if (value !== undefined) {
            let fn: ts.Node | undefined = value.parent;
            while (fn !== undefined && !isFunctionWithBody(fn)) fn = fn.parent;
            const site = fn === undefined ? undefined : ordinals.get(fn);
            return site?.stripped ? site : undefined;
          }
          if (isFunctionWithBody(parent)) return undefined;
        }
        return undefined;
      };
      const resolve = (node: ts.Node) => {
        const symbol = checker.getSymbolAtLocation(node);
        return symbol !== undefined && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      };
      const siteOf = (declaration: ts.Declaration) =>
        ordinals.get(declaration) ??
        ((ts.isVariableDeclaration(declaration) || ts.isPropertyAssignment(declaration) || ts.isPropertyDeclaration(declaration)) &&
        declaration.initializer !== undefined
          ? ordinals.get(declaration.initializer)
          : undefined);
      const functionIn = (value: ts.Node): ts.Node | undefined => {
        if (ordinals.has(value)) return value;
        let found: ts.Node | undefined;
        const visit = (child: ts.Node) => {
          if (found !== undefined) return;
          if (ordinals.has(child)) found = child;
          else ts.forEachChild(child, visit);
        };
        ts.forEachChild(value, visit);
        return found;
      };
      const through = (declaration: ts.Declaration, depth: number, seen: Set<ts.Node>): Site[] => {
        const direct = siteOf(declaration);
        const fn =
          direct !== undefined
            ? undefined
            : (ts.isVariableDeclaration(declaration) || ts.isPropertyAssignment(declaration) || ts.isPropertyDeclaration(declaration)) &&
                declaration.initializer !== undefined
              ? functionIn(declaration.initializer)
              : undefined;
        if (direct?.stripped) return [direct];
        const node = direct !== undefined ? declaration : fn;
        if (node === undefined || depth === 0 || seen.has(node)) return [];
        seen.add(node);
        const site = ordinals.get(node);
        const owner = site !== undefined && ordinals.get(node) !== undefined ? node : undefined;
        const out: Site[] = [];
        const fnNode = (owner ?? (ordinals.has(declaration) ? declaration : undefined)) as ts.SignatureDeclaration | undefined;
        if (fnNode === undefined) return out;
        if (site?.stripped) return [site];
        for (const value of returnsOf(fnNode)) out.push(...callsIn(value, depth - 1, seen));
        return out;
      };
      const callsIn = (value: ts.Node, depth = 3, seen = new Set<ts.Node>()) => {
        const inner: Site[] = [];
        const visit = (child: ts.Node) => {
          if (ts.isCallExpression(child)) {
            const target = ts.isPropertyAccessExpression(child.expression) ? child.expression.name : child.expression;
            for (const each of resolve(target)?.declarations ?? []) inner.push(...through(each, depth, seen));
          }
          if (!isFunctionWithBody(child)) ts.forEachChild(child, visit);
        };
        visit(value);
        return inner;
      };
      const suspectsOf = (node: ts.Node) => {
        const found: Site[] = [];
        for (const declaration of resolve(node)?.declarations ?? []) {
          const direct = siteOf(declaration);
          if (direct !== undefined) found.push(direct, ...through(declaration, 3, new Set()));
          else if (ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined) {
            found.push(...callsIn(declaration.initializer));
            found.push(...through(declaration, 3, new Set()));
          }
        }
        return found;
      };
      for (const source of program.getSourceFiles()) {
        if (source.fileName.includes('/node_modules/') || program.isSourceFileDefaultLibrary(source)) continue;
        const aliases = aliasesOf.get(path.resolve(source.fileName));
        const aliasStart =
          aliases === undefined || aliases.size === 0 ? Infinity : Math.min(...[...aliases.values()].map((alias) => alias.pos));
        for (const diagnostic of program.getSemanticDiagnostics(source)) {
          if (diagnostic.start === undefined || diagnostic.start >= aliasStart) continue;
          const node = deepest(source, diagnostic.start);
          const where = `${path.relative(process.cwd(), source.fileName)}:${source.getLineAndCharacterOfPosition(diagnostic.start).line + 1} TS${diagnostic.code}`;
          if (NOT_INFERRED.has(diagnostic.code)) {
            let declaration: ts.Node | undefined = node;
            while (declaration !== undefined && !ts.isVariableDeclaration(declaration)) declaration = declaration.parent;
            const owner =
              ownerOf(node) ??
              (declaration !== undefined && declaration.initializer !== undefined ? ordinals.get(declaration.initializer) : undefined);
            if (owner !== undefined) raise(owner.file, owner.ordinal, 'keep');
            else residue.push(where);
            continue;
          }
          if (IMPLICIT_ANY.has(diagnostic.code)) {
            let found: Site | undefined;
            for (let at: ts.Node | undefined = node; at?.parent !== undefined && found === undefined; at = at.parent) {
              const hit = ordinals.get(at.parent);
              if (hit !== undefined && hit.stripped && (at.parent as ts.FunctionLikeDeclaration).body === at) found = hit;
            }
            if (found !== undefined) raise(found.file, found.ordinal, 'satisfies');
            else residue.push(where);
            continue;
          }
          if (round === 1) continue;
          const member = ownerOf(node);
          if (member !== undefined && member.stripped && (diagnostic.code === 2416 || diagnostic.code === 2394)) {
            raise(member.file, member.ordinal, 'upcast');
            continue;
          }
          const suspects: Site[] = [];
          const visit = (child: ts.Node) => {
            if (ts.isIdentifier(child)) suspects.push(...suspectsOf(child));
            if (!isFunctionWithBody(child)) ts.forEachChild(child, visit);
          };
          visit(statementOf(node));
          if (!suspects.some((each) => each.stripped)) {
            const nested = (child: ts.Node) => {
              const site = ordinals.get(child);
              if (site?.stripped) suspects.push(site);
              ts.forEachChild(child, nested);
            };
            nested(statementOf(node));
          }
          if (!suspects.some((each) => each.stripped)) {
            let whole: ts.Node = node;
            while (whole.parent !== undefined && !ts.isBlock(whole.parent) && !ts.isSourceFile(whole.parent)) whole = whole.parent;
            visit(whole);
            if (!suspects.some((each) => each.stripped)) {
              const nested = (child: ts.Node) => {
                const site = ordinals.get(child);
                if (site?.stripped) suspects.push(site);
                ts.forEachChild(child, nested);
              };
              nested(whole);
            }
          }
          const stripped = suspects.filter((each) => each.stripped);
          if (stripped.length === 0) {
            const returning = returnOwnerOf(node);
            if (returning !== undefined) {
              const was = marks.get(returning.file)?.get(returning.ordinal);
              raise(returning.file, returning.ordinal, was === undefined ? 'satisfies' : 'upcast');
            } else residue.push(where);
          }
          for (const each of stripped) raise(each.file, each.ordinal, 'upcast');
        }
      }
    }
    const counts = [...marks.values()].flatMap((marked) => [...marked.values()]);
    console.log(
      `round ${round}: ${counts.filter((m) => m === 'satisfies').length} satisfies, ${counts.filter((m) => m === 'upcast').length} upcast, ${counts.filter((m) => m === 'keep').length} kept; ${residue.length} errors traced to none`,
    );
  }
  for (const line of residue) console.log(`  untraced ${line}`);
  return marks;
};

const sweep = (record: string, config: string, folders: string[]) => {
  const files = filesUnder(folders);
  const marks = config === '-' ? new Map<string, Map<number, Mark>>() : plan(config.split(','), files);
  const stripped: Stripped[] = existsSync(record) ? JSON.parse(readFileSync(record, 'utf8')) : [];
  let count = 0;
  let satisfied = 0;
  let kept = 0;
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const marked = marks.get(file) ?? new Map<number, Mark>();
    const result = edit(file, text, marked, false);
    if (result.text === text) continue;
    count += result.stripped.length;
    for (const mark of marked.values()) mark === 'keep' ? kept++ : satisfied++;
    stripped.push(...result.stripped);
    writeFileSync(file, result.text);
  }
  writeFileSync(record, JSON.stringify(stripped, null, 1));
  console.log(`${count} return types taken out, ${satisfied} of them pinned by satisfies at their returns, ${kept} kept under a disable`);
};

const anys = (record: string, configs: string[]) => {
  const stripped: Stripped[] = JSON.parse(readFileSync(record, 'utf8'));
  const byFile = new Map<string, Stripped[]>();
  for (const entry of stripped) byFile.set(path.resolve(entry.file), [...(byFile.get(path.resolve(entry.file)) ?? []), entry]);
  const seen = new Set<string>();
  const fixes: [string, string, string][] = [];
  for (const config of configs) {
    const read = ts.readConfigFile(config, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(config));
    const program = ts.createProgram({ rootNames: parsed.fileNames, options: { ...parsed.options, noEmit: true } });
    const checker = program.getTypeChecker();
    for (const source of program.getSourceFiles()) {
      const entries = byFile.get(path.resolve(source.fileName));
      if (entries === undefined || seen.has(source.fileName)) continue;
      seen.add(source.fileName);
      const functions = functionsOf(source);
      for (const entry of entries) {
        const node = functions[entry.ordinal];
        if (node === undefined) continue;
        const signature = checker.getSignatureFromDeclaration(node);
        if (signature === undefined) continue;
        const inferred = checker.typeToString(checker.getReturnTypeOfSignature(signature), undefined, ts.TypeFormatFlags.NoTruncation);
        if (/\bany\b/.test(inferred) && !/\bany\b/.test(entry.declared)) {
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          console.log(`${entry.file}:${line} ${entry.name} ${entry.declared} -> ${inferred}`);
          if (process.env.FIX === '1' && /^[A-Za-z_$][\w$]*$/.test(entry.name) && !['try', 'of'].includes(entry.name))
            fixes.push([entry.file, entry.name, entry.declared]);
        }
      }
    }
  }
  for (const [file, name, declared] of new Map(fixes.map((fix) => [`${fix[0]}:${fix[1]}`, fix])).values()) {
    try {
      pin(`${file}:${name}`, declared, true);
    } catch (error) {
      console.log(String(error));
    }
  }
};

const pin = (site: string, type: string, upcast: boolean) => {
  const [file, name] = site.split(':') as [string, string];
  const text = readFileSync(file, 'utf8');
  const source = parse(file, text);
  const edits: Edit[] = [];
  for (const node of functionsOf(source).filter((each) => nameOf(each) === name)) {
    const values = isGenerator(node) ? [] : returnsOf(node);
    if (isGenerator(node)) {
      const visit = (child: ts.Node) => {
        if (isFunctionWithBody(child) || ts.isClassLike(child)) return;
        if (ts.isReturnStatement(child) && child.expression !== undefined) values.push(child.expression);
        ts.forEachChild(child, visit);
      };
      ts.forEachChild((node as ts.FunctionLikeDeclaration).body!, visit);
    }
    const pinned = isAsync(node) ? (/^Promise<([\s\S]*)>$/.exec(type)?.[1] ?? type) : type;
    for (const value of values) {
      if (ts.isSatisfiesExpression(value) || ts.isAsExpression(value)) continue;
      const start = value.getStart(source);
      const bare =
        ts.isParenthesizedExpression(value) ||
        ts.isIdentifier(value) ||
        ts.isCallExpression(value) ||
        ts.isPropertyAccessExpression(value) ||
        ts.isObjectLiteralExpression(value) ||
        ts.isArrayLiteralExpression(value);
      if (!bare) edits.push({ start, end: start, text: '(' });
      edits.push({
        start: value.getEnd(),
        end: value.getEnd(),
        text: `${bare ? '' : ')'} satisfies ${pinned}${upcast ? ` as ${pinned}` : ''}`,
      });
    }
  }
  if (edits.length === 0) throw new Error(`${site}: no return found`);
  writeFileSync(file, apply(text, edits));
  console.log(`${site}: ${edits.filter((each) => each.text !== '(').length} returns pinned`);
};

const unkeep = (file: string, line: number) => {
  const text = readFileSync(file, 'utf8');
  const source = parse(file, text);
  const lines = text.split('\n');
  if (!(lines[line - 1] ?? '').includes(RULE)) throw new Error(`${file}:${line}: no disable of the rule`);
  const node = functionsOf(source).find((each) => {
    const typeLine = each.type === undefined ? -1 : source.getLineAndCharacterOfPosition(each.type.getStart(source)).line;
    const startLine = source.getLineAndCharacterOfPosition(each.getStart(source)).line;
    return each.type !== undefined && (typeLine === line || startLine === line);
  });
  if (node === undefined) throw new Error(`${file}:${line}: no function under the disable`);
  const from = closeParenOf(node, source)!;
  const start =
    text
      .split('\n')
      .slice(0, line - 1)
      .join('\n').length + (line > 1 ? 1 : 0);
  const end = start + lines[line - 1]!.length + 1;
  writeFileSync(
    file,
    apply(text, [
      { start: from.getEnd(), end: node.type!.getEnd(), text: '' },
      { start, end, text: '' },
    ]),
  );
};

const [mode, record, ...rest] = process.argv.slice(2);
if (mode === 'sweep' && record !== undefined && rest[0] !== undefined) sweep(record, rest[0], rest.slice(1));
else if (mode === 'anys' && record !== undefined) anys(record, rest);
else if (mode === 'unkeep' && record !== undefined && rest[0] !== undefined) unkeep(record, Number(rest[0]));
else if (mode === 'pin' && record !== undefined && rest[0] !== undefined) pin(record, rest[0], rest[1] === 'as');
else {
  console.error('usage: node tools/infer-returns.ts sweep <record.json> <tsconfig|-> <folder>… | anys <record.json> <tsconfig>…');
  process.exit(2);
}
