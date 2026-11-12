/**
 * The store of tickets: a pairing a new client asked for, `<home>/pairings/<id>.json`, and a board's first-visit link,
 * `<home>/links/<digest>.json`, each single-use and short-lived (`ticket.ts`). A file holds only digests of what was handed out — a
 * pairing's short code and secret; a link is found by its secret's digest — beside the client's name and the times: never a code, a
 * secret or a token a reader could present.
 *
 * A pairing is asked with no token (`pairingAsked`), approved by its code from a place already trusted (`pairingApproved`), and claimed
 * with its secret (`pairingClaimed`); a link is minted by the person (`linkMinted`) and claimed by the browser that opens it
 * (`linkClaimed`). A claim marks its ticket claimed by an exclusive write, `<id>.claimed` beside the record (`pairingMarked`,
 * `linkMarked`), before its token is minted, so two claims at once mint one token. The mint is the token store's, done by the claims of
 * `commands.verb.ts` once the mark is taken: no store file imports another but the tree's (`test/boundary.test.ts`).
 *
 * Rooted: every function takes the store's root as `home`, first, with no default (`test/root-given.test.ts`), and its clock as `nowMs`.
 * Refusals are thrown: `Missing` for a ticket the store does not keep or a wrong secret, `Conflict` for one claimed already or past its
 * time, `Invalid` for a client's name no token would take.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Result, Schema } from 'effect';
import type { LinkMinted, Pairing, PairingAsked, PairingList, TicketState } from 'objects';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { writeWhole } from '../whole-file/whole-file.store.ts';
import { codeRead, codeShown, LINK_TTL_MS, PAIRING_TTL_MS, shortCode, ticketState, type Ticket } from './ticket.ts';

/** The longest client's name a pairing takes: a token's name, 63 at most, with room for the suffix that makes it unique. */
const CLIENT_NAME_MAX = 56;

/** A client's name a pairing takes: a name a person's token takes, `CLIENT_NAME_MAX` at most. */
const CLIENT_NAME = new RegExp(`^[A-Za-z0-9][A-Za-z0-9._-]{0,${CLIENT_NAME_MAX - 1}}$`);

/** The digest a code or a secret is kept and found by: its sha-256, in hex. */
export const ticketDigest = (text: string): string => crypto.createHash('sha256').update(text).digest('hex');

/** How long a ticket's files are kept past its time, for the list: a day. */
const KEPT_MS = 24 * 60 * 60_000;

/** The folder of pairings, under the store `home`. */
export const pairingsDir = (home: string): string => path.join(home, 'pairings');

/** The folder of first-visit links, under the store `home`. */
export const linksDir = (home: string): string => path.join(home, 'links');

/** What a pairing's file holds: its id, the client's name, the digests of its code and its secret, and its times in ms. */
const PairingFiled = Schema.Struct({
  id: Schema.String,
  client: Schema.String,
  codeDigest: Schema.String,
  secretDigest: Schema.String,
  createdAtMs: Schema.Number,
  ttlMs: Schema.Number,
  approvedAtMs: Schema.optionalKey(Schema.Number),
});
type PairingFiled = typeof PairingFiled.Type;

/** What a link's file holds: its times in ms. Its secret's digest is its file's name. */
const LinkFiled = Schema.Struct({ createdAtMs: Schema.Number, ttlMs: Schema.Number });
type LinkFiled = typeof LinkFiled.Type;

/** What a claim's mark holds: when the ticket was claimed. */
const ClaimFiled = Schema.Struct({ claimedAtMs: Schema.Number });

/** An id a pairing is filed under: what `pairingAsked` makes, letters, digits, `_` and `-`. */
const PAIRING_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** `text` read as JSON through `schema`, or undefined where it does not read. */
function decoded<T>(schema: Schema.Decoder<T>, text: string): T | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  const read = Schema.decodeUnknownResult(schema)(raw);
  return Result.isSuccess(read) ? read.success : undefined;
}

/** The text of `file`, or undefined where there is none. */
function textOf(file: string): string | undefined {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

/** The file `record` is kept in, written whole, readable by its owner alone in a folder its owner alone opens. */
function filed(file: string, record: object): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeWhole(file, `${JSON.stringify(record)}\n`, { mode: 0o600 });
}

/** The mark of a ticket's claim, beside its record. */
const markOf = (file: string): string => file.replace(/\.json$/, '.claimed');

/** When the ticket kept in `file` was claimed, off its mark, or undefined where it was not. */
const claimedAt = (file: string): number | undefined => {
  const text = textOf(markOf(file));
  if (text === undefined) return undefined;
  return decoded(ClaimFiled, text)?.claimedAtMs ?? 0;
};

/**
 * Marks the ticket kept in `file` claimed at `nowMs`, by a write that fails where the mark is there already: only one claim of a ticket
 * gets past it. Refused (`Conflict`) where another claim got there first.
 */
function marked(file: string, nowMs: number): void {
  try {
    fs.writeFileSync(markOf(file), `${JSON.stringify({ claimedAtMs: nowMs })}\n`, { flag: 'wx', mode: 0o600 });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST')
      throw new Conflict({ message: 'this ticket was claimed already, and is claimed once: ask for a new one.' });
    throw err;
  }
}

/** Whether the digests `a` and `b` are the same, compared in constant time. */
const same = (a: string, b: string): boolean => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** A new secret: 32 random bytes in base64url. */
const secretNew = (): string => crypto.randomBytes(32).toString('base64url');

/** An ISO date of the ms `ms`. */
const iso = (ms: number): string => new Date(ms).toISOString();

/** The ticket a pairing is, as `ticketState` reads it: it needs an approval. */
const pairingTicket = (p: PairingFiled, claimed: number | undefined): Ticket => ({
  createdAtMs: p.createdAtMs,
  ttlMs: p.ttlMs,
  needsApproval: true,
  ...(p.approvedAtMs !== undefined ? { approvedAtMs: p.approvedAtMs } : {}),
  ...(claimed !== undefined ? { claimedAtMs: claimed } : {}),
});

/** The file of the pairing `id`, under the store `home`. */
const pairingFile = (home: string, id: string): string => path.join(pairingsDir(home), `${id}.json`);

/** Every pairing the store keeps, with its file and its claim; one whose file does not read is left out. */
function pairingsKept(home: string): Array<{ file: string; pairing: PairingFiled; claimed: number | undefined }> {
  const dir = pairingsDir(home);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json') && !name.startsWith('.'))
    .flatMap((name) => {
      const file = path.join(dir, name);
      const text = textOf(file);
      const pairing = text === undefined ? undefined : decoded(PairingFiled, text);
      return pairing === undefined ? [] : [{ file, pairing, claimed: claimedAt(file) }];
    });
}

/** Removes the files of every ticket in `dir` whose time ended more than `KEPT_MS` before `nowMs`, claimed or not. */
function swept(dir: string, nowMs: number): void {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.json') && !n.startsWith('.'))) {
    const file = path.join(dir, name);
    const text = textOf(file);
    const times = text === undefined ? undefined : decoded(LinkFiled, text);
    if (times !== undefined && nowMs >= times.createdAtMs + times.ttlMs + KEPT_MS) {
      fs.rmSync(markOf(file), { force: true });
      fs.rmSync(file, { force: true });
    }
  }
}

/** The pairing as the list shows it: never its code nor its secret. */
const pairingShown = (p: PairingFiled, claimed: number | undefined, nowMs: number): Pairing => ({
  id: p.id,
  client: p.client,
  phase: ticketState(pairingTicket(p, claimed), nowMs),
  createdAt: iso(p.createdAtMs),
  expiresAt: iso(p.createdAtMs + p.ttlMs),
});

/**
 * A pairing asked for by the client `client` at `nowMs`: its id, its short code (shown `XXXX-XXXX`), its secret, each answered this once,
 * and when it lapses. The store keeps the digests of the code and the secret. Refused (`Invalid`): a client's name no token takes.
 */
export function pairingAsked(home: string, client: string, nowMs: number): PairingAsked {
  if (!CLIENT_NAME.test(client))
    throw new Invalid({
      message: `a pairing takes the client's name in letters, digits, \`.\`, \`_\` or \`-\`, starting with a letter or a digit, ${CLIENT_NAME_MAX} at most, and \`${client}\` is not one: name it for the machine, as nemia pair <url> --name laptop.`,
    });
  swept(pairingsDir(home), nowMs);
  const id = crypto.randomBytes(12).toString('base64url');
  const code = shortCode();
  const secret = secretNew();
  const record: PairingFiled = {
    id,
    client,
    codeDigest: ticketDigest(code),
    secretDigest: ticketDigest(secret),
    createdAtMs: nowMs,
    ttlMs: PAIRING_TTL_MS,
  };
  filed(pairingFile(home, id), record);
  return { id, code: codeShown(code), secret, expiresAt: iso(nowMs + PAIRING_TTL_MS) };
}

/** A ticket's claim marked: the name its token is to be minted under, and how the mark is taken back where the mint is refused. */
export type Marked = { readonly name: string; readonly unmarked: () => void };

/** The mark of the ticket kept in `file` taken at `nowMs` (`marked`), for a token named `name`. */
const markTaken = (file: string, name: string, nowMs: number): Marked => {
  marked(file, nowMs);
  return { name, unmarked: () => fs.rmSync(markOf(file), { force: true }) };
};

/**
 * The pairing `id`'s claim with `secret` at `nowMs`, marked: a pairing that waits for its approval answers its phase alone, and the
 * client asks again; an approved one is marked claimed, its token to be minted under its client's name. Refused: a pairing the store
 * does not keep or a secret not its own (`Missing`), and one claimed already or past its time (`Conflict`).
 */
export function pairingMarked(home: string, id: string, secret: string, nowMs: number): { phase: 'waiting' } | Marked {
  const file = PAIRING_ID.test(id) ? pairingFile(home, id) : undefined;
  const text = file === undefined ? undefined : textOf(file);
  const pairing = text === undefined ? undefined : decoded(PairingFiled, text);
  if (file === undefined || pairing === undefined || !same(pairing.secretDigest, ticketDigest(secret)))
    throw new Missing({ message: `no pairing ${id} is kept with that secret: ask for a new one, as nemia pair <url> does.` });
  const phase = ticketState(pairingTicket(pairing, claimedAt(file)), nowMs);
  if (phase === 'waiting') return { phase };
  if (phase !== 'claimable') throw claimRefusal(phase, 'pairing', 'ask for a new one, as nemia pair <url> does');
  return markTaken(file, pairing.client, nowMs);
}

/** The refusal of a claim of a ticket of `kind` that stands `phase`, naming `next`. */
const claimRefusal = (phase: Exclude<TicketState, 'claimable' | 'waiting'>, kind: string, next: string): Conflict =>
  new Conflict({
    message:
      phase === 'claimed'
        ? `this ${kind} was claimed already, and is claimed once: ${next}.`
        : `this ${kind} has lapsed, unclaimed: ${next}.`,
  });

/** The pairings the store keeps at `nowMs`, newest first: each its id, client, phase and times, never its code nor its secret. */
export function pairingsListed(home: string, nowMs: number): PairingList {
  return {
    pairings: pairingsKept(home)
      .sort((a, b) => b.pairing.createdAtMs - a.pairing.createdAtMs)
      .map(({ pairing, claimed }) => pairingShown(pairing, claimed, nowMs)),
  };
}

/**
 * The pairing whose short code is `code` (`XXXX-XXXX`, in either case, with or without its dash) approved at `nowMs`: its client may
 * claim its token from then on. One approved already is answered as it stands. Refused: no pairing kept under that code (`Missing`), and
 * one past its time or claimed already (`Conflict`).
 */
export function pairingApproved(home: string, code: string, nowMs: number): Pairing {
  const read = codeRead(code);
  const digest = read === undefined ? undefined : ticketDigest(read);
  const found = digest === undefined ? undefined : pairingsKept(home).find(({ pairing }) => same(pairing.codeDigest, digest));
  if (found === undefined)
    throw new Missing({
      message: `no pairing waits under the code ${code}: read the code the client shows, or nemia pairings ls lists the pairings kept.`,
    });
  const { file, pairing, claimed } = found;
  const phase = ticketState(pairingTicket(pairing, claimed), nowMs);
  if (phase === 'expired' || phase === 'claimed')
    throw claimRefusal(phase, 'pairing', 'the client asks for a new one, as nemia pair <url> does, and shows its new code');
  if (phase === 'claimable') return pairingShown(pairing, claimed, nowMs);
  const approved: PairingFiled = { ...pairing, approvedAtMs: nowMs };
  filed(file, approved);
  return pairingShown(approved, claimed, nowMs);
}

/** The file of the link whose secret's digest is `digest`, under the store `home`. */
const linkFile = (home: string, digest: string): string => path.join(linksDir(home), `${digest}.json`);

/**
 * A first-visit link minted at `nowMs`: the board's address `base` with the link's secret (`<base>/?link=<secret>`), answered this once,
 * and when it lapses. The store keeps the secret's digest alone, as the link's file's name. Refused (`Invalid`): a base that is no
 * http or https address.
 */
export function linkMinted(home: string, base: string, nowMs: number): LinkMinted {
  if (!/^https?:$/.test(URL.parse(base)?.protocol ?? ''))
    throw new Invalid({
      message: `a first-visit link is printed under the board's http or https address, and ${base} is none: --base http://<host>:<port>, as --base http://box:8787.`,
    });
  swept(linksDir(home), nowMs);
  const secret = secretNew();
  filed(linkFile(home, ticketDigest(secret)), { createdAtMs: nowMs, ttlMs: LINK_TTL_MS } satisfies LinkFiled);
  return { url: `${base.replace(/\/+$/, '')}/?link=${secret}`, expiresAt: iso(nowMs + LINK_TTL_MS) };
}

/** The name a first-visit link's token takes: `board-` and the day it was claimed, `board-<yyyy-mm-dd>`. */
const boardName = (nowMs: number): string => `board-${iso(nowMs).slice(0, 10)}`;

/**
 * The claim of the first-visit link whose secret is `secret` at `nowMs`, marked: its token to be minted for the browser that opened it,
 * named `board-<day>`. Refused: a link the store does not keep (`Missing`), and one claimed already or past its time (`Conflict`).
 */
export function linkMarked(home: string, secret: string, nowMs: number): Marked {
  const file = linkFile(home, ticketDigest(secret));
  const text = textOf(file);
  const link = text === undefined ? undefined : decoded(LinkFiled, text);
  if (link === undefined)
    throw new Missing({ message: 'no first-visit link is kept under that secret: nemia board link, at the server, prints a new one.' });
  const phase = ticketState({ createdAtMs: link.createdAtMs, ttlMs: link.ttlMs, needsApproval: false, ...claimedOf(file) }, nowMs);
  if (phase === 'claimed' || phase === 'expired')
    throw claimRefusal(phase, 'first-visit link', 'nemia board link, at the server, prints a new one');
  return markTaken(file, boardName(nowMs), nowMs);
}

/** The ticket's claim kept in `file`, as `Ticket` takes it: none where it was not claimed. */
const claimedOf = (file: string): { claimedAtMs?: number } => {
  const at = claimedAt(file);
  return at === undefined ? {} : { claimedAtMs: at };
};
