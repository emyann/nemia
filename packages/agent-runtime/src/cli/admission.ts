/**
 * `ae admission -- <command…>`: the hook a Claude Code session with admission runs before each call to the tools it names. Reads the
 * hook's input on stdin, hands the call to admission's command (`admitCall`), and prints the hook's output. Loads the adapter alone,
 * never the engine, so a call pays one small process.
 */
import fs from 'node:fs';
import { admitCall } from '../harness/claude/admission.ts';

/** The words after `--`: admission's command. Refused, exit 2, where none follows it. */
export function admission(argv: string[]): void {
  const command = argv.indexOf('--') === -1 ? [] : argv.slice(argv.indexOf('--') + 1);
  if (command.length === 0)
    throw Object.assign(new Error('ae admission needs its command after --: ae admission -- my-admit --strict'), { exitCode: 2 });
  const out = admitCall(fs.readFileSync(0, 'utf8'), command);
  if (out !== '') process.stdout.write(`${out}\n`);
}
