/**
 * The rail lights one destination on every page (`destinationsLit`, src/components/nav.ts): each route of the board's route tree, read from
 * `src/routeTree.gen.ts`, lights exactly one, and a route that lights none or two is refused.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { type Destination, DESTINATIONS, destinationsLit } from '../src/components/nav.ts';

/** Every full path of the board's routes, as the router's generated tree declares them, each parameter given a value. */
function routePaths(): string[] {
  const tree = fs.readFileSync(path.resolve(import.meta.dirname, '../src/routeTree.gen.ts'), 'utf8');
  const start = tree.indexOf('export interface FileRoutesByFullPath');
  assert.notEqual(start, -1, 'the route tree declares FileRoutesByFullPath');
  const end = tree.indexOf('export interface FileRoutesByTo', start);
  assert.notEqual(end, -1, 'the route tree declares FileRoutesByTo after it');
  const body = tree.slice(start, end);
  const paths = [...body.matchAll(/'([^']+)'\s*:/g)].map((match) => match[1].replace(/\$[A-Za-z]+/g, 'x'));
  assert.ok(paths.length > 10, `the route tree lists the board's routes, ${paths.length} read`);
  return paths;
}

/** Each of `paths` that does not light exactly one destination of `table`, said with what it lights. */
const unlit = (paths: readonly string[], table: readonly Destination[]): string[] =>
  paths.flatMap((one) => {
    const lit = destinationsLit(one, table).map((destination) => destination.label);
    return lit.length === 1 ? [] : [`${one} lights ${lit.length ? lit.join(' and ') : 'none'}`];
  });

test('REFUSED: every route of the board lights exactly one destination of the rail', () => {
  assert.deepEqual(unlit(routePaths(), DESTINATIONS), []);
});

test('REFUSED: a route that lights no destination, or two, is named', () => {
  assert.deepEqual(unlit(['/nowhere'], DESTINATIONS), ['/nowhere lights none']);
  const overlapping = [...DESTINATIONS, { ...DESTINATIONS[0], id: 'twice', label: 'Twice', lights: (one: string) => one === '/settings' }];
  assert.deepEqual(unlit(['/settings'], overlapping), ['/settings lights Settings and Twice']);
});
