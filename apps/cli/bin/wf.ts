#!/usr/bin/env node
import { main } from '../src/main.ts';
import { exited } from '../src/exited.ts';
import { Refused } from '../src/refused.ts';

main(process.argv.slice(2), 'wf')
  .then(exited)
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    exited(e instanceof Refused ? e.code : 1);
  });
