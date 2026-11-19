/**
 * The parameters a templated factory's first writable volume sets (`originParams`, typed by `contracts/origin-params.contract.ts`): each
 * boolean the template declares with `whenOrigin: <host>`, true where the volume was cloned from that host, false otherwise; nothing
 * once the factory works on a writable volume already. And the host of a git URL (`originHostOf`), which it is asked with.
 */
import type { OriginParams } from '../../../contracts/origin-params.contract.ts';

/**
 * The `--set` words the volume described by `volume` gives the parameters `declared` declares: one per boolean that follows a host, on
 * the factory's first writable volume alone.
 * @param declared The template's parameters, by name, as far as the rule reads them.
 * @param volume Whether the volume is the factory's first writable one, and the host it was cloned from, where it was.
 */
export const originParams: OriginParams = (declared, volume) =>
  volume.firstWritable
    ? Object.entries(declared).flatMap(([name, p]) =>
        p.type === 'boolean' && p.whenOrigin !== undefined ? [`${name}=${String(p.whenOrigin.toLowerCase() === volume.originHost)}`] : [],
      )
    : [];

/** An scp-style git address, `user@host:path`. */
const SCP_LIKE = /^[^/@:]+@([^/:]+):/;

/**
 * The host of the git URL `origin`, lower-cased: an `https`, `ssh` or `git` URL's, or an scp-style address's (`git@host:path`); none for
 * a file URL, a path or no origin at all.
 * @param origin The URL a volume was cloned from, where it was.
 */
export function originHostOf(origin: string | undefined): string | undefined {
  if (origin === undefined) return undefined;
  const scp = SCP_LIKE.exec(origin);
  if (scp?.[1] !== undefined) return scp[1].toLowerCase();
  try {
    const url = new URL(origin);
    return url.protocol === 'file:' || url.hostname === '' ? undefined : url.hostname.toLowerCase();
  } catch {
    return undefined;
  }
}
