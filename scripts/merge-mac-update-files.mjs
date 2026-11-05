#!/usr/bin/env node
// Each Mac architecture is built on its own machine and writes its own latest-mac.yml, but a
// release can only hold one. Auto-update picks its download from the file list by architecture,
// so the merged file has to list both.
//
//   node scripts/merge-mac-update-files.mjs <output> <latest-mac.yml> <latest-mac.yml> ...
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

export function mergeUpdateFiles(contents) {
  const [first, ...rest] = contents.map((content) => yaml.load(content));
  for (const other of rest) {
    if (other.version !== first.version) {
      throw new Error(`Mac builds have different versions: ${first.version} and ${other.version}`);
    }
  }
  return yaml.dump({ ...first, files: [first, ...rest].flatMap((manifest) => manifest.files) });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [output, ...inputs] = process.argv.slice(2);
  fs.writeFileSync(output, mergeUpdateFiles(inputs.map((file) => fs.readFileSync(file, 'utf-8'))));
}
