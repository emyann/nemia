/**
 * The Setup page's own judgements, pure: the readiness read's pieces in the order of its areas, whether the first visit asks which harness
 * to activate and the harnesses it offers, what a fix's output shows as links and as its code, the answers a fix asks for, the name a
 * browser pairs under, and the first-visit link a page's address carries.
 */
import { READINESS_AREAS, type FixStart, type ReadinessArea, type ReadinessFix, type ReadinessPiece } from 'objects';
import type { HarnessAsked } from '../../contracts/harness-ask.contract.ts';

/** An area of the read, as a person reads its heading. */
export const AREA_WORDS: Record<ReadinessArea, string> = {
  harness: 'Harnesses',
  service: 'Service',
  bind: 'Address',
  machine: 'Machine',
  place: 'Places',
  workflow: 'Workflows',
  repository: 'Repositories',
  factory: 'Factories',
  release: 'Release',
  client: 'This client',
};

/**
 * The pieces of a read grouped by area, the areas in the order `objects` lists them (`READINESS_AREAS`) and each piece in the read's own
 * order; an area with none left out.
 */
export function piecesByArea<P extends { area: ReadinessArea }>(pieces: readonly P[]): Array<{ area: ReadinessArea; pieces: P[] }> {
  return READINESS_AREAS.map((area) => ({ area, pieces: pieces.filter((piece) => piece.area === area) })).filter(
    (group) => group.pieces.length > 0,
  );
}

/** A run of a fix's output: plain text, or a URL drawn as a link. */
type OutputPart = { kind: 'text'; text: string } | { kind: 'link'; text: string };

/** A web address in printed text: `http://` or `https://` up to the first space, quote or angle bracket. */
const URL_IN_TEXT = /https?:\/\/[^\s<>"'`]+/g;

/** What may end a sentence after a URL and is not the URL's: a full stop, a comma, a closing bracket or quote. */
const TRAILING = /[.,;:!?)\]}]+$/;

/**
 * `text` cut into its runs of plain text and its URLs, in order, each URL without the punctuation that closes the sentence it ends
 * (`see https://x.dev/a.` links `https://x.dev/a`). Joined back, the runs are `text` whole.
 */
export function linkedParts(text: string): OutputPart[] {
  const parts: OutputPart[] = [];
  let at = 0;
  for (const match of text.matchAll(URL_IN_TEXT)) {
    const url = match[0].replace(TRAILING, '');
    if (url.length <= 'https://'.length) continue;
    if (match.index > at) parts.push({ kind: 'text', text: text.slice(at, match.index) });
    parts.push({ kind: 'link', text: url });
    at = match.index + url.length;
  }
  if (at < text.length) parts.push({ kind: 'text', text: text.slice(at) });
  return parts;
}

/**
 * The code a fix's output shows, by the pattern its need declares (`code`, a regular expression's source): the last match in `output`,
 * its first group where the pattern has one; none where nothing matches, no pattern is declared, or the pattern is no expression.
 */
export function codeIn(output: string, pattern: string | undefined): string | undefined {
  if (pattern === undefined || pattern === '') return undefined;
  let expression: RegExp;
  try {
    expression = new RegExp(pattern, 'gm');
  } catch {
    return undefined;
  }
  let found: string | undefined;
  for (const match of output.matchAll(expression)) {
    const code = match[1] ?? match[0];
    if (code !== '') found = code;
  }
  return found;
}

/** The answers a fix asks for, each name to what was typed; whether every one is given, trimmed. */
export const answered = (asks: readonly { name: string }[], answers: Readonly<Record<string, string>>): boolean =>
  asks.every((ask) => (answers[ask.name] ?? '').trim() !== '');

/** The answers a fix is started with: each ask's name to what was typed, trimmed. */
export const answersOf = (asks: readonly { name: string }[], answers: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(asks.map((ask) => [ask.name, (answers[ask.name] ?? '').trim()]));

/** The key a fix is started and said under: its piece's factory, workflow and name, and its index among the piece's fixes. */
export const fixKeyOf = (piece: ReadinessPiece, fix: ReadinessFix, i: number): string =>
  [piece.factory ?? '', piece.workflow ?? '', piece.name, String(fix.index ?? i)].join('/');

/** What starts `fix` of `piece`, the `i`th of its fixes, with `answers` to its asks. */
export const startOf = (piece: ReadinessPiece, fix: ReadinessFix, i: number, answers: Readonly<Record<string, string>>): FixStart => ({
  need: piece.name,
  ...(piece.factory === undefined ? {} : { factory: piece.factory }),
  ...(piece.workflow === undefined ? {} : { workflow: piece.workflow }),
  index: fix.index ?? i,
  ...(fix.asks?.length ? { answers: answersOf(fix.asks, answers) } : {}),
});

/**
 * The fixes a piece offers as the list draws them: a piece in place only what takes it away (`removes`, a harness deactivated), any
 * other every fix but that, each with its index among the piece's fixes.
 */
export const shownFixes = (piece: ReadinessPiece): Array<{ fix: ReadinessFix; i: number }> =>
  piece.fixes.flatMap((fix, i) => ((fix.kind === 'removes') === (piece.state === 'met') ? [{ fix, i }] : []));

/** The browsers a pairing's name says, by the mark each puts in its user agent, the more particular first. */
const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Edg\//, 'edge'],
  [/OPR\//, 'opera'],
  [/Firefox\//, 'firefox'],
  [/Chrome\//, 'chrome'],
  [/Safari\//, 'safari'],
];

/** The client name a browser pairs under, `board-<browser>`, the name of the token its claim mints; `board` for one unknown. */
export function clientNameOf(userAgent: string): string {
  const browser = BROWSERS.find(([mark]) => mark.test(userAgent))?.[1];
  return browser === undefined ? 'board' : `board-${browser}`;
}

/** The query key a first-visit link carries its secret in (`<base>/?link=<secret>`). */
const LINK_KEY = 'link';

/** The secret of the first-visit link `href` carries, none where it carries none. */
export function linkSecretOf(href: string): string | undefined {
  const secret = new URL(href).searchParams.get(LINK_KEY);
  return secret === null || secret === '' ? undefined : secret;
}

/** `href` without its first-visit link, as the address bar shows it after: its path, its other keys and its hash kept. */
export function withoutLink(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(LINK_KEY);
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Whether the Setup page asks which harness to activate: while no harness's install piece is in place on the server and the person has
 * not skipped the question in this browser (`skipped`). Read from the read as it is now, so a harness activated from the shell takes the
 * question away. Proved by `contracts/harness-ask.contract.ts`.
 */
export const harnessAsked: HarnessAsked = (pieces, skipped) =>
  !skipped && !pieces.some((p) => p.harness !== undefined && p.harness.part === 'install' && p.state === 'met');

/** A harness the read declares, as the question offers it: its name, as the read says it, its install piece and its sign-in piece. */
export type HarnessChoiceRow<P> = { name: string; install: P; signIn?: P };

/**
 * The harnesses the read declares, one row each in the order the read first names it, each with its install piece and its sign-in
 * piece (`harness.part`); a piece of no harness is left out, and so is a harness the read gives no install piece, which nothing activates.
 */
export function harnessChoices<P extends { harness?: { name: string; part: 'install' | 'sign-in' } }>(
  pieces: readonly P[],
): Array<HarnessChoiceRow<P>> {
  const names = [...new Set(pieces.flatMap((p) => (p.harness === undefined ? [] : [p.harness.name])))];
  return names.flatMap((name) => {
    const of = (part: 'install' | 'sign-in') => pieces.find((p) => p.harness?.name === name && p.harness.part === part);
    const install = of('install');
    const signIn = of('sign-in');
    return install === undefined ? [] : [{ name, install, ...(signIn === undefined ? {} : { signIn }) }];
  });
}
