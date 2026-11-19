/**
 * Pairing and first-visit links, the person's side: `nemia pairings ls` (`pairings.list`), the pairings the store keeps, never a code;
 * `nemia pairings approve <code>` (`pairings.approve`), the pairing a client shows approved; `nemia board link [--base <url>]`
 * (`links.mint`), a first-visit link printed once, on stdout; and `nemia open [--base <url>]` (`links.mint`), the same link opened in
 * this machine's browser (`src/browser.ts`), printed only where none opens. The api judges the caller a person before it approves or
 * mints; no answer carries a token.
 */
import { type Args, BOARD_LINK_WORDS, OPEN_WORDS, PAIRINGS_APPROVE_WORDS, PAIRINGS_LS_WORDS } from 'objects';
import { displayed, opened, openerOf } from '../../browser.ts';
import { chosenOf } from '../../context.ts';
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

/**
 * `nemia pairings approve <code>`'s runner: the pairing approved, and how its token is named and revoked.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function pairingsApprove(args: Args): Promise<number> {
  const code = textArg(args, 'code') ?? '';
  const p = await asked(PAIRINGS_APPROVE_WORDS.name, (c) => c.pairings.approve({ payload: { code } }));
  said([
    `approved ${p.client}'s pairing: it claims its token on its next ask, until ${p.expiresAt}`,
    'the token is named after it: nemia token ls lists it once claimed, nemia token rm revokes it',
  ]);
  return 0;
}

/**
 * `nemia board link`'s runner: the link, under `--base` where given, else where the api says the board is, and how long it holds.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function boardLink(args: Args): Promise<number> {
  const base = textArg(args, 'base');
  const { url, expiresAt } = await asked(BOARD_LINK_WORDS.name, (c) => c.links.mint({ payload: base === undefined ? {} : { base } }));
  said([url, `open it once, until ${expiresAt}: it signs that browser in, and no other`]);
  return 0;
}

/**
 * `nemia open`'s runner: a first-visit link minted under `--base` where given, else the remote context's server (the address this
 * machine reaches it at), else where the api says the board is (`localhost` on this machine), and opened in this machine's browser. Where
 * it opened, the board's address is printed without the link's secret; where no opener is tried or the one tried fails, the link is
 * printed, how long it holds, and why it was not opened.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function boardOpen(args: Args): Promise<number> {
  const chosen = chosenOf();
  const base = textArg(args, 'base') ?? (chosen.kind === 'remote' ? chosen.server : undefined);
  const { url, expiresAt } = await asked(OPEN_WORDS.name, (c) => c.links.mint({ payload: base === undefined ? {} : { base } }));
  const opener = openerOf(process.platform, displayed(process.env));
  if (opener.kind === 'open' && (await opened(opener.program, url, process.env))) {
    said([`opened the board at ${new URL(url).origin} in your browser, signed in`]);
    return 0;
  }
  const why =
    opener.kind === 'open'
      ? `${opener.program} did not open it`
      : opener.reason === 'no-display'
        ? 'no display is set here (DISPLAY, WAYLAND_DISPLAY)'
        : `Nemia names no browser opener on ${process.platform}`;
  said([url, `open it once in your browser, until ${expiresAt}, which signs it in: ${why}`]);
  return 0;
}
