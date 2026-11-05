/**
 * The objects the api serves through the `Api` of `objects` (`objectsRoutes`, mounted by app.ts): the run object and its sub-resources,
 * and the inbox's cards; the handlers of each group (`runs.ts`, `cards.ts`), the package's refusals as the `Api`'s errors (`refused.ts`)
 * and the web handler and the Hono routes that hand it its paths, guarded (`serve.ts`).
 */
export { objectsHandler, objectsRoutes } from './serve.ts';
