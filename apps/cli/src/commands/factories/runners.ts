/**
 * The runners of the group's commands (`objects`' `FACTORY_WORDS`), by name: each takes its words parsed against its spec, asks the api
 * through `asked`, prints what it answers, and answers its exit code. A command's runner joins here in the change that moves its words;
 * the table is total over the group's names, so one left out does not compile.
 */
import type { FactoryCommand } from 'objects';
import type { Runner } from '../runner.ts';

/** Each of the group's commands' runner. */
export const FACTORY_RUNNERS: Readonly<Record<FactoryCommand, Runner>> = {};
