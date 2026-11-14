/**
 * The addresses the api judges, read by the bind (`port.ts`) and the write guard (`guard.ts`) and by their contracts
 * (`contracts/bind.contract.ts`, `contracts/write-guard.contract.ts`): pure, so a contract imports them and no source imports a value of a
 * contract.
 */

/** The address the api listens on where no other is asked for: this machine's loopback. */
export const LOOPBACK = '127.0.0.1';

/** An IPv4 address in dotted decimal, each of its four numbers from 0 to 255 with no leading zero. */
const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

/** The characters an IPv6 address is written in: hex digits, colons, and the dots of an IPv4 address at its end. */
const IPV6_TEXT = /^[0-9A-Fa-f:.]+$/;

/**
 * Whether `text` is an IP address: v4 in dotted decimal, or v6 as a URL's host reads one between brackets (WHATWG's parser, global, so
 * this file reaches nothing of the machine). An IPv6 zone (`%eth0`) is none.
 */
export const isAddress = (text: string): boolean => {
  if (IPV4.test(text)) return true;
  if (!text.includes(':') || !IPV6_TEXT.test(text)) return false;
  try {
    return new URL(`http://[${text}]/`).hostname !== '';
  } catch {
    return false;
  }
};

/** The text `value` asks for, its white space left out: blank where it is unset. */
export const asked = (value: string | undefined): string => value?.trim() ?? '';

/**
 * The names a write with no token may be addressed to: this machine's loopback, on any port. Such a write is a pairing's alone, every
 * other route needing a token (`needOf`, src/caller/caller.ts), whatever address the api is bound to (`NEMIA_BIND`, port.ts).
 */
const LOOPBACK_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;

/** Whether `host` names this machine's loopback, on any port, in any case, the white space around it left out. */
export const loopback = (host: string): boolean => LOOPBACK_HOST.test(host.trim());
