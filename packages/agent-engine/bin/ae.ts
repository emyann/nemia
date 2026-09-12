#!/usr/bin/env node
import { main } from '../src/cli.ts';

main(process.argv.slice(2)).catch((e) => {
  console.error(String(e));
  process.exit(1);
});
