/**
 * `nemia inbox attach <name> <path>...`, `nemia inbox detach <name> <file>...` and `nemia inbox files <name> [--get <file> [--out
 * <path>]]`: the files a card carries. Attach uploads each file first to the card's namespace (`uploaded`, as `nemia start --input`
 * does) and names them to the card by their ids through the Card's `attach`; detach takes each off by its name in the card through the
 * Card's `detach`; files lists them as the card's read says them, and `--get` writes one's bytes out, read off the files' `content`. Each
 * card is found across namespaces (`namespaceOfCard`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DEFAULT_NAMESPACE, filesNamed, INBOX_ATTACH_WORDS, INBOX_DETACH_WORDS, INBOX_FILES_WORDS, type Args, type Card } from 'objects';
import { sessionHeaders, urlOf } from '../../client.ts';
import { served } from '../../daemon.ts';
import { asked } from '../../objects.ts';
import { Refused } from '../../refused.ts';
import { namespaceOfCard, said, textArg } from '../requests.ts';
import { inputsOf, uploaded } from '../runs/start.ts';

/** A size as a line says it, in bytes. */
const bytesSaid = (size: number | undefined) => (size === undefined ? 'not kept' : `${size} bytes`);

/**
 * A line per file `card` carries: its name, its File, its size and type, whether its text names it, and whether it is kept; a line
 * saying so where it carries none.
 * @param card The card, as the api answers it.
 */
export function cardFileLines(card: Card) {
  const files = card.status.files ?? [];
  if (!files.length) return [`${card.metadata.name}  carries no file — attach one with nemia inbox attach ${card.metadata.name} <path>`];
  return files.map(
    (f) =>
      `${card.metadata.name}  ${f.name}  ${f.file}  ${bytesSaid(f.size)}${f.mediaType ? `  ${f.mediaType}` : ''}${f.inText ? '  in its text' : ''}${f.kept ? '' : '  let go of: attach it again'}`,
  );
}

/**
 * `nemia inbox attach`'s runner, on the words parsed against its words.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function inboxAttach(args: Args) {
  const command = INBOX_ATTACH_WORDS.name;
  const name = textArg(args, 'name') ?? '';
  const given = inputsOf(filesNamed(args), 'nemia inbox attach', 'the file');
  const namespace = await namespaceOfCard(command, name);
  const files = await uploaded(namespace, given, command);
  said(cardFileLines(await asked(command, (c) => c.cards.attach({ params: { namespace, name }, payload: { files } }))));
  return 0;
}

/**
 * `nemia inbox detach`'s runner, on the words parsed against its words.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function inboxDetach(args: Args) {
  const command = INBOX_DETACH_WORDS.name;
  const name = textArg(args, 'name') ?? '';
  const namespace = await namespaceOfCard(command, name);
  let card: Card | undefined;
  for (const file of filesNamed(args)) card = await asked(command, (c) => c.cards.detach({ params: { namespace, name, file } }));
  if (card !== undefined) said(cardFileLines(card));
  return 0;
}

/**
 * The bytes of the File `file` of `namespace` written to `out`, read off the files' `content` as they come.
 * @param namespace The card's namespace.
 * @param file The File's id.
 * @param out The path to write it to.
 */
async function written(namespace: string, file: string, out: string) {
  const command = INBOX_FILES_WORDS.name;
  const base = await served(command);
  const res = await fetch(urlOf(base, `/api/namespaces/${encodeURIComponent(namespace)}/files/${encodeURIComponent(file)}/content`), {
    headers: sessionHeaders(),
  });
  if (!res.ok || res.body === null) {
    await res.body?.cancel();
    throw new Refused(
      `nemia inbox files could not read the File ${file} (${res.status}): it was let go of, or never kept. Attach it again: nemia inbox attach <name> <path>.`,
    );
  }
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(out));
}

/**
 * `nemia inbox files`'s runner, on the words parsed against its words.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function inboxFiles(args: Args) {
  const command = INBOX_FILES_WORDS.name;
  const name = textArg(args, 'name') ?? '';
  const card = await asked(command, (c) => c.cards.getAll({ params: { name } }));
  const get = textArg(args, 'get');
  if (get === undefined) {
    said(cardFileLines(card));
    return 0;
  }
  const one = (card.status.files ?? []).find((f) => f.name === get);
  if (one === undefined)
    throw new Refused(
      `The card ${name} carries no file named ${get}. Name one of those nemia inbox files ${name} lists: nemia inbox files ${name} --get <file>.`,
    );
  const out = textArg(args, 'out') ?? path.join(process.cwd(), one.name);
  await written(card.metadata.namespace ?? DEFAULT_NAMESPACE, one.file, out);
  said([`${name}  ${one.name}  written to ${out}`]);
  return 0;
}
