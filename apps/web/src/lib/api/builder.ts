/**
 * The builder's form (`GET /api/workflows/keys`), read through the objects' client as `objects` says it (`KeyForm`, `KeyField`). Its
 * writes of a folder of yours answer the folder as the list reads it, in workflows.ts.
 */
import { queryOptions } from '@tanstack/react-query';
import type { KeyForm as KeyFormAnswer } from 'objects';
import { workflows } from './objects.ts';
import { decoded } from './read.ts';
import { StepSpecPartSchema, type WorkflowStepSpec } from './library.ts';

export type { KeyField } from 'objects';

/**
 * Every key a step may set, as `objects` says it, with what each agent of yours gives a step (`agents`) read as the board reads a step's
 * keys (`WorkflowStepSpec`, `library.ts`): `objects` carries them as a step's file writes them, any key beside its own.
 */
export type KeyForm = Omit<KeyFormAnswer, 'agents'> & { agents: Record<string, Partial<WorkflowStepSpec>> };

/** `form` with each agent's keys read as a step's. */
const keyFormOf = (form: KeyFormAnswer): KeyForm => ({
  ...form,
  agents: Object.fromEntries(
    Object.entries(form.agents).map(([name, keys]) => [name, decoded('GET /api/workflows/keys', StepSpecPartSchema, keys)]),
  ),
});

/** What a step's form is drawn from. It changes with the package, so once a visit. */
export const keyFormQuery = queryOptions({
  queryKey: ['step-keys'],
  queryFn: () => workflows.keys().then(keyFormOf),
  staleTime: Infinity,
});
