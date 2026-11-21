/**
 * The pictures a Claude Code session is shown in its first message (`config.pictures`): each read from its file as the session is spawned
 * and sent as an image block beside the brief, in the Agent SDK's streaming input (`SDKUserMessage`), as the SDK's documentation sends one.
 * Asked by the attached session and by a job's own process alike, on a fresh start alone: a session resumed saw them.
 */
import fs from 'node:fs';
import type { SpawnRequest } from '../seam.ts';
import type { Picture } from '../args.ts';

/** A block of a user message: words, or a picture as its bytes in base64, as the Messages API takes one. */
export type Block =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: Picture['mediaType']; data: string } };

/** A picture of `config.pictures` that could not be read: the spawn is refused, naming it. */
export class PictureUnread extends Error {}

/**
 * The image blocks of `r`'s `config.pictures`, each read from its file now; none where it names none, or where the session resumes one.
 * Throws `PictureUnread`, naming the file and the fix, for one that cannot be read.
 * @param r The spawn request, whose `config.pictures` and `resumeFrom` are read.
 */
export function pictureBlocks(r: Pick<SpawnRequest, 'config' | 'resumeFrom'>) {
  const blocks: Block[] = [];
  if (r.resumeFrom !== undefined) return blocks;
  for (const p of r.config?.pictures ?? []) {
    let data: string;
    try {
      data = fs.readFileSync(p.path).toString('base64');
    } catch (err) {
      throw new PictureUnread(
        `the picture ${p.path} could not be read (${(err as Error).message}): the session is shown each of \`config.pictures\` in its first message. Give the path to a picture that is there, or leave it off.`,
      );
    }
    blocks.push({ type: 'image', source: { type: 'base64', media_type: p.mediaType, data } });
  }
  return blocks;
}

/**
 * The first message's content: the brief alone where there is no picture, else the brief as a text block and each picture after it.
 * @param brief The first words on the session's input.
 * @param blocks The pictures' image blocks (`pictureBlocks`).
 */
export const openingOf = (brief: string, blocks: readonly Block[]) => {
  const content: string | Block[] = blocks.length ? [{ type: 'text', text: brief }, ...blocks] : brief;
  return content;
};
