import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { projectRoutes } from './navigation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const privateIndex = args.indexOf('--private-root');
const check = args.includes('--check');
if (privateIndex < 0 || !args[privateIndex + 1] ||
    args.length !== (check ? 3 : 2) || args.some(arg => arg.startsWith('--') && !['--private-root', '--check'].includes(arg))) {
  throw Error('Usage: node scripts/export-navigation.mjs --private-root PRIVATE_DICTIONARY_CHECKOUT [--check]');
}
const privateRoot = path.resolve(args[privateIndex + 1]);
const store = await import(pathToFileURL(path.join(privateRoot, 'tools', 'glossary-collection.mjs')).href);
const status = await store.dailyStatus(privateRoot);
const dispositions = await store.listDispositions(privateRoot);
const latest = new Map(dispositions.map(item => [item.object_id, item]));
const current = status.dispositioned_object_ids.map(id => latest.get(id));
if (current.some(item => !item)) throw Error('Missing current private disposition');
const catalog = JSON.parse(await fs.readFile(path.join(root, 'catalog.json'), 'utf8'));
const readEntry = relative => JSON.parse(readFileSync(path.join(root, relative), 'utf8'));
const manifest = projectRoutes(current, catalog, readEntry);
const bytes = JSON.stringify(manifest, null, 2) + '\n';
const output = path.join(root, 'navigation.json');
if (check) {
  if (await fs.readFile(output, 'utf8') !== bytes) throw Error('Public navigation differs from current private dispositions or public catalog');
} else {
  await fs.writeFile(output, bytes);
}
console.log(JSON.stringify({ mode: check ? 'checked' : 'exported', navigation_routes: manifest.routes.length,
  dispositioned_objects: current.length, public_entries: catalog.entries.length }));
