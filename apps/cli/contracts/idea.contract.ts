/**
 * What an idea typed to `nemia inbox add` (and every command that takes text or one file) is (apps/cli,
 * src/commands/inbox/card-lines.ts, `ideaOf`), from the words typed and what the machine has at that path: a file's text where it names
 * a file; a folder refused, as before; and words otherwise — but for words that read as a path, one word with no space, tab or newline
 * that holds a `/` or ends in `.md`, which name no file: those are refused as a path that is not there, so a typo in a card's path never
 * files the path's own text as a card. Reading the file, and the words of the refusal, are the code's: tests hold those.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** What the machine has at the path the words would name: a file, a folder, or nothing. */
export type FoundAt = 'file' | 'folder' | 'none';

/** What the idea is: a file to read, the words themselves, or refused — a folder, or a path to no file. */
export type Idea =
  | { readonly kind: 'file' }
  | { readonly kind: 'words' }
  | { readonly kind: 'refused'; readonly reason: 'folder' | 'no-file' };

/** Whether `given` is one word: no space, tab or newline in it. */
const oneWord = (given: string) => !given.includes(' ') && !given.includes('\t') && !given.includes('\n');

/** Whether `given` reads as a path: one word that holds a `/` or ends in `.md`. */
const pathLike = (given: string) => oneWord(given) && (given.includes('/') || given.endsWith('.md'));

const ideaOfSpec = spec<(given: string, at: FoundAt) => Idea>({
  ensures: {
    fileRead: {
      description: 'Words that name a file are that file, read',
      condition: ({ input: [, at], output }) => at !== 'file' || output.kind === 'file',
    },
    folderRefused: {
      description: 'Words that name a folder are refused as a folder',
      condition: ({ input: [, at], output }) => at !== 'folder' || (output.kind === 'refused' && output.reason === 'folder'),
    },
    missingPathRefused: {
      description: 'Words that read as a path and name nothing are refused as a path to no file, never filed as the idea',
      condition: ({ input: [given, at], output }) =>
        at !== 'none' || !pathLike(given) || (output.kind === 'refused' && output.reason === 'no-file'),
    },
    wordsAreTheIdea: {
      description: 'Words that name nothing and read as no path are the idea itself',
      condition: ({ input: [given, at], output }) => at !== 'none' || pathLike(given) || output.kind === 'words',
    },
  },
});

/** `ideaOf`'s type, which src/commands/inbox/card-lines.ts takes: it then imports nothing of tsverify. */
export type IdeaOf = Implementation<typeof ideaOfSpec>;
