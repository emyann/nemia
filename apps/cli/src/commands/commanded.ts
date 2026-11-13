/**
 * A command whose words the client holds (`MOVED_COMMANDS`, `objects`' `COMMAND_WORDS`), run here under every context: its words parsed
 * against its spec by `objects`' `parseArgv`, a usage refusal (`CommandRefused`) said as a `Refused`, exit 2; its help (`usage` and
 * `help`, `helpOf`; its long help, `manual`, where it has one and `--help` is typed) printed on `--help` or where it is given too little
 * to act on; refused by its own `check` of what was parsed; else handed to its runner, which reads the person's
 * files here and asks the api for the rest.
 */
import { type Args, COMMAND_WORDS, CommandRefused, helpOf, type MovedCommand, parseArgv } from 'objects';
import { Refused } from '../refused.ts';
import { agentsWrite } from './agents-write.ts';
import { DEFINITION_RUNNERS } from './definitions/runners.ts';
import { FACTORY_RUNNERS } from './factories/runners.ts';
import { INBOX_RUNNERS } from './inbox/runners.ts';
import { READ_RUNNERS } from './reads/runners.ts';
import { REST_RUNNERS } from './rest/runners.ts';
import type { Runner } from './runner.ts';
import { RUN_RUNNERS } from './runs/runners.ts';
import { skillsWrite } from './skills-write.ts';
import { workflowsWrite } from './workflows-write.ts';

/** Each moved command's runner, group by group: total over `objects`' `COMMAND_WORDS`, so a command with no runner does not compile. */
const RUNNERS: Readonly<Record<MovedCommand, Runner>> = {
  ...RUN_RUNNERS,
  ...INBOX_RUNNERS,
  ...FACTORY_RUNNERS,
  'workflows write': workflowsWrite,
  'agents write': agentsWrite,
  'skills write': skillsWrite,
  ...DEFINITION_RUNNERS,
  ...READ_RUNNERS,
  ...REST_RUNNERS,
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
export async function commanded(name: MovedCommand, rest: readonly string[]): Promise<number> {
  const words = COMMAND_WORDS.find((command) => command.name === name);
  if (words === undefined) throw new Error(`${name} is in MOVED_COMMANDS and has no words in objects' COMMAND_WORDS: add them there`);
  if (words.manual !== undefined && rest.includes('--help')) {
    process.stdout.write(`${words.manual}\n`);
    return 0;
  }
  const args = parsed(words.spec, rest);
  if (args === undefined) {
    process.stdout.write(`${helpOf([words])}\n`);
    return 0;
  }
  const wrong = words.check?.(args);
  if (wrong) throw new Refused(wrong);
  return RUNNERS[name](args);
}
