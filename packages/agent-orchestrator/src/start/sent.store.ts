/**
 * The files a start hands its run's steps as a client sends them over the api: each by its name and its bytes, its text or base64, never
 * a path. Why one cannot be handed (`sentInputRefusal`), and the files written into a folder of their own for `START` to copy from as it
 * copies `--input` files (`sentInputsWritten`), that folder removed once it has (`sentInputsRemoved`).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** A file sent to hand a run's steps: its own name, and its text where its bytes are UTF-8, else its bytes in base64. */
export type SentInput = { readonly name: string; readonly text?: string; readonly base64?: string };

/** Why the first of `inputs` that cannot be handed to a run cannot, naming what to send; null where each can. Pure. */
export function sentInputRefusal(inputs: readonly SentInput[]): string | null {
  for (const { name, text, base64 } of inputs) {
    if (name !== path.basename(name) || name === '' || name === '.' || name === '..' || name.includes('\\'))
      return `an input is sent by its file's own name, and ${JSON.stringify(name)} names a folder: send the file's name alone, as nemia start --input <file> sends it.`;
    if ((text === undefined) === (base64 === undefined))
      return `the input ${name} is sent as its text or as its bytes in base64, one of the two, as nemia start --input <file> sends it.`;
  }
  return null;
}

/** `inputs` written into a folder of their own, each by its name: the folder, and the paths of the files written, in the order sent. */
export function sentInputsWritten(inputs: readonly SentInput[]): { dir: string; files: string[] } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nemia-inputs-'));
  const files = inputs.map((input) => {
    const file = path.join(dir, input.name);
    fs.writeFileSync(file, input.base64 !== undefined ? Buffer.from(input.base64, 'base64') : (input.text ?? ''));
    return file;
  });
  return { dir, files };
}

/** The folder `sentInputsWritten` wrote, removed. */
export const sentInputsRemoved = (dir: string): void => fs.rmSync(dir, { recursive: true, force: true });
