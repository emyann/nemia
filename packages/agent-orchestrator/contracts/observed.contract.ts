/**
 * Whether the daemon writes a record of what it observed (agent-orchestrator, src/observed/observed.ts, `recordDue`): a record the store
 * keeps of a world it does not hold — a definition's index record (`/registry/definitions/<factory>/<kind>/<name>`, the path and digest
 * of a file that stays a file) and a run's observed status (`/registry/runstatus/<id>`, the status its pass judged, the times measured to
 * the read left out) — is written only when what is observed now differs from what the record holds, so its revision moves exactly when
 * the world it stands for does, and a sweep that sees nothing new writes nothing. The value compared is the record's text, as the
 * keyspace holds it, and the text of what was observed, written the one way (a JSON of sorted keys); none where nothing is held, or
 * nothing is observed (the file is gone, the run forgotten). Pure; asked inside the transaction that read the record.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { WriteVerb } from './keyspace.contract.ts';

/** What the daemon does with a record of what it observed: one write of the keyspace's (`WriteVerb`), or nothing. */
export type RecordDue = { readonly write: WriteVerb } | { readonly keep: true };

/** Whether the decision is the write `verb`. */
const writes = (due: RecordDue, verb: WriteVerb) => 'write' in due && due.write === verb;

const recordDueSpec = spec<(held: string | null, now: string | null) => RecordDue>({
  ensures: {
    keptExactlyWhenUnchanged: {
      description: 'Nothing is written exactly when what is observed is what the record holds, none and none included',
      condition: ({ input: [held, now], output }) => 'keep' in output === (held === now),
    },
    createdWhenFirstObserved: {
      description: 'What is observed where no record is held is created',
      condition: ({ input: [held, now], output }) => held !== null || now === null || writes(output, 'create'),
    },
    updatedWhenItMoved: {
      description: 'A record held whose world is observed otherwise is updated to it',
      condition: ({ input: [held, now], output }) => held === null || now === null || held === now || writes(output, 'update'),
    },
    deletedWhenNoLongerObserved: {
      description: 'A record held whose world is gone is deleted',
      condition: ({ input: [held, now], output }) => held === null || now !== null || writes(output, 'delete'),
    },
  },
});

/** `recordDue`'s type, which `src/observed/observed.ts` takes: asked by the definition index's sweep and by the informer's pass. */
export type RecordDueOf = Implementation<typeof recordDueSpec>;
