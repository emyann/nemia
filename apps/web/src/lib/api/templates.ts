/**
 * The templates Nemia ships (`GET /api/templates`), each `objects`' `Template` as the api serves it: what it is, its workflows and agents,
 * and each problem that stops it being applied. Read by the welcome's factory step, which applies one by its name.
 */
import { queryOptions } from '@tanstack/react-query';
import type { Template } from 'objects';
import { templates } from './objects.ts';

/** The templates Nemia ships, in the order the api lists them. Not polled: they change with Nemia's version. */
export const templatesQuery = queryOptions({
  queryKey: ['templates'],
  queryFn: async (): Promise<readonly Template[]> => (await templates.list()).items,
});
