/**
 * The run object's OpenAPI document on stdout (`openapiDocument`, the one its route serves), for the board's generator of its run mirror
 * (`apps/web/test/mirror.ts`), which reaches the api through a process and never an import. Takes no argument.
 */
import { openapiDocument } from './openapi.ts';

if (process.argv.length > 2) {
  process.stderr.write(
    `print.ts takes no argument: type \`node apps/api/src/openapi/print.ts > <file>\` to write the document to a file.\n`,
  );
  process.exit(2);
}
process.stdout.write(`${JSON.stringify(openapiDocument(), null, 2)}\n`);
