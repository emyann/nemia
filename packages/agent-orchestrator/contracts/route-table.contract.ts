/**
 * A condition's table (agent-orchestrator, src/route/route.ts, `tableRoute`): the route a closed table picks for the value of the fact
 * field its condition reads (`route: { from: <producer>.<field>, table: { <value>: <route> } }`), from the closed list its condition
 * declares (`routes:`). Pure: the pass reads the producer's signed closeout and looks the value up, and evaluates nothing.
 *
 * Load closes the table over the field's enum and `routes:` (`routeRefusal`), so on a workflow that loads every enum value has a row and
 * every row a declared route. The laws hold all the same for a table nobody closed: a value with no row, or a row naming a route the
 * condition does not declare, is never a route, never the first route and never a default — the condition reads `unsigned`.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A table eval as the step's `route:` line gives it: the producer's field it reads, and a route per value of that field. */
export type RouteTable = { readonly from: string; readonly table: Readonly<Record<string, string>> };

/** What a table answers: a route, or none (`unsigned`), which the condition reads as a closeout that does not decode. */
export type TablePick = { readonly kind: 'route'; readonly route: string } | { readonly kind: 'unsigned' };

/** Whether `route` is one of the condition's declared routes. */
const declared = (routes: readonly string[], route: string): boolean => routes.includes(route);

/** The row the table holds for a value, when the value is a string and its row a string. */
const rowOf = (table: RouteTable, value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const row: unknown = table.table[value];
  return typeof row === 'string' ? row : undefined;
};

const tableRouteSpec = spec<(table: RouteTable, routes: readonly string[], value: unknown) => TablePick>({
  ensures: {
    aRouteIsDeclared: {
      description: 'A table answers only a route its condition declares',
      condition: ({ input: [, routes], output }) => output.kind !== 'route' || declared(routes, output.route),
    },
    theRowIsTheRoute: {
      description: "Where the value has a row naming a declared route, the table answers that row's route",
      condition: ({ input: [table, routes, value], output }) => {
        const row = rowOf(table, value);
        return row === undefined || !declared(routes, row) || (output.kind === 'route' && output.route === row);
      },
    },
    noRowNoRoute: {
      description:
        'A value with no row, or whose row names no declared route, answers no route: never the first route, never a default',
      condition: ({ input: [table, routes, value], output }) => {
        const row = rowOf(table, value);
        return (row !== undefined && declared(routes, row)) || output.kind === 'unsigned';
      },
    },
  },
});

/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type TableRoute = Implementation<typeof tableRouteSpec>;
