#!/usr/bin/env node
import { main } from '../src/cli.ts';

main(process.argv.slice(2)).catch((e) => {
  // A refusal carries its exit code and a sentence that says what to do; print the sentence, not a
  // stack. Anything else is a crash, and is printed whole.
  const refused = typeof e?.exitCode === 'number';
  console.error(refused ? e.message : String(e));
  process.exit(refused ? e.exitCode : 1);
});
