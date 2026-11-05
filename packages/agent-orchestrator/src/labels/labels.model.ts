/**
 * A person's labels at the door, as Schemas: the map (`Labels`), an edit of it as the api is sent one (`LabelEdit`, the body of
 * `POST /api/runs/:runId/labels` and `POST /api/inbox/:name/labels`), and what such an edit answers (`Labelled`). They are `objects`'
 * (`packages/objects/src/run.ts`), re-exported here by name for the package's callers. Its rules are `labels.ts`'s.
 */
export { LabelEdit, Labelled, Labels } from 'objects';
