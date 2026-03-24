import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const svgPath = path.join(root, 'public', 'icons', 'icon.svg');
const svg = readFileSync(svgPath);

for (const size of [16, 48, 128]) {
  const out = path.join(root, 'public', 'icons', `icon-${size}.png`);
  await sharp(svg).resize(size, size).png().toFile(out);
  console.log('wrote', path.relative(root, out));
}
