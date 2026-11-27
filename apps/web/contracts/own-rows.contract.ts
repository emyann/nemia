/**
 * The steps at work that are one agent's (`ownRows`, src/lib/ownRows.ts): each row that comes out is the agent's and one that went in. The
 * activity contract (`agent-activity.contract.ts`) reads it for its count, which is then the same count wherever it is asked.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { AtWorkRow } from './agent-activity.contract.ts';

const ownRowsSpec = spec<(rows: readonly AtWorkRow[], agent: string) => readonly AtWorkRow[]>({
  ensures: {
    allTheirs: {
      description: "Every row that comes out is the agent's",
      condition: ({ input: [, agent], output }) => output.every((row) => row.agent === agent),
    },
    keepsEach: {
      description: 'Every row that comes out is one that went in',
      condition: ({ input: [rows], output }) => output.every((row) => rows.some((r) => r.run === row.run && r.step === row.step)),
    },
    keepsEveryOne: {
      description: "Every row of the agent's that goes in comes out",
      condition: ({ input: [rows, agent], output }) =>
        rows.every((r) => r.agent !== agent || output.some((o) => o.run === r.run && o.step === r.step)),
    },
  },
});

/** `ownRows`'s type, which src/lib/ownRows.ts takes. */
export type OwnRows = Implementation<typeof ownRowsSpec>;
