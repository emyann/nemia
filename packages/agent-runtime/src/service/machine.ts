/**
 * The memory of the machine the engine runs on, as the kernel says it in `/proc/meminfo`: its total (`MemTotal`) and what it could
 * give a new process now without swapping (`MemAvailable`), each in bytes. Read once per pass by admission (`EngineOptions.machine`),
 * as kubelet reads a node's capacity; never by `decide`. It reads the host's memory, not a container's cgroup's.
 */
import fs from 'node:fs';

/** The machine's memory in bytes, as one reading gave it. */
export type MachineReading = { totalBytes: number; availableBytes: number };

/** A line of `/proc/meminfo` in kibibytes, as the kernel writes each: `MemTotal:       16318412 kB`. */
const lineOf = (text: string, name: string): number | undefined => {
  const found = new RegExp(`^${name}:\\s+(\\d+) kB$`, 'm').exec(text);
  return found?.[1] === undefined ? undefined : Number(found[1]) * 1024;
};

/**
 * The machine's total and available memory off the text of `/proc/meminfo`, or `undefined` where either line is missing: a kernel
 * older than 3.14 writes no `MemAvailable`, and a guess at it from free and cached memory is no reading.
 */
export const meminfoOf = (text: string): MachineReading | undefined => {
  const totalBytes = lineOf(text, 'MemTotal');
  const availableBytes = lineOf(text, 'MemAvailable');
  return totalBytes === undefined || availableBytes === undefined ? undefined : { totalBytes, availableBytes };
};

/**
 * The machine's memory as `/proc/meminfo` says it now, or `undefined` where the file cannot be read (not Linux) or says too little:
 * the engine then admits by its ceiling alone, as before it read the machine.
 */
export const machineMemory = (): MachineReading | undefined => {
  try {
    return meminfoOf(fs.readFileSync('/proc/meminfo', 'utf8'));
  } catch {
    return undefined;
  }
};
