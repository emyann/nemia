/**
 * The contrast table of a folder of the e2e's pictures:
 *
 *     node test/e2e/contrast-report.ts <dir>
 *
 * Reads every `<picture>.contrast.json` a run with `--photos --contrast` wrote in `<dir>`, and writes there `contrast.md`, the table
 * (`tableOf`, contrast.ts), and `look.html`, each page's light picture beside its dark one. Says the totals, and exits 1 when a pair is
 * under the bar, 2 when the folder holds no measure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { failing, lookOf, tableOf, type Measured, type Sheet } from './contrast.ts';

const SUFFIX = '.contrast.json';
const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.error('contrast: name the folder of pictures: node test/e2e/contrast-report.ts <dir>');
  process.exit(2);
}
const names = fs.readdirSync(dir).sort();
const sheets: Sheet[] = names
  .filter((name) => name.endsWith(SUFFIX))
  .map((name) => ({ picture: name.slice(0, -SUFFIX.length), ...(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as Measured) }));
if (!sheets.length) {
  console.error(`contrast: ${dir} holds no measure: run npm run e2e -- --photos --contrast with WF_ARTIFACTS set to it`);
  process.exit(2);
}
fs.writeFileSync(path.join(dir, 'contrast.md'), tableOf(sheets));
fs.writeFileSync(path.join(dir, 'look.html'), lookOf(names.filter((name) => /-(?:light|dark)\.png$/.test(name))));
const failures = failing(sheets);
console.log(tableOf(sheets).split('\n')[2]);
for (const { pair, scheme, pictures } of failures.slice(0, 40)) console.log(`  ${scheme} ${pictures[0]}: “${pair.text}” [${pair.classes}]`);
console.log(`contrast: ${path.join(dir, 'contrast.md')}`);
process.exit(failures.length ? 1 : 0);
