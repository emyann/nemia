/**
 * The Program: a long-lived command a template declares (`programs/<name>/program.yaml`), which the daemon keeps running for each
 * factory made from it. Its `spec` is what the document says: the line it runs and the conditions it writes. A template's programs are
 * served as `Program` objects, in no namespace, beside its workflows, agents and skills. Plain Schemas of JSON.
 */
import { Schema } from 'effect';
import { API_VERSION, ObjectMeta, listOf } from './meta.ts';
import { PROGRAM_PHASES } from './words.ts';

/** What a program's document says. */
const ProgramSpec = Schema.Struct({
  run: Schema.String.annotate({
    description: "The command line the daemon runs with the shell, in the factory's tree, for as long as the factory lives.",
  }),
  writes: Schema.Array(Schema.String).annotate({
    description: 'The conditions the program writes, by name, each one a check of a step may wait on (`condition:`).',
  }),
}).annotate({ description: 'The program as its document says it: the line it runs and the conditions it writes.' });

/** Where a factory's program runs now: its phase, how many times the runtime started it again, and since when the phase has held. */
const ProgramStatus = Schema.Struct({
  phase: Schema.Literals(PROGRAM_PHASES).annotate({
    description:
      'Pending where its task is not filed yet, Running where its process is up or waits out its back-off, Down where the runtime settled it.',
  }),
  restarts: Schema.Number.annotate({ description: 'How many times the runtime started the program again after its process ended.' }),
  since: Schema.optionalKey(
    Schema.String.annotate({ description: 'When the program entered its phase, as an ISO timestamp; absent while it is Pending.' }),
  ),
  message: Schema.optionalKey(
    Schema.String.annotate({ description: 'What a person types where it is Down, so it runs again; absent where it runs.' }),
  ),
}).annotate({ description: 'Where a factory’s program runs now.' });

/** A program of a template, as an object; a factory's carries its `status`, a template's declaration none. */
export const Program = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION).annotate({ description: 'The version the object is served under, nemia/v1.' }),
  kind: Schema.Literal('Program').annotate({
    description: 'What the object is: a Program, a long-lived command a template keeps running.',
  }),
  metadata: ObjectMeta,
  spec: ProgramSpec,
  status: Schema.optionalKey(ProgramStatus),
}).annotate({ identifier: 'Program' });
export type Program = typeof Program.Type;

/** A page of a template's programs. */
export const ProgramList = listOf('Program', Program).annotate({ identifier: 'ProgramList' });
export type ProgramList = typeof ProgramList.Type;
