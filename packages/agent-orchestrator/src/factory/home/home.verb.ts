/**
 * A factory's home read whole for a client that renders it (`GET /api/factories/<name>/home`): every file of its tree's `home/`, read and
 * refused as a run's start reads it (`homeFilesOf`), and the digest the run's copy of the same files is named by (`workflowFilesDigest`),
 * so a person's copy and a run's of one home carry one name. Read through the Factory door; nothing is written.
 */
import { Effect } from 'effect';
import type { FactoryHome } from 'objects';
import { fromThrow as tried } from '../../door/door.store.ts';
import { Missing } from '../../refusal/refusal.ts';
import { homeFilesOf, workflowFilesDigest } from '../../frozen/frozen.store.ts';
import { FactoryDoor } from '../door/factories.store.ts';
import { FactoryName, isDefaultFactory } from '../factory.model.ts';

/**
 * The home of the factory `name`: its files sorted by path, each its permission bits and its bytes in base64, and their digest. Refused
 * `Missing` where no factory has the name, where it has no tree (made by hand, or the default factory) and where its tree holds no
 * `home/`, each naming what to type; `Invalid` where the home holds a link or what is neither a file nor a folder, as a run's start is.
 */
export const factoryHomeOf = Effect.fn('factoryHomeOf')(function* (name: string) {
  const door = yield* FactoryDoor;
  const record = yield* door.factories.read(FactoryName.read(name));
  const tree = isDefaultFactory(record) ? undefined : record.tree;
  if (tree === undefined)
    return yield* Effect.fail(
      new Missing({
        message: `${name} has no home: it was not made from a template, and a home is a template's. Take it over by one that gives a home/ (nemia factory diff ${name} --template <folder|archive>, then nemia factory adopt), then open it again.`,
      }),
    );
  const files = yield* tried(() => homeFilesOf(tree));
  if (files === undefined)
    return yield* Effect.fail(
      new Missing({
        message: `${name} has no home: its tree (${tree}) holds no home/, which its template does not give. Upgrade it onto a version of its template that does (nemia factory upgrade ${name} --to <x.y.z>), then open it again.`,
      }),
    );
  return {
    name,
    digest: workflowFilesDigest(files),
    files: files.map((f) => ({ path: f.path, mode: f.mode, content: Buffer.from(f.bytes).toString('base64') })),
  } satisfies FactoryHome;
});
