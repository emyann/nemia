/**
 * A task's mounts: the folders beyond its `cwd` a session may reach, as a Pod's container is given its volume mounts, and the
 * check of their shape every harness shares. A local process sees the disk as it is, so a mount's source and its place in the
 * session are one path.
 */
import path from 'node:path';

/**
 * One folder a session may reach beyond its `cwd`: an absolute path, as `path.resolve` gives it, and whether the session may
 * only read it. `readOnly` is required: a mount left unmarked would be writable without anyone having said so.
 */
export type Mount = {
  path: string;
  readOnly: boolean;
  /**
   * Whether the task's own rules alone decide what the session may write there: the harness adds neither the allow it gives a
   * writable mount nor the deny it gives a read-only one. Absent: the harness's rule for its mode. Refused beside `readOnly: true`.
   */
  ruled?: true;
};

/** The keys a mount has: a key beside them is a misspelling or a field no harness reads. */
const MOUNT_KEYS: readonly string[] = ['path', 'readOnly', 'ruled'];

/** Why one entry of `config.mounts` is not a mount, or `undefined`. */
const mountRefusalOf = (mount: unknown) => {
  if (typeof mount !== 'object' || mount === null || Array.isArray(mount)) {
    return `\`mounts\` holds ${JSON.stringify(mount)}, which is not a mount. Give an object, like { "path": "/srv/repo", "readOnly": true }.`;
  }
  const stray = Object.keys(mount).find((key) => !MOUNT_KEYS.includes(key));
  if (stray)
    return `\`mounts\` holds a mount with \`${stray}\`, which a mount does not have. A mount has \`path\`, \`readOnly\` and \`ruled\` alone.`;
  const { path: at, readOnly, ruled } = mount as Partial<Mount>;
  if (typeof at !== 'string' || at.includes(String.fromCharCode(0)) || !path.isAbsolute(at) || path.resolve(at) !== at) {
    return `\`mounts\` holds the path ${JSON.stringify(at)}, which is not an absolute folder. Name the folder by its absolute path, as \`path.resolve\` gives it, like "/srv/repo".`;
  }
  if (typeof readOnly !== 'boolean') {
    return `\`mounts\` holds ${at} with \`readOnly: ${JSON.stringify(readOnly)}\`. Say whether the session may only read it: true, or false to let it write there.`;
  }
  if (ruled !== undefined && ruled !== true) {
    return `\`mounts\` holds ${at} with \`ruled: ${JSON.stringify(ruled)}\`. Give \`ruled: true\` to let the task's own rules alone decide its writes there, or leave it out.`;
  }
  if (ruled === true && readOnly) {
    return `\`mounts\` holds ${at} read-only and ruled by the task's own rules: a read-only mount is held by the harness's deny. Give \`readOnly: false\` with \`ruled: true\`, or leave \`ruled\` out.`;
  }
  return undefined;
};

/**
 * Why a task's `config.mounts` cannot be handed to a harness — or `undefined`. Refuses a value that is not a list, an entry that
 * is not an object of `path` and `readOnly` alone, a path that is not absolute and resolved or holds a NUL, a `readOnly` that is
 * not true or false, and a path given twice, whose two modes no harness could hold at once.
 * @param mounts The task's `config.mounts` as filed, of any shape; undefined where it is left out, which is no refusal.
 */
export const mountsRefusalOf = (mounts: unknown) => {
  if (mounts === undefined) return undefined;
  if (!Array.isArray(mounts)) {
    return `\`mounts: ${JSON.stringify(mounts)}\` is not a list of mounts. Give a list, like [{ "path": "/srv/repo", "readOnly": true }], or leave it out.`;
  }
  for (const mount of mounts) {
    const refused = mountRefusalOf(mount);
    if (refused) return refused;
  }
  const paths = (mounts as Mount[]).map((m) => m.path);
  const twice = paths.find((at, i) => paths.indexOf(at) !== i);
  return twice === undefined ? undefined : `\`mounts\` names ${twice} twice. Give each folder once, with the one mode it is mounted in.`;
};
