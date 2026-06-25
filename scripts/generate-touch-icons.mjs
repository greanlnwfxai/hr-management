import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'apps', 'mobile', 'assets', 'icon.png');
const OUT = join(__dirname, '..', 'apps', 'mobile', 'public');

const SIZES = [180, 167, 152, 120];

for (const size of SIZES) {
  const dest = join(OUT, `apple-touch-icon-${size}x${size}.png`);
  await sharp(SRC).resize(size, size).png().toFile(dest);
  console.log(`✓ apple-touch-icon-${size}x${size}.png`);
}

console.log('Done.');
