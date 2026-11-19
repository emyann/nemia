/**
 * A factory's home as the api serves it to a client that renders it (`GET /api/factories/<name>/home`): every file of the home its tree
 * holds, by its path, its permission bits and its bytes, and the digest a run's copy of the same home is named by. A client writes the
 * files into a folder of its own named by that digest, read-only, as a run freezes its copy. Plain Schemas of JSON.
 */
import { Schema } from 'effect';
import { describedNumber } from './meta.ts';

/** One file of a factory's home: its path from the home with `/` between parts, its permission bits, its bytes in base64. */
export const FactoryHomeFile = Schema.Struct({
  path: Schema.String.annotate({ description: "Its path from the home's folder, with / between parts." }),
  mode: describedNumber('Its permission bits, as the tree holds them; a copy clears the write ones.'),
  content: Schema.String.annotate({ description: 'Its bytes, in base64.' }),
});
export type FactoryHomeFile = typeof FactoryHomeFile.Type;

/** The home of the factory `name`: its files sorted by path, and the digest a run's copy of them is named by. */
export const FactoryHome = Schema.Struct({
  name: Schema.String.annotate({ description: 'The factory.' }),
  digest: Schema.String.annotate({
    description: "The hex of the home's content, its paths, modes and bytes: the name a run's copy of the same home takes.",
  }),
  files: Schema.Array(FactoryHomeFile).annotate({ description: "Every file of the home, at any depth, sorted by path." }),
});
export type FactoryHome = typeof FactoryHome.Type;
