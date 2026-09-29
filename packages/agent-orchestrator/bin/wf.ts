#!/usr/bin/env node
import { exitCodeOf } from '../src/cli/exit.ts';

import('../src/cli/main.ts')
  .then(({ main }) => main(process.argv.slice(2)))
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(exitCodeOf(e));
  });
