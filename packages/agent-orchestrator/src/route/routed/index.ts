/**
 * The face of `src/route/routed/`, a part of the route: the words a run's nodes read once its conditions have routed, and the lines that
 * say them. Pure.
 */
export { answeredRoute, routedWords, routeSettled, runWords } from './routed-words.ts';
export { routeLine, routedRows, settledOf } from './routed-lines.ts';
export type { RoutedInput, RoutedRow } from './routed-lines.ts';
