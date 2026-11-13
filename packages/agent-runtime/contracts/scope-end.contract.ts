/**
 * Which cgroup a finished session's runner may end whole (agent-runtime, src/harness/cgroup.ts, `scopeToEnd`): the transient scope of
 * systemd's user manager the session's process tree was run in, as its run file recorded it, read again where the end is written. A
 * session's scope is its Pod: every process its commands started sits in it, wherever they were started from, and is ended with it.
 * Nothing else is ever ended by it: no folder outside the cgroup file system, nothing that is no scope, and never the cgroup the
 * runtime itself runs in, nor one it runs inside — a daemon run with no scope of its own, or a holder beside its session, would end
 * itself. Where the runtime cannot read its own cgroup it cannot tell, and ends nothing. The laws speak of the folder, never of how it is
 * read.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** Where cgroup v2 is mounted: every cgroup's folder is under it. */
const CGROUP_ROOT = '/sys/fs/cgroup/';

/** Whether `folder` names a cgroup by a plain path under the mount: no step climbs out of it. */
const underTheMount = (folder: string): boolean => folder.startsWith(CGROUP_ROOT) && !folder.includes('/..');

/** Whether `folder` is a transient scope's: systemd names a scope's unit, and so its cgroup, `<name>.scope`. */
const aScope = (folder: string): boolean => folder.endsWith('.scope');

/** Whether ending `folder` would end `own`: the same cgroup, or one of its ancestors. */
const holds = (folder: string, own: string): boolean => own === folder || own.startsWith(`${folder}/`);

const scopeToEndSpec = spec<(recorded: string | undefined, own: string | undefined) => boolean>({
  ensures: {
    nothingRecordedNothingEnded: {
      description: 'A session whose run file recorded no scope has no scope ended for it',
      condition: ({ input: [recorded], output }) => (recorded === undefined ? output === false : true),
    },
    ownUnreadNothingEnded: {
      description: 'Where the runtime cannot read its own cgroup, nothing is ended: it cannot tell whether it sits inside the scope',
      condition: ({ input: [, own], output }) => (own === undefined ? output === false : true),
    },
    onlyUnderTheMount: {
      description: 'Only a folder under the cgroup mount, with no step climbing out of it, is ever ended',
      condition: ({ input: [recorded], output }) => (output ? recorded !== undefined && underTheMount(recorded) : true),
    },
    onlyAScope: {
      description: 'Only a transient scope is ever ended, never a slice or a service',
      condition: ({ input: [recorded], output }) => (output ? recorded !== undefined && aScope(recorded) : true),
    },
    neverItself: {
      description: 'The cgroup the runtime runs in, or one it runs inside, is never ended',
      condition: ({ input: [recorded, own], output }) =>
        recorded !== undefined && own !== undefined && holds(recorded, own) ? output === false : true,
    },
    aSessionsScopeIsEnded: {
      description: "A recorded scope under the mount, that the runtime does not run in, is ended: what a session left never runs on",
      condition: ({ input: [recorded, own], output }) =>
        recorded !== undefined && own !== undefined && underTheMount(recorded) && aScope(recorded) && !holds(recorded, own)
          ? output === true
          : true,
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type ScopeToEnd = Implementation<typeof scopeToEndSpec>;
