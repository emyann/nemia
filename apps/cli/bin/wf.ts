#!/usr/bin/env node
import { main } from '../src/main.ts';
import { Refused } from '../src/refused.ts';

main(process.argv.slice(2), 'wf')
  .then((code) => process.exit(code))
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(e instanceof Refused ? e.code : 1);
  });
