/** The run slots' read, an entry of the command table the api alone serves (`slotsRead`). */
import { slotsRead, type Slots } from './slots-read.verb.ts';
import type { Command } from '../command/entry.verb.ts';

/**
 * The cap on runs in flight, the runs it counts and the runs it holds (`slotsRead`), which the api alone serves (`GET /api/ceilings`).
 */
export const CEILINGS: Command<Slots> = {
  name: 'ceilings',
  usage: '',
  help: ['the cap on runs in flight, the runs it counts and the runs it holds'],
  spec: { positionals: [], flags: [], unknown: (arg) => `the ceilings take no ${arg}.` },
  writes: false,
  class: 'read',
  only: {
    side: 'api',
    why: 'the board says the run slots over its Factory; at the command line, nemia ls and nemia decide say a run held for one beside the run',
  },
  handler: (_args, env) => slotsRead(env),
  print: () => [],
};
