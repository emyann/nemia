/**
 * The runners of the group's commands (`objects`' `REST_WORDS`), by name: each takes its words parsed against its spec, asks the api
 * through `asked`, prints what it answers, and answers its exit code. The table is total over the group's names, so one left out does
 * not compile.
 */
import type { RestCommand } from 'objects';
import type { Runner } from '../runner.ts';
import { passes, series } from './meters.ts';
import { chatAllow, chatDisallow, chatSpeakers, level } from './nemia.ts';
import { boardLink, pairingsApprove, pairingsLs } from './pairing.ts';
import { concluded, logs, memory } from './reads.ts';
import { stats } from './stats.ts';
import { subscribe, unsubscribe } from './subscriptions.ts';

/** Each of the group's commands' runner. */
export const REST_RUNNERS: Readonly<Record<RestCommand, Runner>> = {
  concluded,
  logs,
  stats,
  passes,
  series,
  subscribe,
  unsubscribe,
  level,
  memory,
  'chat speakers': chatSpeakers,
  'chat allow': chatAllow,
  'chat disallow': chatDisallow,
  'pairings ls': pairingsLs,
  'pairings approve': pairingsApprove,
  'board link': boardLink,
};
