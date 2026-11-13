/**
 * A factory moved from one store to another: what the source's api answers of it (`FactoryExport`, `GET /api/factories/<name>/export`),
 * what the target's api is sent to file it (`FactoryImportWrite`, `POST /api/factories/<name>/import`) and what that answers
 * (`FactoryImported`). Runs never travel. The factory's file travels as its text, its folder packed as the store packs an archive (base64)
 * with what belongs to the source's store left out (`stays`), its template as a request gives one (`TemplateGiven`), and its cards in
 * play that no run has started, each by its name and its text; a card that has a run stays, said with why (`left`). Plain Schemas of JSON.
 */
import { Schema } from 'effect';
import { TemplateGiven } from './factory.ts';

/** A card that follows its factory: its name on the source and its file's text as the source holds it. */
export const FactoryExportCard = Schema.Struct({ name: Schema.String, source: Schema.String });
export type FactoryExportCard = typeof FactoryExportCard.Type;

/** A card of the factory that stays on the source, and why: a run started from it, which does not move. */
export const FactoryExportLeft = Schema.Struct({ name: Schema.String, why: Schema.String });
export type FactoryExportLeft = typeof FactoryExportLeft.Type;

/**
 * One factory as the source's store holds it, for another store to file (`GET /api/factories/<name>/export?cards=follow|stay`): its
 * `name`, its `file`'s text, its folder packed (`folder.archive`, base64) but for the folders named in `stays`, its template as it
 * travels (none for a hand-made factory), its instruction's words where they are kept at a path outside its repositories, the cards that
 * follow it and those left behind. Nothing of the source is written by it.
 */
export const FactoryExport = Schema.Struct({
  name: Schema.String,
  file: Schema.String,
  folder: Schema.Struct({ archive: Schema.String }),
  template: Schema.optionalKey(TemplateGiven),
  instruction: Schema.optionalKey(Schema.Struct({ path: Schema.String, words: Schema.String })),
  cards: Schema.Array(FactoryExportCard),
  left: Schema.Array(FactoryExportLeft),
  stays: Schema.Array(Schema.String),
});
export type FactoryExport = typeof FactoryExport.Type;

/** Whether a factory's cards follow it to another store (`follow`, the default) or stay on the source (`stay`). */
export const MOVE_CARDS = ['follow', 'stay'] as const;
export type MoveCards = (typeof MOVE_CARDS)[number];

/**
 * A factory filed on this store from another's export (`POST /api/factories/<name>/import`): the `export` as the source answered it, the
 * value given for each repository by its path on the source (`repos`: a git URL to clone, or a folder of this machine by its whole path),
 * the path given for each volume by its name, or by its path on the source where it has no name (`volumes`), and `from`, the store it
 * came from, as the moved cards' line names it. All of it is decided before anything is written, and nothing is left of a filing that
 * fails.
 */
export const FactoryImportWrite = Schema.Struct({
  export: FactoryExport,
  repos: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  volumes: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  from: Schema.String,
});
export type FactoryImportWrite = typeof FactoryImportWrite.Type;

/** A volume as the target mounts it: its name (its path on the source where it has none) and its path on this machine. */
export const FactoryImportedVolume = Schema.Struct({ name: Schema.String, path: Schema.String });
export type FactoryImportedVolume = typeof FactoryImportedVolume.Type;

/** A card filed on the target: its name here, and the name it had on the source. */
export const FactoryImportedCard = Schema.Struct({ name: Schema.String, was: Schema.String });
export type FactoryImportedCard = typeof FactoryImportedCard.Type;

/**
 * What an import filed: the factory, its file's path, its repositories on this machine, the URLs cloned for it, its volumes, its cards
 * with the name each had, and its places a harness does not trust: every one, since trusting them is the person's
 * (`nemia factory trust <name>`).
 */
export const FactoryImported = Schema.Struct({
  name: Schema.String,
  file: Schema.String,
  repos: Schema.Array(Schema.String),
  cloned: Schema.Array(Schema.String),
  volumes: Schema.Array(FactoryImportedVolume),
  cards: Schema.Array(FactoryImportedCard),
  untrusted: Schema.Array(Schema.String),
});
export type FactoryImported = typeof FactoryImported.Type;
