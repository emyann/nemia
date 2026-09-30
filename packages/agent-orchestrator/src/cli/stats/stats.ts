/** `wf stats`: the flow numbers of every run in the store, as tiles and a row per day, one line (`--line`), or JSON (`--json`). */
import { BY_KEYS, stats, statsLine, statsLines, statsQueryOf } from '../../runner.ts';
import { readFlags, type Engine } from '../flags.ts';

/** The value flags `wf stats` takes, by the query key each sets, and what each takes. */
const TAKES = {
  from: 'a day, YYYY-MM-DD in UTC: the first day counted',
  to: 'a day, YYYY-MM-DD in UTC: the last day counted',
  by: `what the rows go by: ${BY_KEYS.join(', ')}`,
  agent: "an agent's name: only the steps it fills",
  step: "a step's name: only that step",
  factory: "a factory's name: only its runs",
  workflow: "a workflow folder's name: only its runs",
  repo: "a repository's path, as a run's record names it: only its runs",
} as const;

/** What `wf stats --help` prints: what it counts, each flag and what it takes, and how it prints. */
const STATS_HELP = `wf stats [--from <day>] [--to <day>] [--by <key>] [--agent|--step|--factory|--workflow|--repo <value>] [--line|--json]

The flow numbers of every run in the store, of every factory and repository: the runs finished and landed, the rounds
a loop took to be accepted, the share of landed runs that landed on their first try, the cost and wall time of a landed
run, and per step its tries, their time and cost, its checks' verdicts and its waits at a gate. It prints tiles, the
last 14 days against the 14 before, a row per UTC day, and a row per step and agent. A number nothing measured is
absent, "—" in words and null in JSON, never 0.

${Object.entries(TAKES)
  .map(([key, takes]) => `  --${key.padEnd(10)}${takes}`)
  .join('\n')}
  --line      one line, for a recap
  --json      the whole answer, as GET /api/stats gives it`;

/** `wf stats`'s flags read into a query (`statsQueryOf`), and how it prints: refused with the flag it does not take, or a bad value. */
function statsHow(argv: string[]) {
  const { values, switches } = readFlags(argv, {
    takes: Object.fromEntries(Object.entries(TAKES).map(([k, v]) => [`--${k}`, v])),
    switches: ['--line', '--json'],
    unknown: (arg) =>
      `wf stats does not take ${arg}. It takes ${Object.keys(TAKES)
        .map((k) => `--${k}`)
        .join(', ')}, and --line or --json.`,
    twice: (flag) => `wf stats takes ${flag} once.`,
  });
  const given = Object.fromEntries(Object.keys(TAKES).flatMap((k) => (values[`--${k}`] ? [[k, values[`--${k}`][0]]] : [])));
  return { query: statsQueryOf(given, (key) => `--${key}`), line: switches.includes('--line'), json: switches.includes('--json') };
}

/** `wf stats`: what it prints — tiles and rows, `--line` the recap's one line, `--json` the whole answer. */
export async function statsVerb(rest: string[], e: Engine): Promise<void> {
  if (rest.includes('--help')) return console.log(STATS_HELP);
  const how = statsHow(rest);
  const s = await stats(e, how.query);
  if (how.json) return console.log(JSON.stringify(s, null, 2));
  if (how.line) return console.log(statsLine(s));
  for (const line of statsLines(s)) console.log(line);
}
