// Copies the latest data snapshot into the app's public dir before dev/build.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../../../data/snapshot/snapshot.json');
const destDir = path.resolve(here, '../public');
mkdirSync(destDir, { recursive: true });
if (existsSync(src)) {
  copyFileSync(src, path.join(destDir, 'snapshot.json'));
  console.log('snapshot.json copied to public/');
} else {
  console.warn(
    'No data/snapshot/snapshot.json yet — run `npm run pipeline` first. The app will show an empty-data notice.',
  );
}
