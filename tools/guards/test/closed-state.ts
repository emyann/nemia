/**
 * The measure `closed-state.test.ts` holds: each field at a door that names a state or a kind — `phase`, `status`, `state`, `kind`,
 * `type`, `reason` — whose type, null and undefined taken off, is `string` or a union with a `string` member. Read by the TypeScript
 * checker, not the text, so a field typed through an alias, an intersection, an `Omit<…>` or a schema's `.Type` is seen as what it
 * resolves to; a template literal and a branded string are no `string`.
 *
 * A door is each entry of agent-runtime's and agent-orchestrator's `exports` but `./testing` and `./package.json`, read from their
 * `package.json` so a new entry is read with no edit here, and each non-test `.ts` under `apps/api/src`, where the api declares its
 * answers. From each type a door exports the walk goes through unions, intersections, arrays, tuples, index signatures and property
 * types, visiting each instantiation of a named type once — `Page<'a'>` and `Page<string>` are each a type of their own, so a field
 * typed by a type parameter is judged at each — and keying what it finds by the file that declares it and its name; a type that
 * instantiates itself with ever larger arguments stops at `INSTANTIATIONS` of one name. It leaves out what is declared under
 * `node_modules`, and goes into no function's parameters or answer.
 *
 * A field is keyed `<file>#<Owner>.<path>.<prop>`: the file that declares the named type it sits in, from the root, that type's name,
 * and the way down to it (`[]` an array's or a tuple's element, `{}` an index signature's value). No line, so moving code moves no key.
 *
 * Run as a program it prints today's hits as the baseline's entries: `node tools/guards/test/closed-state.ts` from the root.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { files, REPO } from './repo-files.ts';

/** The names of a field that says a state or a kind. */
export const STATE_NAMES = new Set(['phase', 'status', 'state', 'kind', 'type', 'reason']);

/** The packages whose `exports` are doors, by folder from the root. */
const PACKAGES = ['packages/agent-runtime', 'packages/agent-orchestrator'];

/** The entries of a package's `exports` that are no door. */
const NOT_DOORS = new Set(['./testing', './package.json']);

/** Whether `file`, a path from the root, is one of the api's doors: a `.ts` under its `src`, no test and no declaration. */
const apiDoor = (file: string): boolean =>
  file.startsWith('apps/api/src/') && file.endsWith('.ts') && !file.endsWith('.d.ts') && !file.endsWith('.test.ts');

/** The door files of the repository at `root`, by path from it: the packages' `exports` entries, then the api's sources. */
export const doors = (root = REPO, listed: readonly string[] = files()): string[] => {
  const entries = PACKAGES.flatMap((dir) => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, dir, 'package.json'), 'utf8')) as { exports?: Record<string, string> };
    return Object.entries(manifest.exports ?? {})
      .filter(([entry]) => !NOT_DOORS.has(entry))
      .map(([, target]) => path.posix.join(dir, target));
  });
  return [...entries, ...listed.filter(apiDoor).sort()];
};

/** How many instantiations of one named type the walk enters, at most. */
const INSTANTIATIONS = 64;

export type Hit = { key: string; file: string; line: number };

/** Whether `type`, null and undefined taken off, is `string` or a union one of whose members is. */
const open = (type: ts.Type): boolean =>
  type.isUnion() ? type.types.some((member) => (member.flags & ts.TypeFlags.String) !== 0) : (type.flags & ts.TypeFlags.String) !== 0;

const inNodeModules = (file: string): boolean => file.split(path.sep).includes('node_modules');

/**
 * Each field of the types the `files` (paths from `root`) export whose state or kind is open, as `hits`, and the key of every field
 * the walk read, as `visited`, which proves it read the doors. A type named under `node_modules` is not read, but for a mapped utility a
 * type is made of (`Omit`, `Partial`, `Record`), whose fields are the repository's, and the type arguments it is instantiated with.
 */
export const openStates = (files: readonly string[], root: string): { hits: Hit[]; visited: string[] } => {
  const roots = files.map((file) => path.join(root, file));
  const program = ts.createProgram(roots, {
    allowImportingTsExtensions: true,
    noEmit: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    strict: true,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const fromRoot = (file: string): string => path.relative(root, path.resolve(file)).split(path.sep).join('/');

  const hits = new Map<string, Hit>();
  const visited = new Set<string>();
  const named = new Map<string, number>();
  const entered = new Set<ts.Type>();
  const anonymous = new Set<ts.Type>();

  const ours = (symbol: ts.Symbol | undefined): ts.Declaration[] =>
    (symbol?.declarations ?? []).filter((d) => !inNodeModules(d.getSourceFile().fileName));

  /** Where a field is said to be: the file that declares the named type it sits in, that type's name, and its declaration. */
  type Owner = { file: string; name: string; declaration: ts.Declaration };

  const ownerOf = (type: ts.Type): Owner | undefined => {
    const symbol =
      type.aliasSymbol ??
      (type.flags & ts.TypeFlags.Object && type.symbol?.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.Class)
        ? type.symbol
        : undefined);
    const declaration = ours(symbol)[0];
    return symbol && declaration ? { file: fromRoot(declaration.getSourceFile().fileName), name: symbol.name, declaration } : undefined;
  };

  const foreign = (type: ts.Type): boolean => {
    const symbol = type.aliasSymbol ?? (type.flags & ts.TypeFlags.Object ? type.symbol : undefined);
    if (!symbol?.declarations?.length || ours(symbol).length) return false;
    const mapped =
      (type.flags & ts.TypeFlags.Object && (type as ts.ObjectType).objectFlags & ts.ObjectFlags.Mapped) ||
      type.aliasSymbol?.declarations?.some((d) => ts.isTypeAliasDeclaration(d) && ts.isMappedTypeNode(d.type));
    return !mapped;
  };

  const argumentsOf = (type: ts.Type): readonly ts.Type[] =>
    type.aliasTypeArguments ??
    (type.flags & ts.TypeFlags.Object && (type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference
      ? checker.getTypeArguments(type as ts.TypeReference)
      : []);

  const placeOf = (declaration: ts.Declaration): { file: string; line: number } => {
    const source = declaration.getSourceFile();
    return { file: fromRoot(source.fileName), line: source.getLineAndCharacterOfPosition(declaration.getStart(source)).line + 1 };
  };

  const enter = (type: ts.Type, owner: Owner): void => {
    const key = `${owner.file}#${owner.name}`;
    const count = named.get(key) ?? 0;
    if (entered.has(type) || count >= INSTANTIATIONS) return;
    entered.add(type);
    named.set(key, count + 1);
    walk(type, owner, '', true);
  };

  const walk = (type: ts.Type, owner: Owner, way: string, top = false): void => {
    const own = top ? undefined : ownerOf(type);
    if (own) {
      for (const argument of argumentsOf(type)) walk(argument, owner, way);
      return enter(type, own);
    }
    if (type.isUnion() || type.isIntersection()) {
      for (const member of type.types) walk(member, owner, way);
      return;
    }
    if (!(type.flags & ts.TypeFlags.Object)) return;
    if (checker.isArrayType(type) || checker.isTupleType(type)) {
      for (const element of checker.getTypeArguments(type as ts.TypeReference)) walk(element, owner, `${way}[]`);
      return;
    }
    if (type.getCallSignatures().length || type.getConstructSignatures().length) return;
    if (foreign(type)) {
      for (const argument of argumentsOf(type)) walk(argument, owner, way);
      return;
    }
    if (!top) {
      if (anonymous.has(type)) return;
      anonymous.add(type);
    }
    for (const info of checker.getIndexInfosOfType(type)) walk(info.type, owner, `${way}{}`);
    for (const property of checker.getPropertiesOfType(type)) {
      if (property.declarations?.length && !ours(property).length) continue;
      const at = `${way}.${property.name}`;
      const key = `${owner.file}#${owner.name}${at}`;
      visited.add(key);
      const of = checker.getTypeOfSymbol(property);
      if (STATE_NAMES.has(property.name) && open(checker.getNonNullableType(of)))
        hits.set(key, { key, ...placeOf(ours(property)[0] ?? owner.declaration) });
      else walk(of, owner, at);
    }
  };

  for (const door of roots) {
    const source = program.getSourceFile(door);
    const module = source && checker.getSymbolAtLocation(source);
    if (!module) continue;
    for (const exported of checker.getExportsOfModule(module)) {
      const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      if (!(symbol.flags & (ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface | ts.SymbolFlags.Class))) continue;
      const declaration = ours(symbol)[0];
      if (declaration)
        enter(checker.getDeclaredTypeOfSymbol(symbol), {
          file: fromRoot(declaration.getSourceFile().fileName),
          name: symbol.name,
          declaration,
        });
    }
  }
  return { hits: [...hits.values()].sort((a, b) => a.key.localeCompare(b.key)), visited: [...visited].sort() };
};

/** The repository's open states today, over its doors. */
export const repositoryHits = (): { hits: Hit[]; visited: string[] } => openStates(doors(), REPO);

if (import.meta.main) {
  for (const { key, file, line } of repositoryHits().hits) console.log(`  '${key}': { card: '' }, // ${file}:${line}`);
}
