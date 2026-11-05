/**
 * The objects' OpenAPI document on stdout (`openapiDocument`, the one its route serves), for a person or a tool that reads it from a
 * file rather than from a daemon. Takes no argument.
 */
import { openapiDocument } from './openapi.ts';

if (process.argv.length > 2) {
  process.stderr.write(
    `print.ts takes no argument: type \`node apps/api/src/openapi/print.ts > <file>\` to write the document to a file.\n`,
  );
  process.exit(2);
}
process.stdout.write(`${JSON.stringify(openapiDocument(), null, 2)}\n`);
