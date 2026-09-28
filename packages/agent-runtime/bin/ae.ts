#!/usr/bin/env node
/**
 * The `ae` command: `main` over its arguments. A refusal — an error that carries a numeric `exitCode` — prints its sentence,
 * which says what to do, and exits with that code, never with a stack; anything else is a crash, printed whole, and exits 1.
 */
import { main } from '../src/cli/main.ts';

main(process.argv.slice(2)).catch((e) => {
  const refused = typeof e?.exitCode === 'number';
  console.error(refused ? e.message : String(e));
  process.exit(refused ? e.exitCode : 1);
});
