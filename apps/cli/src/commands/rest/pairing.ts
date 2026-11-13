/**
 * Pairing and first-visit links, the person's side: `nemia pairings ls` (`pairings.list`), the pairings the store keeps, never a code;
 * `nemia pairings approve <code>` (`pairings.approve`), the pairing a client shows approved; and `nemia board link [--base <url>]`
 * (`pairings.link`), a first-visit link printed once, on stdout. The api judges the caller a person before it approves or mints; no
 * answer carries a token.
 */
import { type Args, BOARD_LINK_WORDS, PAIRINGS_APPROVE_WORDS, PAIRINGS_LS_WORDS } from 'objects';
import { asked } from '../../objects.ts';
import { said, textArg } from '../requests.ts';

/** `nemia pairings ls`' runner: a line a pairing, newest first, or that none is kept. */
export async function pairingsLs(): Promise<number> {
  const { pairings } = await asked(PAIRINGS_LS_WORDS.name, (c) => c.pairings.list());
  said(
    pairings.length
      ? pairings.map((p) => `${p.id}  ${p.client}  ${p.phase}  expires ${p.expiresAt}`)
      : ['no pairing is kept: a client asks for one with nemia pair <url>'],
  );
  return 0;
}

/** `nemia pairings approve <code>`'s runner: the pairing approved, and how its token is named and revoked. */
export async function pairingsApprove(args: Args): Promise<number> {
  const code = textArg(args, 'code') ?? '';
  const p = await asked(PAIRINGS_APPROVE_WORDS.name, (c) => c.pairings.approve({ params: { code } }));
  said([
    `approved ${p.client}'s pairing: it claims its token on its next ask, until ${p.expiresAt}`,
    'the token is named after it: nemia token ls lists it once claimed, nemia token rm revokes it',
  ]);
  return 0;
}

/** `nemia board link`'s runner: the link, under `--base` where given, else where the api says the board is, and how long it holds. */
export async function boardLink(args: Args): Promise<number> {
  const base = textArg(args, 'base');
  const { url, expiresAt } = await asked(BOARD_LINK_WORDS.name, (c) => c.pairings.link({ payload: base === undefined ? {} : { base } }));
  said([url, `open it once, until ${expiresAt}: it signs that browser in, and no other`]);
  return 0;
}
