/**
 * The templates Nemia builds in (`GET /api/templates`), each `objects`' `Template` as the api serves it: what it is, its workflows and
 * agents, and each problem that stops it being applied. Read by the welcome's factory step, which applies one by its name.
 */
import { queryOptions } from '@tanstack/react-query';
import { templates } from './objects.ts';

/** The templates Nemia builds in, in the order the api lists them. Not polled: they change with Nemia's version. */
export const templatesQuery = queryOptions({
  queryKey: ['templates'],
  queryFn: async () => (await templates.list()).items,
});
