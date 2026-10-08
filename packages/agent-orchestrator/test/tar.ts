/** A tar built by hand for a test: any name, type, mode, body, checksum and magic, as no packer would write it. */

/** What a hand-built entry says: any name, type, mode, body and checksum, and a magic of its own. */
export type Entry = { name: string; type?: string; body?: string; mode?: number; prefix?: string; checksum?: number; magic?: string };

/** A ustar header of `entry`, written as no packer would refuse to. */
function rawHeader(entry: Entry): Buffer {
  const block = Buffer.alloc(512);
  const body = Buffer.from(entry.body ?? '');
  block.write(entry.name, 0, 100, 'utf8');
  block.write(`${(entry.mode ?? 0o644).toString(8).padStart(7, '0')}\0`, 100, 8, 'ascii');
  block.write('0000000\u0000', 108, 8, 'ascii');
  block.write('0000000\u0000', 116, 8, 'ascii');
  block.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
  block.write('00000000000\u0000', 136, 12, 'ascii');
  block.write(entry.type ?? '0', 156, 1, 'ascii');
  block.write(entry.magic ?? 'ustar\u000000', 257, 8, 'latin1');
  block.write(entry.prefix ?? '', 345, 155, 'utf8');
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 0x20 : block[i];
  block.write(`${(entry.checksum ?? sum).toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return block;
}

/** A tar of `entries`, each body padded to its block, ended by two zero blocks unless `cut` drops the bytes after it. */
export function rawTar(entries: Entry[], cut?: number): Buffer {
  const parts = entries.flatMap((entry) => {
    const body = Buffer.from(entry.body ?? '');
    return [rawHeader(entry), body, Buffer.alloc((512 - (body.length % 512)) % 512)];
  });
  const tar = Buffer.concat([...parts, Buffer.alloc(1024)]);
  return cut === undefined ? tar : tar.subarray(0, cut);
}
