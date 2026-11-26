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
export const FactoryExportCard = Schema.Struct({
  name: Schema.String.annotate({ description: 'Its name on the source.' }),
  source: Schema.String.annotate({ description: "Its file's text as the source holds it." }),
});
export type FactoryExportCard = typeof FactoryExportCard.Type;

/** A card of the factory that stays on the source, and why: a run started from it, which does not move. */
export const FactoryExportLeft = Schema.Struct({
  name: Schema.String.annotate({ description: "The card's name." }),
  why: Schema.String.annotate({ description: 'Why it stays: a run started from it, which does not move.' }),
});
export type FactoryExportLeft = typeof FactoryExportLeft.Type;

/**
 * One factory as the source's store holds it, for another store to file (`GET /api/factories/<name>/export?cards=follow|stay`): its
 * `name`, its `file`'s text, its folder packed (`folder.archive`, base64) but for the folders named in `stays`, its template as it
 * travels (none for a hand-made factory), its instruction's words where they are kept at a path outside its repositories, the cards that
 * follow it and those left behind. Nothing of the source is written by it.
 */
export const FactoryExport = Schema.Struct({
  name: Schema.String.annotate({ description: 'The factory.' }),
  file: Schema.String.annotate({ description: "The factory's file, as text." }),
  folder: Schema.Struct({
    archive: Schema.String.annotate({ description: "The factory's folder packed as the store packs an archive, in base64." }),
  }).annotate({ description: "The factory's folder, packed but for the folders named in stays." }),
  template: Schema.optionalKey(
    TemplateGiven.annotate({ description: 'The template it was made from, as a request gives one; absent for a hand-made factory.' }),
  ),
  instruction: Schema.optionalKey(
    Schema.Struct({
      path: Schema.String.annotate({ description: 'The path the instruction is kept at, outside its repositories.' }),
      words: Schema.String.annotate({ description: "The instruction's words." }),
    }).annotate({ description: "The instruction's words where they are kept at a path outside its repositories; absent otherwise." }),
  ),
  cards: Schema.Array(FactoryExportCard).annotate({ description: 'The cards in play that no run has started, which follow it.' }),
  left: Schema.Array(FactoryExportLeft).annotate({ description: 'The cards that stay on the source, each with why.' }),
  stays: Schema.Array(Schema.String).annotate({
    description: "The folders of the factory left out of the packed folder, which belong to the source's store.",
  }),
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
  export: FactoryExport.annotate({ description: 'The export as the source answered it.' }),
  repos: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.String).annotate({
      description:
        'The value for each repository by its path on the source: a git URL to clone, or a folder of this machine by its whole path.',
    }),
  ),
  volumes: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.String).annotate({
      description: 'The path for each volume by its name, or by its path on the source where it has no name.',
    }),
  ),
  from: Schema.String.annotate({ description: "The store the factory came from, as the moved cards' line names it." }),
});
export type FactoryImportWrite = typeof FactoryImportWrite.Type;

/** A volume as the target mounts it: its name (its path on the source where it has none) and its path on this machine. */
export const FactoryImportedVolume = Schema.Struct({
  name: Schema.String.annotate({ description: 'Its name, or its path on the source where it has none.' }),
  path: Schema.String.annotate({ description: 'Its path on this machine.' }),
});
export type FactoryImportedVolume = typeof FactoryImportedVolume.Type;

/** A card filed on the target: its name here, and the name it had on the source. */
export const FactoryImportedCard = Schema.Struct({
  name: Schema.String.annotate({ description: 'Its name here.' }),
  was: Schema.String.annotate({ description: 'The name it had on the source.' }),
});
export type FactoryImportedCard = typeof FactoryImportedCard.Type;

/**
 * What an import filed: the factory, where it is kept (its record's key), its repositories on this machine, the URLs cloned for it, its
 * volumes, its cards with the name each had, and its places a harness does not trust: every one, since trusting them is the person's
 * (`nemia factory trust <name>`).
 */
export const FactoryImported = Schema.Struct({
  name: Schema.String.annotate({ description: 'The factory filed.' }),
  file: Schema.String.annotate({ description: "Where it is kept: its record's key." }),
  repos: Schema.Array(Schema.String).annotate({ description: 'Its repositories on this machine.' }),
  cloned: Schema.Array(Schema.String).annotate({ description: 'The URLs cloned for it.' }),
  volumes: Schema.Array(FactoryImportedVolume).annotate({ description: 'Its volumes.' }),
  cards: Schema.Array(FactoryImportedCard).annotate({ description: 'Its cards, each with the name it had.' }),
  untrusted: Schema.Array(Schema.String).annotate({
    description: "Its places a harness does not trust: every one, since trusting them is the person's.",
  }),
});
export type FactoryImported = typeof FactoryImported.Type;
