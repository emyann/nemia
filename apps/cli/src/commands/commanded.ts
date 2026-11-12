/**
 * A command whose words the client holds (`MOVED_COMMANDS`, `objects`' `COMMAND_WORDS`), run here under every context: its words parsed
 * against its spec by `objects`' `parseArgv`, a usage refusal (`CommandRefused`) said as a `Refused`, exit 2; its help (`usage` and
 * `help`, `helpOf`) printed on `--help` or where it is given too little to act on; else handed to its runner, which reads the person's
 * files here and asks the api for the rest.
 */
import { type Args, COMMAND_WORDS, CommandRefused, helpOf, parseArgv } from 'objects';
import { Refused } from '../refused.ts';
import type { MovedName } from '../route.ts';
import { agentsWrite } from './agents-write.ts';
import { skillsWrite } from './skills-write.ts';
import { workflowsWrite } from './workflows-write.ts';

/** Each moved command's runner, on its words parsed: it prints, and answers its exit code. */
const RUNNERS: Readonly<Record<MovedName, (args: Args) => Promise<number>>> = {
  'workflows write': workflowsWrite,
  'agents write': agentsWrite,
  'skills write': skillsWrite,
};

/** `rest` read against `spec` (`parseArgv`), its usage refusal said as this client's own, exit 2. */
const parsed = (spec: Parameters<typeof parseArgv>[0], rest: readonly string[]): Args | undefined => {
  try {
    return parseArgv(spec, rest);
  } catch (err) {
    if (err instanceof CommandRefused) throw new Refused(err.message);
    throw err;
  }
};

/** Runs the moved command `name` on the words after its name, `rest`, and answers its exit code. */
export async function commanded(name: MovedName, rest: readonly string[]): Promise<number> {
  const words = COMMAND_WORDS.find((command) => command.name === name);
  if (words === undefined) throw new Error(`${name} is in MOVED_COMMANDS and has no words in objects' COMMAND_WORDS: add them there`);
  const args = parsed(words.spec, rest);
  if (args === undefined) {
    process.stdout.write(`${helpOf([words])}\n`);
    return 0;
  }
  return RUNNERS[name](args);
}
