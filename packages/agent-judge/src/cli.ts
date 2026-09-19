/**
 * `judge`: try the judge on a card by hand. Plain code, no Effect: it parses, calls the facade, prints.
 *
 *   judge status                                         ready, or off and why; exits 0 either way
 *   judge card <file> | --text "…" [--reask] [--record <dir>]
 *
 * `card` files nothing, starts nothing, and nothing calls it. It exits 0 on any verdict, and 2 on a refusal.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Fetch } from '@typesafe-ai/sdk';
import { cardState, MODEL, QUESTIONS, report } from './card.ts';
import { judge, status } from './facade.ts';
import { refuse } from './key.ts';

export type Io = {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly out?: (line: string) => void;
  /** For tests: the facade's `fetch`, and its `retries`. */
  readonly fetch?: Fetch;
  readonly retries?: number;
};

const USAGE = [
  'judge status                                          whether the judge can ask here',
  'judge card <file> | --text "…" [--reask] [--record <dir>]',
  '                                                      ask what a card needs, and say which folder it maps to',
].join('\n');

/** Where `judge card` keeps its record unless told: `$WF_ROOT/judge`, or `~/.agent-workflows/judge`. */
export const defaultRecord = (env: Readonly<Record<string, string | undefined>>) =>
  path.join(env.WF_ROOT || path.join(os.homedir(), '.agent-workflows'), 'judge');

export async function main(argv: readonly string[], io: Io = {}): Promise<number> {
  const env = io.env ?? process.env;
  const out = io.out ?? ((line: string) => console.log(line));
  const [verb, ...rest] = argv;
  switch (verb) {
    case 'status':
      if (rest.length > 0) refuse(`judge status takes nothing; it was given ${rest.join(' ')}.`);
      out(status(env));
      return 0;
    case 'card': {
      let file: string | undefined, text: string | undefined, record: string | undefined, reask = false;
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i]!;
        const value = () => rest[++i] ?? refuse(`judge card: ${a} takes a value.\n${USAGE}`);
        if (a === '--text') text = value();
        else if (a === '--record') record = value();
        else if (a === '--reask') reask = true;
        else if (a.startsWith('-')) refuse(`judge card: unknown option ${a}.\n${USAGE}`);
        else if (file === undefined) file = a;
        else refuse(`judge card: one card at a time; ${file} and ${a} were given.`);
      }
      if ((file === undefined) === (text === undefined)) refuse(`judge card: give a card's file, or its --text, and not both.\n${USAGE}`);
      let source = 'text';
      if (file !== undefined) {
        source = file;
        try {
          text = fs.readFileSync(file, 'utf8');
        } catch (e) {
          refuse(`judge card: cannot read ${file}: ${(e as NodeJS.ErrnoException).code ?? (e as Error).message}.`);
        }
      }
      const state = cardState(text!);
      const dir = path.resolve(record ?? defaultRecord(env));
      const j = judge({ model: MODEL, record: dir, env, ...(io.fetch ? { fetch: io.fetch } : {}), ...(io.retries !== undefined ? { retries: io.retries } : {}) });
      const asked = await j.ask(state, QUESTIONS, reask ? { reask: 'failed' } : {});
      for (const line of report(source, state.card.length, dir, asked)) out(line);
      return 0;
    }
    case undefined:
    case 'help':
    case '--help':
      out(USAGE);
      return verb === undefined ? 2 : 0;
    default:
      return refuse(`judge: no command ${verb}.\n${USAGE}`);
  }
}
