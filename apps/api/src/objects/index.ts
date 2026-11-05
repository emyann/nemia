/**
 * The objects the api serves through the `Api` of `objects` (`objectsRoutes`, mounted by app.ts): the run object and its sub-resources,
 * the inbox's cards, the factories, the templates, the subscriptions and the feed's events; the handlers of each group (`runs.ts`,
 * `cards.ts`, `factories.ts`, its parts' in factory-parts/, the
 * templates' in template-objects/, the subscriptions' and the events' in feed-objects/), the package's refusals
 * as the `Api`'s errors (`refused.ts`) and the web handler and the Hono routes that hand it its paths, guarded (`serve.ts`).
 */
export { objectsHandler, objectsRoutes } from './serve.ts';
