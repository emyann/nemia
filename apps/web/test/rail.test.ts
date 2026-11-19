/**
 * Every page of the board sits somewhere in the frame (`seatOf`, src/components/nav/nav.ts): each route of the board's route tree, read
 * from `src/routeTree.gen.ts`, has a seat, and each route under `/factories/<name>` sits in that factory at a place of its pane; a route
 * with no seat is refused, named.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PANE_PLACES, seatOf, type Seat } from '../src/components/nav/nav.ts';

/** Every full path of the board's routes, as the router's generated tree declares them, each parameter given a value. */
function routePaths() {
  const tree = fs.readFileSync(path.resolve(import.meta.dirname, '../src/routeTree.gen.ts'), 'utf8');
  const start = tree.indexOf('export interface FileRoutesByFullPath');
  assert.notEqual(start, -1, 'the route tree declares FileRoutesByFullPath');
  const end = tree.indexOf('export interface FileRoutesByTo', start);
  assert.notEqual(end, -1, 'the route tree declares FileRoutesByTo after it');
  const body = tree.slice(start, end);
  const paths = [...body.matchAll(/'([^']+)'\s*:/g)].map((match) => match[1].replace(/\$[A-Za-z]+/g, 'x'));
  assert.ok(paths.length > 10, `the route tree lists the board's routes, ${paths.length} read`);
  return paths satisfies string[];
}

/** Each of `paths` that `seat` seats nowhere, or under `/factories/x` anywhere but a place of factory x's pane, said with why. */
const unseated = (paths: readonly string[], seat: (path: string) => Seat | undefined) =>
  paths.flatMap((one) => {
    const at = seat(one);
    if (at === undefined) return [`${one} has no seat`];
    if (!one.startsWith('/factories/')) return [];
    const placed = at.level === 'factory' && at.factory === 'x' && PANE_PLACES.some((place) => place.id === at.place);
    return placed ? [] : [`${one} is no place of factory x's pane`];
  }) satisfies string[];

test('REFUSED: every route of the board has a seat, a factory’s path a place of its pane', () => {
  assert.deepEqual(unseated(routePaths(), seatOf), []);
});

test('REFUSED: a route with no seat, or a factory’s path seated off its pane, is named', () => {
  assert.deepEqual(unseated(['/nowhere'], seatOf), ['/nowhere has no seat']);
  const storeOnly = (one: string) =>
    (one.startsWith('/factories/') ? { level: 'store', rail: 'factories' } : seatOf(one)) satisfies Seat | undefined;
  assert.deepEqual(unseated(['/factories/x/runs'], storeOnly), ["/factories/x/runs is no place of factory x's pane"]);
});
