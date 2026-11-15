/**
 * The paths and queries the groups of the `Api` share (`api.ts`): each key of a path or a query says what it is, so that the document the
 * api serves describes every parameter of every endpoint.
 */
import { Schema } from 'effect';
import { listQuery } from './api-errors.ts';

/** A step of a workflow, by its name. */
export const stepName = Schema.String.annotate({ description: 'The name of the step in the workflow.' });

/** A card, or any object a namespace holds, by its namespace and its name. */
export const cardParams = {
  namespace: Schema.String.annotate({
    description: 'The namespace the object is in: the name of its factory, default for one that names none.',
  }),
  name: Schema.String.annotate({ description: "The object's name, unique in its namespace for its kind." }),
};

/** A card, by its name alone, in whichever namespace holds it. */
export const cardNameParams = { name: Schema.String.annotate({ description: "The card's name, whichever namespace holds it." }) };

/** A namespace, for a list in it. */
export const namespaceParams = {
  namespace: Schema.String.annotate({
    description: 'The namespace the list is of: the name of a factory, default for one that names none.',
  }),
};

/** A factory, by its name. */
export const factoryParams = { name: Schema.String.annotate({ description: "The factory's name." }) };
export const factoryWorkflowParams = {
  ...factoryParams,
  workflow: Schema.String.annotate({ description: 'The name of the workflow, as the factory attaches it.' }),
};
export const factorySettingParams = {
  ...factoryParams,
  setting: Schema.String.annotate({ description: 'The name of the harness setting.' }),
};

/** The path of a factory's write that a command of the factory's own spells `<factory>`: its name, under that key. */
export const factoryOwnParams = { factory: Schema.String.annotate({ description: "The factory's name." }) };

/**
 * The query of a list of cards: a list's (`listQuery`), and `fieldSelector`, the cards by whether they are still in play, in Kubernetes'
 * spelling: `status.inPlay=true` (or `==true`, `!=false`) the cards not started or whose run has not ended, `status.inPlay=false` those
 * whose run ended; an empty one, or none, every card. Any other is refused `Invalid`, naming the forms it takes.
 */
export const cardListQuery = {
  ...listQuery,
  fieldSelector: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "A fieldSelector in Kubernetes' spelling that keeps the cards still in play (status.inPlay=true) or those whose run ended (status.inPlay=false); empty or absent, every card.",
    }),
  ),
};

/**
 * The query of a definition's read: `origin`, the one origin asked for (`DEFINITION_ORIGINS`), whose definitions are served shadowed or
 * not, each saying what shadows it; kept as the text it was sent as, so a wrong word is refused in the package's words, a 422.
 */
export const originQuery = {
  origin: Schema.optionalKey(
    Schema.String.annotate({
      description:
        'The one origin asked for, whose definitions are served shadowed or not, each saying what shadows it; absent, every origin.',
    }),
  ),
};

/**
 * The query of an agent's custom instructions: the repository whose agents the name is looked for in, one a factory works on; none for
 * yours and the builtins alone.
 */
export const instructionsQuery = {
  repo: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "The path on the api's machine of a repository a factory works on, whose agents the name is looked for in; absent, yours and the builtins alone.",
    }),
  ),
};

/** The query of a removal: the `resourceVersion` it was read at, refused where the files now hold another. */
export const removeQuery = {
  resourceVersion: Schema.optionalKey(
    Schema.String.annotate({
      description: 'The resourceVersion the object was read at; the removal is refused where the files now hold another.',
    }),
  ),
};

/**
 * The repository a definition is read or judged on beside yours (`?repo=`), a path on the api's machine: one a factory works on, or a
 * folder under one, read as that repository; none where none is named, yours and the builtins alone.
 */
export const repoQuery = {
  repo: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "The path on the api's machine of a repository a factory works on, or a folder under one, read as that repository; absent, yours and the builtins alone.",
    }),
  ),
};

/**
 * The query of a workflow's draft read (`POST /api/workflows/read`): the factory it is read for (`?factory=`), whose hires fill its steps
 * as a run of it there would read them, and the repository (`?repo=`) among the factory's; none for yours and the builtins alone.
 */
export const draftReadQuery = {
  factory: Schema.optionalKey(
    Schema.String.annotate({
      description:
        'The name of the factory the workflow is read for, whose hires fill its steps as a run of it there would read them; absent, yours and the builtins alone.',
    }),
  ),
  ...repoQuery,
};

/** A template, by its name, and one of its documents, by the template's name and the document's. */
export const templateParams = { name: Schema.String.annotate({ description: "The template's name." }) };
export const documentParams = {
  ...templateParams,
  doc: Schema.String.annotate({ description: "The name of the document in the template, as the template's list of that kind names it." }),
};

/** A subscription, by its name. */
export const subscriptionParams = { name: Schema.String.annotate({ description: "The subscription's name." }) };

/** An event, by its name: the byte of the feed its line starts at. */
export const eventNameParams = {
  name: Schema.String.annotate({ description: "The event's name, the byte of the feed its line starts at." }),
};
