/** The runner of `nemia admit`, the one command of the table the CLI runs by a hand of its own beside `tick` and `up`. */
import fs from 'node:fs';
import { admitted, runWith, type Place, TABLE, type Args, type Env, wfRoot } from '../runner.ts';
import { placedIn, type Engine } from './flags.ts';

/**
 * `nemia admit`'s runner: the call read on stdin, decided against the table (`admitted`) under the floor `--at-least` gives, and the answer
 * printed as JSON, or nothing.
 */
export async function admitRun(env: Env, args: Args, e: Engine, place: Place): Promise<void> {
  const home = wfRoot(env);
  const floor = typeof args.atLeast === 'string' ? (args.atLeast as Parameters<typeof admitted>[3]) : undefined;
  const auto = typeof args.auto === 'string' ? args.auto : undefined;
  const answer = await runWith(e, placedIn(env, place, admitted(home, fs.readFileSync(0, 'utf8'), TABLE, floor, auto)));
  if (answer !== undefined) console.log(JSON.stringify(answer));
}
