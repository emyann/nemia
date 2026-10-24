/**
 * The files a spawn clears and writes beside a detached run before it launches the worker, and what the written ones say to the
 * harness (`HarnessIO`): the schema its answer must take and where to write it, the MCP config a command line names, what the spec
 * prepares, and the spawn request itself for a spec that reads it (`HarnessSpec.needsRequest`). `detachedOps`' spawn alone calls
 * this, once, before it launches the worker.
 */
import fs from 'node:fs';
import type { SpawnRequest } from '../seam.ts';
import { sessionMcp, writeMcpConfig } from '../mcp.ts';
import type { HarnessIO, HarnessSpec, RunInput } from './detached.ts';

/** Where each of a run's files goes, by what it holds: the names `detachedOps` keeps for the run. */
export type SpawnAt = {
  schema: string;
  answer: string;
  mcp: string;
  request: string;
  log: string;
  kept: string;
  stop: string;
  streams: Record<string, string>;
};

/**
 * The files for the run `r` of `spec`, written, and the `io` they give its command. What the previous attempt under the name left
 * goes first — its answer, its output and its streams, what was read of that output, its own request, and the stop asked of it,
 * which its worker would otherwise read as asked of this one and start nothing. A spec with `needsRequest` is handed its
 * servers in the request and names no config file, though its own config under the name is written or cleared all the same, so a
 * re-spawn leaves no servers behind; `sessionMcp` is read on either road, since it is what refuses a `projectMcp` name the
 * checkout does not declare, before anything runs. The request is written owner-only: it carries the task's `config`, whose `mcp`
 * may hold an `env` or a header that is a secret.
 */
export const spawnFiles = (spec: HarnessSpec, r: SpawnRequest, at: SpawnAt): HarnessIO => {
  for (const f of [at.answer, at.log, at.kept, at.stop, at.request, ...Object.values(at.streams)]) fs.rmSync(f, { force: true });
  let io: HarnessIO = {};
  if (r.closeoutSchema) {
    fs.writeFileSync(at.schema, JSON.stringify(r.closeoutSchema));
    io = { closeoutSchemaFile: at.schema, closeoutFile: at.answer };
  }
  const mcp = sessionMcp(r.cwd, r.config);
  const mcpConfigFile = writeMcpConfig(at.mcp, spec.needsRequest ? undefined : mcp);
  if (mcpConfigFile) io = { ...io, mcpConfigFile };
  io = { ...io, ...spec.prepare?.(r) };
  if (!spec.needsRequest) return io;
  fs.writeFileSync(at.request, JSON.stringify({ request: r, io }), { mode: 0o600 });
  return { ...io, requestFile: at.request };
};

/** The size of the file `p` now, and 0 where there is none: where an inbox stands as a run is spawned. */
const sizeOf = (p: string) => {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
};

/**
 * What the worker writes on the harness's stdin for the run `r` (`RunInput`): its brief as the spec's own line, and the `inbox`
 * read on from where it stands now, so a run spawned again under a name finds no words said to the one before it. Nothing for a
 * spec whose harness is given no input.
 */
export const spawnInput = (spec: HarnessSpec, r: SpawnRequest, inbox: string): RunInput | undefined =>
  spec.input && { first: spec.input.line(r.brief), inbox, from: sizeOf(inbox), closesOn: spec.input.closesOn };
