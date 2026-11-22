/**
 * A card's files (agent-orchestrator, src/inbox/card-files.ts): the files a card names by the api's File id under its `files:` key, each
 * by the name its text and its run find it by. Why a card's files as given cannot be written (`cardFilesRefusal`), asked wherever a
 * card's `files:` is written — filed, written whole, edited from its text — before anything is written; and whether a kept File is let go
 * of (`fileLetGo`), asked by the files' prune (`filesPruned`, src/start/files.store.ts) of every file it reads.
 *
 * Each spec exports its type under the function's name, and the code takes it. What the store keeps under an id, which ids a card
 * names, and the bytes of the files given together (the sum of their kept Files' sizes), are read by the stores and handed in as data.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * One file of a card as it is given: the name it takes in the card (`name`, what its text and its run's `inputs/` find it by), the File
 * it names (`file`, an id `file_…`), and the size of the File kept under that id in the card's namespace, in bytes — null where the
 * namespace keeps no File under it (never uploaded, uploaded elsewhere, let go of).
 */
export type CardFileGiven = { readonly name: string; readonly file: string; readonly size: number | null };

/** One file of a card as it stands: its name and the File it names. */
export type CardFileHeld = { readonly name: string; readonly file: string };

/** How many files a card may hold (`count`), and how many bytes all of them together (`bytes`). */
export type CardFilesMost = { readonly count: number; readonly bytes: number };

/**
 * Why a card's files cannot be written, closed: `started`, they differ from the card's own and a run was started from it, which took
 * them as they were; `name`, a name that is no file's own (empty, a slash, a leading dot, NUL, `cards`, the folder a run keeps handed
 * cards in); `twice`, a name given to two files; `unkept`, an id the namespace keeps no File under; `count` and `bytes`, past what a
 * card holds (`CardFilesMost`). `name` is the file the refusal is about, where it is about one.
 */
export type CardFilesRefusal =
  | { readonly reason: 'started' }
  | { readonly reason: 'name'; readonly name: string }
  | { readonly reason: 'twice'; readonly name: string }
  | { readonly reason: 'unkept'; readonly name: string }
  | { readonly reason: 'count' }
  | { readonly reason: 'bytes' };

/** The folder of a run's `inputs/` the cards handed with `--card` are copied into: a file of that name would take its place. */
const CARDS = 'cards';

/** Whether `name` is a file's own name: not empty, no folder in it, not hidden, no NUL, and not the cards' folder. */
const ownName = (name: string) =>
  name.length > 0 && !name.includes('/') && !name.includes('\\') && !name.includes('\u0000') && !name.startsWith('.') && name !== CARDS;

/** Whether `name` is given to more than one file of `given`: two files at two places both named so. */
const givenTwice = (given: readonly CardFileGiven[], name: string) =>
  given.some((f, i) => f.name === name && given.some((o, j) => j !== i && o.name === name));

/** Whether two files name the same File under the same name. */
const sameFile = (a: CardFileHeld, b: CardFileHeld) => a.name === b.name && a.file === b.file;

/** Whether `given` holds the very files of `held`: each of either is in the other, as many of them. */
const sameFiles = (given: readonly CardFileGiven[], held: readonly CardFileHeld[]) =>
  given.length === held.length &&
  given.every((g) => held.some((h) => sameFile(g, h))) &&
  held.every((h) => given.some((g) => sameFile(g, h)));

/** Whether anything is wrong with `given` beside a started card's change: the cases a refusal other than `started` is about. */
const wrongAsGiven = (given: readonly CardFileGiven[], most: CardFilesMost, bytes: number) =>
  given.some((f) => !ownName(f.name) || givenTwice(given, f.name) || f.size === null) || given.length > most.count || bytes > most.bytes;

const cardFilesRefusalSpec = spec<
  (
    given: readonly CardFileGiven[],
    held: readonly CardFileHeld[],
    started: boolean,
    most: CardFilesMost,
    bytes: number,
  ) => CardFilesRefusal | undefined
>({
  requires: ({ input: [given, , , most, bytes] }) =>
    Number.isSafeInteger(bytes) &&
    bytes >= 0 &&
    Number.isSafeInteger(most.count) &&
    most.count > 0 &&
    Number.isSafeInteger(most.bytes) &&
    most.bytes > 0 &&
    given.every((f) => f.size === null || (Number.isSafeInteger(f.size) && f.size >= 0)),
  ensures: {
    aStartedCardKeepsItsFiles: {
      description: 'A card a run was started from keeps the files the run took: any change to them is refused',
      condition: ({ input: [given, held, started], output }) => !started || sameFiles(given, held) || output !== undefined,
    },
    aStartedCardIsSaidStarted: {
      description: 'A started card whose files change is refused as started, whatever else is wrong with them',
      condition: ({ input: [given, held, started], output }) =>
        !started || sameFiles(given, held) || (output !== undefined && output.reason === 'started'),
    },
    startedOnlyWhenStartedAndChanged: {
      description: 'Started is said only of a card a run was started from, whose files change',
      condition: ({ input: [given, held, started], output }) =>
        output === undefined || output.reason !== 'started' || (started && !sameFiles(given, held)),
    },
    unchangedIsNeverRefused: {
      description: "Files written as the card holds them are never refused: an edit of a card's text judges no file it leaves alone",
      condition: ({ input: [given, held], output }) => !sameFiles(given, held) || output === undefined,
    },
    aFilesOwnName: {
      description: "A change that gives a name that is no file's own is refused",
      condition: ({ input: [given, held], output }) =>
        sameFiles(given, held) || given.every((f) => ownName(f.name)) || output !== undefined,
    },
    oneNameOneFile: {
      description: 'A change that gives one name to two files is refused: a run keeps its inputs by name, in one folder',
      condition: ({ input: [given, held], output }) =>
        sameFiles(given, held) || given.every((f) => !givenTwice(given, f.name)) || output !== undefined,
    },
    aKeptFile: {
      description: 'A change that names an id the namespace keeps no File under is refused: a card names files that are there',
      condition: ({ input: [given, held], output }) =>
        sameFiles(given, held) || given.every((f) => f.size !== null) || output !== undefined,
    },
    asManyAsACardHolds: {
      description: 'A change to more files than a card holds is refused',
      condition: ({ input: [given, held, , most], output }) => sameFiles(given, held) || given.length <= most.count || output !== undefined,
    },
    asLargeAsACardHolds: {
      description: 'A change to files whose bytes together pass what a card holds is refused',
      condition: ({ input: [given, held, , most, bytes], output }) => sameFiles(given, held) || bytes <= most.bytes || output !== undefined,
    },
    whatIsSaidIsTrue: {
      description: 'A refusal names a wrong the files have: the file it names is given, and is wrong that way',
      condition: ({ input: [given, , , most, bytes], output }) =>
        output === undefined ||
        output.reason === 'started' ||
        (output.reason === 'name' && given.some((f) => f.name === output.name && !ownName(f.name))) ||
        (output.reason === 'twice' && givenTwice(given, output.name)) ||
        (output.reason === 'unkept' && given.some((f) => f.name === output.name && f.size === null)) ||
        (output.reason === 'count' && given.length > most.count) ||
        (output.reason === 'bytes' && bytes > most.bytes),
    },
    acceptedOtherwise: {
      description: 'A change to the files of a card no run was started from, with none of those wrongs, is written',
      condition: ({ input: [given, , started, most, bytes], output }) =>
        started || wrongAsGiven(given, most, bytes) || output === undefined,
    },
  },
  /** Which of several wrongs is said, where files have more than one beside a started card's change, is the code's: each is true. */
  open: ['output'],
});

/** Why a card's files as given cannot be written, or undefined where they can. */
export type CardFilesRefusalOf = Implementation<typeof cardFilesRefusalSpec>;

/** Whether two files are the one file: the same name, the same File, the same size kept. */
const sameGiven = (a: CardFileGiven, b: CardFileGiven) => a.name === b.name && a.file === b.file && a.size === b.size;

/**
 * Whether the held file `held` is a reference that is gone, which a file attached under its name takes the place of: its File is no
 * longer kept in the card's namespace, and one of `attached` is given its name.
 */
const replacedBy = (held: CardFileGiven, attached: readonly CardFileGiven[]) =>
  held.size === null && attached.some((a) => a.name === held.name);

const cardFilesAttachedSpec = spec<(held: readonly CardFileGiven[], attached: readonly CardFileGiven[]) => readonly CardFileGiven[]>({
  ensures: {
    aGoneReferenceIsReplaced: {
      description:
        "A file the card holds whose File is no longer kept is taken off where a file is attached under its name: attaching it again is how the refusal at start is answered",
      condition: ({ input: [held, attached], output }) =>
        output.length === held.filter((h) => !replacedBy(h, attached)).length + attached.length,
    },
    whatIsKeptStays: {
      description:
        'Every other file the card holds stays, a kept File under a name attached again among them, so two files of one name are still refused',
      condition: ({ input: [held, attached], output }) =>
        held.every((h) => replacedBy(h, attached) || output.some((o) => sameGiven(o, h))),
    },
    everyAttachedFileIsCarried: {
      description: 'Every file attached is carried',
      condition: ({ input: [held, attached], output }) => attached.every((a) => output.some((o) => sameGiven(o, a))),
    },
    nothingElseIsCarried: {
      description: 'The card carries no file it neither held nor was attached',
      condition: ({ input: [held, attached], output }) =>
        output.every((o) => held.some((h) => sameGiven(o, h)) || attached.some((a) => sameGiven(o, a))),
    },
  },
});

/**
 * The files a card is to carry once `attached` are attached beside the ones it holds (`held`), each with the size of its File kept in the
 * card's namespace: the held, but each whose File is gone and whose name an attached file takes, then the attached. What `cardFilesRefusal`
 * then judges.
 */
export type CardFilesAttached = Implementation<typeof cardFilesAttachedSpec>;

/**
 * A kept File as the prune reads it: when it was last written, in milliseconds, and whether a card names it — its id written anywhere in
 * an inbox card's text, a card that does not read included, so a card nobody can parse loses none of its files.
 */
export type KeptFile = { readonly writtenAt: number; readonly named: boolean };

const fileLetGoSpec = spec<(file: KeptFile, now: number, keptFor: number) => boolean>({
  requires: ({ input: [file, now, keptFor] }) =>
    Number.isSafeInteger(file.writtenAt) &&
    file.writtenAt >= 0 &&
    Number.isSafeInteger(now) &&
    now >= 0 &&
    Number.isSafeInteger(keptFor) &&
    keptFor > 0,
  ensures: {
    aCardKeepsItsFiles: {
      description: 'A File a card names is kept, however old',
      condition: ({ input: [file], output }) => !file.named || !output,
    },
    aDayForAStart: {
      description: 'A File no card names is kept its day from when it was last written',
      condition: ({ input: [file, now, keptFor], output }) => now - file.writtenAt >= keptFor || !output,
    },
    letGoOnceUnnamedAndOld: {
      description: 'A File no card names, written longer ago than its day, is let go of',
      condition: ({ input: [file, now, keptFor], output }) => file.named || now - file.writtenAt < keptFor || output,
    },
  },
});

/** Whether the prune lets a kept File go: no card names it, and its day from its last write is over. */
export type FileLetGo = Implementation<typeof fileLetGoSpec>;
