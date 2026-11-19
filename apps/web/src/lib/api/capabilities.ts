/**
 * What the repository offers a step, and what each step gets (`GET /api/capabilities`), read through the objects' client and decoded with
 * `objects`' `CapabilitiesWithSteps`, every list with its shape.
 */
import { queryOptions } from '@tanstack/react-query';
import { CapabilitiesWithSteps, type CapabilityDescribed, type CapabilityServer, type StepReach } from 'objects';
import { call, read } from './objects.ts';

export type { StepReach };

/** What a Claude Code step with no `tools:` has, as measured. */
export type MeasuredTools = CapabilitiesWithSteps['measured'];

/** The Bash commands Claude Code runs without a rule, unless a rule names them. */
export type ReadOnlyCommands = CapabilitiesWithSteps['readOnly'];

/** A skill or an agent, and the file it was read from. */
export type Described = CapabilityDescribed;

/** A server of the repository's `.mcp.json`, and what it answered: named apart from the kind of objects. */
export type McpServer = CapabilityServer;

/**
 * What the repository the page reads offers a step, and what each step gets. Where it reads none, `repo` is left out, every list is empty,
 * and `unread` says why and what to do.
 */
export type Capabilities = CapabilitiesWithSteps;

/** Where the page is read: the factory its path names and one of its repositories (`?repo=`), each where it names one. */
type CapabilitiesPlace = { factory?: string; repo?: string };

/** The query `place` sends: its factory and its repository where it names them, and no other key a page's search carries. */
const queryOf = ({ factory, repo }: CapabilitiesPlace) => ({ ...(factory && { factory }), ...(repo && { repo }) });

/**
 * What the repository of `place` offers a step, read in the factory it names, else in the one the store's factories leave. Not polled: it
 * changes when a person edits the checkout, and the api asks each server for its tools once while it runs. Read again on each visit.
 * @param place The factory and repository the page reads; either left out where the address names none.
 */
export const capabilitiesQuery = (place: CapabilitiesPlace) =>
  queryOptions({
    queryKey: ['capabilities', place.factory ?? null, place.repo ?? null],
    queryFn: () => call((c) => c.server.capabilities({ query: queryOf(place) }), read(CapabilitiesWithSteps)),
  });
