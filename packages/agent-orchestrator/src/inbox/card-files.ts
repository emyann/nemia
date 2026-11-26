/**
 * A card's files: the files it names by the api's File id under its `files:` key, each by the name its text and its run find it by. Why
 * the files as given cannot be written (`cardFilesRefusal`), asked wherever a card's `files:` is written, before anything is written;
 * whether a file the card holds is taken off as more are attached (`cardFileReplaced`), a gone reference replaced by a file attached under
 * its name; and whether a kept File is let go of (`fileLetGo`), asked by the files' prune (the File door's `pruned`) of every file it
 * reads. Each pure, proved by `contracts/card-files.contract.ts`. Beside them, the refusal's words, each naming the fix.
 */
import type {
  CardFileGiven,
  CardFileHeld,
  CardFileReplaced,
  CardFilesRefusal,
  CardFilesRefusalOf,
  FileLetGo,
} from '../../contracts/card-files.contract.ts';
import { CLI } from 'objects';

/** The folder of a run's `inputs/` the handed cards are copied into, which no file of a card may take the place of. */
const CARDS = 'cards';

/** Whether `name` is a file's own name: not empty, no folder in it, not hidden, no NUL, and not the cards' folder. */
const ownName = (name: string) =>
  name.length > 0 && !name.includes('/') && !name.includes('\\') && !name.includes('\u0000') && !name.startsWith('.') && name !== CARDS;

/** Whether `given` holds the very files of `held`, as many of them, in any order. */
const sameFiles = (given: readonly CardFileGiven[], held: readonly CardFileHeld[]) =>
  given.length === held.length &&
  given.every((g) => held.some((h) => h.name === g.name && h.file === g.file)) &&
  held.every((h) => given.some((g) => h.name === g.name && h.file === g.file));

/**
 * Why a card's files as given cannot be written, or undefined where they can: a started card's change first, then the first file whose
 * name is no file's own, given twice or naming no kept File, then the count and the bytes past what a card holds.
 * @param given The files as they are to be, each with the size of the File its id names in the card's namespace (null for none).
 * @param held The files the card holds now.
 * @param started Whether a run was started from the card.
 * @param most How many files, and how many bytes in all, a card holds.
 * @param bytes The bytes of every kept File of `given` together, as the store sums their sizes.
 */
export const cardFilesRefusal: CardFilesRefusalOf = (given, held, started, most, bytes) => {
  if (sameFiles(given, held)) return undefined;
  if (started) return { reason: 'started' };
  const misnamed = given.find((f) => !ownName(f.name));
  if (misnamed !== undefined) return { reason: 'name', name: misnamed.name };
  const twice = given.find((f, i) => given.some((o, j) => j !== i && o.name === f.name));
  if (twice !== undefined) return { reason: 'twice', name: twice.name };
  const unkept = given.find((f) => f.size === null);
  if (unkept !== undefined) return { reason: 'unkept', name: unkept.name };
  if (given.length > most.count) return { reason: 'count' };
  if (bytes > most.bytes) return { reason: 'bytes' };
  return undefined;
};

/**
 * Whether the file a card holds is taken off as files are attached beside it: its File is no longer kept, and a file is attached under its
 * name, which takes its place. A held file whose File is still kept stays, so a name attached again beside it is refused as given twice
 * (`cardFilesRefusal`).
 * @param held The file the card holds, with the size of its File kept in the card's namespace (null where none is).
 * @param attached The files attached.
 */
export const cardFileReplaced: CardFileReplaced = (held, attached) => held.size === null && attached.some((a) => a.name === held.name);

/**
 * Whether the prune lets a kept File go: no card names it, and its day from its last write is over.
 * @param file When it was last written, and whether an inbox card's text names it.
 * @param now The time it is now, in milliseconds.
 * @param keptFor How long a File no card names is kept, in milliseconds.
 */
export const fileLetGo: FileLetGo = (file, now, keptFor) => !file.named && now - file.writtenAt >= keptFor;

/**
 * What a refusal of a card's files says, naming the fix.
 * @param refusal Why the files cannot be written.
 * @param card The card's name, as the commands that fix it take it.
 * @param most How many files, and how many bytes, a card holds.
 */
export function cardFilesWords(refusal: CardFilesRefusal, card: string, most: { readonly count: number; readonly bytes: number }) {
  switch (refusal.reason) {
    case 'started':
      return `The card ${card} was started, and its run took its files as they were: a started card's files: do not change. File a new card with the files it is to carry: ${CLI} inbox add "<idea>" --file <path>.`;
    case 'name':
      return `The card ${card} cannot carry a file named \`${refusal.name}\`: a file's name has no folder in it, does not start with a dot, and is not \`cards\`. Give it another name.`;
    case 'twice':
      return `The card ${card} names two files \`${refusal.name}\`: a run keeps its inputs by name, in one folder. Give one of them another name.`;
    case 'unkept':
      return `The card ${card}'s file \`${refusal.name}\` names no File its factory keeps: it was never uploaded there, or let go of a day after its upload. Upload it again and attach it: ${CLI} inbox attach ${card} <path>.`;
    case 'count':
      return `The card ${card} would carry more than ${most.count} files, which is all a card carries. Take some off (${CLI} inbox detach ${card} <file>), or put them in one archive.`;
    case 'bytes':
      return `The card ${card}'s files would come to more than ${Math.round(most.bytes / 1024 / 1024)} MiB together, which is all a card carries. Take some off (${CLI} inbox detach ${card} <file>), or hand the run the large ones at its start with --input.`;
  }
}

export type { CardFileGiven, CardFilesRefusal };
