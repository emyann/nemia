/** `nemia ls`, an entry of the command table: every run, or the one named, and its steps (`runsListed`). */
import { givesNone, renamed, selectorQuery } from '../command/requests.verb.ts';
import { Effect, Schema } from 'effect';
import { runsListed } from './list.verb.ts';
import { lsLines, type RunsListed } from './list.ts';
import { labelFlags, runsShown, selectorCheck, selectorsIn, type Command } from '../command/entry.verb.ts';
import { pausedLines } from '../pause/pause.ts';

/**
 * `nemia ls`: every run, or the one named, and its steps, as the package reads each (`runsListed`). The board's list is the RunList
 * (`runList`), judged off the same judgement of each (`informedJudgements`), at `GET /api/runs`: its links (`served`), the tools of the
 * MCP port, are that list, which `nemia ls` and the port both ask for its `Table` and print a run a line, and one Run (`GET
 * /api/runs/:name`), never each run's whole record. The api serves this entry's answer whole on `GET /api/listing` and
 * `GET /api/listing/:runId`, which `nemia ls <run>` reads and prints with this entry's lines, as a client of it.
 */
/** What `nemia ls` takes, and the api's listing calls it with: a run's id or none, its selectors, and the labels shown. */
const LsInput = Schema.Struct({
  runId: Schema.optionalKey(Schema.String),
  selector: Schema.optionalKey(Schema.Array(Schema.String)),
  showLabels: Schema.optionalKey(Schema.Boolean),
  labelColumns: Schema.optionalKey(Schema.Array(Schema.String)),
});

export const LS: Command<RunsListed, typeof LsInput.Type> = {
  name: 'ls',
  served: [
    {
      endpoint: 'runs.listAll',
      takes: givesNone('runId'),
      request: (input) => Effect.succeed(selectorQuery(input)),
    },
    { endpoint: 'runs.show', as: 'ls_run', request: renamed({ runId: 'name' }, ['selector', 'showLabels', 'labelColumns']) },
  ],
  usage: '[<runId>] [-l <selector>] [--show-labels] [-L <key>]',
  help: [
    'runs and their steps — a run waiting on another says waiting on <run>,',
    'one the cap on runs in flight holds waiting for a run slot (2 of 2 in',
    "flight); what each step's tries and the run have cost, where measured;",
    'last, whether a nemia up ticks the store and when its last pass was;',
    'first, while the store is paused, Pausing: N finishing and each',
    'session, check or landing at work, or Paused once none is, then each',
    'check it holds, a landing with its merge staged in the checkout',
    '(MERGE_HEAD) among them; a step whose check it holds says waiting on',
    'the pause. -l: the runs whose labels a selector takes (team=core,',
    'given again for another); --show-labels: each run with its labels;',
    '-L <key>: that label beside each run, given again for another',
  ],
  spec: {
    positionals: [{ key: 'runId', takes: 'optional', kind: 'name' }],
    flags: labelFlags('nemia ls'),
    unknown: (arg) => `nemia ls takes one run's id, or none, -l <selector>, --show-labels and -L <key>: not ${arg}.`,
  },
  check: selectorCheck,
  writes: false,
  class: 'read',
  input: LsInput,
  handler: (args) => Effect.flatMap(selectorsIn(args), (s) => runsListed(args.runId, s)),
  print: (listed, args) => [...(listed.paused ? pausedLines(listed.paused) : []), ...lsLines(listed, Date.now(), runsShown(args))],
};
