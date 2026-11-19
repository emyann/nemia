/**
 * The name a welcome form files a factory under, and its one write (`useFactoryWrite`): the name typed, whether the write is out, the
 * api's refusal in its own words, and the press that sends it. The board checks no name but that it is not blank: the api decides.
 */
import { useState } from 'react';

/**
 * A form's name and its write: `make` sends `write` of the trimmed name once, and tells `onMade` the name once the api answered, or keeps
 * the refusal's words, the press offered again.
 * @param write Files the factory by its name, rejecting with the api's refusal.
 * @param onMade Told the factory's name once the api answered the write.
 */
export function useFactoryWrite(write: (name: string) => Promise<unknown>, onMade: (name: string) => void) {
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [refused, setRefused] = useState<string | undefined>(undefined);
  const trimmed = name.trim();
  const ready = trimmed !== '' && !pending;
  const make = () => {
    if (!ready) return;
    setPending(true);
    setRefused(undefined);
    void write(trimmed).then(
      () => {
        setPending(false);
        onMade(trimmed);
      },
      (error: unknown) => {
        setPending(false);
        setRefused(error instanceof Error ? error.message : String(error));
      },
    );
  };
  return { name, setName, pending, refused, ready, make };
}
