/**
 * The runners of the group's commands (`objects`' `REST_WORDS`), by name: each takes its words parsed against its spec, asks the api
 * through `asked`, prints what it answers, and answers its exit code. The table is total over the group's names, so one left out does
 * not compile.
 */
import type { RestCommand } from 'objects';
import type { Runner } from '../runner.ts';
import { passes, series } from './meters.ts';
import { level } from './nemia.ts';
import { boardLink, boardOpen, pairingsApprove, pairingsLs } from './pairing.ts';
import { quota } from './quota.ts';
import { concluded, logs, memory } from './reads.ts';
import { capabilities, milestones, repository, serverUpgrades, serverVersion, store } from './server.ts';
import { stats } from './stats.ts';
import { subscribe, unsubscribe } from './subscriptions.ts';
import { tokenAdd, tokenLs, tokenRm } from './tokens.ts';

/** Each of the group's commands' runner. */
export const REST_RUNNERS: Readonly<Record<RestCommand, Runner>> = {
  concluded,
  logs,
  stats,
  passes,
  series,
  quota,
  'server version': serverVersion,
  'server upgrades': serverUpgrades,
  capabilities,
  repository,
  store,
  milestones,
  subscribe,
  unsubscribe,
  level,
  memory,
  'pairings ls': pairingsLs,
  'pairings approve': pairingsApprove,
  'board link': boardLink,
  open: boardOpen,
  'token add': tokenAdd,
  'token ls': tokenLs,
  'token rm': tokenRm,
};
